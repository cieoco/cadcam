import assert from 'node:assert/strict';
import {IQ_PASSIVE_TOOL_EXAMPLES as examples} from '../js/blocks/iq-passive-tools-examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {buildFaceCandidate,validateFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {faceBracketPlan,faceBracketStatus} from '../js/blocks/face-bracket-extras.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {validateFaceExport} from '../js/blocks/face-export.js';
import {hardwareList} from '../js/blocks/build-plan.js';
const combined=examples[2].snapshot;
for(const example of examples){
 const s=normalizeSnapshot(example.snapshot),before=JSON.stringify(s);
 assert.equal(s.comps.filter(c=>c.id==='Back').length,1);
 assert.ok(s.comps.every(c=>c.type==='triangle'&&c.p1.type==='fixed'));
 for(const comp of example.snapshot.comps)assert.deepEqual(comp,combined.comps.find(c=>c.id===comp.id),'separate and combined tools reuse identical editable geometry');
 let candidate,count=0;
 for(const m of s.modules.filter(m=>m.mount)){
  const detached=structuredClone(s);detached.modules.find(x=>x.id===m.id).mount=null;
  const host=s.modules.find(x=>x.id===m.mount.to.module);
  candidate=buildFaceCandidate(detached,{childId:m.id,hostEndpoint:{moduleId:host.id,outputId:'tool',partId:host.id},childEndpoint:{partId:m.id},selection:m.mount.face.selection});
  assert.ok(candidate.ok,m.id+': '+candidate.reason);
  const actual=candidate.work.modules.find(x=>x.id===m.id).mount;
  assert.deepEqual(actual.to,m.mount.to);assert.deepEqual(actual.face.selection,m.mount.face.selection);
  for(const k of ['x','y','z'])assert.ok(Math.abs(actual.face.translation[k]-m.mount.face.translation[k])<1e-9,m.id+' '+k);
  actual.face.rotation.flat().forEach((v,i)=>assert.ok(Math.abs(v-m.mount.face.rotation.flat()[i])<1e-9));
  const check=await validateFaceCandidate(candidate);assert.ok(check.saveable,check.reason);assert.deepEqual(check.validation.material.findings,[]);
  assert.equal(candidate.bracket.physical.length,1);count++;
  assert.ok(faceBracketStatus(s.comps,s.modules,s.params,m).fixed);
  if(m.id==='ForkL'){
   const nose=buildFaceCandidate(detached,{childId:m.id,hostEndpoint:{moduleId:'Back',outputId:'tool',partId:'Back'},childEndpoint:{partId:m.id},selection:{...m.mount.face.selection,hostFace:'top',childFace:'left',quarterTurns:0,offsetV:-8}});
   assert.equal(nose.ok,false,'a capsule nose cannot support the whole bracket footprint');
   assert.match(nose.reason,/角碼底面/);
  }
  const bad=structuredClone(m);bad.mount.face.selection.brackets.offsets.L1=99;
  assert.equal(faceBracketPlan(s.comps,s.modules.map(q=>q.id===m.id?bad:q),s.params,bad).ok,false,'offset still rejects unsupported footprint');
 }
 const {model,catalog}=faceCandidateModel(candidate);
 for(const part of Object.values(catalog.parts).filter(p=>p.kind==='triangle')){
  const comp=s.comps.find(c=>c.id===part.id),xs=part.outlines.flat().map(p=>p.x),ys=part.outlines.flat().map(p=>p.y);
  const expected=part.id==='Back'?[85,21]:part.id.startsWith('Fork')?[69,13]:part.id.endsWith('Corner')?[29,29]:[61,21];
  assert.deepEqual([Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],expected,'source hole-count proportions use standard outer dimensions');
  assert.equal(comp.stock.widthMm,13);assert.equal(comp.stock.thicknessMm,3);
  assert.ok(comp.vertices.filter(v=>!v.solve).every(v=>v.u%8===0&&v.v%8===0),'shape corners stay on the existing 8mm grid');
 }
 assert.equal(Object.values(catalog.parts).filter(p=>p.kind==='triangle').length,s.comps.length,'all actual plates represented');
 assert.equal(Object.values(catalog.parts).filter(p=>p.kind==='bracket-wing').length,count*2);
 assert.equal(Object.values(catalog.parts).filter(p=>p.kind==='triangle').flatMap(p=>p.holes).filter(h=>h.holePairId).length,count*2,'both real plate holes are present');
 assert.equal(Object.values(catalog.parts).some(p=>p.kind==='frame'),false,'no duplicate automatic frame');
 const pack=await validateFaceExport(s,{});assert.ok(pack.ok,pack.reason);
 assert.ok(hardwareList(pack.plan).some(r=>r.spec.includes('帶牙金屬角碼')&&r.qty===count),'manufacturing hardware count matches the real brackets');
 for(const format of ['svg','dxf']){
  const out=prepareScopedExport({...s,topo:s,fabrication:structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export},{scope:'assembly'},format);
  assert.equal(out.files.length,s.comps.length);
  assert.ok(out.files.every(f=>f.text.includes('ADAPTER_HOLE')&&!/(NaN|Infinity)/.test(f.text)),'each board export includes its paired M3 holes');
 }
 assert.equal(JSON.stringify(s),before,'preview does not mutate the work');
 assert.deepEqual(normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(s.comps,s,s.counter,s)))).modules,s.modules);
 console.log('PASS',example.id,count,'real brackets, complete footprints, holes, zero interference and roundtrip');
}
