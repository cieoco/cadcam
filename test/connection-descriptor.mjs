// W3a: persisted endpoints, independent of defaults and optional fasteners.
import assert from 'node:assert/strict';
import { buildMountSurfaces } from '../js/blocks/mount-surfaces.js';
import { buildFacePlacement } from '../js/blocks/face-placement.js';
import { mountFacePlacement } from '../js/blocks/face-mount.js';
import { refreshFaceMounts } from '../js/blocks/face-mount-refresh.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
import { faceBracketPlan } from '../js/blocks/face-bracket-extras.js';
import { compileAssembly, solveAssembly, orthogonalFrame } from '../js/blocks/assembly.js';
import { buildOrthogonalChildren, orthogonalMatrix } from '../js/blocks3d/orthogonal-3d.js';
import { realMountExamples } from '../js/blocks/face-mate-examples.js';

const clone = structuredClone;
const fixed = (id, x) => ({ id, type: 'fixed', x, y: 0 });
const bar = (id, moduleId, length) => ({ id, moduleId, type: 'bar', p1: fixed(`${id}a`, 0), p2: fixed(`${id}b`, length),
  lenParam: `${id}L`, snapLength: false, stock: { widthMm: 18, thicknessMm: 4, material: 'plywood' } });
const comps = [bar('H', 'Host', 80), bar('C', 'Child', 40),
  { id: 'Extra', moduleId: 'Child', type: 'anchor', p1: fixed('extra', 100) }];
const params = { HL: 80, CL: 40 };
let modules = [
  { id: 'Host', name: '宿主', base: 'Ha', outputs: [{ id: 'out', at: 'Ha', body: { kind: 'bar', id: 'H' } }], mount: null,
    mates: { attach: { normalDeg: 0 }, receive: [{ id: 'one', name: '上緣', ref: { kind: 'bar', id: 'H', side: 1 } }, { id: 'two', name: '下緣', ref: { kind: 'bar', id: 'H', side: -1 } }] } },
  { id: 'Child', name: '子模組', base: 'Ca', outputs: [], mount: null, faceParts: { part: 'C', face: 'bottom' } }
];
const opts = { exportSettings: { stockThicknessMm: 4 }, stockMm: 4 };
const surfaces = (moduleId, partId) => buildMountSurfaces({ comps, modules, params, moduleId, partId,
  exportSettings: opts.exportSettings, thicknessMm: 4 }).surfaces;
const reference = surface => {
  const axes = ['x', 'y', 'z'], center = Object.fromEntries(axes.map(k => [k, (surface.box.min[k] + surface.box.max[k]) / 2]));
  return { surface, box: Object.fromEntries(['min', 'max'].map(end => [end, Object.fromEntries(axes.map(k => [k, surface.box[end][k] - center[k]]))])) };
};
const host = reference(surfaces('Host').find(s => s.kind === 'output'));
const child = reference(surfaces('Child', 'C').find(s => s.compId === 'C'));
const selection = { hostFace: 'top', childFace: 'bottom', alignU: 1, alignV: 0, offsetU: 5, offsetV: 0, gap: 0, quarterTurns: 0 };
const record = buildFacePlacement({ host, child, selection }).record;
const created = mountFacePlacement(comps, modules, 'Child', { hostId: 'Host', outputId: 'out',
  face: { version: 1, ...record.transform, selection: record.selection, childPart: 'C', hostThicknessMm: 4, childThicknessMm: 4 } }, params);
assert.equal(created.ok, true);
assert.deepEqual(created.mount.face.translation, { x: 45, y: 0, z: 4 });
modules = modules.map(m => m.id === 'Child' ? { ...m, mount: created.mount, faceParts: { part: 'frame', face: 'left' } } : m);
const refreshed = refreshFaceMounts(comps, modules, params, opts);
assert.deepEqual(refreshed.modules[1].mount.face.translation, { x: 45, y: 0, z: 4 }, '固定桿 C 的接合不得因改預選或 refresh 改接整片 frame（原反例 x=-15）');
assert.equal(created.mount.face.childPart, 'C');

const { readConnectionDescriptor } = await import('../js/blocks/connection-descriptor.js');
const read = (list = modules, listComps = comps) => readConnectionDescriptor({ comps: listComps, modules: list, childId: 'Child' });
const before = JSON.stringify({ comps, modules, params });
const descriptor = read();
assert.equal(descriptor.ok, true);
assert.deepEqual([descriptor.host.partId, descriptor.host.face, descriptor.child.partId, descriptor.child.face], ['H', 'top', 'C', 'bottom']);
const snap = toSnapshot(comps, { params }, 0, { modules });
for (const saved of [JSON.parse(JSON.stringify(snap)), decodeShareString(encodeSnapshot(snap))]) {
  const reopened = normalizeSnapshot(saved);
  assert.equal(reopened.modules[1].mount.face.childPart, 'C');
  assert.deepEqual(reopened.modules[0].mates, modules[0].mates);
  assert.deepEqual(readConnectionDescriptor({ ...reopened, childId: 'Child' }), descriptor);
}
const grown = refreshFaceMounts(comps, modules, { ...params, CL: 48 }, opts);
assert.deepEqual(grown.warnings, []);
assert.equal(grown.modules[1].mount.face.childPart, 'C');
assert.equal(grown.modules[1].mount.face.selection.childFace, 'bottom');
assert.equal(grown.modules[1].mount.face.translation.x, 37);
assert.deepEqual(refreshFaceMounts(comps, grown.modules, { ...params, CL: 48 }, opts).modules, grown.modules);

