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
import {wheelAppearance} from '../js/blocks/wheel-appearance.js';
import {attachPartMaterials} from '../js/blocks3d/part-pose.js';
const base=planMotorInstallation({comps:[],params:{},modules:[]},{type:'tt',hostId:'world',face:'back',orientation:'horizontal',position:{x:10,y:20}});
const empty={comps:[],params:{},modules:[]},emptyBefore=JSON.stringify(empty);
const independent=planWheel(empty,{});assert.ok(independent.ok);assert.equal(JSON.stringify(empty),emptyBefore);
const lone=independent.comps[0];assert.equal(lone.diameterMm,65);assert.equal(lone.wheelWidthMm,15);assert.equal(lone.p1.x,0);assert.equal(lone.p2.x-lone.p1.x,8);assert.equal(lone.motorMount,undefined);assert.equal(lone.p1.type,'floating');
const loneSaved=normalizeSnapshot(toSnapshot(independent.comps,{params:independent.params},0));assert.ok(loneSaved);assert.equal(loneSaved.comps[0].wheelWidthMm,15);assert.equal(loneSaved.comps[0].p2.id,lone.p2.id);
const loneGeometry=inspectLinkExport(loneSaved.comps[0],8,{});assert.equal(loneGeometry.holes.length,0);assert.equal(loneGeometry.cutouts.length,1);assert.equal(loneGeometry.cutouts[0].layer,'TT_SHAFT_FLAT');
assert.equal(planWheel(empty,{position:{x:NaN,y:0}}).ok,false);assert.equal(JSON.stringify(empty),emptyBefore);
const motorBefore=JSON.stringify(base.comps);const separate=planWheel(base,{});assert.ok(separate.ok);assert.equal(JSON.stringify(base.comps),motorBefore);assert.deepEqual(separate.comps.slice(0,-1),base.comps);assert.ok(separate.comps.at(-1).p1.x>base.comps[0].p1.x+65);assert.equal(separate.comps.at(-1).motorMount,undefined);
assert.ok(base.ok,base.message);const source={...base,modules:[]},before=JSON.stringify(source),motorId=base.comps[0].id;
const wheel=planWheel(source,{motorId});assert.ok(wheel.ok,wheel.message);assert.equal(JSON.stringify(source),before);
const saved=normalizeSnapshot(toSnapshot(wheel.comps,{params:wheel.params},0));assert.ok(saved);
const c=saved.comps.find(c=>c.wheelWidthMm!==undefined);assert.equal(c.wheelWidthMm,15);assert.equal(c.diameterMm,65);assert.equal(c.motorMount.partId,motorId);
const g=inspectLinkExport(c,8,{});assert.equal(g.holes.length,0,'rotation reference must not become an eccentric hole');assert.equal(g.cutouts.length,1);assert.equal(g.cutouts[0].layer,'TT_SHAFT_FLAT');
assert.ok(g.outlines[0].every(p=>Math.abs(Math.hypot(p.x,p.y)-32.5)<1e-6));
const cut=g.cutouts[0].points;assert.ok(Math.abs(Math.max(...cut.map(p=>p.x))-1.85)<1e-6);
const catalog=buildPartGeometryCatalog({comps:saved.comps,params:saved.params,fabrication:saved.fabrication ?? undefined});assert.equal(catalog.parts[c.id].thicknessMm,15);
const appearance=wheelAppearance(32.5),turned=wheelAppearance(32.5,.2);
assert.equal(appearance.holes.length,8);
for(const [i,h] of appearance.holes.entries()){
  assert.ok(Math.hypot(h.x,h.y)+h.r<appearance.hubRadius,'visual holes stay within the white hub');
  const next=appearance.holes[(i+1)%8];assert.ok(Math.abs(Math.hypot(next.x-h.x,next.y-h.y)-2*32.5*.47*Math.sin(Math.PI/8))<1e-9);
  assert.ok(Math.hypot(turned.holes[i].x-h.x,turned.holes[i].y-h.y)>1,'pattern follows wheel angle');
}
const visual=attachPartMaterials({sticks:[{id:c.id,a:{x:0,y:0},b:{x:8,y:0},z:0}]},catalog,{comps:saved.comps});
const visualWheel=visual.materialParts.find(p=>p.partId===c.id);assert.equal(visualWheel.wheelAppearance.radius,32.5);assert.equal(visualWheel.diskMark,undefined);
assert.equal(visualWheel.geometry.holes.length,0,'visual wheel holes never enter machining catalog');assert.equal(visualWheel.geometry.cutouts.length,1);
for(const theta of [0,45,180,359]){const sol=solveTopology(compileTopology(saved.comps,{params:saved.params},new Set()),{thetaDeg:theta});assert.ok(sol.isValid);assert.ok(Math.abs(Math.hypot(sol.points[c.p2.id].x-sol.points[c.p1.id].x,sol.points[c.p2.id].y-sol.points[c.p1.id].y)-8)<1e-6);}
for(const widthMm of [0,NaN,101])assert.equal(planWheel(source,{motorId,widthMm}).ok,false);
assert.equal(planWheel({...wheel,modules:[]},{motorId}).ok,false,'cannot replace an occupied output');
console.log('TT wheel: independent candidate, shaft-only cutout, width, save/open and rotation');


assert.ok(storedProject(toSnapshot(wheel.comps,{params:wheel.params},0)).requires.includes('tt-wheel-v1'));
const plan=buildPlan({comps:wheel.comps,params:wheel.params});assert.equal(plan.parts.find(p=>p.compId===c.id).kind,'wheel');assert.equal(plan.parts.find(p=>p.compId===c.id).thicknessMm,15);assert.ok(!plan.joints.some(j=>j.id===c.p2.id));
assert.throws(()=>inspectLinkExport(c,8,{},[{x:3,y:0,r:1.6}]),/外購輪子/);
const precise=planWheel(source,{motorId,diameterMm:65.25,widthMm:15.125});assert.ok(precise.ok);const reopened=normalizeSnapshot(toSnapshot(precise.comps,{params:precise.params},0));assert.equal(reopened.comps.find(c=>c.wheelWidthMm).wheelWidthMm,15.125);
