import assert from 'node:assert/strict';
import {pivotTurntableSnapshot,diskTurntableSnapshot} from '../js/blocks/disk-turntable-example.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {solveSyringe,scanSyringe,planSyringeStroke} from '../js/blocks/syringe-operations.js';
import {planSyringeInstallation} from '../js/blocks/syringe-installation.js';
import {syringeShape,syringeClampFrameNodes} from '../js/blocks/syringe-shape.js';
import {buildSyringeInstallPreview} from '../js/blocks/syringe-install-preview.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {syringeClampInstallation} from '../js/blocks3d/syringe-scene.js';
import {syringeManufacturing} from '../js/blocks/syringe-manufacturing.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {hydraulicSnapshot as legacy} from './fixtures/hinged-syringe.mjs';
const s=normalizeSnapshot(pivotTurntableSnapshot),before=JSON.stringify(s),c=s.comps.find(c=>c.type==='syringe');
const solved=solveSyringe(s.comps,s.params);assert.ok(solved.ok,solved.message);
const scan=scanSyringe(s.comps,s.params,c.id);assert.ok(scan.ok,scan.message);assert.equal(scan.samples.length,41);
const angles=[],holes=[];let previous=solved.points;
for(const extension of [0,5,10,15,20,15,10,5,0]){
 const r=planSyringeStroke(s.comps,s.params,c.id,extension,previous);assert.ok(r.ok,r.message);previous=r.points;
 const shape=syringeShape(r.comps.find(o=>o.id===c.id),r.comps,s.params,r.points);angles.push(shape.angle);
 assert.equal(shape.fixed,false);assert.equal(shape.pivot,true);assert.equal(shape.clamp.feet.length,2,'same two-ear clamp as the fixed mount');assert.equal(shape.lockedFoot,1);
 assert.ok(Math.abs(shape.length-c.spec.lmin-extension)<.001);
 const scene=buildSyringeInstallPreview({...s,comps:r.comps}),item=scene.model.syringes[0];
 assert.equal(item.mount.status,'unverified');assert.equal(item.mount.reason,'clamp_fastener_clearance');assert.equal(item.mount.fasteners.length,0);assert.equal(item.mount.candidateFasteners.length,1);
 assert.ok(Math.abs(item.alignmentMm)<.001,'H08 rod and disk hole are on the same centre plane');
 const part=scene.model.materialParts.find(p=>p.partId===item.mount.candidateFasteners[0].framePartId);
 const lockedId=`${c.id}_clamp_${shape.lockedFoot}`,hole=part.geometry.holes.find(h=>h.id===lockedId||h.mountIds?.includes(lockedId));holes.push(hole);
 assert.ok(part.geometry.holes.filter(h=>Math.hypot(h.x-hole.x,h.y-hole.y)<.001).length===1,'no duplicate cut at pivot');
 if(extension===10){hole.r=1;assert.equal(syringeClampInstallation(scene.model,item,item.z,item.matrix).reason,'mount_hole_diameter');}
}
const plate=structuredClone(s),host=plate.comps.find(o=>o.id===c.a.componentId);
host.type='triangle';delete host.shape;delete host.diameterMm;
host.p3={id:'PlateCorner',x:0,y:-160,type:'fixed'};host.gParam=host.lenParam;delete host.lenParam;
host.r1Param='PlateSide1';host.r2Param='PlateSide2';plate.params.PlateSide1=160;plate.params.PlateSide2=Math.hypot(host.p3.x-host.p2.x,host.p3.y-host.p2.y);
assert.equal(buildSyringeInstallPreview(plate).model.syringes[0].mount.reason,'clamp_fastener_clearance','fixed triangular plate shares pivot mapping, with explicit hardware interference');
assert.ok(Math.max(...angles)-Math.min(...angles)>.01,'barrel angle follows the moving output');
assert.ok(holes.every(h=>h.x===holes[0].x&&h.y===holes[0].y),'base hole stays fixed during motion');
const request={id:c.id,a:c.a,b:c.b,mountMode:'pivot',face:'front',spacerMm:null};
const adjusted=planSyringeInstallation(s,{...request,barrelOffsetMm:40},solved.points);assert.ok(adjusted.ok,adjusted.message);
assert.deepEqual(adjusted.points,solved.points,'clamp position along barrel changes appearance, not installation length');
assert.equal(syringeShape(adjusted.syringe,adjusted.comps,s.params,adjusted.points).start,-40);
assert.equal(planSyringeInstallation(s,{...request,barrelOffsetMm:71},solved.points).ok,false);
const round=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(adjusted.comps,{params:s.params},s.counter))));
assert.equal(round.comps.find(o=>o.id===c.id).mountMode,'pivot');assert.equal(round.comps.find(o=>o.id===c.id).installation.barrelOffsetMm,40);
assert.ok(scanSyringe(round.comps,round.params,c.id).ok);
const fresh={...s,comps:s.comps.filter(o=>o.id!==c.id)};
assert.ok(planSyringeInstallation(fresh,{...request,id:null,newId:'StudentPivot'},solved.points).ok,'new installation');
const fixed=normalizeSnapshot(diskTurntableSnapshot),f=fixed.comps.find(o=>o.type==='syringe');
const invalid=planSyringeInstallation(fixed,{id:f.id,a:f.a,b:f.b,mountMode:'pivot'});
assert.equal(invalid.ok,false);assert.match(invalid.message,/自由度/);
assert.equal(planSyringeInstallation(s,{...request,mountMode:'fixed-axis'}).ok,false,'direct-drive arm is not a fixed-axis coupler');
for(const disk of [true,false]){
 const copy=structuredClone(s),host=copy.comps.find(o=>o.id===c.a.componentId);if(!disk){delete host.shape;delete host.diameterMm;delete host.frameSeparate;}
 const nodes=syringeClampFrameNodes(copy.comps,[host.p1,host.p2]);assert.equal(nodes.length,1);
 const scene=buildSyringeInstallPreview(copy);assert.equal(scene.model.syringes[0].mount.reason,'clamp_fastener_clearance','disk and automatic bar frame retain the common hardware diagnostic');
}
assert.ok(syringeManufacturing(s.comps,s.params,null).parts.length,'verified boards export; clamp hardware remains outside DXF');
assert.ok(scanSyringe(normalizeSnapshot(legacy).comps,legacy.params,'HSyringe').ok,'legacy two-hinge files unchanged');
assert.equal(JSON.stringify(s),before,'preview never mutates source');
console.log(`Syringe mounts: pivot motion, fixed hole, one fastener, no duplicate cuts, barrel offset, guards, new installation, save/share and legacy compatibility passed (${((Math.max(...angles)-Math.min(...angles))*180/Math.PI).toFixed(2)}° barrel swing)`);
