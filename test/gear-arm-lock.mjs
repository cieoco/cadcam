import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {gearPivotRotation,rotateGearPinnedPose} from '../js/blocks/gear-pin-connection.js';
import {rotateGearPinnedMember} from '../js/blocks/gear-pin-preview.js';
import {planGearPinConnection,planReleaseGearPin} from '../js/blocks/gear-pin-plans.js';
import {pointCoords,pointRotation} from '../js/blocks/model.js';
import {planSplit,mergeDropped} from '../js/blocks/connect-ops.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import * as Input from '../js/blocks/input.js';
import {S} from '../js/blocks/state.js';
import {load as loadDrag,gesture,nodeDown,driveHooks,emit,flush} from './_drag-rig.mjs';
await loadIntegrity();
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
const rotate=(p,c,a)=>({x:c.x+(p.x-c.x)*Math.cos(a)-(p.y-c.y)*Math.sin(a),y:c.y+(p.x-c.x)*Math.sin(a)+(p.y-c.y)*Math.cos(a)});
function fixture(){
 const made=makeStandardBlank({kind:'l',lengthMm:64,heightMm:64,n:1,origin:{x:0,y:-32}}),member=made.comp;
 const pivot=member.holes.find(h=>h.u===0&&h.v===16);pivot.id='Gear1_mount0';
 const gear={type:'gear',id:'Gear1',teeth:18,module:4,motorType:'mg995',servoStart:-35,servoEnd:65,phase:0,radiusParam:'GR1',pinRadiusParam:'GPR1',p1:{id:'GC1',type:'fixed',physicalMotor:'1',x:0,y:0},p2:{id:'GP1',type:'floating',x:16,y:0},holes:[{id:'Gear1_mount0',u:0,v:-16,diameter:3.2,type:'floating'},{id:'Gear1_mount1',u:0,v:16,diameter:3.2,type:'floating'}]};
 for(const k of ['p1','p2','p3'])Object.assign(member[k],rotate(member[k],{x:0,y:-16},-12*Math.PI/180));
 return {kind:'blocks',v:1,counter:5,name:'彎桿第二孔固定驗收',comps:[gear,member],params:{...made.params,GR1:36,GPR1:16,theta:0}};
}
const solve=(w,t)=>solveTopology(compileTopology(w.comps,{params:{...w.params}},new Set()),{thetaDeg:t});
const source=fixture(),before=JSON.stringify(source),dragId=source.comps[1].p2.id;
const context=gearPivotRotation(source.comps,source.params,dragId);assert.ok(context);assert.equal(context.pivot.id,'Gear1_mount0');assert.equal(pointRotation(source.comps,source.params,dragId).pivot.id,context.pivot.id);
const poseOnly=structuredClone(source),poseResult=rotateGearPinnedPose(poseOnly.comps,poseOnly.params,dragId,{x:64,y:-32});assert.deepEqual(poseResult,{matched:true},'ordinary rotation returns no second-pin candidate');assert.deepEqual(poseOnly.params,source.params);assert.equal(gearPivotRotation(poseOnly.comps,poseOnly.params,dragId).joints.length,1,'ordinary rotation retains just the existing pin');
const candidate=structuredClone(source),motion=rotateGearPinnedMember(candidate.comps,candidate.params,dragId,{x:64,y:-32},{snapDistance:6});assert.ok(motion.candidate);assert.equal(motion.candidate.from,'Blank1_H0_48');assert.equal(motion.candidate.to,'Gear1_mount1');assert.equal(JSON.stringify(source),before);assert.deepEqual(candidate.params,source.params);assert.deepEqual(candidate.comps[0],source.comps[0]);
near(pointCoords(candidate.comps).Gear1_mount0.x,0);near(pointCoords(candidate.comps).Gear1_mount0.y,-16);
const drop={comps:candidate.comps,topo:{params:candidate.params},points:pointCoords(candidate.comps),theta:0,angles:{},gearPin:motion.candidate};
const planned=planGearPinConnection(source,drop,motion.candidate);assert.ok(planned.ok,planned.message);assert.deepEqual(planned.params,source.params);
const member=planned.comps.find(c=>c.id==='Blank1');assert.ok(member.holes.some(h=>h.id==='Gear1_mount1'),'local hole is really shared');assert.ok(member.holes.some(h=>h.id==='Gear1_mount0'));
for(const theta of [0,17,30]){const r=solve(planned,theta);assert.ok(r.isValid&&!r.isUnderconstrained);const p=r.points,expect=rotate({x:64,y:-32},{x:0,y:0},theta*Math.PI/180);near(p[dragId].x,expect.x);near(p[dragId].y,expect.y);}
const reopened=normalizeSnapshot(decodeShareString(encodeSnapshot({...source,comps:planned.comps,params:planned.params})));assert.ok(reopened);assert.ok(!solve(reopened,25).isUnderconstrained);
// Both release entries preserve the gear, local coordinates, all sizes and the first pin.
for(const release of [planReleaseGearPin(planned,'Gear1_mount1'),planSplit({...planned,counter:10},'Gear1_mount1')]){
 assert.ok(release.ok,release.message);assert.deepEqual(release.comps[0],planned.comps[0]);assert.deepEqual(release.params,planned.params);
 const after=release.comps[1];assert.ok(after.holes.some(h=>h.id==='Gear1_mount0'));assert.ok(!after.holes.some(h=>h.id==='Gear1_mount1'));for(const k of ['p1','p2','p3'])assert.deepEqual(after[k],member[k]);for(let i=0;i<member.holes.length;i++){near(after.holes[i].u,member.holes[i].u);near(after.holes[i].v,member.holes[i].v);}
 assert.ok(gearPivotRotation(release.comps,release.params,dragId));
}
// Release confirmation uses the normal commit/undo path; cancelled rotation is never committed.
let confirmCount=0;for(const answer of [false,true]){
 const state={comps:structuredClone(source.comps),topo:{params:{...source.params}},modules:[],counter:5,theta:0,motorAngles:{}},undos=[],notes=[];
 globalThis.confirm=message=>{confirmCount++;assert.match(message,/兩孔固定.*齒輪/);return answer;};
 const ok=mergeDropped({S:state,from:motion.candidate.from,to:motion.candidate.to,drop,transient:m=>notes.push(m),pushUndo:()=>undos.push(structuredClone(state.comps)),pause(){},rebuild(){},draw(){}});
 assert.equal(ok,true);assert.equal(undos.length,1);assert.deepEqual(undos[0],source.comps);
}assert.equal(confirmCount,0);
// No snapping to shaft/centre; distance mismatch, used holes and ambiguous targets never guess a joint.
for(const mode of ['mismatch','occupied','ambiguous','plain']){
 const w=fixture();if(mode==='mismatch')w.comps[0].holes[1].v=17;
 if(mode==='occupied')w.comps.push({type:'anchor',id:'Used',p1:{id:'Gear1_mount1',type:'fixed',x:0,y:16}});
 if(mode==='ambiguous')w.comps[0].holes.push({id:'Extra',u:0,v:16,diameter:3.2,type:'floating'});
 const r=rotateGearPinnedMember(w.comps,w.params,dragId,mode==='plain'?{x:20,y:70}:{x:64,y:-32},{snapDistance:4});assert.ok(r);assert.ok(!r.candidate,mode);assert.deepEqual(w.params,source.params);assert.equal(w.comps[0].phase,0);
}
// Unrelated unfinished objects do not invalidate a verified local joint.
{
 const work=structuredClone(source);work.comps.push({type:'motor',id:'LooseMotor',motorType:'tt',physicalMotor:'2',p1:{id:'LooseShaft',type:'fixed',physicalMotor:'2',x:250,y:250},motorMount:{motor:'2',center:'LooseShaft',face:'back',orientation:'horizontal'}},{type:'bar',id:'Loose',p1:{id:'LA',type:'floating',x:250,y:200},p2:{id:'LB',type:'floating',x:280,y:200},fixedLen:true,lenParam:'LL'});work.params.LL=30;
 const d={...drop,comps:[...drop.comps,...work.comps.slice(2)]};assert.ok(planGearPinConnection(work,d,motion.candidate).ok);
}
// Input's real move path rotates this member before trying to rotate the motor.
loadDrag(source);const theta=S.theta;Input.moveNodeTo(dragId,{x:64,y:-32});assert.equal(S.theta,theta);assert.equal(S.snapTarget,null);assert.deepEqual(S.comps[0],source.comps[0]);near(pointCoords(S.comps)[dragId].x,64);
// Fused bent bars use the same rigid rotation, including an interior grid hole.
{
 const a=makeStandardBlank({kind:'bar',lengthMm:64,n:2,origin:{x:0,y:-16}}),b=makeStandardBlank({kind:'bar',lengthMm:40,n:3,origin:{x:64,y:-16}});
 a.comp.p1.id='Gear1_mount0';b.comp.p1.id=a.comp.p2.id;b.comp.p2.x=64;b.comp.p2.y=24;
 a.comp.barFusionRoot=a.comp.id;b.comp.barFusionRoot=a.comp.id;a.comp.barFusion={version:1,members:[a.comp.id,b.comp.id],points:[{id:a.comp.p1.id,x:0,y:0},{id:a.comp.p2.id,x:64,y:0},{id:b.comp.p2.id,x:64,y:40}]};
 const w={...source,comps:[structuredClone(source.comps[0]),a.comp,b.comp],params:{...source.params,...a.params,...b.params}};
 for(const c of [a.comp,b.comp])for(const k of ['p1','p2'])Object.assign(c[k],rotate(c[k],{x:0,y:-16},82*Math.PI/180));
 const r=rotateGearPinnedMember(w.comps,w.params,b.comp.p2.id,{x:-40,y:48},{snapDistance:5});assert.ok(r?.candidate);assert.equal(r.candidate.from,'Blank2_H32_0');
 const d={comps:w.comps,points:pointCoords(w.comps),theta:0,angles:{}};const locked=planGearPinConnection(w,d,r.candidate);assert.ok(locked.ok,locked.message);assert.deepEqual(locked.params,w.params);
 for(const t of [0,20]){const solved=solve(locked,t);assert.ok(solved.isValid&&!solved.isUnderconstrained);const expected=rotate({x:-40,y:48},{x:0,y:0},t*Math.PI/180);near(solved.points[b.comp.p2.id].x,expected.x);near(solved.points[b.comp.p2.id].y,expected.y);}
 const released=planSplit({...locked,counter:20},r.candidate.to);assert.ok(released.ok);assert.ok(gearPivotRotation(released.comps,released.params,b.comp.p2.id));
}
// Pointer routing changes pose only: placing the second pin is an explicit tool action.
for(const pointer of ['mouse','touch'])for(const answer of [false,true]){
 loadDrag(source);S.undoStack=[];let prompts=0;globalThis.confirm=()=>{prompts++;return answer;};
 driveHooks.merge=(from,to,d)=>mergeDropped({S,from,to,drop:d,transient(){},pushUndo:()=>S.undoStack.push(JSON.stringify({comps:S.comps,params:S.topo.params})),pause(){},rebuild(){},draw(){}});
 await gesture(nodeDown(dragId),[[60,-40],[64,-32]],pointer);
 assert.equal(prompts,0);assert.equal(S.undoStack.length,1);assert.deepEqual(JSON.parse(S.undoStack[0]).comps,source.comps);assert.equal(S.comps[1].holes.filter(h=>/^Gear1_mount/.test(h.id)).length,1,'dragging never inserts the second pin');
}
loadDrag(source);S.undoStack=[];let prompts=0;globalThis.confirm=()=>{prompts++;return true;};await gesture(nodeDown(dragId),[[20,70]]);assert.equal(prompts,0);assert.equal(S.undoStack.length,1);assert.equal(S.comps[1].holes.filter(h=>/^Gear1_mount/.test(h.id)).length,1,'ordinary rotation keeps the first pin only');
// Exact angle and a drag to that angle share the same one-pivot rigid movement.
loadDrag(source);S.undoStack=[];Input.setPointAngle(dragId,27.35);const exact=structuredClone(S.comps);assert.equal(S.undoStack.length,1);near(pointRotation(S.comps,S.topo.params,dragId).angle,27.35);
loadDrag(source);const r0=pointRotation(S.comps,S.topo.params,dragId),a0=27.35*Math.PI/180;Input.moveNodeTo(dragId,{x:r0.pivot.x+r0.length*Math.cos(a0),y:r0.pivot.y+r0.length*Math.sin(a0)},{snap:false});assert.deepEqual(S.comps,exact);
// Releasing after rotation keeps the current displayed pose, not the saved zero pose.
{
 const shown=solve(planned,25).points,released=planSplit({...planned,counter:20,points:shown},'Gear1_mount1');assert.ok(released.ok);for(const k of ['p1','p2','p3']){const p=released.comps[1][k];near(p.x,shown[p.id].x);near(p.y,shown[p.id].y);}assert.deepEqual(released.comps[0],planned.comps[0]);
}
// A local member hole can be the drag handle too; pointer cancellation adds no joint/undo.
loadDrag(source);Input.moveNodeTo('Blank1_H8_0',{x:8,y:-32});assert.equal(S.snapTarget,null);near(pointCoords(S.comps)[dragId].x,64);
loadDrag(source);S.undoStack=[];emit('pointerdown',1,100,100,nodeDown(dragId),'touch');emit('pointermove',1,64,-32,undefined,'touch');flush();emit('pointercancel',1,64,-32,undefined,'touch');assert.deepEqual(S.comps,source.comps);assert.equal(S.undoStack.length,0);
// Ordinary free-end drops onto a support never identify their point IDs.
for(const pointer of ['mouse','touch']){
 const w={comps:[{type:'anchor',id:'Support',p1:{id:'Target',type:'fixed',x:100,y:0}},{type:'bar',id:'Free',fixedLen:true,lenParam:'L',p1:{id:'FA',type:'floating',x:0,y:0},p2:{id:'FB',type:'floating',x:32,y:0}}],params:{L:32}};
 loadDrag(w);S.undoStack=[];driveHooks.merge=()=>assert.fail('ordinary drops must not call a connection controller');
 await gesture(nodeDown('FA'),[[80,0],[100,0]],pointer);
 assert.equal(S.comps[1].p1.id,'FA');assert.equal(S.comps[0].p1.id,'Target');near(Math.hypot(S.comps[1].p2.x-S.comps[1].p1.x,S.comps[1].p2.y-S.comps[1].p1.y),32);assert.equal(S.undoStack.length,1);
}
if(process.argv.includes('--fixture')){
 const browserWork=structuredClone(source);browserWork.comps[1].standardBlank.drill='all';
 mkdirSync('output/gear-arm-lock',{recursive:true});writeFileSync('output/gear-arm-lock/one-pin.json',JSON.stringify(browserWork,null,2));writeFileSync('output/gear-arm-lock/index.html',`<!doctype html><meta charset="utf-8"><title>彎桿第二孔固定</title><h1>彎桿第二孔固定</h1><p>第一孔已接好。拖L型右端孔至(64, −32)，綠圈亮起後放開，確認雙孔固定。</p><a href="../../blocks.html#m=${encodeSnapshot(browserWork)}">載入獨立驗收作品</a>`);
 console.log('Fixture drag',dragId,pointCoords(source.comps)[dragId],'->',{x:64,y:-32},'; second local hole Blank1_H0_48 -> Gear1_mount1 at (0,16)');
}
console.log('Gear arm lock: one-pin rigid rotation, local second hole, preview/confirm/cancel/undo/release, mismatched/used/ambiguous holes, save/reopen, unrelated unfinished work and driven motion passed');
