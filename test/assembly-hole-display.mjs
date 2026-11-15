import assert from 'node:assert/strict';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {faceCandidateModel,buildFaceCandidate,validateFaceCandidate} from '../js/blocks/face-candidate.js';
import {partHoleDisplay} from '../js/blocks3d/hole-display.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {storedProject} from '../js/blocks/project-envelope.js';
const a=makeStandardBlank({kind:'plate',columns:12,rows:8,n:1}),b=makeStandardBlank({kind:'plate',columns:12,rows:8,n:2,origin:{x:160,y:0}});
for(const [n,q]of [a,b].entries()){q.comp.moduleId='M'+n;for(const k of ['p1','p2','p3'])q.comp[k].type='fixed';}
const work={kind:'blocks',v:1,comps:[a.comp,b.comp],params:{...a.params,...b.params},modules:[a,b].map((q,i)=>({id:'M'+i,name:'板'+i,base:q.comp.p1.id,outputs:[{id:'body',at:q.comp.p1.id,body:{kind:'triangle',id:q.comp.id}}],mount:null}))};
const original=JSON.stringify(work),model=faceCandidateModel({ok:true,work,validation:{checks:[]}}).model;
const parts=[a,b].map(q=>model.materialParts.find(p=>p.partId===q.comp.id));
const reserve=parts.map(p=>partHoleDisplay(model,p).reserved);assert.ok(reserve.every(h=>h.length>50));
assert.ok(parts.every(p=>p.geometry.holes.length===3),'unused lattice holes remain uncut');
const req={childId:'M1',hostEndpoint:{moduleId:'M0',partId:a.comp.id},childEndpoint:{partId:b.comp.id},selection:{hostFace:'top',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:2,quarterTurns:0,rotationDeg:0,pin:{hostHole:reserve[0][10].id,childHole:reserve[1][10].id,diameterMm:3,locked:false}}};
const candidate=buildFaceCandidate(work,req);assert.ok(candidate.ok,candidate.reason);const checked=await validateFaceCandidate(candidate);assert.ok(checked.saveable,checked.reason);
for(let i=0;i<2;i++){const part=checked.model.materialParts.find(p=>p.partId===parts[i].partId);assert.ok(part.geometry.holes.some(h=>h.id===reserve[i][10].id),'only selected reserved hole becomes machined');assert.equal(part.geometry.holes.length,4);assert.equal(partHoleDisplay(checked.model,part).reserved.length,reserve[i].length-1);}
const reopened=normalizeSnapshot(storedProject(candidate.work));assert.ok(reopened);assert.equal(reopened.modules[1].mount.face.selection.pin.hostHole,reserve[0][10].id);
const omit=structuredClone(model);omit.holeDisplaySource.omitted={[parts[0].partId]:{omittedHoleIds:[reserve[0][0].id]}};assert.ok(!partHoleDisplay(omit,omit.materialParts.find(p=>p.partId===parts[0].partId)).reserved.some(h=>h.id===reserve[0][0].id),'joinery strength omissions cannot be resurrected');
const full=structuredClone(model),p=full.materialParts.find(p=>p.partId===parts[0].partId);p.geometry.holes.push(...reserve[0]);assert.ok(partHoleDisplay(full,p).holes.length<10);assert.equal(partHoleDisplay(full,p,true).holes.length,p.geometry.holes.length);
assert.equal(JSON.stringify(work),original,'display and candidates never alter source or drill every grid hole');
console.log('reserved grid holes: visible/pickable, selected-only machining, paired pin, v1 reopen, strength exclusions, compact/full and immutable source');
