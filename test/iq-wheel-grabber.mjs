import assert from 'node:assert/strict';
import {IQ_WHEEL_GRABBER_EXAMPLE as example} from '../js/blocks/iq-wheel-grabber-example.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {motionPoseIssue} from '../js/blocks/solve-health.js';
import {pointRotation,rotateLooseBarEnd} from '../js/blocks/model.js';
import {buildFaceCandidate,validateFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {faceBracketStatus} from '../js/blocks/face-bracket-extras.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
const original=JSON.stringify(example.snapshot),s=normalizeSnapshot(example.snapshot),before=structuredClone(s);
assert.equal(s.comps.length,7);
assert.ok(s.comps.every(c=>!c.isInput&&!c.physicalMotor&&!c.p1.physicalMotor));
let candidate;
for(const m of s.modules.filter(m=>m.mount)){
 const detached=structuredClone(s);detached.modules.find(q=>q.id===m.id).mount=null;
 candidate=buildFaceCandidate(detached,{childId:m.id,hostEndpoint:{moduleId:'GrabBack',outputId:'tool',partId:'GrabBack'},childEndpoint:{partId:m.id},selection:m.mount.face.selection});
 assert.ok(candidate.ok,candidate.reason);assert.equal(JSON.stringify(candidate.work.modules.find(q=>q.id===m.id).mount),JSON.stringify(m.mount));
 assert.equal(candidate.bracket.physical.length,1);assert.ok(faceBracketStatus(s.comps,s.modules,s.params,m).fixed);
 const check=await validateFaceCandidate(candidate);assert.ok(check.saveable);assert.deepEqual(check.validation.material.findings,[]);
 const bad=structuredClone(m.mount.face.selection);bad.brackets.offsets.L1=99;
 assert.equal(buildFaceCandidate(detached,{childId:m.id,hostEndpoint:{moduleId:'GrabBack',outputId:'tool',partId:'GrabBack'},childEndpoint:{partId:m.id},selection:bad}).ok,false);
}
const {catalog}=faceCandidateModel(candidate);
for(const [id,expected] of [['GrabBack',[85,21]],['GrabLeft',[37,13]],['GrabRight',[37,13]],['GrabLeftArm',[85,13]],['GrabRightArm',[85,13]]]){
 const part=catalog.parts[id],xs=part.outlines.flat().map(p=>p.x),ys=part.outlines.flat().map(p=>p.y);
 assert.deepEqual([Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],expected);
 assert.equal(s.comps.find(c=>c.id===id).stock.widthMm,13);assert.equal(part.thicknessMm,3);
}
assert.deepEqual(s.comps.find(c=>c.id==='GrabLeftArm').p1,{id:'GrabLeftA',type:'fixed',x:16,y:0},'standard stock does not move the original arm pivot');
assert.equal(Object.values(catalog.parts).filter(p=>p.kind==='bracket-wing').length,4);
assert.equal(Object.values(catalog.parts).filter(p=>p.kind==='triangle').flatMap(p=>p.holes).filter(h=>h.holePairId).length,4);
const pose=solveAssembly(compileAssembly(s.comps,s.modules,{params:s.params}),{thetaDeg:0});
assert.equal(motionPoseIssue(s.comps,pose).code,'underconstrained','passive arms must not claim automatic animation');
const local=s.comps.filter(c=>c.moduleId==='GrabLeft');
for(const degrees of [70,85,100]){
 const a=degrees*Math.PI/180,target={x:16+72*Math.cos(a),y:72*Math.sin(a)};
 const wheelBefore=local.find(c=>c.id==='GrabLeftWheel'),offset={x:wheelBefore.p2.x-wheelBefore.p1.x,y:wheelBefore.p2.y-wheelBefore.p1.y};
 assert.ok(rotateLooseBarEnd(local,s.params,'GrabLeftWheelAxis',target));
 assert.ok(Math.abs(pointRotation(local,s.params,'GrabLeftWheelAxis').angle-degrees)<1e-8);
 const arm=local.find(c=>c.id==='GrabLeftArm'),wheel=local.find(c=>c.id==='GrabLeftWheel');
 assert.ok(Math.abs(Math.hypot(arm.p2.x-arm.p1.x,arm.p2.y-arm.p1.y)-72)<.001);
 assert.deepEqual(arm.p2,wheel.p1);
 assert.ok(Math.abs(Math.hypot(wheel.p2.x-wheel.p1.x,wheel.p2.y-wheel.p1.y)-8)<.001);
 assert.ok(Math.abs(wheel.p2.x-wheel.p1.x-offset.x)<1e-8&&Math.abs(wheel.p2.y-wheel.p1.y-offset.y)<1e-8,'reference pin translates without imposing wheel spin');
 assert.deepEqual(s.comps.filter(c=>c.moduleId==='GrabRight'),before.comps.filter(c=>c.moduleId==='GrabRight'),'independent right pivot');
}
for(const change of [c=>c.find(c=>c.shape==='disk').p2.type='fixed',c=>c.find(c=>c.shape==='disk').isInput=true,c=>c.find(c=>c.shape==='disk').p1.physicalMotor='1',c=>c.find(c=>c.shape==='disk').type='gear',c=>c.find(c=>c.shape==='disk').type='pulley',c=>c.push({...structuredClone(c.find(c=>c.shape==='disk')),id:'extra'}),c=>c.push({id:'actuator',type:'syringe',a:{componentId:c.find(c=>c.shape==='disk').id}})]){
 const constrained=structuredClone(local);change(constrained);assert.equal(pointRotation(constrained,s.params,'GrabLeftWheelAxis'),null,'constraint branches do not become free arm rotation');
}
for(const format of ['svg','dxf']){
 const out=prepareScopedExport({...s,topo:s,fabrication:structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export},{scope:'assembly'},format);
 assert.equal(out.files.length,7);assert.ok(out.files.every(f=>!/(NaN|Infinity)/.test(f.text)));
 assert.equal(out.files.filter(f=>f.text.includes('ADAPTER_HOLE')).length,3,'both actual corner pairs reach board exports');
}
assert.deepEqual(normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(s.comps,s,s.counter,s)))).comps,s.comps);
assert.equal(JSON.stringify(example.snapshot),original,'pose edits do not mutate the source');
console.log('PASS iq-wheel-grabber: independent passive pivots, linked wheel axes, two real corners, refusal, export and roundtrip');
