import assert from 'node:assert/strict';
import {f1AssemblyFixture,f1NestedFixture} from './f1-assembly-fixture.mjs';
import {builtinTemplate,instantiateTemplate} from '../../js/blocks/module-ops.js';
import {connect,autoPorts} from '../../js/blocks/bench.js';
import {buildFaceCandidate} from '../../js/blocks/face-candidate.js';
import {toSnapshot,normalizeSnapshot} from '../../js/blocks/schema.js';

export const frameSelection=(overrides={})=>({hostFace:'back',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:1,brackets:{enabled:true,offsets:{}},...overrides});
const attach=(work,childId,hostEndpoint,selection)=>{
 const candidate=buildFaceCandidate(work,{childId,hostEndpoint,childEndpoint:{partId:'frame'},selection});
 assert.ok(candidate.ok,candidate.reason);
 const mounted=candidate.work.modules.find(m=>m.id===childId).mount;
 assert.equal(mounted.to.module,hostEndpoint.moduleId);
 if(hostEndpoint.frameEdge!==undefined)assert.deepEqual(mounted.to.frame,{edge:hostEndpoint.frameEdge});
 else assert.equal(mounted.to.output,hostEndpoint.outputId);
 assert.ok(mounted.face.selection.brackets.enabled);
 return structuredClone(candidate.work);
};
export function rootFrameFixture(){
 const f=f1NestedFixture(),arm=f.modules[1];arm.mount=null;
 // A sized, real base plate and arm plate, not a fake scene box. F1 itself is
 // unchanged; these are the explicit stock sizes of this dedicated F3 case.
 f.comps[0].p1.frameStock={widthMm:150,thicknessMm:6};
 const base=f.comps[0];f.comps[0]={id:base.id,moduleId:'Base',type:'anchor',p1:base.p1};
 f.comps.unshift({id:'BaseAnchor2',moduleId:'Base',type:'anchor',p1:base.p2});f.modules[0].outputs=[];
 f.comps.filter(c=>c.moduleId===arm.id).flatMap(c=>[c.p1,c.p2,c.p3]).find(p=>p&&['fixed','motor'].includes(p.type)).frameStock={lengthMm:160,widthMm:100,thicknessMm:4};
 f.modules[0].faceParts={part:'frame',face:'top'};
 return attach(f,arm.id,{moduleId:'Base',frameEdge:6},frameSelection({hostFace:'top',childFace:'back'}));
}
export function installedFrameFixture(kind='face',{stablePlanar=true}={}){
 let f=f1AssemblyFixture({mounted:kind==='face'});const root=f.modules[0],host=f.modules[1];
 if(kind==='planar'&&stablePlanar){
  // Exact integer 48/64/80 tool rectangle also survives the normal parameter
  // grid on open. The original F1 geometry and its real hits remain unchanged.
  f.params.LIFT_UPRIGHT_1=48;f.params.LIFT_TOOL_FRONT_1=48;f.params.LIFT_TOOL_TOP_1=64;f.params.LIFT_TOOL_BOTTOM_1=64;f.params.LIFT_TOOL_DIAG_1=80;
  for(const c of f.comps.filter(c=>c.moduleId===root.id))for(const p of [c.p1,c.p2,c.p3])if(p){if(p.y===72)p.y=48;if(p.x===220)p.x=204;}
  const normalized=normalizeSnapshot(toSnapshot(f.comps,{params:f.params},0,{modules:f.modules,fabrication:f.fabrication}));
  f={...normalized};
 }
 if(kind!=='face'){
  const port=kind==='orient'?`edge:${root.outputs[0].body.id}:R`:autoPorts(f.comps,f.modules,root.id,f.params).find(p=>p.kind==='bolt').id;
  const connected=connect(f.comps,f.modules,host.id,{module:root.id,port},f.params,{}, {joint:'bracket-m3'});
  assert.ok(connected.ok,connected.reason);f.comps=connected.comps;f.modules=connected.modules;
  assert.equal(!!f.modules[1].mount.orient,kind==='orient');assert.ok(f.modules[1].mount.to);
 }
 const t=instantiateTemplate(builtinTemplate('gear-gripper'),{counter:3,place:{x:0,y:0},usedMotorIds:['1','2']});
 f.comps.push(...t.comps);f.modules.push(t.module);Object.assign(f.params,t.params);
 if(kind==='planar'&&stablePlanar)f=normalizeSnapshot(toSnapshot(f.comps,{params:f.params},0,{modules:f.modules,fabrication:f.fabrication}));
 f.modules[1].faceParts={part:'frame',face:kind==='face'?'front':'back'};
 return attach(f,t.module.id,{moduleId:host.id,frameEdge:6},frameSelection(kind==='face'?{hostFace:'front'}:{offsetU:10}));
}
export function twoClawsFixture(){
 let f=f1AssemblyFixture({mounted:false});const host=f.modules[0],child=f.modules[1];
 const t=instantiateTemplate(builtinTemplate('gear-gripper'),{counter:3,place:{x:0,y:0},usedMotorIds:['1','2']});
 f.comps.push(...t.comps);f.modules.push(t.module);Object.assign(f.params,t.params);
 f=attach(f,child.id,{moduleId:host.id,outputId:host.outputs[0].id},frameSelection({offsetU:-30}));
 return attach(f,t.module.id,{moduleId:host.id,outputId:host.outputs[0].id},frameSelection({offsetU:30}));
}
