// Real material scene for H06; needle appearance is separate from collision material.
import assert from 'node:assert/strict';
import {hydraulicArmSnapshot as SNAP} from '../js/blocks/hydraulic-assembly-example.js';
import {markAllPlaneZlift} from '../js/blocks/render-scene.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileAssembly,solveAssembly,rebakeModules} from '../js/blocks/assembly.js';
import {prepareConnectionWork} from '../js/blocks/connection-work.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {buildPreviewModelInputs} from '../js/blocks/preview-model-inputs.js';
import {buildMaterialScene} from '../js/blocks3d/material-scene.js';
import {planeInputs} from '../js/blocks3d/orthogonal-3d.js';
import {computeBodyLayers} from '../js/blocks3d/scene-model.js';
import {motorPointIds,pointCoords} from '../js/blocks/model.js';
import {motorTypeAt} from '../js/blocks/motor-tools.js';
import {buildMotorMounts,buildMotorExportMounts} from '../js/blocks/motor-mounts.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {materialSolveValidity} from '../js/blocks/material-pose-status.js';
import {DEFAULT_PLATE_RADIUS_WORLD} from '../js/blocks/plate-geometry.js';
import {resolveSpacers} from '../js/blocks/interference.js';
import {collectSceneIds,prepareRenderScene} from '../js/blocks/render-scene.js';
const load=snap=>{const n=normalizeSnapshot(snap),rb=rebakeModules(n.comps,n.modules,n.params);return {...n,comps:rb.comps,modules:rb.modules};};
// 組立台「目前姿態」的干涉檢查：照 app.js push3DNow／bench-ui 的順序建材料場景（含 render-scene 的疊放層），再跑兩種檢查。
function panel(n,ext,{zlift=true,combineSyringeFrame=false}={}){
  const work={comps:structuredClone(n.comps),modules:structuredClone(n.modules),params:{...n.params},fabrication:structuredClone(FABRICATION_DEFAULTS)};
  for(const [id,e] of Object.entries(ext))work.comps.find(c=>c.id===id).extension=e;
  work.topo={params:work.params};work.stockMm=Number(work.fabrication.cnc.stockThicknessMm);work.exportSettings=work.fabrication.export||{};work.joint=work.fabrication.joint;
  const prepared=prepareConnectionWork(work.comps,work.modules,work.topo,{stockMm:work.stockMm,exportSettings:work.exportSettings});work.modules=prepared.modules;work.params=work.topo.params;
  const asm=compileAssembly(work.comps,work.modules,work.topo),sol=solveAssembly(asm,{thetaDeg:0,motorAngles:{}});
  const validity=materialSolveValidity(work.comps,sol);if(!validity.valid)return {validity};
  const ids=motorPointIds(work.comps),groundIds=new Set(work.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p&&['fixed','motor'].includes(p.type)).map(p=>p.id)));
  const mounts=buildMotorMounts({motorIds:ids,groundIds,staticPoints:pointCoords(work.comps),comps:work.comps,compiledSteps:prepared.compiled.steps,sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:id=>motorTypeAt(work.comps,id)});
  const exportMounts=buildMotorExportMounts({comps:work.comps,pts:pointCoords(work.comps),motorCenterIds:ids,motorMounts:mounts,typeForCenter:id=>motorTypeAt(work.comps,id),ttSettings:work.fabrication.ttMount||FABRICATION_DEFAULTS.ttMount,mg995Settings:work.fabrication.mg995Mount||FABRICATION_DEFAULTS.mg995Mount});
  const catalog=buildPartGeometryCatalog({...work,mounts:exportMounts});
  const sceneIds=collectSceneIds({compiled:prepared.compiled,comps:work.comps,motorPointIds:ids});
  prepareRenderScene({compiled:prepared.compiled,comps:work.comps,points:sol.points,frameGeometry:catalog.parts.frame||null,sceneIds,computeBodyLayers,motorAssemblyLayerForBody:()=>null,motorMounts:mounts});
  // 對照組模擬 app 修正前：只有目前檢視平面有疊放層，直角平面全部 0。
  if(!zlift)[...prepared.compiled.visualization.links,...(prepared.compiled.visualization.polygons||[])].forEach(o=>{o._zlift=0;});
  if(zlift)markAllPlaneZlift(prepared.compiled.visualization.links,prepared.compiled.visualization.polygons||[],work.comps);
  const inputs=buildPreviewModelInputs({comps:work.comps,params:work.params,theta:0,links:prepared.compiled.visualization.links,polygons:prepared.compiled.visualization.polygons||[],points:sol.points,groundIds,motorCenterIds:ids,motorTypes:new Map([...ids].map(id=>[id,motorTypeAt(work.comps,id)])),motorMounts:mounts,
    sliderTravelStart:c=>c.travelStart||0,sliderTravelEnd:c=>c.travelEnd||100,sliderBodyLength:c=>c.bodyLen||60,rackBodyHeight:c=>c.bodyHeight||20,rackPhaseShift:()=>0,pulleyRadius:()=>32,pulleyPinRadius:()=>20});
  const args={comps:work.comps,modules:work.modules,params:work.params,exportSettings:{...work.exportSettings,drive:work.fabrication.drive||FABRICATION_DEFAULTS.drive},cnc:work.fabrication.cnc,mounts:exportMounts,joint:work.joint};
  const {plan}=resolveSpacers(args);
  const model=buildMaterialScene({...work,catalog,inputs:planeInputs(inputs,work.comps,work.modules,null),allPlanes:inputs,points:sol.points,asm,plan,combineSyringeFrame,hullR:DEFAULT_PLATE_RADIUS_WORLD,solveValidity:validity});
  return {model,work,points:sol.points};
}

