import assert from 'node:assert/strict';
import {frameHoleAxis,syncFrameHoles} from '../js/blocks/frame-holes.js';
import {planFrameHole} from '../js/blocks/frame-hole-plan.js';
import {frameGroundAxis} from '../js/blocks/frame-ground.js';
import {frameConnectorNodes,frameNodes,updatePointCoordsById,mergePoints} from '../js/blocks/model.js';
import {inspectFrameExport,exportFrameAsSvg,exportFrameAsDxf} from '../js/blocks/exporters.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {prepareConnectionWork} from '../js/blocks/connection-work.js';
import {solveTopology} from '../js/multilink/solver.js';
import {instantiateTemplate} from '../js/blocks/module-ops.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const stock={lengthMm:216,widthMm:18};
const comps=[{type:'bar',id:'Support',p1:{id:'A',type:'fixed',x:0,y:0,frameStock:stock},p2:{id:'B',type:'fixed',x:100,y:0,frameStock:stock},lenParam:'L',fixedLen:true}];
const settings={frameHoleDiameterMm:3.2,barWidthMm:18},geometry=inspectFrameExport(frameConnectorNodes(comps),settings);
const hole={type:'anchor',id:'Extra',p1:{id:'Added',type:'fixed',x:150,y:0},frameHole:{a:'A',b:'B',u:150}};
assert.ok(planFrameHole(comps,hole,150,geometry,3.2).ok);
assert.equal(planFrameHole(comps,hole,200,geometry,3.2).ok,false,'outside stock');
assert.equal(planFrameHole(comps,hole,99,geometry,3.2).ok,false,'existing hole clearance');
assert.equal(planFrameHole(comps,hole,NaN,geometry,3.2).ok,false);
const slot={...geometry,cutouts:[{points:[{x:145,y:-5},{x:155,y:-5},{x:155,y:5},{x:145,y:5}]}]};
assert.equal(planFrameHole(comps,hole,150,slot,3.2).ok,false,'slot clearance');
comps.push(hole);
const g=inspectFrameExport(frameConnectorNodes(comps),settings);
assert.deepEqual(g.outlines,geometry.outlines,'adding an interior hole does not move or resize the stock');
assert.equal(g.holes.length,3);assert.ok(g.holes.some(h=>h.id==='Added'&&h.x===150));
assert.equal(frameGroundAxis(frameNodes(comps)).target.id,'B','added hole never becomes the axis reference');
// The existing draw/snap operation uses the same point identity, without a second connector.
comps.push({type:'bar',id:'Arm',p1:{id:'New',type:'floating',x:150,y:0},p2:{id:'End',type:'floating',x:170,y:20},lenParam:'ArmL',fixedLen:true});
mergePoints(comps,'New','Added');assert.equal(comps[2].p1.id,'Added');
const params={L:100,ArmL:Math.sqrt(800)};
hole.frameHole.u=145.125;syncFrameHoles(comps);near(comps[2].p1.x,145.125);
const oldParams={...params};updatePointCoordsById(comps,'B',0,100);
const work=prepareConnectionWork(comps,[],{params});near(hole.p1.x,0);near(hole.p1.y,145.125);near(comps[2].p1.y,145.125);
near(params.ArmL,oldParams.ArmL);
const solved=solveTopology(work.compiled,{thetaDeg:0});near(solved.points.Added.y,145.125);
// Resizing material never shifts existing holes; shrinking retains edge material.
const before=structuredClone(comps.map(c=>c.p1));for(const c of comps)for(const p of [c.p1,c.p2])if(p?.frameStock)p.frameStock={lengthMm:110,widthMm:18};
const smaller=inspectFrameExport(frameConnectorNodes(comps),settings);assert.ok(smaller.dimensions.lengthMm>=197.45);assert.deepEqual(comps.map(c=>c.p1),before.map(p=>p.frameStock?{...p,frameStock:{lengthMm:110,widthMm:18}}:p));
const snap={kind:'blocks',v:1,counter:3,comps,params};
const saved=normalizeSnapshot(JSON.parse(JSON.stringify(snap)));assert.deepEqual(saved.comps[1].frameHole,hole.frameHole);near(saved.comps[1].p1.y,145.125);
const copy=instantiateTemplate({comps,params,base:'A',name:'Frame'}, {counter:20,place:{x:40,y:80}});
const copiedHole=copy.comps.find(c=>c.frameHole);assert.notEqual(copiedHole.frameHole.a,'A');assert.ok(frameHoleAxis(copy.comps,copiedHole));
const copied=structuredClone(copiedHole.p1);syncFrameHoles(copy.comps);near(copiedHole.p1.x,copied.x);near(copiedHole.p1.y,copied.y);
const orphan=normalizeSnapshot({...snap,comps:comps.filter(c=>c.id!=='Support')});assert.ok(!orphan.comps.find(c=>c.id==='Extra').frameHole);assert.ok(orphan.warnings.some(w=>w.includes('基準已不存在')));
const blobs=[];globalThis.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};globalThis.URL.createObjectURL=b=>{blobs.push(b);return 'blob:test';};globalThis.URL.revokeObjectURL=()=>{};
exportFrameAsSvg(frameConnectorNodes(comps),settings);exportFrameAsDxf(frameConnectorNodes(comps),settings);
const files=await Promise.all(blobs.map(b=>b.text()));assert.equal(files.length,2);assert.ok(files.every(f=>f.includes('145.125')),'same hole position reaches SVG and DXF');
console.log('PASS frame holes: same joint, material/slot clearance, stable outline/axis, relative motion, exact save, copy remapping, orphan fallback and SVG/DXF');

