// Pack C2 of docs/SDD-CONNECTION-INTEGRITY.md: random but legal student operations on representative works,
// driven through the SAME planners/editors the app uses (member-editor, member-frame, motor-release, motor-drop,
// node-editor, delete-part, model.previewPointConnection, schema save/reload), with invariants checked after every
// committed step.
//
//   node test/operation-sequences.mjs                  default: ~500 steps across 6 works, fixed seeds
//   OPSEQ_SCALE=10 node test/operation-sequences.mjs   heavier run (10x steps, same seed list extended)
//   OPSEQ_VERBOSE=1 ...                                 per-run summary
//
// Invariants after every committed step (a step is "committed" when it changed the work):
//   1 rigid geometry  2 integrity (no NEW contradiction/dangling)  3 pose continuity  4 save/reload relations  5 no throw
// A failure is shrunk to a minimal replay and written to test/fixtures/sequences/<name>.json. Fixtures in that folder are
// replayed on every run: a fixture without `known` must pass (regression); a fixture with `known` is reported, not counted.
// Syringe operations are out of scope (the syringe pack is last): syringe comps and their hosts are never targeted.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {check,report} from './_harness.mjs';

// ------------------------------------------------------------------ fake DOM (shared by Panels, delete-part, motor-release)
class FakeElement{
  constructor(){this.children=[];this.style={};this.dataset={};this.attributes={};this.textContent='';this.value='';this.classList={toggle(){},add(){},remove(){}};this.parentElement={style:{}};}
  appendChild(c){this.children.push(c);return c;}append(...c){this.children.push(...c);}before(){}after(){}
  replaceChildren(...c){this.children=c;}setAttribute(k,v){this.attributes[k]=String(v);}closest(){return this.parentElement;}
  querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}
}
const els=new Map();
globalThis.document={getElementById:id=>{if(!els.has(id))els.set(id,new FakeElement());return els.get(id);},createElement:()=>new FakeElement()};
let windowMessages=[];
globalThis.window={confirm:m=>{windowMessages.push(m);return true;},alert:m=>{windowMessages.push(m);}};

const {S,motorAnglesNow,frozenMotorAngles}=await import('../js/blocks/state.js');
const Model=await import('../js/blocks/model.js');
const Panels=await import('../js/blocks/panels.js');
const {createNodeEditor}=await import('../js/blocks/node-editor.js');
const {createMemberEditor,resizeRefusal}=await import('../js/blocks/member-editor.js');
const {planMemberFrame}=await import('../js/blocks/member-frame.js');
const {commitMountingEdit,mountingWork,confirmMountingChange}=await import('../js/blocks/mounting-review-ui.js');
const MotorRelease=await import('../js/blocks/motor-release.js');
const {planDraggedMotorOutput}=await import('../js/blocks/motor-drop.js');
const {deleteSelectedPart}=await import('../js/blocks/delete-part.js');
const {retargetPointRefs}=await import('../js/blocks/topo-refs.js');
const {normalizeSnapshot,toSnapshot,alignSavedInputPhase,highestIdNum}=await import('../js/blocks/schema.js');
const {storedProject,readStoredProject}=await import('../js/blocks/project-envelope.js');
const {getExample,loadUnitStarts}=await import('../js/blocks/examples.js');
const {compileTopology}=await import('../js/core/topology.js');
const {solveTopology}=await import('../js/multilink/solver.js');
const {localHoles,holeWorld}=await import('../js/core/local-holes.js');
const {pointKeysFor}=await import('../js/blocks/part-types.js');
const {buildRelations}=await import('../js/blocks/relations.js');
const {checkWork}=await import('../js/blocks/integrity.js');
await loadUnitStarts();

const ROOT=new URL('../',import.meta.url);
const FIX=new URL('./fixtures/',import.meta.url);
const SEQ=new URL('./fixtures/sequences/',import.meta.url);
const readFix=n=>JSON.parse(readFileSync(new URL(n,FIX),'utf8'));
const SCALE=Math.max(1,Number(process.env.OPSEQ_SCALE)||1);
const VERBOSE=!!process.env.OPSEQ_VERBOSE;
const TOL=0.01;            // rigid-geometry tolerance (mm)
const JUMP=50;             // pose-continuity bound (mm)

