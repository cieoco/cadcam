import assert from 'node:assert/strict';
import {hydraulicSnapshot} from './fixtures/hinged-syringe.mjs';
import {solveSyringe,scanSyringe,planSyringeStroke,syringeReading,advanceSyringe} from '../js/blocks/syringe-operations.js';
import {attachmentPoint,SYRINGE_TOLERANCE_MM} from '../js/core/syringe.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {normalizeFabricationProfile} from '../js/blocks/fabrication-profile.js';
import {syringeManufacturing,syringeFiles,syringeSeatGeometry,syringeBuildPack} from '../js/blocks/syringe-manufacturing.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
const fixture=()=>structuredClone(hydraulicSnapshot),near=(a,b,t=SYRINGE_TOLERANCE_MM)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
let maxResidual=0;
test('three B comparisons scan full stroke, preserve rigid arm and continuous branch',()=>{
  const extents=[];
  for(const u of [60,80,100]){
    const h=fixture();h.comps[2].b.u=u;const scan=scanSyringe(h.comps,h.params,'HSyringe');assert.ok(scan.ok,scan.message);assert.equal(scan.samples.length,81);
    maxResidual=Math.max(maxResidual,scan.maxResidualMm);const branch=scan.samples[0].branch;
    for(const s of scan.samples){near(s.length,95+s.extension);near(Math.hypot(s.end.x,s.end.y),180);near(Math.hypot(s.b.x,s.b.y),u);assert.equal(s.branch,branch);}
    extents.push(scan.samples.at(-1).angle-scan.samples[0].angle);
  }
  assert.ok(extents[0]>extents[1]&&extents[1]>extents[2]);
});
test('reverse sweep does not flip or stretch, even after serialized reopen',()=>{
  const h=fixture();let p=solveSyringe(h.comps,h.params).points;
  for(let s=40;s>=0;s-=0.25){const r=planSyringeStroke(h.comps,h.params,'HSyringe',s,p);assert.ok(r.ok,r.message);assert.ok(r.points.HC.x>0);p=r.points;}
  h.comps[2].extension=0;
  for(const c of h.comps)for(const k of ['p1','p2','p3'])if(c[k]&&p[c[k].id])Object.assign(c[k],p[c[k].id]);
  const n=normalizeSnapshot(JSON.parse(JSON.stringify(h))),r=solveSyringe(n.comps,n.params);assert.ok(r.ok);near(r.points.HC.x,p.HC.x);near(r.points.HC.y,p.HC.y);
});
test('out-of-stroke candidate rejects without mutating original or last pose',()=>{
  const h=fixture(),before=JSON.stringify(h),p=solveSyringe(h.comps,h.params).points;
  for(const s of [-0.01,40.01,Infinity,NaN])assert.equal(planSyringeStroke(h.comps,h.params,'HSyringe',s,p).ok,false);
  assert.equal(JSON.stringify(h),before);
});
test('unreachable geometry and singularity reject',()=>{
  const h=fixture();h.comps[2].b.u=5;assert.equal(solveSyringe(h.comps,h.params).ok,false);
  h.comps[2].b.u=80;h.comps[2].spec.lmin=160;h.comps[2].extension=0;const r=solveSyringe(h.comps,h.params);assert.equal(r.ok,false);assert.match(r.message,/奇異/);
});
test('attachment owner missing or same rigid owner cannot silently float',()=>{
  const h=fixture();h.comps[2].a.componentId='gone';assert.equal(solveSyringe(h.comps,h.params).ok,false);
  h.comps[2].a.componentId='HArm';assert.equal(solveSyringe(h.comps,h.params).ok,false);
});
test('fractional mm measurements, A relocation, arm change alter solved motion',()=>{
  const h=fixture(),initial=solveSyringe(h.comps,h.params);h.comps[2].a.u=12.345;h.comps[2].b.u=78.123;h.params.HArm=193.234;
  const r=solveSyringe(h.comps,h.params);assert.ok(r.ok,r.message);near(Math.hypot(r.points.HC.x,r.points.HC.y),193.234);assert.notEqual(r.points.HC.y,initial.points.HC.y);
  const a=attachmentPoint(h.comps[2].a,h.comps,h.params,r.points);near(a.y,-67.655);
});
test('A on a moving owner follows its rotation, rather than becoming ground',()=>{
  const h=fixture(),arm={type:'bar',id:'moving',lenParam:'movingL',isInput:true,fixedLen:true,p1:{id:'M0',type:'motor',physicalMotor:'1',x:-70,y:-80},p2:{id:'M1',type:'floating',x:-10,y:-80}};
  h.comps.push(arm);h.params.movingL=60;h.comps[2].a={componentId:'moving',u:40,v:0};
  const compiled=compileTopology(h.comps,{params:h.params});let last=null,positions=[];
  for(const thetaDeg of [0,10,20]){const r=solveTopology(compiled,{thetaDeg,_prevPoints:last});assert.ok(r.isValid,r.reason||r.errorReason);last=r.points;positions.push(attachmentPoint(h.comps[2].a,h.comps,h.params,r.points));}
  assert.ok(Math.hypot(positions[0].x-positions[2].x,positions[0].y-positions[2].y)>1);
});
test('mm per second playback independent of refresh rate and reflects long frames',()=>{
  let a={extension:20,direction:1},b={...a};for(let i=0;i<300;i++)a=advanceSyringe(a.extension,a.direction,1/30,40);for(let i=0;i<1200;i++)b=advanceSyringe(b.extension,b.direction,1/120,40);
  near(a.extension,b.extension,1e-8);assert.equal(a.direction,b.direction);const c=advanceSyringe(20,1,100,40);near(c.extension,20);
});
test('off-axis plate attachment stays rigid and exports in plate local coordinates',()=>{
  const h=fixture(),a=h.comps[1];Object.assign(a,{type:'triangle',gParam:'HArm',r1Param:'r1',r2Param:'r2',p3:{id:'HD',x:60,y:50,type:'floating'},sign:1});
  h.params.r1=Math.hypot(60,50);h.params.r2=130;h.comps[2].b.v=10;
  const r=solveSyringe(h.comps,h.params);assert.ok(r.ok,r.message);
  const b=attachmentPoint(h.comps[2].b,h.comps,h.params,r.points);near(Math.hypot(b.x,b.y),Math.hypot(80,10));
  const p=syringeManufacturing(h.comps,h.params).parts.find(p=>p.id==='HArm');assert.ok(p.geometry.holes.some(h=>h.x===80&&h.y===10));
});
test('save/share/reopen preserves calibration, local mm refs and fabrication',()=>{
  const h=fixture();h.comps[2].spec.calibrated=true;h.comps[2].b.u=78.123;h.comps[2].spec.outerDiameter=15.873;
  const fabrication=normalizeFabricationProfile().profile;fabrication.syringeMount.clearanceMm=0.73;
  const saved=toSnapshot(h.comps,{params:h.params},h.counter,{fabrication}),n=normalizeSnapshot(decodeShareString(encodeSnapshot(saved)));
  assert.deepEqual(n.comps[2].a,h.comps[2].a);assert.deepEqual(n.comps[2].b,h.comps[2].b);assert.equal(n.comps[2].spec.outerDiameter,15.873);assert.equal(n.comps[2].spec.calibrated,true);assert.equal(n.fabrication.syringeMount.clearanceMm,0.73);assert.ok(solveSyringe(n.comps,n.params).ok);
});
test('cutting geometry and files share exact attachment centers, mm units and warning',()=>{
  const h=fixture();h.comps[2].b.u=78.123;const plan=syringeManufacturing(h.comps,h.params);assert.equal(plan.parts.length,4);
  const arm=plan.parts.find(p=>p.id==='HArm');assert.ok(arm.geometry.holes.some(p=>p.x===78.123&&p.y===0));
  assert.deepEqual(plan.parts[2].geometry,syringeSeatGeometry(h.comps[2].spec,plan.fabrication,'a'));
  for(const f of syringeFiles(plan,'svg')){assert.match(f.text,/width="[\d.]+mm"/);assert.match(f.text,/未依實物校正/);}
  for(const f of syringeFiles(plan,'dxf')){assert.match(f.text,/\$INSUNITS\n70\n4/);assert.match(f.text,/CALIBRATION/);}
  assert.match(syringeBuildPack(plan),/不可鑽穿筒身/);assert.ok(plan.purchased.some(p=>p.includes('水管')));
});
test('mount clearance changes seat geometry through saved shared fabrication',()=>{
  const h=fixture(),f=normalizeFabricationProfile().profile,a=syringeSeatGeometry(h.comps[2].spec,f);f.syringeMount.clearanceMm=2;
  const b=syringeSeatGeometry(h.comps[2].spec,f);assert.ok(b.outlines[0][2].y>a.outlines[0][2].y);
});
console.log(`${checks}/${checks} tests passed; max AB residual ${maxResidual} mm; tolerance ${SYRINGE_TOLERANCE_MM} mm`);
