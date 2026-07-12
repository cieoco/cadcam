/**
 * blocks / gear-editor
 *
 * 齒輪 / 齒條（rack-and-pinion）域：建立成對齒輪、嚙合鏈同步、選取與編輯面板、
 * 手動旋轉、整鏈刪除與有限齒條的 theta 範圍。函式本體自 app.js 照搬、零行為改變；
 * app 層以注入回呼提供重建 / 繪製 / undo / 面板切換等能力（見 createGearEditor(deps)）。
 */

import { S } from './state.js';
import { ownedParamKeys } from './part-types.js';   // 零件型別表：擁有的參數 key
import { rackGuideThetaRange } from './rack-limits.js';
import { norm360 } from './motion.js';
import { W, H, worldFromScreen } from './view.js';

// 齒輪模數（mm）：所有齒輪共用，節圓半徑 R=teeth·module/2，故必定咬合
export const GEAR_MODULE = 6;

// 齒相位對齊（純滾動只需在 θ=0 對一次，之後 rolling 自動保持咬合）：
// 算出讓「小齒輪齒頂落進齒條齒隙」所需的齒條齒形局部平移（沿桿軸）。
// 2D 和 3D 都必須用同一個 θ=0 放置姿態，不能用播放後的 solved points 重算，否則會雙重位移而錯齒。
export function rackPhaseShift(rack, pinion, { length, module, teeth, axisDeg }) {
  if (!rack || !rack.p1 || !pinion || !pinion.p1 || !pinion.p2) return 0;
  const a = (Number(axisDeg) || 0) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const ctr0 = pinion.p1, pin0 = pinion.p2, ref0 = rack.p1;
  const phi0 = Math.atan2(pin0.y - ctr0.y, pin0.x - ctr0.x);
  const t0 = (ctr0.x - ref0.x) * ux + (ctr0.y - ref0.y) * uy;
  const Ctx = ref0.x + ux * t0, Cty = ref0.y + uy * t0;
  const angC = Math.atan2(Cty - ctr0.y, Ctx - ctr0.x);
  const toothAng = (2 * Math.PI) / teeth;
  const pitch = Math.PI * module;
  const ppFrac = ((angC - phi0) / toothAng) % 1;
  const crownPhase = t0 - pitch * (0.5 + ppFrac);
  const startX0 = -length / 2 - pitch;
  let sh = (crownPhase - startX0) % pitch;
  if (sh < 0) sh += pitch;
  return sh;
}

