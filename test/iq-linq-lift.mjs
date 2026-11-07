import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {validateMotionRange} from '../js/blocks/motion-range-validation.js';
import {servoRange} from '../js/blocks/motor-tools.js';
import {gridIssues} from '../js/blocks/grid-rule.js';
import {planBarFusionResize} from '../js/blocks/bar-fusion-resize.js';
import {preserveFaceEditReference} from '../js/blocks/face-edit-reference.js';
import {prepareConnectionWork} from '../js/blocks/connection-work.js';
import {faceBracketPlan} from '../js/blocks/face-bracket-extras.js';
import {faceCandidateModel,buildFaceCandidate} from '../js/blocks/face-candidate.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
import {findInterference,resolveSpacers} from '../js/blocks/interference.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {inspectGearExport,exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
const near=(a,b,t=1e-4)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const s=normalizeSnapshot(structuredClone(getExample('iq-linq-lift').snapshot)),before=JSON.stringify(s);
// Explicit scissor mounts preserve exactly the values previously synthesized by
// schema, while example authoring no longer calls schema during module startup.
const scissor=getExample('guided-scissor-lift').snapshot,implicit=structuredClone(scissor);
implicit.comps.filter(c=>c.type==='slider').forEach(c=>{delete c.m1;delete c.m2;});
const restored=normalizeSnapshot(implicit),explicit=normalizeSnapshot(scissor),coords=p=>({id:p.id,type:p.type,x:p.x,y:p.y});
for(const c of explicit.comps.filter(c=>c.type==='slider'))for(const key of ['m1','m2'])assert.deepEqual(coords(c[key]),coords(restored.comps.find(o=>o.id===c.id)[key]));

