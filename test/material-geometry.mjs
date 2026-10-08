import assert from 'node:assert/strict';
import {buildSceneModel} from '../js/blocks3d/scene-model.js';
import {inspectGearExport} from '../js/blocks/exporters.js';
import {gearMeshPhaseDeg} from '../js/blocks/transmission-geometry.js';
const gear={type:'gear',id:'G',teeth:15,module:2,p1:{id:'O',x:0,y:0,physicalMotor:'1'},p2:{id:'P',x:10,y:3},motorType:'mg995'};
const geometry=inspectGearExport(gear,{},{});
const scene=buildSceneModel([], {O:gear.p1,P:gear.p2}, {gears:[{id:'G',center:'O',pin:'P',teeth:15,module:2,radius:15}],gearGeometries:{G:geometry}});
assert.ok(scene.gears[0].partGeometry?.holes?.some(h=>h.layer==='PIN_HOLE'),'3D loses actual gear output hole');
assert.equal(scene.gears[0].partGeometry.holes.filter(h=>h.layer==='MG995_HORN_SCREW').length,4,'3D loses servo horn drilling');
const a=23*Math.PI/180,driver={id:'A',teeth:15,p1:{id:'A0',x:0,y:0},p2:{id:'A1',x:Math.cos(.31)*8,y:Math.sin(.31)*8}},driven={id:'B',teeth:19,mesh:'A',p1:{id:'B0',x:34*Math.cos(a),y:34*Math.sin(a)},p2:{id:'B1',x:34*Math.cos(a)+Math.cos(-.17)*8,y:34*Math.sin(a)+Math.sin(-.17)*8}};
const map=new Map([[driver.id,driver],[driven.id,driven]]),phase=gearMeshPhaseDeg(driven,{},map)*Math.PI/180;
const delta=.43,rotate=p=>({x:p.x*Math.cos(delta)-p.y*Math.sin(delta),y:p.x*Math.sin(delta)+p.y*Math.cos(delta)}),rotated=[driver,driven].map(g=>({...g,p1:{...g.p1,...rotate(g.p1)},p2:{...g.p2,...rotate(g.p2)}}));
const other=gearMeshPhaseDeg(rotated[1],{},new Map(rotated.map(g=>[g.id,g])))*Math.PI/180;
const residue=(15*(a-.31)+19*(a+Math.PI+.17-phase)-Math.PI)/(2*Math.PI);
assert.ok(Math.abs(residue-Math.round(residue))<1e-10,'opposed tooth centers require half pitch');
assert.ok(Math.abs(phase-other)<1e-10,'rigid rotation preserves material tooth phase');
console.log('material geometry: output/horn holes and independent meshing phase');

