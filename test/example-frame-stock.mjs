import assert from 'node:assert/strict';
import {getExample,BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {frameConnectorNodes} from '../js/blocks/model.js';
import {inspectFrameExport,splitMountsByHost,exportFrameAsSvg,exportFrameAsDxf} from '../js/blocks/exporters.js';
import {deriveMotorMounts} from '../js/blocks/build-plan.js';
import {buildSceneModel} from '../js/blocks3d/scene-model.js';
import {standardizeExampleFrame} from '../js/blocks/example-frame-stock.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';

const clone=structuredClone,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const ids=BLOCK_EXAMPLES.filter(e=>e.snapshot.comps.some(c=>['p1','p2','p3','m1','m2'].some(k=>c[k]?.frameStock?.grid))).map(e=>e.id);
const reopen=s=>normalizeSnapshot(JSON.parse(JSON.stringify({...s,fabrication:s.fabrication || undefined})));
const geometry=s=>inspectFrameExport(frameConnectorNodes(s.comps),{},splitMountsByHost(s.comps,deriveMotorMounts(s.comps)).free);
const files=[];globalThis.document={createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}};
globalThis.URL.createObjectURL=b=>{files.push(b);return 'blob:test';};globalThis.URL.revokeObjectURL=()=>{};
for(const id of ids){
  const s=normalizeSnapshot(clone(getExample(id).snapshot)),before=clone(s);
  const legacy=clone(s);legacy.comps.forEach(c=>['p1','p2','p3','m1','m2'].forEach(k=>{if(c[k])delete c[k].frameStock;}));
  const originalTopology=compileTopology(legacy.comps,{params:legacy.params},new Set());
  standardizeExampleFrame(legacy);
  assert.deepEqual(legacy.comps,s.comps,'authoring is stable across normalization');
  const topology=compileTopology(s.comps,{params:s.params},new Set());
  for(const thetaDeg of [-30,0,30])assert.deepEqual(solveTopology(topology,{thetaDeg}),solveTopology(originalTopology,{thetaDeg}),'stock policy preserves sampled kinematics');
  const g=geometry(s),d=g.dimensions;
  for(const key of ['lengthMm','widthMm'])near((d[key]-13)/8,Math.round((d[key]-13)/8));
  assert.equal(g.thicknessMm,3);
  assert.equal(Object.keys(g.straightEdges).length,4);
  for(const e of g.straightEdges.filter(Boolean))assert.ok(Math.min(Math.abs(e.d.x),Math.abs(e.d.y))<1e-6,'initial sides horizontal or vertical');
  assert.deepEqual(reopen(s).comps,s.comps);
  const frame=buildSceneModel([],{}, {frameGeometry:g}).frame;
  assert.deepEqual(frame.outlines,g.outlines);assert.equal(frame.thickness,3);
  // Rotation, translation, reordering and ID prefixing must preserve the stock policy.
  const a=1.13,c=Math.cos(a),sn=Math.sin(a);
  const moved=frameConnectorNodes(s.comps).reverse().map(p=>({...p,id:'Copy-'+p.id,x:200+c*p.x-sn*p.y,y:-50+sn*p.x+c*p.y,...(p.axleSlot?{axleSlot:{...p.axleSlot,dir:{x:c*p.axleSlot.dir.x-sn*p.axleSlot.dir.y,y:sn*p.axleSlot.dir.x+c*p.axleSlot.dir.y}}}:{})}));
  // Mount settings are world-oriented: isolate the stock outline for this covariance check.
  const g0=inspectFrameExport(frameConnectorNodes(s.comps),{}),gm=inspectFrameExport(moved,{});
  near(g0.dimensions.lengthMm,gm.dimensions.lengthMm);near(g0.dimensions.widthMm,gm.dimensions.widthMm);
  if(new Set(moved.map(p=>`${p.x},${p.y}`)).size>1)
    for(let i=0;i<g0.outlines[0].length;i++){const p=g0.outlines[0][i],q=gm.outlines[0][i];near(q.x,200+c*p.x-sn*p.y);near(q.y,-50+sn*p.x+c*p.y);}
  const expanded=clone(s);expanded.comps.forEach(comp=>['p1','p2','p3','m1','m2'].forEach(k=>{if(comp[k]?.frameStock)Object.assign(comp[k].frameStock,{lengthMm:d.lengthMm+16.3,widthMm:d.widthMm+8.2});}));
  const bigger=geometry(expanded);near(bigger.dimensions.lengthMm,d.lengthMm+16.3);near(bigger.dimensions.widthMm,d.widthMm+8.2);
  assert.deepEqual(bigger.holes,g.holes,'outer size never moves mechanism holes');
  const restored=reopen(expanded);assert.deepEqual(geometry(restored),bigger);
  const aligned=clone(s);aligned.comps.forEach(comp=>['p1','p2','p3','m1','m2'].forEach(k=>{if(comp[k]?.frameStock)Object.assign(comp[k].frameStock,{lengthMm:d.lengthMm+8,widthMm:d.widthMm+8});}));
  const resized=geometry(reopen(aligned));
  for(const dir of Object.values(d.axis)){
    const low=Math.min(...resized.outlines.flat().map(p=>p.x*dir.x+p.y*dir.y));
    for(const p of frameConnectorNodes(s.comps).filter(p=>!String(p.holeLayer||'').startsWith('SYRINGE')))near((p.x*dir.x+p.y*dir.y-low-6.5)/8,Math.round((p.x*dir.x+p.y*dir.y-low-6.5)/8));
  }
  assert.deepEqual(s,before,'render and export do not alter the snapshot');
  exportFrameAsSvg(frameConnectorNodes(s.comps),{});exportFrameAsDxf(frameConnectorNodes(s.comps),{});
  console.log(`${id}: ${d.lengthMm} × ${d.widthMm} × 3 mm`);
}
const thick={comps:[0,16].map((x,i)=>({type:'anchor',id:`A${i}`,p1:{id:`P${i}`,type:'fixed',x,y:0}}))};
standardizeExampleFrame(thick);thick.comps.forEach(c=>c.p1.frameStock.thicknessMm=6);
const tg=inspectFrameExport(frameConnectorNodes(thick.comps),{});near(tg.dimensions.lengthMm,26);near(tg.dimensions.widthMm,10);
// Added holes may grow the stock, but neither side may slip by half a grid cell.
const extra=[...frameConnectorNodes(thick.comps),{id:'Extra',x:-16,y:8,frameHole:true}];
const eg=inspectFrameExport(extra,{});near(Math.min(...eg.outlines.flat().map(p=>p.x)),-21);
assert.equal(ids.length,19); // Ten reviewed implicit frames are now explicit standard boards.
assert.equal(files.length,ids.length*2);assert.ok((await Promise.all(files.map(f=>f.text()))).every(t=>t.length>100&&!/NaN|Infinity/.test(t)));
console.log('example-frame-stock: standard outer dimensions, exact edits, holes, shared 3D/export, save and rigid-copy covariance passed');
