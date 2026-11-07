import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {buildFaceCandidate,validateFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {planBarFusionResize} from '../js/blocks/bar-fusion-resize.js';
import {planBarFusion} from '../js/blocks/bar-fusion-plan.js';
import {inspectBarFusion,worldFusionGeometry} from '../js/blocks/bar-fusion-geometry.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {buildPlan} from '../js/blocks/build-plan.js';
import {orthogonalExportExtras} from '../js/blocks/orthogonal-joint.js';
import {exportLinksAsSvg,exportLinksAsDxf,cncPartsForExport,assertFusionFeatures,inspectGearExport} from '../js/blocks/exporters.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {gridIssues} from '../js/blocks/grid-rule.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
const load=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
const lift=load('clawbot-geared-lift'),compiled=compileTopology(lift.comps,{params:lift.params},new Set());
assert.deepEqual(gridIssues(lift.comps,lift.params),[]);
// Smaller gears must retain material around every exported hole, including horn holes.
for(const gear of lift.comps.filter(c=>c.type==='gear')){
 const geometry=inspectGearExport(gear,lift.params,{},lift.comps);
 const rootRadius=gear.module*(gear.teeth/2-1.25);
 for(const h of geometry.holes)assert.ok(Math.hypot(h.x,h.y)+h.r+.5<=rootRadius,`${gear.id}: hole reaches tooth root`);
 for(let i=0;i<geometry.holes.length;i++)for(let j=i+1;j<geometry.holes.length;j++){
  const a=geometry.holes[i],b=geometry.holes[j];
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r+.5,`${gear.id}: holes overlap or leave too little material`);
 }
}

