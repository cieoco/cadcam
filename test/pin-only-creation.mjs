import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {S} from '../js/blocks/state.js';
import * as Tools from '../js/blocks/tools.js';
import * as Model from '../js/blocks/model.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {pinPoints} from '../js/core/pin-lock.js';
import {planInsertPin} from '../js/blocks/pin-ops.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import '../js/blocks/arm-blank.js';
const runtime=name=>readFileSync(new URL('../js/blocks/'+name,import.meta.url),'utf8');
assert.ok(!runtime('app.js').includes("import('./connect-ops.js')"),'production UI must not load the legacy connection controller');
assert.ok(!runtime('input.js').includes('gearPinDrop')&&!runtime('input.js').includes('mergePoints('),'dragging has no second-pin state or connection commit');
assert.ok(!runtime('node-editor.js').includes('splitNode'),'node editor no longer exposes the legacy split action');
assert.ok(!readFileSync(new URL('../blocks.html',import.meta.url),'utf8').includes('window.blocks.splitNode'),'old split button is removed, not hidden');

globalThis.document={getElementById:()=>null};
let undo=0;
const coords=()=>Model.pointCoords(S.comps),nearest=(p,exclude=[],max=2)=>Object.entries(coords()).find(([id,q])=>!exclude.includes(id)&&Math.hypot(q.x-p.x,q.y-p.y)<=max)?.[0]||null;
Tools.init({svg:{style:{},getScreenCTM:()=>null},draw(){},rebuild(){},pause(){},cancelMotorMode(){},deselectLink(){},selectLink(){},selectTriangle(){},pushUndo(){undo++;},setBanner(){},clearBanner(){},notify:m=>assert.fail(m),worldFromEvent:e=>e?.world,pointCoords:coords,displayPointCoords:coords,snapWorld:()=>2,promptText:s=>s,nearestDisplayToPoint:nearest});
const a={x:0,y:0},b={x:64,y:0},c={x:0,y:64},event=world=>({world,pointerType:'mouse'});
const methods={
 link:async()=>{Tools.startDrawLink();Tools.startLinkAt(a);await Tools.finishDrawLink(event(b));},
 disk:async()=>{Tools.startDrawDisk();Tools.startLinkAt(a);await Tools.finishDrawLink(event(b));},
 triangle:()=>{Tools.startDrawTriangle();for(const p of [a,b,c])Tools.placeTrianglePoint(event(p));},
 polyline:()=>{Tools.startDrawTriangle('polyline');for(const p of [a,b,c])Tools.placeTrianglePoint(event(p));},
 jaw:()=>{Tools.startDrawTriangle('jaw');for(const p of [a,b,c])Tools.placeTrianglePoint(event(p));},
 twoPointTriangle:()=>{Tools.startDrawTriangle();for(const p of [a,b])Tools.placeTrianglePoint(event(p));Tools.finishPlateAsLinkEarly();},
 polygonBar:()=>{Tools.startDrawPolygon();for(const p of [a,b])Tools.addPolygonVertex(event(p));return Tools.finishPolygonDraw();},
 polygonPlate:()=>{Tools.startDrawPolygon();for(const p of [a,b,c,{x:64,y:64}])Tools.addPolygonVertex(event(p));Tools.finishPolygonDraw();}
};
for(const kind of ['bar','plate','l','arms'])methods[kind]=async()=>{Tools.startStandardBlank(kind==='arms'?{kind,arms:[{holes:9,angleDeg:0},{holes:9,angleDeg:90}]}:{kind,lengthMm:kind==='bar'?56.5:64,heightMm:64});Tools.updateStandardBlank({origin:a});await Tools.confirmStandardBlank();};
let cases=0;
for(const hostFirst of [true,false])for(const [name,create] of Object.entries(methods)){
 const host=makeStandardBlank({kind:'plate',n:1,lengthMm:64,heightMm:64,origin:a});assert.ok(host.ok);
 host.comp.p1.type=host.comp.p2.type='fixed';
 Object.assign(S,{comps:hostFirst?[structuredClone(host.comp)]:[],topo:{params:{...host.params}},counter:100,theta:0,motorAngles:{},modules:[],undoStack:[]});undo=0;
 await create();assert.equal(undo,1,name+' creates one undo');assert.equal(S.comps.length,hostFirst?2:1,name);
 const body=S.comps.at(-1),saved=structuredClone(body),params=structuredClone(S.topo.params),hostIds=new Set(pinPoints(host.comp).map(p=>p.id));
 assert.ok(pinPoints(body).every(p=>!hostIds.has(p.id)),name+' must not share ordinary hole IDs');
 assert.equal(body.p1.x,0);assert.equal(body.p1.y,0);assert.equal(body.moduleId,undefined);
 if(!hostFirst)S.comps.push(structuredClone(host.comp));
 const before=structuredClone(S.comps.find(p=>p.id===host.comp.id));
 const joined=planInsertPin({comps:S.comps,params,points:coords()},{ownerId:body.id,otherId:host.comp.id,from:body.p1.id,to:host.comp.p1.id});
 assert.ok(joined.ok,name+': '+joined.message);assert.deepEqual(joined.params,params);
 const after=joined.comps.find(p=>p.id===body.id);assert.equal(after.p1.id,host.comp.p1.id);
 for(const key of ['p1','p2','p3'])if(saved[key])assert.deepEqual({x:after[key].x,y:after[key].y},{x:saved[key].x,y:saved[key].y},name+' pin retains aligned pose');
 assert.deepEqual(joined.comps.find(p=>p.id===host.comp.id),before,name+' host stays unchanged');
 if(name==='bar')assert.equal(params[body.lenParam],56.5,'exact size is preserved');
 const reopened=normalizeSnapshot({comps:joined.comps,params:joined.params});assert.equal(reopened.comps.find(p=>p.id===body.id).p1.id,host.comp.p1.id,'legacy shared IDs remain compatible');
 cases++;
}
console.log(`Pin-only creation: ${cases} drawn/standard shape and creation-order cases preserve independent IDs, alignment, dimensions, explicit pin insertion, undo and reopen`);