const ambiguous = clone(modules); delete ambiguous[1].mount.face.childPart;
const legacyBefore = JSON.stringify(ambiguous);
assert.equal(read(ambiguous).child.reason.code, 'legacy_child_endpoint_ambiguous');
const retained = refreshFaceMounts(comps, ambiguous, params, opts);
assert.deepEqual(retained.modules, ambiguous);
assert.ok(retained.diagnostics.some(d => d.code === 'legacy_child_endpoint_ambiguous'));
assert.ok(retained.warnings.some(w => w.includes('重新選')));
assert.equal(JSON.stringify(ambiguous), legacyBefore);
const legacyBracket = clone(ambiguous);
legacyBracket[1].mount.face.selection.brackets = { enabled: true, childPart: 'C', offsets: { L1: 0, R1: 0, L2: 0 } };
assert.equal(read(legacyBracket).child.partId, 'C');
assert.equal(read(legacyBracket).child.source.kind, 'legacy-bracket');
assert.equal(refreshFaceMounts(comps, legacyBracket, params, opts).modules[1].mount.face.childPart, undefined, '相容讀取不靜默遷移舊資料');
const conflict = clone(modules);
conflict[1].mount.face.selection.brackets = { enabled: true, childPart: 'frame', offsets: {} };
assert.equal(read(conflict).child.partId, 'C');
assert.equal(read(conflict).fastener.childPart, 'frame', '讀取不得改寫來源五金');
assert.equal(faceBracketPlan(comps, conflict, params, conflict[1], opts).child.compId, 'C', '開孔端點以獨立 childPart 為準');
const removed = comps.filter(c => c.id !== 'C');
assert.equal(read(modules, removed).child.reason.code, 'child_part_missing');
assert.deepEqual(refreshFaceMounts(removed, modules, params, opts).modules, modules);
const missingChildSaved = normalizeSnapshot(toSnapshot(removed, { params }, 0, { modules }));
const missingChildRefreshed = refreshFaceMounts(missingChildSaved.comps, missingChildSaved.modules, missingChildSaved.params, opts);
assert.deepEqual(toSnapshot(missingChildSaved.comps, { params }, 0, { modules: missingChildRefreshed.modules }).modules[1].mount, modules[1].mount);
const missingHost = clone(modules); missingHost[0].outputs = [];
const missingRoundtrip = normalizeSnapshot(toSnapshot(comps, { params }, 0, { modules: missingHost }));
assert.deepEqual(missingRoundtrip.modules[1].mount, modules[1].mount);
assert.equal(read(missingRoundtrip.modules).host.reason.code, 'host_output_missing');
const missingRefreshed = refreshFaceMounts(missingRoundtrip.comps, missingRoundtrip.modules, params, opts);
assert.deepEqual(toSnapshot(missingRoundtrip.comps, { params }, 0, { modules: missingRefreshed.modules }).modules[1].mount, modules[1].mount);
const missingModule = normalizeSnapshot(toSnapshot(comps.filter(c => c.moduleId !== 'Host'), { params }, 0, { modules: modules.filter(m => m.id !== 'Host') }));
assert.equal(readConnectionDescriptor({ ...missingModule, childId: 'Child' }).host.reason.code, 'host_module_missing');
assert.deepEqual(refreshFaceMounts(missingModule.comps, missingModule.modules, params, opts).modules[0].mount, modules[1].mount);
assert.equal(normalizeSnapshot(toSnapshot(comps, { params }, 0, { modules: ambiguous })).modules[1].mount.face.childPart, undefined);
for (const badChild of ['', '../C', 0, {}]) {
  const invalid = clone(modules); invalid[1].mount.face.childPart = badChild;
  assert.equal(normalizeSnapshot(toSnapshot(comps, { params }, 0, { modules: invalid })).modules[1].mount, null);
}