import {f1AssemblyFixture} from './fixtures/f1-assembly-fixture.mjs';
import {buildPartGeometryCatalog,createPartGeometrySource} from '../js/blocks/part-geometry.js';
import {attachPartMaterials} from '../js/blocks3d/part-pose.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {buildPreviewModelInputs} from '../js/blocks/preview-model-inputs.js';
import {buildOrthogonalChildren,attachModulePlates,planeInputs,applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {deriveMotorMounts} from '../js/blocks/build-plan.js';
import {pointCoords,frameConnectorNodes} from '../js/blocks/model.js';
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const f=f1AssemblyFixture(),before=JSON.stringify(f),catalog=buildPartGeometryCatalog(freeze(f));
assert.equal(JSON.stringify(f),before,'catalog never mutates frozen assembly inputs');
assert.deepEqual(catalog.diagnostics,[],'F1 fabrication coverage is complete');
const motorIds=[...new Set(f.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p?.physicalMotor).map(p=>p.physicalMotor)))];
assert.deepEqual(motorIds.sort(),['1','2'],'normal module insertion assigns both motors');
const source=createPartGeometrySource(),cached=source.get(f);
assert.equal(source.get({...f,params:{...f.params,theta:40}}),cached,'playback retains local shape identity');
const changed=structuredClone(f);changed.fabrication.cnc.stockThicknessMm=6;
assert.notEqual(source.get(changed).key,cached.key,'stock edits invalidate');
const resized=structuredClone(f);resized.params[Object.keys(f.params).find(k=>k!=='theta')]+=1;
assert.notEqual(source.get(resized).key,cached.key,'dimension edits invalidate');
assert.equal(source.get(JSON.parse(before)).key,cached.key,'reopen restores content key');
assert.equal(source.get(f).key,cached.key,'cancel restores original shape key');
const bare={comps:[{type:'bar',id:'B',p1:{id:'a',type:'fixed',x:0,y:0},p2:{id:'b',type:'fixed',x:60,y:0}}],params:{theta:0}};
buildPartGeometryCatalog(freeze(bare));
const inverse=(m,p)=>{const d={x:p.x-m[12],y:p.y-m[13],z:p.z-m[14]};return {x:m[0]*d.x+m[1]*d.y+m[2]*d.z,y:m[4]*d.x+m[5]*d.y+m[6]*d.z,z:m[8]*d.x+m[9]*d.y+m[10]*d.z};};
const near=(p,q,t=1e-6)=>assert.ok(Math.hypot(p.x-q.x,p.y-q.y,(p.z||0)-(q.z||0))<t,JSON.stringify({p,q}));
const materialScene=(thetaDeg,fixture=f,shape=catalog)=>{
 const input=structuredClone(fixture),asm=compileAssembly(input.comps,input.modules,{params:input.params});
 const sol=solveAssembly(asm,{thetaDeg,motorAngles:{'2':0}});assert.ok(sol.isValid);
 const compiled=asm.compiled || asm;
 const links=input.comps.filter(c=>c.type==='bar').map(c=>({id:c.id,p1:c.p1.id,p2:c.p2.id}));
 const polygons=input.comps.filter(c=>c.type==='triangle').map(c=>({points:[c.p1.id,c.p2.id,c.p3.id]}));
 const inputs=buildPreviewModelInputs({comps:input.comps,params:input.params,theta:thetaDeg,links,points:sol.points,groundIds:new Set(input.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p?.type==='fixed').map(p=>p.id))),motorCenterIds:new Set(),motorTypes:new Map(),motorMounts:deriveMotorMounts(input.comps),polygons});
 const opts={plateThickness:4,memberStocks:shape.memberStocks,gearGeometries:shape.parts,fusedParts:shape.fusedParts};
 const create=(inp,frameGeometry=null)=>buildSceneModel(inp.links,inp.pts,{...opts,...inp,motorCenters:inp.motorCenterIds,frameGeometry});
 const main=create(planeInputs(inputs,input.comps,input.modules,null),shape.parts.frame);
 const plates=shape.frameHomes.map(h=>({...h,...h.geometry,outline:h.geometry.outlines[0],thicknessMm:h.stockMm}));
 attachModulePlates(main,input.comps,plates);
 main.orthogonal=buildOrthogonalChildren({...input,inputs,mainModel:main,plates,stockMm:4,joint:fixture.fabrication.joint,buildModel:inp=>create(inp)});
 main.brackets=main.orthogonal.flatMap(c=>c.brackets || []);main.screws=main.orthogonal.flatMap(c=>c.screws || []);
 return {model:attachPartMaterials(main,shape,{...input,points:sol.points}),points:sol.points};
};
for(const theta of [0,20,40]) {
 const {model,points}=materialScene(theta);
 assert.ok(model.materialParts.length>20);
 assert.equal(model.materialParts.filter(p=>p.geometry.kind==='bracket-wing').length,6);
 assert.equal(model.materialParts.filter(p=>p.geometry.kind==='screw').length,6);
 assert.ok(!model.geometryDiagnostics.some(d=>/missing|unavailable/.test(d.code)),JSON.stringify(model.geometryDiagnostics));
 for(const p of model.materialParts){
  assert.equal(p.pose.matrix.length,16);assert.ok(p.pickKey);assert.equal(p.geometry.geometryVersion,1);
  for(const q of [...p.geometry.outlines.flat(),...p.geometry.holes,...p.geometry.cutouts.flatMap(c=>c.points)])near(inverse(p.pose.matrix,applyMatrix4(p.pose.matrix,{...q,z:0})),{...q,z:0});
  for(const h of p.geometry.holes){assert.ok(h.id);assert.ok(h.purpose);}
 }
 // Independent mechanical pin expectations: phase must never rotate output drilling.
 for(const child of model.orthogonal)for(const g of child.model.gears){
  const p=model.materialParts.find(p=>p.partId===g.id),hole=p.geometry.holes.find(h=>h.purpose==='PIN_HOLE');
  near(applyMatrix4(p.pose.matrix,{...hole,z:0}),applyMatrix4(child.matrix,{x:g.pin.x,y:g.pin.y,z:g.z}),.005);
 }
 for(const b of model.brackets){
  const p=model.materialParts.find(p=>p.partId===b.id),h=p.geometry.holes[0];
  near(applyMatrix4(p.pose.matrix,{...h,z:p.geometry.thicknessMm/2}),b.hole.center);
  assert.equal(h.holePairId,b.holePairId);assert.ok(p.bracketId);
 }
}
console.log('F1: frozen inputs; local catalog, all machining metadata, shape keys, 0/20/40 world drilling');