// ------------------------------------------------------------------ works
const WORKS={
  'connected-resize':()=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(structuredClone(readFix('connected-resize.json'))))),
  'motor-off-plate-repaired':()=>{
    const w=alignSavedInputPhase(normalizeSnapshot(readStoredProject(structuredClone(readFix('motor-off-plate.json')))));
    const back=MotorRelease.planMotorReturn(w,MotorRelease.offPlateMotors(w.comps)[0].id);
    if(!back.ok)throw Error('repair failed: '+back.message);
    return {...w,comps:back.comps,params:back.params};
  },
  'fourbar-crank-rocker':()=>alignSavedInputPhase(normalizeSnapshot(structuredClone(getExample('fourbar-crank-rocker').snapshot))),
  'servo-plate-fourbar':()=>alignSavedInputPhase(normalizeSnapshot(structuredClone(getExample('servo-plate-fourbar').snapshot))),
  'parallel-gripper':()=>alignSavedInputPhase(normalizeSnapshot(structuredClone(getExample('parallel-gripper').snapshot))),
  'motor-plate-tt':()=>alignSavedInputPhase(normalizeSnapshot(structuredClone(getExample('motor-plate-tt').snapshot))),
};
const WORK_IDS=Object.keys(WORKS);

// ------------------------------------------------------------------ state <-> app
function initState(norm){
  S.comps=norm.comps;S.modules=Array.isArray(norm.modules)?norm.modules:[];
  const {comps,modules,...rest}=norm;
  S.topo={assemblyMembers:norm.assemblyMembers||[],params:{...norm.params},tracePoint:'',tracePoints:[...(norm.tracePoints||[])],referencePoint:norm.referencePoint||'',
    dimensions:norm.dimensions||[],loads:norm.loads||[],projectName:norm.projectName||''};
  if(norm.tracePoint&&!S.topo.tracePoints.length)S.topo.tracePoints=[norm.tracePoint];
  S.counter=Math.max(norm.counter||0,highestIdNum(S.comps));
  S.theta=0;S.activeMotor=String(norm.activeMotor||'1');S.motorAngles={...(norm.motorAngles||{})};delete S.motorAngles[S.activeMotor];
  S.fabrication=norm.fabrication;S.mode='design';S.compiled=null;
  S.selectedLinkId=S.selectedTriangleId=S.selectedNodeId=S.selectedSliderId=S.selectedGearId=null;
  windowMessages=[];
}
const motorState=()=>({activeMotor:S.activeMotor,motorAngles:frozenMotorAngles(),fabrication:S.fabrication,modules:S.modules});
const snapshot=()=>toSnapshot(S.comps,S.topo,S.counter,motorState());
const asWork=s=>({...s,topo:{...s}});
const fingerprint=()=>JSON.stringify({c:S.comps,p:S.topo.params,t:S.theta,a:S.motorAngles,m:S.activeMotor,k:S.topo.tracePoints});
function reload(){return alignSavedInputPhase(normalizeSnapshot(readStoredProject(JSON.parse(JSON.stringify(storedProject(snapshot()))))));}
function solveNow(prev){
  const compiled=compileTopology(S.comps,{...S.topo,params:{...S.topo.params}},new Set());S.compiled=compiled;
  return solveTopology(compiled,{thetaDeg:S.theta,motorAngles:motorAnglesNow(),_prevPoints:prev||null});
}
const comp=id=>S.comps.find(c=>c.id===id);

// ------------------------------------------------------------------ editors wired like the app
let pushes=0,notices=[];
const pushUndo=()=>{pushes++;};
const notify=m=>{notices.push(m);};
let lastPoints=null;
// app.displayCoords: stored coordinates overlaid with the last solved points (partial ones too when the pose is unsolvable).
const displayCoords=()=>{const m=Model.pointCoords(S.comps);for(const [id,p] of Object.entries(lastPoints||{}))if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))m[id]={x:p.x,y:p.y};return m;};
const validateCandidate=draft=>{
  try{
    const compiled=compileTopology(draft.comps,{...S.topo,params:{...draft.params}},new Set());
    const r=solveTopology(compiled,{thetaDeg:S.theta,motorAngles:motorAnglesNow()});
    return r?.isValid===false?resizeRefusal(r):'';
  }catch(e){return `孔距未修改：${e.message}`;}
};
const memberEditor=createMemberEditor({pause(){},rebuild(){},draw(){},reshapeTriangle(){},updatePointCoordsById:(id,x,y)=>Model.updatePointCoordsById(S.comps,id,x,y),pushUndo,notify,validateCandidate});
Panels.init({pointCoords:()=>Model.pointCoords(S.comps),sliderMountInfo:()=>null,roleLabel:()=>'',triParamFor:()=>'',hasPoint:id=>Model.hasPoint(S.comps,id),
  motorBarForCenter:()=>null,pointUseCount:()=>0,pointIsGround:id=>Model.pointIsGround(S.comps,id),isGroundPositionUnlocked:()=>false});
