import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
import { planGripper, gripperBuildRecord } from '../js/blocks/gripper-workflow.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { DEFAULT_PLATE_RADIUS_WORLD, jawCenterline } from '../js/blocks/plate-geometry.js';

const fixture = () => {
  const s = normalizeSnapshot(getExample('gear-gripper').snapshot);
  Object.assign(s.params, { gripperWorkflow: 1, gripperObjectWidth: 50, gripperClearance: 10 });
  return s;
};
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

test('A1: actual solver reaches 50 / 70 mm without mutating source', () => {
  const s = fixture(), before = JSON.stringify(s);
  const p = planGripper(s.comps, s.params);
  assert.equal(p.ok, true, p.message);
  near(p.closed.gap, 50); near(p.open.gap, 70);
  assert.ok(p.range.lo < p.range.hi);
  assert.equal(JSON.stringify(s), before);
});

test('A1: independent fine sweep is finite, mirrored and monotonically closes', () => {
  for (const [width, clearance] of [[10, 2], [50, 10], [85, 20], [120, 2], [80.5, 4.5]]) {
    const s = fixture();
    Object.assign(s.params, { gripperObjectWidth: width, gripperClearance: clearance });
    const p = planGripper(s.comps, s.params);
    assert.equal(p.ok, true, p.message);
    const compiled = compileTopology(s.comps, { params: { ...s.params } }, new Set());
    let previous = Infinity;
    for (let i = 0; i <= 100; i++) {
      const theta = p.range.lo + (p.range.hi - p.range.lo) * i / 100;
      const sol = solveTopology(compiled, { thetaDeg: theta, motorAngles: { [p.motor]: theta } });
      const l = jawCenterline([sol.points.GCA, sol.points.GPA, sol.points.LT], 1).at(-1);
      const r = jawCenterline([sol.points.GCB, sol.points.GPB, sol.points.RT], -1).at(-1);
      for (const value of [l.x, l.y, r.x, r.y]) assert.ok(Number.isFinite(value));
      near(l.y, r.y); near(l.x, -r.x);
      const gap = r.x - l.x - 2 * DEFAULT_PLATE_RADIUS_WORLD;
      assert.ok(gap <= previous + 1e-6);
      assert.ok(gap >= width - 1e-6 && gap <= width + 2 * clearance + 1e-6);
      previous = gap;
    }
  }
});

test('M3/M4: changing both jaw tips replans real geometry and survives save', () => {
  const s = fixture();
  const original = planGripper(s.comps, s.params);
  for (const tipLength of [40, 70, 90]) {
    for (const c of s.comps.filter(c => c.shape === 'jaw')) c.jawTipLength = tipLength;
    const restored = normalizeSnapshot(toSnapshot(s.comps, { params: s.params }));
    const p = planGripper(restored.comps, restored.params);
    assert.equal(p.ok, true, p.message);
    assert.ok(Math.abs(p.closed.theta - original.closed.theta) > 0.01);
    const topo = compileTopology(restored.comps, { params: restored.params }, new Set());
    for (const [pose, expected] of [[p.open, 70], [p.closed, 50]]) {
      const sol = solveTopology(topo, { thetaDeg: pose.theta, motorAngles: { [p.motor]: pose.theta } });
      const l = jawCenterline([sol.points.GCA, sol.points.GPA, sol.points.LT], 1, tipLength).at(-1);
      const r = jawCenterline([sol.points.GCB, sol.points.GPB, sol.points.RT], -1, tipLength).at(-1);
      near(r.x - l.x - 18, expected); near(l.y, r.y);
    }
  }
});

test('M3: one-sided jaw-tip edits cannot claim a symmetric task plan', () => {
  const s = fixture();
  s.comps.find(c => c.id === 'LeftJaw').jawTipLength = 70;
  const before = JSON.stringify(s);
  assert.equal(planGripper(s.comps, s.params).ok, false);
  assert.equal(JSON.stringify(s), before);
});

