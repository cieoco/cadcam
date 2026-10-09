import assert from 'node:assert/strict';
import {f1NestedFixture} from './fixtures/f1-assembly-fixture.mjs';
import {readConnectionDescriptor} from '../js/blocks/connection-descriptor.js';
import {rootFrameFixture,installedFrameFixture,twoClawsFixture,frameSelection} from './fixtures/face-host-frame-fixture.mjs';
import {faceCandidateModel,buildFaceCandidate,freezeData} from '../js/blocks/face-candidate.js';
import {candidateHostFace} from '../js/blocks/face-candidate-view.js';
import {refreshFaceMounts} from '../js/blocks/face-mount-refresh.js';
import {buildPlan,hardwareList} from '../js/blocks/build-plan.js';
import {auditPhysical} from './_bracket-audit.mjs';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {faceFileExportData,validateFaceExport,faceBuildPackHtml} from '../js/blocks/face-export.js';
import * as E from '../js/blocks/exporters.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {unmountModule} from '../js/blocks/module-ops.js';
const source=f1NestedFixture(),arm=source.modules[1];
arm.mount.to={module:source.modules[0].id,frame:{edge:6}};
const descriptor=readConnectionDescriptor({...source,childId:arm.id});
assert.ok(descriptor.ok);
assert.equal(descriptor.host.source.kind,'frame');
assert.equal(descriptor.capabilities.geometry,true,'valid saved host frame must support shared face geometry');
assert.equal(descriptor.capabilities.drilling,true);
assert.equal(descriptor.capabilities.refresh,true);

