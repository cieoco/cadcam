import { check, report } from './_harness.mjs';
import { S, fresh, motor, solveAt, ex, cnc } from './_bench-setup.mjs';
import { createBench } from '../js/blocks/bench-ui.js';
import { toSnapshot } from '../js/blocks/schema.js';

const [host, child] = fresh('fourbar-lift', 'gear-gripper');
// 本測試走真正的組立控制器；畫面容器省略，只驗證快取及交易狀態。
const created = [];
globalThis.window={confirm:()=>true}; // This scenario explicitly accepts updating its existing mounting holes.
globalThis.document = {
  getElementById: () => null, addEventListener() {},
  createElement: () => { const el = { dataset: {}, style: {}, listeners: {}, appendChild() {}, remove() {}, setAttribute() {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, querySelector: () => null, querySelectorAll: () => [] }; created.push(el); return el; }
};
globalThis.localStorage = { getItem: () => '1', setItem() {} };   // 舊偏好不再恢復工程入口；候選保存交易另由 face-candidate.mjs 驗收。
S.mode = 'bench'; S.undoStack = [];
S.fabrication = { cnc: { ...cnc }, export: { ...ex } };
let saves = 0, argsCalls = 0;
const snapshot = () => toSnapshot(S.comps, S.topo, S.counter, { modules: S.modules, fabrication: S.fabrication });
const bench = createBench({
  pushUndo: () => S.undoStack.push(JSON.stringify(snapshot())), rebuild() {}, draw() {}, transient() {},
  setViewPlane() {}, motorState: () => motor, snapshotStr: () => JSON.stringify(snapshot()),
  restoreSnapshot: text => { const s = JSON.parse(text); S.comps = s.comps; S.modules = s.modules; },
  getViewer: () => null, scheduleAutosave: () => saves++,
  interferenceArgs: () => { argsCalls++; return { comps: S.comps, modules: S.modules, params: S.topo.params, cnc: S.fabrication.cnc, exportSettings: S.fabrication.export, ranges: {} }; }
});
check('不再提供工程模式入口', !created.some(el=>el.id==='mateAdvanced'));
bench.liveCheck();
const initial = argsCalls;
bench.liveCheck();
check('未改作品時沿用製作計畫', argsCalls === initial);
S.fabrication.cnc.stockThicknessMm = 6;
bench.liveCheck();
check('更改板厚會重建製作計畫', argsCalls === initial + 1);
S.fabrication.export.holeDiameterMm = 4;
bench.liveCheck();
check('更改孔徑也會重建製作計畫', argsCalls === initial + 2);
bench.runTimeline();
check('全行程結果已建立', bench.debug().timeline !== null);
S.fabrication.cnc.stockThicknessMm = 3;
bench.liveCheck();
check('板厚改變會清除舊全行程結果', bench.debug().timeline === null);

const points = solveAt(S.comps, S.modules, S.topo.params).points;
bench.afterScene({ pts: points, ptsAll: points, model: {} });
check('舊接口不能繞過類別直接接合', !bench.pickPort(`${host.id}|edge:ToolBrace_1:R`));
check('選類別前不改作品或保存', !S.modules.find(m=>m.id===child.id).mount&&saves===0&&S.undoStack.length===0);
report('bench-persistence-cache');
