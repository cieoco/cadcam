import {hydraulicSnapshot} from '../js/blocks/hydraulic-example.js';
import {createPlateGeometry,plateVertexWorldPoints} from '../js/blocks/plate-geometry.js';
import assert from 'node:assert/strict';
import {fixedLiftSnapshot,fixedGripSnapshot} from '../js/blocks/fixed-syringe-examples.js';
import {solveSyringe,scanSyringe,planSyringeStroke} from '../js/blocks/syringe-operations.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {syringeShapes,syringeClampShape} from '../js/blocks/syringe-shape.js';
import {syringeManufacturing} from '../js/blocks/syringe-manufacturing.js';
for(const original of [hydraulicSnapshot,fixedLiftSnapshot,fixedGripSnapshot]){
 const before=JSON.stringify(original),n=normalizeSnapshot(original),c=n.comps.find(c=>c.type==='syringe');
 const r=scanSyringe(n.comps,n.params,c.id);assert.equal(r.ok,true,r.message);assert.equal(r.samples.length,41);
 for(const sample of r.samples){const a=c.axisDeg*Math.PI/180;assert.ok(Math.abs(sample.b.x-sample.a.x-Math.cos(a)*(c.spec.lmin+sample.extension))<.001);assert.ok(Math.abs(sample.b.y-sample.a.y-Math.sin(a)*(c.spec.lmin+sample.extension))<.001);}
 let prior=solveSyringe(n.comps,n.params).points;
 for(let x=20;x>=0;x-=.5){const r=planSyringeStroke(n.comps,n.params,c.id,x,prior);assert.equal(r.ok,true,r.message);prior=r.points;}
 const round=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(n.comps,{params:n.params},n.counter))));assert.equal(round.comps.find(o=>o.type==='syringe').mountMode,'fixed-axis');assert.equal(scanSyringe(round.comps,round.params,c.id).ok,true);
 const shapes=syringeShapes(n.comps,n.params,prior);assert.equal(shapes[0].end-shapes[0].start,72);assert.equal(shapes[0].tips.length,c.passiveTips?.length||0);
 assert.equal(planSyringeStroke(n.comps,n.params,c.id,21,prior).ok,false);
 const bad=structuredClone(n.comps);bad.find(o=>o.id===c.a.componentId).p2.type='floating';assert.equal(solveSyringe(bad,n.params).ok,false);
 const axis=structuredClone(n.comps);axis.find(o=>o.id===c.id).axisDeg=NaN;assert.equal(solveSyringe(axis,n.params).ok,false);
 assert.throws(()=>syringeManufacturing(n.comps,n.params,null),/本輪不輸出/);
 assert.equal(JSON.stringify(original),before);
}
const s=fixedLiftSnapshot;
assert.equal(scanSyringe(s.comps,{...s.params,H2Arm:145.892,H2Tail:250-145.892},'H2Syringe').ok,true);
assert.equal(scanSyringe(s.comps,{...s.params,H2Arm:198.958,H2Tail:250-198.958},'H2Syringe').ok,false);
console.log('PASS fixed syringe: axis, bidirectional stroke, JSON/share, passive-tip metadata, invalid mounting and machining guard');

const grip=normalizeSnapshot(fixedGripSnapshot),gripper=grip.comps.find(c=>c.type==='syringe');
assert.equal(gripper.passiveTips,undefined);assert.deepEqual(gripper.jawIds,['H3JawA','H3JawB']);
const old=structuredClone(fixedGripSnapshot),oldS=old.comps.find(c=>c.type==='syringe');
oldS.passiveTips=[{hostId:'H3JawA',length:40,angleDeg:-70},{hostId:'H3JawB',length:40,angleDeg:70}];delete oldS.jawIds;
for(const a of old.comps.filter(c=>c.type==='triangle'))a.vertices=a.vertices.filter(v=>v.solve);
const oldJson=JSON.stringify(old),converted=normalizeSnapshot(old);
assert.equal(JSON.stringify(old),oldJson,'migration cannot mutate input');
assert.deepEqual(converted.comps,grip.comps);
assert.deepEqual(normalizeSnapshot(toSnapshot(converted.comps,{params:converted.params},30)).comps,grip.comps);
const refs=new Map();
for(let extension=0;extension<=20;extension+=.5){
 const r=planSyringeStroke(grip.comps,grip.params,gripper.id,extension);assert.ok(r.ok,r.message);
 for(const a of grip.comps.filter(c=>c.type==='triangle')){
  const pts=plateVertexWorldPoints(a,[a.p1,a.p2,a.p3].map(p=>r.points[p.id]));
  assert.equal(pts.length,4);
  const distances=pts.slice(0,-1).map(p=>Math.hypot(p.x-pts.at(-1).x,p.y-pts.at(-1).y));
  if(!refs.has(a.id))refs.set(a.id,distances);
  distances.forEach((d,i)=>assert.ok(Math.abs(d-refs.get(a.id)[i])<.001,'integral tip must stay rigid'));
  assert.equal(createPlateGeometry(a,[a.p1,a.p2,a.p3].map(p=>r.points[p.id])).outlines.length,1);
 }
}
for(const length of [145.892,172.422]){
 const p={...s.params,H2Arm:length,H2Tail:250-length};
 for(const sample of scanSyringe(s.comps,p,'H2Syringe').samples)assert.ok(Math.abs(Math.hypot(sample.end.x-134.1527,sample.end.y-209.5479)-250)<.001);
}

