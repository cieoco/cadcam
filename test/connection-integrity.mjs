// Pack C0 (tests first) of docs/SDD-CONNECTION-INTEGRITY.md.
// Written against the API contract for js/blocks/relations.js and js/blocks/integrity.js; both are implemented in
// pack C1. Until they exist this file reports "MISSING MODULE ..." and exits 1 -- by design.
//
//   js/blocks/relations.js  buildRelations(work) -> { copiesOf, worldOf, holeRoles, isGround, motorOf, attachmentsOf, isFreeBody }
//   js/blocks/integrity.js  checkWork(work, relations?) -> [{ code:'I1'..'I9', severity, parts:[compId], ids:[pointOrHoleId], message }]
//
// `work` = { comps, modules, topo } where the snapshot fields (params, tracePoint(s), activeMotor, motorAngles ...) are
// present BOTH at top level and inside `topo` (the exporters pass `{...snapshot, topo: snapshot}`), so an implementation
// may read either. Tests assert code / severity / parts / ids and that `message` is non-empty Traditional Chinese naming
// the part; they never assert exact wording.
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {check,report} from './_harness.mjs';

const ROOT=new URL('../',import.meta.url);
const MODULES=['js/blocks/relations.js','js/blocks/integrity.js'];
const loaded={};
for(const rel of MODULES){
  try{loaded[rel]=await import(new URL(rel,ROOT).href);}
  catch(e){
    // Missing file => one clear line. A file that exists but fails to load is reported as such (first line only).
    if(!existsSync(fileURLToPath(new URL(rel,ROOT))))check(`MISSING MODULE ${rel}`,false);
    else check(`MODULE LOAD ERROR ${rel}`,false,String(e?.message||e).split('\n')[0]);
  }
}
if(Object.keys(loaded).length<MODULES.length)report('connection-integrity'); // exits non-zero; nothing below runs
const {buildRelations}=loaded[MODULES[0]],{checkWork}=loaded[MODULES[1]];

const {BLOCK_EXAMPLES,loadUnitStarts}=await import('../js/blocks/examples.js');
const {normalizeSnapshot,alignSavedInputPhase}=await import('../js/blocks/schema.js');
const {compileAssembly,solveAssembly}=await import('../js/blocks/assembly.js');
const {machinedComps}=await import('../js/blocks/used-holes.js');
const {diskTurntableSnapshot}=await import('../js/blocks/disk-turntable-example.js');
await loadUnitStarts(); // unit*-start examples are registered lazily

// ---------------------------------------------------------------- helpers
const clone=v=>structuredClone(v);
const KEYS=['p1','p2','p3','m1','m2'];
const fixtureDir=new URL('./fixtures/',import.meta.url);
const readJson=rel=>JSON.parse(readFileSync(new URL(rel,fixtureDir),'utf8'));
const asWork=s=>{const {_note,_base,...rest}=s;return {...rest,topo:{...rest}};};
const normalized=raw=>{const s=normalizeSnapshot(clone(raw));if(!s)throw Error('normalizeSnapshot returned null');return s;};
const exWork=id=>{const e=BLOCK_EXAMPLES.find(e=>e.id===id);if(!e)throw Error(`no example ${id}`);return asWork(normalized(e.snapshot));};
const userWork=name=>asWork(normalized(readJson(`${name}.json`))); // user files are blocks-envelope; normalizeSnapshot unwraps them
const fixture=name=>readJson(`integrity/${name}.json`);
const fxWork=name=>asWork(fixture(name));
const baseWork=fx=>{
  const b=fx._base;if(!b)return null;
  if(b.example)return exWork(b.example);
  if(b.snapshot==='disk-turntable')return asWork(normalized(diskTurntableSnapshot));
  return null;
};
const comp=(w,id)=>w.comps.find(c=>c.id===id);
const display=(w,id)=>comp(w,id)?.name?.trim()||id;
const rel=w=>buildRelations(w);
const run=w=>{const r=checkWork(w,rel(w));if(!Array.isArray(r))throw Error('checkWork must return an array');return r;};
const fmt=i=>`${i.code}/${i.severity} parts=[${i.parts}] ids=[${i.ids}]`;
const SEVERITIES=['contradiction','dangling','notice'];
const BAD=i=>i.severity==='contradiction'||i.severity==='dangling';
const firstLine=e=>String(e?.message||e).split('\n')[0];

