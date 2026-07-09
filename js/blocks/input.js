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
import * as View from './view.js';
import * as Tools from './tools.js';
import * as Panels from './panels.js';

const NODE_TAP_PX = 34;   // 手機點接點的命中半徑（畫面 px，縮放下維持一致手感；與 app.js 同值）

// ---- 縮放 / 平移手勢的指標帳本（畫布層級狀態）----
const activePointers = new Map();   // pointerId -> { x, y }（client 座標）
let pinchState = null;              // { dist, cx, cy }

// ---- 注入的外部依賴（由 app 在啟動時提供）----
let svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink,
    worldFromEvent, pointCoords, mobilePrompt,
    snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
    movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
    isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
    handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround,
    openMobileEditPanel = () => {},
    closeMobileEditPanel = () => {},
    recordManualTrace = () => {},
    solvePinnedConstraints = null,
    snapFramePoint = p => p,
    snapFrameNodesToGrid = () => {};

export function startFreeLinkDrag(e, linkId) {
  const c = S.comps.find(x => x.id === linkId && isFreeLink(x));
  if (!c) return false;
  const w = worldFromEvent(e);
  if (!w) return false;
  S.preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  selectLink(linkId);
  S.dragLinkId = linkId;
  S.dragLastWorld = w;
  S.snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
  return true;
}

