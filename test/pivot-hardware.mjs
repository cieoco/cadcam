import assert from 'node:assert/strict';
import {pivotHardwarePlan,withPivotHardware,pivotPlan} from '../js/blocks3d/pivot-hardware.js';
import {IDENTITY_4} from '../js/blocks3d/orthogonal-3d.js';
import {hardwareList} from '../js/blocks/build-plan.js';
assert.deepEqual(hardwareList({}),[]);
const make=(id,z,t=3,r=1.6)=>({partId:id,moduleId:'test',geometry:{kind:'bar',thicknessMm:t,outlines:[[{x:-10,y:-10},{x:10,y:-10},{x:10,y:10},{x:-10,y:10}]],holes:[{x:0,y:0,r}],cutouts:[]},pose:{matrix:IDENTITY_4.map((x,i)=>i===14?z:x)}});
const model={pins:[{id:'J',x:0,y:0,z0:-1.5,z1:19.5}],materialParts:[make('a',0),make('b',15)],holeDisplaySource:{comps:[{id:'a',type:'bar',p1:{id:'J'}},{id:'b',type:'bar',p1:{id:'J'}}]}};
const original=JSON.stringify(model),p=pivotHardwarePlan(model);assert.equal(JSON.stringify(model),original);assert.equal(p.joints.length,1);assert.equal(p.joints[0].spanMm,18);assert.equal(p.joints[0].spacers[0].mm,12);assert.equal(p.joints[0].screwLengthMm,30);assert.equal(p.joints[0].axialClearanceMm,.2);assert.deepEqual(p.diagnostics,[]);
const decorated=withPivotHardware(model);assert.equal(decorated.pins.length,0);assert.equal(decorated.materialParts.length,9);assert.equal(withPivotHardware(decorated),decorated);
const bom=hardwareList(pivotPlan({parts:[],joints:[{id:'J',plane:null,kind:'pivot',spanMm:6,holeDiameterMm:3.2}],motors:[]},decorated));assert.equal(bom.find(r=>r.spec==='M3×30').qty,1);assert.equal(bom.filter(r=>r.spec==='M3×10').length,0,'replace stale nominal-layer BOM');assert.equal(bom.find(r=>r.spec==='M3 平墊片 Ø6×0.5').qty,2);
const thick=structuredClone(model);thick.materialParts[1].geometry.thicknessMm=5;assert.equal(pivotHardwarePlan(thick).joints[0].spanMm,20,'local stock changes its own axis');
const bad=structuredClone(model);bad.materialParts[1].geometry.holes[0].r=1;assert.equal(pivotHardwarePlan(bad).joints.length,0);assert.equal(pivotHardwarePlan(bad).diagnostics[0].reason,'pivot_hole_or_axis_not_supported');
const blocked=structuredClone(model);blocked.materialParts.push(make('obstruction',21.7));assert.equal(pivotHardwarePlan(blocked).joints[0].nutsLow,true,'nuts face the open side');
const incidental=structuredClone(model);incidental.materialParts.push(make('nearby',8));incidental.holeDisplaySource.comps.push({id:'nearby',type:'bar',p1:{id:'unrelated'}});assert.equal(pivotHardwarePlan(incidental).joints[0].stack.length,2,'coincident unconnected holes must never create a new coupling');
console.log('pivot hardware: real faces, gap, local thickness, retention clearance, BOM replacement, source isolation and idempotence passed');

const legacy=withPivotHardware(bad);assert.ok(legacy.geometryDiagnostics.some(d=>d.code==='material_representation_not_supported'&&d.kind==='pins'&&d.reason==='pivot_hole_or_axis_not_supported'),'unsupported legacy pin sizes remain explicit unknown hardware, without newly blocking board exports');
