// Pack O0 of docs/SDD-OPERATION-PIPELINE.md: run the 零件 × 動作 matrix (js/blocks/operation-matrix.js) against the REAL modules.
//
//   node test/operation-matrix.mjs
//
// - every 'ok' case with a `check` must pass; an 'ok' case with neither `check` nor `unverified` fails the suite
// - every 'gap' case with a `check` is run as known(): the check returns true while the gap STILL reproduces. It never fails the suite;
//   when a fix lands the line flips to "GAP CLOSED" so the matrix can be updated (status -> 'ok')
// - prints counts per action and the gap list; exits 0 on the current code base
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';

// ------------------------------------------------------------------ fake DOM (delete-part, node-editor, Panels)
class FakeElement{
  constructor(){this.children=[];this.style={};this.dataset={};this.attributes={};this.textContent='';this.value='';this.classList={toggle(){},add(){},remove(){}};this.parentElement={style:{}};}
  appendChild(c){return c;}append(){}before(){}after(){}replaceChildren(){}setAttribute(){}closest(){return this.parentElement;}
  querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}
}
const els=new Map();
globalThis.document={getElementById:id=>{if(!els.has(id))els.set(id,new FakeElement());return els.get(id);},createElement:()=>new FakeElement()};
globalThis.window={confirm:()=>true,alert(){}};

const R='../js/blocks/';
const {PARTS,ACTIONS,MATRIX,listCases}=await import(R+'operation-matrix.js');
const {S}=await import(R+'state.js');
const Model=await import(R+'model.js');
const Panels=await import(R+'panels.js');
const {createNodeEditor}=await import(R+'node-editor.js');
const {normalizeSnapshot}=await import(R+'schema.js');
const {readStoredProject}=await import(R+'project-envelope.js');
const {deleteSelectedPart}=await import(R+'delete-part.js');
const {integrityGate,loadIntegrity}=await import(R+'integrity-gate.js');
const {checkWork}=await import(R+'integrity.js');
const MR=await import(R+'motor-release.js');
const {planMemberCopy}=await import(R+'member-copy.js');
const {resizeStandardBlank,makeStandardBlank}=await import(R+'standard-blank.js');
const {getExample,loadUnitStarts}=await import(R+'examples.js');
const {planSyringeDisconnect}=await import(R+'syringe-operations.js');
const {planDraggedMotorOutput}=await import(R+'motor-drop.js');
const {localHoles}=await import('../js/core/local-holes.js');
const {pointKeysFor}=await import(R+'part-types.js');
await loadIntegrity();await loadUnitStarts();

// ------------------------------------------------------------------ works
const FIX=new URL('./fixtures/',import.meta.url);
const fixture=n=>normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(n,FIX),'utf8'))));
const example=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
const blocks=(...made)=>({comps:made.map(m=>m.comp),params:Object.assign({theta:0},...made.map(m=>m.params)),modules:[]});
const blocked=()=>fixture('delete-blocked.json');                 // plate + TT motor off its plate hole (existing problem) + input bar + coupler + free-end bar
const repaired=()=>{const w=blocked(),back=MR.planMotorReturn(w,MR.offPlateMotors(w.comps)[0].id);return {...w,comps:back.comps,params:back.params};};
const released=()=>{const w=repaired(),r=MR.planMotorRelease({comps:w.comps,params:w.params,fabrication:w.fabrication,modules:w.modules},'Blank135',{},{});return {...w,comps:r.comps,params:r.params,plan:r};};
const comp=(w,id)=>w.comps.find(c=>c.id===id);

function load(w){
  S.comps=structuredClone(w.comps);S.modules=structuredClone(w.modules||[]);S.topo={params:{...w.params},tracePoints:[],dimensions:[],loads:[]};S.fabrication=w.fabrication;S.mode='design';S.counter=500;
  S.selectedLinkId=S.selectedTriangleId=S.selectedNodeId=S.selectedSliderId=S.selectedGearId=null;
}
// As delete-part is called from app.js (Delete key / 刪除選取 button). `sel` is what the app would have in the S.selected* fields.
function del(w,sel){
  load(w);Object.assign(S,sel);
  const msgs=[],before=JSON.stringify([S.comps,S.topo.params]);let pushes=0;
  deleteSelectedPart({S,transient:m=>msgs.push(m),deleteGearChain(){msgs.push('(gear chain deleted)');},pushUndo(){pushes++;},pause(){},closeMobileEditPanel(){},setSliderDetailRows(){},rebuild(){},draw(){},points:{}});
  return {changed:before!==JSON.stringify([S.comps,S.topo.params]),msgs,pushes,ids:S.comps.map(c=>c.id)};
}
const compsOfPoint=(w,id)=>w.comps.filter(c=>pointKeysFor(c).some(k=>c[k]?.id===id));
const noop=()=>{};
// Node editor wired like test/operation-sequences.mjs (splitNode is the only "release a shared joint" entry).
let notices=[],pushCount=0;
Panels.init({pointCoords:()=>Model.pointCoords(S.comps),sliderMountInfo:()=>null,roleLabel:()=>'',triParamFor:()=>'',hasPoint:id=>Model.hasPoint(S.comps,id),
  motorBarForCenter:()=>null,pointUseCount:()=>0,pointIsGround:id=>Model.pointIsGround(S.comps,id),isGroundPositionUnlocked:()=>false});