const noop=()=>{};
const nodeEditor=createNodeEditor({
  setPointPosition:(axis,value)=>{const p=Model.pointCoords(S.comps)[S.selectedNodeId];Model.updatePointCoordsById(S.comps,S.selectedNodeId,axis==='x'?value:p.x,axis==='y'?value:p.y);},
  pushUndo,pause:noop,rebuild:noop,draw:noop,setBanner:notify,transient:notify,scheduleAutosave:noop,
  hasPoint:id=>Model.hasPoint(S.comps,id),pointCoords:()=>Model.pointCoords(S.comps),pointIsGround:id=>Model.pointIsGround(S.comps,id),
  updatePointCoordsById:(id,x,y)=>Model.updatePointCoordsById(S.comps,id,x,y),
  snapFramePoint:p=>({x:Model.snapFrameCoord(p.x),y:Model.snapFrameCoord(p.y)}),syncGearMeshAnchoredAt:noop,sliderMountInfo:id=>Model.sliderMountInfo(S.comps,id),
  removeMotorAtPoint:id=>Model.removeMotorAtPoint(S.comps,id),removeAnchorsAtPoint:id=>{S.comps=Model.removeAnchorsAtPoint(S.comps,id);},
  setPointType:(id,type)=>Model.setPointType(S.comps,id,type),
  freezePointAtDisplay:id=>Model.freezePointAtDisplay(S.comps,S.compiled,S.theta,id,motorAnglesNow()),
  pointRefs:id=>Model.pointRefs(S.comps,id),
  motorBarForCenter:id=>S.comps.find(c=>c.type==='bar'&&c.isInput&&((c.p1?.id===id&&c.p1.physicalMotor)||(c.p2?.id===id&&c.p2.physicalMotor)))||null,
  sliderTravelStart:()=>0,sliderTravelEnd:c=>Number(c.travelEnd)||100,railLength:()=>100,normalizeSliderRange:noop,
  traceIds:()=>[...(S.topo.tracePoints||[])],invalidateTrajectory:noop});

// ------------------------------------------------------------------ targeting rules
// Syringe comps and the parts they use are never targeted (syringe pack is last).
function syringeInvolved(){
  const ids=new Set();
  for(const c of S.comps)if(c.type==='syringe'){ids.add(c.id);for(const k of ['a','b'])if(c[k]?.componentId)ids.add(c[k].componentId);if(c.outputId)ids.add(c.outputId);for(const j of c.jawIds||[])ids.add(j);}
  return ids;
}
const isBody=c=>c&&['bar','triangle'].includes(c.type);
const plainBody=(c,skip)=>isBody(c)&&!skip.has(c.id)&&!c.barFusion&&!c.barFusionRoot&&!c.fusedWith&&!c.boxPanel&&c.style!=='piston';
function compOfPoint(id){return S.comps.filter(c=>pointKeysFor(c).some(k=>c[k]?.id===id));}

