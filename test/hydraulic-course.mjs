// Student entry points must be editable, unpowered, and completable through the real installer.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {planPlacedSyringe} from '../js/blocks/syringe-installation.js';
import {scanSyringe,syringeReading,solveSyringe} from '../js/blocks/syringe-operations.js';
import {prepareRootDesign,builtinTemplate,instantiateTemplate,mountModule} from '../js/blocks/module-ops.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {selectableMountSurfaces,buildMountSurfaces} from '../js/blocks/mount-surfaces.js';
import {buildFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {attachmentFrame} from '../js/core/syringe.js';
// The two actual stock faces remain parallel at the requested gap, after save/reopen
// and while both syringes move. Cover the photographed coupler and the lesson's arm.
{
 const lift=instantiateTemplate(builtinTemplate('hydraulic-lift'),{counter:100,place:{x:0,y:0},usedMotorIds:[]});
 const grip=instantiateTemplate(builtinTemplate('hydraulic-gripper'),{counter:200,place:{x:500,y:0},usedMotorIds:[]});
 const source={comps:[...lift.comps,...grip.comps],modules:[lift.module,grip.module],params:{...lift.params,...grip.params}};
 const child=grip.comps.find(c=>c.id.startsWith('H3Frame'));
 for(const host of lift.comps.filter(c=>/^H2(Coupler|Arm)_/.test(c.id)))for(const hostFace of ['top','bottom'])for(const childFace of ['top','bottom']){
  const gap=hostFace==='top'?0:3,sign=hostFace==='top'?1:-1;
  const candidate=buildFaceCandidate(source,{childId:grip.module.id,hostEndpoint:{moduleId:lift.module.id,partId:host.id},childEndpoint:{partId:child.id},
   selection:{hostFace,childFace,alignU:0,alignV:0,offsetU:12,offsetV:-8,gap,quarterTurns:0,rotationDeg:37}});
  assert.ok(candidate.ok,candidate.reason);
  const reopened=normalizeSnapshot({kind:'blocks',v:1,...candidate.work,params:candidate.work.params});
  for(const extension of [0,10,20]){
   const work=structuredClone(candidate.work);work.comps=reopened.comps;work.modules=reopened.modules;
   work.comps=work.comps.map(c=>c.type==='syringe'?{...c,extension}:c);
   const scene=faceCandidateModel({...candidate,work});assert.ok(scene.solveValidity.valid);
   const [a,b]=[host,child].map(c=>scene.model.materialParts.find(p=>p.partId===c.id));
   const hn=a.pose.matrix.slice(8,11).map(v=>v*sign),cn=b.pose.matrix.slice(8,11).map(v=>v*(childFace==='top'?1:-1));
   assert.ok(Math.abs(hn.reduce((sum,v,i)=>sum+v*cn[i],0)+1)<1e-8,'actual board face normals oppose');
   const point=(p,face)=>applyMatrix4(p.pose.matrix,{...p.geometry.outlines[0][0],z:face==='top'?p.geometry.thicknessMm:0});
   const pa=point(a,hostFace),pb=point(b,childFace);
   assert.ok(Math.abs(hn.reduce((sum,v,i)=>sum+v*(pb[['x','y','z'][i]]-pa[['x','y','z'][i]]),0)-gap)<1e-7,'actual selected planes keep requested separation');
  }
 }
 console.log('PASS hydraulic face mating: parallel normals, actual gap, both host parts, motion and reopen');
}
// Unit 10 starts with the student's root design, not the already assembled H05.
{
 const grip=normalizeSnapshot(getExample('hydraulic-h03').snapshot);
 const lift=instantiateTemplate(builtinTemplate('hydraulic-lift'),{counter:100,existingTokens:[],usedMotorIds:[],place:{x:500,y:0}});
 const comps=[...grip.comps,...lift.comps],modules=[lift.module];
 const topo={params:{...grip.params,...lift.params},rootDesignName:'我的夾爪',assemblyMembers:['#root',lift.module.id]};
 const before=JSON.stringify({comps,modules,topo});
 const ready=prepareRootDesign(comps,modules,topo),id=ready.moduleId;
 assert.ok(ready.ok);
 assert.equal(ready.modules.find(m=>m.id===id).name,'我的夾爪');
 assert.deepEqual(ready.topo.assemblyMembers,[id,lift.module.id]);
 assert.deepEqual(ready.comps.slice(0,grip.comps.length).map(({moduleId,...c})=>c),grip.comps);
 assert.deepEqual(ready.comps.slice(grip.comps.length),lift.comps);
 assert.equal(JSON.stringify({comps,modules,topo}),before,'preparation is pure and keeps undo source');
 assert.equal(prepareRootDesign(ready.comps,ready.modules,ready.topo).ok,false,'cannot duplicate prepared design');
 const surfaces=selectableMountSurfaces({comps:ready.comps,modules:ready.modules,params:topo.params,moduleId:lift.module.id});
 assert.ok(surfaces.some(s=>s.kind==='output'&&s.name==='臂端'),'actual host option exists');
 assert.ok(buildMountSurfaces({comps:ready.comps,modules:ready.modules,params:topo.params,moduleId:id,partId:'H3Frame'}).surfaces.some(s=>s.compId==='H3Frame'),'actual installation part exists');
 const joined=mountModule(ready.comps,ready.modules,id,{module:lift.module.id,output:'tool'},topo.params,{theta:0,motorAngles:{}});
 assert.ok(joined.ok,joined.reason);
 const reopened=normalizeSnapshot({kind:'blocks',v:1,...joined,params:topo.params,assemblyMembers:ready.topo.assemblyMembers});
 const liftS=reopened.comps.find(c=>c.moduleId===lift.module.id&&c.type==='syringe');
 const gripS=reopened.comps.find(c=>c.id==='H3Syringe'),host=reopened.modules.find(m=>m.id===lift.module.id);
 const child=reopened.modules.find(m=>m.id===id),tool=host.outputs.find(o=>o.id==='tool');
 const positions=[];
 for(const le of [0,10,20])for(const ge of [0,10,20]){
  const cs=structuredClone(reopened.comps);cs.find(c=>c.id===liftS.id).extension=le;cs.find(c=>c.id===gripS.id).extension=ge;
  const sol=solveAssembly(compileAssembly(cs,reopened.modules,{params:reopened.params}),{thetaDeg:0,motorAngles:{}});
  assert.ok(sol.isValid,sol.errorReason);
  assert.ok(Math.hypot(sol.points[child.base].x-sol.points[tool.at].x,sol.points[child.base].y-sol.points[tool.at].y)<1e-6,'gripper follows lift endpoint');
  if(ge===0)positions.push(sol.points[child.base]);
 }
 assert.ok(Math.hypot(positions[0].x-positions[2].x,positions[0].y-positions[2].y)>1,'lift actually moves child');
 const excluded=prepareRootDesign(comps,modules,{...topo,assemblyMembers:[lift.module.id]});
 assert.deepEqual(excluded.topo.assemblyMembers,[lift.module.id],'does not rejoin excluded root');
 const loose={type:'anchor',id:'Loose',p1:{id:'LooseP',type:'fixed',x:999,y:999}};
 const whole=prepareRootDesign([...comps,loose],modules,topo);
 assert.equal(whole.comps.at(-1).moduleId,whole.moduleId,'whole design retained including disconnected parts');
 console.log('PASS unit 10 root preparation, endpoint options, motion, persistence and membership');
}
for(const n of [1,2,3]){
 const id=`hydraulic-h0${n}`,complete=getExample(id).snapshot,before=JSON.stringify(complete);
 const practice=getExample(id+'-practice').snapshot,source=normalizeSnapshot(practice);
 assert.equal(source.comps.some(c=>c.type==='syringe'),false);
 assert.deepEqual(practice.params,complete.params);
 assert.deepEqual(practice.comps,complete.comps.filter(c=>c.type!=='syringe'));
 const c=complete.comps.find(c=>c.type==='syringe'),f=source.comps.find(part=>part.id===c.a.componentId);
 // Rounded angles match the hints students actually enter, not exact hidden values.
 const angle=[0,153.57,.62][n-1],typed=[{x:f.p1.x,y:f.p1.y},{x:59.27,y:100.62},{x:-26,y:253.37}][n-1];
 // Follow the rounded lesson values and the real "move to frame" projection.
 const frame=attachmentFrame(f,source.params),along=Math.max(0,Math.min(frame.length,(typed.x-frame.p.x)*frame.x+(typed.y-frame.p.y)*frame.y));
 const request={newId:'StudentSyringe',frameId:f.id,
  position:{x:frame.p.x+along*frame.x,y:frame.p.y+along*frame.y},axisDeg:angle,b:c.b};
 const plan=planPlacedSyringe(source,request);
 assert.ok(plan.ok,plan.message);
 assert.ok(scanSyringe(plan.comps,plan.params,plan.syringe.id).ok);
 const reopened=normalizeSnapshot({kind:'blocks',v:1,comps:plan.comps,params:plan.params});
 assert.ok(scanSyringe(reopened.comps,reopened.params,'StudentSyringe').ok);
 if(n===1){
  const l=plan.params.H1Frame;
  const moved=planPlacedSyringe(plan,{...request,id:plan.syringe.id,position:{x:f.p1.x+200/l,y:f.p1.y+120/l}});
  assert.ok(moved.ok,moved.message);assert.ok(scanSyringe(moved.comps,moved.params,plan.syringe.id).ok);
 }
 if(n===2){
  const params={...plan.params,H2Arm:145.892,H2Tail:plan.params.H2Reach-145.892};
  assert.ok(scanSyringe(plan.comps,params,plan.syringe.id).ok);
  const solved=solveSyringe(plan.comps,params);
  assert.deepEqual(syringeReading(plan.syringe,plan.comps,params,solved.points).end,solved.points.H2C,'newly installed syringe measures the actual 250 mm tip');
 }
 assert.equal(JSON.stringify(complete),before,'original reference unchanged');
 console.log('PASS',id,'install, stroke, persistence and reference preservation');
}
const html=readFileSync('teaching-hydraulic.html','utf8');
assert.ok(!/\d+\.\d{3,}/.test(html),'lesson values use at most two decimals');
for(const id of ['unit-8','unit-9','unit-10','unit-11']){
 assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.ok(readFileSync('teaching.html','utf8').includes('teaching-hydraulic.html#'+id));
}
for(const [,src] of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)){
 if(!/^https?:/.test(src))assert.ok(existsSync(src),'missing course resource '+src);
}
for(const [,id] of html.matchAll(/href="#([^"]+)"/g))assert.ok(html.includes(`id="${id}"`),'missing section '+id);
assert.ok(html.includes('推出收攏')&&html.includes('交叉夾臂'),'variant boundary is explicit');
console.log('PASS four-unit navigation and local assets');
