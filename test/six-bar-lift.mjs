import assert from 'node:assert/strict';
import {getExample, getExampleLesson} from '../js/blocks/examples.js';
import {normalizeSnapshot, toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {analyzeDof} from '../js/blocks/dof.js';
import {validateMotionRange} from '../js/blocks/motion-range-validation.js';
import {planBarFusionResize} from '../js/blocks/bar-fusion-resize.js';
import {exportLinksAsSvg, exportLinksAsDxf} from '../js/blocks/exporters.js';
import {gridIssues} from '../js/blocks/grid-rule.js';
const source=getExample('six-bar-lift').snapshot, before=JSON.stringify(source);
const s=normalizeSnapshot(structuredClone(source)), near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`);
assert.ok(s);assert.equal(getExampleLesson('six-bar-lift').group,'lift-motion');
const dof=analyzeDof(s.comps);
assert.equal(dof.bodies,5);assert.equal(dof.lowerPairs,7);assert.equal(dof.dof,1);assert.equal(dof.inputs,1);
assert.deepEqual(gridIssues(s.comps,s.params),[]);
const topo=compileTopology(s.comps,{params:s.params},new Set());
const checkRange=s=>{const r=validateMotionRange(s,{startDeg:0,endDeg:65});assert.ok(r.ok,JSON.stringify(r.issues));assert.equal(r.sampleCount,131);};
checkRange(s);
for(let angle=0;angle<=65;angle+=.5){
  const r=solveTopology(topo,{thetaDeg:angle});assert.ok(r.isValid);assert.equal(r.isUnderconstrained,false);
  const p=r.points,t=angle*Math.PI/180;
  near(p.SixE.x,128*Math.cos(t));near(p.SixE.y,128*Math.sin(t));
  near(p.SixF.x,p.SixE.x);near(p.SixF.y-p.SixE.y,64);
  near(p.SixTip.y,p.SixF.y);near(p.SixTip.x-p.SixF.x,32);
}
const changed=planBarFusionResize(s.comps,s.params,'SixTool',40);
assert.ok(changed.ok,changed.reason);checkRange({...s,comps:changed.comps,params:changed.params});
assert.equal(changed.params.SixToolLength,40);
const bad=structuredClone(s);bad.params.SixUpperLength=8;
assert.equal(validateMotionRange(bad,{startDeg:0,endDeg:65}).ok,false);
assert.equal(planBarFusionResize(s.comps,s.params,'SixTool',0).ok,false);
const restored=normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(changed.comps,{params:changed.params},9))));
assert.deepEqual(restored.comps.filter(c=>c.barFusion).map(c=>c.barFusion),changed.comps.filter(c=>c.barFusion).map(c=>c.barFusion));
checkRange(restored);
const points=solveTopology(topo,{thetaDeg:0}).points;
for(const fn of [exportLinksAsSvg,exportLinksAsDxf]){
  const files=[];fn(s.comps,points,s.params,{},[],null,(text,name,mime,ids)=>files.push({text,name,ids}));
  assert.equal(files.length,6,'one file per rigid part, including frame');
  assert.ok(files.every(f=>!/(NaN|Infinity)/.test(f.text)));
  assert.ok(files.some(f=>f.ids?.includes('SixTool')&&f.ids?.includes('SixOutput')),'output exports as one rigid part');
}
assert.equal(JSON.stringify(source),before);
console.log('six-bar lift: six bodies, seven joints, 131 poses, horizontal tool, grid, edit, invalid geometry, JSON and six SVG/DXF parts passed');
