// Pack M1 of docs/SDD-MOTOR-PART.md: actions planned on the motor-part shape (runEdit shape:'parts') keep today's results.
//   node test/motor-part-plans.mjs
// Over every built-in example with motors and the user fixtures:
//  a) delete each output body -> the motor stays as an independent motor, work normalizes and compiles, one undo restores deep-equal
//  b) delete each motor part -> the output part is ordinary (no motor data left), the motor is gone
//  c) copy each output body -> exactly one more part, no extra motor
//  d) release / return / leave and delete agree with the recorded results of the pre-M1 planners (test/fixtures/motor-plan-expected.json)
//  e) an edit that does not touch motors leaves every motor datum deep-equal on every example (no drift from the conversion)
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {check,report} from './_harness.mjs';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {motorRecords} from '../js/blocks/motor-roles.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {runEdit} from '../js/blocks/edit-pipeline.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
import {enterParts} from '../js/blocks/plan-shape.js';
import {isMotorPart} from '../js/blocks/motor-part.js';
import {planDelete,planDeleteParts} from '../js/blocks/delete-part.js';
import {planCopy} from '../js/blocks/member-copy.js';
import {planMotorRelease,planMotorReturn,planMotorLeave,offPlateMotors} from '../js/blocks/motor-release.js';
await loadIntegrity();await loadUnitStarts();