const second = { ...clone(modules[1]), id: 'Child2', base: 'C2a', mount: { ...clone(created.mount), face: { ...clone(created.mount.face), childPart: 'C2', selection: { ...selection, childFace: 'top', offsetU: -20 } } } };
const doubleComps = [...comps, bar('C2', 'Child2', 32)];
const doubleModules = [...modules, second];
assert.deepEqual(['Child', 'Child2'].map(childId => {
  const d = readConnectionDescriptor({ comps: doubleComps, modules: doubleModules, childId });
  return [d.host.partId, d.child.partId, d.child.face, d.placement.selection.offsetU];
}), [['H', 'C', 'bottom', 5], ['H', 'C2', 'top', -20]]);
const frameHost = clone(modules); frameHost[1].mount.to = { module: 'Host', frame: { edge: 6 } };
const frameSaved = normalizeSnapshot(toSnapshot(comps, { params }, 0, { modules: frameHost }));
assert.deepEqual(frameSaved.modules[1].mount.to, frameHost[1].mount.to);
assert.equal(read(frameSaved.modules).host.partId, 'frame');
assert.equal(read(frameSaved.modules).capabilities.refresh, true);
assert.ok(!read(frameSaved.modules).diagnostics.some(d => d.code === 'host_frame_not_supported'));
assert.deepEqual(refreshFaceMounts(comps, frameSaved.modules, params, opts).modules[1].mount.to, frameSaved.modules[1].mount.to);
for (const edge of [-1, 1.5, '6']) {
  const invalid = clone(frameHost); invalid[1].mount.to.frame.edge = edge;
  assert.equal(normalizeSnapshot(toSnapshot(comps, { params }, 0, { modules: invalid })).modules[1].mount, null);
}
// A fixed bar at z=8 must use its own center (10), not the frame center (-2).
const asm = compileAssembly(comps, modules, { params }), points = solveAssembly(asm, { thetaDeg: 0 }).points;
const frame = orthogonalFrame(comps, modules, 'Child', points, params);
const scene = buildOrthogonalChildren({ comps, modules, inputs: { pts: points }, params,
  mainModel: { sticks: [{ id: 'H', z: 12 }] }, plates: [{ moduleId: 'Child', plane: 'Child', thicknessMm: 4 }],
  buildModel: () => ({ sticks: [{ id: 'C', z: 8 }, { id: 'Extra', z: 0 }] }) });
assert.deepEqual(scene[0].matrix, orthogonalMatrix(frame, 14, -10));
const legacyAsm = compileAssembly(comps, ambiguous, { params }), legacyPoints = solveAssembly(legacyAsm, { thetaDeg: 0 }).points;
const legacyFrame = orthogonalFrame(comps, ambiguous, 'Child', legacyPoints, params);
const legacyScene = buildOrthogonalChildren({ comps, modules: ambiguous, inputs: { pts: legacyPoints }, params,
  mainModel: { sticks: [{ id: 'H', z: 12 }] }, plates: [{ moduleId: 'Child', plane: 'Child', thicknessMm: 4 }],
  buildModel: () => ({ sticks: [{ id: 'C', z: 8 }, { id: 'Extra', z: 0 }] }) });
assert.equal(legacyScene.length, 1, '歧義舊接合仍保留原子場景');
assert.equal(legacyScene[0].model.sticks[0].id, 'C');
assert.deepEqual(legacyScene[0].matrix, orthogonalMatrix(legacyFrame, 14, 2), '保留舊顯示底板 anchor，但不是已解析端點');
assert.deepEqual(legacyScene[0].displayAnchor, { kind: 'legacy-frame', resolvedEndpoint: false });
assert.ok(legacyScene[0].diagnostics.some(d => d.code === 'legacy_child_endpoint_ambiguous'));
assert.equal(read(ambiguous).child.partId, null); assert.equal(JSON.stringify(ambiguous), legacyBefore);

// F1 uses the existing builtin fourbar + gear-gripper geometry, no attachment.
const examples = realMountExamples(), f1host = examples.hosts[0], f1child = examples.children[0];
const f1comps = [...f1host.instance.comps, ...f1child.instance.comps];
const f1params = { ...f1host.instance.params, ...f1child.instance.params };
let f1modules = [f1host.instance.module, f1child.instance.module];
const f1record = buildFacePlacement({ host: f1host, child: f1child, selection: { ...selection, hostFace: 'front', childFace: 'back', alignU: 0, offsetU: 0 } }).record;
const f1mount = mountFacePlacement(f1comps, f1modules, f1child.surface.moduleId, { hostId: f1host.surface.moduleId, outputId: f1host.surface.outputId,
  face: { version: 1, childPart: 'frame', ...f1record.transform, selection: f1record.selection, hostThicknessMm: 4, childThicknessMm: 4 } }, f1params);
assert.equal(f1mount.ok, true);
f1modules = f1modules.map(m => m.id === f1child.surface.moduleId ? { ...m, mount: f1mount.mount, faceParts: { part: 'frame', face: 'top' } } : m);
const f1saved = normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(f1comps, { params: f1params }, 0, { modules: f1modules }))));
const f1descriptor = readConnectionDescriptor({ ...f1saved, childId: f1child.surface.moduleId });
assert.equal(f1descriptor.ok, true); assert.equal(f1descriptor.child.face, 'back');
assert.equal(refreshFaceMounts(f1saved.comps, f1saved.modules, f1saved.params, opts).modules.find(m => m.id === f1child.surface.moduleId).mount.face.childPart, 'frame');
assert.equal(JSON.stringify({ comps, modules, params }), before);
console.log('connection-descriptor: explicit endpoints, x45 counterexample, round-trip, defaults, refresh, siblings and immutable legacy diagnostics passed');
