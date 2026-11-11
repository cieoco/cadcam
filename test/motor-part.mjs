// Pack M0 of docs/SDD-MOTOR-PART.md: the pure converter js/blocks/motor-part.js (legacy motor data <-> independent motor parts).
//   node test/motor-part.mjs
// Over every built-in example (lazy ones included), the user fixtures and a few synthetic works:
//  a) toLegacy(toMotorParts(W)) equals W after normalizeSnapshot on both sides (known redundant point copies are listed, nothing else may differ)
//  b) idempotence, c) no legacy motor field left on non-motor parts, d) compile + solve identical at 12 angles per motor,
//  e) motorFacts agrees with motorRecords, f) explicit cases (plate, independent, riding, gear, two motors, off-plate).
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {check,report} from './_harness.mjs';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {motorRecords} from '../js/blocks/motor-roles.js';
import {pointKeysFor} from '../js/blocks/part-types.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {toMotorParts,toLegacy,motorFacts,isMotorPart,LEGACY_MOTOR_FIELDS} from '../js/blocks/motor-part.js';
import {offPlateMotors,planMotorRelease} from '../js/blocks/motor-release.js';

const clone=v=>structuredClone(v);
// normalizeSnapshot output is a fixed point of normalizeSnapshot once its explicit null fabrication is dropped: that is "today's shape" as saved.
const saved=n=>{const x=clone(n);if(x.fabrication===null)delete x.fabrication;return x;};
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
const FIXTURES=['motor-off-plate','delete-blocked','connected-resize','fourbar-drag-rocker','free-bar-blocks-motor'];
await loadUnitStarts();

