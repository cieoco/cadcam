import {storedProject} from '../js/blocks/project-envelope.js';
import {buildPlan} from '../js/blocks/build-plan.js';
import assert from 'node:assert/strict';
import {planWheel} from '../js/blocks/wheel.js';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {inspectLinkExport} from '../js/blocks/exporters.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {planInsertPin,pinPairs} from '../js/blocks/pin-ops.js';
const base=planMotorInstallation({comps:[],params:{},modules:[]},{type:'tt',hostId:'world',face:'back',orientation:'horizontal',position:{x:10,y:20}});
assert.ok(base.ok,base.message);const source={...base,modules:[]},before=JSON.stringify(source),motorId=base.comps[0].id;
const wheel=planWheel(source,{motorId});assert.ok(wheel.ok,wheel.message);assert.equal(JSON.stringify(source),before);
const saved=normalizeSnapshot(toSnapshot(wheel.comps,{params:wheel.params},0));assert.ok(saved);
const c=saved.comps.find(c=>c.wheelWidthMm!==undefined);assert.equal(c.wheelWidthMm,15);assert.equal(c.diameterMm,65);assert.equal(c.motorMount.partId,motorId);
assert.ok(!c.pinLocks?.length,'wheel output is a direct shaft connection, not a pin lock');
assert.equal(pinPairs(saved,c.p1.id).length,0,'wheel shaft must not appear as an ordinary pin');
assert.equal(planInsertPin(saved,{ownerId:c.id,otherId:c.id,from:c.p1.id,to:c.p2.id}).ok,false,'the rotation reference is not a physical pin hole');
const g=inspectLinkExport(c,8,{});assert.equal(g.holes.length,0,'rotation reference must not become an eccentric hole');assert.equal(g.cutouts.length,1);assert.equal(g.cutouts[0].layer,'TT_SHAFT_FLAT');
assert.ok(g.outlines[0].every(p=>Math.abs(Math.hypot(p.x,p.y)-32.5)<1e-6));
const cut=g.cutouts[0].points;assert.ok(Math.abs(Math.max(...cut.map(p=>p.x))-1.85)<1e-6);
const catalog=buildPartGeometryCatalog({comps:saved.comps,params:saved.params,fabrication:saved.fabrication ?? undefined});assert.equal(catalog.parts[c.id].thicknessMm,15);
for(const theta of [0,45,180,359]){const sol=solveTopology(compileTopology(saved.comps,{params:saved.params},new Set()),{thetaDeg:theta});assert.ok(sol.isValid);assert.ok(Math.abs(Math.hypot(sol.points[c.p2.id].x-sol.points[c.p1.id].x,sol.points[c.p2.id].y-sol.points[c.p1.id].y)-8)<1e-6);}
for(const widthMm of [0,NaN,101])assert.equal(planWheel(source,{motorId,widthMm}).ok,false);
assert.equal(planWheel({...wheel,modules:[]},{motorId}).ok,false,'cannot replace an occupied output');
console.log('TT wheel: independent candidate, shaft-only cutout, width, save/open and rotation');


assert.ok(storedProject(toSnapshot(wheel.comps,{params:wheel.params},0)).requires.includes('tt-wheel-v1'));
const plan=buildPlan({comps:wheel.comps,params:wheel.params});assert.equal(plan.parts.find(p=>p.compId===c.id).kind,'wheel');assert.equal(plan.parts.find(p=>p.compId===c.id).thicknessMm,15);assert.ok(!plan.joints.some(j=>j.id===c.p2.id));
assert.throws(()=>inspectLinkExport(c,8,{},[{x:3,y:0,r:1.6}]),/外購輪子/);
const precise=planWheel(source,{motorId,diameterMm:65.25,widthMm:15.125});assert.ok(precise.ok);const reopened=normalizeSnapshot(toSnapshot(precise.comps,{params:precise.params},0));assert.equal(reopened.comps.find(c=>c.wheelWidthMm).wheelWidthMm,15.125);