import {assemblySyringeShapes} from '../js/blocks3d/syringe-scene.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {attachmentPoint} from '../js/core/syringe.js';
import {plateVertexWorldPoints} from '../js/blocks/plate-geometry.js';
const n=load(SNAP),seen=[];
for(const ext of [{H4Syringe:0,H2Syringe:0,H3Syringe:0},{H4Syringe:20,H2Syringe:0,H3Syringe:0},{H4Syringe:20,H2Syringe:20,H3Syringe:20}]){
 const {model,work,points}=panel(n,ext),before=JSON.stringify(work);
 const shapes=assemblySyringeShapes(model,work.comps,work.modules,work.params,points);
 assert.equal(shapes.length,3);
 assert.deepEqual(model.syringes,shapes,'shared material builder supplies appearance to viewer');
 assert.ok(model.geometryDiagnostics.some(d=>d.kind==='syringe'&&d.status==='not_supported'),'appearance is not collision coverage');
 assert.equal(shapes.filter(s=>s.plane==='Lift').length,2,'Lift and its in-plane gripper share transformed plane');
 for(const s of shapes){
  assert.equal(s.mount?.status,'reference',`${s.id}: ${JSON.stringify(s.mount)}`);
  assert.equal(s.mount.fasteners.length,2);
  for(const f of s.mount.fasteners){
   assert.ok(f.spacerHeight>=0);
   assert.ok(Math.abs(f.frameTopZ+f.spacerHeight-f.seatZ)<1e-8,'spacer seats on frame and under clamp');
   assert.ok(f.frameTopZ<=-s.r-1,'frame clears the barrel');
  }
  const c=work.comps.find(c=>c.id===s.id),p=attachmentPoint(c.b,work.comps,work.params,points);
  const child=model.orthogonal.find(m=>m.id===s.plane),scene=child?.model||model;
  const rod=scene.sticks.find(r=>r.id===c.b.componentId);
  assert.ok(rod,'plunger rod rendered');
  assert.equal(s.z,rod.z+rod.thickness/2);
  const expected=applyMatrix4(s.matrix,{...p,z:s.z});
  for(const k of ['x','y','z'])assert.ok(Math.abs(expected[k]-s.worldB[k])<1e-9);
  assert.ok(Math.abs(Math.hypot(s.worldA.x-s.worldB.x,s.worldA.y-s.worldB.y,s.worldA.z-s.worldB.z)-c.spec.lmin-c.extension)<.001);
  assert.equal(s.coverage,'appearance_only');
 }
 assert.equal(JSON.stringify(work),before,'appearance never mutates work');
 assert.equal(assemblySyringeShapes(model,work.comps.filter(c=>c.moduleId!=='Grip'),work.modules,work.params,points).length,2,'hidden components excluded');
 assert.equal(assemblySyringeShapes({...model,orthogonal:[]},work.comps,work.modules,work.params,points).length,1,'missing plane is not flattened into main plane');
 seen.push(shapes);
}
const tip=(i,id)=>seen[i].find(s=>s.id===id).worldB;
assert.ok(Math.hypot(tip(0,'H2Syringe').x-tip(1,'H2Syringe').x,tip(0,'H2Syringe').y-tip(1,'H2Syringe').y)>1,'lift syringe follows turntable');
assert.ok(Math.hypot(tip(1,'H3Syringe').x-tip(2,'H3Syringe').x,tip(1,'H3Syringe').z-tip(2,'H3Syringe').z)>1,'gripper syringe follows lift and its own stroke');
console.log('Syringe assembly scene: three axes, parent transforms, rod layers, lengths and hidden scopes passed');

import {hydraulicLiftGripSnapshot} from '../js/blocks/hydraulic-assembly-example.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
const two=load(hydraulicLiftGripSnapshot);
for(const lift of [0,10,20])for(const grip of [0,10,20]){
 const {model}=panel(two,{H2Syringe:lift,H3Syringe:grip});
 assert.equal(model.syringes.length,2);
 assert.ok(model.syringes.every(s=>s.mount?.status==='reference'),'H05 clamps follow both frames');
 assert.ok(model.materialParts.some(p=>p.partId==='H3Frame'),'fixed syringe support remains visible');
 const report=checkMaterialInterference(model);
 assert.equal(report.findings.length,0,JSON.stringify({lift,grip,findings:report.findings}));
}
console.log('H05: two visible syringes and their fixed supports, nine poses without checked-material penetration');

