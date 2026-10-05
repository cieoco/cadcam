import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { S } from '../js/blocks/state.js';
import * as Model from '../js/blocks/model.js';
import * as Tools from '../js/blocks/tools.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

const start = normalizeSnapshot(getExample('slider-crank-practice').snapshot);
S.comps = start.comps; S.topo = { params: start.params }; S.counter = start.counter;
const svg = new EventTarget(); svg.style = {}; svg.appendChild = () => {};
const coords = () => Model.pointCoords(S.comps);
Tools.init({ svg, draw() {}, rebuild() {}, pushUndo() {}, pause() {}, cancelMotorMode() {}, deselectLink() {}, selectLink() {}, selectTriangle() {}, selectSlider() {}, setBanner() {}, clearBanner() {},
  worldFromEvent: e => e.world, pointCoords: coords, displayPointCoords: coords,
  nearestDisplayToPoint(world, exclude = [], maxDist = 13) { return Object.entries(coords()).find(([id, p]) => !exclude.includes(id) && Math.hypot(p.x - world.x, p.y - world.y) < maxDist)?.[0] || null; },
  snapWorld: () => 13, mobilePrompt: () => false, promptText: text => text });
Tools.startDrawLink(); Tools.startLinkAt(coords().A); Tools.finishDrawLink({ world: coords().P3 });
assert.equal(S.comps.length, 6);
assert.deepEqual(new Set([S.comps.at(-1).p1.id, S.comps.at(-1).p2.id]), new Set(['A', 'P3']));
const drawn = S.comps.at(-1);
assert.notEqual(drawn.id, 'Link2');
assert.ok(Math.abs(S.topo.params[drawn.lenParam] - 88) < 1e-6);
const topology = compileTopology(S.comps, S.topo, new Set());
for (let angle = 0; angle <= 360; angle += 5) {
  const solved = solveTopology(topology, { thetaDeg: angle });
  assert.notEqual(solved.isValid, false, `Student-created coupler must solve at ${angle} degrees`);
  assert.ok(Number.isFinite(solved.points?.P3?.x));
}

for(const [crank,rod,lo,hi] of [[32,88,56,120],[40,88,48,128],[32,96,64,128]]) {
 const params={...S.topo.params,LL1:crank,[drawn.lenParam]:rod};
 const compiled=compileTopology(S.comps,{params},new Set());
 const positions=[];
 for(let thetaDeg=0;thetaDeg<=360;thetaDeg+=5) {
  const frame=solveTopology(compiled,{thetaDeg});
  assert.notEqual(frame.isValid,false); const p=frame.points.P3;
  assert.ok(Math.abs(p.y)<1e-6); assert.ok(p.x>=45 && p.x<=140);
  positions.push(p.x);
 }
 assert.ok(Math.abs(Math.min(...positions)-lo)<1e-6);
 assert.ok(Math.abs(Math.max(...positions)-hi)<1e-6);
}
console.log('Unit 2: real coupler drawing, three length experiments, full cycle and track bounds passed');
