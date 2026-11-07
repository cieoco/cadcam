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
import {planSyringeStroke,scanSyringe} from '../js/blocks/syringe-operations.js';
import {attachmentPoint} from '../js/core/syringe.js';
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
const actuate=(s,e,prev)=>planSyringeStroke(s.comps,s.params,s.comps.find(c=>c.type==='syringe').id,e,prev);
let prior;
for(let e=0;e<=40;e+=.5){
 const r=actuate(scissor,e,prior);assert.ok(r.ok,r.message);const p=r.points;
 // Independent symmetric-scissor oracle derived from the actual mount fractions:
 // L^2 = (5w/7)^2+(9h/7)^2, w^2+h^2=112^2.
 const h=Math.sqrt(((95+e)**2-80**2)*7/8),w=Math.sqrt(112**2-h*h);
 for(let i=0;i<4;i++){near(p[`ScissorL${i}`].x,0);near(p[`ScissorL${i}`].y,i*h);near(p[`ScissorR${i}`].x,w);near(p[`ScissorR${i}`].y,i*h);}
 for(let i=0;i<3;i++){
  near(p[`ScissorM${i}`].x,w/2);near(p[`ScissorM${i}`].y,(i+.5)*h);
  for(const [a,b] of [[`ScissorL${i}`,`ScissorR${i+1}`],[`ScissorR${i}`,`ScissorL${i+1}`]])near(Math.hypot(p[b].x-p[a].x,p[b].y-p[a].y),112);
 }
 near(p.ScissorP.x,192);near(p.ScissorP.y,3*h);
 const syringe=r.comps.find(c=>c.type==='syringe'),a=attachmentPoint(syringe.a,r.comps,scissor.params,p),b=attachmentPoint(syringe.b,r.comps,scissor.params,p);
 near(Math.hypot(b.x-a.x,b.y-a.y),95+e);assert.ok(a.y>0&&b.y>a.y,'both actuator mounts move on the arms');
 const rail=scissor.comps.find(c=>c.movingRail);near(p[rail.m1.id].y,3*h);near(p[rail.m2.id].y,3*h);
 prior=p;
}
assert.ok(scanSyringe(scissor.comps,scissor.params,'ScissorSyringe').ok);
assert.equal(actuate(scissor,-1).ok,false);assert.equal(actuate(scissor,41).ok,false);
const wider=planBarFusionResize(scissor.comps,scissor.params,'ScissorExtension',72);assert.ok(wider.ok,wider.reason);
for(const e of [0,20,40]){const r=actuate(wider,e);assert.ok(r.ok,r.message);near(r.points.ScissorP.x,200);near(r.points.ScissorP.y,r.points.ScissorL3.y);}
assert.deepEqual(gridIssues(wider.comps,wider.params),[]);
const invalid=change=>{const s=structuredClone(scissor);change(s);const r=solveTopology(compile(s),{thetaDeg:0});assert.equal(r.isValid,false,JSON.stringify(r));return r;};
assert.ok(invalid(s=>s.comps=s.comps.filter(c=>c.type!=='syringe')).isUnderconstrained,'without actuator the one physical DOF must remain free');
assert.ok(invalid(s=>{for(const c of s.comps)if(c.id==='ScissorPlatform'){delete c.barFusion;delete c.barFusionRoot;}else if(c.id==='ScissorExtension')delete c.barFusionRoot;}).isUnderconstrained,'a free platform endpoint is not fixed by its seed');
invalid(s=>{s.comps=s.comps.filter(c=>!['ScissorPlatform','ScissorExtension'].includes(c.id));});
invalid(s=>{s.params.ScissorTopLength=120;});
invalid(s=>{s.comps.find(c=>c.movingRail).travelEnd=80;});
invalid(s=>{s.comps.find(c=>c.movingRail).p1={id:'DetachedRail',x:0,y:140,type:'floating'};});
invalid(s=>{s.comps.find(c=>c.type==='syringe').b.componentId='missing';});
invalid(s=>{s.comps.find(c=>c.type==='syringe').spec.lmin=150;});
invalid(s=>{s.comps.find(c=>c.id==='ScissorPlatform').isInput=true;});
invalid(s=>{const rail=s.comps.find(c=>c.movingRail);rail.m2={...rail.p2};rail.carrierLen+=8;});
const prefixed=structuredClone(scissor);prefixed.comps.push({type:'triangle',id:'fusion-user-triangle',p1:{...scissor.comps[0].p1},p2:{...scissor.comps.find(c=>c.id==='ScissorBottom').p2},p3:{id:'TriangleTip',type:'floating',x:96,y:80},gParam:192,r1Param:Math.hypot(96,80),r2Param:Math.hypot(96,80)});
assert.equal(solveTopology(compile(prefixed),{thetaDeg:0}).isValid,true,'a real triangle remains constrained regardless of its ID prefix');
// Arbitrary IDs, translated and rotated world axes must solve the same graph.
const rotated=structuredClone(scissor),angle=.63,cs=Math.cos(angle),sn=Math.sin(angle),map=new Map();
const rename=id=>{if(!map.has(id))map.set(id,`Arbitrary_${map.size}`);return map.get(id);};
for(const c of rotated.comps){c.id=rename(c.id);for(const k of ['p1','p2','p3','m1','m2'])if(c[k]){const p=c[k],x=p.x,y=p.y;p.id=rename(p.id);p.x=23+x*cs-y*sn;p.y=-17+x*sn+y*cs;}
 if(c.barFusionRoot)c.barFusionRoot=rename(c.barFusionRoot);
 if(c.barFusion){c.barFusion.members=c.barFusion.members.map(rename);c.barFusion.points.forEach(p=>p.id=rename(p.id));}
 if(c.type==='syringe')for(const k of ['a','b'])c[k].componentId=rename(c[k].componentId);
}
for(const e of [0,20,40]){const r=actuate(rotated,e);assert.ok(r.ok,r.message);const h=Math.sqrt(((95+e)**2-6400)*7/8);near(r.points[map.get('ScissorP')].x,23+192*cs-3*h*sn);near(r.points[map.get('ScissorP')].y,-17+192*sn+3*h*cs);}
for(const id of ['continuous-roller-intake','crank-catapult-study','guided-scissor-lift']){
 const source=getExample(id).snapshot,before=JSON.stringify(source),s=load(id),lesson=getExampleLesson(id);
 assert.ok(lesson.try.length&&/未|沒有/.test(lesson.explain));
 const saved=normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot(s.comps,s,s.counter,s))));assert.deepEqual(saved.comps,s.comps);assert.deepEqual(saved.params,s.params);
 for(const format of ['svg','dxf']){
  if(id==='guided-scissor-lift'){assert.throws(()=>prepareScopedExport({...s,topo:s,fabrication:structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export},{scope:'assembly'},format),/液壓製作包目前支援/);continue;}
  const result=prepareScopedExport({...s,topo:s,fabrication:structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export},{scope:'assembly'},format);
  assert.ok(result.files.length);assert.ok(result.files.every(f=>!/(NaN|Infinity)/.test(f.text)));
  if(id==='continuous-roller-intake')assert.ok(result.notices.some(n=>n.includes('未提供獨立板材檔')),'pulley/belt partial export must be disclosed');
 }
 assert.equal(JSON.stringify(source),before);
}
console.log('IQ prototypes: intake 1:1/reverse/envelope, catapult tensioning only, three-stage syringe scissor closure/rails/rank/grid/resize, negative geometry, JSON and partial exports passed');
