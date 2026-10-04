import assert from 'node:assert/strict';
import { getTeachingFeedback, teachingRoles } from '../js/blocks/teaching-feedback.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

const comps = [{ type: 'bar', id: 'Crank', isInput: true, lenParam: 'L',
  p1: { id: 'A', type: 'motor', physicalMotor: '1', x: 0, y: 0 },
  p2: { id: 'B', type: 'floating', x: 40, y: 0 } }];
const before = JSON.stringify(comps);
const compiled = compileTopology(comps, { params: { L: 40 }, tracePoint: '' }, new Set());
const sol = solveTopology(compiled, { thetaDeg: 30 });
assert.equal(sol.isValid, true);
const healthy = getTeachingFeedback({ comps, compiled, sol, hasDrive: true, dof: 1 });
assert.deepEqual(healthy.pointIds, []);
assert.match(healthy.message, /先預測/);
assert.deepEqual(teachingRoles(comps, 'B'), { A: '輸入', B: '輸出觀察點' });
assert.deepEqual(teachingRoles(comps, 'absent'), { A: '輸入' });

const loose = [...comps, { type: 'bar', id: 'Loose', p1: comps[0].p2,
  p2: { id: 'C', type: 'floating', x: 70, y: 0 } }];
const incomplete = getTeachingFeedback({ comps: loose, sol, compiled, hasDrive: true, dof: 1 });
assert.deepEqual(incomplete.pointIds, ['C']);
assert.match(incomplete.message, /C.*尚未解出/);
assert.match(incomplete.message, /也可能/);
const invalid = getTeachingFeedback({ comps, sol: { isValid: false, points: {} }, hasDrive: true, dof: 0 });
assert.match(invalid.message, /復原/); // 實際失敗優先於理論自由度，沒有臆測失敗接點。
assert.deepEqual(invalid.pointIds, []);
assert.match(getTeachingFeedback({ comps, compiled, hasDrive: true }).message, /解不出/);
assert.match(getTeachingFeedback({ comps, sol, gearWarning: true }).message, /嚙合/);
assert.match(getTeachingFeedback({ comps, dof: 0 }).message, /固定結構/);
assert.match(getTeachingFeedback({ comps, dof: -1 }).message, /可能/);
assert.match(getTeachingFeedback({ comps, dof: 1 }).message, /動力來源/);
assert.match(getTeachingFeedback().message, /入門範例/);

const shared = [
  { type: 'anchor', p1: { id: 'A', type: 'fixed' } }, ...comps,
  { type: 'slider', isInput: true, p1: { id: 'R', type: 'fixed' }, p3: { id: 'S', type: 'floating' } },
  { type: 'gear', physicalMotor: '2', p1: { id: 'G', type: 'fixed' }, p2: { id: 'H', type: 'floating' } },
  { type: 'bar', isInput: true, motorMount: { center: 'J' }, p1: { id: 'I', type: 'floating' }, p2: { id: 'J', type: 'floating' } },
];
const roles = teachingRoles(shared, 'A');
assert.equal(roles.A, '固定／輸入／輸出觀察點');
assert.equal(roles.S, '輸入');
assert.equal(roles.R, '固定');
assert.equal(roles.G, '固定／輸入');
assert.equal(roles.H, undefined); // 從動孔不能自動當成機械輸出。
assert.equal(roles.J, '輸入');
assert.equal(roles.I, undefined);
assert.equal(JSON.stringify(comps), before);
console.log('teaching-feedback: passed');
