import { createModuleEditor } from '../js/blocks/module-editor.js?v=20261007_import_spacing';
import { S } from '../js/blocks/state.js';
import { createBench } from '../js/blocks/bench-ui.js?v=face-wizard-20261007_mobile';
import { realMountExamples } from '../js/blocks/face-mate-examples.js';
import { compileAssembly, solveAssembly } from '../js/blocks/assembly.js?v=face-mount-20261007';
import { toSnapshot, normalizeSnapshot } from '../js/blocks/schema.js?v=face-mount-20261007';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
import { compileTopology } from '../js/core/topology.js';
import { buildSceneModel } from '../js/blocks3d/scene-model.js';
import { planeInputs, attachModulePlates, buildOrthogonalChildren } from '../js/blocks3d/orthogonal-3d.js?v=face-mount-20261007';
import { mountedFramePlates } from '../js/blocks/assembly.js?v=face-mount-20261007';
import { buildPreviewModelInputs } from '../js/blocks/preview-model-inputs.js';
import { memberStock } from '../js/blocks/member-stock.js';
const examples = realMountExamples();
const result = document.getElementById('result');
const snapshot = () => JSON.stringify(toSnapshot(S.comps, S.topo, S.counter, { modules: S.modules }));
const restore = text => { const n = normalizeSnapshot(JSON.parse(text)); S.comps = n.comps; S.modules = n.modules; S.topo.params = n.params; S.counter = n.counter; return n.warnings; };
const draw = () => {
  const sol = solveAssembly(compileAssembly(S.comps, S.modules, S.topo), { thetaDeg: 0 });
  result.textContent = JSON.stringify({ valid: sol.isValid, undo: S.undoStack.length, face: S.modules.find(m => m.mount?.face)?.mount.face || null }, null, 2);
  if (viewer) render3d(sol.points);
};
let viewer = null;
function render3d(points) {
  const compiled = compileTopology(S.comps, S.topo, new Set());
  const inputs = buildPreviewModelInputs({ comps: S.comps, params: S.topo.params, theta: 0, points,
    links: compiled.visualization.links, polygons: compiled.visualization.polygons || [], groundIds: new Set(), motorCenterIds: new Set(), motorTypes: {}, motorMounts: [],
    sliderTravelStart: c => c.travelStart || 0, sliderTravelEnd: c => c.travelEnd || 100, sliderBodyLength: c => c.bodyLen || 60,
    rackBodyHeight: c => c.bodyHeight || 20, rackPhaseShift: () => 0, pulleyRadius: () => 32, pulleyPinRadius: () => 20 });
  const stocks = Object.fromEntries(S.comps.filter(c => ['bar', 'triangle'].includes(c.type)).map(c => [c.id, memberStock(c)]));
  const buildModel = i => buildSceneModel(i.links, i.pts, { ...i, memberStocks: stocks });
  const plates = mountedFramePlates(S.comps, S.modules, points, S.topo.params, { stockMm: 3 });
  const model = buildModel(planeInputs(inputs, S.comps, S.modules, null)); attachModulePlates(model, S.comps, plates);
  model.orthogonal = buildOrthogonalChildren({ comps: S.comps, modules: S.modules, inputs, mainModel: model, buildModel, plates, params: S.topo.params });
  viewer.update(model);
}
document.getElementById('preview3d').onclick = async () => {
  document.getElementById('view3d').hidden = false;
  if (!viewer) { const { createViewer } = await import('../js/blocks3d/viewer.js?v=20261007_import_spacing'); viewer = createViewer(document.getElementById('view3d')); }
  draw(); viewer.resize(); viewer.tiltView();
};
const bench = createBench({ pushUndo: () => S.undoStack.push(snapshot()), rebuild: draw, draw, transient: text => result.textContent += '\n' + text,
  setViewPlane: () => {}, motorState: () => ({ theta: 0, motorAngles: {} }), snapshotStr: snapshot,
  restoreSnapshot: text => restore(text), getViewer: () => null, is3DActive: () => false, set3D: async () => {}, push3D: () => {},
  interferenceArgs: () => ({}), setMotorAngles: () => {} });
function load(index) {
  const host = examples.hosts[index].instance, child = examples.children[0].instance;
  S.comps = structuredClone([...host.comps, ...child.comps]); S.modules = structuredClone([host.module, child.module]);
  S.topo = { params: { ...host.params, ...child.params } }; S.counter = 3; S.undoStack = []; S.mode = 'bench';
  restore(snapshot());
  bench.syncUI(true); bench.select(child.module.id); draw();
}
document.getElementById('lift').onclick = () => load(0);
document.getElementById('rack').onclick = () => load(1);
document.getElementById('undo').onclick = () => { if (S.undoStack.length) restore(S.undoStack.pop()); bench.syncUI(true); draw(); };
document.getElementById('roundtrip').onclick = () => { const before = snapshot(); restore(JSON.stringify(decodeShareString(encodeSnapshot(JSON.parse(before))))); bench.syncUI(true); draw(); result.textContent += '\n分享往返：' + (before === snapshot() ? 'PASS' : 'FAIL'); };
load(0);

// 實際使用模組庫控制器，驗收匯入不自動接合且左右並列。
document.getElementById('imports').onclick = () => {
  S.comps = []; S.modules = []; S.topo.params = {}; S.counter = 0; S.undoStack = [];
  const quiet = () => {};
  const editor = createModuleEditor({ pushUndo: () => S.undoStack.push(snapshot()), rebuild: quiet, draw: quiet, transient: quiet,
    downloadJson: quiet, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: quiet });
  editor.insertBuiltin('rack-lift'); editor.insertBuiltin('gear-gripper');
  bench.syncUI(true); bench.select(S.modules[0].id); draw();
};
