import assert from 'node:assert/strict';
import { S } from '../js/blocks/state.js';
import * as Tools from '../js/blocks/tools.js';
import * as Input from '../js/blocks/input.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
const handlers=[];
const noop=()=>{};
const svg={getBoundingClientRect:()=>({left:0,right:1000,top:0,bottom:1000}),querySelectorAll:()=>[],contains:()=>false,ownerDocument:{elementsFromPoint:()=>[]},style:{},setPointerCapture:noop,addEventListener(type,fn,capture){handlers.push({type,fn,capture:capture===true});}};
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
// Closing a linkage on existing holes must preserve their exact separation.
const a={x:-191.20863591782165,y:-56.31810152035371};
const b={x:-114.84447885009033,y:-52.85522294151475};
const points={A:a,B:b};
Tools.init({...deps,pointCoords:()=>points,displayPointCoords:()=>points,
  nearestDisplayToPoint:(p,exclude=[])=>Object.keys(points).find(id=>!exclude.includes(id)&&Math.hypot(p.x-points[id].x,p.y-points[id].y)<1)});
S.comps=[{type:'anchor',id:'a',p1:{id:'A',type:'fixed',...a}},{type:'anchor',id:'b',p1:{id:'B',type:'fixed',...b}}];
S.topo={params:{}};
Tools.startDrawLink();tap(a.x,a.y);tap(b.x,b.y);
const c=S.comps.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y);
assert.equal(S.topo.params[c.lenParam],length);
assert.equal(solveTopology(compileTopology(S.comps,S.topo,new Set()),{thetaDeg:0}).isValid,true);
const reopened=normalizeSnapshot({kind:'blocks',v:1,comps:S.comps,params:S.topo.params});
assert.equal(reopened.params[c.lenParam],length);
console.log('PASS snapped closing bar retains exact length through save normalization');
// Gear output holes need not lie on the LEGO grid. Snapping must connect,
// rather than silently drawing a different, unconnected point nearby.
points.C = { x: -150.25, y: 15.75 };
Tools.init({...deps, pointCoords:()=>({A:{x:0,y:0},B:{x:80,y:0},C:{x:40,y:80}}),
  displayPointCoords:()=>points,
  nearestDisplayToPoint:(p,exclude=[])=>Object.keys(points).find(id=>!exclude.includes(id)&&Math.hypot(p.x-points[id].x,p.y-points[id].y)<1)});
for (const shape of ['triangle', 'polyline']) {
  Tools.startDrawTriangle(shape);
  tap(a.x, a.y); tap(b.x, b.y); tap(points.C.x, points.C.y);
  const plate = S.comps.at(-1);
  assert.equal(plate.p1.id, 'A'); assert.equal(plate.p2.id, 'B'); assert.equal(plate.p3.id, 'C');
  assert.equal(S.topo.params[plate.gParam], length);
  assert.equal(S.topo.params[plate.r1Param], Math.hypot(points.C.x-a.x, points.C.y-a.y));
  assert.equal(S.topo.params[plate.r2Param], Math.hypot(points.C.x-b.x, points.C.y-b.y));
  const saved = normalizeSnapshot({kind:'blocks',v:1,comps:S.comps,params:S.topo.params});
  assert.equal(saved.comps.at(-1).p2.id, 'B');
  assert.equal(saved.params[plate.gParam], length);
}
console.log('PASS three-point plates preserve off-grid hole IDs and exact lengths');
