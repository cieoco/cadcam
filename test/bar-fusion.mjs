import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectBarFusion} from '../js/blocks/bar-fusion-geometry.js';
import {planBarFusion,dissolveBarFusion} from '../js/blocks/bar-fusion-plan.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {analyzeDof} from '../js/blocks/dof.js';
import {toSnapshot,normalizeSnapshot} from '../js/blocks/schema.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
const pt=(id,x,y,type='floating')=>({id,x,y,type});
const a={...pt('A',0,0,'motor'),physicalMotor:'1'},b=pt('B',80,0),c=pt('C',80,50),d=pt('D',80,-60);
const bar=(id,p1,p2,input=false)=>({type:'bar',id,p1:{...p1},p2:{...p2},fixedLen:true,lenParam:id+'L',isInput:input,...(input?{physicalMotor:'1',motorType:'tt'}:{}),stock:{widthMm:18,thicknessMm:4,material:'plywood'}});
const source=[bar('One',a,b,true),bar('Two',b,c),bar('Three',b,d)],params={OneL:80,TwoL:50,ThreeL:60};
const before=JSON.stringify(source);
const plan=planBarFusion(source,['One','Two','Three'],params);
assert.ok(plan.ok,plan.reason);assert.equal(JSON.stringify(source),before);
assert.equal(plan.geometry.outlines.length,1);assert.equal(plan.geometry.holes.length,3); // motor shaft is a cutout
assert.equal(plan.geometry.cutouts.length,1);
const topo=compileTopology(plan.comps,{params:{...params}},new Set());
for(const theta of [0,30,90,180,270,360]){
 const s=solveTopology(topo,{thetaDeg:theta});assert.ok(s.isValid,s.errorReason);assert.equal(s.isUnderconstrained,false);
 const t=theta*Math.PI/180;for(const p of [b,c,d]){assert.ok(Math.hypot(s.points[p.id].x-(p.x*Math.cos(t)-p.y*Math.sin(t)),s.points[p.id].y-(p.x*Math.sin(t)+p.y*Math.cos(t)))<.001,JSON.stringify({theta,p,actual:s.points[p.id]}));}
}
assert.equal(analyzeDof(plan.comps).dof,1);
const restored=normalizeSnapshot(toSnapshot(plan.comps,{params},3));assert.ok(restored);assert.deepEqual(restored.comps[0].barFusion,plan.comps[0].barFusion);
assert.equal(dissolveBarFusion(plan.comps,'Two').some(c=>c.barFusionRoot),false);
for(const fn of [exportLinksAsSvg,exportLinksAsDxf]){const files=[];fn(plan.comps,{},params,{},[],null,(text,name,mime,ids)=>files.push({text,name,ids}));assert.equal(files.length,1);assert.equal(files[0].ids.length,3);}
const cat=buildPartGeometryCatalog({comps:plan.comps,params});assert.ok(cat.parts.One,JSON.stringify(cat.diagnostics));assert.equal(cat.parts.Two,undefined);assert.equal(cat.parts.Three,undefined);assert.equal(cat.parts.One.sourceIds.length,3);
assert.equal(inspectBarFusion(plan.comps,plan.comps[0],{...params,TwoL:51}).ok,false);
assert.equal(planBarFusion(source,['One'],params).ok,false);
assert.equal(planBarFusion(source.map(c=>c.id==='Two'?{...c,moduleId:'other'}:c),['One','Two'],params).ok,false);
assert.equal(planBarFusion(source.map(c=>c.id==='Two'?{...c,stock:{...c.stock,thicknessMm:5}}:c),['One','Two'],params).ok,false);
const separated=[source[0],bar('Far',pt('E',300,0),pt('F',350,0))];assert.equal(planBarFusion(separated,['One','Far'],{...params,FarL:50}).ok,false);
const malformed=toSnapshot(plan.comps,{params},3);malformed.comps.pop();assert.equal(normalizeSnapshot(malformed),null);
console.log('bar fusion: three-bar rigid motion, holes, source preservation, normalization, export and material catalog passed');

