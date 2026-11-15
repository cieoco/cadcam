import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {toLegacy} from '../js/blocks/motor-part.js';
import {planMotorDrop} from '../js/blocks/motor-drop.js';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {planActuatorPlateHoles} from '../js/blocks/actuator-plate-holes.js';
import {planDelete} from '../js/blocks/delete-part.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {stepFromWork} from '../js/blocks/step-export.js';
import {pointCoords} from '../js/blocks/model.js';
import {buildShareUrl,readShareFromHash} from '../js/blocks/storage.js';
const raw=JSON.parse(readFileSync(new URL('./fixtures/servo-on-plate.json',import.meta.url))).project;
const src=normalizeSnapshot(toLegacy(raw)),motor=src.comps.find(c=>c.type==='motor'),before=JSON.stringify(src);
const req={...motor.motorMount,type:'mg995',existingId:motor.id,position:motor.p1,start:0,end:90};
const mounted=planMotorDrop(src,req,pointCoords(src.comps));assert.ok(mounted.ok,mounted.message);assert.ok(mounted.mountIssue);assert.equal(JSON.stringify(src),before);
const work={...src,comps:mounted.comps,params:mounted.params},host=work.comps.find(c=>c.id==='Blank88');
assert.ok(host.standardBlank.mountHoles.length);assert.deepEqual(mounted.fabrication,src.fabrication);
assert.equal(planActuatorPlateHoles(work).ok,false,'strict fabrication check still refuses');
assert.deepEqual(planActuatorPlateHoles(work,{assembly:true}).comps,work.comps,'repartition is idempotent');
for(const format of ['svg','dxf']){
 const out=prepareScopedExport({...work,topo:{params:work.params},exportSettings:work.fabrication.export,modules:[]},{scope:'design',focus:'#root'},format);
 assert.ok(out.files.length,'unaffected gears still export');assert.ok(out.files.every(f=>!f.sourceIds?.includes(host.id)),'pending plate excluded');assert.ok(out.warnings.some(s=>s.includes('加工待修正')));
 assert.throws(()=>prepareScopedExport({...work,topo:{params:work.params},exportSettings:work.fabrication.export,modules:[]},{scope:'selected',selectedId:host.id},format),/加工待修正/);
}
const step=await stepFromWork({...work,modules:[],topo:{params:work.params}},{scope:'design',focus:'#root'});assert.equal(step.ok,false);assert.match(step.message,/加工待修正/);
const safe={...work,fabrication:{...work.fabrication,mg995Mount:{...work.fabrication.mg995Mount,cableNotchWidthMm:6,cableNotchDepthMm:2}}};
assert.ok(planActuatorPlateHoles(safe).ok,'explicit dimension repair clears warning');
const out=prepareScopedExport({...safe,topo:{params:safe.params},exportSettings:safe.fabrication.export,modules:[]},{scope:'selected',selectedId:host.id},'dxf');assert.ok(out.files.some(f=>f.sourceIds.includes(host.id)));
const saved=normalizeSnapshot(work);assert.ok(saved.comps.find(c=>c.type==='motor').motorMount.frameBody===host.id);
globalThis.location={origin:'http://localhost',pathname:'/blocks.html',hash:''};const url=buildShareUrl({...work,kind:'blocks',v:1});location.hash=new URL(url).hash;const shared=normalizeSnapshot(readShareFromHash());assert.equal(shared.comps.find(c=>c.type==='motor').motorMount.frameBody,host.id);
const released=planMotorInstallation(work,{...req,hostId:'world',face:'back',position:{x:400,y:400}},pointCoords(work.comps));assert.ok(released.ok,released.message);
const originalPlate=src.comps.find(c=>c.id===host.id),restored=released.comps.find(c=>c.id===host.id);
assert.equal(restored.holes.length,originalPlate.holes.length);assert.ok(!restored.standardBlank.mountHoles);
const deleted=planDelete({...work,points:pointCoords(work.comps)},{part:work.comps.find(c=>c.type==='motor')});assert.ok(deleted.ok,deleted.message);assert.equal(deleted.comps.find(c=>c.id===host.id).holes.length,originalPlate.holes.length);
// Moving/rotating recomputes occupied cells from the full original pool.
for(const angleDeg of [0,45,90]){
 const moved=planMotorInstallation(work,{...req,hostId:host.id,hostEnd:'Blank88_H64_16',orientation:'horizontal',face:'back',angleDeg},pointCoords(work.comps));
 assert.ok(moved.ok,moved.message);assert.equal(moved.comps.find(c=>c.type==='motor').p1.id,'Blank88_H64_16');
 const plate=moved.comps.find(c=>c.id===host.id),ids=[...plate.holes,...plate.standardBlank.mountHoles].map(h=>h.id).sort();
 assert.deepEqual(ids,originalPlate.holes.map(h=>h.id).sort(),'move/rotate neither loses nor duplicates original grid holes');
 assert.equal(planActuatorPlateHoles({...work,comps:moved.comps},{assembly:true}).ok,true);
}
// Removing one motor must retain the other motor's footprint on the same board.
const ttRequest={type:'tt',hostId:'world',face:'back',orientation:'horizontal',motorId:'2',position:{x:motor.p1.x+80,y:motor.p1.y}};
const both=planMotorDrop(work,ttRequest,pointCoords(work.comps));assert.ok(both.ok,both.message);
const onlyTT=planDelete({...work,comps:both.comps,points:pointCoords(both.comps)},{part:both.comps.find(c=>c.id===motor.id)});assert.ok(onlyTT.ok,onlyTT.message);
const tplate=onlyTT.comps.find(c=>c.id===host.id);assert.ok(tplate.standardBlank.mountHoles.length>0,'other motor holes still occupied');
assert.ok(planActuatorPlateHoles({...work,comps:onlyTT.comps}).ok,'removing the conflicting servo clears its fabrication issue');
// A parked grid hole already used by another part must still refuse assembly.
const conflict=structuredClone(src),taken=host.standardBlank.mountHoles.find(h=>h.id!==mounted.center);
conflict.comps.push({type:'anchor',id:'Occupied',p1:{id:taken.id,type:'fixed',...pointCoords(src.comps)[taken.id]}});
assert.equal(planMotorDrop(conflict,req,pointCoords(conflict.comps)).ok,false,'used holes remain hard conflicts');
// A drilled hole cannot be erased or swallowed by a slot, even in assembly mode.
const drilled=structuredClone(src),h=drilled.comps.find(c=>c.id===host.id).holes.find(h=>h.id===taken.id);h.manufactured=true;
assert.equal(planMotorDrop(drilled,req,pointCoords(drilled.comps)).ok,false,'manufactured holes remain hard conflicts');
console.log('motor assembly pending: attach, real occupied holes, unchanged specs, strict export / valid siblings, explicit repair, save/share, release/delete and protected holes passed');