import {buildMountSurfaces} from '../js/blocks/mount-surfaces.js';
import {buildFacePlacement} from '../js/blocks/face-placement.js';
import {mountFacePlacement} from '../js/blocks/face-mount.js';
const nested=structuredClone(f);
nested.comps.unshift({type:'bar',id:'BaseBar',moduleId:'Base',p1:{id:'Base0',type:'fixed',x:-180,y:0},p2:{id:'Base1',type:'fixed',x:180,y:0},stock:{widthMm:150,thicknessMm:4}});
nested.modules.unshift({id:'Base',name:'基座',base:'Base0',outputs:[{id:'out',at:'Base0',body:{kind:'bar',id:'BaseBar'}}]});
const hostSurface=buildMountSurfaces({...nested,moduleId:'Base',drilling:true,thicknessMm:4}).surfaces.find(s=>s.kind==='output');
const childSurface=buildMountSurfaces({...nested,moduleId:nested.modules[1].id,drilling:true,thicknessMm:4}).surfaces.find(s=>s.kind==='frame');
const ref=surface=>({surface,box:{min:Object.fromEntries(['x','y','z'].map(k=>[k,surface.box.min[k]-(surface.box.min[k]+surface.box.max[k])/2])),max:Object.fromEntries(['x','y','z'].map(k=>[k,surface.box.max[k]-(surface.box.min[k]+surface.box.max[k])/2]))}});
const selection={hostFace:'top',childFace:'bottom',quarterTurns:1,alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0};
const placement=buildFacePlacement({host:ref(hostSurface),child:ref(childSurface),selection});assert.ok(placement.ok,placement.reason);
const face={version:1,childPart:'frame',...placement.record.transform,selection:placement.record.selection,hostThicknessMm:4,childThicknessMm:4};
const mounted=mountFacePlacement(nested.comps,nested.modules,nested.modules[1].id,{hostId:'Base',outputId:'out',face},nested.params);assert.ok(mounted.ok,mounted.reason);nested.modules[1].mount=mounted.mount;
const nestedCatalog=buildPartGeometryCatalog(nested);
assert.deepEqual(nestedCatalog.diagnostics,[]);
for(const theta of [0,20,40]) {
 const {model}=materialScene(theta,nested,nestedCatalog);assert.equal(model.orthogonal.length,2);
 const grand=model.orthogonal.find(c=>c.id===nested.modules[2].id);
 const p=model.materialParts.find(p=>p.geometry.kind==='mounted-frame'&&p.moduleId===grand.id);
 assert.ok(p);const plate=grand.model.modulePlates[0];
 const h=p.geometry.holes[0];near(applyMatrix4(p.pose.matrix,{...h,z:0}),applyMatrix4(grand.matrix,{...h,z:plate.z}));
 assert.equal(model.materialParts.filter(p=>p.geometry.kind==='bracket-wing').length,6);
 assert.ok(!model.geometryDiagnostics.some(d=>/missing|unavailable/.test(d.code)),JSON.stringify(model.geometryDiagnostics));
}
console.log('F1 true recursive nested scene: complete world matrix applied once');

