import assert from 'node:assert/strict';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology, sweepTopology } from '../js/multilink/solver.js';
import { sweepAssembly } from '../js/blocks/assembly.js';

const piston = {
  type: 'bar', id: 'Piston', style: 'piston', isInput: true, physicalMotor: '1', lenParam: 'L',
  p1: { id: 'O', type: 'fixed', x: 0, y: 0 }, p2: { id: 'P', type: 'floating', x: 100, y: 0 }
};
const compile = (comps, params = {}) => compileTopology(comps, { params }, new Set());
const linear = compile([piston], { L: 100 });
for (const extension of [-20, 0, 20]) {
  const result = solveTopology(linear, { motorAngles: { '1': extension } });
  assert.equal(result.isValid, true, `伸縮行程 ${extension} 不應被固定桿長誤判`);
  assert.equal(result.points.P.x, 100 + extension);
}
for (const extension of [-100, -120, Infinity]) {
  assert.equal(solveTopology(linear, { motorAngles: { '1': extension } }).isValid, false);
}
const rotary = compile([{ ...piston, style: 'bar' }], { L: 100 });
const rotated = solveTopology(rotary, { motorAngles: { '1': 20 } });
assert.equal(rotated.isValid, true);
assert.ok(Math.abs(Math.hypot(rotated.points.P.x, rotated.points.P.y) - 100) < 1e-8);

for (const bad of [Infinity, -Infinity, NaN]) {
  const topology = compile([{ type: 'anchor', id: 'Anchor', p1: { id: 'O', type: 'fixed', x: bad, y: 0 } }]);
  const result = solveTopology(topology, {});
  // NaN source values may be normalized to zero by the existing input reader.
  if (Object.values(result.points).some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    assert.equal(result.isValid, false);
    assert.ok(result.errorReason);
  }
}
const raw = { steps: [{ type: 'ground', id: 'O', x: Infinity, y: 0 }], params: {} };
assert.equal(solveTopology(raw, {}).isValid, false);

// Both single-topology and multi-module sweeps reject bad input before looping.
const sweepFns = [
  (...args) => sweepTopology(linear, {}, ...args),
  (...args) => sweepAssembly({ single: linear }, {}, ...args),
  (...args) => sweepAssembly({ units: [] }, {}, ...args)
];
for (const sweep of sweepFns) {
  for (const range of [[0, 360, 0], [0, 360, -1], [0, 360, NaN], [0, Infinity, 1],
    [NaN, 360, 1], [0, 360, Infinity], [0, 360, 1e-12], [1e20, 1e20, 1]]) {
    assert.throws(() => sweep(...range), RangeError);
  }
  assert.equal(sweep(0, 20, 10).results.length, 3);
  assert.equal(sweep(20, 0, 10).results.length, 0);
}
console.log('solver-boundaries: piston travel, finite solutions and bounded sweeps passed');
