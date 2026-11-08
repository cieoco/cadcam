import assert from 'node:assert/strict';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {installationChoices,planSyringeInstallation} from '../js/blocks/syringe-installation.js';
import {fixedSyringePointIds,syringeAttachmentHoles,attachmentPoint} from '../js/core/syringe.js';
import {solveSyringe,scanSyringe} from '../js/blocks/syringe-operations.js';
import {isFixedFrame} from '../js/blocks/syringe-placement.js';
import {pivotTurntableSnapshot} from '../js/blocks/disk-turntable-example.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
for(const kind of ['plate','l']){
 const b=makeStandardBlank({kind,n:10,columns:8,rows:5}),c=b.comp;
 c.holes[0].type='fixed';assert.equal(isFixedFrame(c,[c]),false);
 c.holes[1].type='fixed';assert.ok(isFixedFrame(c,[c]));assert.equal(installationChoices([c],b.params).frames[0].id,c.id);
 assert.ok(solveSyringe([c],b.params).ok,'two fixed local holes solve the same rigid plate');
 const same=structuredClone(c);same.holes[1].u=same.holes[0].u;same.holes[1].v=same.holes[0].v;assert.equal(isFixedFrame(same,[same]),false);
 const attached={type:'bar',id:'Shared',p1:{...c.p3},p2:{id:'Tip',type:'floating',x:100,y:100},lenParam:'SharedL'};assert.ok(fixedSyringePointIds([c,attached]).has(c.p3.id));
}
const s=normalizeSnapshot(pivotTurntableSnapshot),old=s.comps.find(c=>c.type==='syringe'),arm=s.comps.find(c=>c.id===old.b.componentId),before=structuredClone(s);
// Replace the same two-joint arm with a rigid L plate, retaining the original pivot and working hole.
const length=s.params[arm.lenParam],angle=Math.atan2(arm.p2.y-arm.p1.y,arm.p2.x-arm.p1.x),height=24;
arm.type='triangle';arm.gParam=arm.lenParam;arm.r1Param='ArmH';arm.r2Param='ArmD';s.params.ArmH=height;s.params.ArmD=Math.hypot(length,height);arm.p3={id:'Third',type:'floating',x:arm.p1.x-Math.sin(angle)*height,y:arm.p1.y+Math.cos(angle)*height};delete arm.shape;arm.standardBlank={kind:'l',armWidthMm:13};arm.shapeMode='polyline';arm.vertices=[{solve:true,ref:'p2'},{solve:true,ref:'p1'},{solve:true,ref:'p3'}];arm.sign=1;
assert.ok(installationChoices(s.comps,s.params).rods.some(c=>c.id===arm.id));
const solved=solveSyringe(s.comps,s.params);assert.ok(solved.ok,solved.message);assert.ok(scanSyringe(s.comps,s.params,old.id).ok);
const reopened=normalizeSnapshot(toSnapshot(s.comps,{params:s.params},s.counter));assert.ok(solveSyringe(reopened.comps,reopened.params).ok);
const request={id:old.id,mountMode:'pivot',a:old.a,b:old.b,extension:old.extension};assert.ok(planSyringeInstallation(s,request,solved.points).ok);
assert.notDeepEqual(s,before);console.log('fixed grid plates/L, distinct fixed holes, moving L pivot, full stroke and reopen passed');

const third=syringeAttachmentHoles(arm,s.params).find(h=>h.key==='p3');const thirdPlan=planSyringeInstallation(s,{...request,b:{componentId:arm.id,u:third.u,v:third.v}},solved.points);assert.ok(thirdPlan.ok,thirdPlan.message);

arm.holes=[{id:'WorkingGrid',u:length/2,v:0,type:'floating',diameter:3.2}];const gridPlan=planSyringeInstallation(s,{...request,b:{componentId:arm.id,u:length/2,v:0}},solved.points);assert.ok(gridPlan.ok,gridPlan.message);assert.ok(gridPlan.points.WorkingGrid);
