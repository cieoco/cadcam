import assert from 'node:assert/strict';
import {S,fresh,solveAt,cnc,ex} from './_bench-setup.mjs';
import {unionOutlines,area,fusionCandidates,transformFusion} from '../js/blocks/part-fusion.js';
import {inspectFusion,exportableGears,exportablePlates} from '../js/blocks/exporters.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {buildPlan} from '../js/blocks/build-plan.js';
import {buildSceneModel} from '../js/blocks3d/scene-model.js';
const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
assert.equal(area(unionOutlines([rect(0,0,10,10),rect(5,0,10,10)])[0]),150);
assert.equal(area(unionOutlines([rect(0,0,10,10),rect(2,2,3,3)])[0]),100);
assert.equal(unionOutlines([rect(0,0,10,10),rect(20,0,10,10)]).length,2);
assert.equal(area(unionOutlines([rect(0,0,10,10),rect(0,0,10,10)])[0]),100);
fresh('gear-gripper');
const before=JSON.stringify(S.comps),plates=S.comps.filter(c=>c.shape==='jaw');
for(const plate of plates) {
  const candidate=fusionCandidates(S.comps,plate);assert.equal(candidate.length,1);
  plate.fusedWith=candidate[0].id;
  const f=inspectFusion(S.comps,plate,S.topo.params,ex);assert.ok(f.ok,f.reason);
  assert.ok(f.geometry.outline.length>100);
}
assert.equal(exportablePlates(S.comps,{}).length,0);
assert.equal(exportableGears(S.comps,S.topo.params,ex).length,2);
const restored=normalizeSnapshot(toSnapshot(S.comps,S.topo,S.counter,{modules:S.modules}));
assert.ok(restored);assert.equal(restored.comps.filter(c=>c.fusedWith).length,2);
const {moduleToTemplate,instantiateTemplate}=await import('../js/blocks/module-ops.js');
const copied=instantiateTemplate(moduleToTemplate(S.comps,S.modules,S.topo.params,S.modules[0].id),{counter:10});
for(const p of copied.comps.filter(c=>c.fusedWith))assert.ok(copied.comps.some(c=>c.id===p.fusedWith),'module copies rename fusion references');
const Ex=await import('../js/blocks/exporters.js');
assert.throws(()=>Ex.assertFusionFeatures(S.comps,[],{plateHoles:{[plates[0].id]:[{x:0,y:0,r:2}]}}),/解除合成/);
const downloads=[];
const originalDoc=globalThis.document,originalUrl=globalThis.URL,originalTimeout=globalThis.setTimeout;
globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
globalThis.URL={createObjectURL:b=>{downloads.push(b);return 'test';},revokeObjectURL(){}};
globalThis.setTimeout=()=>0;
assert.equal(Ex.exportLinksAsSvg(S.comps,{},S.topo.params,ex),2);
assert.equal(downloads.length,2);
for(const b of downloads){const text=await b.text();assert.equal((text.match(/data-layer="GEAR_CUT"/g)||[]).length,1);assert.ok(text.includes('<desc>'));}
downloads.length=0;
assert.equal(Ex.exportLinksAsDxf(S.comps,{},S.topo.params,ex),2);
for(const b of downloads)assert.ok((await b.text()).includes('GEAR_CUT'));
globalThis.document=originalDoc;globalThis.URL=originalUrl;globalThis.setTimeout=originalTimeout;
const plan=buildPlan({comps:S.comps,modules:S.modules,params:S.topo.params,exportSettings:ex,cnc});
assert.equal(plan.parts.filter(p=>p.fusedMembers).length,2);
assert.ok(plan.parts.filter(p=>p.fusedMembers).every(p=>p.thicknessMm===4));
assert.equal(plan.parts.filter(p=>p.name.includes('Jaw')).length,0);
const {findInterference}=await import('../js/blocks/interference.js');
const hits=findInterference({comps:S.comps,modules:S.modules,params:S.topo.params,plan,ranges:{'1':{lo:0,hi:90}},samplesPerMotor:10});
assert.ok(hits.some(h=>h.kind==='same-layer' && h.parts.every(n=>n.startsWith('Gear'))),'fused arms must not inherit the tooth mesh overlap exemption');
for(const angle of [0,10,30]) {
  const pts=solveAt(S.comps,S.modules,S.topo.params,{'1':angle}).points;
  for(const plate of plates) {
    const f=inspectFusion(S.comps,plate,S.topo.params,ex),g=transformFusion(f.geometry,f.gear,pts);
    for(const p of [plate.p1,plate.p2,plate.p3])assert.ok(g.holes.some(h=>Math.hypot(h.x-pts[p.id].x,h.y-pts[p.id].y)<.02),`${plate.id}/${p.id} must follow solver at ${angle}`);
    const model=buildSceneModel([],pts,{gears:[{id:f.gear.id,center:f.gear.p1.id,pin:f.gear.p2.id,teeth:f.gear.teeth,radius:S.topo.params[f.gear.radiusParam]}],polygons:[{points:[plate.p1.id,plate.p2.id,plate.p3.id]}],fusedParts:{[f.gear.id]:{...f,geometry:g,ids:[plate.p1.id,plate.p2.id,plate.p3.id]}}});
    assert.equal(model.gears.length,0);assert.equal(model.plates.length,1);
  }
}
const plate=plates[0],gear=S.comps.find(c=>c.id===plate.fusedWith);
const initial=inspectFusion(S.comps,plate,S.topo.params,ex).geometry;
gear.teeth+=2;S.topo.params[gear.radiusParam]+=gear.module;
assert.notDeepEqual(inspectFusion(S.comps,plate,S.topo.params,ex).geometry.outline,initial.outline);
S.topo.params[gear.pinRadiusParam]-=1;
const f=inspectFusion(S.comps,plate,S.topo.params,ex);assert.ok(f.ok,f.reason);
const pts=solveAt(S.comps,S.modules,S.topo.params,{'1':10}).points,g=transformFusion(f.geometry,f.gear,pts);
assert.ok(g.holes.some(h=>Math.hypot(h.x-pts[plate.p3.id].x,h.y-pts[plate.p3.id].y)<.02),'edited pin radius follows plate solver');
plate.fusedWith='missing';assert.equal(inspectFusion(S.comps,plate,S.topo.params,ex).ok,false);
assert.throws(()=>exportableGears(S.comps,S.topo.params,ex),/合成/);
S.comps=JSON.parse(before);
assert.equal(exportablePlates(S.comps,{}).length,2,'unfused original remains exportable');
console.log('PASS parametric fusion: union, editable dimensions, solver, save/load, 3D, parts, invalid references, unfuse');
