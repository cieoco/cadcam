import {createPlateGeometry} from '../js/blocks/plate-geometry.js';
import assert from 'node:assert/strict';
import {fixedLiftSnapshot,fixedGripSnapshot} from '../js/blocks/fixed-syringe-examples.js';
import {solveSyringe,scanSyringe,planSyringeStroke} from '../js/blocks/syringe-operations.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {syringeShapes} from '../js/blocks/syringe-shape.js';
import {syringeManufacturing} from '../js/blocks/syringe-manufacturing.js';
for(const original of [fixedLiftSnapshot,fixedGripSnapshot]){
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

const grip=structuredClone(fixedGripSnapshot),tip=grip.comps.find(c=>c.type==='syringe');
const initial=solveSyringe(grip.comps,grip.params);tip.passiveTips[0].angleDeg=40;
const adjusted=solveSyringe(grip.comps,grip.params);assert.deepEqual(adjusted.points,initial.points);
assert.notDeepEqual(syringeShapes(grip.comps,grip.params,adjusted.points)[0].tips,syringeShapes(fixedGripSnapshot.comps,grip.params,initial.points)[0].tips);
for(const length of [145.892,172.422]){
 const p={...s.params,H2Arm:length,H2Tail:250-length};
 for(const sample of scanSyringe(s.comps,p,'H2Syringe').samples)assert.ok(Math.abs(Math.hypot(sample.end.x-134.1527,sample.end.y-209.5479)-250)<.001);
}

for(const comp of normalizeSnapshot(fixedGripSnapshot).comps.filter(c=>c.type==='triangle')){
 const geometry=createPlateGeometry(comp,[comp.p1,comp.p2,comp.p3]);
 for(const q of geometry.outlines.flat())assert.ok(Math.hypot(q.x-comp.p1.x,q.y-comp.p1.y)<70,'collinear plate outline must not overshoot');
}
console.log('PASS fixed syringe: constant reach, passive angle isolation and bounded plate outline');

const lost=s.comps.filter(c=>c.id!=='H2Coupler');assert.equal(solveSyringe(lost,s.params).ok,false);
const arm=s.comps.find(c=>c.id==='H2Arm'),rod=s.comps.find(c=>c.id==='H2Coupler');
const tangent={...s.params,H2Coupler:Math.abs(Math.hypot(arm.p1.x-rod.p1.x,arm.p1.y-rod.p1.y)-s.params.H2Arm)};
assert.equal(solveSyringe(s.comps,tangent).ok,false,'dead point must reject');