for(const comp of normalizeSnapshot(fixedGripSnapshot).comps.filter(c=>c.type==='triangle')){
 const geometry=createPlateGeometry(comp,[comp.p1,comp.p2,comp.p3]);
 for(const q of geometry.outlines.flat())assert.ok(Math.hypot(q.x-comp.p1.x,q.y-comp.p1.y)<110,'collinear plate outline must not overshoot');
}
console.log('PASS fixed syringe: constant reach, rigid tip and legacy migration and bounded plate outline');

const lost=s.comps.filter(c=>c.id!=='H2Coupler');assert.equal(solveSyringe(lost,s.params).ok,false);
const arm=s.comps.find(c=>c.id==='H2Arm'),rod=s.comps.find(c=>c.id==='H2Coupler');
const tangent={...s.params,H2Coupler:Math.abs(Math.hypot(arm.p1.x-rod.p1.x,arm.p1.y-rod.p1.y)-s.params.H2Arm)};
assert.equal(solveSyringe(s.comps,tangent).ok,false,'dead point must reject');

// Fusion reference: width 12, span 40, height 17.5, volume 1066.2693 mm³.
// Teacher correction centers both holes in the ears; moving holes preserves volume.
const clamp=syringeClampShape();
assert.equal(clamp.spacing,28);
assert.equal(clamp.holeRadius*2,3.5);
assert.equal(clamp.width,12);assert.equal(clamp.thickness,1.5);
assert.equal(clamp.extent*2,40);assert.equal(clamp.innerRadius,9.25);
assert.equal(Math.max(...clamp.profile.map(p=>p.z))-clamp.baseZ,17.5);
assert.equal(Math.min(...clamp.profile.map(p=>p.z)),clamp.baseZ);
for(const foot of clamp.feet){
 assert.equal(foot.outline[0].x,-clamp.width/2);
 assert.equal(Math.abs(foot.outline[0].y),clamp.innerRadius,'foot overlaps strap thickness');
 assert.ok(Math.abs(foot.hole.y)-foot.hole.r>clamp.innerRadius+clamp.thickness,'hole clears wall');
 assert.ok(foot.outline.every(p=>Math.abs(p.y)<=clamp.extent));
}
assert.deepEqual(clamp.feet[0].outline.map(p=>({x:p.x,y:-p.y})),clamp.feet[1].outline);
assert.equal(clamp.feet[1].hole.y,14);assert.equal(clamp.feet[0].hole.y,-14);
const area=pts=>Math.abs(pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
const volume=area(clamp.profile.map(p=>({x:p.y,y:p.z})))*clamp.width
 +clamp.feet.reduce((sum,f)=>sum+(area(f.outline)-Math.PI*f.hole.r**2)*clamp.thickness,0)
 -2*clamp.width*clamp.thickness**2; // subtract overlapping wall/foot material
assert.ok(Math.abs(volume-1066.2692984351563)<.6,`saddle volume ${volume} must match Fusion within tessellation tolerance`);
console.log('PASS saddle clamp: Fusion dimensions, symmetric holes, joined walls and reference volume');

for(const arm of [60,80,100]){
 const h=hydraulicSnapshot,p={...h.params,H1Arm:arm},scan=scanSyringe(h.comps,p,'H1Syringe');
 assert.ok(scan.ok,scan.message);assert.equal(scan.samples.length,41);
 for(const sample of scan.samples){
  assert.ok(Math.abs(sample.b.y+60)<.001,'fixed H01 plunger stays horizontal');
  assert.ok(Math.abs(Math.hypot(sample.end.x,sample.end.y)-arm)<.001,'rocker retains chosen length');
  assert.ok(Math.abs(Math.hypot(sample.b.x-sample.end.x,sample.b.y-sample.end.y)-80)<.001,'pinned coupler retains length');
 }
 assert.ok(scan.samples.at(-1).angle>scan.samples[0].angle,'extension raises the arm');
}
assert.equal(scanSyringe(hydraulicSnapshot.comps,{...hydraulicSnapshot.params,H1Arm:200},'H1Syringe').ok,false);
console.log('PASS fixed H01: three arm comparisons, straight plunger, rigid coupler and unreachable arm');