// ------------------------------------------------------------------ operations
// Each executor takes the recorded step and returns the set of comp ids it touched (for the continuity exemption)
// or null when the step is not applicable to the current work (replay after shrinking; never an error).
const OPS={
  resize(step){
    const c=comp(step.id);if(!c||!c.standardBlank||!isBody(c)||syringeInvolved().has(c.id))return null;
    const key=c.type==='bar'?c.lenParam:step.axis==='r1'?c.r1Param:c.gParam;if(!key||!Number.isFinite(S.topo.params[key]))return null;
    S.triSide=step.axis;
    memberEditor.setDimensionValue(c.id,step.axis,S.topo.params[key]+step.delta,{exact:true});
    return {touched:[c.id],resize:Math.abs(step.delta)};
  },
  frame(step){
    const c=comp(step.id);if(!plainBody(c,syringeInvolved()))return null;
    const source={comps:structuredClone(S.comps),params:{...S.topo.params},id:step.id,points:displayCoords(),motion:{thetaDeg:S.theta,motorAngles:motorAnglesNow()}};
    const plan=planMemberFrame(source);if(!plan.ok||plan.unchanged)return {touched:[],strict:true};
    const replacements=new Map(plan.comps.map(x=>[x.id,x]));
    commitMountingEdit(S,d=>{d.comps=d.comps.map(x=>replacements.get(x.id)||x);},{pushUndo,notify});
    return {touched:[],strict:true};
  },
  unfix(step){return setRole(step,'floating');},
  fix(step){return setRole(step,'fixed');},
  release(step){
    const c=comp(step.id);if(!c||c.type!=='bar'||!c.isInput||syringeInvolved().has(c.id))return null;
    MotorRelease.run('release',{S,id:step.id,pause:noop,pushUndo,rebuild:noop,draw:noop,notify,save:noop,points:displayCoords,motion:{thetaDeg:S.theta,motorAngles:motorAnglesNow()}});
    return {touched:[step.id]};
  },
  repair(step){
    const item=MotorRelease.offPlateMotors(S.comps)[0];if(!item)return null;
    MotorRelease.run(step.action,{S,id:item.id,pause:noop,pushUndo,rebuild:noop,draw:noop,notify,save:noop,points:displayCoords,motion:{thetaDeg:S.theta,motorAngles:motorAnglesNow()}});
    return {touched:S.comps.map(c=>c.id)};
  },
  reconnect(step){
    const motor=S.comps.find(c=>c.type==='motor'&&c.p1?.id===step.to),bar=S.comps.find(c=>c.type==='bar'&&pointKeysFor(c).some(k=>c[k]?.id===step.from));
    if(!motor||!bar||bar.isInput||bar.physicalMotor||!plainBody(bar,syringeInvolved()))return null;
    const candidate=mountingWork(S);candidate.comps=structuredClone(candidate.comps);
    const source=mountingWork(S);
    const result=planDraggedMotorOutput(candidate,step.from,step.to,displayCoords(),{thetaDeg:S.theta,motorAngles:S.motorAngles});
    if(!result.ok)return {touched:[]};
    if(!confirmMountingChange(source,{...source,comps:result.comps,params:result.params},{notify}))return {touched:[]};
    pushUndo();S.comps=result.comps;S.topo.params=result.params;retargetPointRefs(S.topo,step.from,step.to);      // as motor-drop-ui.connectDraggedMotorOutput
    return {touched:[bar.id,motor.id]};
  },
  merge(step){
    const owner=compOfPoint(step.from)[0];if(!owner||!plainBody(owner,syringeInvolved())||owner.isInput)return null;
    if(Model.pointUseCount(S.comps,step.from)!==1||Model.pointIsGround(S.comps,step.from))return null;
    const seed=structuredClone(S.comps);for(const [id,p] of Object.entries(displayCoords()))Model.updatePointCoordsById(seed,id,p.x,p.y);
    const cand=Model.previewPointConnection(seed,S.topo,step.from,step.to);
    if(!cand.ok){notify(cand.message);return {touched:[]};}
    pushUndo();S.comps=cand.comps;retargetPointRefs(S.topo,step.from,step.to);      // as app.mergePoints
    return {touched:[owner.id,...compOfPoint(step.to).map(c=>c.id)]};
  },
  split(step){
    if(Model.pointRefs(S.comps,step.pid).length<2)return null;
    S.selectedNodeId=step.pid;nodeEditor.splitNode();
    return {touched:S.comps.map(c=>c.id),split:true};
  },
  move(step){
    const skip=syringeInvolved(),free=Model.freeLinkForPoint(S.comps,step.pid)||Model.freeTriangleForPoint(S.comps,step.pid);
    if(!free||!plainBody(free,skip))return null;
    // Same as input.js: the whole-body drag (startFreeLinkDrag) and the free link/triangle vertex drag both translate the vertices.
    for(const k of pointKeysFor(free))if(free[k]?.id)Model.movePointById(S.comps,free[k].id,step.dx,step.dy);
    return {touched:[free.id],moved:Math.hypot(step.dx,step.dy)};
  },
  delete(step){
    const c=comp(step.id);if(!c||!['bar','triangle','motor','slider'].includes(c.type)||syringeInvolved().has(c.id))return null;
    S.selectedLinkId=c.type==='bar'?c.id:null;S.selectedTriangleId=c.type==='triangle'?c.id:null;S.selectedSliderId=c.type==='slider'?c.id:null;
    S.selectedNodeId=c.type==='motor'?c.p1.id:null;S.selectedGearId=null;
    deleteSelectedPart({S,transient:notify,deleteGearChain:noop,pushUndo,pause:noop,closeMobileEditPanel:noop,setSliderDetailRows:noop,rebuild:noop,draw:noop,points:displayCoords()});
    return {touched:S.comps.map(x=>x.id),deleted:true};
  },
  theta(step){
    const id=String(step.motor);
    if(id!==String(S.activeMotor)){
      // Same as the app's motor switch (state.activateMotor): the old angle is frozen, the new one takes over.
      S.motorAngles[String(S.activeMotor)]=S.theta;delete S.motorAngles[id];S.activeMotor=id;
    }
    S.theta=step.deg;S.topo.params.theta=S.theta;
    return {touched:[],theta:true};
  },
  reload(){const n=reload();const keep=S.activeMotor;initState(n);return {touched:[],reloaded:true,keep};},
};
function setRole(step,type){
  if(!Model.hasPoint(S.comps,step.pid))return null;
  const owners=compOfPoint(step.pid);if(owners.some(c=>syringeInvolved().has(c.id)))return null;
  S.selectedNodeId=step.pid;nodeEditor.setNodeRole(type);
  // Freeing a pivot adds a degree of freedom, so the mechanism around it may relax; fixing a point must not move anything.
  return type==='floating'?{touched:owners.map(c=>c.id)}:{touched:[],strict:true};
}

