import assert from 'node:assert/strict';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {motorInstallationScene} from '../js/blocks/actuator-install-scene.js';
import {motionPoseIssue} from '../js/blocks/solve-health.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {detachDeletedAttachments} from '../js/blocks/detached-attachments.js';
import {actuatorSource} from './fixtures/actuator-installation.mjs';
const empty={kind:'blocks',v:1,counter:0,comps:[],params:{theta:0}};
const req={type:'tt',hostId:'world',face:'back',orientation:'horizontal',angleDeg:17.25,position:{x:12.5,y:-8.75},start:-30.25,end:60.75};
const reopen=s=>normalizeSnapshot(decodeShareString(encodeSnapshot(storedProject({kind:'blocks',v:1,comps:s.comps,params:s.params,...(s.fabrication?{fabrication:s.fabrication}:{}),modules:s.modules}))));
for(const type of ['tt','n20','mg995']){
 const source=JSON.stringify(empty),m=planMotorInstallation(empty,{...req,type});assert.ok(m.ok,m.message);assert.equal(JSON.stringify(empty),source);
 assert.equal(m.comps.length,1);assert.equal(m.comps[0].type,'motor');assert.equal(m.simulation.ok,false);
 const saved=reopen(m),body=saved.comps[0];assert.equal(body.motorType,type);assert.equal(body.p1.x,12.5);assert.equal(body.motorMount.angleDeg,17.25);
 assert.equal(motionPoseIssue(saved.comps,m.result).code,'unconnected_motor');assert.equal(motorInstallationScene(m).motors.length,1);
 const rod={id:'Rod',type:'bar',p1:{id:'R1',type:'floating',x:80,y:40},p2:{id:'R2',type:'floating',x:136,y:40},lenParam:'RL',fixedLen:true};
 saved.comps.push(rod);saved.params.RL=56;
 const attach={...req,type,position:undefined,existingId:body.id,outputId:rod.id,outputEnd:'p1'};
 const shifted=planMotorInstallation(saved,{...attach,position:{x:24.5,y:11.25}});assert.ok(shifted.ok,shifted.message);assert.equal(shifted.comps[0].p1.x,24.5);assert.equal(shifted.comps[0].p1.y,11.25);assert.equal(planMotorInstallation(saved,{...attach,position:{x:NaN,y:0}}).ok,false);
 const connected=planMotorInstallation(saved,attach);assert.ok(connected.ok,connected.message);assert.ok(connected.simulation.ok,connected.simulation.message);
 assert.equal(connected.comps.length,1);assert.equal(connected.comps[0].id,rod.id);assert.equal(connected.comps[0].motorMount.partId,body.id);assert.equal(connected.comps[0].p1.x,12.5);
 const second=planMotorInstallation(connected,{...req,type,motorId:'2',position:{x:200,y:10}});assert.ok(second.ok);const secondBody=second.comps.find(c=>c.type==='motor');assert.notEqual(secondBody.id,body.id);assert.equal(planMotorInstallation(second,{...attach,existingId:secondBody.id}).ok,false,'cannot overwrite another motor output');
 const before=JSON.stringify(connected),released=planMotorInstallation(reopen(connected),{...attach,existingId:'Rod',outputId:''},connected.points);assert.ok(released.ok,released.message);assert.equal(before,JSON.stringify(connected));
 const retained=released.comps.find(c=>c.type==='motor'),out=released.comps.find(c=>c.id==='Rod');assert.equal(retained.id,body.id);assert.equal(retained.motorType,type);assert.equal(out.isInput,false);assert.notEqual(out.p1.id,retained.p1.id);assert.equal(out.p2.id,'R2');assert.equal(out.p1.x,connected.points[connected.center].x);
 const again=planMotorInstallation(reopen(released),{...attach,existingId:retained.id},released.points);assert.ok(again.ok,again.message);assert.equal(again.motor,connected.motor);assert.equal(again.comps[0].motorMount.partId,body.id);if(type==='mg995')assert.equal(reopen(again).comps[0].servoStart,-30.25);
 // Unrelated underconstrained geometry does not veto a legal installation.
 const unfinished=structuredClone(saved);unfinished.comps.push({...structuredClone(rod),id:'Loose',p1:{id:'X',type:'floating',x:300,y:0},p2:{id:'Y',type:'floating',x:356,y:0}});
 const r=planMotorInstallation(unfinished,attach);assert.ok(r.ok,r.message);assert.equal(r.simulation.ok,false);
}
// Legacy attached motors detach without deleting carrier or other shared nodes.
const legacy=planMotorInstallation(actuatorSource,{...req,position:undefined,hostId:'Frame',hostEnd:'p1',orientation:'follow-frame',outputId:'Arm',outputEnd:'p1'});
assert.ok(legacy.ok,legacy.message);
const before=legacy.comps.find(c=>c.id==='Frame');
const detached=planMotorInstallation(legacy,{...req,position:undefined,existingId:'Arm',outputId:'',hostId:'Frame',hostEnd:'p1',orientation:'follow-frame'},legacy.points);
assert.ok(detached.ok,detached.message);assert.equal(detached.comps.find(c=>c.type==='motor').p1.id,'A');assert.deepEqual(detached.comps.find(c=>c.id==='Frame'),before);
assert.equal(planMotorInstallation(empty,{...req,position:{x:NaN,y:0}}).ok,false);
assert.equal(planMotorInstallation(empty,{...req,angleDeg:Infinity}).ok,false);
console.log('Independent motors: TT/N20/MG995 placement, share/reopen, attach/release/reconnect, identity, pose, partial-save and validation passed');

const withoutHost=detachDeletedAttachments(detached.comps,new Set(['Frame']),detached.params,detached.points).filter(c=>c.id!=='Frame');
assert.ok(!withoutHost.find(c=>c.type==='motor').motorMount.frameBody);assert.ok(reopen({comps:withoutHost,params:detached.params}));
assert.ok(storedProject({kind:'blocks',v:1,comps:withoutHost,params:detached.params}).requires.includes('independent-motor-v1'));

// Release at a nonzero pose retains both copies of a shared far joint.
const angled=planMotorInstallation(actuatorSource,{...req,position:undefined,angle:37.5,hostId:'Frame',hostEnd:'p1',orientation:'follow-frame',outputId:'Arm',outputEnd:'p1'});
const arm=angled.comps.find(c=>c.id==='Arm'),tip=angled.points[arm.p2.id];
angled.comps.push({id:'Follower',type:'bar',p1:{...arm.p2},p2:{id:'F',type:'floating',x:tip.x+40,y:tip.y},lenParam:'FL',fixedLen:true});angled.params.FL=40;angled.points.F={x:tip.x+40,y:tip.y};
const atPose=planMotorInstallation(angled,{...req,position:undefined,existingId:'Arm',outputId:'',hostId:'Frame',hostEnd:'p1',orientation:'follow-frame'},angled.points);
assert.ok(atPose.ok,atPose.message);const kept=atPose.comps.find(c=>c.id==='Arm'),follower=atPose.comps.find(c=>c.id==='Follower');assert.equal(kept.p2.id,follower.p1.id);assert.equal(kept.p2.x,tip.x);assert.equal(follower.p1.x,tip.x);assert.equal(follower.p1.y,tip.y);
assert.equal(planMotorInstallation(angled,{...req,existingId:'missing',outputId:'Arm',outputEnd:'p1'}).ok,false);