// Two bars sharing the motor hole must not gain a second drive on reload.
const shared=[source[0],bar('Wing',a,pt('Tip',0,60))],sharedParams={OneL:80,WingL:60};
const sharedPlan=planBarFusion(shared,['Wing','One'],sharedParams);
assert.ok(sharedPlan.ok,sharedPlan.reason);
const sharedReload=normalizeSnapshot(toSnapshot(sharedPlan.comps,{params:sharedParams},4));
assert.equal(sharedReload.comps.filter(c=>c.isInput).length,1);
const sharedSolved=solveTopology(compileTopology(sharedReload.comps,{params:sharedReload.params},new Set()),{thetaDeg:45});assert.ok(sharedSolved.isValid,JSON.stringify(sharedSolved));
const {encodeSnapshot,decodeShareString}=await import('../js/share-codec.js');
assert.deepEqual(normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(plan.comps,{params},3)))).comps,restored.comps);
const {buildPlan}=await import('../js/blocks/build-plan.js');
const fabrication=buildPlan({comps:plan.comps,params});
assert.equal(fabrication.parts.filter(p=>p.kind==='member').length,1);
assert.deepEqual(fabrication.parts.find(p=>p.compId==='One').fusedMembers,['One','Two','Three']);
const {buildSceneModel}=await import('../js/blocks3d/scene-model.js');
const {attachPartMaterials}=await import('../js/blocks3d/part-pose.js');
const solved=solveTopology(topo,{thetaDeg:45});
const model=buildSceneModel(topo.visualization.links,solved.points,{groundIds:new Set(['A']),motorCenters:new Set(['A']),memberStocks:cat.memberStocks});
assert.equal(model.sticks.length,1);
assert.deepEqual([...model.sticks[0].joints].sort(),['A','B','C','D']);
assert.ok(['C','D'].every(id=>model.pins.some(p=>p.id===id)),'all union holes have 3D pins');
const scene=attachPartMaterials(model,cat,{comps:plan.comps,points:solved.points});
assert.equal(scene.materialParts.filter(p=>p.geometry.kind==='bar').length,1);
assert.deepEqual(scene.materialParts.find(p=>p.partId==='One').geometry.sourceIds,['One','Two','Three']);
const {instantiateTemplate}=await import('../js/blocks/module-ops.js');
const copy=instantiateTemplate({comps:plan.comps,params,base:'A',name:'union'},{place:{x:200,y:300}});
assert.ok(normalizeSnapshot(toSnapshot(copy.comps,{params:copy.params},copy.counter,{modules:[copy.module]})),'module copy remaps union IDs');
const cp=copy.comps.find(c=>c.barFusion);assert.ok(inspectBarFusion(copy.comps,cp,copy.params).ok);
assert.deepEqual(cp.barFusion.points.map(({x,y})=>({x,y})),plan.data.points.map(({x,y})=>({x,y})),'module translation preserves local shape');
// Collinear and four-member rings retain rigid geometry and a central void.
const straight=[source[0],bar('Extension',b,pt('End',140,0))];
const sp=planBarFusion(straight,['One','Extension'],{OneL:80,ExtensionL:60});assert.ok(sp.ok,sp.reason);
assert.ok(solveTopology(compileTopology(sp.comps,{params:{OneL:80,ExtensionL:60}},new Set()),{thetaDeg:90}).isValid);
const r1=pt('R1',0,0,'fixed'),r2=pt('R2',80,0,'fixed'),r3=pt('R3',80,80),r4=pt('R4',0,80);
const ring=[bar('R12',r1,r2),bar('R23',r2,r3),bar('R34',r3,r4),bar('R41',r4,r1)],rp={R12L:80,R23L:80,R34L:80,R41L:80};
const ringPlan=planBarFusion(ring,ring.map(c=>c.id),rp);assert.ok(ringPlan.ok,ringPlan.reason);
assert.equal(ringPlan.geometry.cutouts.filter(c=>c.layer==='FUSION_CUTOUT').length,1);
assert.ok(solveTopology(compileTopology(ringPlan.comps,{params:rp},new Set()),{thetaDeg:0}).isValid);
const {frameConnectorNodes}=await import('../js/blocks/model.js');
assert.equal(frameConnectorNodes(ringPlan.comps).length,0,'fixed union is not duplicated as another frame');
// An external crank with a fixed far end remains a separate moving body.
const external=[...plan.comps,bar('External',c,pt('X',80,110,'fixed'))];
const extTopo=compileTopology(external,{params:{...params,ExternalL:60}},new Set());
assert.equal(extTopo.visualization.links.filter(l=>!l.hidden).length,2);
assert.ok(solveTopology(extTopo,{thetaDeg:0}).isValid);
assert.equal(solveTopology(extTopo,{thetaDeg:90}).isValid,false,'conflicting fixed anchor is rejected, not stretched');
assert.equal(planBarFusion(source.map(c=>c.id==='Two'?{...c,zlift:1}:c),['One','Two'],params).ok,false);
assert.equal(planBarFusion(source.map(c=>c.id==='Two'?{...c,holes:[{id:'hole'}]}:c),['One','Two'],params).ok,false);
console.log('bar fusion: shared motor reload, share, copy, 3D, build plan, two/four bars, collinear, void and incompatible anchors passed');
if(process.argv.includes('--fixture')){
 const {mkdirSync,writeFileSync}=await import('node:fs');mkdirSync('output/bar-fusion',{recursive:true});
 writeFileSync('output/bar-fusion/before.blocks.json',JSON.stringify(toSnapshot(source.map(c=>({...c,name:({One:'橫向主桿',Two:'上方連桿',Three:'下方連桿'})[c.id]})),{params},3)));
 writeFileSync('output/bar-fusion/after.blocks.json',JSON.stringify(toSnapshot(plan.comps,{params},3)));
}
// Capture the displayed pose rather than stale seed angles (a folded wing).
const folded=planBarFusion(shared,['One','Wing'],sharedParams,{}, {A:a,B:b,Tip:{x:0,y:-60}});
assert.ok(folded.ok,folded.reason);
const fs=solveTopology(compileTopology(folded.comps,{params:sharedParams},new Set()),{thetaDeg:0});
assert.ok(fs.isValid,fs.errorReason);assert.ok(Math.abs(fs.points.Tip.y+60)<.001,'saved union side follows the preview, not the old sketch');
const {prepareScopedExport}=await import('../js/blocks/export-scope.js');
for(const selectedId of ['One','Two','Three'])for(const format of ['svg','dxf']){
 const scoped=prepareScopedExport({comps:plan.comps,modules:[],topo:{params},exportSettings:{}},{scope:'selected',selectedId},format);
 assert.equal(scoped.files.length,1);assert.deepEqual(scoped.files[0].sourceIds,['One','Two','Three']);
}
console.log('bar fusion: scoped SVG/DXF from any constituent keeps the complete union');