// ------------------------------------------------------------------ generation
function rngFrom(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const pick=(r,a)=>a.length?a[Math.floor(r()*a.length)]:null;
const ri=(r,lo,hi)=>lo+Math.floor(r()*(hi-lo+1));
function allPointIds(){return Object.keys(Model.pointCoords(S.comps));}
const WEIGHTS={resize:5,frame:1,unfix:1,fix:1,release:1.5,repair:1,reconnect:1.5,merge:4,split:2,move:3,delete:1,theta:5,reload:1.5};
function generate(r){
  const skip=syringeInvolved();
  for(let tries=0;tries<12;tries++){
    const total=Object.values(WEIGHTS).reduce((a,b)=>a+b,0);let x=r()*total,op='theta';
    for(const [k,w] of Object.entries(WEIGHTS)){if((x-=w)<0){op=k;break;}}
    let step=null;
    if(op==='resize'){
      // KNOWN (fixture): a frame bar (both ends fixed) sharing a fixed end with another body is not resized by the generator.
      const sharedFrame=c=>c.type==='bar'&&[c.p1,c.p2].every(p=>p&&Model.isGroundPoint(p))&&[c.p1,c.p2].some(p=>Model.pointUseCount(S.comps,p.id)>1);
      const c=pick(r,S.comps.filter(c=>c.standardBlank&&isBody(c)&&!skip.has(c.id)&&!sharedFrame(c)));
      if(c)step={op,id:c.id,axis:c.type==='bar'?'g':pick(r,['g','r1']),delta:pick(r,[-16,-8,8,8,16])};
    }else if(op==='frame'){
      const c=pick(r,S.comps.filter(c=>plainBody(c,skip)));if(c)step={op,id:c.id};
    }else if(op==='unfix'){
      const ids=allPointIds().filter(id=>Model.pointIsGround(S.comps,id)&&!Model.pointHasMotor(S.comps,id)&&compOfPoint(id).every(c=>isBody(c)&&!skip.has(c.id)));
      const id=pick(r,ids);if(id)step={op,pid:id};
    }else if(op==='fix'){
      const ids=allPointIds().filter(id=>!Model.pointIsGround(S.comps,id)&&compOfPoint(id).every(c=>plainBody(c,skip)));
      const id=pick(r,ids);if(id)step={op,pid:id};
    }else if(op==='release'){
      const c=pick(r,S.comps.filter(c=>c.type==='bar'&&c.isInput&&c.style!=='piston'&&!skip.has(c.id)));if(c)step={op,id:c.id};
    }else if(op==='repair'){
      if(MotorRelease.offPlateMotors(S.comps).length)step={op,action:pick(r,['back','leave'])};
    }else if(op==='reconnect'){
      const m=pick(r,S.comps.filter(c=>c.type==='motor'));
      const ends=S.comps.filter(c=>c.type==='bar'&&!c.isInput&&!c.physicalMotor&&plainBody(c,skip)).flatMap(c=>[c.p1,c.p2].filter(p=>p&&Model.pointUseCount(S.comps,p.id)===1&&!Model.pointIsGround(S.comps,p.id)));
      const e=pick(r,ends);if(m&&e)step={op,from:e.id,to:m.p1.id};
    }else if(op==='merge'){
      const rel=buildRelations(asWork(snapshot()));
      // KNOWN (fixtures): previewPointConnection translates a "free" body by its vertices only. Generate merges from
      // bodies that are either not translated that way or are really free (isFreeBody).
      const translated=id=>{const f=Model.freeLinkForPoint(S.comps,id)||Model.freeTriangleForPoint(S.comps,id);return f&&!Model.isFreeBody(S.comps,f,S.modules);};
      const froms=allPointIds().filter(id=>Model.pointUseCount(S.comps,id)===1&&!Model.pointIsGround(S.comps,id)&&!translated(id)&&compOfPoint(id).length===1&&compOfPoint(id).every(c=>plainBody(c,skip)&&!c.isInput));
      const from=pick(r,froms);
      if(from){
        const owner=compOfPoint(from)[0];
        const lattice=S.comps.filter(c=>c!==owner&&!skip.has(c.id)).flatMap(c=>localHoles(c).map(h=>({id:h.id,c}))).filter(({id,c})=>{
          const role=rel.holeRoles(c.id,id);return rel.copiesOf(id).length===1&&!role.machining&&!role.mountOccupied&&!role.constraint;}).map(x=>x.id);
        const ends=allPointIds().filter(id=>id!==from&&!compOfPoint(id).includes(owner));
        const to=r()<0.65&&lattice.length?pick(r,lattice):pick(r,ends);
        if(to)step={op,from,to};
      }
    }else if(op==='split'){
      const id=pick(r,allPointIds().filter(id=>Model.pointRefs(S.comps,id).length>=2&&compOfPoint(id).every(c=>isBody(c)&&!skip.has(c.id))));
      if(id)step={op,pid:id};
    }else if(op==='move'){
      // Whole-body drag (startFreeLinkDrag) is gated by isFreeBody. The older vertex-drag path is not (KNOWN fixtures cover it).
      const ids=allPointIds().filter(id=>{const f=Model.freeLinkForPoint(S.comps,id)||Model.freeTriangleForPoint(S.comps,id);return f&&plainBody(f,skip)&&Model.isFreeBody(S.comps,f,S.modules);});
      const id=pick(r,ids);if(id)step={op,pid:id,dx:ri(r,-40,40),dy:ri(r,-40,40)};
    }else if(op==='delete'){
      const c=pick(r,S.comps.filter(c=>['bar','triangle','motor'].includes(c.type)&&!skip.has(c.id)&&!c.barFusion&&!c.barFusionRoot&&!c.boxPanel));
      if(c&&S.comps.length>2)step={op,id:c.id};
    }else if(op==='theta'){
      const motors=[...new Set(['1',String(S.activeMotor),...Object.keys(S.motorAngles),...S.comps.map(c=>String(c.physicalMotor||c.motorMount&&c.motorMount.motorId||'')).filter(Boolean)])];
      step={op,motor:pick(r,motors),deg:ri(r,-180,180)};
    }else if(op==='reload')step={op};
    if(step)return step;
  }
  return {op:'theta',motor:String(S.activeMotor),deg:0};
}

// ------------------------------------------------------------------ invariants
const ptsOf=c=>pointKeysFor(c).map(k=>c[k]).filter(Boolean);
function rigidProblems(r){
  const out=[],P=r.points,d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),skip=syringeInvolved();
  for(const c of S.comps){
    if(!isBody(c)||skip.has(c.id)||c.style==='piston'||!c.p1||!c.p2)continue;
    const a=P[c.p1.id],b=P[c.p2.id];if(!a||!b)continue;
    const sides=c.type==='bar'?[[a,b,c.lenParam,'length']]:[[a,b,c.gParam,'g'],[a,P[c.p3?.id],c.r1Param,'r1'],[b,P[c.p3?.id],c.r2Param,'r2']];
    for(const [u,v,key,what] of sides){if(!u||!v||!key||!Number.isFinite(S.topo.params[key]))continue;const err=Math.abs(d(u,v)-S.topo.params[key]);if(err>TOL)out.push(`${c.id} ${what} ${d(u,v).toFixed(3)} != ${S.topo.params[key]} (err ${err.toFixed(3)})`);}
    let solved;try{solved={...c,p1:{...c.p1,...a},p2:{...c.p2,...b},...(c.p3&&P[c.p3.id]?{p3:{...c.p3,...P[c.p3.id]}}:{})};}catch(_){continue;}
    for(const h of localHoles(c)){const q=P[h.id];if(!q)continue;let w;try{w=holeWorld(solved,h);}catch(_){continue;}if(!w||!Number.isFinite(w.x))continue;const err=d(q,w);if(err>TOL)out.push(`${c.id} hole ${h.id} off its (u,v) by ${err.toFixed(3)}`);}
  }
  return out;
}
const issueKey=i=>`${i.code}|${i.severity}|${[...i.parts].sort()}|${[...i.ids].sort()}`;
const badKeys=()=>new Set(checkWork(asWork(snapshot())).filter(i=>i.severity!=='notice').map(issueKey));
function relationSig(w){
  const net=buildRelations(w),ids=[...net._internal.copies().keys()].sort();
  return JSON.stringify(ids.map(id=>[id,net.copiesOf(id).map(c=>`${c.compId}:${c.key||c.holeId}`).sort()]));
}
function components(){
  const parent=new Map(),find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x);}return x;};
  const add=x=>{if(!parent.has(x))parent.set(x,x);};
  const join=(a,b)=>{add(a);add(b);parent.set(find(a),find(b));};
  for(const c of S.comps){const ids=[c.id,...ptsOf(c).map(p=>p.id),...localHoles(c).map(h=>h.id)];for(const id of ids)join(c.id,id);}
  const groups=new Map();for(const x of parent.keys()){const g=find(x);if(!groups.has(g))groups.set(g,new Set());groups.get(g).add(x);}
  return [...groups.values()];
}

