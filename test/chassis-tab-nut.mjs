import assert from 'node:assert/strict';
import {fourWheelChassisSnapshot} from '../js/blocks/four-wheel-chassis-example.js';
import {TAB_NUT_DEFAULTS,normalizeTabNut} from '../js/blocks/tab-nut-geometry.js';
import {tabNutPlans} from '../js/blocks/tab-nut-plan.js';
import {refreshFaceMounts} from '../js/blocks/face-mount-refresh.js';
import {buildFaceCandidate,validateFaceCandidate,createFaceCandidateTransaction} from '../js/blocks/face-candidate.js';
import {sameFacePlacement} from '../js/blocks/face-wizard-ui.js';
import {faceFileExportData} from '../js/blocks/face-export.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {storedProject,prepareMotorParts} from '../js/blocks/project-envelope.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {synchronizeDesignInstances} from '../js/blocks/design-instances.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
import {buildPlan,hardwareList,buildPackHtml} from '../js/blocks/build-plan.js';

const source=fourWheelChassisSnapshot();
for(const id of ['Mod1','Mod139'])source.modules.find(m=>m.id===id).mount.face.selection.faceRelations[0].offsetMm=-10;
source.modules.find(m=>m.id==='Mod141').mount.face.selection.faceRelations[1].offsetMm=10;
source.modules=refreshFaceMounts(source.comps,source.modules,source.params,{stockMm:3,exportSettings:source.fabrication.export}).modules;
const before=JSON.stringify(source),poses=new Map(source.modules.map(m=>[m.id,structuredClone(m.mount)]));
const settings=()=>({...TAB_NUT_DEFAULTS,contactMode:'actual'}),request=(w,id,fastener)=>{const m=w.modules.find(m=>m.id===id),host=w.modules.find(h=>h.id===m.mount.to.module),out=host.outputs.find(o=>o.id===m.mount.to.output);return {childId:id,reselect:true,hostEndpoint:{moduleId:host.id,partId:out.body.id},childEndpoint:{partId:m.mount.face.childPart},selection:{...m.mount.face.selection,fastener}};};
let state=structuredClone(source),undo=[];
// Build all four physical contacts through the same isolated candidates. Keep
// the expensive full material scan once; transaction races/once-only commit
// are independently exercised by tab-nut-storage-export and face-candidate.
for(const id of ['Mod1','Mod139','Mod141']){
 const fastener=settings();if(id==='Mod141')fastener.peers=[{moduleId:'Mod1',partId:'Blank3',settings:settings()}];
 const formal=JSON.stringify(state),candidate=buildFaceCandidate(state,request(state,id,fastener));assert.ok(candidate.ok,candidate.reason);
 assert.equal(JSON.stringify(state),formal,'preview has no formal side effects');
 assert.ok(sameFacePlacement(poses.get(id),candidate.work.modules.find(m=>m.id===id).mount));
 undo.push(structuredClone(state));state=structuredClone(candidate.work);
}
for(const m of state.modules.filter(m=>m.mount))assert.ok(sameFacePlacement(poses.get(m.id),m.mount));
assert.deepEqual(state.comps,source.comps,'joinery never writes holes into editable source boards');
console.log('four contact candidates built; checking complete material');
const roof=state.modules.find(m=>m.id==='Mod141');let cancelledCommits=0;
const cancelled=createFaceCandidateTransaction({readSource:()=>state,commit:()=>cancelledCommits++}),complete=await cancelled.preview(request(state,roof.id,roof.mount.face.selection.fastener));
assert.ok(complete.saveable,complete.reason);assert.equal(complete.validation.material.findings.length,0);cancelled.cancel();assert.equal(cancelledCommits,0);
const deck=structuredClone(complete.model.materialParts.find(p=>p.partId==='Blank137')),side=complete.model.materialParts.find(p=>p.partId==='Blank3');deck.geometry.cutouts=deck.geometry.cutouts.filter(c=>c.layer!=='TAB_NUT_SLOT');assert.ok(checkMaterialInterference({materialParts:[deck,side]}).findings.length>0,'dense-prism broad phase must detect a tab hitting a blocked slot');
console.log('material and cancellation passed; checking machining and persistence');
const plans=tabNutPlans(state.comps,state.modules,state.params,{stockMm:3,exportSettings:state.fabrication.export});assert.equal(plans.length,4);assert.ok(plans.every(p=>p.ok));
assert.equal(plans.filter(p=>p.child.compId==='Blank3').length,2);assert.equal(plans.filter(p=>p.child.compId==='Blank3_139').length,2);
const data=faceFileExportData(state),old=faceFileExportData(source),extras=data.extras;
assert.equal(extras.diagnostics?.filter(d=>d.status==='fail').length||0,0);
for(const c of state.comps.filter(c=>c.standardBlank)){
 const g=extras.tabNutGeometry[c.id];assert.ok(g);
 const original=old.extras.tabNutGeometry?.[c.id];assert.equal(original,undefined);
 // Every original manufacturing hole survives unless explicitly listed as an unused grid-hole omission.
 const oldSurface=plans.find(p=>p.host.compId===c.id||p.child.compId===c.id);const surface=oldSurface[oldSurface.host.compId===c.id?'host':'child'];
 for(const h of surface.holes)assert.ok(g.holes.some(q=>q.id===h.id&&q.x===h.x&&q.y===h.y)||g.omittedHoleIds.includes(h.id));
 for(const h of c.standardBlank.mountHoles||[])assert.ok(!g.omittedHoleIds.includes(h.id),'motor/shaft holes cannot be suppressed');
 if(c.id.startsWith('Blank3')){const ys=g.outlines[0].map(p=>p.y);assert.ok(Math.min(...ys)<surface.box.min.y-2.9&&Math.max(...ys)>surface.box.max.y+2.9,'both ends keep their tabs after merging');}
 else assert.equal(g.cutouts.filter(c=>c.layer==='TAB_NUT_SLOT').length,4,'each deck receives four matching slots');
}
const files=[];for(const fn of [exportLinksAsSvg,exportLinksAsDxf])fn(data.comps,data.points,data.params,data.settings,data.mounts,extras,(text,name)=>files.push({text,name}));
assert.equal(files.filter(f=>f.name.endsWith('.svg')&&f.text.includes('TAB_NUT_SLOT')).length,2);
const pack=buildPlan({...state,extras,exportSettings:state.fabrication.export});assert.equal(pack.joints.filter(j=>j.kind==='tab-nut').length,4);
assert.equal(hardwareList(pack).find(h=>h.spec==='M3×12').qty,4);assert.match(buildPackHtml(pack,{modules:state.modules}),/未使用格孔不加工/);
const disk=storedProject(state);assert.ok(disk.requires.includes('tab-nut-contact-v1'));await prepareMotorParts(disk);const reopened=normalizeSnapshot(disk);assert.ok(reopened);
const synced=synchronizeDesignInstances(reopened);assert.ok(synced.ok,synced.reason);assert.ok(tabNutPlans(synced.comps,synced.modules,synced.params,{stockMm:3,exportSettings:source.fabrication.export}).every(p=>p.ok));
assert.deepEqual(reopened.modules.find(m=>m.id==='Mod141').mount.face.selection.fastener.peers,state.modules.find(m=>m.id==='Mod141').mount.face.selection.fastener.peers);
// Independent peer dimensions persist, and bad peers fail rather than silently vanishing.
const bad=structuredClone(state);bad.modules.find(m=>m.id==='Mod141').mount.face.selection.fastener.peers[0].partId='missing';assert.ok(tabNutPlans(bad.comps,bad.modules,bad.params).some(p=>!p.ok));assert.throws(()=>faceFileExportData(bad),/榫|角碼|貼合/);
assert.equal(normalizeTabNut({...settings(),peers:[{moduleId:'Mod1',partId:'Blank3',settings:{...settings(),peers:[]}}]}),null);
const protectedWork=structuredClone(state),lower=plans.find(p=>p.moduleId==='Mod1'),holeId=lower.omittedHoles.child[0],board=protectedWork.comps.find(c=>c.id==='Blank3'),h=board.holes.find(h=>h.id===holeId);
protectedWork.comps.push({id:'ProtectJoint',type:'anchor',moduleId:board.moduleId,p1:{id:holeId,type:'fixed',x:board.p1.x+h.u,y:board.p1.y+h.v}});
assert.equal(buildFaceCandidate(protectedWork,request(protectedWork,'Mod1',settings())).ok,false,'a newly used grid hole must block joinery, never be omitted');
const manual=structuredClone(state),manualHole=manual.comps.find(c=>c.id==='Blank3').holes.find(h=>h.id===holeId);manualHole.id='CustomHole';assert.equal(buildFaceCandidate(manual,request(manual,'Mod1',settings())).ok,false,'an unrelated custom hole is protected even if unused');
const custom=structuredClone(state),customPeer=custom.modules.find(m=>m.id==='Mod141').mount.face.selection.fastener.peers[0];customPeer.settings.tabWidthMm=10;
const customPlans=tabNutPlans(custom.comps,custom.modules,custom.params,{stockMm:3,exportSettings:source.fabrication.export});assert.ok(customPlans.every(p=>p.ok));assert.equal(customPlans.find(p=>p.peer).settings.tabWidthMm,10);assert.equal(customPlans.find(p=>p.moduleId==='Mod141'&&!p.peer).settings.tabWidthMm,8);
assert.equal(normalizeSnapshot(storedProject(custom)).modules.find(m=>m.id==='Mod141').mount.face.selection.fastener.peers[0].settings.tabWidthMm,10);
const displaced=structuredClone(source),m=displaced.modules.find(m=>m.id==='Mod1');m.mount.face.selection.gap=2;m.mount.face.selection.faceRelations.push({kind:'mate',hostFaces:['top'],childFaces:['back'],offsetMm:2});
assert.equal(buildFaceCandidate(displaced,request(displaced,'Mod1',settings())).ok,false,'a physical gap cannot be hidden by adding a fastener');
state=undo.pop();assert.equal(state.modules.find(m=>m.id==='Mod141').mount.face.selection.fastener,undefined,'one undo removes only the last confirmed fastening');
assert.equal(JSON.stringify(source),before);
console.log('chassis tabs: four physical contacts, immutable poses/source boards, optional peers, double-ended outlines, matching slots, protected holes, cancel/undo, save/sync, SVG/DXF and BOM passed');
