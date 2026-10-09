import assert from 'node:assert/strict';
import {openFaceWizard} from '../js/blocks/face-wizard-ui.js';
import {LOAD_GRAPH_TOKEN} from '../js/load-graph.js';
import {f1AssemblyFixture,f1NestedFixture} from './fixtures/f1-assembly-fixture.mjs';
import {bracketFixture} from './fixtures/face-bracket-fixture.mjs';
import {buildFaceCandidate,faceCandidateModel,validateFaceCandidate,createFaceCandidateTransaction,faceSourceRevision,freezeData} from '../js/blocks/face-candidate.js';
import {candidateMaterialFaces,candidateHostFace,candidateCoverageText,candidateConfirmLabel} from '../js/blocks/face-candidate-view.js';
import {prepareConnectionWork} from '../js/blocks/connection-work.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
let receiver,iframe,commits=0;const messages=[];
class Element {
 constructor(tag){this.style={};this.listeners={};if(tag==='iframe'){iframe=this;this.contentWindow={postMessage:data=>messages.push(data)};}}
 setAttribute(){}append(){}remove(){}addEventListener(t,f){this.listeners[t]=f;}showModal(){}close(){this.listeners.close?.();}
}
globalThis.document={createElement:t=>new Element(t),body:new Element('body')};
globalThis.window={addEventListener:(t,f)=>{if(t==='message')receiver=f;},removeEventListener(){}};
globalThis.location={origin:'https://example.test'};globalThis.matchMedia=()=>({matches:false});
const f=f1AssemblyFixture({mounted:false}),before=JSON.stringify(f);
openFaceWizard({...f,childId:f.modules[1].id,stockMm:4,joint:f.fabrication.joint,exportSettings:f.fabrication.export,isCurrent:()=>true,commit:()=>commits++,say:()=>{}});
const send=data=>receiver({origin:location.origin,source:iframe.contentWindow,data});
send({type:'face-wizard-ready',loadGraph:LOAD_GRAPH_TOKEN});
const init=messages.at(-1),selection={...init.selection,host:0,child:0,alignU:0,alignV:0,offsetU:0,offsetV:0,gap:1,quarterTurns:1,brackets:{enabled:true,offsets:{},childPart:'frame'}};
send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,selection});
assert.equal(commits,0,'invalid bracket request must be rejected, never silently saved without brackets');
assert.equal(JSON.stringify(f),before,'candidate processing must not mutate input');
console.log('face candidate invalid request regression passed');
const request={childId:f.modules[1].id,hostEndpoint:{moduleId:f.modules[0].id,outputId:init.hosts[0].surface.outputId,partId:init.hosts[0].surface.compId},childEndpoint:{partId:'frame'},selection};
const invalid=buildFaceCandidate(f,request);assert.equal(invalid.ok,false);assert.equal(invalid.validation.checks[0].code,'fastener_invalid');
const invalidShown=await validateFaceCandidate(invalid);assert.equal(invalidShown.saveable,false);assert.ok(invalidShown.model.materialParts.length>10,'valid placement remains visible when requested fasteners fail');assert.equal(invalidShown.model.materialParts.filter(p=>p.geometry.kind==='bracket-wing').length,0,'unconfirmed holes and hardware are not generated');assert.ok(invalidShown.work.modules.at(-1).mount.face.selection.brackets,'requested fasteners are retained, never silently downgraded');assert.equal(candidateConfirmLabel(invalidShown),'接上');
const frozen=freezeData(structuredClone({...f,topo:{params:f.params}})),validRequest={...request,selection:{...selection,gap:0}};
const original=JSON.stringify(frozen),candidate=buildFaceCandidate(frozen,validRequest);assert.ok(candidate.ok,candidate.reason);assert.equal(candidate.bracket.physical.length,3);
const checked=await validateFaceCandidate(candidate,{theta:20,motorAngles:{'1':20,'2':0}});
assert.ok(checked.saveable);assert.equal(checked.validation.status,'fail');assert.equal(checked.validation.material.findings.length,2,'original real F1 penetrations must remain visible');
assert.equal(candidateConfirmLabel(checked),'接上（有干涉）');assert.equal(candidateConfirmLabel(checked,true),'接上','waiting for changed selection cannot present an old collision as current');
assert.equal(checked.model.materialParts.length,31);assert.ok(checked.validation.coverage.notSupported.every(r=>r.code==='material_representation_not_supported'));
assert.equal(JSON.stringify(frozen),original,'full frozen topo/comps/modules/fabrication survive compile/rebake/validation');
const unavailable=await validateFaceCandidate(candidate,{},async model=>({status:'not_supported',geometryKey:model.geometryKey,poseRevision:model.poseRevision,findings:[],coverage:{notSupported:[{code:'material_geometry_unavailable',partId:'frame'}]}}));
assert.equal(unavailable.saveable,false);assert.equal(candidateCoverageText(unavailable).hardwareOnly,false);assert.match(candidateCoverageText(unavailable).summary,/板件.*尚未驗證/);assert.match(candidateCoverageText(checked).title,/五金/);
// Home-box U/V directions must match an independently measured candidate shift.
// The moving host starts at 45 degrees, then rotates another 20/40 degrees;
// a nested fixture adds a separate world rotation before that movement.
const near=(a,b)=>assert.ok(Math.hypot(...['x','y','z'].map(k=>a[k]-b[k]))<1e-6,JSON.stringify({a,b}));
for(const fixture of [f1AssemblyFixture({mounted:false}),f1NestedFixture()]){
 const host=fixture.modules.at(-2),child=fixture.modules.at(-1),crank=fixture.comps.find(c=>c.moduleId===host.id&&c.type==='bar'&&c.isInput);
 for(const c of fixture.comps.filter(c=>c.moduleId===host.id)){for(const p of [c.p1,c.p2,c.p3].filter(Boolean)){const {x,y}=p;p.x=(x-y)/Math.SQRT2;p.y=(x+y)/Math.SQRT2;}if(c.type==='bar'&&c.isInput)c.phaseOffset=(c.phaseOffset || 0)+45;}
 host.outputs=[{id:'crank',at:crank.p1.id,body:{kind:'bar',id:crank.id}}];
 const request={childId:child.id,hostEndpoint:{moduleId:host.id,outputId:'crank',partId:crank.id},childEndpoint:{partId:'frame'},reselect:true,selection:{hostFace:'back',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:1}};
 for(const theta of [0,20,40]){
  const make=request=>{const c=buildFaceCandidate(fixture,request);assert.ok(c.ok,c.reason);return {...c,...faceCandidateModel(c,{theta,motorAngles:{'1':theta,'2':0}})};};
  const base=make(request),face=candidateHostFace(base,'back');assert.ok(Math.abs(base.hostReference.angle-Math.PI/4)<1e-8);
  const childPose=c=>c.model.materialParts.find(p=>p.moduleId===child.id&&p.geometry.kind==='mounted-frame').pose.matrix,p=childPose(base);
  for(const [key,axis] of [['offsetU','u'],['offsetV','v']]){const q=childPose(make({...request,selection:{...request.selection,[key]:1}}));near({x:q[12]-p[12],y:q[13]-p[13],z:q[14]-p[14]},face[axis]);}
  const a=theta*Math.PI/180;near(face.u,fixture.modules.length===2?{x:Math.cos(a),y:Math.sin(a),z:0}:{x:-Math.sin(a),y:Math.cos(a),z:0});
 }
}
const fixed=bracketFixture(),fixedCandidate=buildFaceCandidate(fixed,{childId:'Child',hostEndpoint:{moduleId:'Host',outputId:'plate',partId:'HostBar'},childEndpoint:{partId:'frame'},selection:{hostFace:'back',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:1}});
const fixedChecked=await validateFaceCandidate(fixedCandidate);assert.ok(fixedChecked.saveable);assert.ok(fixedChecked.model.sticks.some(s=>s.id==='HostBar'));assert.ok(fixedChecked.model.materialParts.some(p=>p.partId==='HostBar'));assert.ok(fixedChecked.model.materialParts.some(p=>p.partId==='Child-frame'));assert.ok(!fixedChecked.validation.coverage.notSupported.some(r=>r.kind==='material'));
// Two islands, each drilled: no cap may paint another island's hole as material.
const rectangle=x=>[{x,y:0},{x:x+10,y:0},{x:x+10,y:10},{x,y:10}],identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const faces=candidateMaterialFaces({materialParts:[{partId:'islands',pickKey:'islands',pose:{matrix:identity},geometry:{kind:'frame',outlines:[rectangle(0),rectangle(20)],holes:[{x:5,y:5,r:1},{x:25,y:5,r:1}],cutouts:[],thicknessMm:4}}]});
const inside=(p,ring)=>ring.reduce((odd,a,i)=>{const b=ring[(i+1)%ring.length];return ((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)?!odd:odd;},false);
const caps=faces.filter(f=>f.rings.every(r=>r.every(p=>p.z===0)));assert.equal(caps.length,1);
for(const cap of caps)for(const p of [{x:5,y:5},{x:25,y:5}])assert.equal(cap.rings.reduce((odd,r)=>odd!==inside(p,r),false),false,'drilled void cannot become an outside material island');
console.log('candidate shared fixed members, required-material refusal, home45 dynamic/nested U/V and disjoint-island holes passed');
const committed=structuredClone(candidate.work);prepareConnectionWork(committed.comps,committed.modules,committed.topo,{stockMm:4,exportSettings:committed.exportSettings});
assert.deepEqual(committed.comps,candidate.work.comps);assert.deepEqual(committed.modules,candidate.work.modules);assert.deepEqual(committed.topo,candidate.work.topo,'candidate is already the normal rebuild result');
const asm=compileAssembly(structuredClone(candidate.work.comps),structuredClone(candidate.work.modules),structuredClone(candidate.work.topo));
let seed=null;for(const theta of [0,20,40]){const sol=solveAssembly(asm,{thetaDeg:theta,motorAngles:{'1':theta,'2':0},_prevPoints:seed});seed=sol.points;
 const preview=await validateFaceCandidate(candidate,{theta,motorAngles:{'1':theta,'2':0},_prevPoints:seed});assert.deepEqual(preview.points,sol.points,'continuous formal and candidate solve branches agree');}
const both=solveAssembly(asm,{thetaDeg:12,motorAngles:{'1':20,'2':12},_prevPoints:seed});
const motor2=await validateFaceCandidate(candidate,{theta:12,motorAngles:{'1':20,'2':12},_prevPoints:both.points});assert.deepEqual(motor2.points,both.points,'M2 active does not overwrite frozen M1 angle');
assert.equal(faceSourceRevision({...f,params:{...f.params,theta:40},camera:{yaw:30}}),faceSourceRevision(f));
for(const mutate of [s=>s.params[Object.keys(s.params).find(k=>k!=='theta')]+=1,s=>s.fabrication.cnc.stockThicknessMm=6,s=>s.modules[0].faceParts.face='front',s=>s.modules[0].outputs[0].at='missing']){const s=structuredClone(f);mutate(s);assert.notEqual(faceSourceRevision(s),faceSourceRevision(f));}
let source=structuredClone(f),pose={theta:0,motorAngles:{'1':0,'2':0}},undos=0,saves=0,lastCommitted;
const tx=createFaceCandidateTransaction({readSource:()=>source,readPose:()=>pose,commit:w=>{undos++;saves++;lastCommitted=w;}});
let pv=await tx.preview(validRequest);assert.ok(pv.saveable);source.params.theta=40;assert.equal(faceSourceRevision(source),pv.sourceRevision);
const a=tx.confirm({candidateId:pv.candidateId,selectionRevision:pv.selectionRevision}),b=await tx.confirm({candidateId:pv.candidateId,selectionRevision:pv.selectionRevision});assert.equal(b.ok,false);assert.ok((await a).ok);assert.equal(undos,1);assert.equal(saves,1);assert.deepEqual(lastCommitted,pv.work);
assert.equal((await tx.confirm({candidateId:pv.candidateId,selectionRevision:pv.selectionRevision})).ok,false);
const stale=createFaceCandidateTransaction({readSource:()=>source,readPose:()=>pose,commit:()=>undos++});pv=await stale.preview(validRequest);source.fabrication.cnc.stockThicknessMm=6;assert.equal((await stale.confirm({candidateId:pv.candidateId,selectionRevision:pv.selectionRevision})).code,'source_stale');assert.equal(undos,1);
source=structuredClone(f);
const poseGuard=createFaceCandidateTransaction({readSource:()=>source,readPose:()=>pose,commit:()=>undos++});const pg=await poseGuard.preview(validRequest);pose={theta:20,motorAngles:{'1':20,'2':0}};assert.equal((await poseGuard.confirm({candidateId:pg.candidateId,selectionRevision:pg.selectionRevision})).code,'pose_stale');assert.equal(undos,1);pose={theta:0,motorAngles:{'1':0,'2':0}};
let release;const late=createFaceCandidateTransaction({readSource:()=>source,readPose:()=>pose,validate:c=>new Promise(r=>{release=()=>r({...c,saveable:true});}),commit:()=>undos++});
const pending=late.preview(validRequest);assert.equal((await late.confirm({})).code,'candidate_not_ready');late.cancel();release();assert.equal((await pending).code,'candidate_stale');assert.equal(undos,1);
const cancellation=createFaceCandidateTransaction({readSource:()=>source,commit:()=>undos++});await cancellation.preview({...validRequest,selection:{...selection,offsetU:NaN}});cancellation.cancel();assert.equal(undos,1);assert.equal(saves,1);
console.log('face candidate frozen inputs, shared rebuild, real material report, pose branches, revisions and once-only/cancel/race regressions passed');
// Real bench button → parent receiver → bench commit, including save:false rebuild.
const {S}=await import('../js/blocks/state.js'),{createBench}=await import('../js/blocks/bench-ui.js');
const elements=new Map();let dialog;
class FE extends Element {
 constructor(tag='div'){super(tag);this.style={removeProperty(){},setProperty(){}};this.tag=tag;this.children=[];this.dataset={};this.textContent='';this.classList={add(){},remove(){},toggle(){},contains:name=>(this.className || '').split(' ').includes(name)};if(tag==='dialog')dialog=this;}
 set id(id){this._id=id;elements.set(id,this);}get id(){return this._id;}
 get firstChild(){return this.children[0] || null;}appendChild(c){this.children.push(c);return c;}append(...cs){cs.forEach(c=>this.appendChild(c));}
 prepend(c){this.children.unshift(c);}removeChild(c){this.children=this.children.filter(x=>x!==c);return c;}replaceChildren(...cs){this.children=cs;}after(){}contains(c){return this.children.includes(c);}querySelector(){return null;}querySelectorAll(){return [];}getBoundingClientRect(){return {width:390,height:844};}
}
globalThis.document={documentElement:new FE(),body:new FE(),createElement:t=>new FE(t),getElementById:id=>elements.get(id) || null,addEventListener(){},querySelector:()=>null};
for(const id of ['benchList','benchPanel']){const node=new FE();node.id=id;}
let realSaves=0,realUndo=0,rebuildOptions=[],adopted=null,drawPoints=null;
const q=()=>{},sourceFixture=()=>{const fresh=f1AssemblyFixture({mounted:false});S.comps=fresh.comps;S.modules=fresh.modules;S.topo={params:fresh.params};S.fabrication=fresh.fabrication;S.mode='bench';S.theta=12;S.activeMotor='2';S.motorAngles={'1':20};S.undoStack=[];};sourceFixture();
const workSnapshot=()=>JSON.stringify([S.comps,S.modules,S.topo,S.fabrication]);
const bench=createBench({pushUndo:()=>{realUndo++;S.undoStack.push(workSnapshot());},scheduleAutosave:()=>realSaves++,rebuild:options=>{rebuildOptions.push(options);const p=prepareConnectionWork(S.comps,S.modules,S.topo,{stockMm:4,exportSettings:S.fabrication.export});S.modules=p.modules;if(options?.save!==false)realSaves++;},adoptConnectionPose:p=>{adopted=p;},draw:()=>{const sol=solveAssembly(compileAssembly(S.comps,S.modules,S.topo),{thetaDeg:S.theta,motorAngles:{...S.motorAngles,[S.activeMotor]:S.theta},_prevPoints:adopted});drawPoints=sol.points;},pause:q,transient:q,setViewPlane:q,motorState:()=>({theta:S.theta,motorAngles:S.motorAngles}),snapshotStr:workSnapshot,restoreSnapshot:q,getViewer:()=>null,is3DActive:()=>false,interferenceArgs:()=>({})});
const open=()=>{bench.select(S.modules[1].id);assert.ok(elements.get('benchFaceWizard'));elements.get('benchFaceWizard').listeners.click();send({type:'face-wizard-ready',loadGraph:LOAD_GRAPH_TOKEN});return messages.at(-1);};
for(const cancel of [()=>send({type:'face-wizard-cancel'}),()=>dialog.children[0].listeners.click(),()=>dialog.close()]){const beforeWork=workSnapshot();open();cancel();assert.equal(workSnapshot(),beforeWork);assert.equal(realSaves,0);assert.equal(realUndo,0,'cancel/close/native Esc close do not add undo');}
const benchInit=open(),benchSelection={...validRequest.selection,host:0,child:0};
await send({type:'face-wizard-preview',loadGraph:LOAD_GRAPH_TOKEN,requestId:1,selection:benchSelection});const bc=messages.at(-1).candidate;assert.ok(bc.saveable,JSON.stringify(bc));
await send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,candidateId:bc.candidateId,selectionRevision:bc.selectionRevision});
assert.equal(realUndo,1);assert.equal(realSaves,1);assert.deepEqual(rebuildOptions,[{save:false}]);assert.deepEqual(S.comps,bc.work.comps);assert.deepEqual(S.modules,bc.work.modules);assert.deepEqual(S.topo,bc.work.topo);assert.deepEqual(drawPoints,bc.points,'committed first draw uses the validated branch seed');assert.equal(Object.isFrozen(S.comps),false);S.comps[0].color='#112233';assert.notEqual(S.comps[0].color,bc.work.comps[0].color,'formal work remains editable without mutating frozen candidate');
await send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,candidateId:bc.candidateId,selectionRevision:bc.selectionRevision});assert.equal(realUndo,1);assert.equal(realSaves,1);
bench.workReplaced();assert.equal(elements.get('benchMsg').textContent,'','same-ID open clears the real bench notice');
console.log('real bench button/receiver: cancel, close/Esc, single undo/autosave, save:false rebuild, identical commit, repeated confirm and notice reset passed');