class StepFailure extends Error{constructor(sig,detail){super(`${sig}: ${detail}`);this.sig=sig;this.detail=detail;}}

// Run a list of steps from a fresh work; throws StepFailure at the first violated invariant.
// `gen` (optional) is called before each step to produce it, which is how random runs are generated; steps are recorded.
function runSteps(workId,steps,gen,count,stats,tolerate){
  initState(WORKS[workId]());lastPoints=null;pushes=0;notices=[];
  let first=solveNow(null);let prev=first.isValid?first.points:null;lastPoints=prev;
  let bad=badKeys();
  const record=[];
  const n=gen?count:steps.length;
  for(let i=0;i<n;i++){
    const step=gen?gen():steps[i];record.push(step);
    const before=fingerprint();const prevTheta=S.theta;notices=[];
    let res=null;
    try{res=OPS[step.op](step);}catch(e){throw new StepFailure('throw:'+step.op,`${e.stack.split('\n').slice(0,3).join(' | ')}`);}
    if(stats){stats.tried[step.op]=(stats.tried[step.op]||0)+1;}
    if(stats&&process.env.OPSEQ_REASONS&&notices.length)(stats.why??={})[step.op+': '+notices[0].slice(0,50)]=((stats.why??={})[step.op+': '+notices[0].slice(0,50)]||0)+1;
    if(!res||fingerprint()===before&&!res.reloaded){if(res&&res.strict===undefined&&stats)stats.refused[step.op]=(stats.refused[step.op]||0)+1;if(!res&&stats)stats.na[step.op]=(stats.na[step.op]||0)+1;continue;}
    if(stats){stats.committed[step.op]=(stats.committed[step.op]||0)+1;stats.steps++;}
    try{
      // Solve with the previous pose as the seed (as playback does) so branch choice follows the previous step.
      let sol;try{sol=solveNow(prev);}catch(e){throw new StepFailure('throw:solve',e.message);}
      const valid=!!sol?.isValid;
      if(valid){
        // 1 rigid geometry
        const probs=rigidProblems(sol);if(probs.length)throw new StepFailure('rigid',`${step.op}: ${probs.slice(0,3).join('; ')}`);
        // 3 pose continuity
        if(prev){
          const exempt=new Set();
          if(!res.strict){for(const g of components())if([...res.touched||[]].some(t=>g.has(t))||res.split||res.deleted||res.reloaded)for(const x of g)exempt.add(x);}
          const dTheta=res.theta?Math.abs(((S.theta-prevTheta)%360+540)%360-180)*Math.PI/180:0;
          let reach=0;for(const q of Object.values(sol.points))reach=Math.max(reach,Math.hypot(q.x,q.y));
          const bound=JUMP+(res.resize?3*res.resize:0)+dTheta*reach+(res.moved||0)+(res.theta&&String(step.motor)!==String(S.activeMotor)?0:0);
          for(const [id,q] of Object.entries(sol.points)){
            const p=prev[id];if(!p||exempt.has(id)||res.reloaded)continue;
            const j=Math.hypot(q.x-p.x,q.y-p.y);
            if(j>bound)throw new StepFailure('jump',`${step.op}: point ${id} moved ${j.toFixed(1)} mm (bound ${bound.toFixed(1)})`);
          }
        }
        prev=sol.points;lastPoints=prev;
      }else{stats&&(stats.invalid=(stats.invalid||0)+1);lastPoints=sol?.points||null;}
      // 2 integrity: no new contradiction/dangling
      const now=badKeys();
      const added=[...now].filter(k=>!bad.has(k));
      if(added.length){
        const it=checkWork(asWork(snapshot())).filter(x=>added.includes(issueKey(x)))[0];
        throw new StepFailure('integrity:'+it.code,`${step.op}: ${it.severity} ${it.message}`);
      }
      bad=now;
      // 4 round trip: same relations after save/reload
      const live=relationSig(asWork(snapshot())),re=relationSig(asWork(reload()));
      if(live!==re)throw new StepFailure('roundtrip',`${step.op}: relations differ after save/reload`);
    }catch(e){
      const f=e instanceof StepFailure?e:new StepFailure('throw:check',e.stack.split('\n').slice(0,3).join(' | '));
      f.index=i;f.steps=record;
      // A failure class that already has a KNOWN fixture does not stop a random run: it is counted, the contradiction it
      // leaves behind becomes the new baseline, and the remaining operations keep being exercised.
      if(tolerate&&tolerate(f.sig,step)){stats.toleratedHits=(stats.toleratedHits||0)+1;bad=badKeys();try{const sol=solveNow(prev);if(sol?.isValid){prev=sol.points;lastPoints=prev;}}catch(_){}continue;}
      throw f;
    }
  }
  return record;
}
const sigOf=(workId,steps)=>{try{runSteps(workId,steps);return null;}catch(e){return e instanceof StepFailure?e.sig:'throw:'+e.message;}};