assert.equal(s.tracePoint,'LinqTrayTip');assert.equal(s.comps.filter(c=>c.p1?.physicalMotor).length,1);
assert.deepEqual(servoRange(s.comps,'1'),{lo:0,hi:120});
assert.equal(s.fabrication.drive.hornScrewCount,0);assert.equal(s.fabrication.drive.hornCenterMm,3.2);
// Source effective hole counts: 10 / 11 / 4 / 5 pitches, scaled uniformly by 2.
assert.deepEqual([s.params.LinqDrivePin+s.params.LinqDriveReach,s.params.LinqFollower,s.params.LinqTraySpan,304-224],[160,176,64,80]);
assert.equal(s.params.LinqDriveBack,16);assert.equal(s.params.LinqTrayDrop,24);
assert.equal(s.params.LinqTrayReach,240);assert.equal(s.params.LinqDeckWidth,144);
const issues=gridIssues(s.comps,s.params);assert.equal(issues.length,1);assert.equal(issues[0].componentId,'LinqMotorGear');assert.equal(issues[0].valueMm,4);
for(const gear of s.comps.filter(c=>c.type==='gear')){
 const g=inspectGearExport(gear,s.params,{drive:s.fabrication.drive},s.comps),root=gear.module*(gear.teeth/2-1.25);
 for(const h of g.holes)assert.ok(Math.hypot(h.x,h.y)+h.r+.5<=root);
 for(let i=0;i<g.holes.length;i++)for(let j=i+1;j<g.holes.length;j++){const a=g.holes[i],b=g.holes[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r+.5);}
}
const isolated=comps=>comps.filter(c=>c.moduleId==='LinqLift').map(({moduleId,...c})=>c);
const root={...s,modules:[],comps:isolated(s.comps)};
assert.equal(validateMotionRange(root,{startDeg:0,endDeg:120,motorId:'1'}).ok,true);
const asm=compileAssembly(s.comps,s.modules,{params:s.params});let start,end;
for(let theta=0;theta<=120;theta+=.5){
 const r=solveAssembly(asm,{thetaDeg:theta}),p=r.points;assert.ok(r.isValid&&!r.isUnderconstrained);
 const a=(235-theta/5)*Math.PI/180;near(p.LinqReach.x,160*Math.cos(a));near(p.LinqReach.y,224+160*Math.sin(a));
 const u={x:(p.LinqTrayTop.x-p.LinqReach.x)/64,y:(p.LinqTrayTop.y-p.LinqReach.y)/64};
 near(p.LinqTrayHeel.x,p.LinqReach.x-24*u.x);near(p.LinqTrayHeel.y,p.LinqReach.y-24*u.y);
 near(p.LinqTrayTip.x,p.LinqTrayHeel.x-240*u.y);near(p.LinqTrayTip.y,p.LinqTrayHeel.y+240*u.x);
 if(theta===0)start=p;if(theta===120)end=p;
 if(theta%5===0){
  const m=faceCandidateModel({work:s},{theta}),model=m.model,deck=model.materialParts.find(p=>p.partId==='LinqTrayDeck');
  assert.equal(checkMaterialInterference(model).findings.length,0,`actual layers at ${theta}`);
  const args={...s,mounts:m.mounts,exportSettings:s.fabrication.export,joint:s.fabrication.joint},{plan}=resolveSpacers(args);
  assert.deepEqual(findInterference({...args,plan,pose:{'1':theta}}),[],`plan layers at ${theta}`);
  for(const [y,id]of [[0,'LinqTrayHeel'],[240,'LinqTrayTip']]){const q=applyMatrix4(deck.pose.matrix,{x:0,y,z:0});near(q.x,p[id].x);near(q.y,p[id].y);}
  const extent=ring=>[Math.max(...ring.map(p=>p.x))-Math.min(...ring.map(p=>p.x)),Math.max(...ring.map(p=>p.y))-Math.min(...ring.map(p=>p.y))];
  const f=model.materialParts.filter(p=>p.geometry.kind==='frame');assert.equal(f.length,1);const[fw,fh]=extent(f[0].geometry.outlines.flat());near(fw,101);near(fh,317);
  const[dw,dh]=extent(deck.geometry.outlines.flat());near(dw,157);near(dh,253);near(deck.geometry.thicknessMm,3);
 }
}
near(end.LinqTrayTip.y-start.LinqTrayTip.y,34.7686741402283);
const angle=p=>Math.atan2(p.LinqTrayTop.y-p.LinqReach.y,p.LinqTrayTop.x-p.LinqReach.x)*180/Math.PI;near(angle(end)-angle(start),3.368299);
// Keep the real refusal, rather than omitting bracket hardware and claiming it fits.
const deck=s.modules.find(m=>m.id==='LinqDeck'),bracket=buildFaceCandidate(s,{childId:deck.id,hostEndpoint:{moduleId:'LinqLift',partId:'LinqTray',outputId:'tray'},childEndpoint:{partId:'LinqTrayDeck'},selection:{...deck.mount.face.selection,brackets:{enabled:true,offsets:{},childPart:'LinqTrayDeck'}},reselect:true});
assert.equal(bracket.ok,false);assert.match(bracket.reason,/孔位超出材料或離邊太近/);assert.equal(deck.mount.face.selection.brackets,undefined);
const changed=planBarFusionResize(s.comps,s.params,'LinqDriveReach',136);assert.ok(changed.ok,changed.reason);assert.equal(changed.params.LinqDriveReach,136);
assert.equal(validateMotionRange({...root,...changed,comps:isolated(changed.comps)},{startDeg:0,endDeg:120,motorId:'1'}).ok,true);
assert.equal(planBarFusionResize(s.comps,s.params,'LinqDriveReach',0).ok,false);
// The attached deck must stay on the same physical edge after the precise edit.
const precisePlan=planBarFusionResize(s.comps,s.params,'LinqDriveReach',136.3),precise=preserveFaceEditReference(s,{...s,...precisePlan});assert.ok(precise.ok,precise.reason);
for(let theta=0;theta<=120;theta+=.5){const m=faceCandidateModel({work:precise},{theta}),d=m.model.materialParts.find(p=>p.partId==='LinqTrayDeck');for(const[y,id]of[[0,'LinqTrayHeel'],[240,'LinqTrayTip']]){const q=applyMatrix4(d.pose.matrix,{x:0,y,z:0});near(q.x,m.points[id].x);near(q.y,m.points[id].y);}}
const refreshed=structuredClone(precise),once=prepareConnectionWork(refreshed.comps,refreshed.modules,{params:refreshed.params}),twice=prepareConnectionWork(refreshed.comps,once.modules,{params:refreshed.params});assert.deepEqual(once.modules,twice.modules);assert.deepEqual(preserveFaceEditReference(s,s).modules,s.modules);
// A real existing M3 mounting keeps paired holes; review still handles changed drilling.
const claw=normalizeSnapshot(getExample('clawbot-lift-gripper').snapshot),extension=claw.comps.find(c=>c.id==='ClawLiftExtension'),clawPlan=planBarFusionResize(claw.comps,claw.params,extension.id,claw.params[extension.lenParam]+8),clawEdit=preserveFaceEditReference(claw,{...claw,...clawPlan});assert.ok(clawEdit.ok,clawEdit.reason);
for(const w of[claw,clawEdit]){const prepared=prepareConnectionWork(w.comps,w.modules,{params:w.params}),mod=prepared.modules.find(m=>m.id==='Grip1'),b=faceBracketPlan(w.comps,prepared.modules,w.params,mod);assert.ok(b.ok,b.reason);assert.equal(b.hostHoles.length,2);assert.equal(b.childHoles.length,2);}
const invalidOutput=structuredClone(s);invalidOutput.modules.find(m=>m.id==='LinqLift').outputs=[];assert.equal(preserveFaceEditReference(s,invalidOutput).ok,false,'missing output rejects the candidate without throwing');
const reopened=normalizeSnapshot(decodeShareString(encodeSnapshot({...s,...changed})));assert.equal(reopened.params.LinqDriveReach,136);assert.deepEqual(reopened.modules,s.modules);
assert.equal(JSON.stringify(s),before,'verification/cancel preserves the source');
const files=[],emit=(text,name)=>files.push({text,name}),settings={...s.fabrication.export,drive:s.fabrication.drive};
exportLinksAsSvg(s.comps,start,s.params,settings,[],null,emit);exportLinksAsDxf(s.comps,start,s.params,settings,[],null,emit);
assert.ok(files.some(f=>f.name.includes('LinqTrayDeck'))&&files.some(f=>f.name.includes('LinqMotorGear')));assert.ok(files.every(f=>!/(NaN|Infinity)/.test(f.text)));
console.log('IQ Linq rebuilt: 10:11:4:5, 241 poses, 25 actual-layer + plan material checks, 240×144 tray following heel/tip, 101×317 frame, precise resize/save and SVG/DXF passed; bracket remains explicitly unfastened');
