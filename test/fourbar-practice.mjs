import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { S } from '../js/blocks/state.js';
import * as Model from '../js/blocks/model.js';
import * as Tools from '../js/blocks/tools.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

const start = normalizeSnapshot(getExample('fourbar-missing-coupler').snapshot);
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
console.log('fourbar-practice: real link drawing joins C/D and solves through a full revolution');
