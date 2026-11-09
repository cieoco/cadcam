import assert from 'node:assert/strict';
import { previewPointConnection, pointCoords } from '../js/blocks/model.js';
const p=(id,x,y,type='floating')=>({id,x,y,type});
const bar=(id,a,b)=>({id,type:'bar',p1:a,p2:b,lenParam:id,fixedLen:true});
const anchor=(id,x,y)=>({id:'anchor'+id,type:'anchor',p1:p(id,x,y,'fixed')});
const topo={params:{rod:80}};
const free=[bar('rod',p('a',0,0),p('b',80,0)),anchor('target',2,3)];
const before=JSON.stringify(free);
let r=previewPointConnection(free,topo,'a','target');
assert.equal(r.ok,true);assert.equal(JSON.stringify(free),before);
assert.equal(r.comps[0].p1.id,'target');assert.equal(r.comps[0].p2.x,82);
assert.equal(topo.params.rod,80);
const pinned=[bar('rod',p('a',0,0,'fixed'),p('b',80,0)),anchor('target',79,0)];
const original=JSON.stringify(pinned);
r=previewPointConnection(pinned,topo,'b','target');
assert.equal(r.ok,false);assert.equal(JSON.stringify(pinned),original);
pinned[1].p1.x=0;pinned[1].p1.y=80;
r=previewPointConnection(pinned,topo,'b','target');assert.equal(r.ok,true);
assert.equal(previewPointConnection(free,topo,'a','b').ok,false);
const triangle={id:'t',type:'triangle',p1:p('a',0,0),p2:p('b',80,0),p3:p('c',0,60),gParam:'g',r1Param:'r1',r2Param:'r2',shapeMode:'polyline'};
r=previewPointConnection([triangle,anchor('target',3,4)],{params:{g:80,r1:60,r2:100}},'a','target');assert.equal(r.ok,true);
const coords=pointCoords(r.comps);assert.ok(Math.abs(Math.hypot(coords.b.x-coords.c.x,coords.b.y-coords.c.y)-100)<1e-6);
const modules=structuredClone(free);modules[0].moduleId='one';modules[1].moduleId='two';
assert.equal(previewPointConnection(modules,topo,'a','target').ok,false);
console.log('PASS connection candidates preserve dimensions, reject impossible/degenerate/cross-module joins, and never mutate originals');
// A standard member's local holes belong to the same rigid part as its endpoints.
const grid=[{...bar('grid',p('A',0,0),p('B',32,0)),standardBlank:{kind:'bar'},holes:[{id:'H8',u:8,v:0,type:'floating'},{id:'H24',u:24,v:0,type:'floating'}]}];
const gridBefore=JSON.stringify(grid);
for(const [from,to] of [['B','H24'],['H24','B'],['H8','H24']]){
 const result=previewPointConnection(grid,{params:{grid:32}},from,to);
 assert.equal(result.ok,false);assert.match(result.message,/同一零件/);assert.equal(JSON.stringify(grid),gridBefore);
}
console.log('PASS same-member endpoint/local-hole merges rejected without mutation');
