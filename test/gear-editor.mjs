// 齒輪 / 齒條域（gear-editor.js）驗收：成對建立、嚙合同步、整鏈改模數、
// 有限齒條 theta 範圍、整鏈刪除與參數清理。DOM 以極簡假件替身。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor() { this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
}
const els = new Map();
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: () => new FakeElement()
};

const { S } = await import('../js/blocks/state.js');
const Model = await import('../js/blocks/model.js');
const { createGearEditor, GEAR_MODULE } = await import('../js/blocks/gear-editor.js');

const noop = () => {};
const editor = createGearEditor({
  pushUndo: noop, pause: noop, rebuild: noop, draw: noop, renderFrame: noop,
  transient: noop, scheduleAutosave: noop, cancelMotorMode: noop, exitDrawTools: noop,
  openMobileEditPanel: noop, closeMobileEditPanel: noop, hideEditorPanels: noop,
  snapshotStr: () => '', updateUndoBtn: noop, recordManualTrace: noop,
  worldFromEvent: () => null, mobilePrompt: () => false,
  pointCoords: () => Model.pointCoords(S.comps),
  updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y),
  pointIsGround: id => Model.pointIsGround(S.comps, id)
});

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const gears = () => S.comps.filter(c => c.type === 'gear');
const tangent = (a, b) => {
  const D = S.topo.params[a.radiusParam] + S.topo.params[b.radiusParam];
  return Math.abs(dist(Model.pointCoords(S.comps)[a.p1.id], Model.pointCoords(S.comps)[b.p1.id]) - D) < 1e-6;
};

// ---- 成對齒輪：建立即相切、預設 12:18 ----
editor.addGearPair();
let [driver, driven] = gears();
check('齒輪成對建立且從動輪嚙合驅動輪', gears().length === 2 && driven.mesh === driver.id);
check('節圓半徑參數 = teeth·module/2', S.topo.params[driver.radiusParam] === 12 * GEAR_MODULE / 2 && S.topo.params[driven.radiusParam] === 18 * GEAR_MODULE / 2);
check('兩輪中心距 = 兩節圓半徑和（相切）', tangent(driver, driven));
check('放下即選取從動輪', S.selectedGearId === driven.id);

// ---- 改齒數 / 模數：半徑同步且保持嚙合 ----
editor.changeGearTeeth(2);
check('改齒數後半徑參數同步且仍相切', driven.teeth === 20 && S.topo.params[driven.radiusParam] === 20 * GEAR_MODULE / 2 && tangent(driver, driven));
editor.changeGearModule(1);
check('改模數整鏈共用且仍相切', driver.module === GEAR_MODULE + 1 && driven.module === GEAR_MODULE + 1 && tangent(driver, driven));
const state = editor.gearDriveState(driven);
check('傳動比 = −(驅動節圓半徑/從動節圓半徑)', state && Math.abs(state.factor + S.topo.params[driver.radiusParam] / S.topo.params[driven.radiusParam]) < 1e-9);

// ---- 嚙合防呆：兩中心都接地但距離錯 → 紅環警告 ----
driver.p1.type = 'fixed';
driven.p1.type = 'fixed';
Model.updatePointCoordsById(S.comps, driven.p1.id, driver.p1.x + 30, driver.p1.y); // 拉到錯誤中心距
check('接地且中心距錯誤時偵測脫嚙', editor.gearMeshOff(driven) === true);

// ---- 整鏈刪除：齒輪與參數一起清 ----
editor.deleteGearChain(driver.id);
check('整鏈刪除清空齒輪與參數', gears().length === 0 && !Object.keys(S.topo.params).some(k => /^G(R|PR)/.test(k)));

// ---- 齒條齒輪：建立、行程範圍、刪除連齒條與導銷 ----
editor.addRackPinion();
const pinion = gears()[0];
const rack = S.comps.find(c => c.type === 'rack');
check('齒條組建立：小齒輪＋齒條＋兩導銷', !!pinion && !!rack && rack.pinion === pinion.id && S.comps.filter(c => c.type === 'anchor').length === 2);
const range = editor.rackPinionThetaRange();
check('有限齒條回傳有限 theta 範圍', !!range && Number.isFinite(range.lo) && Number.isFinite(range.hi) && range.lo < range.hi);
const lenBefore = S.topo.params[rack.lenParam];
editor.changeRackLength(8);
check('齒條長度 +8 並保持 8mm 對齊', S.topo.params[rack.lenParam] === lenBefore + 8 && S.topo.params[rack.lenParam] % 8 === 0);
editor.deleteGearChain(pinion.id);
check('刪小齒輪連齒條與導銷一起刪', S.comps.length === 0 && !Object.keys(S.topo.params).some(k => /^(G|RK)/.test(k)));

// ---- 面板：取消選取隱藏編輯器 ----
editor.deselectGear();
check('取消選取後齒輪面板隱藏', S.selectedGearId === null && document.getElementById('gearEditor').style.display === 'none');

report('gear-editor');