for(let a=0;a>=-180;a-=.5){
 const r=solveTopology(compiled,{thetaDeg:a});assert.ok(r.isValid,r.errorReason);assert.equal(r.isUnderconstrained,false);
 const t=-a*Math.PI/540,p=r.points;
 near(p.ClawLiftPin.x,24*Math.cos(t));near(p.ClawLiftPin.y,24*Math.sin(t));
 near(p.ClawLiftTip.x,160*Math.cos(t));near(p.ClawLiftTip.y,160*Math.sin(t));
 near(p.ClawLiftMotorPin.x,Math.hypot(8,8)*Math.cos(a*Math.PI/180));near(p.ClawLiftMotorPin.y,-72+Math.hypot(8,8)*Math.sin(a*Math.PI/180));
}
const changed=planBarFusionResize(lift.comps,lift.params,'ClawLiftExtension',144);assert.ok(changed.ok,changed.reason);
near(solveTopology(compileTopology(changed.comps,{params:changed.params},new Set()),{thetaDeg:-180}).points.ClawLiftTip.y,168*Math.sin(Math.PI/3));
assert.equal(planBarFusionResize(lift.comps,lift.params,'ClawLiftExtension',0).ok,false);
const full=load('clawbot-lift-gripper'),practice=load('clawbot-lift-gripper-practice');
assert.equal(practice.modules.length,2);assert.ok(practice.modules.every(m=>!m.mount));
const selection=full.modules.find(m=>m.id==='Grip1').mount.face.selection,request={childId:'Grip1',hostEndpoint:{moduleId:'ClawLift',outputId:'tool',partId:'ClawLiftExtension'},childEndpoint:{partId:'frame'},selection};
const before=JSON.stringify(practice),candidate=buildFaceCandidate(practice,request);
assert.ok(candidate.ok,candidate.reason);assert.equal(JSON.stringify(practice),before,'assembly preview preserves both independent mechanisms');
assert.deepEqual(JSON.parse(JSON.stringify(candidate.work.modules.find(m=>m.id==='Grip1').mount)),full.modules.find(m=>m.id==='Grip1').mount,'saved assembly is reproducible through the existing face operation');
const validated=await validateFaceCandidate(candidate);assert.ok(validated.saveable,validated.reason);
assert.deepEqual(validated.validation.material.findings,[],'do not omit or suppress bracket collision checks');
assert.ok(validated.validation.coverage.notSupported.length,'motor/pin coverage limits remain explicit');
const asm=compileAssembly(full.comps,full.modules,{params:full.params});
for(let a=0;a>=-180;a-=5)for(let b=0;b<=30;b+=5){
 const r=solveAssembly(asm,{thetaDeg:0,motorAngles:{'1':a,'2':b}});assert.ok(r.isValid,r.errorReason);
 near(r.points.ClawLiftTip.x,160*Math.cos(-a*Math.PI/540));
 near(Math.hypot(r.points.GCB.x-r.points.GCA.x,r.points.GCB.y-r.points.GCA.y),64);
 const onlyClaw=solveAssembly(asm,{thetaDeg:0,motorAngles:{'1':0,'2':b}});
 near(r.points.LT.x,onlyClaw.points.LT.x);near(r.points.LT.y,onlyClaw.points.LT.y); // separate local claw plane
}
const home=faceCandidateModel(candidate,{motorAngles:{'1':0,'2':0}}),hc=home.model.orthogonal.find(c=>c.id==='Grip1');
for(const a of [-180,-90,0])for(const b of [0,30]){
 const scene=faceCandidateModel(candidate,{motorAngles:{'1':a,'2':b}}),child=scene.model.orthogonal.find(c=>c.id==='Grip1'),phi=-a*Math.PI/540;
 assert.ok(scene.solveValidity.valid);near(child.matrix[8],-Math.sin(phi));near(child.matrix[9],Math.cos(phi));near(child.matrix[10],0);
 const point=applyMatrix4(child.matrix,{...scene.points.GCA,z:0}),base=applyMatrix4(hc.matrix,{...home.points.GCA,z:0});
 near(point.x,base.x*Math.cos(phi)-base.y*Math.sin(phi));near(point.y,base.x*Math.sin(phi)+base.y*Math.cos(phi));near(point.z,base.z);
 const root=scene.model.materialParts.find(p=>p.partId==='ClawLiftArm');
 assert.ok(root&&scene.model.brackets.length,'fused root and connection hardware remain visible');
 // Bracket host holes and the unified arm hole must coincide in all 3D poses.
 for(const h of root.geometry.holes.filter(h=>h.holePairId)){
  const screw=scene.model.screws.find(s=>s.holePairId===h.holePairId);assert.ok(screw,h.id);
  const hp=applyMatrix4(root.pose.matrix,{x:h.x,y:h.y,z:root.geometry.thicknessMm/2});
  const d={x:screw.tip.x-screw.head.x,y:screw.tip.y-screw.head.y,z:screw.tip.z-screw.head.z},v={x:hp.x-screw.head.x,y:hp.y-screw.head.y,z:hp.z-screw.head.z},len=Math.hypot(d.x,d.y,d.z);
  near(Math.hypot(v.y*d.z-v.z*d.y,v.z*d.x-v.x*d.z,v.x*d.y-v.y*d.x)/len,0);
 }
}
const extras=orthogonalExportExtras(full.comps,full.modules,full.params),root=full.comps.find(c=>c.barFusion),fusion=inspectBarFusion(full.comps,root,full.params,{},extras);
assert.ok(fusion.ok,fusion.reason);const holes=fusion.geometry.holes.filter(h=>h.layer==='ADAPTER_HOLE');assert.ok(holes.length>=2);
assert.ok(extras.linkHoles.ClawLiftExtension.length,'drilling belongs to the non-root constituent');
const catalog=buildPartGeometryCatalog({...full,fabrication:{}}),cnc=cncPartsForExport(full.comps,{},full.params,{},[],extras).find(p=>p.name===root.id);
for(const h of holes){
 for(const g of [catalog.parts[root.id],cnc]){const q=g.holes.find(q=>q.id===h.id);assert.ok(q,h.id);near(q.x,h.x);near(q.y,h.y);near(q.r,h.r);assert.equal(q.holePairId,h.holePairId);}
}
assert.ok(buildPlan(full).parts.find(p=>p.compId===root.id));
for(const fn of [exportLinksAsSvg,exportLinksAsDxf]){
 const files=[];fn(full.comps,{},full.params,{},[],extras,(text,name,mime,ids)=>files.push({text,name,ids}));
 const file=files.find(f=>f.ids.includes(root.id));assert.deepEqual(file.ids,root.barFusion.members);assert.ok(holes.every(h=>file.text.includes(h.id)),'each adapter hole keeps its trace in the output');
}
for(const id of ['clawbot-geared-lift','clawbot-lift-gripper','clawbot-lift-gripper-practice']){
 const s=load(id),saved=normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(s.comps,s,s.counter,s))));
 assert.deepEqual(saved.comps,s.comps);assert.deepEqual(saved.modules,s.modules);assert.deepEqual(saved.params,s.params);
}
// A bent rigid board tests the member-to-root transform independently of Clawbot.
const p=(id,x,y,type='floating')=>({id,x,y,type}),a={...p('A',0,0,'motor'),physicalMotor:'1'},b=p('B',80,0),c=p('C',80,64);
const bar=(id,p1,p2,input=false)=>({type:'bar',id,p1,p2,lenParam:id+'L',fixedLen:true,isInput:input,...(input?{physicalMotor:'1',motorType:'tt'}:{}),stock:{widthMm:18,thicknessMm:3,material:'plywood'}});
const params={OneL:80,TwoL:64},union=planBarFusion([bar('One',a,b,true),bar('Two',b,c)],['One','Two'],params);assert.ok(union.ok);
const extra={linkHoles:{Two:[{id:'rotated-adapter',u:24,v:2,diameterMm:3.2,holePairId:'pair',connectionId:'connection'}]}};
const g=inspectBarFusion(union.comps,union.comps[0],params,{},extra);assert.ok(g.ok,g.reason);
const h=g.geometry.holes.find(h=>h.id==='rotated-adapter');near(h.x,78);near(h.y,24);
const world=worldFusionGeometry(g,{A:{x:20,y:30},B:{x:20,y:110}}).holes.find(h=>h.id==='rotated-adapter');near(world.x,-4);near(world.y,108);
for(const bad of [{u:24,v:12},{u:0,v:0,diameterMm:5},{u:-80,v:0}]){
 const e={linkHoles:{Two:[{...extra.linkHoles.Two[0],...bad}]}};assert.equal(inspectBarFusion(union.comps,union.comps[0],params,{},e).ok,false,'edge and mismatched duplicate conflicts must fail');
 assert.throws(()=>exportLinksAsSvg(union.comps,{},params,{},[],e,()=>{}));
}
for(const u of [0,3])assert.equal(inspectBarFusion(union.comps,union.comps[0],params,{},
 {linkHoles:{One:[{id:'slot-conflict',u,v:0,diameterMm:3.2}]}}).ok,false,'drilling inside or partially crossing the TT shaft opening must fail');
assert.throws(()=>assertFusionFeatures(union.comps,[{frameBody:'Two'}]),/解除合成/,'motor features remain outside this package');
console.log('IQ Clawbot: 3:1 oracle, separate inputs, reproducible perpendicular assembly, rigid follow, hardware alignment, fused drilling transforms/edge/slot/output and JSON passed');