// A loose extension freezes the hydraulic display at stale coordinates. Fusion
// must retain declared lengths, align tiny angles, then validate the pose.
const hydraulic=normalizeSnapshot(JSON.parse(readFileSync(new URL('./fixtures/fusion-hydraulic-stale.json',import.meta.url),'utf8')));
const originalHydraulic=JSON.stringify(hydraulic);
const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const arm=hydraulic.comps.find(c=>c.id==='H1Arm'),extension=hydraulic.comps.find(c=>c.id==='Link11');
const oldAngle=angle(extension.p1,extension.p2)-angle(arm.p1,arm.p2);
for(const ids of [['H1Arm','Link11'],['Link11','H1Arm']]){
 const f=planBarFusion(hydraulic.comps,ids,hydraulic.params);assert.ok(f.ok,f.reason);
 const saved=normalizeSnapshot(toSnapshot(f.comps,{params:hydraulic.params},11));assert.ok(saved);
 const local=f.points,actualAngle=angle(local.H1C,local.P11b)-angle(local.H1O,local.H1C);
 assert.ok(Math.abs(oldAngle)<Math.PI/180);assert.ok(Math.abs(actualAngle)<1e-9,'tiny angle aligns to a straight part');assert.equal(f.straightened,true);
 assert.equal(saved.params.H1Arm,52);assert.equal(saved.params.LL11,80);
 for(const mm of [0,5,10,15,20]){
  const candidate=structuredClone(saved.comps);candidate.find(c=>c.type==='syringe').extension=mm;
  const s=solveTopology(compileTopology(candidate,{params:saved.params},new Set()),{thetaDeg:0});assert.ok(s.isValid,s.reason);assert.equal(s.isUnderconstrained,false);
  assert.ok(Math.abs(Math.hypot(s.points.H1C.x-s.points.H1O.x,s.points.H1C.y-s.points.H1O.y)-52)<.001);
  assert.ok(Math.abs(Math.hypot(s.points.P11b.x-s.points.H1C.x,s.points.P11b.y-s.points.H1C.y)-80)<.001);
 }
 for(const format of ['svg','dxf']){
  const work={comps:f.comps,modules:[],topo:{params:hydraulic.params},exportSettings:{}};
  assert.throws(()=>prepareScopedExport(work,{scope:'selected',selectedId:ids[0]},format),/尚待核對/,'the existing hydraulic manufacturing restriction remains');
  assert.equal(prepareScopedExport({...work,comps:f.comps.filter(c=>ids.includes(c.id))},{scope:'selected',selectedId:ids[0]},format).files.length,1);
 }
}
assert.equal(JSON.stringify(hydraulic),originalHydraulic,'preview cannot rewrite the original pose or dimensions');
const locked=structuredClone(hydraulic.comps);locked.find(c=>c.id==='Link11').p2.type='fixed';
assert.equal(planBarFusion(locked,['H1Arm','Link11'],hydraulic.params).ok,false,'a conflicting external fixed end is still rejected');
// No example IDs: the same stale-pose path works for an ordinary renamed work.
const renamed=JSON.parse(originalHydraulic.replaceAll('H1','Generic').replaceAll('Link11','Extension'));
assert.ok(planBarFusion(renamed.comps,['GenericArm','Extension'],renamed.params).ok);
console.log('bar fusion: stale hydraulic pose, both selection orders, unchanged lengths/angle, export, reload, stroke and conflicting anchor passed');
for(const degrees of [-1.1,-1,-.01643,.01643,1,1.1]){
 const r=degrees*Math.PI/180,tip=pt('Tip',80+60*Math.cos(r),60*Math.sin(r));
 const f=planBarFusion([source[0],bar('Tail',b,tip)],['One','Tail'],{OneL:80,TailL:60});
 assert.ok(f.ok,f.reason);
 if(Math.abs(degrees)<=1){assert.equal(f.straightened,true);assert.ok(Math.abs(f.points.Tip.y)<1e-9);}
 else{assert.ok(!f.straightened);assert.ok(Math.abs(f.points.Tip.y-tip.y)<1e-9,'larger angles remain unchanged');}
}
