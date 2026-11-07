import assert from 'node:assert/strict';
import {MAD_BOX_EXAMPLE} from '../js/blocks/iq-mad-box-example.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {gearTrain,gearLayers} from '../js/core/gear-train.js';
import {solveTopology} from '../js/multilink/solver.js';
import {buildSceneModel} from '../js/blocks3d/scene-model.js';
import {analyzeDof} from '../js/blocks/dof.js';
import {gearDriver} from '../js/blocks/motor-tools.js';
import {gridIssues} from '../js/blocks/grid-rule.js';
import {inspectGearExport,exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
const s=normalizeSnapshot(structuredClone(MAD_BOX_EXAMPLE.snapshot)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const compile=comps=>compileTopology(comps,{params:s.params},new Set());
assert.equal(analyzeDof(s.comps).dof,1);assert.deepEqual(gridIssues(s.comps,s.params),[]);
for(const comps of [s.comps,[...s.comps].reverse()]){
 const compiled=compile(comps),drive=gearTrain(comps,s.params);assert.equal(drive.reason,'');
 near(drive.state('MadF').factor,-1/27);assert.equal(gearDriver(comps,'MadF').id,'MadA');
 for(let angle=-9720;angle<=9720;angle+=90){
  const pose=solveTopology(compiled,{thetaDeg:angle});assert.ok(pose.isValid,pose.errorReason);assert.equal(pose.isUnderconstrained,false);
  for(let i=0;i<4;i++){const a=angle*Math.PI/180*(-1/3)**i,p=pose.points['MadPin'+i];near(p.x,48*i+8*Math.cos(a));near(p.y,8*Math.sin(a));}
 }
 const pose=solveTopology(compiled,{thetaDeg:270}),defs=comps.map(g=>({id:g.id,center:g.p1.id,pin:g.p2.id,teeth:g.teeth,module:g.module,mesh:g.mesh,radius:s.params[g.radiusParam]}));
 const scene=buildSceneModel(compiled.visualization.links,pose.points,{gears:defs,groundIds:new Set(comps.map(g=>g.p1.id))});
 const byId=new Map(scene.gears.map(g=>[g.id,g]));
 assert.equal(new Set(scene.gears.map(g=>g.z)).size,3);
 assert.ok(scene.gears.every(g=>g.layer!==-2),'reserve the existing frame plate layer');
 for(const [a,b] of [['MadA','MadB'],['MadC','MadD'],['MadE','MadF']])near(byId.get(a).z,byId.get(b).z);
 for(const [a,b] of [['MadB','MadC'],['MadD','MadE']]){assert.notEqual(byId.get(a).z,byId.get(b).z);near(byId.get(a).angle,byId.get(b).angle);}
 assert.deepEqual([...gearLayers(comps)].sort(),[...gearLayers(s.comps)].sort());
}
const bad=change=>{const comps=structuredClone(s.comps);change(comps);const r=solveTopology(compile(comps),{thetaDeg:90});assert.equal(r.isValid,false);assert.ok(r.errorReason);};
bad(c=>{c[2].phase=10;});bad(c=>{c[2].pinRadiusParam='bad';c[2].pinRadius=12;});
bad(c=>{c[0].mesh='MadF';});bad(c=>{c[2].mesh='MadA';});
const independent=structuredClone(s.comps);independent[2].p2.id='LoosePin';delete independent[2].pinRadiusParam;independent[2].pinRadius=8;
near(gearTrain(independent,s.params).state('MadC').factor,1); // a center alone does not lock rotation
const saved=normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(s.comps,s,s.counter,s))));
assert.deepEqual(saved.comps,s.comps);assert.deepEqual(saved.params,s.params);
for(const g of s.comps){
 const geo=inspectGearExport(g,s.params,{},s.comps),root=g.module*(g.teeth/2-1.25);
 for(const h of geo.holes)assert.ok(Math.hypot(h.x,h.y)+h.r+.5<=root);
 for(let i=0;i<geo.holes.length;i++)for(let j=i+1;j<geo.holes.length;j++)assert.ok(Math.hypot(geo.holes[i].x-geo.holes[j].x,geo.holes[i].y-geo.holes[j].y)>=geo.holes[i].r+geo.holes[j].r+.5);
}
const compiled=compile(s.comps),pose=solveTopology(compiled,{thetaDeg:0});
for(const output of [exportLinksAsSvg,exportLinksAsDxf]){
 const files=[];assert.equal(output(s.comps,pose.points,s.params,{},[],null,(...args)=>files.push(args)),6);assert.equal(files.length,6);
}
console.log('M.A.D. Box: 434 multi-turn poses, 27:1, two-hole rigid shafts, invalid inputs, order-independent three planes, grid, output holes and JSON passed');
