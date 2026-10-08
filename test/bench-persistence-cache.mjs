import { check, report } from './_harness.mjs';
import { S, fresh, motor, solveAt, ex, cnc } from './_bench-setup.mjs';
import { createBench } from '../js/blocks/bench-ui.js';
import { toSnapshot } from '../js/blocks/schema.js';

const [host, child] = fresh('fourbar-lift', 'gear-gripper');
// 本測試走真正的組立控制器；畫面容器省略，只驗證快取及交易狀態。
const created = [];
globalThis.document = {
  getElementById: () => null, addEventListener() {},
  createElement: () => { const el = { dataset: {}, style: {}, listeners: {}, appendChild() {}, remove() {}, setAttribute() {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, querySelector: () => null, querySelectorAll: () => [] }; created.push(el); return el; }
};
globalThis.localStorage = { getItem: () => '1', setItem() {} };   // 這支驗的是工程面板（進階）的預覽／保存流程；預設的接合精靈另有 test/browser/mate-wizard.py
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
// 舊工程控制器仍保留相容能力，但已不讀 localStorage 偏好。明確啟動
// 既有切換 handler；主流程精靈的候選交易由 browser/mate-wizard.py 驗收。
created.find(el => el.id === 'mateAdvanced').listeners.click();
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
bench.select(child.id);
check('建立接法預覽', bench.pickPort(`${host.id}|edge:ToolBrace_1:R`));
check('預覽中的畫面已有 mount', !!S.modules.find(m => m.id === child.id).mount);
check('預覽的保存快照仍未安裝', !bench.autosaveSnapshot().modules.find(m => m.id === child.id).mount);
bench.adjust('slide+');
check('調整預覽也不會進入保存快照', !bench.autosaveSnapshot().modules.find(m => m.id === child.id).mount);
bench.cancel();
check('取消還原未安裝狀態並退出預覽保存', !S.modules.find(m => m.id === child.id).mount && bench.autosaveSnapshot() === null);
bench.pickPort(`${host.id}|edge:ToolBrace_1:R`);
bench.commit();
check('接上觸發保存且退出預覽快照', saves === 1 && bench.autosaveSnapshot() === null && !!S.modules.find(m => m.id === child.id).mount);
report('bench-persistence-cache');