// Shape of one issue; returns '' when fine, else a reason.
function shapeProblem(i,w){
  if(!i||typeof i!=='object')return 'issue is not an object';
  if(!/^I[1-9]$/.test(i.code))return `bad code ${i.code}`;
  if(!SEVERITIES.includes(i.severity))return `bad severity ${i.severity}`;
  if(!Array.isArray(i.parts)||!Array.isArray(i.ids))return `${i.code}: parts/ids must be arrays`;
  if(typeof i.message!=='string'||!i.message.trim())return `${i.code}: empty message`;
  if(!/[一-鿿]/.test(i.message))return `${i.code}: message is not Chinese: ${i.message}`;
  if(/\n\s+at |Error:|undefined|\[object/.test(i.message))return `${i.code}: message leaks internals: ${i.message}`;
  if(i.parts.length&&!i.parts.some(p=>i.message.includes(display(w,p))))return `${i.code}: message does not name its part (${i.parts.map(p=>display(w,p))}): ${i.message}`;
  return '';
}
// Test wrapper: fn returns true to pass or a string explaining the failure. Exceptions become failures, never crashes.
function t(name,fn){
  try{const r=fn();check(name,r===true,r===true?'':String(r));}
  catch(e){check(name,false,'exception: '+firstLine(e));}
}

// KNOWN: built-in examples that genuinely violate a rule. { exampleId: { codes:[...], reason:'...' } }.
// Empty on purpose: C1 must either fix the data, fix the rule, or add an entry here with a reason. Never silently pass.
const KNOWN={};
// PARITY_EXCEPTIONS: places where holeRoles().machining deliberately differs from used-holes.js today.
// [{ example:'id'|'file:name', compId, holeId, reason }]. Starts empty.
const PARITY_EXCEPTIONS=[];

const isKnown=(exampleId,code)=>!!KNOWN[exampleId]?.codes.includes(code);

// ---------------------------------------------------------------- counterexamples
// Each case: the damaged work must yield a matching issue, with a well-formed Chinese message, and its unedited base
// (when there is one) must NOT already yield that code, so the issue really comes from the edit.
function expectIssue(w,spec,fx){
  const issues=run(w);
  const sevs=[].concat(spec.severity||SEVERITIES);
  const hit=issues.filter(i=>i.code===spec.code&&sevs.includes(i.severity)
    &&(!spec.partsAny||i.parts.some(p=>spec.partsAny.includes(p)))
    &&(!spec.idsAny||i.ids.some(x=>spec.idsAny.includes(x))));
  if(!hit.length)return `no ${spec.code}${spec.severity?'/'+sevs.join('|'):''} issue naming parts ${JSON.stringify(spec.partsAny||'*')} ids ${JSON.stringify(spec.idsAny||'*')}; got [${issues.map(fmt).join('; ')}]`;
  for(const i of hit){const p=shapeProblem(i,w);if(p)return p;}
  if(fx?._base&&!(fx._base.example&&isKnown(fx._base.example,spec.code))){
    const bw=baseWork(fx),bad=bw&&run(bw).filter(i=>i.code===spec.code&&BAD(i));
    if(bad?.length)return `unedited base already has ${spec.code}: ${bad.map(fmt).join('; ')}`;
  }
  if(spec.control){
    const cw=clone(w);spec.control(cw);const again=run(cw).filter(i=>i.code===spec.code&&BAD(i)&&(!spec.partsAny||i.parts.some(p=>spec.partsAny.includes(p))));
    if(again.length)return `control (edit undone) still has ${spec.code}: ${again.map(fmt).join('; ')}`;
  }
  return true;
}
const CASES=[
  // I1 ---------------------------------------------------------------
  {name:'I1 user file motor-off-plate: Blank135.p2 (id Blank133_H24_32) is ~75 mm from that plate hole',
   work:()=>{const w=userWork('motor-off-plate'),plate=comp(w,'Blank133'),h=plate.standardBlank.mountHoles.find(h=>h.id==='Blank133_H24_32'),p=comp(w,'Blank135').p2;
     // precondition: the fixture still shows the defect (hole at (24,32) in plate frame is ~(-72.8,221.3))
     const d=Math.hypot(p.x+72.802,p.y-221.313);if(!(h&&p.id===h.id&&d>70&&d<80))throw Error(`fixture precondition: distance ${d}`);return w;},
   spec:{code:'I1',severity:'contradiction',partsAny:['Blank135','Blank133'],idsAny:['Blank133_H24_32']}},
  {name:'I1 synthetic: two bars sharing end id J with copies 5 mm apart',fixture:'i1-shared-end-5mm',
   spec:{code:'I1',severity:'contradiction',partsAny:['Bar1','Bar2'],idsAny:['J'],control:w=>{comp(w,'Bar2').p1.x=100;comp(w,'Bar2').p1.y=0;}}},
  // I2 ---------------------------------------------------------------
  {name:'I2 same point id (O1) carries physicalMotor 1 and 2',fixture:'i2-conflicting-motors',
   spec:{code:'I2',severity:'contradiction',partsAny:['Anchor1','LiftCrank'],idsAny:['O1'],control:w=>{comp(w,'Anchor1').p1.physicalMotor='1';}}},
  // I3 ---------------------------------------------------------------
  {name:'I3 motorMount.frameBody names a comp that does not exist -> dangling',fixture:'i3-frame-body-missing',
   spec:{code:'I3',severity:'dangling',partsAny:['ServoArm'],control:w=>{comp(w,'ServoArm').motorMount.frameBody='ServoPlate';}}},
  {name:'I3 motorCarrier and motorMount.frameBody both present but different -> contradiction',fixture:'i3-carrier-frame-differ',
   spec:{code:'I3',severity:'contradiction',partsAny:['ToolPlate'],control:w=>{comp(w,'ToolPlate').motorMount.frameBody='LiftUpright';}}},
  {name:'I3 two motors share one motorMount.partId',fixture:'i3-duplicate-part-id',
   spec:{code:'I3',partsAny:['LiftCrank','ToolPlate'],control:w=>{comp(w,'LiftCrank').motorMount.partId='Motor2';}}},
  // I4 ---------------------------------------------------------------
  {name:'I4 world-frame input bar: saved angle 40 deg but phaseOffset 0 (fourbar-crank-rocker edit)',fixture:'i4-phase-mismatch',
   spec:{code:'I4',partsAny:['Link1']}},
  {name:'I4 user file connected-resize: phaseOffset 0 vs saved angle 131 deg',
   work:()=>{const w=userWork('connected-resize');if(comp(w,'Blank135').phaseOffset!==0)throw Error('fixture precondition: phaseOffset');return w;},
   spec:{code:'I4'}},
  // I5 ---------------------------------------------------------------
  {name:'I5 syringe a.componentId names a missing comp -> dangling',fixture:'i5-syringe-missing-comp',
   spec:{code:'I5',severity:'dangling',partsAny:['H1Syringe'],control:w=>{comp(w,'H1Syringe').a.componentId='H1Frame';}}},
  {name:'I5 topo.tracePoint(s) name a missing point -> dangling',fixture:'i5-trace-point-missing',
   spec:{code:'I5',severity:'dangling',idsAny:['GhostPoint']}},
  {name:'I5 motorCarrier names a deleted comp -> dangling',fixture:'i5-carrier-deleted',
   spec:{code:'I5',severity:'dangling',partsAny:['ToolPlate'],control:w=>{comp(w,'ToolPlate').motorCarrier='LiftUpright';}}},
  // I6 / I7 (damage is applied after normalizeSnapshot, which would reject or rename these) -----------
  {name:'I6 two comps with the same id (raw data, normalizeSnapshot not re-applied)',fixture:'i6-duplicate-comp-id',
   spec:{code:'I6',partsAny:['LiftFollower']}},
  {name:'I7 bar whose p1.id === p2.id',fixture:'i7-bar-same-end-id',
   spec:{code:'I7',partsAny:['LiftUpright']}},
  {name:'I7 two local holes of one comp share an id (raw data; normalizeSnapshot returns null for this)',fixture:'i7-duplicate-hole-id',
   spec:{code:'I7',partsAny:['ServoArm']}},
  // I8 ---------------------------------------------------------------
  {name:'I8 barFusion root lists a missing member',fixture:'i8-fusion-missing-member',
   spec:{code:'I8',partsAny:['ScissorUp0']}},
  {name:'I8 barFusion points disagree with member geometry',fixture:'i8-fusion-points-disagree',
   spec:{code:'I8',partsAny:['ScissorDown0']}},
  // I9 ---------------------------------------------------------------
  {name:'I9 syringe end on an existing disk but (u,v) lies outside its outline',fixture:'i9-syringe-outside-part',
   spec:{code:'I9',partsAny:['H7Syringe','H7Frame']}},
];
for(const c of CASES){
  t(c.name,()=>{
    const fx=c.fixture?fixture(c.fixture):null,w=c.work?c.work():asWork(fx);
    return expectIssue(w,c.spec,fx);
  });
}

// ---------------------------------------------------------------- legitimate positives
const noBad=(w,label)=>{const bad=run(w).filter(BAD);return bad.length?`${label}: ${bad.map(fmt).join('; ')}`:true;};

t('P1 every built-in example (incl. lazily registered unit starts): zero contradiction / dangling, messages well formed',()=>{
  const bad=[],notices=new Map();let n=0,shape='';
  for(const e of BLOCK_EXAMPLES){
    const s=normalizeSnapshot(clone(e.snapshot));
    if(!s){bad.push(`${e.id}: normalizeSnapshot null`);continue;}
    const w=asWork(s);n++;
    for(const i of run(w)){
      shape=shape||shapeProblem(i,w)&&`${e.id}: ${shapeProblem(i,w)}`;
      if(i.severity==='notice'){notices.set(e.id,[...(notices.get(e.id)||[]),i.code]);continue;}
      if(isKnown(e.id,i.code)){console.log(`  KNOWN ${e.id} ${i.code}: ${KNOWN[e.id].reason}`);continue;}
      bad.push(`${e.id}: ${fmt(i)}`);
    }
  }
  for(const [id,codes] of notices)console.log(`  notice ${id}: ${codes.join(',')}`);
  if(bad.length)return `${bad.length} violation(s): ${bad.slice(0,10).join(' | ')}`;
  if(shape)return shape;
  return n===BLOCK_EXAMPLES.length||`only ${n}/${BLOCK_EXAMPLES.length} examples checked`;
});

t('P2 plate-hosted motors (TT, MG995): no motorCarrier, plate hole without physicalMotor copy, bar end carries it -> no contradiction/dangling',()=>{
  for(const [id,out] of [['motor-plate-tt','ServoArm'],['servo-plate-arm','ServoArm']]){
    const w=exWork(id),o=comp(w,out),m=o.motorMount,host=comp(w,m.frameBody);
    const hole=[...(host.holes||[]),...(host.standardBlank?.mountHoles||[])].find(h=>h.id===m.center);
    const endCarries=[o.p1,o.p2].some(p=>p.id===m.center&&p.physicalMotor);
    if(o.motorCarrier||!hole||hole.physicalMotor||!endCarries)throw Error(`${id}: example no longer shows the P2 pattern`);
    const r=noBad(w,id);if(r!==true)return r;
  }
  const w=userWork('connected-resize'),o=comp(w,'Blank135'),h=comp(w,'Blank133').standardBlank.mountHoles.find(h=>h.id===o.motorMount.center);
  if(o.motorCarrier||!h||h.physicalMotor)throw Error('connected-resize no longer shows the P2 pattern');
  return noBad(w,'connected-resize');
});

t('P3 two motors with non-zero saved angles (competition-fourbar-lift saved at 50/30 deg): no I4 contradiction, nothing dangling',()=>{
  const fx=fixture('p3-two-motors-saved-angles'),w=asWork(fx);
  const motors=new Set(w.comps.flatMap(c=>KEYS.map(k=>c[k]?.physicalMotor)).filter(Boolean).map(String));
  if(motors.size<2||!Object.values(fx.motorAngles).some(v=>v!==0))throw Error('fixture precondition: need 2 motors and a non-zero saved angle');
  // precondition: the real solver reproduces the saved pose at open (theta 0 for the active motor + saved other angles)
  const sol=solveAssembly(compileAssembly(w.comps,w.modules,{params:w.params}),{thetaDeg:0,motorAngles:{...fx.motorAngles,[fx.activeMotor]:0}});
  const worst=Math.max(...w.comps.flatMap(c=>KEYS.filter(k=>c[k]&&sol.points[c[k].id]).map(k=>Math.hypot(sol.points[c[k].id].x-c[k].x,sol.points[c[k].id].y-c[k].y))));
  if(sol.isValid===false||worst>0.01)throw Error(`fixture precondition: saved pose off by ${worst}`);
  return noBad(w,'p3');
});

t('P4a syringe fixed at an arbitrary non-lattice position on a disk: no I9 (any severity), nothing dangling',()=>{
  const fx=fixture('p4-syringe-off-lattice'),w=asWork(fx),a=comp(w,'H7Syringe').a;
  if(!comp(w,a.componentId)||(Math.abs(a.u%8)<1e-6&&Math.abs(a.v%8)<1e-6))throw Error('fixture precondition: position is on the lattice');
  const issues=run(w);if(issues.some(i=>i.code==='I9'))return `I9 flagged: ${issues.filter(i=>i.code==='I9').map(fmt)}`;
  return noBad(w,'p4a');
});
t('P4b syringe mounted on a newly added fixed hole: no I9 (any severity), nothing dangling',()=>{
  const fx=fixture('p4-syringe-new-fixed-hole'),w=asWork(fx),a=comp(w,'H7Syringe').a,hole=comp(w,a.componentId).holes.find(h=>h.u===a.u&&h.v===a.v&&h.type==='fixed');
  if(!hole)throw Error('fixture precondition: no fixed hole at the syringe end');
  const issues=run(w);if(issues.some(i=>i.code==='I9'))return `I9 flagged: ${issues.filter(i=>i.code==='I9').map(fmt)}`;
  return noBad(w,'p4b');
});

t('P5 user file connected-resize: no I1, I2, I3, I5-I9 of any severity (I4 is expected, see above)',()=>{
  const codes=new Set(['I1','I2','I3','I5','I6','I7','I8','I9']),bad=run(userWork('connected-resize')).filter(i=>codes.has(i.code));
  return bad.length?bad.map(fmt).join('; '):true;
});
t('P5b user file connected-resize after alignSavedInputPhase (what the app does on open): no I4 contradiction',()=>{
  const s=alignSavedInputPhase(normalized(readJson('connected-resize.json'))),bad=run(asWork(s)).filter(i=>i.code==='I4'&&BAD(i));
  return bad.length?bad.map(fmt).join('; '):true;
});

// ---------------------------------------------------------------- relations
t('buildRelations / checkWork never mutate the work, and checkWork builds relations when omitted',()=>{
  const w=userWork('motor-off-plate'),before=JSON.stringify(w),r=rel(w);
  r.copiesOf('Blank133_H24_32');r.worldOf('Blank133_H24_32');r.holeRoles('Blank133','Blank133_H24_32');r.motorOf('Blank135');r.attachmentsOf('Blank135');r.isFreeBody('Blank135');r.isGround('Blank133.A');
  const a=checkWork(w,r),b=checkWork(w);
  if(JSON.stringify(w)!==before)return 'work was mutated';
  return JSON.stringify(a)===JSON.stringify(b)||'checkWork(w) differs from checkWork(w, buildRelations(w))';
});
t('every issue on every counterexample fixture has a well-formed shape (code, severity, parts, ids, Chinese message naming the part)',()=>{
  for(const f of readdirSync(new URL('integrity/',fixtureDir)).filter(f=>f.endsWith('.json'))){
    const w=asWork(readJson(`integrity/${f}`));
    for(const i of run(w)){const p=shapeProblem(i,w);if(p)return `${f}: ${p}`;}
  }
  return true;
});

const has=(list,pred)=>list.some(pred);
t('copiesOf: shared point lists every copy incl. standardBlank.mountHoles (plate hole + bar end)',()=>{
  const c=rel(userWork('connected-resize')).copiesOf('Blank133_H24_32');
  if(!has(c,x=>x.compId==='Blank133'&&x.holeId==='Blank133_H24_32'))return `plate mount hole copy missing: ${JSON.stringify(c)}`;
  return has(c,x=>x.compId==='Blank135'&&x.key==='p2')||`bar end copy missing: ${JSON.stringify(c)}`;
});
t('copiesOf: slider m1/m2 copies are included (slider-crank M1, M2)',()=>{
  const r=rel(exWork('slider-crank')),m1=r.copiesOf('M1'),m2=r.copiesOf('M2');
  if(!has(m1,x=>x.compId==='Slider1'&&x.key==='m1'))return `M1 -> ${JSON.stringify(m1)}`;
  if(!has(m1,x=>x.compId==='Anchor2'&&x.key==='p1'))return `M1 anchor copy missing: ${JSON.stringify(m1)}`;
  return has(m2,x=>x.compId==='Slider1'&&x.key==='m2')||`M2 -> ${JSON.stringify(m2)}`;
});
t('worldOf: spread is ~0 when copies agree (connected-resize) and ~76 mm for the motor-off-plate defect',()=>{
  const ok=rel(userWork('connected-resize')).worldOf('Blank133_H24_32'),bad=rel(userWork('motor-off-plate')).worldOf('Blank133_H24_32');
  if(!(Number.isFinite(ok.x)&&Number.isFinite(ok.y)&&ok.spread<0.01))return `consistent copies: ${JSON.stringify(ok)}`;
  return (bad.spread>70&&bad.spread<80)||`off-plate spread ${bad.spread}`;
});
t('motorOf: connected-resize (plate-hosted, no carrier) and competition-fourbar-lift (carrier-hosted), by comp id and by point id',()=>{
  const r=rel(userWork('connected-resize')),a=r.motorOf('Blank135'),b=r.motorOf('Blank133_H24_32');
  const want=m=>m&&String(m.motor)==='1'&&m.type==='tt'&&m.centerId==='Blank133_H24_32'&&m.carrierId===null&&m.frameBodyId==='Blank133'&&m.partId==='Motor133';
  if(!want(a)||!want(b))return `plate-hosted: ${JSON.stringify(a)} / ${JSON.stringify(b)}`;
  if(r.motorOf('Blank136')!==null)return 'Blank136 has no motor';
  const l=rel(exWork('competition-fourbar-lift')).motorOf('ToolPlate');
  return (l&&String(l.motor)==='2'&&l.centerId==='B'&&l.carrierId==='LiftUpright')||`carrier-hosted: ${JSON.stringify(l)}`;
});
t('isGround / attachmentsOf on connected-resize',()=>{
  const r=rel(userWork('connected-resize'));
  if(!r.isGround('Blank133.A')||!r.isGround('Blank133_H24_32'))return 'fixed plate corner / motor centre must be ground';
  if(r.isGround('Blank135.A')||r.isGround('Blank137'))return 'floating joint reported as ground';
  const others=r.attachmentsOf('Blank136').map(a=>a.otherId);
  return (others.includes('Blank135')&&others.includes('Blank137'))||`Blank136 attachments: ${JSON.stringify(r.attachmentsOf('Blank136'))}`;
});
t('isFreeBody: lone bar true; bars sharing a point false; grounded bar false',()=>{
  const bar=(id,a,b,ta='floating',tb='floating')=>({type:'bar',id,p1:{id:a,type:ta,x:0,y:0},p2:{id:b,type:tb,x:50,y:0},lenParam:'L'+id,isInput:false,fixedLen:true});
  const mk=comps=>({comps,modules:[],topo:{params:{}},params:{}});
  const lone=rel(mk([bar('Lone','a','b')]));
  if(lone.isFreeBody('Lone')!==true)return 'lone unconnected bar must be free';
  const two=rel(mk([bar('B1','a','j'),bar('B2','j','c')]));
  if(two.isFreeBody('B1')||two.isFreeBody('B2'))return 'bars sharing point j must not be free';
  return rel(mk([bar('G','g','h','fixed')])).isFreeBody('G')===false||'grounded bar must not be free';
});

// ---------------------------------------------------------------- holeRoles
function holeCases(exId){
  const w=exWork(exId),r=rel(w),plate=comp(w,'ServoPlate'),mh=plate.standardBlank.mountHoles,center=comp(w,'ServoArm').motorMount.center;
  const text=JSON.stringify([w.comps,w.modules,w.tracePoints,w.referencePoint]);
  const uses=id=>text.split(JSON.stringify(id)).length-1;
  return {w,r,plate,mh,center,uses};
}
for(const exId of ['motor-plate-tt','servo-plate-arm']){
  t(`holeRoles ${exId}: motor shaft hole -> constraint true (with a reason)`,()=>{
    const {r,plate,center}=holeCases(exId),h=r.holeRoles(plate.id,center);
    if(h.constraint!==true)return `constraint ${h.constraint}`;
    return (Array.isArray(h.reasons?.constraint)&&h.reasons.constraint.length>0)||'constraint role has no reason';
  });
  t(`holeRoles ${exId}: parked standardBlank.mountHoles hole -> mountOccupied true, machining false`,()=>{
    const {r,plate,mh,center,uses}=holeCases(exId),parked=mh.find(h=>h.id!==center&&uses(h.id)===1);
    if(!parked)throw Error('example has no parked mount hole');
    const h=r.holeRoles(plate.id,parked.id);
    if(h.mountOccupied!==true||h.machining!==false)return `${parked.id}: ${JSON.stringify({m:h.machining,o:h.mountOccupied,c:h.constraint})}`;
    return (Array.isArray(h.reasons?.mountOccupied)&&h.reasons.mountOccupied.length>0)||'mountOccupied has no reason';
  });
  t(`holeRoles ${exId}: unconnected lattice hole -> all three roles false`,()=>{
    const {r,plate,mh,uses}=holeCases(exId),mine=new Set(mh.map(h=>h.id)),lat=plate.holes.find(h=>!mine.has(h.id)&&uses(h.id)===1);
    if(!lat)throw Error('example has no unconnected lattice hole');
    const h=r.holeRoles(plate.id,lat.id);
    return (h.machining===false&&h.mountOccupied===false&&h.constraint===false)||`${lat.id}: ${JSON.stringify({m:h.machining,o:h.mountOccupied,c:h.constraint})}`;
  });
  t(`holeRoles ${exId}: hole referenced only by topo.tracePoints -> machining false`,()=>{
    const {w,plate,mh,uses}=holeCases(exId),mine=new Set(mh.map(h=>h.id)),lat=plate.holes.find(h=>!mine.has(h.id)&&uses(h.id)===1);
    if(!lat)throw Error('example has no unconnected lattice hole');
    const w2=clone(w);w2.tracePoints=[lat.id];w2.tracePoint=lat.id;w2.topo.tracePoints=[lat.id];w2.topo.tracePoint=lat.id;
    const h=rel(w2).holeRoles(plate.id,lat.id);
    return h.machining===false||`${lat.id} as trace point reported machining=${h.machining}`;
  });
}

// Legacy parity: holeRoles().machining must equal what used-holes.machinedComps decides today
// (lattice holes in comp.holes plus the primary points p1..p3 of standard parts; mountHoles are not decided there).
function parity(label,w,out){
  const m=machinedComps(w.comps,w.modules,w.params),rels=rel(w);
  w.comps.forEach((c,i)=>{
    if(!c.standardBlank)return;
    const r=rels,mc=m[i],all=mc===c; // unchanged => every hole is machined (drill 'all' or already drilled)
    const decide=[...(c.holes||[]).filter(h=>Number.isFinite(h.u)&&Number.isFinite(h.v)).map(h=>[h.id,all||mc.holes.includes(h)]),
                  ...['p1','p2','p3'].filter(k=>c[k]).map(k=>[c[k].id,all||!mc.undrilled.includes(k)])];
    for(const [holeId,legacy] of decide){
      out.n++;
      const got=r.holeRoles(c.id,holeId).machining;
      if(got===legacy||PARITY_EXCEPTIONS.some(x=>x.example===label&&x.compId===c.id&&x.holeId===holeId))continue;
      out.diff.push(`${label}/${c.id}/${holeId}: used-holes=${legacy} holeRoles=${got}`);
    }
  });
}
t('legacy parity: holeRoles().machining === used-holes decision for every standard-part comp of every built-in example and user file',()=>{
  const out={n:0,diff:[]};
  for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(s)parity(e.id,asWork(s),out);}
  for(const f of ['connected-resize','motor-off-plate'])parity('file:'+f,userWork(f),out);
  if(!out.n)throw Error('parity compared nothing');
  return out.diff.length?`${out.diff.length} of ${out.n} differ, e.g. ${out.diff.slice(0,6).join(' | ')}`:true;
});

report('connection-integrity');
