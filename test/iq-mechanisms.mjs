import assert from 'node:assert/strict';
import {getExample,getExampleLesson} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {motionPoseIssue} from '../js/blocks/solve-health.js';
import {analyzeDof} from '../js/blocks/dof.js';
import {gridIssues} from '../js/blocks/grid-rule.js';
import {planBarFusionResize} from '../js/blocks/bar-fusion-resize.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
const load=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
const compile=s=>compileTopology(s.comps,{params:s.params},new Set());
function sweep(s,end,check){const t=compile(s);let prev;for(let a=0;a<=end;a+=.5){const r=solveTopology(t,{thetaDeg:a,_prevPoints:prev});assert.equal(motionPoseIssue(s.comps,r),null,JSON.stringify(r));check?.(r.points,a);prev=r.points;}}
const intake=load('continuous-roller-intake');
sweep(intake,360,(p,a)=>{const t=a*Math.PI/180;near(p.RollPin.x,8*Math.cos(t));near(p.RollPin.y,32+8*Math.sin(t));near(p.RollMotorPin.x,-64+5*Math.cos(t));near(p.RollMotorPin.y,32+5*Math.sin(t));});
const reversed=solveTopology(compile(intake),{thetaDeg:-90});near(reversed.points.RollPin.y,24);
const larger=structuredClone(intake);larger.comps.find(c=>c.id==='IntakeRoller').diameterMm=48;sweep(larger,360);
assert.equal(larger.params.IntakeDrivenRadius,5,'roller envelope must not silently change pulley ratio');
const catapult=load('crank-catapult-study');let previous=Infinity;
sweep(catapult,60,p=>{assert.ok(p.ThrowTip.y<=previous+1e-5,'tensioning segment lowers arm');previous=p.ThrowTip.y;near(Math.hypot(p.ThrowTip.x-96,p.ThrowTip.y),128);});
const longerArm=planBarFusionResize(catapult.comps,catapult.params,'ThrowExtension',72);assert.ok(longerArm.ok,longerArm.reason);sweep({...catapult,...longerArm},60);
const broken=structuredClone(catapult);broken.params.ThrowPull=8;assert.equal(solveTopology(compile(broken),{thetaDeg:0}).isValid,false);
const scissor=load('guided-scissor-lift');assert.equal(analyzeDof(scissor.comps).dof,1);assert.deepEqual(gridIssues(scissor.comps,scissor.params),[]);
sweep(scissor,48,(p,a)=>{const span=96+a,h=Math.sqrt(160**2-span**2);near(p.ScissorB.x,span);near(p.ScissorC.x,0);near(p.ScissorC.y,h);near(p.ScissorP.x,192);near(p.ScissorP.y,h);near(p.ScissorQ.y,h+56);});
const wider=planBarFusionResize(scissor.comps,scissor.params,'ScissorPlatform',200);assert.ok(wider.ok,wider.reason);sweep({...scissor,...wider},48,p=>near(p.ScissorP.y,p.ScissorC.y));assert.deepEqual(gridIssues(wider.comps,wider.params),[]);
assert.equal(solveTopology(compile(scissor),{thetaDeg:80}).isValid,false,'overextended crossed arms must fail');
for(const id of ['continuous-roller-intake','crank-catapult-study','guided-scissor-lift']){
 const source=getExample(id).snapshot,before=JSON.stringify(source),s=load(id),lesson=getExampleLesson(id);
 assert.ok(lesson.try.length&&/未|沒有/.test(lesson.explain));
 const saved=normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(s.comps,s,s.counter,s))));assert.deepEqual(saved.comps,s.comps);assert.deepEqual(saved.params,s.params);
 for(const format of ['svg','dxf']){
  const result=prepareScopedExport({...s,topo:s,fabrication:structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export},{scope:'assembly'},format);
  assert.ok(result.files.length);assert.ok(result.files.every(f=>!/(NaN|Infinity)/.test(f.text)));
  if(id==='continuous-roller-intake')assert.ok(result.notices.some(n=>n.includes('未提供獨立板材檔')),'pulley/belt partial export must be disclosed');
 }
 assert.equal(JSON.stringify(source),before);
}
console.log('IQ prototypes: intake 1:1/reverse/envelope, catapult tensioning only, guided scissor sweep/grid/resize, negative geometry, JSON and partial exports passed');
