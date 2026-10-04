import assert from 'node:assert/strict';
import { createCourseStart, checkCourseAssembly, createCourseDrafts } from '../js/blocks/fourbar-course.js';
import { S } from '../js/blocks/state.js';
import * as Model from '../js/blocks/model.js';
import * as Tools from '../js/blocks/tools.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

const full = createCourseStart('observe');
assert.equal(checkCourseAssembly(full).complete, true);
const partial = createCourseStart('build');
assert.equal(partial.comps.length, 4);
assert.equal(checkCourseAssembly(partial).complete, false);
const link = structuredClone(full.comps.find(c => c.id === 'Link2'));
link.id = 'StudentLink42';
partial.comps.push(link);
assert.equal(checkCourseAssembly(partial).complete, true, 'A student-created link need not have the original component ID');
link.p2.id = 'LooksLikeD';
assert.equal(checkCourseAssembly(partial).complete, false, 'Same coordinates without shared point ID are not connected');
link.p2.id = 'D'; link.p2.type = 'fixed';
assert.equal(checkCourseAssembly(partial).complete, false);
const drafts = createCourseDrafts();
drafts.save('create', full);
full.params.LL3 = 999;
assert.notEqual(drafts.load('create').params.LL3, 999);
const saved = drafts.load('create'); saved.params.LL3 = 1000;
assert.notEqual(drafts.load('create').params.LL3, 1000);
drafts.save('build', partial);
assert.equal(drafts.reset('build').comps.length, 4);
assert.equal(drafts.load('create').comps.length, 5, 'Resetting one stage preserves another');
assert.deepEqual(createCourseStart('challenge'), createCourseStart('build'));
const start = createCourseStart('build');
S.comps = start.comps; S.topo = { params: start.params }; S.counter = start.counter;
const svg = new EventTarget(); svg.style = {}; svg.appendChild = () => {};
const coords = () => Model.pointCoords(S.comps);
Tools.init({ svg, draw() {}, rebuild() {}, pushUndo() {}, pause() {}, cancelMotorMode() {}, deselectLink() {}, selectLink() {}, selectTriangle() {}, selectSlider() {}, setBanner() {}, clearBanner() {},
  worldFromEvent: e => e.world, pointCoords: coords, displayPointCoords: coords,
  nearestDisplayToPoint(world, exclude = [], maxDist = 13) { return Object.entries(coords()).find(([id, p]) => !exclude.includes(id) && Math.hypot(p.x - world.x, p.y - world.y) < maxDist)?.[0] || null; },
  snapWorld: () => 13, mobilePrompt: () => false, promptText: text => text });
Tools.startDrawLink(); Tools.startLinkAt(coords().C); Tools.finishDrawLink({ world: coords().D });
assert.equal(checkCourseAssembly({ comps: S.comps, params: S.topo.params }).complete, true);
const drawn = S.comps.at(-1);
assert.notEqual(drawn.id, 'Link2');
assert.ok(Math.abs(S.topo.params[drawn.lenParam] - 104) < 1e-6);
const topology = compileTopology(S.comps, S.topo, new Set());
for (let angle = 0; angle <= 360; angle += 5) {
  const solved = solveTopology(topology, { thetaDeg: angle });
  assert.notEqual(solved.isValid, false, `Student-created coupler must solve at ${angle} degrees`);
  assert.ok(Number.isFinite(solved.points?.D?.x));
}
console.log('fourbar-course: topology checks, independent stage drafts and reset passed');
