import {localHoles} from '../core/local-holes.js';
import {fusionRoot,fusionAtPoint} from '../core/bar-fusion.js';
/**
 * blocks / input
 *
 * 指標互動層：節點 / 自由連桿 / 機架把手的拖曳（含吸附合併、圓規旋轉），
 * 以及畫布層級的手勢——雙指 pinch 縮放＋平移、滾輪縮放、手機接點優先命中（capture 階段）、
 * 畫桿 / 三點桿模式的起點處理與右鍵確定。
 *
 * 共用編輯狀態直接 import state.js 的 S；座標 / 縮放取自 view.js；
 * 畫圖模式的收尾與命中查詢呼叫 tools.js；角色面板呼叫 panels.js。
 * 其餘 app 控制器動作與查詢 helper 用 init() 注入（見下方 deps），init() 同時掛上
 * svg 的指標 / 手勢事件監聽（取代原本在 app.js 檔尾的那批 addEventListener）。
 */

import { S } from './state.js';
import {rotateLooseBarEnd,looseBarRotation,pointRotation,isFreeBody,holeJoined} from './model.js';
import {dragIntent} from './drag-intent.js';
import {confirmMountingChange,mountingWork} from './mounting-review-ui.js';
import * as View from './view.js';
import * as Tools from './tools.js';
import * as Panels from './panels.js';
import { collectPickCandidates, openOverlapPicker } from './overlap-picker.js';

const NODE_TAP_PX = 24;   // 手機點接點的命中半徑（畫面 px，縮放下維持一致手感）

// ---- 縮放 / 平移手勢的指標帳本（畫布層級狀態）----
const activePointers = new Map();   // pointerId -> { x, y }（client 座標）
let backgroundPan = null;
let pinchState = null;              // { dist, cx, cy }
let pinchActive = false;            // 直到全部手指離開，才恢復單指編輯
let pendingNodeDrag = null;         // 點擊先選取；超過門檻後才真正開始拖曳
let linkPointerStart = null;        // 桌機畫桿可按住拖放，也保留點兩下
let pendingOverlap = null;
let pendingMobileEdit = false;      // 放開接點後再展開面板，避免拖曳途中畫布高度改變
let blockedDrag = null, saidDrag = null;

// ---- 注入的外部依賴（由 app 在啟動時提供）----
let svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle,
    worldFromEvent, pointCoords, displayCoords, mobilePrompt,
    snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
    movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
    isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
    handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround,
    selectOverlapComponent = () => {},
    nodeDownEntry = null,               // 手機接點優先命中的入口（app 注入模組守門版；未注入用 onNodeDown）
    openMobileEditPanel = () => {},
    closeMobileEditPanel = () => {},
    openFrameEditor = () => {},
    transient = () => {},
    recordManualTrace = () => {},
    solvePinnedConstraints = null,
    snapFramePoint = p => p,
    snapFrameNodesToGrid = () => {},
    isGroundPositionUnlocked = () => false,
    relockGroundPosition = () => {},
    rotateInputCrankToPoint = () => false,
    drivePointTo = () => false,
    driveBody = () => null,
    pointIsRackHole = () => false,
    driveState = () => 'none';

export function startFreeLinkDrag(e, linkId) {
  const fused = !!fusionRoot(S.comps,linkId);
  const c = fused ? null : S.comps.find(x => x.id === linkId && isFreeBody(S.comps,x,S.modules));
  const w = worldFromEvent(e);
  // 有動力的機構：拖桿身＝試動
  const probe = !fused && !c && w && driveBody(S.comps.find(x => x.id === linkId), w);
  // 「這一拖是什麼意思」交給 drag-intent.js；這裡只執行它的結論。
  const intent = dragIntent({grab:'body'}, {fused, free:!!c, follows:!!probe});
  if (intent.kind === 'none') { if (w && intent.reason) dragBlocked(e, intent.reason); return false; }
  if (!w) return false;
  S.dragProbe = probe || null;
  if (probe && !probe.tip) dragBlocked(e, 'body');
  S.preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  pendingMobileEdit = mobilePrompt();
  const body=c||S.comps.find(x=>x.id===linkId);
  if(body.type!=='motor')(body.type==='triangle'?selectTriangle:selectLink)(linkId,{openPanel:!pendingMobileEdit});
  S.dragLinkId = linkId;
  S.dragLastWorld = w;
  S.snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
  return true;
}

const dragBlocked = (e, kind) => { blockedDrag = {x:e.clientX, y:e.clientY, t:e.pointerType || 'mouse', kind}; };
function blockedCheck(e) {
  if (blockedDrag && Math.hypot(e.clientX-blockedDrag.x,e.clientY-blockedDrag.y) >= (blockedDrag.t === 'mouse' ? 6 : 12)) { const k = blockedDrag.kind; blockedDrag = null; explainDrag(k); }
}
function explainDrag(kind) {
  const drive = driveState();
  if (saidDrag || drive === 'loading') return;
  saidDrag = kind;
  import('./drag-intent.js').then(m => transient(m.blockedMessage(kind, drive === 'ready'))).catch(() => {});
}
function redrawAfterDrag() {
  rebuild();
  recordManualTrace();
  draw();
}
// 拖機架把手：整組平移所有固定銷。不選取任何節點、不叫屬性列。
export function onFrameHandleDown(e) {
  e.preventDefault();
  if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) return;
  e.stopPropagation();
  const w = worldFromEvent(e);
  if (!w) return;
  S.preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  openFrameEditor();
  S.dragFrame = true;
  S.dragLastWorld = w;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
