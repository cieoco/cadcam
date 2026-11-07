import assert from 'node:assert/strict';
import {syringePositionOnFrame} from '../js/blocks/syringe-position.js';
import {diskTurntableSnapshot,pivotTurntableSnapshot} from '../js/blocks/disk-turntable-example.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {solveSyringe,scanSyringe} from '../js/blocks/syringe-operations.js';
import {planPlacedSyringe} from '../js/blocks/syringe-installation.js';
import {attachmentPoint,syringeIssues} from '../js/core/syringe.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
const near=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6,JSON.stringify({a,b}));
const bar={type:'bar',p1:{id:'a',x:10,y:20},p2:{id:'b',x:10,y:120},lenParam:'L'};
near(syringePositionOnFrame(bar,{L:100},null,{x:60,y:70}),{x:10,y:70});
near(syringePositionOnFrame(bar,{L:100},null,{x:60,y:170}),{x:10,y:120});
const disk={...bar,shape:'disk',diameterMm:200};
near(syringePositionOnFrame(disk,{L:100},null,{x:60,y:70}),{x:60,y:70});
near(syringePositionOnFrame(disk,{L:100},null,{x:210,y:20}),{x:110,y:20});
near(syringePositionOnFrame(disk,{L:100},{a:{x:-10,y:-20},b:{x:-10,y:80}},{x:-10,y:-20}),{x:-10,y:-20});
assert.equal(syringePositionOnFrame(null,{},null,{x:0,y:0}),null);
for(const input of [diskTurntableSnapshot,pivotTurntableSnapshot]){
 const source=normalizeSnapshot(input),before=JSON.stringify(source),c=source.comps.find(c=>c.type==='syringe');
 const points=solveSyringe(source.comps,source.params).points,original=attachmentPoint(c.a,source.comps,source.params,points);
 const p={x:original.x,y:original.y+8};
 const request={id:c.id,frameId:c.a.componentId,position:p,b:c.b,mountMode:c.mountMode,pivotEar:c.pivotEar,axisDeg:c.axisDeg??0,extension:c.extension,barrelOffsetMm:40.5};
 const moved=planPlacedSyringe(source,request,points);
 assert.ok(moved.ok,moved.message);near(attachmentPoint(moved.syringe.a,moved.comps,moved.params,moved.points),p);
 assert.ok(scanSyringe(moved.comps,moved.params,c.id).ok,'off-axis clamp supports the complete demonstration stroke');
 const outside={...moved.syringe,a:{...moved.syringe.a,u:1000}};
 assert.ok(syringeIssues(outside,moved.comps,moved.params).some(m=>m.includes('超出圓盤')));
 const catalog=buildPartGeometryCatalog({comps:moved.comps,params:moved.params});
 const holes=catalog.parts[c.a.componentId].holes.filter(h=>h.layer=== (c.mountMode==='pivot'?'SYRINGE_PIVOT':'SYRINGE_CLAMP'));
 assert.equal(holes.length,c.mountMode==='pivot'?1:2,'paired/single-ear holes remain available after relocation');
 if(c.mountMode==='fixed-axis'){
  const colliding=planPlacedSyringe(source,{...request,position:{x:original.x,y:original.y+10}},points);
  const rejected=buildPartGeometryCatalog({comps:colliding.comps,params:colliding.params});
  assert.ok(!rejected.parts[c.a.componentId]&&rejected.diagnostics.some(d=>JSON.stringify(d).includes('配對孔與既有孔重疊')),'24 mm pitch at +10 mm overlaps the old pivot hole and cannot emit a valid support plate');
 }
 assert.deepEqual(moved.syringe.b,c.b,'moving the clamp preserves its output attachment');
 const slid=planPlacedSyringe(source,{...request,barrelOffsetMm:45.5},points);
 assert.ok(slid.ok,slid.message);assert.deepEqual(slid.syringe.a,moved.syringe.a);assert.deepEqual(slid.syringe.b,moved.syringe.b);
 assert.deepEqual(slid.points,moved.points,'sliding the barrel does not move either attachment or the mechanism');
 const reopened=normalizeSnapshot({kind:'blocks',v:1,comps:slid.comps,params:slid.params});
 assert.deepEqual(reopened.comps.find(o=>o.id===c.id).a,slid.syringe.a);
 assert.equal(reopened.comps.find(o=>o.id===c.id).installation.barrelOffsetMm,45.5);
 assert.equal(JSON.stringify(source),before,'placement and cancel drafts do not mutate the source');
}
console.log('clamp position: disk plane, bar limits, solved coordinates, fixed/pivot relocation, independent barrel slide and persistence passed');
