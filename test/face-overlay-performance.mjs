import assert from 'node:assert/strict';
import {createFaceEdgeOverlay} from '../js/blocks/face-edge-overlay.js';
let allocations=0,writes=0,rectReads=0;
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attributes=new Map();this.style={};allocations++;}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
 setAttribute(k,v){writes++;this.attributes.set(k,String(v));}
 getAttribute(k){return this.attributes.get(k) ?? null;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
 getBoundingClientRect(){rectReads++;return {left:0,top:0,width:300,height:200};}
}
globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
globalThis.requestAnimationFrame=()=>{throw Error('Static face overlays must not start their own animation loop');};
const container=new Element('div'),canvas={parentElement:container},listeners=new Set();let batches=0,shift=0,picked;
const viewer={canvas,subscribeProjection(fn){listeners.add(fn);return ()=>listeners.delete(fn);},projectPoints(points){batches++;return points.map(p=>({x:p.x+100+shift,y:p.y+100}));}};
const box={min:{x:-10,y:-5,z:-1.5},max:{x:10,y:5,z:1.5}},outline=[{x:-10,y:-5},{x:10,y:-5},{x:10,y:5},{x:-10,y:5}],matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const candidate={hostSurface:{compId:'H',box,outlines:[outline]},childSurface:{compId:'C',box,outlines:[outline]},hostReference:{origin:{x:0,y:0},angle:0},childReference:{origin:{x:0,y:0},angle:0},placement:{selection:{hostFace:'top',childFace:'bottom'}},model:{materialParts:['H','C'].map(partId=>({partId,pose:{matrix},geometry:{thicknessMm:3}}))}};
const overlay=createFaceEdgeOverlay(viewer,value=>picked=value);overlay.setCandidate(candidate);overlay.showFaces(true);
assert.equal(batches,1);assert.equal(container.children.length,1);const root=container.children[0],nodes=[...root.children],initialAlloc=allocations,initialWrites=writes;
for(let i=0;i<100;i++){overlay.showFaces(true);overlay.setCandidate(candidate);}
assert.equal(batches,1,'unchanged candidate and phase do not reproject');assert.equal(allocations,initialAlloc);assert.equal(writes,initialWrites);
for(const fn of listeners)fn();assert.equal(allocations,initialAlloc,'same SVG nodes survive view updates');assert.equal(writes,initialWrites,'identical projected coordinates do not write DOM');
shift=15;const reads=rectReads;for(const fn of listeners)fn();assert.equal(rectReads-reads,1,'one overlay layout read per view update');assert.deepEqual(root.children,nodes);assert.ok(writes>initialWrites);
overlay.pick({endpoint:'host',face:'top'});const edgeRoot=container.children[0],groups=edgeRoot.children.filter(n=>n.getAttribute('role')==='button');assert.equal(groups.length,4);
const edgeAlloc=allocations;shift=20;for(const fn of listeners)fn();assert.equal(allocations,edgeAlloc,'camera motion never recreates edge hit targets');assert.ok(edgeRoot.children.includes(groups[0]));
groups[0].onkeydown({key:'Enter',preventDefault(){}});assert.ok(picked.reference);assert.equal(picked.label,'邊 1');
overlay.clear();assert.equal(container.children.length,0);overlay.dispose();assert.equal(listeners.size,0,'closing preview releases view subscriptions');
console.log('face overlay: no independent RAF, no idle DOM churn, batched projection, stable edge targets and subscription cleanup passed');
