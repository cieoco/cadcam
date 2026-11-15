import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { S } from '../js/blocks/state.js';
import * as Model from '../js/blocks/model.js';
import * as Tools from '../js/blocks/tools.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import {planInsertPin} from '../js/blocks/pin-ops.js';

const start = normalizeSnapshot(getExample('fourbar-missing-coupler').snapshot);
S.comps = start.comps; S.topo = { params: start.params }; S.counter = start.counter;
const svg = new EventTarget(); svg.style = {}; svg.appendChild = () => {};
const coords = () => Model.pointCoords(S.comps);
Tools.init({ svg, draw() {}, rebuild() {}, pushUndo() {}, pause() {}, cancelMotorMode() {}, deselectLink() {}, selectLink() {}, selectTriangle() {}, selectSlider() {}, setBanner() {}, clearBanner() {},
  worldFromEvent: e => e.world, pointCoords: coords, displayPointCoords: coords,
  nearestDisplayToPoint(world, exclude = [], maxDist = 13) { return Object.entries(coords()).find(([id, p]) => !exclude.includes(id) && Math.hypot(p.x - world.x, p.y - world.y) < maxDist)?.[0] || null; },
  snapWorld: () => 13, mobilePrompt: () => false, promptText: text => text });
const beforeCount=S.comps.length;
Tools.startDrawLink(); Tools.startLinkAt(coords().C); Tools.finishDrawLink({ world: coords().D });
assert.equal(S.comps.length,beforeCount+1);
assert.ok(!['C','D'].includes(S.comps.at(-1).p1.id));
assert.ok(!['C','D'].includes(S.comps.at(-1).p2.id));
assert.deepEqual({x:S.comps.at(-1).p1.x,y:S.comps.at(-1).p1.y},coords().C);
assert.deepEqual({x:S.comps.at(-1).p2.x,y:S.comps.at(-1).p2.y},coords().D);
const drawn = S.comps.at(-1);
assert.notEqual(drawn.id, 'Link2');
assert.ok(Math.abs(S.topo.params[drawn.lenParam] - 104) < 1e-6);
const original=structuredClone(S.comps),params=structuredClone(S.topo.params);
for(const [from,to] of [[drawn.p1.id,'C'],[drawn.p2.id,'D']]){
 const other=S.comps.find(c=>c.id!==drawn.id&&[c.p1,c.p2,c.p3].some(p=>p?.id===to));
 if(to==='D'){
  const locked=structuredClone(S.comps);locked.find(c=>c.id===drawn.id).pinLocks=[{id:'Guard',at:'C',with:'Link1'}];const snapshot=JSON.stringify(locked);
  assert.equal(planInsertPin({comps:locked,params:S.topo.params},{ownerId:drawn.id,otherId:other.id,from,to}).ok,false,'locked owner is never silently reassembled');assert.equal(JSON.stringify(locked),snapshot);
  // Ordinary unmounted closed loops reuse the existing constraint solver when not already aligned.
  const loose=structuredClone(S.comps);for(const c of loose){delete c.motorMount;delete c.physicalMotor;for(const k of ['p1','p2','p3'])if(c[k])delete c[k].physicalMotor;}
  const coupler=loose.find(c=>c.id===drawn.id),dx=coupler.p2.x-coupler.p1.x,dy=coupler.p2.y-coupler.p1.y;coupler.p2.x=coupler.p1.x+dx*Math.cos(.04)-dy*Math.sin(.04);coupler.p2.y=coupler.p1.y+dx*Math.sin(.04)+dy*Math.cos(.04);
  const adjusted=planInsertPin({comps:loose,params:S.topo.params},{ownerId:drawn.id,otherId:other.id,from,to});assert.ok(adjusted.ok,adjusted.message);assert.deepEqual(adjusted.params,S.topo.params);
  for(const c of loose)for(const k of ['p1','p2','p3'])if(c[k]?.type==='fixed')assert.deepEqual(adjusted.comps.find(o=>o.id===c.id)[k],c[k]);
 }
 const plan=planInsertPin({comps:S.comps,params:S.topo.params,points:coords()},{ownerId:drawn.id,otherId:other.id,from,to});assert.ok(plan.ok,plan.message);S.comps=plan.comps;S.topo.params=plan.params;
}
assert.deepEqual(S.topo.params,params);
for(const c of original)for(const k of ['p1','p2','p3'])if(c[k]?.type==='fixed')assert.deepEqual(S.comps.find(o=>o.id===c.id)[k],c[k]);
assert.deepEqual(new Set([S.comps.at(-1).p1.id,S.comps.at(-1).p2.id]),new Set(['C','D']));
const topology = compileTopology(S.comps, S.topo, new Set());
for (let angle = 0; angle <= 360; angle += 5) {
  const solved = solveTopology(topology, { thetaDeg: angle });
  assert.notEqual(solved.isValid, false, `Student-created coupler must solve at ${angle} degrees`);
  assert.ok(Number.isFinite(solved.points?.D?.x));
}
console.log('fourbar-practice: aligned independent link plus two explicit pins joins C/D and solves through a full revolution');
