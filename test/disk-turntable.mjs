import assert from 'node:assert/strict';
import {diskTurntableSnapshot as source} from '../js/blocks/disk-turntable-example.js';
import {fixedBaseSnapshot} from '../js/blocks/fixed-syringe-examples.js';
import {BLOCK_EXAMPLES,loadUnitStarts,getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {scanSyringe,planSyringeStroke} from '../js/blocks/syringe-operations.js';
import {attachmentPoint} from '../js/core/syringe.js';
import {syringeManufacturing} from '../js/blocks/syringe-manufacturing.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';

const before=JSON.stringify(source),s=normalizeSnapshot(source);
const frame=s.comps.find(c=>c.id==='H7Frame'),turn=s.comps.find(c=>c.id==='H7Turn'),rod=s.comps.find(c=>c.id==='H7Coupler'),syr=s.comps.find(c=>c.type==='syringe');
assert.equal(frame.shape,'disk');assert.equal(turn.shape,'disk');assert.equal(frame.p1.id,turn.p1.id);
assert.equal(frame.p2.type,'fixed');assert.equal(turn.p2.type,'floating');
assert.equal(rod.p2.id,turn.p2.id);assert.equal(syr.outputId,turn.id);
assert.ok(!s.comps.some(c=>c.isInput||c.motorType),'no motor drives the turntable');
const a=attachmentPoint(syr.a,s.comps,s.params);assert.ok(Math.hypot(a.x-frame.p2.x,a.y-frame.p2.y)<1e-8);
const scan=scanSyringe(s.comps,s.params,syr.id);assert.ok(scan.ok,scan.message);assert.equal(scan.samples.length,41);
const span=Math.abs(scan.samples.at(-1).angle-scan.samples[0].angle);assert.ok(span>83&&span<85);
let previous=null;
for(const extension of [...Array.from({length:41},(_,i)=>i/2),...Array.from({length:41},(_,i)=>20-i/2)]){
 const r=planSyringeStroke(s.comps,s.params,syr.id,extension,previous);assert.ok(r.ok,r.message);previous=r.points;
 assert.ok(Math.hypot(previous[turn.p1.id].x,previous[turn.p1.id].y)<1e-6);
 assert.ok(Math.abs(Math.hypot(previous[turn.p2.id].x,previous[turn.p2.id].y)-15)<1e-6);
 assert.ok(Math.abs(Math.hypot(previous[rod.p1.id].x-previous[rod.p2.id].x,previous[rod.p1.id].y-previous[rod.p2.id].y)-s.params.H7Coupler)<1e-6);
}
assert.ok(!planSyringeStroke(s.comps,s.params,syr.id,21).ok);
const changed=structuredClone(s);changed.comps.find(c=>c.id===turn.id).diameterMm=160;
assert.deepEqual(scanSyringe(changed.comps,changed.params,syr.id).samples,scan.samples,'diameter does not change motion');
const round=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(s.comps,{params:s.params},s.counter))));
assert.ok(scanSyringe(round.comps,round.params,syr.id).ok);assert.equal(round.comps.filter(c=>c.shape==='disk').length,2);
const catalog=buildPartGeometryCatalog({comps:s.comps,params:s.params,fabrication:{cnc:{stockThicknessMm:3}}});
for(const c of [frame,turn]){assert.equal(catalog.parts[c.id].thicknessMm,3);assert.equal(catalog.parts[c.id].outlines[0].length,128);}
const clamp=catalog.parts[frame.id].holes.filter(h=>h.layer==='SYRINGE_CLAMP');
assert.equal(clamp.length,2);assert.equal(clamp[0].id,`${syr.id}_clamp_0`);
assert.ok(Math.abs(Math.hypot(clamp[0].x-clamp[1].x,clamp[0].y-clamp[1].y)-28)<1e-8);
assert.ok(clamp.every(h=>h.r===1.75&&Math.hypot(h.x,h.y)+h.r<frame.diameterMm/2));
assert.ok(!catalog.parts[turn.id].holes.some(h=>h.layer==='SYRINGE_CLAMP'));
assert.deepEqual(syr.installation,{face:'front',spacerMm:null});
const tooSmall=structuredClone(s);tooSmall.comps.find(c=>c.id===frame.id).diameterMm=288;
const bad=buildPartGeometryCatalog({comps:tooSmall.comps,params:tooSmall.params});
assert.ok(bad.diagnostics.some(d=>d.sourceIds.includes(frame.id)&&d.reason?.includes('管夾配對孔')));
assert.throws(()=>syringeManufacturing(s.comps,s.params,null),/本輪不輸出/);
assert.equal(getExample('hydraulic-h07').snapshot.projectName,source.projectName);
assert.equal(fixedBaseSnapshot.comps.find(c=>c.id==='H4Turn').type,'triangle','legacy H04 geometry seed unchanged');
assert.equal(JSON.stringify(source),before);
console.log(`disk turntable: two coaxial plates, fixed clamp, coupled motion 0–20 mm (${span.toFixed(2)}°), reverse stroke, diameter, save/share, material geometry and fabrication guard passed`);

// Public replacement, shared module source and unit 12 must all use the same two disks.
import {builtinTemplate} from '../js/blocks/module-ops.js';
import {hydraulicArmSnapshot} from '../js/blocks/hydraulic-assembly-example.js';
assert.ok(!BLOCK_EXAMPLES.some(e=>e.id==='hydraulic-h04'));
assert.strictEqual(getExample('hydraulic-h04'),getExample('hydraulic-h07'),'old URL resolves to H07');
const template=builtinTemplate('hydraulic-base');
assert.equal(template.comps.filter(c=>c.shape==='disk').length,2);
assert.equal(template.outputs[0].body.id,'H7Turn');assert.equal(template.outputs[0].body.kind,'bar');
assert.equal(hydraulicArmSnapshot.modules.find(m=>m.id==='Base').source,'hydraulic-h07');
assert.ok(!hydraulicArmSnapshot.comps.some(c=>c.id.startsWith('H4')));
for(const sourceComp of source.comps){
 const actual=structuredClone(hydraulicArmSnapshot.comps.find(c=>c.id===sourceComp.id));delete actual.moduleId;
 assert.deepEqual(actual,sourceComp,'H06 uses H07 geometry, clamp and stroke without a second copy of dimensions');
}
await loadUnitStarts();const start=getExample('unit12-start').snapshot;
assert.equal(start.modules.find(m=>m.id==='Lift').mount,null);
assert.equal(start.comps.filter(c=>c.moduleId==='Base'&&c.shape==='disk').length,2);
console.log('H04 hidden/redirected, H07 module and H06/unit12 shared disk base passed');

import {buildMountSurfaces} from '../js/blocks/mount-surfaces.js';
for(const thicknessMm of [3,6]){
 const surfaces=buildMountSurfaces({comps:hydraulicArmSnapshot.comps,modules:hydraulicArmSnapshot.modules,params:hydraulicArmSnapshot.params,moduleId:'Base',thicknessMm}).surfaces;
 const top=surfaces.find(p=>p.compId==='H7Turn');
 assert.equal(top.box.max.z-top.box.min.z,thicknessMm,'mount surface uses global disk stock, not default bar thickness');
}
