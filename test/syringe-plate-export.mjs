import assert from 'node:assert/strict';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {syringeManufacturing,syringeFiles} from '../js/blocks/syringe-manufacturing.js';
import {syringeBoardIssue} from '../js/blocks/syringe-plate-manufacturing.js';
import {buildSyringeInstallPreview} from '../js/blocks/syringe-install-preview.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {buildNestedDxf,readDxf} from '../js/blocks/dxf-nest.js';
const load=id=>normalizeSnapshot(getExample(id).snapshot),near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`);
for(const id of ['hydraulic-h01','hydraulic-h02','hydraulic-h03','hydraulic-h07','hydraulic-h08','hydraulic-h05','hydraulic-h06']){
 const s=load(id),before=structuredClone(s),p=syringeManufacturing(s.comps,s.params,s.fabrication,{modules:s.modules}),scene=buildSyringeInstallPreview(s,{assembly:true});
 assert.ok(p.parts.length);assert.deepEqual(p.excluded,[]);assert.ok(p.parts.every(p=>p.checked&&p.quantity===1));
 for(const part of p.parts){const real=scene.model.materialParts.find(m=>m.partId===part.id);assert.deepEqual(part.geometry,real.geometry);assert.equal(syringeBoardIssue(part.geometry),null);}
 const spacers=p.hardware.filter(h=>h.kind==='spacer');assert.equal(spacers.length,id==='hydraulic-h08'?1:id==='hydraulic-h05'?4:id==='hydraulic-h06'?6:2);
 for(const h of spacers){const shape=scene.model.syringes.find(c=>c.id===h.id),f=(shape.mount.candidateFasteners||shape.mount.fasteners).find(f=>f.holeId===h.holeId);near(h.lengthMm,f.spacerHeight);near(h.innerDiameterMm,3.5);near(h.outerDiameterMm,8);assert.ok(p.parts.some(p=>p.id===h.framePartId));}
 for(const check of p.checks){assert.equal(check.matchedHoleIds.length,check.expectedHoleCount);near(check.alignmentMm,0);if(check.mode==='fixed-axis'){const hs=spacers.filter(h=>h.id===check.syringeId);near(Math.hypot(hs[0].hole.x-hs[1].hole.x,hs[0].hole.y-hs[1].hole.y),24);}}
 const files=syringeFiles(p,'dxf');assert.equal(files.length,p.parts.length);assert.ok(files.every(f=>!/(NaN|Infinity)/.test(f.text)&&!f.name.includes('示範')&&!f.name.includes('隔圈')));
 for(const method of ['laser','cnc']){const nest=buildNestedDxf(files,{method,sheetW:1000,sheetH:1000});assert.equal(nest.parts.length,files.length);assert.ok(!/NaN|Infinity/.test(nest.text));}
 const out=prepareScopedExport({...s,topo:s,exportSettings:s.fabrication?.export},{scope:'assembly'},'dxf');assert.equal(out.files.length,files.length);assert.ok(out.notices.some(w=>w.includes('環壁')));assert.deepEqual(s,before);
}
const h1=load('hydraulic-h01'),p=syringeManufacturing(h1.comps,h1.params,h1.fabrication);assert.deepEqual(p.parts.map(p=>p.id),['frame','H1Arm','H1Coupler']);
const frame=p.parts.find(p=>p.id==='frame'),holes=frame.geometry.holes.filter(h=>h.layer==='SYRINGE_CLAMP');assert.deepEqual(holes.map(h=>[h.x,h.y]),[[-96,-84],[-96,-60]]);assert.ok(p.hardware.filter(h=>h.kind==='spacer').every(h=>h.lengthMm===15.75));
const src={...h1,topo:h1,exportSettings:h1.fabrication?.export};assert.deepEqual(prepareScopedExport(src,{scope:'selected',selectedId:'H1Arm'},'dxf').files.map(f=>f.name),['H1Arm.dxf']);assert.deepEqual(prepareScopedExport(src,{scope:'selected',selectedId:'H1Frame'},'dxf').files.map(f=>f.name),['frame.dxf']);
// An invalid individual board does not suppress the good frame or emit the bad hole.
const bad=structuredClone(h1),c=bad.comps.find(c=>c.id==='H1Arm');c.holes=[...(c.holes||[]),{id:'BadHole',u:1,v:0,diameter:3.2}];
const partial=syringeManufacturing(bad.comps,bad.params,bad.fabrication);assert.ok(partial.excluded.some(p=>p.id==='H1Arm'));assert.ok(!partial.parts.some(p=>p.id==='H1Arm'));assert.ok(partial.parts.some(p=>p.id==='frame'));assert.ok(partial.warnings.some(w=>w.startsWith('未輸出 H1Arm')));
const low=structuredClone(h1);low.comps.find(c=>c.type==='syringe').installation={face:'front',spacerMm:0};const lowPlan=syringeManufacturing(low.comps,low.params,low.fabrication);assert.equal(lowPlan.hardware.filter(h=>h.kind==='spacer').length,0);assert.ok(lowPlan.parts.length);
// Real local holes and IDs survive save/reopen; original reference ring clearance remains honestly unverified.
const reopened=normalizeSnapshot(toSnapshot(h1.comps,{params:h1.params},h1.counter,{fabrication:h1.fabrication}));assert.deepEqual(syringeManufacturing(reopened.comps,reopened.params,reopened.fabrication).parts,p.parts);
assert.ok(readDxf(syringeFiles(p,'dxf').find(f=>f.name==='frame.dxf').text).entities.filter(e=>e.layer==='SYRINGE_CLAMP').length===2);
console.log('Syringe plate export: 7 examples, common scene geometry, 24 mm fixed/one pivot holes, exact spacers, board-only DXF/nesting, scoped selection, partial rejection, invalid height and reopen passed');

// A rod attached inside a board needs a real cutting hole, not only a solver point.
const off=structuredClone(h1),rod=off.comps.find(c=>c.type==='syringe');rod.b.u=26;rod.b.v=0;
const catalog=buildPartGeometryCatalog({...off,fabrication:p.fabrication}),board=catalog.parts[rod.b.componentId];
assert.ok(board,JSON.stringify(catalog.diagnostics));
const rodHole=board.holes.find(h=>h.id===rod.id+'_rod'||h.mountIds?.includes(rod.id+'_rod'));
assert.ok(rodHole);near(rodHole.x,26);near(rodHole.y,0);near(rodHole.r,1.6);

