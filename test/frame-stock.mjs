import assert from 'node:assert/strict';
import { bracketFixture } from './fixtures/face-bracket-fixture.mjs';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { frameConnectorNodes } from '../js/blocks/model.js';
import { inspectFrameExport, frameOutlineEdges, exportFrameAsSvg, exportFrameAsDxf } from '../js/blocks/exporters.js';
import { buildMountSurfaces } from '../js/blocks/mount-surfaces.js';
import { sizeFrameOutline, normalizeFrameStock } from '../js/blocks/frame-stock.js';
import { buildSceneModel } from '../js/blocks3d/scene-model.js';
import { buildPlan } from '../js/blocks/build-plan.js';
const f=bracketFixture(), comps=f.comps.filter(c=>c.moduleId==='Child');
const original=inspectFrameExport(frameConnectorNodes(comps),{});
// Automatic and explicit sizes both have exactly four long, perpendicular sides.
function rectangleSides(geometry) {
  const ring=geometry.outlines[0];
  const sides=ring.map((p,i)=>({x:ring[(i+1)%ring.length].x-p.x,y:ring[(i+1)%ring.length].y-p.y})).filter(d=>Math.hypot(d.x,d.y)>5);
  assert.equal(sides.length,4);
  for(let i=0;i<4;i++) assert.ok(Math.abs(sides[i].x*sides[(i+1)%4].x+sides[i].y*sides[(i+1)%4].y)<1e-5);
}
rectangleSides(original);
const edges = frameOutlineEdges(frameConnectorNodes(comps), {});
assert.deepEqual(Object.keys(edges).map(Number), [6,13,20,27], 'retain saved straight edge indices; arcs unavailable');
for (const e of edges.filter(Boolean)) {
  const ring = original.outlines[0];
  const i = ring.findIndex(p => p.x === e.a.x && p.y === e.a.y);
  assert.deepEqual(e.b, ring[(i + 1) % ring.length], 'straight span follows the material boundary');
  assert.ok(e.lengthMm > 5);
}
for(const c of comps) c.p1.frameStock={lengthMm:180,widthMm:120,thicknessMm:6};
const saved=normalizeSnapshot(JSON.parse(JSON.stringify(f)));
const nodes=frameConnectorNodes(saved.comps.filter(c=>c.moduleId==='Child'));
const g=inspectFrameExport(nodes,{});
rectangleSides(g);
assert.deepEqual(g.holes,original.holes);
assert.equal(g.dimensions.lengthMm,180);assert.equal(g.dimensions.widthMm,120);assert.equal(g.thicknessMm,6);
assert.equal(buildSceneModel([],Object.fromEntries(nodes.map(p=>[p.id,p])),{frameGeometry:g}).frame.thickness,6);
const root=bracketFixture();root.comps[0].p1.frameStock={lengthMm:200,widthMm:100,thicknessMm:6};
assert.equal(buildPlan(root).parts.find(p=>p.kind==='frame').thicknessMm,6);
assert.equal(buildMountSurfaces({...saved,moduleId:'Child'}).surfaces[0].box.max.z,3);
assert.equal(frameConnectorNodes(saved.comps.filter(c=>c.moduleId==='Host')).some(p=>p.frameStock),false);
const small=nodes.map(n=>({...n,frameStock:{lengthMm:2,widthMm:2}}));
const safe=inspectFrameExport(small,{});
assert.equal(safe.dimensions.lengthMm,safe.dimensions.minLength);
assert.equal(safe.dimensions.widthMm,safe.dimensions.minWidth);
assert.deepEqual(safe.holes,original.holes);
assert.equal(normalizeFrameStock({lengthMm:NaN,widthMm:-1}),undefined);
const diagonal=nodes.map(p=>({...p,x:(p.x-p.y)/Math.sqrt(2),y:(p.x+p.y)/Math.sqrt(2)}));
const rotated=sizeFrameOutline(original.outlines.map(r=>r.map(p=>({x:(p.x-p.y)/Math.sqrt(2),y:(p.x+p.y)/Math.sqrt(2)}))),diagonal);
assert.equal(rotated.dimensions.lengthMm,180);
assert.equal(rotated.straightEdges.filter(Boolean).length,4);
assert.ok(rotated.straightEdges.every(e=>Math.abs(e.d.x*e.m.x+e.d.y*e.m.y)<1e-10));
const blobs=[];globalThis.document={createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
globalThis.URL.createObjectURL=b=>{blobs.push(b);return 'blob:test';};globalThis.URL.revokeObjectURL=()=>{};
exportFrameAsSvg(nodes,{});exportFrameAsDxf(nodes,{});
const text=await Promise.all(blobs.map(b=>b.text()));assert.equal(text.length,2);assert.ok(text.every(t=>t.length>100));
console.log('frame-stock: independent dimensions, fixed holes, rotation, minimum envelope, saved thickness and SVG/DXF passed');