// Center-line is the default constraint; releasing it adds the second local coordinate.
const wide=[{type:'bar',id:'Frame',p1:{id:'A',type:'fixed',x:0,y:0,frameStock:{lengthMm:216,widthMm:80}},p2:{id:'B',type:'fixed',x:100,y:0,frameStock:{lengthMm:216,widthMm:80}},lenParam:'L',fixedLen:true},
 {type:'anchor',id:'Hole',p1:{id:'H',type:'fixed',x:50,y:0},frameHole:{a:'A',b:'B',u:50}}];
const wh=wide[1],wg=inspectFrameExport(frameConnectorNodes(wide),settings);
assert.deepEqual(planFrameHole(wide,wh,{v:16.25},wg,3.2).point,{x:50,y:0},'locked hole stays centered');
for(const v of [-16.25,16.25]){
 const planned=planFrameHole(wide,wh,{centered:false,u:52.125,v},wg,3.2);assert.ok(planned.ok,planned.reason);assert.deepEqual(planned.point,{x:52.125,y:v});
}
assert.equal(planFrameHole(wide,wh,{centered:false,v:39},wg,3.2).ok,false,'side edge margin');
assert.equal(planFrameHole(wide,wh,{centered:false,v:NaN},wg,3.2).ok,false);
wh.frameHole={...wh.frameHole,u:52.125,centered:false,v:16.25};syncFrameHoles(wide);
assert.equal(planFrameHole(wide,wh,60,wg,3.2).v,16.25,'editing distance retains offset');
assert.equal(planFrameHole(wide,wh,{centered:true},wg,3.2).v,0);
assert.equal(planFrameHole(wide,wh,{centered:true},{...wg,holes:[...wg.holes,{id:'Occupied',x:52.125,y:0,r:1.6}]},3.2).ok,false,'re-centering checks occupied holes');
const wideSnap={kind:'blocks',v:1,counter:2,comps:wide,params:{L:100}};
const reload=normalizeSnapshot(wideSnap);assert.deepEqual(reload.comps[1].frameHole,wh.frameHole);near(reload.comps[1].p1.y,16.25);
const {buildPartGeometryCatalog}=await import('../js/blocks/part-geometry.js');
assert.ok(buildPartGeometryCatalog({comps:wide,params:{L:100},exportSettings:settings}).parts.frame.holes.some(h=>h.id==='H'&&h.y===16.25));
const shifted=instantiateTemplate({comps:wide,params:{L:100},base:'A',name:'Wide'},{counter:40,place:{x:50,y:70}});
const sh=shifted.comps.find(c=>c.frameHole);assert.equal(sh.frameHole.v,16.25);const shpos={...sh.p1};syncFrameHoles(shifted.comps);assert.deepEqual(sh.p1,shpos);
updatePointCoordsById(wide,'B',0,100);syncFrameHoles(wide);near(wh.p1.x,-16.25);near(wh.p1.y,52.125);
exportFrameAsSvg(frameConnectorNodes(wide),settings);exportFrameAsDxf(frameConnectorNodes(wide),settings);
assert.ok((await Promise.all(blobs.slice(2).map(b=>b.text()))).every(t=>t.includes('16.25')&&t.includes('52.125')));
const invalid=structuredClone(wideSnap);invalid.comps[1].frameHole.v='invalid';assert.ok(!normalizeSnapshot(invalid).comps[1].frameHole,'invalid offset preserves world position as independent anchor');
console.log('PASS frame hole offsets: center default, both sides, edge/overlap rejection, exact save, axis following, module copy and shared export/3D geometry');