const nodeEditor=createNodeEditor({
  setPointPosition:noop,pushUndo:()=>{pushCount++;},pause:noop,rebuild:noop,draw:noop,setBanner:m=>notices.push(m),transient:m=>notices.push(m),scheduleAutosave:noop,
  hasPoint:id=>Model.hasPoint(S.comps,id),pointCoords:()=>Model.pointCoords(S.comps),pointIsGround:id=>Model.pointIsGround(S.comps,id),
  updatePointCoordsById:(id,x,y)=>Model.updatePointCoordsById(S.comps,id,x,y),snapFramePoint:p=>p,syncGearMeshAnchoredAt:noop,sliderMountInfo:id=>Model.sliderMountInfo(S.comps,id),
  removeMotorAtPoint:id=>Model.removeMotorAtPoint(S.comps,id),removeAnchorsAtPoint:id=>{S.comps=Model.removeAnchorsAtPoint(S.comps,id);},
  setPointType:(id,type)=>Model.setPointType(S.comps,id,type),freezePointAtDisplay:noop,pointRefs:id=>Model.pointRefs(S.comps,id),motorBarForCenter:()=>null,
  sliderTravelStart:()=>0,sliderTravelEnd:()=>100,railLength:()=>100,normalizeSliderRange:noop,traceIds:()=>[],invalidateTrajectory:noop,displayCoords:()=>Model.pointCoords(S.comps)});

// ------------------------------------------------------------------ checks
// A check returns true (or {pass,detail}). For an 'ok' case: true = the expected behaviour holds.
// For a 'gap' case: true = the gap still reproduces exactly as described in `now`.
const resizeOf=(w,id,axis,v)=>resizeStandardBlank(comp(w,id),w.params,axis,v,{comps:w.comps,modules:w.modules||[]});
const freeBar=()=>blocks(makeStandardBlank({kind:'bar',n:1}));
const freePlate=()=>blocks(makeStandardBlank({kind:'plate',n:1}));
const freeL=()=>blocks(makeStandardBlank({kind:'l',n:1}));
const groundedL=()=>{const w=freeL();w.comps[0].p1.type='fixed';return w;};
const bell=()=>example('bell-crank-gripper');
const copyOf=(w,id,mode='copy')=>planMemberCopy({comps:w.comps,params:w.params,modules:w.modules||[],counter:700,id,mode});

