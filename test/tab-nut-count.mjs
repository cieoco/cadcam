import assert from 'node:assert/strict';
import {fourWheelChassisSnapshot} from './fixtures/chassis-positioned.mjs';
import {refreshFaceMounts} from '../js/blocks/face-mount-refresh.js';
import {renderTabNutDimensions} from '../js/blocks/tab-nut-parameter-ui.js';
import {TAB_NUT_DEFAULTS,normalizeTabNut} from '../js/blocks/tab-nut-geometry.js';
import {buildFaceCandidate,validateFaceCandidate} from '../js/blocks/face-candidate.js';
import {tabNutPlans} from '../js/blocks/tab-nut-plan.js';
import {sameFacePlacement} from '../js/blocks/face-wizard-ui.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {buildPlan,hardwareList} from '../js/blocks/build-plan.js';
import {faceFileExportData} from '../js/blocks/face-export.js';

const work=fourWheelChassisSnapshot();
work.modules.find(m=>m.id==='Mod1').mount.face.selection.faceRelations[0].offsetMm=-10;
work.modules=refreshFaceMounts(work.comps,work.modules,work.params,{stockMm:3,exportSettings:work.fabrication.export}).modules;
const mount=work.modules.find(m=>m.id==='Mod1').mount,before=JSON.stringify(work);
const request=count=>({childId:'Mod1',reselect:true,hostEndpoint:{moduleId:'Mod2',partId:'Blank137'},childEndpoint:{partId:'Blank3'},selection:{...mount.face.selection,fastener:{...TAB_NUT_DEFAULTS,contactMode:'actual',setCount:count}}});
let two;
for(const count of [1,2,3,4]){
 const candidate=buildFaceCandidate(work,request(count));assert.ok(candidate.ok,`${count}: ${candidate.reason}`);
 const p=candidate.tabNut;assert.equal(p.sets.length,count);assert.equal(p.hostGeometry.cutouts.filter(c=>c.layer==='TAB_NUT_SLOT').length,count*2);assert.equal(p.hostGeometry.holes.filter(h=>h.layer==='TAB_NUT_BOLT').length,count);
 const along=p.sets.map(s=>s.settings.alongMm);assert.ok(Math.abs(along[0]+along.at(-1))<1e-6,'groups are symmetric around the requested center');
 if(count>2){const gaps=along.slice(1).map((v,i)=>v-along[i]);assert.ok(gaps.every(v=>Math.abs(v-gaps[0])<1e-6),'multiple groups use equal spacing');}
 assert.ok(sameFacePlacement(mount,candidate.work.modules.find(m=>m.id==='Mod1').mount));
 const disk=storedProject(candidate.work);assert.ok(disk.requires.includes('tab-nut-count-v1'));assert.equal(normalizeSnapshot(disk).modules.find(m=>m.id==='Mod1').mount.face.selection.fastener.setCount,count);
 if(count===2)two=candidate;
}
for(const count of [5,6])assert.equal(buildFaceCandidate(work,request(count)).ok,false,'crowded groups must fail rather than overlap');
for(const count of [0,7,1.5,NaN])assert.equal(normalizeTabNut({...TAB_NUT_DEFAULTS,setCount:count}),null);
assert.equal(normalizeTabNut({...TAB_NUT_DEFAULTS,setCount:2,moreAlongMm:[30]}),null,'automatic count cannot conflict with legacy custom offsets');
const attrs={};globalThis.document={createElementNS:()=>({setAttribute(){}})};renderTabNutDimensions({replaceChildren(){},toggleAttribute(){},setAttribute:(k,v)=>attrs[k]=v,append(){}},{},two.tabNut);delete globalThis.document;
assert.ok(Number(attrs.viewBox.split(' ')[2])>two.tabNut.settings.tabPitchMm*2,'dimension preview spans all groups rather than cropping to the first one');assert.match(attrs['aria-label'],/2 組/);
const checked=await validateFaceCandidate(two,{theta:0,motorAngles:{'1':0,'2':0,'3':0,'4':0}});assert.ok(checked.saveable,checked.reason);assert.equal(checked.validation.material.findings.length,0);
const data=faceFileExportData(checked.work),plan=buildPlan({...checked.work,extras:data.extras,exportSettings:work.fabrication.export});assert.equal(plan.joints.filter(j=>j.kind==='tab-nut').length,2);assert.equal(hardwareList(plan).find(h=>h.spec==='M3×12').qty,2);
const peers=structuredClone(checked.work),side=peers.modules.find(m=>m.id==='Mod1');side.mount.face.selection.fastener.peers=[{moduleId:'Mod141',partId:'Blank137_141',settings:{...TAB_NUT_DEFAULTS,contactMode:'actual',setCount:1}}];
const ps=tabNutPlans(peers.comps,peers.modules,peers.params,{stockMm:3,exportSettings:work.fabrication.export});assert.equal(ps.find(p=>p.moduleId==='Mod1'&&!p.peer).sets.length,2);assert.equal(ps.find(p=>p.peer).sets.length,1);
assert.ok(storedProject(peers).requires.includes('tab-nut-count-v1'));
assert.equal(JSON.stringify(work),before);
console.log('tab count: 1–4 evenly spaced groups, per-contact counts, 2 tabs/slot pairs per group, material, crowding refusal, pose/source preservation, roundtrip and BOM passed');
