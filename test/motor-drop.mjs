import assert from 'node:assert/strict';
import {planMotorDrop} from '../js/blocks/motor-drop.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {pointCoords} from '../js/blocks/model.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {deriveMotorMounts} from '../js/blocks/build-plan.js';
import {motorMountFeatures,inspectPlateExport,splitMountsByHost,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {planActuatorPlateHoles} from '../js/blocks/actuator-plate-holes.js';
import {mountDroppedMotor} from '../js/blocks/motor-drop-ui.js';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {motorInstallationScene} from '../js/blocks/actuator-install-scene.js';
const made=makeStandardBlank({kind:'plate',columns:16,rows:12,origin:{x:-64,y:-40}});
const fabrication=structuredClone(FABRICATION_DEFAULTS);
// Explicitly selected prototype specs, not a silent change to product defaults.
Object.assign(fabrication.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});fabrication.drive.n20Spec=1;
const source={kind:'blocks',v:1,comps:[made.comp],params:made.params,fabrication};
const req={type:'tt',position:{x:1.25,y:.75},hostId:'world',face:'back',orientation:'horizontal',angleDeg:0,start:-30,end:60};
for(const type of ['tt','n20','mg995']){
 const before=JSON.stringify(source),r=planMotorDrop(source,{...req,type},pointCoords(source.comps));assert.ok(r.ok,r.message);assert.equal(JSON.stringify(source),before);
 const motor=r.comps.find(c=>c.type==='motor'),host=r.comps.find(c=>c.id===made.comp.id);
 assert.equal(motor.motorMount.frameBody,host.id);assert.equal(motor.p1.type,'floating','loose plate must not be grounded by installing a motor');assert.equal(motor.p1.x,0);assert.equal(motor.p1.y,0);assert.equal(host.p1.type,'floating');assert.ok(host.standardBlank.mountHoles.length>0);
 const mounts=deriveMotorMounts(r.comps,fabrication),features=motorMountFeatures(mounts[0]);assert.ok(features.holes.length>=3);
 const g=inspectPlateExport(host,[host.p1,host.p2,host.p3],{},splitMountsByHost(r.comps,mounts).hosted.get(host.id));assert.equal(g.holes.filter(h=>h.layer?.startsWith(type.toUpperCase())).length,features.holes.length);assert.equal(g.cutouts.length,features.cutouts.length);
 const files=[];exportLinksAsDxf(r.comps,pointCoords(r.comps),r.params,{...fabrication.export,drive:fabrication.drive},mounts,null,(text,name)=>files.push({text,name}));assert.ok(files.some(f=>f.text.includes(features.holes[0].layer)));assert.ok(files.every(f=>!/(NaN|Infinity)/.test(f.text)));
 const saved=normalizeSnapshot({...source,comps:r.comps,params:r.params});assert.ok(saved);assert.equal(saved.comps.find(c=>c.type==='motor').motorMount.frameBody,host.id);
 const removed=planActuatorPlateHoles({...source,comps:r.comps.filter(c=>c!==motor)});assert.ok(removed.ok,removed.message);assert.equal(removed.comps[0].holes.length,made.comp.holes.length);
 const loose={...source,comps:[...source.comps,{...motor,p1:{...motor.p1,id:'FreeAxis',x:100,y:100},motorMount:{...motor.motorMount,center:'FreeAxis',frameBody:undefined}}]};
 const moved=planMotorDrop(loose,{...req,type,existingId:motor.id},pointCoords(loose.comps));assert.ok(moved.ok,moved.message);assert.equal(moved.comps.find(c=>c.type==='motor').id,motor.id);
}
const slim=makeStandardBlank({lengthMm:80,origin:{x:-40,y:0}}),bar={...source,comps:[slim.comp],params:slim.params};
assert.equal(planMotorDrop(bar,req).ok,false,'TT mount cannot fit a narrow single-row bar');
assert.equal(planMotorDrop(bar,{...req,type:'mg995'}).ok,false);
assert.ok(planMotorDrop(bar,{...req,type:'n20'}).ok,'N20 selected front-hole spec fits this bar');
assert.equal(planMotorDrop(source,{...req,position:{x:300,y:300}}).matched,false);
assert.equal(planMotorDrop({...source,comps:[made.comp,{...structuredClone(made.comp),id:'Overlap'}]},req).ok,false);
assert.equal(planMotorDrop({...source,moduleId:'other'},req).matched,false);
const occupied=structuredClone(source),grid=occupied.comps[0].holes.find(h=>h.u===72&&h.v===40);grid.type='fixed';assert.equal(planMotorDrop(occupied,req).ok,false,'occupied grid holes are not silently removed');
assert.equal(planMotorDrop({...source,fabrication:FABRICATION_DEFAULTS},{...req,type:'mg995'}).ok,false,'unverified default notch interference is not bypassed');
assert.equal(planMotorDrop({...source,fabrication:FABRICATION_DEFAULTS},{...req,type:'n20'}).ok,false,'generic N20 cannot invent manufacturing holes');
console.log('motor-drop: three models, create/move, free plate, real DXF holes, reopen/removal, narrow bars, overlap, scope and fabrication guards passed');
const loose=planMotorInstallation(source,{...req,position:{x:160,y:0}}),state={comps:loose.comps,modules:[],topo:{params:loose.params},fabrication,theta:0,motorAngles:{},undoStack:['one-drag']};
state.comps.find(c=>c.type==='motor').p1.x=0;
const snapshotStr=()=>JSON.stringify(state.comps),expected=snapshotStr();let note='';
const deps={S:state,id:state.comps.find(c=>c.type==='motor').id,snapshotStr,displayCoords:()=>pointCoords(state.comps),rebuild(){},draw(){},notify:m=>note=m,updateRoleEditor(){}};
mountDroppedMotor({...deps,expected:'stale'});assert.equal(snapshotStr(),expected,'late import cannot overwrite later edits');
mountDroppedMotor({...deps,expected});assert.ok(state.comps.find(c=>c.type==='motor').motorMount.frameBody);assert.equal(state.undoStack.length,1);assert.match(note,/孔槽已更新/);
console.log('motor-drop UI adapter: stale-drop protection and same undo transaction passed');
for(const face of ['front','back'])for(const thickness of [3,6,10]){
 const s=structuredClone(source);s.comps[0].stock.thicknessMm=thickness;
 const r=planMotorDrop(s,{...req,type:'mg995',face});assert.ok(r.ok,r.message);
 const model=motorInstallationScene({...s,...r,points:pointCoords(r.comps)}),m=model.motors[0],p=model.plates[0];
 const surface=face==='front'?p.z:p.z+p.thickness,d=m.shaftDirection;
 assert.ok(d*(m.hornBaseZ-surface)>=0.5,'whole horn clears actual carrier thickness on either face');
 assert.ok(d*(m.shaftEndZ-m.hornBaseZ)>m.hornThickness,'shaft reaches horn even without an output rod');
}
console.log('MG995 3D: exposed horn and through shaft at 3/6/10 mm carrier thickness on both faces passed');
