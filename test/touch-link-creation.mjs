import assert from 'node:assert/strict';
import { S } from '../js/blocks/state.js';
import * as Tools from '../js/blocks/tools.js';
import * as Input from '../js/blocks/input.js';
const handlers=[];
const noop=()=>{};
const svg={style:{},setPointerCapture:noop,addEventListener(type,fn,capture){handlers.push({type,fn,capture:capture===true});}};
const deps={svg,draw:noop,rebuild:noop,pushUndo:noop,pause:noop,cancelMotorMode:noop,deselectLink:noop,selectLink:noop,selectTriangle:noop,
  setBanner:noop,clearBanner:noop,worldFromEvent:e=>({x:e.clientX,y:e.clientY}),pointCoords:()=>({}),displayPointCoords:()=>({}),nearestDisplayToPoint:()=>null,
  snapWorld:()=>10,mobilePrompt:()=>true,promptText:(a,b)=>b};
Tools.init(deps); Input.init(deps);
function fire(type,x,y,id=1){let stopped=false;const e={type,clientX:x,clientY:y,pointerId:id,pointerType:'touch',preventDefault:noop,stopPropagation:noop,stopImmediatePropagation(){stopped=true;}};
  for(const h of handlers.filter(h=>h.type===type).sort((a,b)=>Number(b.capture)-Number(a.capture))){h.fn(e);if(stopped)break;}}
function tap(x,y){fire('pointerdown',x,y);fire('pointerup',x,y);}
S.comps=[]; S.topo={params:{}}; S.counter=0;
Tools.startDrawLink(); tap(10,20);
assert.equal(S.comps.length,0,'first tap must not create a default bar');
tap(10,20);assert.equal(S.comps.length,0,'repeated start must not create a default-length bar');
tap(90,20); assert.equal(S.comps.length,1); assert.equal(S.comps[0].p1.x,10);assert.equal(S.comps[0].p2.x,90);
Tools.startDrawLink(); fire('pointerdown',0,0);fire('pointerup',64,0);
assert.equal(S.comps.length,2,'drag remains supported');
for(const shape of ['triangle','polyline']){
  Tools.startDrawTriangle(shape);tap(0,0);tap(64,0);assert.equal(S.comps.length,shape==='triangle'?2:3);
  tap(32,48);const c=S.comps.at(-1);assert.equal(c.type,'triangle');assert.equal(c.shapeMode,shape==='polyline'?'polyline':undefined);
  assert.equal(S.drawingTriangle,false);
}
Tools.startDrawTriangle(); fire('pointerdown',0,0);fire('pointercancel',0,0);
assert.equal(S.trianglePoints.length,0,'pointer cancellation must not add a point');Tools.exitDrawTriangle();
Tools.startDrawLink();tap(0,0);Tools.exitDrawLink();assert.equal(S.comps.length,4,'cancel must not create a bar');
console.log('PASS touch taps, drag, both rigid three-point shapes and cancellation');
