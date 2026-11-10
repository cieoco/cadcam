import assert from 'node:assert/strict';
import * as Tools from '../js/blocks/tools.js';
import {S} from '../js/blocks/state.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
let undo=0,closed=0;globalThis.document={getElementById:()=>null};
Tools.init({svg:{style:{},getScreenCTM:()=>null,setPointerCapture(){}},draw(){},rebuild(){},pushUndo:()=>undo++,pause(){},cancelMotorMode(){},deselectLink(){},selectLink(){},selectTriangle(){},setBanner(){},clearBanner(){},worldFromEvent:e=>e?.world,nearestDisplayToPoint:()=>S.comps.find(c=>c.type==='anchor')?.p1.id,snapWorld:()=>20,displayPointCoords:()=>({A:{x:0,y:0}}),notify:message=>assert.fail(message),promptText:a=>a});
const event=(x,y)=>({world:{x,y},clientX:x,clientY:y,pointerId:1,target:{closest:()=>true}});
for(const kind of ['bar','plate','l']){
 S.comps=[];S.topo.params={theta:0};S.counter=0;undo=0;
 const opts={kind,lengthMm:56.3,heightMm:24.2,armWidthMm:13};Tools.startStandardBlank(opts,{closed:()=>closed++});Tools.updateStandardBlank({origin:{x:12.25,y:8.75}});const before=JSON.stringify(S.comps),origin={...S.standardBlankDraft.origin};
 Tools.standardBlankPointer(event(10,10),'down');assert.equal(S.comps.length,0);Tools.standardBlankPointer(event(18,18),'move');assert.deepEqual(S.standardBlankDraft.origin,{x:20.25,y:16.75});Tools.standardBlankPointer(null,'cancel');assert.deepEqual(S.standardBlankDraft.origin,origin);assert.equal(S.standardBlankDraft.lengthMm,56.3);assert.equal(undo,0);
 Tools.updateStandardBlank({lengthMm:64});assert.equal(S.standardBlankDraft.heightMm,24.2);assert.deepEqual(S.standardBlankDraft.origin,origin);Tools.cancelStandardBlank();assert.equal(JSON.stringify(S.comps),before);assert.equal(undo,0);
 Tools.startStandardBlank(opts);Tools.updateStandardBlank({origin});Tools.confirmStandardBlank();assert.equal(S.comps.length,1);assert.equal(undo,1);const c=S.comps[0];assert.equal(c.p1.x,12.25);assert.equal(c.p1.y,8.75);assert.equal(S.topo.params[c.lenParam||c.gParam],56.3);assert.equal(c.holes.length,makeStandardBlank(opts).comp.holes.length);
}
// A nearby existing hole is not permission to move the candidate on confirmation.
S.comps=[{id:'Anchor',type:'anchor',p1:{id:'A',type:'fixed',x:0,y:0}}];S.counter=0;S.topo.params={theta:0};undo=0;Tools.startStandardBlank({kind:'bar',lengthMm:56});Tools.updateStandardBlank({origin:{x:.25,y:.5}});Tools.confirmStandardBlank();assert.equal(S.comps[1].p1.x,.25);assert.equal(S.comps[1].p1.y,.5);assert.notEqual(S.comps[1].p1.id,'A');assert.equal(undo,1);
S.comps=[{id:'Anchor',type:'anchor',p1:{id:'A',type:'fixed',x:0,y:0}}];S.counter=0;undo=0;Tools.startStandardBlank({kind:'bar',lengthMm:56});Tools.standardBlankPointer({...event(.25,.5),target:{closest:()=>false}},'down');Tools.standardBlankPointer(event(.25,.5),'up');assert.equal(S.standardBlankDraft,null,'release commits without a second confirmation');assert.equal(S.comps[1].p1.id,'A');assert.equal(S.comps[1].p1.x,0);assert.equal(S.comps[1].p1.y,0);assert.equal(undo,1);
console.log('standard-blank creation: draft-only movement/resize/cancel, precise position, independent axes, one confirm undo, no late snap passed');
