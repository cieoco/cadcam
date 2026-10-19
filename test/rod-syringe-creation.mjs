import assert from 'node:assert/strict';
import {hydraulicSnapshot} from '../js/blocks/hydraulic-example.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {placeFixedSyringe} from '../js/blocks/syringe-placement.js';
import {scanSyringe} from '../js/blocks/syringe-operations.js';
import {builtinTemplate,normalizeTemplate,instantiateTemplate} from '../js/blocks/module-ops.js';
import {compileAssembly,solveAssembly,rebakeModules} from '../js/blocks/assembly.js';

// Same physical geometry, arbitrary user IDs and reversed drawing directions.
const renamed=JSON.parse(JSON.stringify(hydraulicSnapshot).replaceAll('H1','Student'));
const n=normalizeSnapshot(renamed),cs=n.comps.filter(c=>c.type!=='syringe');
for(const c of cs)[c.p1,c.p2]=[c.p2,c.p1];
// Real UI reuses shared node IDs but new member copies are floating.
cs.find(c=>c.id==='StudentArm').p2.type='floating';
const points=Object.fromEntries(cs.flatMap(c=>[c.p1,c.p2]).map(p=>[p.id,p]));
const before=JSON.stringify(cs);
const r=placeFixedSyringe(cs,n.params,points,{componentId:'StudentFrame',u:n.params.StudentFrame,v:0},{componentId:'StudentCoupler',u:80,v:0});
assert.ok(r.ok,r.message);assert.equal(r.syringe.outputId,'StudentArm');
const scan=scanSyringe([...cs,r.syringe],n.params,r.syringe.id);
assert.ok(scan.ok,scan.message);assert.equal(JSON.stringify(cs),before);
const reference=scanSyringe(hydraulicSnapshot.comps,hydraulicSnapshot.params,'H1Syringe');
scan.samples.forEach((s,i)=>assert.ok(Math.abs(s.angle-reference.samples[i].angle)<1e-5));
const saved=normalizeSnapshot(JSON.parse(JSON.stringify({kind:'blocks',v:1,comps:[...cs,r.syringe],params:n.params})));
assert.ok(scanSyringe(saved.comps,saved.params,r.syringe.id).ok);

// Two insertions of each existing example: IDs, attachment references and all
// 0/10/20 mm poses survive normalization, without changing source templates.
for(const id of ['hydraulic-lift','hydraulic-gripper','hydraulic-base']){
  const template=builtinTemplate(id),original=JSON.stringify(template);
  assert.ok(normalizeTemplate(template).ok,id);
  const one=instantiateTemplate(template,{counter:0,place:{x:0,y:0}});
  const two=instantiateTemplate(template,{counter:10,place:{x:400,y:0}});
  const comps=[...one.comps,...two.comps],modules=[one.module,two.module],params={...one.params,...two.params};
  const syr=comps.filter(c=>c.type==='syringe');assert.equal(syr.length,2);
  for(const s of syr){assert.ok(comps.some(c=>c.id===s.a.componentId));assert.ok(comps.some(c=>c.id===s.b.componentId));}
  for(const extension of [0,10,20]){
    const copy=structuredClone(comps);copy.filter(c=>c.type==='syringe').forEach(c=>c.extension=extension);
    const sol=solveAssembly(compileAssembly(copy,modules,{params}),{thetaDeg:0,motorAngles:{}});
    assert.ok(sol.isValid,`${id}: ${extension} ${sol.reason}`);
  }
  assert.equal(JSON.stringify(template),original);
}
console.log('Rod/syringe creation: arbitrary IDs, reverse drawing, scan/roundtrip and repeated hydraulic module insertion passed');

// New face workflow must allow the existing hydraulic mechanisms, while keeping
// syringe material explicitly unverified and refusing genuinely missing plates.
import {hydraulicLiftGripSnapshot,hydraulicArmSnapshot} from '../js/blocks/hydraulic-assembly-example.js';
import {buildFaceCandidate,validateFaceCandidate} from '../js/blocks/face-candidate.js';
import {candidateCoverageText} from '../js/blocks/face-candidate-view.js';
for(const [source,childId,hostId,hostPart,childPart,hostFace,childFace] of [
 [hydraulicLiftGripSnapshot,'Grip','Lift','H2Arm','H3Frame','front','back'],
 [hydraulicArmSnapshot,'Lift','Base','H4Turn','H2Frame','front','bottom']]){
 const saved=JSON.stringify(source),work=normalizeSnapshot(source);
 const baked=rebakeModules(work.comps,work.modules,work.params);work.comps=baked.comps;work.modules=baked.modules;
 const candidate=buildFaceCandidate(work,{childId,hostEndpoint:{moduleId:hostId,partId:hostPart},childEndpoint:{partId:childPart},reselect:true,
  selection:{hostFace,childFace,alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0}});
 assert.ok(candidate.ok,candidate.reason);
 if(childId==='Lift'){
  const withHoles=buildFaceCandidate(work,{childId,hostEndpoint:{moduleId:hostId,partId:hostPart},childEndpoint:{partId:childPart},reselect:true,
   selection:{hostFace,childFace,alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,brackets:{enabled:true,offsets:{},childPart}}});
  assert.equal(withHoles.ok,false,'requested holes cannot silently downgrade to geometry-only placement');
  assert.equal(withHoles.validation.checks[0].code,'fastener_invalid');
 }

 const checked=await validateFaceCandidate(candidate);

 assert.ok(checked.saveable,checked.reason);
 assert.ok(checked.model.syringes.length>=2);
 assert.ok(checked.validation.coverage.notSupported.some(r=>r.kind==='syringe'));
 assert.notEqual(checked.validation.status,'pass');
 assert.match(candidateCoverageText(checked).summary,/針筒/);
 const blocked=await validateFaceCandidate(candidate,{},async model=>({status:'not_supported',geometryKey:model.geometryKey,poseRevision:model.poseRevision,findings:[],coverage:{notSupported:[{code:'material_geometry_unavailable',partId:childPart}]}}));
 assert.equal(blocked.saveable,false);
 const round=normalizeSnapshot(JSON.parse(JSON.stringify({kind:'blocks',v:1,...work,comps:checked.work.comps,modules:checked.work.modules,params:checked.work.params,fabrication:checked.work.fabrication})));
 assert.ok(round);
 assert.ok(solveAssembly(compileAssembly(round.comps,round.modules,{params:round.params}),{thetaDeg:0,motorAngles:{}}).isValid);
 assert.equal(JSON.stringify(source),saved);
}
console.log('Hydraulic face candidates: H05/H06 editable members, preserved syringes/roundtrip, explicit partial coverage and missing-board refusal passed');