function redrawAfterDrag() {
  rebuild();
  recordManualTrace();
  draw();
}
// 拖機架把手：整組平移所有固定銷。不選取任何節點、不叫屬性列。
export function onFrameHandleDown(e) {
  e.preventDefault();
  if (S.drawingLink || S.drawingTriangle || S.placingMotor || S.pickBars) return;
  e.stopPropagation();
  const w = worldFromEvent(e);
  if (!w) return;
  S.preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  S.dragFrame = true;
  S.dragLastWorld = w;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
export function onNodeDown(e, id) {
  e.preventDefault();
  if (S.drawingLink || S.drawingTriangle) return; // 畫圖模式：交給 svg 起點處理（會自動吸附到此接點）
  if (S.placingMotor) { e.stopPropagation(); handleMotorOnNode(id); return; }
  if (S.pickBars) return;
  S.preDragSnap = snapshotStr(); // 拖曳前狀態；若真的有變動，drag end 才記入 undo
  pause();
  // 選接點時收掉桿件 / 三點桿 / 滑軌的長度面板，各種屬性列互斥不疊在一起。
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedGearId = null;   // 選接點＝離開齒輪編輯
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('gearEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  S.selectedNodeId = id;
  openMobileEditPanel();
  Panels.updateRoleEditor();
  S.dragId = id; S.snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
function onDragMove(e) {
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
    frameNodeIds().forEach(id => movePointById(id, dx, dy));
    snapFrameNodesToGrid();
    const after = anchorId ? pointCoords()[anchorId] : null;
    if (!before || !after || Math.hypot(after.x - before.x, after.y - before.y) > 1e-6) S.dragLastWorld = w;
    redrawAfterDrag();
    return;
  }
  if (S.dragLinkId && S.dragLastWorld) {
    const c = S.comps.find(x => x.id === S.dragLinkId && isFreeLink(x));
    if (!c) return;
    const dx = w.x - S.dragLastWorld.x;
    const dy = w.y - S.dragLastWorld.y;
    movePointById(c.p1.id, dx, dy);
    movePointById(c.p2.id, dx, dy);
    S.dragLastWorld = w;
    redrawAfterDrag();
    return;
  }
  if (!S.dragId) return;
  // 馬達輸入桿的動端：solver 會把它釘在 S.theta 對應的姿勢，直接拖會被拉回、移不動。
  // 不跟 solver 較勁——以「指標位置」找最近的接點當吸附目標、放開即連接（綠圈給回饋）。
  const crankBar = inputCrankMovingEnd(S.dragId);
  if (crankBar) {
    S.snapTarget = nearestDisplayToPoint(w, [crankBar.p1.id, crankBar.p2.id]);
    draw();
    return;
  }
  const dragTarget = pointIsGround(S.dragId) ? snapFramePoint(w) : w;
  // 齒輪中心：拖中心＝整顆齒輪剛性平移（輪緣銷 p2 跟著走），否則齒形繞 p1、銷停舊位會分離。
  // 並維持嚙合（中心距 D=Ra+Rb 是死的）：
  //  - 夥伴已接地 → 本中心被 D 綁住，繞夥伴中心「公轉」（保持咬合，只改方位，之後可就地設地錨）。
  //  - 夥伴未接地 → 整對一起平移（兩顆都搬，維持咬合）。
  //  - 沒夥伴（單顆）→ 整顆剛性平移。
  // 放開沿用既有 mergePoints 合併到已知點/地錨＝固定在機架上（乙）。
  const gearForCenter = S.comps.find(c => c.type === 'gear' && c.p1 && c.p1.id === S.dragId);
  if (gearForCenter && gearForCenter.p2) {
    const pc = pointCoords();
    const cur = pc[S.dragId] || { x: gearForCenter.p1.x || 0, y: gearForCenter.p1.y || 0 };
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
    S.snapTarget = nearestDisplayTo(S.dragId);
    redrawAfterDrag();
    return;
  }
  let tx = dragTarget.x, ty = dragTarget.y;
  // 自由連桿：兩端都未固定、也沒接到別的桿時，拖端點等於整根平移。
  const free = freeLinkForPoint(S.dragId);
  if (free) {
    const p = pointCoords()[S.dragId];
    const dx = w.x - (p?.x || 0);
    const dy = w.y - (p?.y || 0);
    movePointById(free.p1.id, dx, dy);
    movePointById(free.p2.id, dx, dy);
    S.snapTarget = nearestDisplayTo(S.dragId);
    redrawAfterDrag();
    return;
  }
  // 自由三點桿：三頂點都沒接到別處時是自由剛體，拖任一頂點＝整個三角平移（三邊長不變，不變形）。
  const freeTri = freeTriangleForPoint && freeTriangleForPoint(S.dragId);
  if (freeTri) {
    const p = pointCoords()[S.dragId];
    const dx = w.x - (p?.x || 0);
    const dy = w.y - (p?.y || 0);
    movePointById(freeTri.p1.id, dx, dy);
    movePointById(freeTri.p2.id, dx, dy);
    movePointById(freeTri.p3.id, dx, dy);
    S.snapTarget = nearestDisplayTo(S.dragId);
    redrawAfterDrag();
    return;
  }
  // 一頂點固定的三點桿：整個三角繞固定頂點剛性旋轉（拖的頂點沿其半徑圓走，第三點同步轉），三邊長不變。
  const pinTri = freeTriangleForPoint && pinnedTriangleForPoint && pinnedTriangleForPoint(S.dragId);
  if (pinTri) {
    const pc = pointCoords();
    const f = pc[pinTri.pivot.id];
    const d = pc[S.dragId];
    if (f && d) {
      const delta = Math.atan2(dragTarget.y - f.y, dragTarget.x - f.x) - Math.atan2(d.y - f.y, d.x - f.x);
      const cosD = Math.cos(delta), sinD = Math.sin(delta);
      [pinTri.tri.p1, pinTri.tri.p2, pinTri.tri.p3].forEach(p => {
        if (!p || p.id === pinTri.pivot.id) return;   // 固定頂點不動
        const cur = pc[p.id]; if (!cur) return;
        const vx = cur.x - f.x, vy = cur.y - f.y;
        updatePointCoordsById(p.id, f.x + vx * cosD - vy * sinD, f.y + vx * sinD + vy * cosD);
      });
      S.snapTarget = nearestDisplayTo(S.dragId);
      redrawAfterDrag();
      return;
    }
  }
  // 一般閉鏈/欠定機構的手抓點：把被拖的洞暫時 pin 到游標，用距離約束迭代解其他桿件。
  if (solvePinnedConstraints && solvePinnedConstraints(S.dragId, dragTarget)) {
    S.snapTarget = nearestDisplayTo(S.dragId);
    redrawAfterDrag();
    return;
  }
  // 三點桿自由頂點，但另兩頂點都被機構牽制（≥2 樞紐）：此頂點被剛體完全決定，
  // 自由拖會破壞三角剛性 → 鎖住不動（要移動請拖牽制較少的接點，或加馬達驅動機構）。
  if (lockedTriangleVertex && lockedTriangleVertex(S.dragId)) return;
  // 固定長度連桿：已有約束時，拖端點繞另一端以固定半徑旋轉（圓規），長度不變
  const fl = fixedLinkFor(S.dragId);
  if (fl) {
    const other = fl.p1.id === S.dragId ? fl.p2 : fl.p1;
    const L = Math.max(1, S.topo.params[fl.lenParam] ||
      Math.hypot((fl.p2.x || 0) - (fl.p1.x || 0), (fl.p2.y || 0) - (fl.p1.y || 0)));
    let dx = dragTarget.x - (other.x || 0), dy = dragTarget.y - (other.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    tx = (other.x || 0) + dx / d * L;
    ty = (other.y || 0) + dy / d * L;
  }
  updatePointCoordsById(S.dragId, tx, ty);
  recomputeLengths();
  S.snapTarget = nearestDisplayTo(S.dragId);
  redrawAfterDrag();
}
function commitDragUndo() {
  if (S.preDragSnap == null) return;
  if (snapshotStr() !== S.preDragSnap) {
    S.undoStack.push(S.preDragSnap);
    if (S.undoStack.length > 60) S.undoStack.shift();
    updateUndoBtn();
  }
  S.preDragSnap = null;
}
function onDragEnd(e) {
  if (S.drawingTriangle) {
    if (e && e.pointerType && e.pointerType !== 'mouse') Tools.finishDrawTriangle(e);
    return;
  }
  if (S.drawingLink) { // 觸控/筆：放開＝確定長度（滑鼠改用右鍵確定，見 contextmenu）
    if (e && e.pointerType && e.pointerType !== 'mouse') Tools.finishDrawLink(e);
    return;
  }
  if (S.dragFrame) {
    S.dragFrame = false; S.dragLastWorld = null;
    rebuild(); draw();
    commitDragUndo();
    return;
  }
  if (S.dragLinkId) {
    S.dragLinkId = null; S.dragLastWorld = null;
    rebuild(); draw();
    commitDragUndo();
    return;
  }
  if (!S.dragId) { S.preDragSnap = null; return; }
  const did = S.dragId, tgt = S.snapTarget;
  S.dragId = null; S.snapTarget = null;
  if (tgt) mergePoints(did, tgt);
  if (tgt && S.selectedNodeId === did) S.selectedNodeId = tgt;
  recomputeLengths();
  rebuild(); recordManualTrace(); draw();
  commitDragUndo();
}

function abortSingleDrag() {
  // 第二指落下時，放棄正在進行的單指拖曳，避免與縮放打架
  S.dragId = null; S.dragLinkId = null; S.dragLastWorld = null; S.snapTarget = null;
}

function endPointer(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchState = null;
}


export function init(deps) {
  ({ svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink,
     worldFromEvent, pointCoords, mobilePrompt,
     snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
     movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
     isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
     handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround,
     openMobileEditPanel = (() => {}),
     closeMobileEditPanel = (() => {}),
     recordManualTrace = (() => {}),
     solvePinnedConstraints = null,
     snapFramePoint = (p => p),
     snapFrameNodesToGrid = (() => {}) } = deps);

  // ---- 掛上 svg 的指標 / 手勢監聽（原 app.js 檔尾那批，順序不變）----
  svg.addEventListener('pointermove', onDragMove);
  svg.addEventListener('pointerup', onDragEnd);
  svg.addEventListener('pointercancel', onDragEnd);
  // 點空白處（背景/地面線，未 stopPropagation）取消選取
  svg.addEventListener('pointerdown', () => {
    if (S.drawingLink || S.drawingTriangle) return; // 畫圖模式：交給工具處理
    if (S.placingMotor || S.pickBars) { cancelMotorMode(); draw(); return; }
    if (S.dragId || S.dragLinkId) return;
    S.selectedNodeId = null;
    closeMobileEditPanel();
    Panels.updateRoleEditor();
    if (!S.dragId) deselectLink();
  });

  // ---- 縮放 / 平移手勢 ----
  // 雙指：pinch 縮放 + 兩指中心平移；滑鼠滾輪：以游標為錨縮放。單指維持原本的拖曳。
  svg.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      abortSingleDrag();
      const [p, q] = [...activePointers.values()];
      pinchState = { dist: Math.hypot(q.x - p.x, q.y - p.y), cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
      draw();
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2 && pinchState) {
      const [p, q] = [...activePointers.values()];
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
      View.zoomAt(svg, cx, cy, dist / (pinchState.dist || dist));
      View.panByClient(svg, cx - pinchState.cx, cy - pinchState.cy);
      pinchState = { dist, cx, cy };
      draw();
    }
  });
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // 手機：接點優先命中（capture 階段先攔）。
  // 觸控目標常比手指小，落點容易偏到接點旁邊的桿身，結果只跳出長度面板、
  // 點不到那個接點去接地錨。這裡在事件還沒走到桿身/三角板的 handler 之前先判斷：
  // 落點若靠近某個接點（用畫面 px 當門檻，縮放下手感一致），就直接接手那個接點，
  // 並擋住桿身的 pointerdown，避免它把選取搶去顯示長度。
  svg.addEventListener('pointerdown', (e) => {
    if (!mobilePrompt()) return;
    if (e.pointerType === 'mouse') return;
    if (S.drawingLink || S.drawingTriangle || S.pickBars) return; // 這些模式各自有起點處理
    if (activePointers.size >= 1) return;                    // 第二指：交給縮放手勢
    const w = worldFromEvent(e); if (!w) return;
    const ctm = svg.getScreenCTM();
    const pxToWorld = ctm && ctm.a ? 1 / (ctm.a * View.getScale()) : 1 / View.getScale();
    const id = Tools.nearestNodeId(w, [], NODE_TAP_PX * pxToWorld);
    if (!id) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); // 維持縮放偵測的指標帳本
    e.stopPropagation();   // 攔住桿身/三角板的 pointerdown，避免被搶去選長度
    onNodeDown(e, id);
  }, true);

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    View.zoomAt(svg, e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    draw();
  }, { passive: false });

  // 畫桿模式：按下時把自由端跳到觸/點位置（觸控才需要；滑鼠靠 hover 已跟隨），並捕捉指標。
  svg.addEventListener('pointerdown', (e) => {
    if (!S.drawingLink) return;
    if (activePointers.size >= 2) return; // 雙指縮放優先
    const w = worldFromEvent(e); if (!w) return;
    e.preventDefault();
    if (e.pointerType === 'mouse' && !mobilePrompt()) {
      Tools.placeLinkPoint(e);                  // 滑鼠：左鍵點兩下（起點 → 終點建立）
      return;
    }
    // 觸控 / 觸控筆：按下起點、拖曳、放開建立（維持一筆完成的手勢）
    S.drawStart = w;
    S.drawStartNodeId = null;                   // 新桿件兩端都自由：起點不自動吸附既有接點
    S.drawPreview = w;
    S.drawActive = true;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    draw();
  });
  svg.addEventListener('pointerdown', (e) => {
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
  // 滑鼠右鍵＝確定長度 / 三點桿
  svg.addEventListener('contextmenu', (e) => {
    if (!S.drawingLink && !S.drawingTriangle) return;
    e.preventDefault();
    if (S.drawingTriangle) Tools.finishPlateAsLinkEarly();
    else Tools.finishDrawLink(e);
  });
}