test('A3: rejects malformed and out-of-range task dimensions', () => {
  for (const key of ['gripperObjectWidth', 'gripperClearance']) {
    for (const value of [undefined, null, '', 'abc', NaN, Infinity, -1, 0, 1, 999]) {
      const s = fixture(); s.params[key] = value;
      const result = planGripper(s.comps, s.params);
      assert.equal(result.ok, false, `${key}=${value}`);
      assert.ok(result.message.length);
    }
  }
});

test('A3: valid dimensions can still be unreachable', () => {
  const s = fixture(); Object.assign(s.params, { LJ_tip: 30, LJ_edge: 40, RJ_tip: 30, RJ_edge: 40, gripperObjectWidth: 150, gripperClearance: 40 });
  assert.equal(planGripper(s.comps, s.params).ok, false);
});

test('R1b: old outward jaws remain intact and receive a clear upgrade message', () => {
  const s = fixture(); s.comps[2].jawTurnSign = -1; s.comps[3].jawTurnSign = 1;
  const before = JSON.stringify(s), p = planGripper(s.comps, s.params);
  assert.equal(p.ok, false); assert.ok(p.message.includes('舊版'));
  assert.equal(JSON.stringify(s), before);
});

test('A3: modified topology / body geometry never silently returns a successful plan', () => {
  const edits = [
    s => s.comps.pop(),
    s => s.comps.push({ type: 'anchor', id: 'Extra', p1: { id: 'ExtraP', type: 'fixed', x: 0, y: 0 } }),
    s => s.comps[1].mesh = '',
    s => s.comps[0].p1.physicalMotor = '',
    s => s.comps[1].p1.physicalMotor = '2',
    s => s.comps[1].teeth = 16,
    s => s.comps[1].p1.x = 50,
    s => s.comps[2].shapeMode = 'hull',
    s => s.comps[2].jawTurnSign = -1,
    s => s.comps[2].vertices.push({ solve: false, u: 2, v: 2 }),
    s => s.params.GRA = 50,
    s => s.params.LJ_tip = 10,
    s => s.params.RJ_edge = 110,
  ];
  for (const edit of edits) {
    const s = fixture(); edit(s); const before = JSON.stringify(s);
    assert.equal(planGripper(s.comps, s.params).ok, false, edit.toString());
    assert.equal(JSON.stringify(s), before);
  }
});

test('A4: non-default motor id still receives planned input', () => {
  const s = fixture();
  s.comps[0].p1.physicalMotor = s.comps[2].p1.physicalMotor = '3';
  const p = planGripper(s.comps, s.params);
  assert.equal(p.ok, true, p.message); assert.equal(p.motor, '3'); near(p.closed.gap, 50);
});

test('A4: normal save, normalize and share preserve task and reproducible plan', () => {
  const s = fixture(); s.params.gripperObjectWidth = 80.5;
  const saved = toSnapshot(s.comps, { params: s.params }, s.counter);
  const restored = normalizeSnapshot(decodeShareString(encodeSnapshot(saved)));
  for (const key of ['gripperWorkflow', 'gripperObjectWidth', 'gripperClearance']) assert.equal(restored.params[key], s.params[key]);
  const p = planGripper(restored.comps, restored.params);
  assert.equal(p.ok, true, p.message); near(p.closed.gap, 80.5);
});

test('A5: record preserves snapshot and distinguishes simulation from manufacture', () => {
  const s = fixture(), p = planGripper(s.comps, s.params);
  const record = gripperBuildRecord(p, s);
  for (const phrase of ['50 mm', '10 mm', '70.00', 'GearA', 'GearB', 'LeftJaw', 'RightJaw', '不能直接當成真實伺服命令', '尚未完成', '- [ ]']) assert.ok(record.includes(phrase), phrase);
  const match = record.match(/```json\n([\s\S]+?)\n```/);
  assert.deepEqual(JSON.parse(match[1]), s);
});

console.log(`gripper-workflow: ${count} cases passed`);