const FIXTURES=['motor-off-plate','delete-blocked','connected-resize','fourbar-drag-rocker','free-bar-blocks-motor'];
const works=[];
for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(structuredClone(e.snapshot));if(s)works.push([e.id,s]);}
for(const f of FIXTURES)works.push(['fx:'+f,normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`,import.meta.url),'utf8'))))]);
const ptsOf=w=>{try{return solveTopology(compileTopology(w.comps,{params:{...w.params}},new Set()),{thetaDeg:0,motorAngles:{1:0}}).points||{};}catch(e){return {};}};
const workOf=w=>({comps:w.comps,params:w.params,fabrication:w.fabrication,modules:w.modules||[],counter:900,points:ptsOf(w)});
const compiles=s=>{try{compileTopology(s.comps,{params:{...s.topo.params}},new Set());return true;}catch(e){return false;}};
// ---- canon: keep identical to the generator that recorded the expected file
const sortKeys=v=>Array.isArray(v)?v.map(sortKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys(v[k])])):v;
const canon=(r,before)=>{if(!r.ok)return 'REFUSED';const had=new Set(before.comps.map(c=>c.id));const fresh=r.comps.filter(c=>c.type==='motor'&&!had.has(c.id)).map(c=>c.id);
 let js=JSON.stringify(sortKeys({comps:[...r.comps].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),params:r.params,message:r.message}));for(const id of fresh)js=js.replaceAll(id,'@motor');return createHash('sha1').update(js).digest('hex').slice(0,16);};

function edit(w,plan){
  const S={comps:structuredClone(w.comps),modules:structuredClone(w.modules||[]),topo:{params:{...w.params},tracePoints:[],dimensions:[],loads:[]},fabrication:w.fabrication,counter:900,selectedLinkId:null,selectedTriangleId:null,selectedSliderId:null,selectedNodeId:null};
  const orig=JSON.stringify([S.comps,S.topo.params]),msgs=[],log={undo:0,snap:null};
  const ok=runEdit({name:'測試',shape:'parts',plan,host:{S,transient:m=>msgs.push(m),pushUndo(){log.undo++;log.snap=JSON.stringify([S.comps,S.topo.params]);},pause(){},rebuild(){},draw(){},points:ptsOf(w)}});
  return {S,ok,msgs,log,orig};
}
const motorCount=comps=>new Set(motorRecords(comps).filter(r=>r.centerId).map(r=>String(r.motor))).size;   // distinct motors (a motor's redundant point copies are not extra motors)
const bad={a:[],b:[],c:[],e:[]};let nA=0,nB=0,nC=0,nE=0,noMotor=0;

for(const [name,w] of works){
  const parts=enterParts({comps:w.comps,modules:w.modules});
  const motors=parts.comps.filter(isMotorPart);
  if(!motors.length){noMotor++;}
  for(const P of motors){
    const body=P.drives&&w.comps.find(c=>c.id===P.drives.body);
    const key=`${name}/${P.id}`;
    if(body?.type==='bar'){
      // a) delete the output body
      nA++;const r=edit(w,x=>planDeleteParts(x,{part:x.comps.find(c=>c.id===body.id),shared:[]}));
      const snap=normalizeSnapshot(toSnapshot(r.S.comps,{params:r.S.topo.params},r.S.counter,{fabrication:r.S.fabrication}));
      const kept=r.S.comps.find(c=>c.type==='motor'&&String(c.physicalMotor)===String(P.motor));
      const why=!r.ok?'refused: '+r.msgs.join('|'):r.S.comps.some(c=>c.id===body.id)?'bar still there':!kept?'no independent motor left':motorCount(r.S.comps)!==motorCount(w.comps)?'motor count changed'
        :!snap?'does not normalize':!compiles(r.S)?'does not compile':r.log.undo!==1||r.log.snap!==r.orig?'undo not exact':!/馬達留在/.test(r.msgs[0]||'')?'message: '+r.msgs.join('|'):'';
      if(why&&!(!r.ok&&/請先解除合成/.test(r.msgs[0]||'')))bad.a.push(`${key}: ${why}`);   // fused bars keep their existing refusal
    }
    // b) delete the motor itself (the output part becomes ordinary)
    nB++;{const r=edit(w,x=>planDeleteParts(x,{part:x.comps.find(c=>c.id===P.id),shared:[]}));
      const out=P.drives&&r.S.comps.find(c=>c.id===P.drives.body);
      const left=r.S.comps.some(c=>c.type==='motor'&&String(c.physicalMotor)===String(P.motor)&&c.p1?.id===P.p1.id);
      const odd=out&&(out.type==='bar'&&(out.isInput||out.physicalMotor||out.motorMount)||out.motorType&&out.type==='bar');
      const why=!r.ok?'refused: '+r.msgs.join('|'):left?'motor still there':P.drives&&!out?'output part lost':odd?'output still carries motor data':r.log.undo!==1||r.log.snap!==r.orig?'undo not exact':!compiles(r.S)?'does not compile':'';
      if(why)bad.b.push(`${key}: ${why}`);}
    // c) copy the output body (bars only: that is what the copy action accepts)
    if(body?.type==='bar'){
      nC++;const before=w.comps.length,r=planCopy({...workOf(w)},{id:body.id});
      const why=!r.ok?'refused: '+r.message:r.comps.length!==before+(Number((/整片 (\d+) 段/.exec(r.message)||[])[1])||1)?'not exactly one more part (a fused group copies as one group)':motorCount(r.comps)!==motorCount(w.comps)?'extra motor':'';
      if(why&&!/合成|伸縮|關/.test(r.message||''))bad.c.push(`${key}: ${why}`);}
  }
  // e) an edit that touches no motor leaves all motor data deep-equal
  nE++;{const target=w.comps.find(c=>!motors.some(P=>P.drives?.body===c.id)&&c.type!=='motor'&&!w.comps.some(o=>o.type==='motor'&&o.id===c.id));
    if(target){const r=edit(w,x=>({ok:true,comps:x.comps.map(c=>c.id===target.id?{...c,color:'#123456'}:c),params:x.params,clearSelection:false,pruneRefs:false,message:''}));
      let eq=r.ok;if(eq)try{assert.deepEqual(r.S.comps.filter(c=>c.id!==target.id),w.comps.filter(c=>c.id!==target.id));}catch(e){eq=false;}
      if(!eq)bad.e.push(`${name}: ${r.msgs.join('|')||'motor data drifted'}`);}}
}
check(`a) delete each output body (${nA}): motor stays as an independent motor, work normalizes and compiles, one undo restores exactly`,!bad.a.length,bad.a.slice(0,5).join(' ; '));
check(`b) delete each motor (${nB}): the output part is ordinary, the motor is gone, one undo restores exactly`,!bad.b.length,bad.b.slice(0,5).join(' ; '));
check(`c) copy each output body (${nC}): exactly one more part and no extra motor`,!bad.c.length,bad.c.slice(0,5).join(' ; '));
check(`e) an edit that touches no motor leaves motor data deep-equal on ${nE} works (${noMotor} without motors)`,!bad.e.length,bad.e.slice(0,5).join(' ; '));

// d) recorded results of the pre-M1 planners
const expected=JSON.parse(readFileSync(new URL('./fixtures/motor-plan-expected.json',import.meta.url),'utf8')).cases;
const off=[],seen=new Set();let nD=0;
const cmp=(k,r,w)=>{seen.add(k);nD++;if(!(k in expected))return off.push(`${k}: not recorded`);if(canon(r,w)!==expected[k])off.push(`${k}: ${r.ok?'result differs':'refused: '+r.message}`);};
for(const [name,w0] of works){
  const w=workOf(w0);
  for(const c of w.comps){
    if(c.type==='bar'&&c.isInput){let r;try{r=planMotorRelease(structuredClone(w),c.id,w.points,{});}catch(e){r={ok:false,message:String(e)};}if(`release:${name}:${c.id}` in expected)cmp(`release:${name}:${c.id}`,r,w);}
    if(['bar','gear','motor','triangle','slider'].includes(c.type)){const k=`delete:${name}:${c.id}`;if(k in expected){const wk=structuredClone(w);let r;try{r=planDelete(wk,{part:wk.comps.find(x=>x.id===c.id),shared:[]});}catch(e){r={ok:false,message:String(e)};}cmp(k,r,w);}}
  }
  for(const it of offPlateMotors(w.comps))for(const [k,fn] of [['back',planMotorReturn],['leave',planMotorLeave]]){const key=`${k}:${name}:${it.id}`;let r;try{r=fn(structuredClone(w),it.id);}catch(e){r={ok:false,message:String(e)};}cmp(key,r,w);}
}
const missing=Object.keys(expected).filter(k=>!seen.has(k));
check(`d) release / return / leave / delete equal the recorded pre-M1 results (${nD} cases)`,!off.length&&!missing.length,[...off.slice(0,5),...missing.slice(0,3).map(k=>'not run: '+k)].join(' ; '));
report('motor-part-plans');
