import assert from 'node:assert/strict';
import { realMountExamples } from '../js/blocks/face-mate-examples.js';
import { buildFacePlacement } from '../js/blocks/face-placement.js';
import { mountFacePlacement } from '../js/blocks/face-mount.js';
import { refreshFaceMounts } from '../js/blocks/face-mount-refresh.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
const { hosts, children } = realMountExamples(), host = hosts[0], child = children[0];
const comps = [...host.instance.comps, ...child.instance.comps], params = { ...host.instance.params, ...child.instance.params };
const selection = { hostFace: 'top', childFace: 'bottom', alignU: 1, alignV: 0, offsetU: 8, offsetV: 0, gap: 5, quarterTurns: 0 };
const record = buildFacePlacement({ host, child, selection }).record;
let modules = [host.instance.module, child.instance.module];
const created = mountFacePlacement(comps, modules, child.surface.moduleId, { hostId: host.surface.moduleId, outputId: host.surface.outputId,
  face: { version: 1, ...record.transform, selection: record.selection, hostThicknessMm: 4, childThicknessMm: 4 } }, params);
modules = modules.map(m => m.id === child.surface.moduleId ? { ...m, mount: created.mount } : m);
// Automatic frames now carry their own 3 mm stock; changing the global fallback
// alone does not edit that board. Exercise an actual explicit frame-thickness edit.
for (const c of comps.filter(c => c.moduleId === child.surface.moduleId))
  for (const key of ['p1', 'p2', 'p3']) if (c[key]?.frameStock) c[key].frameStock.thicknessMm = 6;
const before = JSON.stringify({ comps, modules, params });
const refreshed = refreshFaceMounts(comps, modules, params, { exportSettings: { stockThicknessMm: 6 }, stockMm: 6 });
assert.deepEqual(refreshed.warnings, []);
const face = refreshed.modules.find(m => m.mount?.face).mount.face;
assert.equal(face.childThicknessMm, 6); assert.equal(face.hostThicknessMm, 3);
assert.equal(face.translation.z, 9.5); // 兩板中心距＝1.5＋3＋5（宿主預設板厚 3 mm）。
assert.deepEqual(face.selection, record.selection);
assert.equal(JSON.stringify({ comps, modules, params }), before);
const snapshot = toSnapshot(comps, { params }, 3, { modules: refreshed.modules });
const roundtrip = normalizeSnapshot(decodeShareString(encodeSnapshot(snapshot)));
assert.deepEqual(roundtrip.modules.find(m => m.mount?.face).mount.face, face);
const again = refreshFaceMounts(comps, refreshed.modules, params, { exportSettings: { stockThicknessMm: 6 }, stockMm: 6 });
assert.deepEqual(again.modules, refreshed.modules);
console.log('face-mount-refresh: 板厚修改維持5mm間距、選面保留、不可變、分享往返與冪等通過');
