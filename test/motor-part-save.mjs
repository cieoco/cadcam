// Pack M2 of docs/SDD-MOTOR-PART.md: files and share links leave the app in the motor-part shape, every open path accepts both shapes.
//   node test/motor-part-save.mjs
// Per built-in example / fixture: toStoredShape -> storedProject (what downloadJson / buildShareUrl write) -> JSON text -> prepareMotorParts -> normalizeSnapshot (what pickWorkFile / the share boot do).
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {check,report} from './_harness.mjs';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import * as Store from '../js/blocks/storage.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {storedProject,readStoredProject,isMotorPartShape} from '../js/blocks/project-envelope.js';
import {motorRecords} from '../js/blocks/motor-roles.js';
import {pointKeysFor} from '../js/blocks/part-types.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {isMotorPart,LEGACY_MOTOR_FIELDS} from '../js/blocks/motor-part.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';

const clone=v=>structuredClone(v);
const saved=n=>{const x=clone(n);if(x.fabrication===null)delete x.fabrication;return x;};
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
const FIXTURES=['motor-off-plate','delete-blocked','connected-resize','fourbar-drag-rocker','free-bar-blocks-motor'];
await loadUnitStarts();
const works=[];
for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(s)works.push({name:e.id,W:saved(s)});}
for(const f of FIXTURES){const raw=JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`,import.meta.url),'utf8')),s=normalizeSnapshot(clone(raw));if(s)works.push({name:`fixture:${f}`,W:saved(s)});}

// the writers' exact output: downloadJson -> JSON.stringify(storedProject(x),null,2); buildShareUrl -> encodeSnapshot(storedProject(x))
// toSnapshot output carries kind/v (normalizeSnapshot output does not); the writers get the toSnapshot form
const asSnap=W=>({kind:'blocks',v:1,...clone(W)});
const fileText=async W=>JSON.stringify(storedProject(await Store.toStoredShape(asSnap(W))),null,2);
const openText=async t=>{const raw=JSON.parse(t);await Store.prepareMotorParts(raw);const n=normalizeSnapshot(raw);return n&&saved(n);};
const shareOut=async W=>encodeSnapshot(storedProject(await Store.toStoredShape(asSnap(W))));
const openShare=async s=>{const raw=decodeShareString(s);await Store.prepareMotorParts(raw);const n=normalizeSnapshot(raw);return n&&saved(n);};
const solveSig=(W,motor,deg)=>{
  try{const r=solveAssembly(compileAssembly(W.comps,W.modules,{params:W.params}),{thetaDeg:deg,motorAngles:{[motor]:deg}});return JSON.stringify({ok:r?.isValid,under:r?.isUnderconstrained,points:r?.points});}
  catch(e){return 'ERR '+String(e.message).split('\n')[0];}
};
// the documented redundancy (SDD-MOTOR-PART 8, M0): physicalMotor copies on non-owner points sharing a shaft id are not restored
const copyPaths=(A,B)=>{const out=[];for(const a of A.comps){const b=B.comps.find(c=>c.id===a.id);if(!b)continue;for(const k of pointKeysFor(a))if(a[k]?.physicalMotor!==undefined&&b[k]?.physicalMotor===undefined)out.push(`${a.id}.${k}`);}return out;};
const dropCopies=(A,paths)=>{const x=clone(A);for(const p of paths){const [id,k]=p.split('.');delete x.comps.find(c=>c.id===id)[k].physicalMotor;}return x;};

const fails={flag:[],legacyOnPart:[],data:[],solve:[],share:[],noMotorBytes:[],shape:[]};
let withMotors=0,withoutMotors=0,sweeps=0;const copyList=[];
for(const {name,W} of works){
  const text=await fileText(W),file=JSON.parse(text),comps=(file.kind==='blocks-envelope'?file.project:file).comps;
  const parts=comps.filter(isMotorPart),hasFlag=file.kind==='blocks-envelope'&&file.requires.includes('motor-part-v2');
  const expectMotors=motorRecords(W.comps).some(r=>r.centerId&&!(W.comps.find(c=>c.id===r.ownerId)?.style==='piston'||W.comps.find(c=>c.id===r.ownerId)?.type==='slider'));
  if(parts.length){
    withMotors++;
    if(!hasFlag)fails.flag.push(name);
    for(const c of comps){if(isMotorPart(c))continue;const left=LEGACY_MOTOR_FIELDS.filter(k=>c[k]!==undefined);if(c.isInput&&c.type!=='slider'&&c.style!=='piston')left.push('isInput');if(left.length)fails.legacyOnPart.push(`${name}/${c.id}:${left}`);}
    const B=await openText(text);
    if(!B){fails.data.push(name+': not opened');continue;}
    const paths=copyPaths(W,B);copyList.push(...paths.map(p=>`${name}/${p}`));
    if(!same(dropCopies(W,paths),B))fails.data.push(name);
    const motors=[...new Set(parts.map(p=>String(p.motor)))];
    for(const m of motors)for(let i=0;i<12;i++){sweeps++;if(solveSig(W,m,i*30)!==solveSig(B,m,i*30)){fails.solve.push(`${name} M${m}@${i*30}`);break;}}
    const S2=await openShare(await shareOut(W));
    if(!S2||!same(dropCopies(W,copyPaths(W,S2)),S2)||!same(S2,B))fails.share.push(name);
  }else{
    withoutMotors++;
    if(expectMotors)fails.shape.push(`${name}: has convertible motors but none written as motor parts`);
    if(hasFlag||text!==JSON.stringify(storedProject(asSnap(W)),null,2))fails.noMotorBytes.push(name);
    const B=await openText(text);if(!same(B,W))fails.data.push(name+' (no motor)');
  }
}
check(`written file carries motor-part-v2 whenever it has motor parts (${withMotors} works with motors)`,!fails.flag.length&&withMotors>0,fails.flag.join('; '));
check('written file: no legacy motor field on non-motor parts',!fails.legacyOnPart.length,fails.legacyOnPart.slice(0,5).join('; '));
check(`every work with a rotary motor is written with motor parts`,!fails.shape.length,fails.shape.join('; '));
check('save -> open: data deep-equal except the documented point copies',!fails.data.length,fails.data.join('; '));
check(`save -> open: solve identical at 12 angles per motor (${sweeps} sweeps)`,!fails.solve.length,fails.solve.join('; '));
check('share encode -> decode -> open equals file save -> open',!fails.share.length,fails.share.join('; '));
check(`works without motors (${withoutMotors}): no flag, JSON identical to today's writer, open unchanged`,!fails.noMotorBytes.length&&withoutMotors>0,fails.noMotorBytes.join('; '));
check('the only fields that differ after save -> open are exactly these 8 redundant point copies',copyList.join()==='tipping-bucket/LeftSide.p1,gear-gripper/LeftJaw.p1,jansen-leg/Anchor2.p1,assembly-lift-gripper/LeftJaw.p1,assembly-lift-gripper-practice/LeftJaw.p1,clawbot-lift-gripper/LeftJaw.p1,clawbot-lift-gripper-practice/LeftJaw.p1,unit7-start/LeftSide.p1',copyList.join());
console.log(`  differing fields after save -> open (physicalMotor copies on non-owner points): ${copyList.length}: ${copyList.join(', ')}`);

// today's shape still opens: every blocks fixture file, plain and as envelope, through the same open path
{
  const dir=new URL('./fixtures/',import.meta.url),bad=[];let n=0;
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.json'))){
    let raw;try{raw=JSON.parse(readFileSync(new URL(f,dir),'utf8'));}catch{continue;}
    if(!raw||!Array.isArray(raw.comps))continue;n++;
    const want=normalizeSnapshot(clone(raw));
    const raw2=clone(raw);await Store.prepareMotorParts(raw2);
    if(!same(normalizeSnapshot(raw2),want))bad.push(f);
    const env=storedProject(clone(raw));if(env!==raw&&env.kind==='blocks-envelope'){const e2=clone(env);await Store.prepareMotorParts(e2);if(!same(normalizeSnapshot(e2),want))bad.push(f+' (envelope)');}
  }
  check(`today's-shape files open to the same data as before (${n} fixture files)`,!bad.length&&n>0,bad.join('; '));
}
// autosave keeps today's shape (never leaves the machine) and restores
{
  const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const w=works.find(w=>w.name==='competition-fourbar-lift').W;Store.saveLocal(asSnap(w));
  const text=[...store.values()][0],raw=JSON.parse(text);
  check('autosave stores today\'s shape: no motor-part-v2, no motor part',!text.includes('motor-part-v2')&&!(raw.comps||raw.project?.comps||[]).some(isMotorPartShape));
  check('autosave restores',same(saved(normalizeSnapshot(Store.loadLocal())),w));
  delete globalThis.localStorage;
}
// the real share url functions
{
  globalThis.location={origin:'http://x',pathname:'/blocks.html',hash:''};
  const w=works.find(w=>w.name==='fixture:fourbar-drag-rocker').W,url=Store.buildShareUrl(await Store.toStoredShape(asSnap(w)));
  globalThis.location.hash=new URL(url).hash;
  const hash=Store.readShareFromHash();await Store.prepareMotorParts(hash);
  check('buildShareUrl -> readShareFromHash: envelope with motor-part-v2, opens to the same work',hash.kind==='blocks-envelope'&&hash.requires.includes('motor-part-v2')&&same(dropCopies(w,copyPaths(w,saved(normalizeSnapshot(hash)))),saved(normalizeSnapshot(hash))));
  delete globalThis.location;
}
// refusals
{
  const w=works.find(w=>w.name==='fixture:fourbar-drag-rocker').W,file=JSON.parse(await fileText(w)),proj=file.project;
  const owner=proj.comps.find(c=>c.id===proj.comps.find(isMotorPart).drives.body);
  const mixed=clone(file);mixed.project.comps.find(c=>c.id===owner.id).physicalMotor='1';
  await Store.prepareMotorParts(mixed);
  let msg='';try{normalizeSnapshot(mixed);}catch(e){msg=e.message;}
  check('hand-edited mixed file (motor part + legacy field on its output) is refused with a plain message',msg.includes(owner.id)&&msg.includes('physicalMotor'),msg);
  const mixed2=clone(file);mixed2.project.comps.find(c=>c.id===owner.id).isInput=true;
  await Store.prepareMotorParts(mixed2);let msg2='';try{normalizeSnapshot(mixed2);}catch(e){msg2=e.message;}
  check('same for a driven bar still marked isInput',msg2.includes(owner.id));
  const oldReader=clone(file);oldReader.requires=['motor-part-v3'];
  check('an unknown newer flag is still refused by the envelope reader',readStoredProject(oldReader)===null);
  check('the motor-part-v2 flag alone is accepted by the envelope reader',(()=>{const e=clone(file);e.requires=['motor-part-v2'];return readStoredProject(e)!==null;})());
}
report('motor-part-save');