export function onNodeDown(e, id) {
  e.preventDefault();
  if (S.drawingLink || S.drawingTriangle || S.drawingPolygon) return; // 畫圖模式：交給 svg 起點處理（會自動吸附到此接點）
  if (S.placingMotor) { e.stopPropagation(); handleMotorOnNode(id); return; }
  if (S.pickBars) return;
  // 接點已經接手這次 pointerdown；不要再冒泡到畫布的「點空白取消選取」。
  // 過去 dragId 會間接擋住取消，但加入拖曳門檻後按下階段尚未設定 dragId，
  // 因此必須在事件語意上明確阻止背景處理。
  e.stopPropagation();
  const motorBody=S.comps.find(c=>c.type==='motor'&&c.p1?.id===id);
  if (motorBody || S.comps.some(c=>c.frameHole&&c.p1.id===id)) S.frameEditorOpen=false;
  else if (pointIsGround(id)) openFrameEditor();
  else S.frameEditorOpen = false;
  S.preDragSnap = snapshotStr(); // 拖曳前狀態；若真的有變動，drag end 才記入 undo
  pause();
  // 選接點時收掉桿件 / 三點桿 / 滑軌的長度面板，各種屬性列互斥不疊在一起。
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedGearId = null;   // 選接點＝離開齒輪編輯
  S.selectedSprocketId = null;   // 也離開鏈輪編輯
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('gearEditor').style.display = 'none';
  const sprocketPanel = document.getElementById('sprocketEditor');
  if (sprocketPanel) sprocketPanel.style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  S.selectedNodeId = id;
  pendingMobileEdit = mobilePrompt();
  if (!pendingMobileEdit) openMobileEditPanel();
  Panels.updateRoleEditor();
  S.dragId = null; S.snapTarget = null;
  const localBody=motorBody||S.comps.find(c=>localHoles(c).some(h=>h.id===id));
  const w0=worldFromEvent(e), pointer={x:e.clientX,y:e.clientY,pointerType:e.pointerType || 'mouse'};
  // 這一抓是什麼意思：把按下當下能同步知道的事實交給 drag-intent.js，這裡只執行它的結論。
  const grab=motorBody?'shaft':S.comps.some(c=>c.frameHole&&c.p1.id===id)?'frame-hole':localBody?'hole':'end';
  const bodyFused=!!localBody&&!!fusionRoot(S.comps,localBody.id);
  const bodyFree=!!localBody&&!bodyFused&&isFreeBody(S.comps,localBody,S.modules);
  const tip=localBody&&!bodyFree&&!bodyFused&&localBody.type==='bar'&&w0&&driveBody(localBody,w0)?.tip;   // 沒有動力來源也能拉的彎臂端
  const over=idleHoleOfGroundPart(id,localBody)?movingPartUnder(e,localBody,w0):null;               // 固定板上沒用到的孔，底下有會動的零件
  const intent=dragIntent({grab},{
    free:grab==='end'?!!((freeLinkForPoint&&freeLinkForPoint(id))||(freeTriangleForPoint&&freeTriangleForPoint(id))):bodyFree,
    fused:!!fusionAtPoint(S.comps,id),
    groundLocked:grab!=='shaft'&&pointIsGround(id)&&!isGroundPositionUnlocked(id),
    groundPart:grab==='hole'&&localBody.p1?.type==='fixed'&&localBody.p2?.type==='fixed',
    follows:driveState()!=='none'||!!tip,
    over:over&&{free:over.free}});
  const asBody=grab!=='end'&&(intent.kind==='move-free'||(intent.kind==='drive'&&(tip||over)));
  pendingNodeDrag = intent.kind==='none' ? null
    : asBody ? {id,bodyId:over?.part.id||localBody.id,event:e,...pointer}
    : {id,...pointer};
  if (!pendingNodeDrag && intent.reason) dragBlocked(e, intent.reason);
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
/** 手指／指標落在固定板（機架）沒用到的格孔上，且那一點底下另有會動的零件：抓的是底下的零件，不是空孔。 */
function idleHoleOfGroundPart(id, owner) {
  return !!owner && owner.p1?.type === 'fixed' && owner.p2?.type === 'fixed' && !!svg.querySelector?.(`[data-unused][data-id="${id}"]`);
}
function movingPartUnder(e, owner, w) {
  if (!w) return null;
  for (const el of svg.ownerDocument?.elementsFromPoint?.(e.clientX, e.clientY) || []) {
    if (!svg.contains(el)) continue;
    const pid = el.getAttribute?.('data-link-id') || el.getAttribute?.('data-pick-component');
    const part = pid && S.comps.find(c => c.id === pid);
    if (!part || part === owner || fusionRoot(S.comps, part.id) || (part.p1?.type === 'fixed' && part.p2?.type === 'fixed')) continue;
    if (isFreeBody(S.comps, part, S.modules)) return {part, free: true};
    if (driveBody(part, w)) return {part, free: false};
  }
  return null;
}
function onDragMove(e) {
  if (pinchActive) return;
  if (S.dragShape) return;   // 造形點拖曳由 app 的專用監聽處理
  if (!S.dragProbe) blockedCheck(e);
  if (pendingNodeDrag && !S.dragId) {
    const threshold = pendingNodeDrag.pointerType === 'mouse' ? 6 : 12;
    if (Math.hypot(e.clientX-pendingNodeDrag.x,e.clientY-pendingNodeDrag.y) < threshold) return;
    const pending=pendingNodeDrag;pendingNodeDrag=null;
    if(pending.bodyId)startFreeLinkDrag(pending.event,pending.bodyId);
    else S.dragId=pending.id;
    draw();
  }
  if (S.drawingPolygon) {
    if(S.standardBlankDraft){Tools.standardBlankPointer(e,'move');return;}
    if (activePointers.size >= 2) return;
    const wp = worldFromEvent(e);
    if (wp) { S.polygonPreview = wp; draw(); }
    return;
  }
  if (S.drawingTriangle) {
    if (activePointers.size >= 2) return;
    const wp = worldFromEvent(e);
    if (wp) { S.trianglePreview = wp; draw(); }
    return;
  }
  if (S.drawingLink) { // 畫桿模式：滑鼠移動（或觸控拖曳）就更新自由端
    if (activePointers.size >= 2) return; // 雙指縮放優先
    if (S.drawActive) { const wp = worldFromEvent(e); if (wp) { S.drawPreview = wp; draw(); } }
    return;
  }
  if (activePointers.size >= 2) return; // 雙指縮放/平移中，不做單指拖曳
  const w = worldFromEvent(e); if (!w) return;
  if (S.dragFrame && S.dragLastWorld) {
    const dx = w.x - S.dragLastWorld.x;
    const dy = w.y - S.dragLastWorld.y;
    const anchorId = Array.from(frameNodeIds())[0];
    const before = anchorId ? pointCoords()[anchorId] : null;
    translateFrame(dx,dy,true);
    const after = anchorId ? pointCoords()[anchorId] : null;
    if (!before || !after || Math.hypot(after.x - before.x, after.y - before.y) > 1e-6) S.dragLastWorld = w;
    redrawAfterDrag();
    return;
  }
  if (S.dragLinkId && S.dragLastWorld) {
    const c = S.comps.find(x => x.id === S.dragLinkId && isFreeBody(S.comps,x,S.modules));
    if (S.dragProbe?.tip) {
      moveNodeTo(S.dragProbe.tip,{x:w.x+S.dragProbe.dx,y:w.y+S.dragProbe.dy}); return;
    }
    if (!c) { if (S.dragProbe && drivePointTo(S.dragProbe, w)) { blockedDrag = null; redrawAfterDrag(); } else blockedCheck(e); return; }
    const dx = w.x - S.dragLastWorld.x;
    const dy = w.y - S.dragLastWorld.y;
    // Translate vertices together; local holes follow without changing dimensions.
    for(const p of [c.p1,c.p2,c.p3].filter(Boolean))movePointById(p.id,dx,dy);
    S.dragLastWorld = w;
    if(c.type==='motor'){
      // Align the shaft, not the grab point. Position snapping does not create
      // a housing mount or output joint; those retain their installation checks.
      S.snapTarget=nearestDisplayTo(c.p1.id,[],c.p1);
      const target=S.snapTarget&&displayCoords()[S.snapTarget];
      if(target){
        S.dragLastWorld={x:w.x+target.x-c.p1.x,y:w.y+target.y-c.p1.y};
        updatePointCoordsById(c.p1.id,target.x,target.y);
      }
    }
    redrawAfterDrag();
    return;
  }
  if (!S.dragId) return;
  moveNodeTo(S.dragId,w);
}
/** Numeric coordinates and dragging share rigid-body and joint constraints. */
export function moveNodeTo(id,w,{snap=true}={}) {
  if ((pointIsRackHole(id)||S.comps.some(c=>c.frameHole&&c.p1.id===id)) && dragIntent({grab:'frame-hole'}).kind==='none') return;   // 機架孔由機架面板處理
  const motor=S.comps.find(c=>c.type==='motor'&&c.p1?.id===id);
  if(motor){if(dragIntent({grab:'shaft'},{free:isFreeBody(S.comps,motor,S.modules)}).kind==='move-free'){updatePointCoordsById(id,w.x,w.y);S.snapTarget=null;redrawAfterDrag();}return;}
  // 「這一拖是什麼意思」交給 drag-intent.js；能同步知道的事實在這裡收集，求解器要試過才知道（見下方 solvePinnedConstraints）。
  const crankBar = inputCrankMovingEnd(id);   // 拖輸入桿的動端直接調整馬達角度
  const driven = crankBar ? false : drivePointTo(id,w);   // 有動力時拖接點或孔＝試動；孔不單獨移動
  const head = dragIntent({grab:'end'}, {crank:!!crankBar, follows:!!driven});
  if (head.kind === 'crank') {
    if (rotateInputCrankToPoint(crankBar,w)) { rebuild(); recordManualTrace(); draw(); }
    return;
  }
  if (head.kind === 'drive') {
    redrawAfterDrag();
    S.snapTarget = driven === 'tip' && snap ? nearestDisplayTo(id) : null;
    if (S.snapTarget) draw();
    return;
  }
  const owner=S.comps.find(c=>localHoles(c).some(h=>h.id===id)&&!isFreeBody(S.comps,c,S.modules));
  const gear = S.comps.find(c => c.type === 'gear' && c.p1 && c.p1.id === id && c.p2);
  const freeLink = freeLinkForPoint(id), freeTri = freeTriangleForPoint && freeTriangleForPoint(id);
  const pinTri = freeTriangleForPoint && pinnedTriangleForPoint && pinnedTriangleForPoint(id);
  const context = {
    groundPart:!!owner&&owner.p1.type+owner.p2.type=='fixedfixed',
    free:!owner&&!gear&&!!(freeLink||freeTri), solved:!!(gear||pinTri||looseBarRotation(S.comps,S.topo.params,id)),
    joinedCorner:S.comps.some(c => ['p1', 'p2', 'p3'].some(k => c[k]?.id === id) && holeJoined(S.comps, c)),
    lockedVertex:!!(lockedTriangleVertex && lockedTriangleVertex(id)),
    sharedFixed:!pointIsGround(id)&&S.comps.filter(comp => comp.type === 'bar' && comp.fixedLen && comp.p1 && comp.p2 && (comp.p1.id === id || comp.p2.id === id)).length>1
  };
  const intent = dragIntent({grab:owner?'hole':'end'}, context);
  if (intent.kind === 'none' && (intent.reason === 'hole' || intent.reason === 'ground')) { if(S.dragId)explainDrag(intent.reason); return; }
  // Only world-frame holes snap. Floating joints are motion constraints and
  // must never be quantized to the 8 mm reference grid during editing.
  const dragTarget = snap && pointIsGround(id) ? snapFramePoint(w) : w;
  // 齒輪中心連同銷移動；已接地的夥伴當公轉中心，浮動夥伴一起平移。
  const gearForCenter = gear;
  if (gearForCenter) {
    const pc = pointCoords();
    const cur = pc[id] || { x: gearForCenter.p1.x || 0, y: gearForCenter.p1.y || 0 };
    const partner = S.comps.find(p => p.type === 'gear' && p !== gearForCenter &&
      (gearForCenter.mesh === p.id || p.mesh === gearForCenter.id));
    const moveGear = (g, dx, dy) => { if (g.p1) movePointById(g.p1.id, dx, dy); if (g.p2) movePointById(g.p2.id, dx, dy); };
    if (partner && partner.p1 && pointIsGround(partner.p1.id)) {
      // 公轉：本中心固定在以夥伴中心為圓心、半徑 D=Ra+Rb 的圓上，方位跟指標。
      const pCtr = pc[partner.p1.id] || { x: partner.p1.x || 0, y: partner.p1.y || 0 };
      const D = (Number(S.topo.params[gearForCenter.radiusParam]) || 40) +
                (Number(S.topo.params[partner.radiusParam]) || 40);
      let vx = dragTarget.x - pCtr.x, vy = dragTarget.y - pCtr.y;
      const d = Math.hypot(vx, vy) || 1;
      moveGear(gearForCenter, (pCtr.x + vx / d * D) - cur.x, (pCtr.y + vy / d * D) - cur.y);
    } else if (partner && partner.p1) {
      // 整對平移：兩顆一起搬。
      moveGear(gearForCenter, dragTarget.x - cur.x, dragTarget.y - cur.y);
      moveGear(partner, dragTarget.x - cur.x, dragTarget.y - cur.y);
    } else {
      moveGear(gearForCenter, dragTarget.x - cur.x, dragTarget.y - cur.y);
    }
    S.snapTarget = nearestDisplayTo(id);
    redrawAfterDrag();
    return;
  }
  let tx = dragTarget.x, ty = dragTarget.y;
  // 自由連桿：兩端都未固定、也沒接到別的桿時，拖端點等於整根平移。
  const free = freeLink;
  if (free) {
    const p = pointCoords()[id];
    const desired = { x: w.x, y: w.y };
    const dx = desired.x - (p?.x || 0);
    const dy = desired.y - (p?.y || 0);
    movePointById(free.p1.id, dx, dy);
    movePointById(free.p2.id, dx, dy);
    S.snapTarget = nearestDisplayTo(id);
    redrawAfterDrag();
    return;
  }
  // 自由三點桿：三頂點都沒接到別處時是自由剛體，拖任一頂點＝整個三角平移（三邊長不變，不變形）。
  if (freeTri) {
    const p = pointCoords()[id];
    const dx = w.x - (p?.x || 0);
    const dy = w.y - (p?.y || 0);
    movePointById(freeTri.p1.id, dx, dy);
    movePointById(freeTri.p2.id, dx, dy);
    movePointById(freeTri.p3.id, dx, dy);
    S.snapTarget = nearestDisplayTo(id);
    redrawAfterDrag();
    return;
  }
  // 一頂點固定的三點桿：整個三角繞固定頂點剛性旋轉（拖的頂點沿其半徑圓走，第三點同步轉），三邊長不變。
  if (pinTri) {
    const pc = pointCoords();
    const f = pc[pinTri.pivot.id];
    const d = pc[id];
    if (f && d) {
      const targetAngle = Math.atan2(dragTarget.y-f.y,dragTarget.x-f.x);
      const delta = (snap?Math.round(targetAngle*180/Math.PI)*Math.PI/180:targetAngle) - Math.atan2(d.y - f.y, d.x - f.x);
      const cosD = Math.cos(delta), sinD = Math.sin(delta);
      [pinTri.tri.p1, pinTri.tri.p2, pinTri.tri.p3].forEach(p => {
        if (!p || p.id === pinTri.pivot.id) return;   // 固定頂點不動
        const cur = pc[p.id]; if (!cur) return;
        const vx = cur.x - f.x, vy = cur.y - f.y;
        updatePointCoordsById(p.id, f.x + vx * cosD - vy * sinD, f.y + vx * sinD + vy * cosD);
      });
      S.snapTarget = nearestDisplayTo(id);
      redrawAfterDrag();
      return;
    }
  }
  if (rotateLooseBarEnd(S.comps,S.topo.params,id,dragTarget,snap)) {
    S.snapTarget = nearestDisplayTo(id);
    redrawAfterDrag();
    return;
  }
  // 一般閉鏈/欠定機構的手抓點：把被拖的洞暫時 pin 到游標，用距離約束迭代解其他桿件。
  if (solvePinnedConstraints && solvePinnedConstraints(id, dragTarget)) {
    S.snapTarget = nearestDisplayTo(id);
    redrawAfterDrag();
    return;
  }
  // 以上都做不到才看拒絕理由（接在孔上的角、被剛體完全決定的三點桿頂點、多桿共用固定長度的接點）。
  const refused = dragIntent({grab:'end'}, {...context, free:false, solved:false});
  if (refused.kind === 'none') { if (S.dragId && refused.reason) explainDrag(refused.reason); return; }
  // 固定長度連桿：已有約束時，拖端點繞另一端以固定半徑旋轉（圓規），長度不變
  const fl = fixedLinkFor(id);
  if (fl) {
    const other = fl.p1.id === id ? fl.p2 : fl.p1;
    const L = Math.max(1, S.topo.params[fl.lenParam] ||
      Math.hypot((fl.p2.x || 0) - (fl.p1.x || 0), (fl.p2.y || 0) - (fl.p1.y || 0)));
    let dx = dragTarget.x - (other.x || 0), dy = dragTarget.y - (other.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    tx = (other.x || 0) + dx / d * L;
    ty = (other.y || 0) + dy / d * L;
  }
  updatePointCoordsById(id, tx, ty);
  recomputeLengths();
  S.snapTarget = nearestDisplayTo(id);
  redrawAfterDrag();
}
export function translateFrame(dx,dy,snap=false){
  frameNodeIds().forEach(id=>movePointById(id,dx,dy));if(snap)snapFrameNodesToGrid();
}
export function setFramePosition(axis,value){
  const nodes=[...frameNodeIds()].map(id=>pointCoords()[id]).filter(Boolean);if(!nodes.length||!Number.isFinite(value))return;
  const center=nodes.reduce((sum,p)=>sum+p[axis],0)/nodes.length,delta=value-center;if(Math.abs(delta)<1e-7)return;
  pause();const before=snapshotStr();translateFrame(axis==='x'?delta:0,axis==='y'?delta:0);rebuild();draw();
  if(!confirmMountingChange(JSON.parse(before),mountingWork(S),{notify:transient})){S.preDragSnap=before;cancelPointDrag();Panels.updateFrameEditor();return;}
  S.undoStack.push(before);if(S.undoStack.length>60)S.undoStack.shift();updateUndoBtn(true);Panels.updateFrameEditor();
}
export function setPointPosition(axis,raw) {
  const id=S.selectedNodeId,p=pointCoords()[id],value=Number(raw);
  if(!p||!['x','y'].includes(axis)||!Number.isFinite(value))return;
  return setPointTarget(id,{...p,[axis]:value});
}
/** Exact angle through the shared point edit. */
export function setPointAngle(id,value) {
  const r=pointRotation(S.comps,S.topo.params,id);
  if(!r||!Number.isFinite(value))return;
  const a=value*Math.PI/180;
  return setPointTarget(id,{x:r.pivot.x+r.length*Math.cos(a),y:r.pivot.y+r.length*Math.sin(a)});
}
function setPointTarget(id,target) {
  const p=pointCoords()[id];if(!p)return;
  if(fusionAtPoint(S.comps,id)){transient('合成孔位請改桿段尺寸，或先解除合成。');return;}
  if(Math.hypot(target.x-p.x,target.y-p.y)<1e-7)return;
  pause();const before=snapshotStr(),saved={comps:structuredClone(S.comps),modules:structuredClone(S.modules),params:{...S.topo.params},theta:S.theta,motorAngles:{...S.motorAngles}};
  moveNodeTo(id,target,{snap:false});S.snapTarget=null;rebuild();
  const actual=pointCoords()[id];
  if(!actual||Math.hypot(actual.x-target.x,actual.y-target.y)>.05){S.comps=saved.comps;S.modules=saved.modules;S.topo.params=saved.params;S.theta=saved.theta;S.motorAngles=saved.motorAngles;rebuild();transient('此位置不符合連接或固定長度；請改孔距，或拖曳到可達位置。');}
  else if(snapshotStr()!==before){
    if(!confirmMountingChange(JSON.parse(before),mountingWork(S),{notify:transient})){S.preDragSnap=before;cancelPointDrag();S.theta=saved.theta;S.motorAngles=saved.motorAngles;}
    else{S.undoStack.push(before);if(S.undoStack.length>60)S.undoStack.shift();updateUndoBtn(true);}
  }
  draw();Panels.updateRoleEditor();
}

function commitDragUndo() {
  if (S.preDragSnap == null) return;
  if (snapshotStr() !== S.preDragSnap) {
    if(!confirmMountingChange(JSON.parse(S.preDragSnap),mountingWork(S),{notify:transient})){cancelPointDrag();return;}
    S.undoStack.push(S.preDragSnap);
    if (S.undoStack.length > 60) S.undoStack.shift();
    updateUndoBtn(true);
  }
  S.preDragSnap = null;
}
async function mountDroppedMotor(id,expected){
  const {mountDroppedMotor:finish}=await import('./motor-drop-ui.js');
  finish({S,id,expected,snapshotStr,displayCoords,rebuild,draw,notify:transient,updateRoleEditor:Panels.updateRoleEditor});
}
function cancelPointDrag(){
  const before=S.preDragSnap;S.preDragSnap=null;S.dragId=null;S.dragLinkId=null;S.dragFrame=false;S.dragLastWorld=null;S.snapTarget=null;
  if(before){const saved=JSON.parse(before);S.comps=saved.comps;S.modules=saved.modules||[];S.topo.params=saved.params;S.motorAngles={...(saved.motorAngles||{})};S.theta=Number(saved.params?.theta)||0;rebuild();draw();}
}
function onDragEnd(e) {
  if(S.standardBlankDraft){Tools.standardBlankPointer(e,e?.type==='pointercancel'?'cancel':'up');return;}
  if(e?.type==='pointercancel'&&!S.drawingLink&&!S.drawingTriangle&&!S.drawingPolygon){cancelPointDrag();pendingNodeDrag=null;return;}

  if (e?.type === 'pointercancel' && (S.drawingLink || S.drawingTriangle || S.drawingPolygon)) { linkPointerStart = null; return; }
  if (pinchActive) return;
  if (S.dragShape) return;   // 造形點拖曳由 app 的專用監聽處理
  if (S.drawingPolygon) {
    if (e && e.pointerType && e.pointerType !== 'mouse') Tools.addPolygonVertex(e);
    return;
  }
  if (S.drawingTriangle) {
    if (e && e.pointerType && e.pointerType !== 'mouse') Tools.finishDrawTriangle(e);
    return;
  }
  if (S.drawingLink) {
    if (e?.pointerType === 'mouse') {
      if (linkPointerStart && Math.hypot(e.clientX - linkPointerStart.x, e.clientY - linkPointerStart.y) >= 6) Tools.finishDrawLink(e);
      linkPointerStart = null;
    } else if (e?.pointerType) {
      if (S.drawKind === 'rail' || (linkPointerStart && (!linkPointerStart.starting || Math.hypot(e.clientX-linkPointerStart.x,e.clientY-linkPointerStart.y)>=12))) Tools.finishDrawLink(e);
      linkPointerStart = null;
    }
    return;
  }
  if (S.dragFrame) {
    S.dragFrame = false; S.dragLastWorld = null;
    rebuild(); draw();
    commitDragUndo();
    return;
  }
  if (S.dragLinkId && S.dragProbe?.tip && S.snapTarget) {
    S.dragId=S.dragProbe.tip; S.dragProbe=null; S.dragLinkId=null; S.dragLastWorld=null;
  }
  if (S.dragLinkId) {
    const dropped=S.comps.find(c=>c.id===S.dragLinkId&&c.type==='motor'),before=S.preDragSnap;
    S.dragLinkId = null; S.dragLastWorld = null; S.snapTarget = null;
    rebuild(); draw();
    commitDragUndo();
    if(dropped&&before!==snapshotStr())mountDroppedMotor(dropped.id,snapshotStr()).catch(()=>transient('未完成自動安裝，請從馬達安裝設定核對。'));
    return;
  }
  if (!S.dragId) { pendingNodeDrag=null; S.preDragSnap = null; return; }
  const did = S.dragId, tgt = S.snapTarget;
  if(tgt&&S.comps.some(c=>c.type==='motor'&&c.p1.id===tgt)){
    const candidate=mountingWork(S),points=displayCoords(),before=S.preDragSnap;
    cancelPointDrag();const expected=snapshotStr();
    import('./motor-drop-ui.js').then(m=>m.connectDraggedMotorOutput({S,fromId:did,toId:tgt,candidate,points,before,expected,snapshotStr,rebuild,draw,notify:transient,selectLink,updateUndoBtn})).catch(()=>transient('尚未接上動力輸出，請重新拖曳或從安裝設定核對。'));
    return;
  }
  if (tgt) {   // 接孔：先還原到拖曳前，再把放開當下的狀態交給共用編輯流程當候選
    const drop = {comps: structuredClone(S.comps), topo: structuredClone(S.topo), points: displayCoords(), theta: S.theta, angles: {...S.motorAngles}};
    cancelPointDrag();
    mergePoints(did, tgt, drop);
    return;
  }
  S.dragId = null; S.snapTarget = null;
  recomputeLengths();
  rebuild(); recordManualTrace(); draw();
  commitDragUndo();
  if (pointIsGround(did)) relockGroundPosition(did);
}

function abortSingleDrag() {
  if(S.standardBlankDraft)Tools.standardBlankPointer(null,'cancel');
  // 第二指落下時，放棄正在進行的單指拖曳，避免與縮放打架
  cancelPointDrag(); // 第二指取消尚未完成的單指候選，不留下半次移動。
  backgroundPan = null;
  blockedDrag = null;
  pendingNodeDrag = null;
  pendingOverlap = null;
  pendingMobileEdit = false;
  S.dragFrame = false;
  S.drawActive = false;
  S.dragId = null; S.dragLinkId = null; S.dragLastWorld = null; S.snapTarget = null;
}

function endPointer(e) {
  blockedDrag = null; saidDrag = null;
  if (backgroundPan?.id === e.pointerId) backgroundPan = null;
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchState = null;
  if (activePointers.size === 0) pinchActive = false;
}


export function init(deps) {
  ({ svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle,
     worldFromEvent, pointCoords, displayCoords = deps.pointCoords, mobilePrompt,
     snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
     movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
     isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
     handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround,
     openMobileEditPanel = (() => {}),
     closeMobileEditPanel = (() => {}),
     openFrameEditor = (() => {}),
     transient = (() => {}),
     recordManualTrace = (() => {}),
     solvePinnedConstraints = null,
     snapFramePoint = (p => p),
     snapFrameNodesToGrid = (() => {}),
     isGroundPositionUnlocked = (() => false),
     relockGroundPosition = (() => {}),
     selectOverlapComponent = (() => {}),
     nodeDownEntry = null,
     rotateInputCrankToPoint = (() => false),
     drivePointTo = (() => false),
     driveBody = (() => null),
     pointIsRackHole = (() => false), driveState = (() => 'none') } = deps);

  // ---- 掛上 svg 的指標 / 手勢監聽（原 app.js 檔尾那批，順序不變）----
  // 拖曳節流：高回報率滑鼠 / 觸控一幀可能送多筆 pointermove，每筆都 rebuild+draw 會掉幀。
  // 把移動事件合併到 requestAnimationFrame——一幀最多處理最後一筆；放開時取消未執行的那筆，
  // 避免 drag end 之後才補跑一步舊移動。
  let pendingMoveEvent = null;
  let moveRaf = 0;
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||S.preDragSnap==null)return;
    e.preventDefault();pendingMoveEvent=null;cancelAnimationFrame(moveRaf);moveRaf=0;
    cancelPointDrag();pendingNodeDrag=null;
  });
  const onDragMoveThrottled = (e) => {
    pendingMoveEvent = e;
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      const ev = pendingMoveEvent;
      pendingMoveEvent = null;
      if (ev) onDragMove(ev);
    });
  };
  const cancelPendingMove = () => {
    if (moveRaf) cancelAnimationFrame(moveRaf);
    moveRaf = 0;
    pendingMoveEvent = null;
  };
  svg.addEventListener('pointermove', onDragMoveThrottled);
  svg.addEventListener('pointerup', cancelPendingMove);
  svg.addEventListener('pointercancel', cancelPendingMove);
  svg.addEventListener('pointerup', onDragEnd);
  svg.addEventListener('pointercancel', onDragEnd);
  svg.addEventListener('pointerup', () => {
    if (pendingMobileEdit) { pendingMobileEdit = false; openMobileEditPanel(); }
  });
  svg.addEventListener('pointercancel', () => { pendingMobileEdit = false; });
  // 點空白處（背景/地面線，未 stopPropagation）取消選取
  svg.addEventListener('pointerdown', (e) => {
    if(e.target?.closest?.('[data-dimension-handle],[data-point-choice]'))return;
    if (pinchActive) return;
    if (S.drawingLink || S.drawingTriangle || S.drawingPolygon) return; // 畫圖模式：交給工具處理
    if (S.placingMotor || S.pickBars) { cancelMotorMode(); draw(); return; }
    if (S.dragId || S.dragLinkId || S.dragFrame) return;
    if (e.button !== undefined && e.button !== 0) return;
    backgroundPan = { id:e.pointerId, x:e.clientX, y:e.clientY };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    S.selectedNodeId = null;
    closeMobileEditPanel();
    Panels.updateRoleEditor();
    if (!S.dragId) deselectLink();
  });

  // ---- 縮放 / 平移手勢 ----
  // 雙指：pinch 縮放 + 兩指中心平移；滑鼠滾輪：以游標為錨縮放。單指維持原本的拖曳。
  svg.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    blockedDrag = null; saidDrag = null;
    if (activePointers.size >= 2) {
      pinchActive = true;
      abortSingleDrag();
      const [p, q] = [...activePointers.values()];
      pinchState = { dist: Math.hypot(q.x - p.x, q.y - p.y), cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
      e.preventDefault();
      e.stopImmediatePropagation(); // 第二指不能被零件 handler 接走，或啟動另一段編輯。
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      draw();
    }
  }, true); // 先記錄指標，再讓零件處理；零件的 stopPropagation 不可阻止縮放。
  svg.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinchActive && backgroundPan?.id === e.pointerId) {
      View.panByClient(svg, e.clientX-backgroundPan.x, e.clientY-backgroundPan.y);
      backgroundPan = { id:e.pointerId, x:e.clientX, y:e.clientY };
      draw();
    }
    if (activePointers.size === 2 && pinchState) {
      const [p, q] = [...activePointers.values()];
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
      View.zoomAt(svg, cx, cy, dist / (pinchState.dist || dist));
      View.panByClient(svg, cx - pinchState.cx, cy - pinchState.cy);
      pinchState = { dist, cx, cy };
      draw();
    }
  }, true);
  svg.addEventListener('pointerup', endPointer);
  // 桌機：重疊的零件在同一處再點一次，選到下面的零件（按需載入，見 overlap-cycle.js）。
  import('./overlap-cycle.js').then(m => m.installOverlapCycle({svg, comps: () => S.comps, say: transient, select: id => selectOverlapComponent(id), nodeSelected: () => !!S.selectedNodeId,
    selectedId: () => S.selectedGearId || S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId,
    active: () => !mobilePrompt() && S.mode === 'design' && !(S.mateMode || S.placingMotor || S.pickBars || S.drawingLink || S.drawingTriangle || S.drawingPolygon)})).catch(() => {});
  svg.addEventListener('pointercancel', endPointer);

  // Ambiguous taps wait until release; a drag, cancellation or second finger never opens a menu.
  svg.addEventListener('pointermove', e => {
    if (pendingOverlap && Math.hypot(e.clientX-pendingOverlap.x,e.clientY-pendingOverlap.y)>12) {
      const pick=pendingOverlap; pendingOverlap=null;
      // Continue the original target's drag instead of swallowing a deliberate movement.
      if (pick.nodeId) (nodeDownEntry || onNodeDown)(pick.event,pick.nodeId);
      else if (pick.componentId) selectOverlapComponent(pick.componentId,pick.event);
    }
  }, true);
  svg.addEventListener('pointercancel', () => { pendingOverlap=null; }, true);
  svg.addEventListener('pointerup', e => {
    const pick=pendingOverlap; pendingOverlap=null;
    if (!pick || pick.pointerId!==e.pointerId || pinchActive || Math.hypot(e.clientX-pick.x,e.clientY-pick.y)>12) return;
    openOverlapPicker(pick.items, item => {
      if (item.kind==='component') selectOverlapComponent(item.id);
      else {
        (nodeDownEntry || onNodeDown)(pick.event,item.id);
        pendingMobileEdit=false; pendingNodeDrag=null;
        S.preDragSnap=null; // 選單在放開後才選取，沒有拖曳候選可留給自動存檔。
        openMobileEditPanel();
        document.getElementById('servoEditor')?.scrollIntoView?.({block:'nearest'});
      }
    });
  });
  svg.addEventListener('pointerdown', e => {
    if(svg.querySelector?.('[data-syringe-pick-holes]'))return;
    if (!mobilePrompt() || S.mode !== 'design' || S.mateMode || S.placingMotor || S.pickBars || S.drawingLink || S.drawingTriangle || S.drawingPolygon || activePointers.size>=2) return;
    if (e.button !== undefined && e.button !== 0) return;
    // Leave dedicated handles (shape vertices, gear output pins, task sliders) to their own handlers.
    if (e.target!==svg && !['data-id','data-motor-hit','data-pick-component'].some(key=>e.target?.getAttribute?.(key))) return;
    const items=collectPickCandidates(svg,e.clientX,e.clientY,S.comps);
    if (items.length===1 && items[0].kind==='node') {
      e.stopImmediatePropagation();
      (nodeDownEntry || onNodeDown)(e,items[0].id);
      return;
    }
    if (items.length<2) return;
    pause();
    const nodeId=e.target?.getAttribute?.('data-motor-hit') || e.target?.getAttribute?.('data-id');
    const componentId=e.target?.getAttribute?.('data-pick-component');
    pendingOverlap={items,nodeId,componentId,event:e,pointerId:e.pointerId,x:e.clientX,y:e.clientY};
    e.preventDefault(); e.stopImmediatePropagation();
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  }, true);

  // 手機：接點優先命中（capture 階段先攔）。
  // 觸控目標常比手指小，落點容易偏到接點旁邊的桿身，結果只跳出長度面板、
  // 點不到那個接點去接地錨。這裡在事件還沒走到桿身/三角板的 handler 之前先判斷：
  // 落點若靠近某個接點（用畫面 px 當門檻，縮放下手感一致），就直接接手那個接點，
  // 並擋住桿身的 pointerdown，避免它把選取搶去顯示長度。
  svg.addEventListener('pointerdown', (e) => {
    if(e.target?.closest?.('[data-dimension-handle],[data-point-choice]')||svg.querySelector?.('[data-syringe-pick-holes]'))return;
    if (!mobilePrompt()) return;
    if (S.mateMode) return;                                   // 接合面工具開著：舞台只接受點目標與平移（mate-tool.js）
    if (e.pointerType === 'mouse') return;
    if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.pickBars) return; // 這些模式各自有起點處理
    if (activePointers.size >= 2) return;                    // 第二指：交給縮放手勢
    const w = worldFromEvent(e); if (!w) return;
    const ctm = svg.getScreenCTM();
    const pxToWorld = ctm && ctm.a ? 1 / (ctm.a * View.getScale()) : 1 / View.getScale();
    // 點在軸心的可見觸控圓環內，應選該軸心，不讓附近機架孔搶走。
    const id = e.target?.getAttribute?.('data-motor-hit') || Tools.nearestNodeId(w, [], NODE_TAP_PX * pxToWorld);
    if (!id) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); // 維持縮放偵測的指標帳本
    e.stopPropagation();   // 攔住桿身/三角板的 pointerdown，避免被搶去選長度
    (nodeDownEntry || onNodeDown)(e, id);
  }, true);

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    View.zoomAt(svg, e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    draw();
  }, { passive: false });

  // 畫桿模式：按下決定起點；桌機拖放或點兩下，觸控拖放。
  svg.addEventListener('pointerdown', (e) => {
    if(e.target?.closest?.('[data-dimension-handle],[data-point-choice]'))return;
    if (!S.drawingLink) return;
    if (activePointers.size >= 2) return; // 雙指縮放優先
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const w = worldFromEvent(e); if (!w) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      const starting = !S.drawActive;
      Tools.placeLinkPoint(e);
      linkPointerStart = starting ? { x: e.clientX, y: e.clientY } : null;
      if (starting) try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    // 觸控 / 觸控筆：首次輕點保留起點；第二次點選或首次拖放完成。滑軌維持拖放。
    const starting = !S.drawActive;
    if (starting || S.drawKind === 'rail') Tools.startLinkAt(w);
    else S.drawPreview = w;
    linkPointerStart = { x:e.clientX, y:e.clientY, starting };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  });
  svg.addEventListener('pointerdown', (e) => {
    if(e.target?.closest?.('[data-dimension-handle],[data-point-choice]'))return;
    if (!S.drawingTriangle) return;
    if (activePointers.size >= 2) return;
    const w = worldFromEvent(e); if (!w) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      Tools.placeTrianglePoint(e);
      return;
    }
    S.trianglePreview = w;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    draw();
  });
  // 多邊形板：滑鼠左鍵逐點加頂點 / 選求解點；觸控按下設預覽、放開時提交（見 onDragEnd）。
  svg.addEventListener('pointerdown', (e) => {
    if(e.target?.closest?.('[data-dimension-handle],[data-point-choice]'))return;
    if (!S.drawingPolygon) return;
    if (activePointers.size >= 2) return;
    if(S.standardBlankDraft){if(e.button>0)return;e.preventDefault();Tools.standardBlankPointer(e,'down');return;}
    const w = worldFromEvent(e); if (!w) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return; // 右鍵只負責下方 contextmenu 的「完成」，不能先加一點。
      Tools.addPolygonVertex(e);
      return;
    }
    S.polygonPreview = w;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    draw();
  });
  // 滑鼠右鍵＝確定長度 / 三點桿 / 多邊形收尾
  svg.addEventListener('contextmenu', (e) => {
    if (!S.drawingLink && !S.drawingTriangle && !S.drawingPolygon) return;
    e.preventDefault();
    if (S.standardBlankDraft)return;
    if (S.drawingPolygon) { Tools.finishPolygonDraw(); return; }
    if (S.drawingTriangle) Tools.finishPlateAsLinkEarly();
    else Tools.finishDrawLink(e);
  });
}