export function createGearEditor({
  pushUndo, pause, rebuild, draw, renderFrame, transient, scheduleAutosave,
  cancelMotorMode, exitDrawTools, openMobileEditPanel, closeMobileEditPanel, hideEditorPanels,
  snapshotStr, updateUndoBtn, recordManualTrace,
  worldFromEvent, mobilePrompt, pointCoords, updatePointCoordsById, pointIsGround
}) {

  function makeGear(n, opts) {
    const { teeth, module, cx, cy, isDriver, meshId, color } = opts;
    const R = teeth * module / 2;
    const pinR = Math.round(R * 0.6);
    const radiusParam = 'GR' + n;
    const pinRadiusParam = 'GPR' + n;
    // 乙：放下即「浮動未固定」——兩個中心都是 floating，比照桿件由使用者把中心拖去地錨/接點才接地。
    // 驅動輪不必顯式給馬達：兩中心接地後，gear step 的 motor 會 fallback 到預設馬達 '1'（＝播放 theta），
    // 按 ▶ 即轉（見 core/topology.js 的 gear 步驟、solver.js 的齒輪 force-set）。
    const center = { id: 'GC' + n, type: 'floating', x: cx, y: cy };
    const gear = {
      type: 'gear', id: 'Gear' + n, color,
      p1: center,
      p2: { id: 'GP' + n, type: 'floating', x: cx + pinR, y: cy },
      radiusParam, pinRadiusParam, pinHoleDiameter: 5, teeth, module, phase: 0
    };
    if (meshId) gear.mesh = meshId;
    S.topo.params[radiusParam] = R;
    S.topo.params[pinRadiusParam] = pinR;
    return gear;
  }
  // 齒輪以「成對」為基本單位（圓心距、反向同動都是一對的性質）：放下一個嚙合齒輪對——
  // 驅動輪（中心放馬達、一放下就轉）＋ 從動輪（mesh＝驅動輪），擺在相切位置（中心距＝兩節圓
  // 半徑和），播放時依齒數比反向轉。兩輪共用模數 module，節圓半徑 R＝teeth·module/2，必定咬合。
  function addGearPair() {
    pushUndo();
    exitDrawTools();
    cancelMotorMode();
    const m = GEAR_MODULE;
    const na = 12, nb = 18;                         // 預設 12:18，一放下就看得到轉速比
    const Ra = na * m / 2, Rb = nb * m / 2;
    // 擺在畫布中央偏左，整對沿 x 排開、相切
    const base = mobilePrompt() ? worldFromScreen(W * 0.30, H * 0.45) : { x: -70, y: 0 };
    const nA = ++S.counter;
    const driver = makeGear(nA, { teeth: na, module: m, cx: base.x, cy: base.y, isDriver: true, meshId: null, color: '#e74c3c' });
    const nB = ++S.counter;
    const driven = makeGear(nB, { teeth: nb, module: m, cx: base.x + Ra + Rb, cy: base.y, isDriver: false, meshId: driver.id, color: '#2c6fbb' });
    S.comps.push(driver, driven);
    rebuild(); draw();
    selectGear(driven.id);                          // 放下就選從動輪，方便改模數 / 齒數
  }

  function addRackPinion() {
    pushUndo();
    exitDrawTools();
    cancelMotorMode();
    const module = 4;
    const teeth = 15;
    const R = teeth * module / 2;
    const base = mobilePrompt() ? worldFromScreen(W * 0.32, H * 0.44) : { x: -60, y: 0 };
    const n = ++S.counter;
    const pinion = makeGear(n, { teeth, module, cx: base.x, cy: base.y, isDriver: true, meshId: null, color: '#e74c3c' });
    pinion.p1.type = 'motor';
    pinion.p1.physicalMotor = '1';
    const rackLen = 176;
    const bodyHeight = 20;
    const rackRef = { x: base.x, y: base.y - R };
    const pinAId = 'RKG' + (++S.counter);
    const pinBId = 'RKG' + (++S.counter);
    const rack = {
      type: 'rack',
      id: 'Rack' + (++S.counter),
      color: '#16a085',
      p1: { id: 'RKP' + S.counter, type: 'floating', x: rackRef.x, y: rackRef.y },
      pinion: pinion.id,
      lenParam: 'RKL' + S.counter,
      axisDeg: 0,
      sign: 1,
      bodyHeight,
      endMargin:12,
      slot: { length: 136, width: 5, offset: 0 },
      framePins: [pinAId, pinBId],
      holes:[{id:`RKH${S.counter}A`,role:'endA',u:0,v:-15,diameter:5},{id:`RKH${S.counter}B`,role:'endB',u:0,v:-15,diameter:5}]
    };
    const pins = rackFramePinPositions(rack, pinion, { length: rackLen+24, module, teeth, axisDeg: rack.axisDeg });
    const guideA = { type: 'anchor', id: 'RackGuide' + (S.counter - 2), p1: { id: pinAId, type: 'fixed', x: pins[0].x, y: pins[0].y } };
    const guideB = { type: 'anchor', id: 'RackGuide' + (S.counter - 1), p1: { id: pinBId, type: 'fixed', x: pins[1].x, y: pins[1].y } };
    S.topo.params[rack.lenParam] = rackLen;
    S.comps.push(pinion, guideA, guideB, rack);
    rebuild(); draw();
    selectGear(pinion.id);
  }

  // ---- 齒輪：選取 + 改模數 / 齒數（成對同動）----
  function gearById(id) { return S.comps.find(c => c.type === 'gear' && c.id === id) || null; }

  // 和某齒輪同一條嚙合鏈的所有齒輪（沿 mesh 連通分量）。模數必須整鏈一致才咬得起來。
  function gearMeshChain(start) {
    const all = S.comps.filter(g => g.type === 'gear');
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
      const g = stack.pop();
      if (!g || seen.has(g.id)) continue;
      seen.add(g.id);
      if (g.mesh) { const drv = all.find(x => x.id === g.mesh); if (drv) stack.push(drv); }
      all.forEach(x => { if (x.mesh === g.id) stack.push(x); });
    }
    return all.filter(g => seen.has(g.id));
  }
  // 把每顆「從動輪」重擺到和它驅動輪相切（中心距＝兩節圓半徑和），沿目前方向。改模數/齒數後保持嚙合。
  function syncGearMesh() {
    S.comps.filter(c => c.type === 'gear' && c.mesh).forEach(c => {
      const drv = gearById(c.mesh);
      if (!drv) return;
      const dc = pointCoords()[drv.p1.id] || drv.p1;
      const cc = pointCoords()[c.p1.id] || c.p1;
      const Rd = Number(S.topo.params[drv.radiusParam]) || 40;
      const Rc = Number(S.topo.params[c.radiusParam]) || 40;
      let dx = (cc.x || 0) - (dc.x || 0), dy = (cc.y || 0) - (dc.y || 0);
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      updatePointCoordsById(c.p1.id, (dc.x || 0) + dx / d * (Rd + Rc), (dc.y || 0) + dy / d * (Rd + Rc));
    });
  }
  // 嚙合防呆：這顆齒輪與其嚙合夥伴若「都已接地」但中心距 ≠ Ra+Rb（>tol），代表沒對好咬合
  // （多半是把中心拖去合併到不在嚙合圓上的地錨）。回 true 讓繪製給紅色虛線環提示，不自動搬動錨點。
  function gearMeshOff(c) {
    if (!c || c.type !== 'gear' || !c.p1) return false;
    const partner = S.comps.find(p => p.type === 'gear' && p !== c && (c.mesh === p.id || p.mesh === c.id));
    if (!partner || !partner.p1) return false;
    if (!pointIsGround(c.p1.id) || !pointIsGround(partner.p1.id)) return false;
    const pc = pointCoords();
    const a = pc[c.p1.id], b = pc[partner.p1.id];
    if (!a || !b) return false;
    const D = (Number(S.topo.params[c.radiusParam]) || 40) + (Number(S.topo.params[partner.radiusParam]) || 40);
    return Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - D) > 1.5;
  }
  function selectGear(id) {
    cancelMotorMode();
    const c = gearById(id);
    if (!c) return;
    openMobileEditPanel();
    S.selectedGearId = id;
    S.selectedLinkId = null;
    S.selectedTriangleId = null;
    S.selectedSliderId = null;
    S.selectedNodeId = null;
    hideEditorPanels();
    updateGearEditor();
    draw();
  }
  function updateGearEditor() {
    const panel = document.getElementById('gearEditor');
    if (!panel) return;
    const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
    if (!c) { panel.style.display = 'none'; return; }
    const mod = Number(c.module) || GEAR_MODULE;
    const rack = rackForGear(c);
    const setText = (elId, v) => { const el = document.getElementById(elId); if (el) el.textContent = v; };
    const setRow = (elId, show) => { const el = document.getElementById(elId); if (el) el.style.display = show ? '' : 'none'; };
    setText('gearModuleVal', Math.round(mod));
    setText('gearTeethVal', c.teeth);
    setText('gearRadiusVal', Math.round(Number(S.topo.params[c.radiusParam]) || c.teeth * mod / 2));
    setText('gearPinRadiusVal', Math.round(gearPinRadius(c)));
    setText('gearPinHoleVal', Number(c.pinHoleDiameter || 5).toFixed(1).replace(/\.0$/, ''));
    setRow('rackLengthRow', !!rack);
    setRow('rackOrientationRow', !!rack);
    setRow('rackBodyHeightRow', !!rack);
    setRow('rackSlotLengthRow', !!rack);
    setRow('rackSlotWidthRow', !!rack);
    if (rack) {
      const len = rackLength(rack);
      const bodyH = rackBodyHeight(rack, mod);
      const slot = ensureRackSlot(rack, len);
      setText('rackLengthVal', Math.round(len));
      setText('rackBodyHeightVal', Number(bodyH).toFixed(1).replace(/\.0$/, ''));
      setText('rackSlotLengthVal', Math.round(slot.length));
      setText('rackSlotWidthVal', Number(slot.width).toFixed(1).replace(/\.0$/, ''));
      const orientationBtn=document.getElementById('rackOrientationBtn');
      if(orientationBtn){ const vertical=Math.abs(Math.sin((Number(rack.axisDeg)||0)*Math.PI/180))>.7; orientationBtn.textContent=vertical?'↕ 垂直升降':'↔ 水平伸縮'; }
    }
    panel.style.display = 'flex';
  }
  function rackForGear(gear) {
    return gear ? S.comps.find(c => c.type === 'rack' && c.pinion === gear.id) || null : null;
  }
  function toggleRackOrientation() {
    const gear=S.selectedGearId?gearById(S.selectedGearId):null, rack=rackForGear(gear);
    if(!gear||!rack||!gear.p1)return;
    pushUndo(); pause();
    const points=pointCoords(), center=points[gear.p1.id]||gear.p1;
    const vertical=Math.abs(Math.sin((Number(rack.axisDeg)||0)*Math.PI/180))>.7;
    const delta=vertical?-Math.PI/2:Math.PI/2, cos=Math.cos(delta), sin=Math.sin(delta);
    [rack.p1.id,...(rack.framePins||[])].forEach(id=>{ const p=points[id]; if(!p)return; const x=p.x-center.x,y=p.y-center.y; updatePointCoordsById(id,center.x+x*cos-y*sin,center.y+x*sin+y*cos); });
    rack.axisDeg=vertical?0:90;
    rebuild(); draw(); updateGearEditor(); scheduleAutosave();
    transient(vertical?'↔ 已改為水平伸縮':'↕ 已改為垂直升降');
  }
  function rackLength(rack) {
    return Number(S.topo.params[rack.lenParam]) || 160;
  }
  function rackBodyLength(rack){ return rackLength(rack)+2*(Number(rack?.endMargin)||12); }
  function rackBodyHeight(rack, module = GEAR_MODULE) {
    return Math.max(4, Number(rack && rack.bodyHeight) || Math.max(8, module * 2.5));
  }
  function ensureRackSlot(rack, length = rackLength(rack)) {
    if (!rack.slot || typeof rack.slot !== 'object') rack.slot = {};
    rack.slot.length = Math.max(8, Math.min(Math.max(8, length - 12), Math.round(Number(rack.slot.length) || Math.max(24, length - 40))));
    rack.slot.width = Number(Math.max(2, Math.min(20, Number(rack.slot.width) || 5)).toFixed(1));
    rack.slot.offset = Number(Number(rack.slot.offset) || 0);
    return rack.slot;
  }
  function rackFramePinPositions(rack, pinion, { length, module, teeth, axisDeg }) {
    const slot = ensureRackSlot(rack, length);
    const phaseShift = rackPhaseShift(rack, pinion, { length, module, teeth, axisDeg });
    const bodyH = rackBodyHeight(rack, module);
    const dedendum = module * 1.25;
    const slotY = -dedendum - bodyH / 2 + (Number(slot.offset) || 0);
    const sep = Math.min(18, Math.max(6, slot.length * 0.08));
    const ar = (Number(axisDeg) || 0) * Math.PI / 180;
    const ux = Math.cos(ar), uy = Math.sin(ar);
    const nx = -Math.sin(ar), ny = Math.cos(ar);
    const ref = rack.p1 || { x: 0, y: 0 };
    const toWorld = x => ({
      x: (ref.x || 0) + ux * x + nx * slotY,
      y: (ref.y || 0) + uy * x + ny * slotY
    });
    return [toWorld(phaseShift - sep), toWorld(phaseShift + sep)];
  }
  function syncRackFramePins(rack, gear = null) {
    if (!rack || !Array.isArray(rack.framePins) || rack.framePins.length < 2) return;
    const pinion = gear || (rack.pinion ? gearById(rack.pinion) : null);
    if (!pinion) return;
    const teeth = Math.max(6, Math.round(Number(pinion.teeth) || 12));
    const R = Number(S.topo.params[pinion.radiusParam]) || 40;
    const module = (2 * R) / teeth;
      const length = rackBodyLength(rack);
    const axisDeg = Number(rack.axisDeg) || 0;
    const pins = rackFramePinPositions(rack, pinion, { length, module, teeth, axisDeg });
    rack.framePins.slice(0, 2).forEach((id, index) => {
      const p = pins[index];
      updatePointCoordsById(id, p.x, p.y);
    });
  }
  function syncRackFramePinsForGear(gear) {
    const rack = rackForGear(gear);
    if (rack) syncRackFramePins(rack, gear);
  }
  function gearPitchRadius(c) {
    return Number(S.topo.params[c.radiusParam]) || (Number(c.teeth) || 12) * (Number(c.module) || GEAR_MODULE) / 2 || 40;
  }
  function gearPinRadius(c) {
    const pitchR = gearPitchRadius(c);
    return c.pinRadiusParam
      ? Number(S.topo.params[c.pinRadiusParam]) || Math.round(pitchR * 0.6)
      : Number(c.pinRadius) || Math.round(pitchR * 0.6);
  }
  function gearDriveState(c, seen = new Set()) {
    if (!c || seen.has(c.id)) return null;
    if (!c.mesh) return { root: c, factor: 1 };
    seen.add(c.id);
    const driver = gearById(c.mesh);
    if (!driver) return null;
    const parent = gearDriveState(driver, seen);
    if (!parent) return null;
    return {
      root: parent.root,
      factor: parent.factor * -(gearPitchRadius(driver) / (gearPitchRadius(c) || 1))
    };
  }
  function setGearManualAngle(c, angleRad) {
    if (!c || !c.p1 || !c.p2) return;
    const state = gearDriveState(c);
    const rootMotor = state && state.root && state.root.p1 &&
      (state.root.p1.physicalMotor || state.root.p1.physical_motor);
    const phaseRad = (Number(c.phase) || 0) * Math.PI / 180;
    if (rootMotor && state && Math.abs(state.factor) > 1e-9) {
      S.theta = (angleRad - phaseRad) * 180 / Math.PI / state.factor;
      const rackRange=rackPinionThetaRange();
      if(rackRange)S.theta=Math.max(rackRange.lo,Math.min(rackRange.hi,S.theta));
      S.topo.params.theta = S.theta;
      const thetaEl = document.getElementById('thetaVal');
      if (thetaEl) thetaEl.textContent = Math.round(norm360(S.theta));
    } else {
      const ctr = pointCoords()[c.p1.id] || c.p1;
      const r = gearPinRadius(c);
      updatePointCoordsById(c.p2.id, (ctr.x || 0) + r * Math.cos(angleRad), (ctr.y || 0) + r * Math.sin(angleRad));
    }
  }
  function startGearManualRotate(e, gearId) {
    if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) return;
    const c = gearById(gearId);
    if (!c || !c.p1 || !c.p2) return;
    e.preventDefault();
    e.stopPropagation();
    pause();
    selectGear(gearId);
    S.preDragSnap = snapshotStr();
    const move = (ev) => {
      const w = worldFromEvent(ev);
      const ctr = pointCoords()[c.p1.id] || c.p1;
      if (!w || !ctr) return;
      setGearManualAngle(c, Math.atan2(w.y - ctr.y, w.x - ctr.x));
      renderFrame();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (S.preDragSnap != null && snapshotStr() !== S.preDragSnap) {
        S.undoStack.push(S.preDragSnap);
        if (S.undoStack.length > 60) S.undoStack.shift();
        updateUndoBtn();
      }
      S.preDragSnap = null;
      rebuild();
      recordManualTrace();
      draw();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    move(e);
  }
  function clampGearPinRadius(c) {
    if (!c) return;
    const pitchR = gearPitchRadius(c);
    const next = Math.max(4, Math.min(Math.max(4, pitchR - 4), gearPinRadius(c)));
    if (c.pinRadiusParam) S.topo.params[c.pinRadiusParam] = Math.round(next);
    else c.pinRadius = Math.round(next);
  }
  function changeGearTeeth(delta) {
    const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
    if (!c) return;
    pushUndo();
    c.teeth = Math.max(6, Math.round((Number(c.teeth) || 12) + delta));
    S.topo.params[c.radiusParam] = c.teeth * (Number(c.module) || GEAR_MODULE) / 2;
    clampGearPinRadius(c);
    syncGearMesh();
    syncRackFramePinsForGear(c);
    rebuild(); draw();
    updateGearEditor();
  }
  function changeGearPinRadius(delta) {
    const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
    if (!c) return;
    pushUndo();
    const pitchR = gearPitchRadius(c);
    const next = Math.max(4, Math.min(Math.max(4, pitchR - 4), gearPinRadius(c) + delta));
    if (c.pinRadiusParam) S.topo.params[c.pinRadiusParam] = Math.round(next);
    else c.pinRadius = Math.round(next);
    const ctr = pointCoords()[c.p1.id] || c.p1;
    const pin = pointCoords()[c.p2.id] || c.p2;
    const ang = Math.atan2((pin.y || 0) - (ctr.y || 0), (pin.x || 0) - (ctr.x || 0));
    updatePointCoordsById(c.p2.id, (ctr.x || 0) + next * Math.cos(ang), (ctr.y || 0) + next * Math.sin(ang));
    rebuild(); draw();
    updateGearEditor();
  }
  function changeGearPinHoleDiameter(delta) {
    const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
    if (!c) return;
    pushUndo();
    c.pinHoleDiameter = Number(Math.max(1, Math.min(30, (Number(c.pinHoleDiameter) || 5) + delta)).toFixed(1));
    rebuild(); draw();
    updateGearEditor();
  }
  function changeGearModule(delta) {
    const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
    if (!c) return;
    pushUndo();
    // 模數是「整鏈」共用：同時改本輪與和它嚙合的所有齒輪，否則齒大小不一咬不起來。
    const mod = Math.max(1, (Number(c.module) || GEAR_MODULE) + delta);
    gearMeshChain(c).forEach(g => {
      g.module = mod;
      S.topo.params[g.radiusParam] = g.teeth * mod / 2;
      clampGearPinRadius(g);
      syncRackFramePinsForGear(g);
    });
    syncGearMesh();
    rebuild(); draw();
    updateGearEditor();
  }
  function changeRackLength(delta) {
    const gear = S.selectedGearId ? gearById(S.selectedGearId) : null;
    const rack = rackForGear(gear);
    if (!rack) return;
    pushUndo();
    const next = Math.max(32, Math.round((rackLength(rack) + delta) / 8) * 8);
    S.topo.params[rack.lenParam] = next;
    ensureRackSlot(rack, next);
    syncRackFramePins(rack, gear);
    rebuild(); draw();
    updateGearEditor();
  }
  function changeRackBodyHeight(delta) {
    const gear = S.selectedGearId ? gearById(S.selectedGearId) : null;
    const rack = rackForGear(gear);
    if (!rack) return;
    pushUndo();
    const mod = Number(gear.module) || GEAR_MODULE;
    const next = Math.max(4, rackBodyHeight(rack, mod) + delta);
    rack.bodyHeight = Number(next.toFixed(1));
    syncRackFramePins(rack, gear);
    rebuild(); draw();
    updateGearEditor();
  }
  function changeRackSlotLength(delta) {
    const gear = S.selectedGearId ? gearById(S.selectedGearId) : null;
    const rack = rackForGear(gear);
    if (!rack) return;
    pushUndo();
    const len = rackLength(rack);
    const slot = ensureRackSlot(rack, len);
    slot.length = Math.max(8, Math.min(Math.max(8, len - 12), Math.round((slot.length + delta) / 8) * 8));
    syncRackFramePins(rack, gear);
    rebuild(); draw();
    updateGearEditor();
  }
  function changeRackSlotWidth(delta) {
    const gear = S.selectedGearId ? gearById(S.selectedGearId) : null;
    const rack = rackForGear(gear);
    if (!rack) return;
    pushUndo();
    const slot = ensureRackSlot(rack);
    slot.width = Number(Math.max(2, Math.min(20, slot.width + delta)).toFixed(1));
    syncRackFramePins(rack, gear);
    rebuild(); draw();
    updateGearEditor();
  }
  function deselectGear() {
    S.selectedGearId = null;
    const panel = document.getElementById('gearEditor');
    if (panel) panel.style.display = 'none';
  }

  // 刪除整條嚙合鏈（成對/成列一起刪，避免留下 mesh 指向已刪齒輪的破狀態）。
  function deleteGearChain(id) {
    const start = gearById(id);
    if (!start) return;
    pushUndo();
    pause();
    const chain = gearMeshChain(start);
    chain.forEach(g => ownedParamKeys(g).forEach(k => delete S.topo.params[k]));
    const chainIds = new Set(chain.map(g => g.id));
    const rackIds = new Set();
    const rackFramePins = new Set();
    S.comps.forEach(c => {
      if (c.type === 'rack' && chainIds.has(c.pinion)) {
        rackIds.add(c.id);
        (c.framePins || []).forEach(id => rackFramePins.add(id));
        ownedParamKeys(c).forEach(k => delete S.topo.params[k]);
      }
    });
    const ids = new Set(chain.map(g => g.id));
    S.comps = S.comps.filter(c => !ids.has(c.id) && !rackIds.has(c.id) && !(c.type === 'anchor' && rackFramePins.has(c.p1?.id)));
    deselectGear();
    S.selectedNodeId = null;
    closeMobileEditPanel();
    rebuild(); draw();
  }

  // 有限齒條不是無限長齒條：接觸點跑到齒條端部之外時，真實機構就會脫離嚙合。
  // 播放時把 theta 限在接觸點仍落在齒條齒面內的範圍，讓齒條齒輪範例推到端點前反向。
  function rackPinionThetaRange() {
    const racks = S.comps.filter(c => c.type === 'rack' && c.p1?.id && c.pinion);
    if (!racks.length) return null;
    let lo = -Infinity;
    let hi = Infinity;
    let found = false;
    racks.forEach(rack => {
      const pinion = gearById(rack.pinion);
      if (!pinion || !pinion.p1) return;
      const center = pinion.p1;
      const ref = rack.p1;
      const R = Number(S.topo.params[pinion.radiusParam]) || 40;
      const L = rackBodyLength(rack);
      if (!Number.isFinite(R) || R <= 0 || !Number.isFinite(L) || L <= 0) return;
      const axisRad = (Number(rack.axisDeg) || 0) * Math.PI / 180;
      const ux = Math.cos(axisRad);
      const uy = Math.sin(axisRad);
      const contactAtTheta0 = ((Number(center.x) || 0) - (Number(ref.x) || 0)) * ux
        + ((Number(center.y) || 0) - (Number(ref.y) || 0)) * uy;
      const teeth = Math.max(6, Math.round(Number(pinion.teeth) || 12));
      const module = (2 * R) / teeth;
      const pitch = Math.PI * module;
      const usableHalf = Math.max(0, L / 2 - Math.max(pitch, R * 0.15));
      if (usableHalf <= 0) return;
      const sign = rack.sign === -1 ? -1 : 1;
      const a = (contactAtTheta0 - usableHalf) / (sign * R);
      const b = (contactAtTheta0 + usableHalf) / (sign * R);
      const degA = a * 180 / Math.PI;
      const degB = b * 180 / Math.PI;
      lo = Math.max(lo, Math.min(degA, degB));
      hi = Math.min(hi, Math.max(degA, degB));
      if(Array.isArray(rack.framePins)&&rack.framePins.length){
        const slot=ensureRackSlot(rack,L);
        const guideRange=rackGuideThetaRange(R,slot.length,slot.width,sign);
        if(guideRange){ lo=Math.max(lo,guideRange.lo); hi=Math.min(hi,guideRange.hi); }
      }
      found = true;
    });
    if (!found || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
    return { lo, hi };
  }

  return {
    makeGear, addGearPair, addRackPinion,
    gearById, gearMeshChain, syncGearMesh, gearMeshOff,
    selectGear, updateGearEditor, deselectGear,
    rackForGear, toggleRackOrientation, rackLength, rackBodyLength, rackBodyHeight,
    ensureRackSlot, rackFramePinPositions, syncRackFramePins, syncRackFramePinsForGear,
    gearPitchRadius, gearPinRadius, gearDriveState,
    setGearManualAngle, startGearManualRotate, clampGearPinRadius,
    changeGearTeeth, changeGearPinRadius, changeGearPinHoleDiameter, changeGearModule,
    changeRackLength, changeRackBodyHeight, changeRackSlotLength, changeRackSlotWidth,
    deleteGearChain, rackPinionThetaRange
  };
}
