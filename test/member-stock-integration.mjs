import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { decodeShareString, encodeSnapshot } from '../js/share-codec.js';
import { memberStock, memberStockWarnings, planMemberStock } from '../js/blocks/member-stock.js';
import { createPlateGeometry } from '../js/blocks/plate-geometry.js';
import { inspectPlateExport, inspectLinkExport } from '../js/blocks/exporters.js';
import { gripperTips, planGripper, gripperBuildRecord } from '../js/blocks/gripper-workflow.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { buildSceneModel } from '../js/blocks3d/scene-model.js';

const fixture = () => normalizeSnapshot(getExample('gear-gripper').snapshot);
const original = fixture();
assert.ok(original.comps.every(c => !Object.hasOwn(c, 'stock')), 'legacy snapshots stay sparse');
const oldPlan = planGripper(original.comps, original.params);
assert.ok(oldPlan.ok);
const baseline = JSON.stringify(original);
const s = structuredClone(original);
const stock = { widthMm: 24, thicknessMm: 6, material: 'plywood' };
s.comps.filter(c => c.type === 'triangle').forEach(c => { c.stock = { ...stock }; });
const snapshot = toSnapshot(s.comps, { params: s.params }, s.counter);
const restored = normalizeSnapshot(decodeShareString(encodeSnapshot(snapshot)));
restored.comps.filter(c => c.type === 'triangle').forEach(c => assert.deepEqual(c.stock, stock));
const plan = planGripper(restored.comps, restored.params);
assert.ok(plan.ok);
assert.equal(plan.radius, 12);
assert.ok(Math.abs(plan.closed.theta - oldPlan.closed.theta) > 0.1, 'changed width replans motion');
const topo = compileTopology(restored.comps, { params: restored.params }, new Set());
const sol = solveTopology(topo, { thetaDeg: plan.closed.theta, motorAngles: { [plan.motor]: plan.closed.theta } });
assert.ok(Math.abs(gripperTips(restored.comps, sol.points).gap - plan.width) < 1e-6);
const oldGap = gripperTips(original.comps, sol.points).gap;
assert.ok(Math.abs(oldGap - gripperTips(restored.comps, sol.points).gap - 6) < 1e-9);
const polygons = restored.comps.filter(c => c.type === 'triangle').map(c => ({ points: [c.p1.id, c.p2.id, c.p3.id], shape: c.shape }));
const memberStocks = {}, plateGeometries = {};
for (const comp of restored.comps.filter(c => c.type === 'triangle')) {
  const ids = [comp.p1.id, comp.p2.id, comp.p3.id], key = ids.join(',');
  const world = ids.map(id => sol.points[id]);
  const geometry = createPlateGeometry(comp, world, { holeRadius: 3.6 });
  assert.deepEqual(inspectPlateExport(comp, world, { barWidthMm: 40, holeDiameterMm: 7.2 }), geometry);
  assert.deepEqual(geometry.holes.map(h => h.r), [3.6, 3.6, 3.6]);
  plateGeometries[key] = { outline: geometry.outlines[0], holes: geometry.holes };
  memberStocks[key] = memberStock(comp);
}
const model = buildSceneModel([], sol.points, { polygons, memberStocks, plateGeometries });
assert.equal(model.plateGap, 8);
const anchored = buildSceneModel([], sol.points, { polygons, memberStocks, plateGeometries,
  groundIds: new Set(polygons.map(p => p.points[0])) });
for (const plate of anchored.plates) for (const p of plate.outline) {
  assert.ok(Math.abs(p.x - anchored.focus.x) <= anchored.span / 2 + 1e-9);
  assert.ok(Math.abs(p.y - anchored.focus.y) <= anchored.span / 2 + 1e-9, 'camera includes the extended jaw tip');
}
for (const plate of model.plates) {
  assert.equal(plate.thickness, 6);
  assert.equal(plate.r, 12);
  assert.equal(plate.material, 'plywood');
  assert.deepEqual(plate.outline, plateGeometries[plate.ids.join(',')].outline);
  for (const id of plate.ids) assert.ok(model.pins.find(pin => pin.id === id).z1 >= plate.z + 6);
}
const bar = { type: 'bar', id: 'Link1', fixedLen: true, snapLength: false, lenParam: 'L', p1: { id: 'A', x: 0, y: 0 }, p2: { id: 'B', x: 80, y: 0 }, stock };
const barSaved = normalizeSnapshot(toSnapshot([bar], { params: { L: 80 } }, 1));
assert.deepEqual(barSaved.comps[0].stock, stock);
const linkGeom = inspectLinkExport(bar, 80, { barWidthMm: 40, holeDiameterMm: 7.2 });
const barScene = buildSceneModel([{ id: bar.id, p1: 'A', p2: 'B' }], { A: bar.p1, B: bar.p2 }, {
  memberStocks: { Link1: stock }, barGeometries: { Link1: { outline: linkGeom.outlines[0], holes: linkGeom.holes } }
});
assert.equal(barScene.sticks[0].thickness, 6);
assert.equal(barScene.sticks[0].r, 12);
assert.deepEqual(barScene.sticks[0].outline, linkGeom.outlines[0]);
assert.equal(Math.max(...linkGeom.outlines[0].map(p => p.y)), 12);
const record = gripperBuildRecord(plan, snapshot);
assert.ok(record.includes('夾板・板寬 24 mm・厚度 6 mm'));
assert.ok(record.includes('尚未驗證強度'));
s.comps.find(c => c.id === 'RightJaw').stock.widthMm = 18;
assert.equal(planGripper(s.comps, s.params).ok, false, 'asymmetric width cannot claim symmetric plan');
assert.equal(JSON.stringify(original), baseline, 'read paths never mutate source');
assert.equal(memberStockWarnings([bar], { holeDiameterMm: 24 }).length, 1);
assert.equal(memberStockWarnings([bar], { holeDiameterMm: 7.2 }).length, 0);
assert.equal(memberStockWarnings([{ ...bar, isInput: true, motorType: 'tt' }], { holeDiameterMm: 7.2, ttShaftFlatDiameterMm: 24 }).length, 1);
assert.equal(planMemberStock(bar, 'widthMm', 10.54, { holeDiameterMm: 10.04 }).ok, false, 'rounding cannot violate the hole margin');
console.log('member stock integration: save/share, width-based gap, geometry/export/3D, pins and record passed');
