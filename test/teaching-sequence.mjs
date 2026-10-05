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


for (const [id,key,value] of [['fourbar-crank-rocker','LL1',40],['fourbar-double-crank','LL1',88],['fourbar-double-rocker','LL1',72]]) {
 const before=analyze(id); fourbars[id].params[key]=value; const after=analyze(id);
 assert.equal(after.motion.mode,before.motion.mode);
 if(id==='fourbar-crank-rocker') assert.ok(after.outputSpanDeg>before.outputSpanDeg);
 if(id==='fourbar-double-crank') assert.ok(after.outputSpanDeg>350);
 if(id==='fourbar-double-rocker') assert.ok(Math.abs(after.outputSpanDeg-before.outputSpanDeg)>1);
 console.log(id, JSON.stringify({before,after}));
}
const parallel=normalizeSnapshot(getExample('parallel-fourbar').snapshot);
for(const length of [48,56]) {
 const params={...parallel.params,LL2:length};
 const compiled=compileTopology(parallel.comps,{params},new Set());
 for(const thetaDeg of [0,20,40]) {
  const r=solveTopology(compiled,{thetaDeg}); assert.notEqual(r.isValid,false);
  const dx=r.points.D.x-r.points.C.x;
  if(length===48) assert.ok(Math.abs(dx)<1e-5);
  else assert.ok(Math.abs(dx)>1);
 }
}
console.log('Lesson edits preserve expected motion; unequal parallel side loses parallelism at sampled poses.');