import * as Ex from '../js/blocks/exporters.js';
import {splitFrameMounts,worldFrameComps} from '../js/blocks/assembly.js';
// Design frame scopes preserve each module's own motor machining, before/after mount.
for(const mounted of [false,true])for(const moduleId of f.modules.map(m=>m.id)) {
 const scope=f1AssemblyFixture({mounted}),own=scope.comps.filter(c=>c.moduleId===moduleId);
 const nodes=frameConnectorNodes(worldFrameComps(own,scope.modules));
 const allMounts=deriveMotorMounts(scope.comps),ids=new Set(own.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean).map(p=>p.id)));
 const frameMounts=splitFrameMounts(Ex.splitMountsByHost(scope.comps,allMounts).free,scope.comps,scope.modules).world.filter(m=>ids.has(m.pointId));
 const local=buildPartGeometryCatalog({...scope,frameNodes:nodes,frameMounts});
 const expected=Ex.inspectFrameExport(nodes,scope.fabrication.export,frameMounts);
 if(expected){assert.deepEqual(local.parts.frame.cutouts.map(c=>c.points),expected.cutouts.map(c=>c.points));assert.deepEqual(local.parts.frame.holes.filter(h=>h.layer!=='ADAPTER_HOLE').map(({id,purpose,...h})=>h),expected.holes.filter(h=>h.layer!=='ADAPTER_HOLE').map(({id,...h})=>h));}
}
// Fusion body shares the exporter once; the pose follows mechanical pins independently.
import {fusionCandidates} from '../js/blocks/part-fusion.js';
const fused=structuredClone(f);
for(const plate of fused.comps.filter(c=>c.shape==='jaw'))plate.fusedWith=fusionCandidates(fused.comps,plate)[0].id;
const fusedCatalog=buildPartGeometryCatalog(fused);assert.deepEqual(fusedCatalog.diagnostics,[]);
for(const theta of [0,20,40]) {
 const {model,points}=materialScene(theta,fused,fusedCatalog);
 for(const p of model.materialParts.filter(p=>p.geometry.kind==='fusion')){
  const gear=fused.comps.find(c=>c.id===p.partId),parent=model.orthogonal.find(c=>c.id===p.moduleId);
  for(const id of p.geometry.sourceIds){const comp=fused.comps.find(c=>c.id===id);if(comp.type!=='triangle')continue;
   for(const q of [comp.p1,comp.p2,comp.p3]){
    const target=applyMatrix4(parent.matrix,{...points[q.id],z:model.orthogonal[0].model.plates.find(pl=>pl.materialPartId===p.partId).z});
    assert.ok(p.geometry.holes.some(h=>{const world=applyMatrix4(p.pose.matrix,{...h,z:0});return Math.hypot(world.x-target.x,world.y-target.y,world.z-target.z)<.005;}),'fused plate drilling follows each solved pin');
   }
  }
  const exported=Ex.inspectFusion(fused.comps,fused.comps.find(c=>c.fusedWith===gear.id),fused.params,fused.fabrication.export);
  assert.deepEqual(p.geometry.outlines[0],exported.geometry.outline);
 }
}
const missing=attachPartMaterials({gears:[{id:'missing',center:{x:0,y:0},angle:0,z:0}]},catalog);
assert.ok(missing.geometryDiagnostics.some(d=>d.code==='material_pose_or_geometry_missing'));
console.log('design frame scopes / fusion / explicit unsupported coverage');
