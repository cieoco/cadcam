import { memberSweepSegments } from '../js/blocks/member-sweep.js';
import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { S } from '../js/blocks/state.js';
import * as Model from '../js/blocks/model.js';
import * as Tools from '../js/blocks/tools.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

const start = normalizeSnapshot(getExample('wiper-missing-coupler').snapshot);
S.comps = start.comps; S.topo = { params: start.params }; S.counter = start.counter;
const svg = new EventTarget(); svg.style = {}; svg.appendChild = () => {};
const coords = () => Model.pointCoords(S.comps);
Tools.init({ svg, draw() {}, rebuild() {}, pushUndo() {}, pause() {}, cancelMotorMode() {}, deselectLink() {}, selectLink() {}, selectTriangle() {}, selectSlider() {}, setBanner() {}, clearBanner() {},
  worldFromEvent: e => e.world, pointCoords: coords, displayPointCoords: coords,
  nearestDisplayToPoint(world, exclude = [], maxDist = 13) { return Object.entries(coords()).find(([id, p]) => !exclude.includes(id) && Math.hypot(p.x - world.x, p.y - world.y) < maxDist)?.[0] || null; },
  snapWorld: () => 13, mobilePrompt: () => false, promptText: text => text });
Tools.startDrawLink(); Tools.startLinkAt(coords().C); Tools.finishDrawLink({ world: coords().D });
assert.equal(S.comps.length, 5);
assert.deepEqual(new Set([S.comps.at(-1).p1.id, S.comps.at(-1).p2.id]), new Set(['C', 'D']));
const drawn = S.comps.at(-1);
assert.notEqual(drawn.id, 'Link2');
assert.ok(Math.abs(S.topo.params[drawn.lenParam] - 104) < 1e-6);
const topology = compileTopology(S.comps, S.topo, new Set());
for (let angle = 0; angle <= 360; angle += 5) {
  const solved = solveTopology(topology, { thetaDeg: angle });
  assert.notEqual(solved.isValid, false, `Student-created coupler must solve at ${angle} degrees`);
  assert.ok(Number.isFinite(solved.points?.D?.x));
}
// Verify a single rigid arm spans both sides of its fixed middle pivot.
const arm = S.comps.find(c => c.id === 'WiperArm');
assert.equal(arm.type, 'triangle');
function range(inputLength) {
  const params = { ...S.topo.params, LL1: inputLength };
  const compiled = compileTopology(S.comps, { params }, new Set());
  const results = [];
  for (let angle = 0; angle <= 360; angle += 5) {
    const frame = solveTopology(compiled, { thetaDeg: angle });
    assert.notEqual(frame.isValid, false);
    const { B, D, E } = frame.points;
    assert.ok(Math.abs(Math.hypot(E.x-B.x,E.y-B.y)-120)<1e-5);
    assert.ok(Math.abs(Math.hypot(D.x-B.x,D.y-B.y)-80)<1e-5);
    assert.ok(Math.abs((E.x-B.x)+1.5*(D.x-B.x))<1e-5);
    assert.ok(Math.abs((E.y-B.y)+1.5*(D.y-B.y))<1e-5);
    results.push(frame);
  }
  const segments = memberSweepSegments(results, 'B', 'E');
  assert.equal(segments.length, 73);
  const angles = segments.map(({a,b})=>Math.atan2(b.y-a.y,b.x-a.x));
  return Math.max(...angles)-Math.min(...angles);
}
assert.ok(range(40)>range(32), 'One +8 mm crank edit increases wiper angle without blocking');
assert.ok(range(24)<range(32), 'Shorter crank decreases angle');
const complete = normalizeSnapshot(getExample('wiper-single').snapshot);
const restored = normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(complete.comps, { params: complete.params }, complete.counter))));
assert.deepEqual(restored.comps.find(c=>c.id==='WiperArm'), complete.comps.find(c=>c.id==='WiperArm'));
console.log('wiper-practice: drawn coupler, rigid opposite arm, full cycles, sweep range and roundtrip passed');