const CHECKS={
  // --- select
  'select-shared-joint':()=>{const w=blocked();return compsOfPoint(w,'Blank136.B').length===2&&!del(w,{selectedNodeId:'Blank136.B'}).changed;},
  // --- move (Model.isFreeBody decides whether a body drag translates; otherwise input.js only selects / returns without a message)
  'move-free-bar':()=>{const w=freeBar();return Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-free-plate':()=>{const w=freePlate();return Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-free-l':()=>{const w=freeL();return Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-free-motor':()=>{const r=del(released(),{selectedTriangleId:'Blank133'});const m=S.comps.find(c=>c.type==='motor');return r.changed&&!!m&&Model.isFreeBody(S.comps,m,[]);},
  'move-connected-bar-silent':()=>{const w=blocked();return !Model.isFreeBody(w.comps,comp(w,'Blank136'),[]);},
  'move-connected-hole-silent':()=>{const w=blocked(),c=comp(w,'Blank136');return localHoles(c).length>0&&!Model.isFreeBody(w.comps,c,[]);},
  'move-connected-plate-silent':()=>{const w=blocked();return !Model.isFreeBody(w.comps,comp(w,'Blank133'),[]);},
  'move-connected-l-silent':()=>{const w=groundedL();return !Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-connected-arms-silent':()=>{const w=bell(),c=w.comps.find(c=>c.standardBlank?.kind==='arms');return !!c&&!Model.isFreeBody(w.comps,c,[]);},
  'move-hosted-motor-silent':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor');return !!m?.motorMount?.frameBody&&!Model.isFreeBody(w.comps,m,[]);},
  'gate-only-new':()=>{const w=blocked(),work={comps:w.comps,modules:w.modules||[],params:w.params};return checkWork(work).length>0&&integrityGate(work,{...work,comps:structuredClone(w.comps)},noop)===true;},
  'offplate-detected':()=>{const w=blocked(),items=MR.offPlateMotors(w.comps);return items.length===1&&MR.offPlateMessage(items[0]).includes('請選');},
  // --- resize
  'resize-bar-ok':()=>{const w=blocked(),r=resizeOf(w,'Blank136','g',24);return r.ok&&Number.isFinite(r.params[comp(w,'Blank136').lenParam]);},
  'resize-plate-grow':()=>resizeOf(blocked(),'Blank133','g',48).ok,
  'resize-plate-lost-hole':()=>{const r=resizeOf(blocked(),'Blank133','g',16);return !r.ok&&/孔/.test(r.message)&&/解除/.test(r.message);},
  'resize-l-ok':()=>{const w=freeL();return resizeStandardBlank(w.comps[0],w.params,'g',w.params[w.comps[0].gParam]+16,{comps:w.comps}).ok;},
  'resize-motorbar-shaft-stays':()=>{const w=repaired(),c=comp(w,'Blank135'),r=resizeOf(w,'Blank135','g',24);return r.ok&&Math.hypot(r.comp.p2.x-c.p2.x,r.comp.p2.y-c.p2.y)<1e-6&&Math.hypot(r.comp.p1.x-c.p1.x,r.comp.p1.y-c.p1.y)>1;},
  // --- delete
  'del-bar-free-ok':()=>{const r=del(repaired(),{selectedLinkId:'Blank137'});return r.changed&&!r.ids.includes('Blank137')&&r.ids.includes('Blank136');},
  'del-connected-bar-ok':()=>{const r=del(repaired(),{selectedLinkId:'Blank136'});return r.changed&&!r.ids.includes('Blank136')&&r.ids.includes('Blank135')&&r.ids.includes('Blank137');},
  'del-hole-silent':()=>{const r=del(blocked(),{selectedNodeId:'Blank136.B'}),r2=del(blocked(),{selectedNodeId:'Blank133_H8_0'});return !r.changed&&!r.msgs.length&&!r2.changed&&!r2.msgs.length;},
  'del-existing-problem-blocked':()=>{const a=del(blocked(),{selectedLinkId:'Blank136'}),b=del(blocked(),{selectedLinkId:'Blank137'});
    const refused=r=>!r.changed&&r.msgs.some(m=>m.includes('馬達軸心需保持在所選座板格位'));
    return refused(a)&&refused(b)&&del(repaired(),{selectedLinkId:'Blank136'}).changed;},      // same deletion succeeds once the old problem is repaired
  'del-fused-refused':()=>{const w=example('six-bar-lift'),root=w.comps.find(c=>c.barFusionRoot);if(!root)return false;const r=del(w,{selectedLinkId:root.id});return !r.changed&&r.msgs.some(m=>m.includes('解除合成'));},
  'del-plate-plain':()=>{const w=freePlate(),r=del(w,{selectedTriangleId:w.comps[0].id});return r.changed&&!r.ids.length;},
  'del-plate-silent-detach':()=>{const r=del(repaired(),{selectedTriangleId:'Blank133'}),bar=S.comps.find(c=>c.id==='Blank135');
    return r.changed&&!r.msgs.length&&bar?.p2.type==='fixed'&&!bar.motorMount?.frameBody;},
  'del-l-ok':()=>{const w=freeL(),r=del(w,{selectedTriangleId:w.comps[0].id});return r.changed&&!r.ids.length;},
  'del-arms-ok':()=>{const w=bell(),c=w.comps.find(c=>c.standardBlank?.kind==='arms'),r=del(w,{selectedTriangleId:c.id});return r.changed&&!r.ids.includes(c.id)&&r.ids.length===w.comps.length-1;},
  'del-slider-ok':()=>{const w=example('slider-crank'),s=w.comps.find(c=>c.type==='slider'),r=del(w,{selectedSliderId:s.id});return r.changed&&!r.ids.includes(s.id)&&r.ids.includes('Link1');},
  'del-motor-independent':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor'),r=del(w,{selectedNodeId:m.p1.id});return r.changed&&!r.ids.includes(m.id)&&r.ids.includes('Blank133');},
  'del-motorbar-removes-motor':()=>{const r=del(repaired(),{selectedLinkId:'Blank135'});return r.changed&&!S.comps.some(c=>c.type==='motor'||c.physicalMotor||c.motorMount||pointKeysFor(c).some(k=>c[k]?.physicalMotor));},
  'del-syringe-key-silent':()=>{const w=example('hydraulic-h01');if(!w.comps.some(c=>c.type==='syringe'))return false;const r=del(w,{});return !r.changed&&!r.msgs.length;},
  'del-anchor-silent':()=>{const w=example('slider-crank'),a=w.comps.find(c=>c.type==='anchor'),r=del(w,{selectedNodeId:a.p1.id});return !r.changed&&!r.msgs.length;},
  // --- connect
  'connect-free-bars-ok':()=>{const a=makeStandardBlank({kind:'bar',n:1,origin:{x:0,y:0}}),b=makeStandardBlank({kind:'bar',n:2,origin:{x:200,y:100}});
    const w=blocks(a,b),r=Model.previewPointConnection(structuredClone(w.comps),{params:w.params},a.comp.p2.id,b.comp.p1.id);return r.ok&&Model.pointUseCount(r.comps,b.comp.p1.id)===2||r.ok&&r.comps.some(c=>c.id===b.comp.id);},
  'connect-refusal-message':()=>{const w=blocked(),r=Model.previewPointConnection(structuredClone(w.comps),{params:w.params},'P139s','Blank133_H8_32');return !r.ok&&typeof r.message==='string'&&r.message.length>6;},
  'connect-same-part-refused':()=>{const w=blocked(),r=Model.previewPointConnection(structuredClone(w.comps),{params:w.params},'Blank137_H8_0','Blank137_H16_0');return !r.ok&&/同一零件/.test(r.message);},
  'connect-motor-output':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor'),loose=makeStandardBlank({kind:'bar',n:9,origin:{x:-400,y:0}});
    const src={comps:[...w.comps,loose.comp],params:{...w.params,...loose.params},modules:[],fabrication:w.fabrication,counter:900};
    const r=planDraggedMotorOutput(src,loose.comp.p1.id,m.p1.id,{},{thetaDeg:0});return r.matched&&r.ok;},
  'connect-motor-refuse-message':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor'),r=planDraggedMotorOutput({comps:w.comps,params:w.params,modules:[],fabrication:w.fabrication,counter:900},'P139s',m.p1.id,{},{thetaDeg:0});
    return r.matched&&!r.ok&&/其他連接|多個零件/.test(r.message);},
  // --- release
  'release-split-silent':()=>{const w=blocked();load(w);notices=[];pushCount=0;S.selectedNodeId='Blank136.B';const before=Model.pointRefs(S.comps,'Blank136.B').length;nodeEditor.splitNode();
    return before===2&&pushCount===1&&Model.pointRefs(S.comps,'Blank136.B').length===1&&notices.length===0;},
  'release-motor-ok':()=>{const w=repaired(),r=MR.planMotorRelease({comps:w.comps,params:w.params,fabrication:w.fabrication,modules:w.modules},'Blank135',{},{});
    return r.ok&&/解除/.test(r.message)&&r.comps.some(c=>c.type==='motor')&&r.comps.some(c=>c.id==='Blank135');},
  'release-syringe-ok':()=>{const w=example('hydraulic-h01'),s=w.comps.find(c=>c.type==='syringe'),r=planSyringeDisconnect({comps:w.comps,params:w.params},s.id);return r.ok&&!r.syringe.b.componentId&&!!r.simulationIssue;},
  // --- copy
  'copy-bar':()=>{const w=freeBar(),r=copyOf(w,w.comps[0].id);return r.ok&&r.comps.length===1&&r.comps[0].id!==w.comps[0].id&&r.comps[0].holes?.length===w.comps[0].holes?.length;},
  'copy-connected-clean':()=>{const w=blocked(),r=copyOf(w,'Blank136'),ids=new Set(w.comps.flatMap(c=>pointKeysFor(c).map(k=>c[k].id)));return r.ok&&r.comps.every(c=>pointKeysFor(c).every(k=>!ids.has(c[k].id)&&c[k].type==='floating'));},
  'copy-mirror':()=>{const w=freeBar();return copyOf(w,w.comps[0].id,'mirror-x').ok&&copyOf(w,w.comps[0].id,'mirror-y').ok;},
  'copy-plate':()=>{const w=blocked(),r=copyOf(w,'Blank133');return r.ok&&r.comps[0].type==='triangle'&&!r.comps[0].motorMountPoint;},
  'copy-l':()=>{const w=freeL();return copyOf(w,w.comps[0].id).ok&&copyOf(w,w.comps[0].id,'mirror-x').ok;},
  'copy-arms-mirror':()=>{const w=bell(),c=w.comps.find(c=>c.standardBlank?.kind==='arms');return copyOf(w,c.id,'mirror-x').ok;},
  'copy-motorbar-plain':()=>{const w=blocked(),r=copyOf(w,'Blank135');return r.ok&&!r.comps[0].isInput&&!r.comps[0].physicalMotor&&!r.comps[0].motorMount;}
};

// ------------------------------------------------------------------ run the matrix
const cases=listCases();
const stats={};for(const a of ACTIONS)stats[a.id]={ok:0,gap:0,na:0,unverified:0};
let closed=0,stillOpen=0,knownErr=0;
const gapRows=[],unverifiedRows=[];
// completeness: every part x action has at least one case
for(const p of PARTS)for(const a of ACTIONS)check(`matrix covers ${p.id} x ${a.id}`,(MATRIX[p.id]?.[a.id]||[]).length>0);
const label=c=>`${PARTS.find(p=>p.id===c.part).label} / ${ACTIONS.find(a=>a.id===c.action).label} / ${c.when}`;
for(const c of cases){
  const s=stats[c.action];
  if(c.status==='n/a'){s.na++;continue;}
  if(c.unverified)unverifiedRows.push(c);
  if(c.status==='gap'){
    s.gap++;gapRows.push(c);
    check(`gap documented: ${label(c)}`,!!(c.now&&c.evidence&&c.expect&&c.cause));
    if(!c.check)continue;
    const fn=CHECKS[c.check];
    if(!fn){check(`gap check exists: ${c.check}`,false);continue;}
    try{
      const r=fn();
      if(r===true||r?.pass===true){stillOpen++;console.log(`KNOWN   gap  ${label(c)}  — ${c.now}`);}
      else{closed++;console.log(`GAP CLOSED?  ${label(c)}  — check '${c.check}' no longer reproduces it; set status to 'ok' in operation-matrix.js`);}
    }catch(e){knownErr++;console.log(`KNOWN-ERR  ${label(c)}  — check '${c.check}' threw: ${e.message}`);}
    continue;
  }
  s.ok++;
  if(c.unverified)s.unverified++;
  if(!c.check){check(`ok case is verified or flagged unverified: ${label(c)}`,!!c.unverified);continue;}
  const fn=CHECKS[c.check];
  if(!fn){check(`ok check exists: ${c.check}`,false);continue;}
  let pass=false,detail='';
  try{const r=fn();pass=r===true||r?.pass===true;detail=r?.detail||'';}catch(e){detail='threw: '+e.message;}
  check(`${c.check}: ${label(c)}`,pass,detail);
}

// ------------------------------------------------------------------ summary
console.log('\n=== 零件 × 動作 summary ===');
console.log('action        ok  gap  n/a  (ok but unverified)');
for(const a of ACTIONS){const s=stats[a.id];console.log(`${a.label.padEnd(8,'　')}  ${String(s.ok).padStart(3)} ${String(s.gap).padStart(4)} ${String(s.na).padStart(4)}   (${s.unverified})`);}
const total=Object.values(stats).reduce((t,s)=>({ok:t.ok+s.ok,gap:t.gap+s.gap,na:t.na+s.na,unverified:t.unverified+s.unverified}),{ok:0,gap:0,na:0,unverified:0});
console.log(`TOTAL ok ${total.ok} (of which unverified ${total.unverified}), gap ${total.gap}, n/a ${total.na}; gaps still reproducing ${stillOpen}, closed ${closed}, errored ${knownErr}`);
console.log('\n=== gap list ===');
for(const c of gapRows)console.log(`- [${c.cause}] ${label(c)}\n    now: ${c.now}`);
const causes={};for(const c of gapRows)(causes[c.cause]??=[]).push(c);
console.log('\n=== gaps by shared cause ===');
for(const [k,v] of Object.entries(causes))console.log(`${k}: ${v.length}`);
report('operation-matrix');