const works=[];
for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(s)works.push({name:e.id,kind:'example',raw:clone(e.snapshot),W:saved(s)});}
for(const f of FIXTURES){const raw=JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`,import.meta.url),'utf8')),s=normalizeSnapshot(clone(raw));if(s)works.push({name:`fixture:${f}`,kind:'fixture',raw,W:saved(s)});}
// synthetic: an independent motor that never had an output (released from a real example) and a hand written one on the world frame
{
  const base=works.find(w=>w.name==='motor-plate-tt').W,pts={};base.fabrication=base.fabrication??null;
  const rel=planMotorRelease({comps:clone(base.comps),params:{...base.params},fabrication:base.fabrication,modules:base.modules},'ServoArm',pts,{});
  if(rel.ok)works.push({name:'synthetic:released-motor',kind:'synthetic',W:saved(normalizeSnapshot({...clone(base),comps:rel.comps,params:rel.params}))});
  const hand=normalizeSnapshot({kind:'blocks',comps:[
    {type:'motor',id:'MotorA',p1:{id:'MotorA.A',type:'fixed',x:10,y:20},physicalMotor:'3',motorType:'mg995',servoStart:-20,servoEnd:40,motorMount:{motor:'3',center:'MotorA.A',face:'back',orientation:'vertical',angleDeg:15,reversed:true}},
    {type:'bar',id:'Free',p1:{id:'F1',type:'floating',x:0,y:0},p2:{id:'F2',type:'floating',x:30,y:0},lenParam:'LF',isInput:false,fixedLen:true}],params:{LF:30}});
  works.push({name:'synthetic:hand-independent',kind:'synthetic',W:saved(hand)});
}

const sumNames=(m,k,n)=>{(m[k]??=[]).push(n);};
const cases={},fails={roundTrip:[],idem:[],legacyLeft:[],solve:[],facts:[],stray:[],partOnly:[]};
const diffs={copiesAdded:[],copiesTotal:0,where:[]};
let motorsTotal=0,motorlessWorks=0,solvedFrames=0;
const strip=(s,centers)=>{const x=clone(s);for(const c of x.comps)for(const k of pointKeysFor(c))if(c[k]&&centers.has(c[k].id))delete c[k].physicalMotor;return x;};
const sameFacts=(f,recs)=>{
  const group=recs.filter(r=>r.centerId===f.centerId);
  return group.some(r=>String(r.motor)===f.motor&&r.type===f.type&&(r.independent?f.bodyId===null:r.ownerId===f.bodyId)&&r.phaseOffset===f.phaseOffset
    &&r.carrierId===f.carrierId&&r.frameBodyId===f.frameBodyId);
};
const solveSig=(W,motor,deg)=>{
  try{
    const asm=compileAssembly(W.comps,W.modules,{params:W.params});
    const r=solveAssembly(asm,{thetaDeg:deg,motorAngles:{[motor]:deg}});
    return JSON.stringify({ok:r?.isValid,under:r?.isUnderconstrained,points:r?.points});
  }catch(e){return 'ERR '+String(e.message).split('\n')[0];}
};

for(const {name,kind,W,raw} of works){
  const recs=motorRecords(W.comps).filter(r=>r.centerId);
  const centers=new Set(recs.map(r=>r.centerId));
  const P=toMotorParts(W),L=toLegacy(P),facts=motorFacts(P);
  motorsTotal+=facts.length;if(!facts.length)motorlessWorks++;
  // a) round trip
  const A=normalizeSnapshot(clone(W)),B=normalizeSnapshot(clone(L));if(!A){fails.roundTrip.push(name+": W does not re-normalize");continue;}
  if(!B||!same(A,B)){
    const A2=strip(A,centers),B2=B&&strip(B,centers);
    if(B&&same(A2,B2)){diffs.copiesAdded.push(name);}
    else fails.roundTrip.push(name);
  }
  for(const c of W.comps){if(facts.some(f=>f.bodyId===c.id)||c.type==='motor')continue;
    for(const k of pointKeysFor(c))if(c[k]&&centers.has(c[k].id)&&c[k].physicalMotor!==undefined){diffs.copiesTotal++;diffs.where.push(`${name}/${c.id}.${k}`);}}
  // the same on the raw (not yet normalized) input of the example / fixture
  if(raw){const R1=normalizeSnapshot(clone(raw)),R2=normalizeSnapshot(clone(toLegacy(toMotorParts(raw))));
    if(!R2||!(same(R1,R2)||same(strip(R1,centers),strip(R2,centers))))fails.roundTrip.push(`${name}: raw input`);}
  // exact checks of the fields the shared-point rule does not touch: owner shaft points keep physicalMotor
  for(const r of recs){if(!facts.some(f=>f.centerId===r.centerId&&(r.independent?f.bodyId===null:f.bodyId===r.ownerId)))continue;   // copy-only owners (a triangle sharing the shaft) are not the motor's output
    const o=B?.comps.find(c=>c.id===r.ownerId);if(!o)continue;
    const p=pointKeysFor(o).map(k=>o[k]).find(p=>p?.id===r.centerId);if(!p||String(p.physicalMotor)!==r.motor)fails.roundTrip.push(`${name}: shaft ${r.centerId} lost physicalMotor`);}
  // b) idempotence
  if(!same(toMotorParts(P),P)||!same(toLegacy(L),L)||!same(toLegacy(toLegacy(P)),L))fails.idem.push(name);
  // c) no legacy motor field on non-motor parts
  for(const c of P.comps){
    if(isMotorPart(c)){if(pointKeysFor(c).some(k=>c[k]&&c[k].physicalMotor!==undefined))fails.legacyLeft.push(`${name}/${c.id} point`);continue;}
    const left=LEGACY_MOTOR_FIELDS.filter(k=>c[k]!==undefined);if(c.isInput)left.push('isInput');
    for(const k of pointKeysFor(c))if(c[k]?.physicalMotor!==undefined)left.push(`${k}.physicalMotor`);
    if(left.length)fails.legacyLeft.push(`${name}/${c.id}: ${left.join(',')}`);
  }
  // data the converter does not restore (SDD limitation 2) must not occur in the covered data
  for(const r of recs){const o=W.comps.find(c=>c.id===r.ownerId);if(o&&o.type!=='bar'&&o.type!=='motor'&&o.physicalMotor!==undefined)fails.partOnly.push(`${name}/${o.id}`);}
  // every legacy owner converted, every fact has a source
  if(facts.length!==new Set(recs.map(r=>r.centerId)).size)fails.stray.push(`${name}: ${facts.length} facts vs ${new Set(recs.map(r=>r.centerId)).size} shafts`);
  // e) facts vs motorRecords
  for(const f of facts)if(!sameFacts(f,recs))fails.facts.push(`${name}/${f.id}`);
  // d) compile + solve at 12 angles for every motor (a work without a motor: theta only)
  const motorsOf=[...new Set(facts.map(f=>f.motor))];if(!motorsOf.length)motorsOf.push('1');
  for(const m of motorsOf)for(let i=0;i<12;i++){
    const deg=i*30,x=solveSig(W,m,deg),y=solveSig(L,m,deg);solvedFrames++;
    if(x!==y){fails.solve.push(`${name} M${m} @${deg}`);break;}
  }
  // f) cases
  const compOf=id=>W.comps.find(c=>c.id===id)||P.comps.find(c=>c.id===id);
  for(const f of facts){
    const body=f.bodyId&&compOf(f.bodyId),frame=f.frameBodyId&&compOf(f.frameBodyId);
    if(frame?.standardBlank&&body?.type==='bar')sumNames(cases,'plate + output bar',name);
    if(f.bodyId===null)sumNames(cases,'independent, no output',name);
    if(f.carrierId)sumNames(cases,'riding motor (motorCarrier)',name);
    if(body?.type==='gear')sumNames(cases,'gear output',name);
    if(body&&['pulley','cam','triangle'].includes(body.type))sumNames(cases,`${body.type} output`,name);
    if(f.type==='mg995')sumNames(cases,'servo (mg995) range',name);
    if(body&&!f.frameBodyId&&!f.carrierId)sumNames(cases,'world frame, output bar/part',name);
  }
  if(facts.length>=2)sumNames(cases,'two or more motors in one work',name);
  if(offPlateMotors(W.comps).length){
    sumNames(cases,'shaft off its plate hole',name);
    const keep=offPlateMotors(L.comps);
    const want=offPlateMotors(W.comps);
    if(!(keep.length===want.length&&keep.every((k,i)=>k.id===want[i].id&&k.shaft.x===want[i].shaft.x&&k.shaft.y===want[i].shaft.y&&k.world.x===want[i].world.x)))fails.roundTrip.push(`${name}: off-plate inconsistency not preserved`);
  }
}

check(`a) round trip equals W after normalizeSnapshot (${works.length} works)`,!fails.roundTrip.length,fails.roundTrip.join('; '));
check(`b) idempotent: toMotorParts twice = once, toLegacy twice = once`,!fails.idem.length,fails.idem.join('; '));
check(`c) no legacy motor field left on non-motor parts`,!fails.legacyLeft.length,fails.legacyLeft.slice(0,6).join('; '));
check(`c2) no covered work needs the unrestored part-level physicalMotor of gear/pulley/triangle/cam`,!fails.partOnly.length,fails.partOnly.join('; '));
check(`d) compile + solve identical, 12 angles per motor (${solvedFrames} sweeps)`,!fails.solve.length,fails.solve.join('; '));
check(`e) motorFacts agrees with motorRecords (centre, body, motor, type, phase, carrier, frame)`,!fails.facts.length,fails.facts.join('; '));
check(`e2) one motor part per shaft`,!fails.stray.length,fails.stray.join('; '));

// f) explicit expectations
const need=(label)=>check(`f) case covered: ${label}`,(cases[label]||[]).length>0,(cases[label]||[]).slice(0,4).join(', '));
['plate + output bar','independent, no output','riding motor (motorCarrier)','gear output','two or more motors in one work','shaft off its plate hole','servo (mg995) range','world frame, output bar/part'].forEach(need);
{
  const w=works.find(w=>w.name==='fixture:motor-off-plate').W,P=toMotorParts(w),L=toLegacy(P);
  const f=motorFacts(P)[0],shaft=P.comps.find(c=>c.id===f.bodyId)?.[['p1','p2'].find(k=>P.comps.find(c=>c.id===f.bodyId)?.[k]?.id===f.centerId)];
  check('f) off-plate: motor part keeps the stored shaft position (not "fixed" to the plate hole)',f.point.x===shaft.x&&f.point.y===shaft.y&&offPlateMotors(L.comps).length===offPlateMotors(w.comps).length);
}
{
  const w=works.find(w=>w.name==='competition-fourbar-lift').W,P=toMotorParts(w),facts=motorFacts(P);
  check('f) two motors: numbers 1 and 2 survive, the riding one keeps its carrier and phase',facts.map(f=>f.motor).sort().join()==='1,2'&&facts.some(f=>f.motor==='2'&&f.carrierId==='LiftUpright'&&f.phaseOffset===-90));
}
{
  const w=works.find(w=>w.name==='synthetic:hand-independent').W,P=toMotorParts(w),m=P.comps.find(c=>c.id==='MotorA');
  check('f) independent motor with servo range maps to the target shape and back',isMotorPart(m)&&!m.drives&&m.motor==='3'&&m.servoStart===-20&&m.mount.reversed===true&&m.p1.physicalMotor===undefined&&same(normalizeSnapshot(toLegacy(P)),normalizeSnapshot(clone(w))));
}
{
  // generated ids cannot collide: two driven motors without partId get distinct, unused ids
  const w=works.find(w=>w.name==='competition-fourbar-lift').W,P=toMotorParts(w),ids=P.comps.map(c=>c.id);
  check('generated motor part ids are unique and not point ids',new Set(ids).size===ids.length&&motorFacts(P).every(f=>f.id.startsWith('Motor.')&&!P.comps.some(c=>pointKeysFor(c).some(k=>c[k]?.id===f.id))));
}

const names=a=>[...new Set(a)];
console.log(`\ncoverage: ${works.length} works (${works.filter(w=>w.kind==='example').length} examples, ${works.filter(w=>w.kind==='fixture').length} fixtures, ${works.filter(w=>w.kind==='synthetic').length} synthetic), ${motorsTotal} motors, ${motorlessWorks} works without a motor, ${solvedFrames} solved sweeps`);
for(const [k,v] of Object.entries(cases))console.log(`  ${k}: ${names(v).length} works`);
console.log(`known difference (physicalMotor copies on non-owner points not restored): ${names(diffs.copiesAdded).length} works, ${diffs.copiesTotal} points: ${diffs.where.join(', ')}`);
report('motor-part');