// ddmin-style shrink: keep a smaller step list as long as the same failure signature persists.
function shrink(workId,steps,sig){
  let cur=steps.slice();
  for(let chunk=Math.ceil(cur.length/2);chunk>=1;chunk=Math.floor(chunk/2)){
    for(let i=0;i<cur.length;){
      const trial=cur.slice(0,i).concat(cur.slice(i+chunk));
      if(trial.length&&sigOf(workId,trial)===sig)cur=trial;else i+=chunk;
    }
    if(chunk===1)break;
  }
  return cur;
}

// ------------------------------------------------------------------ fixtures (replays)
const slug=s=>s.replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-|-$/g,'');
const fixtures=[];
if(existsSync(SEQ))for(const f of readdirSync(SEQ).filter(f=>f.endsWith('.json')).sort())fixtures.push({file:f,...JSON.parse(readFileSync(new URL(f,SEQ),'utf8'))});
let known=0,regressions=0;const knownKeys=new Set();
for(const fx of fixtures){
  const sig=sigOf(fx.work,fx.steps);
  if(fx.known){known++;knownKeys.add(`${fx.work}|${fx.seed}|${fx.signature}`);console.log(`KNOWN  ${fx.file}: ${fx.signature} -- ${fx.known}${sig?'':'  (no longer fails)'}`);continue;}
  check(`replay ${fx.file} (${fx.work}, ${fx.steps.length} steps) no longer fails`,!sig,sig||'');
  if(sig)regressions++;
}