// Independent transforms and stock measurements: expected planes come from
// actual material boards, never from production bracket contact/ok flags.
const at=(m,p)=>({x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const inverse=(m,p)=>{const q=sub(p,{x:m[12],y:m[13],z:m[14]});return {x:m[0]*q.x+m[1]*q.y+m[2]*q.z,y:m[4]*q.x+m[5]*q.y+m[6]*q.z,z:m[8]*q.x+m[9]*q.y+m[10]*q.z};};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`);
const fixtures=[rootFrameFixture(),installedFrameFixture(),installedFrameFixture('orient'),installedFrameFixture('planar'),twoClawsFixture()];
let lastScene,lastWork;
for(const [i,work] of fixtures.entries()){
 const before=JSON.stringify(work);freezeData(work);
 const r1=refreshFaceMounts(work.comps,work.modules,work.params,{stockMm:4,exportSettings:work.fabrication.export});
 const r2=refreshFaceMounts(work.comps,r1.modules,work.params,{stockMm:4,exportSettings:work.fabrication.export});
 assert.deepEqual(r2.modules,r1.modules,'refresh twice never drifts references/transforms');assert.deepEqual(r1.diagnostics,[]);
 for(const theta of [20,40]){
  const pose={theta,motorAngles:{'1':theta,'2':10,'3':15}},scene=faceCandidateModel({work},pose);
  assert.ok(scene.solveValidity.valid);assert.deepEqual(scene.catalog.diagnostics,[]);
  for(const mod of scene.work.modules.filter(m=>m.mount?.face&&m.mount.to.frame)){
   const hostMod=scene.work.modules.find(m=>m.id===mod.mount.to.module),host=scene.model.materialParts.find(p=>p.partId===(hostMod.mount?`${hostMod.id}-frame`:'frame'));
   const child=scene.model.materialParts.find(p=>p.partId===`${mod.id}-frame`),{rotation:R,translation:T}=mod.mount.face;assert.ok(host&&child);
   // Independently compose one parent plate pose and the saved rigid face
   // record. This catches a second ancestor matrix even if both hardware and
   // child stock were wrongly transformed together.
   for(const q of [{x:0,y:0,z:0},{x:10,y:0,z:0},{x:0,y:10,z:0}]){
    const expected=at(host.pose.matrix,{x:R[0][0]*q.x+R[0][1]*q.y+T.x,y:R[1][0]*q.x+R[1][1]*q.y+T.y,z:R[2][0]*q.x+R[2][1]*q.y+T.z+host.geometry.thicknessMm/2});
    const actual=at(child.pose.matrix,{...q,z:child.geometry.thicknessMm/2});for(const k of ['x','y','z'])near(actual[k],expected[k]);
   }
  }
  const plan=buildPlan({comps:scene.work.comps,modules:scene.work.modules,params:scene.work.params,exportSettings:work.fabrication.export,cnc:work.fabrication.cnc,joint:work.fabrication.joint,mounts:scene.mounts,extras:scene.catalog.extras});
  for(const adapter of scene.catalog.extras.adapters){
   const boxes=scene.model.brackets.filter(b=>b.moduleId===adapter.moduleId),screws=scene.model.screws.filter(s=>s.moduleId===adapter.moduleId),plates={},holes=[];
   for(const b of boxes){
    const plate=scene.model.materialParts.find(p=>p.geometry.holes.some(h=>h.holePairId===b.holePairId));assert.ok(plate,`actual plate for ${b.holePairId}`);
    const h=plate.geometry.holes.find(h=>h.holePairId===b.holePairId),m=plate.pose.matrix,n={x:m[8],y:m[9],z:m[10]},mid=at(m,{x:h.x,y:h.y,z:plate.geometry.thicknessMm/2});
    const sign=dot(sub(b.center,mid),n)>0?1:-1,out={x:n.x*sign,y:n.y*sign,z:n.z*sign},contact=at(m,{x:h.x,y:h.y,z:sign>0?plate.geometry.thicknessMm:0});
    plates[h.holePairId]={normal:out,contact,thicknessMm:plate.geometry.thicknessMm};holes.push({holePairId:h.holePairId,center:contact,axis:out,diameterMm:h.r*2});
    const local=inverse(m,b.hole.center);near(local.x,h.x,.005);near(local.y,h.y,.005);
   }
   const hardware=hardwareList({...plan,joints:plan.joints.filter(j=>j.connectionId===adapter.connectionId),parts:[],motors:[]});
   assert.equal(plan.joints.filter(j=>j.connectionId===adapter.connectionId).length,1,'canonical root frame references a real plan part');
   assert.deepEqual(auditPhysical({boxes,screws,plates,holes,hardware,count:adapter.physical.length,spec:adapter.spec,machiningTolerance:.005}),[],`stock/BOM fixture ${i} theta ${theta}`);
  }
  lastScene=scene;lastWork=work;
 }
 assert.equal(JSON.stringify(work),before,'frozen topology/comps/modules remain untouched');
 const saved=normalizeSnapshot(toSnapshot(work.comps,work.topo,20,{modules:work.modules,fabrication:work.fabrication}));assert.ok(saved);
 const reopened=faceCandidateModel({work:{...saved,topo:{params:saved.params}}},{theta:40,motorAngles:{'1':40,'2':10,'3':15}});
 assert.ok(reopened.solveValidity.valid);assert.deepEqual(reopened.catalog.diagnostics,[],`reopen ${i}`);
 assert.deepEqual(saved.modules.map(m=>m.mount?.to),work.modules.map(m=>m.mount?.to));
 if(i===3)assert.deepEqual(saved.params,work.params,'dedicated planar fixture parameters survive the actual normalization grid');
}
// Reorder and change design defaults, without changing any saved endpoint.
const changed=structuredClone(fixtures[0]);changed.modules.reverse();changed.modules.forEach(m=>{m.faceParts={part:'frame',face:'left'};m.mates={receive:[]};});
assert.deepEqual(refreshFaceMounts(changed.comps,changed.modules,changed.params,{stockMm:4}).modules.map(m=>m.mount?.to),changed.modules.map(m=>m.mount?.to));
changed.comps.find(c=>c.id==='BaseBar').p1.frameStock.widthMm=170;
const resized=refreshFaceMounts(changed.comps,changed.modules,changed.params,{stockMm:4});assert.deepEqual(resized.diagnostics,[]);
assert.deepEqual(refreshFaceMounts(changed.comps,resized.modules,changed.params,{stockMm:4}).modules,resized.modules);
// Every stable edge is a reference to the same board, not another placement.
const root=fixtures[0],armId=root.modules[1].id;
for(const edge of [6,13,20,27]){
 const candidate=buildFaceCandidate(root,{childId:armId,reselect:true,hostEndpoint:{moduleId:'Base',frameEdge:edge},childEndpoint:{partId:'frame'},selection:frameSelection({hostFace:'top',childFace:'back'})});assert.ok(candidate.ok,candidate.reason);
 const scene=faceCandidateModel(candidate,{theta:20,motorAngles:{'1':20,'2':10}});const reference=candidateHostFace({...candidate,model:scene.model,hostReference:scene.hostReference},'top');assert.ok(reference);
 const board=scene.model.materialParts.find(p=>p.partId==='frame');near(reference.center.z,board.pose.matrix[14]+board.geometry.thicknessMm);
 assert.deepEqual(candidate.work.modules[1].mount.to.frame,{edge});
}
for(const edge of [0,-1,1.5,'6',28]){const bad=structuredClone(root);bad.modules[1].mount.to.frame.edge=edge;assert.equal(readConnectionDescriptor({...bad,childId:armId}).ok,false);assert.throws(()=>faceFileExportData(bad),/暫停|直邊|無有效解/);}
for(const mutate of [w=>w.modules.push({...w.modules[0]}),w=>w.comps=w.comps.filter(c=>c.moduleId!=='Base'),w=>w.modules[0].mount={...w.modules[1].mount,to:{module:armId,frame:{edge:6}}}]){
 const bad=structuredClone(root);mutate(bad);const c=buildFaceCandidate(bad,{childId:armId,reselect:true,hostEndpoint:{moduleId:'Base',frameEdge:6},childEndpoint:{partId:'frame'},selection:frameSelection({hostFace:'top',childFace:'back'})});assert.equal(c.ok,false);
}
assert.equal(buildFaceCandidate(root,{childId:armId,hostEndpoint:{moduleId:armId,frameEdge:6},childEndpoint:{partId:'frame'},selection:frameSelection()}).ok,false);
assert.equal(buildFaceCandidate(root,{childId:armId,hostEndpoint:{moduleId:'Base',frameEdge:6},childEndpoint:{partId:'frame'},selection:frameSelection()}).ok,false,'occupied child never silently replaced');
const double=fixtures[4],remaining=double.modules[2].id,removed=double.modules[1].id,detach=structuredClone(double);
const unmounted=unmountModule(detach.comps,detach.modules,removed,detach.params,{theta:20,activeMotor:'1',motorAngles:{'1':20,'2':0,'3':0}});assert.ok(unmounted.ok,unmounted.reason);detach.comps=unmounted.comps;detach.modules=unmounted.modules;
const ds=faceCandidateModel({work:detach},{theta:20,motorAngles:{'1':20,'2':0,'3':0}});assert.equal(ds.catalog.extras.adapters.length,1);
assert.equal(ds.catalog.extras.adapters[0].moduleId,remaining);assert.deepEqual(ds.catalog.extras.adapters[0].physical,faceCandidateModel({work:double},{theta:20}).catalog.extras.adapters.find(a=>a.moduleId===remaining).physical);
const changedBrace=structuredClone(double),brace=changedBrace.comps.find(c=>c.id.startsWith('ToolBrace'));brace.stock={widthMm:18,thicknessMm:6};
const resizedBrace=faceCandidateModel({work:changedBrace},{theta:20,motorAngles:{'1':20,'2':0,'3':0}});
assert.ok(resizedBrace.catalog.diagnostics.some(d=>d.moduleId===removed&&d.code==='face_fastener_invalid'),'a thickness change may invalidate one hole; never silently degrade its fasteners');
assert.deepEqual(resizedBrace.work.modules.map(m=>m.mount?.to),double.modules.map(m=>m.mount?.to));
assert.equal(resizedBrace.catalog.extras.adapters.length,1);assert.equal(resizedBrace.catalog.extras.adapters[0].moduleId,remaining);assert.notEqual(resizedBrace.model.geometryKey,ds.model.geometryKey);
assert.deepEqual(refreshFaceMounts(resizedBrace.work.comps,resizedBrace.work.modules,resizedBrace.work.params,{stockMm:4}).modules,resizedBrace.work.modules,'resized shared host refresh is stable');
// Actual public serialized files, independently inverse-projected world holes.
const blobs=new Map(),downloads=[];globalThis.URL.createObjectURL=b=>{const id=`blob:${blobs.size}`;blobs.set(id,b);return id;};globalThis.URL.revokeObjectURL=()=>{};
globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});},remove(){}})};
const circles=(text,fmt)=>{
 if(fmt==='svg')return [...text.matchAll(/<circle\b([^>]*)\/>/g)].map(([,s])=>{const a=Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));return {id:a['data-hole-id'],pair:a['data-hole-pair-id'],x:Number(a.cx),y:Number(a.cy)};});
 const rows=text.trimEnd().split(/\r?\n/),out=[];let c;for(let i=0;i<rows.length;i+=2){const code=Number(rows[i]),v=rows[i+1];if(code===0){if(c)out.push(c);c=v==='CIRCLE'?{}:null;}else if(c){if(code===10)c.x=Number(v);if(code===20)c.y=Number(v);if(code===999&&v.startsWith('HOLE_TRACE ')){const h=JSON.parse(v.slice(11));c.id=h.id;c.pair=h.holePairId;}}}return out;
};
for(const work of [fixtures[0],fixtures[1]]){
 const pose={theta:40,motorAngles:{'1':40,'2':10,'3':15}},data=faceFileExportData(work,pose),scene=faceCandidateModel({work},pose),start=downloads.length;
 for(const [links,frame] of [[E.exportLinksAsSvg,E.exportFrameAsSvg],[E.exportLinksAsDxf,E.exportFrameAsDxf]]){links(data.comps,data.points,data.params,data.settings,data.mounts,data.extras);for(const f of data.frames)frame(f.nodes,data.settings,f.mounts,f.name);}
 const files=await Promise.all(downloads.slice(start).map(async f=>({...f,text:await f.blob.text()})));
 for(const fmt of ['svg','dxf'])for(const p of scene.model.materialParts)for(const h of p.geometry.holes.filter(h=>h.connectionId&&h.layer!=='M3_THREAD')){
  const found=files.filter(f=>f.name.endsWith(`.${fmt}`)).flatMap(f=>circles(f.text,fmt)).filter(c=>c.id===h.id);assert.equal(found.length,1,`${fmt} actual hole ${h.id}`);assert.equal(found[0].pair,h.holePairId);
  const box=scene.model.brackets.find(b=>b.holePairId===h.holePairId);assert.ok(box);const local=inverse(p.pose.matrix,box.hole.center);near(found[0].x,local.x,.005);near(found[0].y,local.y,.005);
 }
 const result=await validateFaceExport(work,pose);assert.ok(result.ok,result.reason);const html=faceBuildPackHtml(result),trace=JSON.parse(html.match(/id="manufacturingTrace">([\s\S]*?)<\/script>/)[1]);
 assert.ok(trace.physical.every(j=>j.parts.every(id=>result.plan.parts.some(p=>p.name===id))));assert.equal(trace.physical.length,2);assert.equal(trace.validation.poseRevision,result.poseRevision);
}
mkdirSync('output/framework-stabilization/w4b-frame',{recursive:true});
// Preserve the real built-in → planar → frame → save/open failure. The normal
// schema's 8mm grid changes 140/107.629 to 144/104; the rebaked frame rotates.
// The shared physical path must reject this result, not silently emit holes.
const originalPlanar=installedFrameFixture('planar',{stablePlanar:false}),originalSaved=normalizeSnapshot(toSnapshot(originalPlanar.comps,originalPlanar.topo,0,{modules:originalPlanar.modules,fabrication:originalPlanar.fabrication}));
assert.equal(originalPlanar.params.LIFT_ARM_1,140);assert.equal(originalSaved.params.LIFT_ARM_1,144);assert.equal(originalSaved.params.LIFT_TOOL_DIAG_1,104);
const badReopen={...originalSaved,topo:{params:originalSaved.params}},badScene=faceCandidateModel({work:badReopen},{theta:20,motorAngles:{'1':20,'2':0,'3':0}});
assert.ok(badScene.catalog.diagnostics.some(d=>d.code==='face_fastener_invalid'));
assert.equal((await validateFaceExport(badReopen,{theta:20})).ok,false);
writeFileSync('output/framework-stabilization/w4b-frame/builtin-planar-snap-negative.json',JSON.stringify({beforeParams:originalPlanar.params,afterParams:originalSaved.params,diagnostics:badScene.catalog.diagnostics},null,2));
for(const [name,work] of [['root-mounted',fixtures[0]],['installed-mounted',fixtures[1]],['two-claws',fixtures[4]]]){
 writeFileSync(`output/framework-stabilization/w4b-frame/ui-${name}.blocks.json`,JSON.stringify(toSnapshot(work.comps,work.topo,0,{modules:work.modules,fabrication:work.fabrication}),null,2));
 const unmounted=structuredClone(work);unmounted.modules.at(-1).mount=null;
 if(name==='root-mounted')unmounted.modules[1].mount=null;
 writeFileSync(`output/framework-stabilization/w4b-frame/ui-${(name.includes('mounted')?name.replace('mounted','unmounted'):`${name}-unmounted`)}.blocks.json`,JSON.stringify(toSnapshot(unmounted.comps,unmounted.topo,0,{modules:unmounted.modules,fabrication:unmounted.fabrication}),null,2));
}
// The actual wizard receiver exposes one frame entry and keeps a saved edge.
const {openFaceWizard}=await import('../js/blocks/face-wizard-ui.js'),{LOAD_GRAPH_TOKEN}=await import('../js/load-graph.js');
let receiver,iframe;const messages=[],notices=[];
class Element{constructor(tag){this.style={};this.listeners={};if(tag==='iframe'){iframe=this;this.contentWindow={postMessage:d=>messages.push(d)};}}setAttribute(){}append(){}remove(){}addEventListener(t,f){this.listeners[t]=f;}showModal(){}close(){this.listeners.close?.();}}
globalThis.document={createElement:t=>new Element(t),body:new Element('body')};globalThis.window={addEventListener:(t,f)=>{if(t==='message')receiver=f;},removeEventListener(){}};
globalThis.location={origin:'https://example.test'};globalThis.matchMedia=()=>({matches:false});
const ui=structuredClone(root),initialMount=ui.modules[1].mount;initialMount.to.frame.edge=13;ui.modules[1].mount=null;
openFaceWizard({...ui,params:ui.params,childId:armId,stockMm:4,initialMount,exportSettings:ui.fabrication.export,joint:ui.fabrication.joint,say:s=>notices.push(s),commit:()=>assert.fail('init cannot commit')});
receiver({origin:location.origin,source:iframe.contentWindow,data:{type:'face-wizard-ready',loadGraph:LOAD_GRAPH_TOKEN}});
const init=messages.at(-1);assert.equal(init.type,'face-wizard-init');assert.equal(init.hosts.filter(h=>h.surface.moduleId==='Base'&&h.surface.kind==='frame').length,1);
assert.equal(init.hosts[init.host].surface.frameEdge,13);assert.ok(!init.hosts.some(h=>/直邊\s*\d/.test(h.name)));assert.deepEqual(notices,[]);iframe.listeners={};
console.log('host-frame five real scenarios, two nonzero poses, independent stock/axes/BOM, stable refresh/reopen/detach, actual public output, wizard receiver and known builtin snap rejection passed');
