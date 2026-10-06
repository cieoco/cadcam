import assert from 'node:assert/strict';
import { realMountExamples } from '../js/blocks/face-mate-examples.js';
import { solveFaceMate, transformMatePoint } from '../js/blocks/face-mate.js';

const examples = realMountExamples();
const lift = examples.hosts[0], rack = examples.hosts[1], grip = examples.children[0];
assert.equal(lift.surface.body.kind, 'bar');
assert.equal(rack.surface.body.kind, 'rack');
assert.equal(grip.surface.kind, 'frame');
assert.equal(lift.box.max.x - lift.box.min.x, 98); // 80 mm 工具架＋兩端各 9 mm 板邊。
assert.equal(lift.box.max.y - lift.box.min.y, 18);
assert.equal(lift.box.max.z - lift.box.min.z, 4);
assert.equal(rack.box.max.z - rack.box.min.z, 4); // 原型以 3D 參考板厚明確傳入。
assert.ok(rack.cutouts.length > 0);
assert.ok(grip.holes.length > 0);
assert.notEqual(lift.instance.module.id, grip.instance.module.id);
for (const host of examples.hosts) {
  const mate = solveFaceMate({ hostBox: host.box, childBox: grip.box, hostFace: 'top', childFace: 'bottom', gap: 5 });
  assert.ok(mate.ok);
  const p = transformMatePoint(mate, mate.child.center);
  assert.equal(p.z, host.box.max.z + 5);
}
lift.box.max.x = 999;
assert.equal(realMountExamples().hosts[0].box.max.x, 49);
console.log('face-mate-examples: 真實工具架／滑台／底座、參考板厚、孔槽、接合與範例隔離通過');