// A KNOWN fixture also tolerates later hits of its class (same signature, same failing operation) in random runs.
const knownClasses=new Set(fixtures.filter(f=>f.known).map(f=>`${f.signature}|${f.steps.at(-1).op}`));
const tolerate=(sig,step)=>sig.startsWith('integrity:')&&knownClasses.has(`${sig}|${step.op}`);

// ------------------------------------------------------------------ random runs
const RUNS_PER_WORK=2*SCALE,STEPS_PER_RUN=80;      // 6 works x 2 runs x 80 attempted steps, about 500 committed
const SEEDS=[20261110,7,1234567,98765,424242,31337,5150,8086,271828,314159];
const stats={tried:{},committed:{},refused:{},na:{},steps:0,invalid:0};
const t0=Date.now();
let found=0;
for(const workId of WORK_IDS){
  for(let run=0;run<RUNS_PER_WORK;run++){
    const seed=SEEDS[run%SEEDS.length]+Math.floor(run/SEEDS.length)*1000003+WORK_IDS.indexOf(workId)*17;
    const r=rngFrom(seed);let steps=null,failure=null;
    try{steps=runSteps(workId,null,()=>generate(r),STEPS_PER_RUN,stats,tolerate);}
    catch(e){
      if(!(e instanceof StepFailure))throw e;
      failure=e;steps=e.steps;
    }
    if(!failure){if(VERBOSE)console.log(`${workId} seed ${seed}: ok`);continue;}
    found++;
    const sig=failure.sig,shrunk=shrink(workId,steps,sig);
    const key=`${workId}|${seed}|${sig}`;
    const name=`${slug(workId)}-${seed}-${slug(sig)}`;
    if(knownKeys.has(key)){console.log(`KNOWN (seen) ${name}`);continue;}
    mkdirSync(SEQ,{recursive:true});
    const file=new URL(`${name}.json`,SEQ);
    if(!existsSync(file))writeFileSync(file,JSON.stringify({work:workId,seed,signature:sig,detail:failure.detail,steps:shrunk},null,1)+'\n');
    check(`${workId} seed ${seed} step ${failure.index}: ${sig}`,false,`${failure.detail}\n  replay: test/fixtures/sequences/${name}.json (${shrunk.length} steps)\n  ${shrunk.map(s=>JSON.stringify(s)).join('\n  ')}`);
  }
}
const secs=((Date.now()-t0)/1000).toFixed(1);
console.log(`operation sequences: ${stats.steps} committed steps (${Object.values(stats.tried).reduce((a,b)=>a+b,0)} attempted), ${stats.invalid} unsolvable poses skipped for geometry/continuity, ${known} KNOWN fixtures (${stats.toleratedHits||0} random-run hits of those classes), ${secs}s`);
console.log('  committed by op: '+Object.entries(stats.committed).map(([k,v])=>`${k}=${v}`).join(' '));
console.log('  not applicable at execution: '+JSON.stringify(stats.na));
console.log('  refused/no-op by op: '+Object.entries(stats.tried).map(([k,v])=>`${k}=${v-(stats.committed[k]||0)}`).join(' '));
if(stats.why)console.log(stats.why);
check('random runs finished within the time budget',Date.now()-t0<120000*SCALE,`${secs}s`);
check('no new failures in default seeds',found===0||knownKeys.size>=found,`${found} failing runs`);
report('operation-sequences');
