import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {S} from '../js/blocks/state.js';
import * as Tools from '../js/blocks/tools.js';
import * as Model from '../js/blocks/model.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {gearPivotRotation,gearPinHoles} from '../js/blocks/gear-pin-connection.js';
import {pinPoints} from '../js/core/pin-lock.js';
import {planMemberCopy} from '../js/blocks/member-copy.js';
import {nearestHit} from '../js/blocks/drive-drag.js';
import {planInsertPin} from '../js/blocks/pin-ops.js';
import {runEdit} from '../js/blocks/edit-pipeline.js';
import '../js/blocks/arm-blank.js';
const base=normalizeSnapshot(JSON.parse(readFileSync(new URL('./fixtures/gear-arm-on-plate.json',import.meta.url))));base.comps=base.comps.filter(c=>c.id!=='Blank68');
const app=readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8');
// Exercise the real app snap closures without starting its DOM controller.
const snapExpression=(start,end)=>app.slice(app.indexOf(start)+start.length,app.indexOf(end,app.indexOf(start))).trim().replace(/;$/,'');
const getCoords=()=>{const r=solveTopology(compileTopology(S.comps,{params:{...S.topo.params}},new Set()),{thetaDeg:S.theta,motorAngles:S.motorAngles});return {...Model.pointCoords(S.comps),...r.points};};
const nearestPoint=new Function('S','displayCoords','snapWorld','isHiddenSliderRailPoint','isBoxReference','return '+snapExpression('const nearestDisplayToPoint = ','// 找最接近'))(S,getCoords,()=>4,()=>false,()=>false);
const nearestNode=new Function('S','Model','displayCoords','snapWorld','isHiddenSliderRailPoint','isBoxReference','canMergePoints','return '+snapExpression('const nearestDisplayTo = ','// 若 id 是某根'))(S,Model,getCoords,()=>4,()=>false,()=>false,()=>true);
let undos=[];
globalThis.document={getElementById:()=>null};globalThis.window={confirm:()=>assert.fail('placement never prompts')};
Tools.init({svg:{style:{}},draw(){},rebuild(){},pause(){},cancelMotorMode(){},deselectLink(){},selectLink(){},selectTriangle(){},pushUndo:()=>undos.push(structuredClone(S.comps)),setBanner(){},clearBanner(){},notify(){},worldFromEvent:e=>e?.world,pointCoords:()=>Model.pointCoords(S.comps),displayPointCoords:getCoords,snapWorld:()=>4,promptText:s=>s,nearestDisplayToPoint:nearestPoint});
const load=t=>{Object.assign(S,{comps:structuredClone(base.comps),topo:{params:{...base.params}},counter:80,theta:t,motorAngles:{},modules:[],undoStack:[]});undos=[];};
const lock=(work,memberId,endId,theta,gearId)=>{
 const solved=solveTopology(compileTopology(work.comps,{params:{...work.params}},new Set()),{thetaDeg:theta}),positions={...Model.pointCoords(work.comps),...solved.points};
 const member=work.comps.find(c=>c.id===memberId),pivot=positions[member.p1.id],target=positions[gearId+'_mount1'],radius=Math.hypot(target.x-pivot.x,target.y-pivot.y);
 const from=pinPoints(member).find(p=>p.id!==member.p1.id&&Math.abs(Math.hypot((positions[p.id]||p).x-pivot.x,(positions[p.id]||p).y-pivot.y)-radius)<.001)?.id;
 assert.ok(from,'a matching member hole exists');
 const result=planInsertPin({...work,points:positions,theta},{ownerId:memberId,otherId:gearId,from,to:gearId+'_mount1'});assert.ok(result.ok,result.message);assert.deepEqual(result.params,work.params);return result;
};
for(const theta of [0,4])for(const method of ['draw','bar','arms']){
 load(theta);const pivot=getCoords().Gear65_mount0,platePoint={x:-40,y:-8};
 assert.equal(nearestPoint(platePoint),'Gear65_mount0','visible gear wins over the closer underlying plate within the snap radius');
 if(method==='draw'){Tools.startDrawLink();Tools.startLinkAt(pivot);await Tools.finishDrawLink({world:{x:pivot.x-32,y:pivot.y}});}
 else{Tools.startStandardBlank(method==='bar'?{kind:'bar',lengthMm:64}:{kind:'arms',arms:[{holes:8,angleDeg:0},{holes:8,angleDeg:138}]});Tools.updateStandardBlank({origin:pivot});await Tools.confirmStandardBlank();}
 let member=S.comps.at(-1);assert.notEqual(member.p1.id,'Gear65_mount0','new aligned parts remain independent until a pin is used');assert.equal(undos.length,1);
 const first=planInsertPin({comps:S.comps,params:S.topo.params,points:getCoords(),theta},{ownerId:member.id,otherId:'Gear65',from:member.p1.id,to:'Gear65_mount0'});assert.ok(first.ok,first.message);S.comps=first.comps;S.topo.params=first.params;member=S.comps.find(c=>c.id===member.id);
 if(method==='bar'&&theta===0){
  const p=member.p2,box=id=>({dataset:{nodeHit:id},getBoundingClientRect:()=>({x:p.x-10,y:p.y-10,width:20,height:20})});
  globalThis.document.elementsFromPoint=()=>[box('Blank1_H88_40'),box(p.id)];assert.equal(nearestHit({clientX:p.x,clientY:p.y},'Blank1_H88_40'),p.id,'coincident plate hit cannot steal the gear-pinned member end');
  const guard=app.match(/function guardedNodeDown\(e, id, chosen\) \{[\s\S]*?\n\}/)[0];let picked;
  const down=new Function('driveDrag','isBoxReference','ensureModuleHome','moduleOfPoint','S','Input','return ('+guard+')')({nearestHit},()=>false,()=>false,()=>'',S,{onNodeDown:(e,id)=>picked=id});
  const e={clientX:p.x,clientY:p.y,target:{dataset:{},getAttribute:()=> 'Blank1_H88_40'}};down(e,'Blank1_H88_40');assert.equal(picked,p.id,'visible circle data-id path also resolves the movable end');down(e,'Blank1_H88_40',true);assert.equal(picked,'Blank1_H88_40','explicit picker choice remains respected');
 }
 assert.equal(member.p1.id,'Gear65_mount0');assert.notEqual(member.fixedLen,false);assert.ok(gearPivotRotation(S.comps,S.topo.params,member.p2.id,getCoords()));assert.equal(undos.length,1);
 const work={...base,comps:S.comps,params:S.topo.params},before=structuredClone(work.params),locked=lock(work,member.id,member.p2.id,theta,'Gear65');assert.deepEqual(locked.params,before);
 // Copying the newly locked arm creates free IDs; dropping the copy onto the
 // right gear uses the exact same first-pin route as an ordinary loose piece.
 if(method==='arms'){
  const solved=solveTopology(compileTopology(locked.comps,{params:{...locked.params}},new Set()),{thetaDeg:theta}),copy=planMemberCopy({comps:locked.comps,params:locked.params,id:member.id,counter:90,positions:solved.points});assert.ok(copy.ok,copy.reason);
  Object.assign(S,{comps:[...locked.comps,...copy.comps],topo:{params:{...locked.params,...copy.params}},theta});const cloned=copy.comps[0],from=cloned.p1.id,dx=32-cloned.p1.x,dy=-8-cloned.p1.y;
  for(const k of ['p1','p2','p3']){cloned[k].x+=dx;cloned[k].y+=dy;}
  const to=nearestNode(from);assert.equal(to,'Gear66_mount0','copy drop prioritizes the gear even 1.1 mm from the plate hole');
  const d={comps:structuredClone(S.comps),topo:S.topo,points:getCoords(),theta,angles:{}};let count=0;
  assert.equal(runEdit({name:'放入插銷',plan:w=>planInsertPin({...w,theta},{ownerId:cloned.id,otherId:'Gear66',from,to}),host:{S,points:d.points,transient(){},pushUndo(){count++;},pause(){},rebuild(){},draw(){}}}),true);assert.equal(count,1);
  const attached=S.comps.find(c=>c.id===cloned.id);assert.equal(attached.p1.id,'Gear66_mount0');lock({comps:S.comps,params:S.topo.params},attached.id,attached.p2.id,theta,'Gear66');
 }
}
load(4);assert.notEqual(nearestPoint({x:300,y:300}),'Gear65_mount0','remote gears never capture a drop');
console.log('New drawn/standard/arms and copied arm: aligned creation stays independent, explicit first/second pins and copy retain dimensions at 0/4° passed');
