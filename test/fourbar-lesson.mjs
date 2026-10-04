// 驗收三種四連桿入門範例：曲柄搖桿、雙曲柄、雙搖桿。
// 驗收輸入角度活動型態、輸出桿轉角，以及曲柄搖桿改長輸出桿後的擺幅變化。
// 跑法：node test/fourbar-lesson.mjs
import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { planMotion } from '../js/blocks/motion.js';
import { measureFourbarSwing } from '../js/blocks/fourbar-measurement.js';

const ids = ['fourbar-crank-rocker', 'fourbar-double-crank', 'fourbar-double-rocker'];
const fourbars = Object.fromEntries(ids.map(id => {
  const normalized = normalizeSnapshot(getExample(id).snapshot);
  const comps = normalized.comps;
  const bars = ['Link1', 'Link2', 'Link3'].map(name => comps.find(c => c.id === name));
  assert.equal(comps.filter(c => c.type === 'anchor').length, 2, `${id}: two fixed points`);
  assert.deepEqual(bars.map(c => [c.p1.id, c.p2.id]), [['A', 'C'], ['C', 'D'], ['B', 'D']], `${id}: canonical link order`);
  assert.equal(bars[0].isInput, true, `${id}: AC drives the mechanism`);
  return [id, { comps, params: normalized.params }];
}));

const pointSeed = comps => Object.fromEntries(comps.flatMap(c => ['p1', 'p2', 'p3'].map(key => c[key])
  .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
  .map(p => [p.id, { x: p.x, y: p.y }])));
const angle = (p, c) => Math.atan2(p.y - c.y, p.x - c.x);
const unwrap = values => values.reduce((out, value, i) => {
  if (i === 0) return [value];
  let next = value;
  while (next - out[i - 1] > Math.PI) next -= 2 * Math.PI;
  while (next - out[i - 1] < -Math.PI) next += 2 * Math.PI;
  return [...out, next];
}, []);

function analyze(id) {
  const { comps, params } = fourbars[id];
  const topo = { params, tracePoint: '' };
  const compiled = compileTopology(comps, topo, new Set());
  const initial = solveTopology(compiled, { thetaDeg: 0, _prevPoints: pointSeed(comps) });
  assert.ok(initial && initial.isValid !== false, `${id}: valid at theta 0`);
  for (const pointId of ['A', 'B', 'C', 'D']) {
    assert.ok(Number.isFinite(initial.points[pointId]?.x) && Number.isFinite(initial.points[pointId]?.y), `${id}: finite ${pointId} at theta 0`);
  }
  const motion = planMotion(compiled, topo, 0, initial.points);
  let previous = initial.points;
  const points = [initial.points];
  const solveAt = thetaDeg => {
    const result = solveTopology(compiled, { thetaDeg, _prevPoints: previous });
    assert.ok(result && result.isValid !== false, `${id}: valid at theta ${thetaDeg}`);
    previous = result.points;
    points.push(result.points);
  };
  if (motion.mode === 'rock') {
    for (let theta = -1; theta >= motion.lo; theta -= 1) solveAt(theta);
    for (let theta = motion.lo + 1; theta <= motion.hi; theta += 1) solveAt(theta);
  } else {
    for (let theta = 1; theta <= 360; theta += 1) solveAt(theta);
  }
  const outputAngles = unwrap(points.map(p => angle(p.D, p.B)));
  const inputAngles = unwrap(points.map(p => angle(p.C, p.A)));
  return {
    motion,
    inputSpanDeg: (Math.max(...inputAngles) - Math.min(...inputAngles)) * 180 / Math.PI,
    outputSpanDeg: (Math.max(...outputAngles) - Math.min(...outputAngles)) * 180 / Math.PI
  };
}

const crankRocker = analyze('fourbar-crank-rocker');
assert.equal(crankRocker.motion.mode, 'rotate');
assert.ok(crankRocker.inputSpanDeg > 350, `crank-rocker input span ${crankRocker.inputSpanDeg}°`);
assert.ok(crankRocker.outputSpanDeg > 0 && crankRocker.outputSpanDeg < 180, `crank-rocker output span ${crankRocker.outputSpanDeg}°`);

const doubleCrank = analyze('fourbar-double-crank');
assert.equal(doubleCrank.motion.mode, 'rotate');
assert.ok(doubleCrank.inputSpanDeg > 350, `double-crank input span ${doubleCrank.inputSpanDeg}°`);
assert.ok(doubleCrank.outputSpanDeg > 350, `double-crank output span ${doubleCrank.outputSpanDeg}°`);
{
  const { comps, params } = fourbars['fourbar-double-crank'];
  const ground = Math.hypot(comps[1].p1.x - comps[0].p1.x, comps[1].p1.y - comps[0].p1.y);
  const lengths = [ground, params.LL1, params.LL2, params.LL3].sort((a, b) => a - b);
  assert.ok(lengths[0] + lengths[3] < lengths[1] + lengths[2], 'double-crank uses strict Grashof geometry');
}

const doubleRocker = analyze('fourbar-double-rocker');
assert.equal(doubleRocker.motion.mode, 'rock');
assert.ok(doubleRocker.inputSpanDeg > 0 && doubleRocker.inputSpanDeg < 360, `double-rocker input span ${doubleRocker.inputSpanDeg}°`);
assert.ok(doubleRocker.outputSpanDeg > 0 && doubleRocker.outputSpanDeg < 180, `double-rocker output span ${doubleRocker.outputSpanDeg}°`);
{
  const { comps, params } = fourbars['fourbar-double-rocker'];
  const ground = Math.hypot(comps[1].p1.x - comps[0].p1.x, comps[1].p1.y - comps[0].p1.y);
  const lengths = [ground, params.LL1, params.LL2, params.LL3].sort((a, b) => a - b);
  assert.ok(lengths[0] + lengths[3] > lengths[1] + lengths[2], 'double-rocker uses strict non-Grashof geometry');
}

const baseline = fourbars['fourbar-crank-rocker'];
const baseMeasure = measureFourbarSwing(baseline.comps, baseline.params);
const longerOutput = measureFourbarSwing(baseline.comps, { ...baseline.params, LL3: 88 });
assert.equal(baseMeasure.ok, true, baseMeasure.message);
assert.equal(baseMeasure.inputMode, 'rotate');
assert.equal(baseMeasure.outputMode, 'rock');
assert.equal(longerOutput.ok, true, longerOutput.message);
assert.ok(Math.abs(longerOutput.spanDeg - baseMeasure.spanDeg) > 1,
  `changing BD 80→88 should change rocker span (${baseMeasure.spanDeg}° vs ${longerOutput.spanDeg}°)`);

console.log(`fourbar-lesson: passed; crank-rocker BD 80→88 gives ${baseMeasure.spanDeg}°→${longerOutput.spanDeg}°; double-crank output ${doubleCrank.outputSpanDeg.toFixed(1)}°; double-rocker input/output ${doubleRocker.inputSpanDeg.toFixed(1)}°/${doubleRocker.outputSpanDeg.toFixed(1)}°`);
