// Shared pointer rig for the O3 drag tests (test/drag-feedback.mjs, test/operation-matrix.mjs): a fake SVG + the REAL js/blocks/input.js.
// Not a test by itself.
import * as Input from '../js/blocks/input.js';
import * as View from '../js/blocks/view.js';
import * as Model from '../js/blocks/model.js';
import {S} from '../js/blocks/state.js';

const keep=globalThis.document?.getElementById;
globalThis.document=Object.assign(globalThis.document||{},{getElementById:keep||(id=>['lenEditor','gearEditor','sliderBaseBtn','linkToRailBtn'].includes(id)?{style:{}}:null)});
for(const k of ['addEventListener','dispatchEvent'])if(!globalThis.document[k]){const et=new EventTarget();globalThis.document[k]=et[k].bind(et);}
globalThis.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
let nextRaf=0;const rafs=new Map();
globalThis.requestAnimationFrame=fn=>{rafs.set(++nextRaf,fn);return nextRaf;};
globalThis.cancelAnimationFrame=id=>rafs.delete(id);
const flush=()=>{const p=[...rafs.values()];rafs.clear();p.forEach(f=>f());};
const settle=()=>new Promise(r=>setTimeout(r,40));
const noop=()=>{};
const listeners=new Map();
const svg={getBoundingClientRect:()=>({left:0,right:1000,top:0,bottom:1000}),querySelectorAll:()=>[],contains:()=>false,ownerDocument:{elementsFromPoint:()=>[]},
  addEventListener(type,fn,options){const l=listeners.get(type)||[];l.push({fn,capture:options===true||options?.capture===true});listeners.set(type,l);},setPointerCapture:noop,getScreenCTM:()=>({a:1,d:1,inverse:()=>({})})};
function emit(type,id,x,y,target=noop,pointerType='mouse'){
  const ev={type,pointerId:id,pointerType,clientX:x,clientY:y,target:null,preventDefault:noop,stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;}};
  const l=listeners.get(type)||[];
  for(const i of l.filter(i=>i.capture)){i.fn(ev);if(ev.immediate)break;}
  if(!ev.stopped)target(ev);
  if(!ev.stopped)for(const i of l.filter(i=>!i.capture)){i.fn(ev);if(ev.immediate)break;}
}
export const driveHooks={body:null,to:null};   // fake drive: body(c,g)->probe|null, to(id|probe,w)->truthy when the drive moved something
export let msgs=[];let drive='none';export const setDrive=v=>{drive=v;};export const resetMsgs=()=>{msgs=[];};
const snapshotStr=()=>JSON.stringify({comps:S.comps,params:S.topo.params,theta:S.theta,motorAngles:S.motorAngles});
Input.init({selectLink:noop,selectTriangle:noop,svg,draw:noop,rebuild:noop,pause:noop,cancelMotorMode:noop,deselectLink:noop,
  worldFromEvent:e=>({x:e.clientX,y:e.clientY}),pointCoords:()=>Model.pointCoords(S.comps),mobilePrompt:()=>false,
  movePointById:(id,dx,dy)=>Model.movePointById(S.comps,id,dx,dy),updatePointCoordsById:(id,x,y)=>Model.updatePointCoordsById(S.comps,id,x,y),
  snapshotStr,updateUndoBtn:noop,nearestDisplayTo:()=>null,frameNodeIds:()=>new Set(),recomputeLengths:noop,mergePoints:noop,
  pointIsGround:id=>Model.pointIsGround(S.comps,id),setSliderDetailRows:noop,openMobileEditPanel:noop,transient:m=>msgs.push(m),
  freeLinkForPoint:id=>Model.freeLinkForPoint(S.comps,id),freeTriangleForPoint:id=>Model.freeTriangleForPoint(S.comps,id),
  pinnedTriangleForPoint:id=>Model.pinnedTriangleForPoint(S.comps,id),lockedTriangleVertex:id=>Model.lockedTriangleVertex(S.comps,id),
  fixedLinkFor:id=>Model.fixedLinkFor(S.comps,id),inputCrankMovingEnd:()=>null,driveState:()=>drive,
  driveBody:(c,g)=>driveHooks.body?driveHooks.body(c,g):null,drivePointTo:(id,w)=>driveHooks.to?driveHooks.to(id,w):false});
View.resetView();


export const bodyDown=id=>e=>{e.stopPropagation();Input.startFreeLinkDrag(e,id);};
export const nodeDown=id=>e=>Input.onNodeDown(e,id);
export {emit,flush,settle,noop};
export async function gesture(down,moves,pointerType='mouse',id=1){
  msgs=[];emit('pointerdown',id,100,100,down,pointerType);
  for(const [x,y] of moves){emit('pointermove',id,x,y,noop,pointerType);flush();}
  await settle();emit('pointerup',id,...(moves.at(-1)||[100,100]),noop,pointerType);return msgs.slice();
}
export function load(w){S.comps=structuredClone(w.comps);S.modules=structuredClone(w.modules||[]);S.topo={params:{...w.params},tracePoints:[],dimensions:[],loads:[]};S.fabrication=w.fabrication;S.mode='design';
  S.selectedLinkId=S.selectedTriangleId=S.selectedNodeId=S.selectedSliderId=S.selectedGearId=null;S.dragId=null;S.dragLinkId=null;S.preDragSnap=null;msgs=[];}