// Product contract: bottom yaw, middle lift, top grasp, measured in WORLD z.
// Merely changing local y or making a valid loop does not establish this contract.
const poses=new Map(),eps=1e-6;
for(const yaw of [0,10,20])for(const lift of [0,10,20])for(const grip of [0,20]){
 const r=panel(n,{H4Syringe:yaw,H2Syringe:lift,H3Syringe:grip});
 assert.ok(r.model.syringes.every(s=>s.mount?.status==='reference'),'H06 clamps follow all three axes');
 assert.equal(r.model.viewUp,'z','top-view turntable uses a horizontal XY floor');
 const matrix=r.model.orthogonal.find(p=>p.id==='Lift').matrix;
 const world=id=>applyMatrix4(matrix,{...r.points[id],z:0});
 const points=Object.fromEntries(['H2A','H2O','H2C','H3F','H3T'].map(id=>[id,world(id)]));
 for(const id of ['H3JawA','H3JawB']){
  const jaw=r.work.comps.find(c=>c.id===id);
  const tip=plateVertexWorldPoints(jaw,[jaw.p1,jaw.p2,jaw.p3].map(p=>r.points[p.id])).at(-1);
  points[id]=applyMatrix4(matrix,{...tip,z:0});
  assert.ok(points[id].z>points.H2O.z,'actual gripping tips stay above the lift support');
 }
 assert.ok(points.H2C.z>points.H2O.z+70,'working end is ABOVE the lift pivot');
 for(const id of ['H3F','H3T'])assert.ok(points[id].z>points.H2O.z+30,'both jaws stay above the middle support');
 poses.set(`${yaw}/${lift}/${grip}`,points);
}
for(const lift of [0,10,20]){
 const a=poses.get(`0/${lift}/0`),b=poses.get(`20/${lift}/0`),c=poses.get(`20/${lift}/20`);
 for(const id of Object.keys(a))assert.ok(Math.abs(a[id].z-b[id].z)<eps,'yaw does not change upper-stage height');
 assert.ok(Math.hypot(a.H2C.x-b.H2C.x,a.H2C.y-b.H2C.y)>20,'bottom yaw carries the upper working end sideways');
 for(const id of ['H2A','H2O','H2C'])for(const k of ['x','y','z'])assert.ok(Math.abs(b[id][k]-c[id][k])<eps,'grasp does not move base/lift');
 const gap=p=>Math.hypot(p.H3JawA.x-p.H3JawB.x,p.H3JawA.y-p.H3JawB.y,p.H3JawA.z-p.H3JawB.z);
 assert.ok(gap(c)<gap(b)-20,'top jaws close when their syringe extends');
}
for(const yaw of [0,10,20]){
 const a=poses.get(`${yaw}/0/0`),b=poses.get(`${yaw}/20/0`);
 assert.ok(b.H2C.z-a.H2C.z>25,'middle syringe raises the upper end in WORLD height');
 for(const id of ['H2A','H2O'])for(const k of ['x','y','z'])assert.ok(Math.abs(a[id][k]-b[id][k])<eps,'lift does not move its fixed support');
}
console.log('H06 world axes: 18 poses, bottom yaw / middle rise / top grasp, jaws above support');

// A single design's generated ground plate already represents its fixed support.
// Do not reinsert a second copy merely because a syringe is clamped to that bar.
import {fixedGripSnapshot,fixedLiftSnapshot,fixedBaseSnapshot} from '../js/blocks/fixed-syringe-examples.js';
import {hydraulicSnapshot} from '../js/blocks/hydraulic-example.js';
for(const [snapshot,id,drive] of [[hydraulicSnapshot,'H1Frame','H1Syringe'],[fixedGripSnapshot,'H3Frame','H3Syringe'],[fixedLiftSnapshot,'H2Frame','H2Syringe'],[fixedBaseSnapshot,'H4Frame','H4Syringe']]){
 const single=load(snapshot),before=JSON.stringify(single);
 for(const extension of [0,20]){
  const {model}=panel(single,{[drive]:extension},{combineSyringeFrame:true});
  assert.ok(model.frame?.materialPartId,'generated frame stays visible');
  assert.equal(model.syringes[0].mount.status,'reference',JSON.stringify(model.syringes[0].mount));
  assert.equal(model.sticks.some(s=>s.id===id),false,'root support is represented once by the frame');
  assert.equal(model.materialParts.filter(p=>p.partId==='frame'||p.partId===id).length,1);
 }
 assert.equal(JSON.stringify(single),before,'display correction never edits the accepted design');
}
console.log('H01–H04: one root frame, paired clamp hardware in both end poses; accepted snapshots unchanged');
