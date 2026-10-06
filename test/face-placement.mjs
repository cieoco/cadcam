import assert from 'node:assert/strict';
import { buildFacePlacement } from '../js/blocks/face-placement.js';
import { realMountExamples } from '../js/blocks/face-mate-examples.js';
import { solveFaceMate, transformMatePoint } from '../js/blocks/face-mate.js';
const { hosts, children } = realMountExamples();
const center = box => Object.fromEntries(['x', 'y', 'z'].map(k => [k, (box.min[k] + box.max[k]) / 2]));
let checked = 0;
for (const host of hosts) for (const hostFace of ['top', 'bottom', 'left', 'right', 'front', 'back']) {
  for (const childFace of ['top', 'bottom', 'left', 'right', 'front', 'back']) for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
    const child = children[0], selection = { hostFace, childFace, quarterTurns, alignU: 1, alignV: -1, offsetU: -8.5, offsetV: 2, gap: 5 };
    const before = JSON.stringify({ host, child, selection });
    const result = buildFacePlacement({ host, child, selection });
    assert.equal(result.ok, true);
    const record = JSON.parse(JSON.stringify(result.record));
    const mate = solveFaceMate({ ...selection, hostBox: host.box, childBox: child.box });
    const hc = center(host.surface.box), cc = center(child.surface.box);
    for (const p of [...child.surface.outline, ...child.surface.holes]) {
      const q = { x: p.x, y: p.y, z: cc.z };
      const expected = transformMatePoint(mate, { x: q.x - cc.x, y: q.y - cc.y, z: q.z - cc.z });
      const actual = transformMatePoint(record.transform, q);
      for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(actual[k] - expected[k] - hc[k]) < 1e-8);
    }
    assert.equal(record.compatibility.status, 'preview-only');
    assert.equal(JSON.stringify({ host, child, selection }), before);
    checked++;
  }
}
assert.equal(buildFacePlacement().ok, false);
assert.equal(buildFacePlacement({ host: hosts[0], child: children[0], selection: { hostFace: 'top', childFace: 'bottom', gap: -1 } }).ok, false);
console.log(`face-placement: ${checked} 姿態的真實輪廓／孔座標、JSON 往返與輸入隔離通過`);
