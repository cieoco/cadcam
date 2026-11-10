import assert from 'node:assert/strict';
import {S} from '../js/blocks/state.js';
import * as Tools from '../js/blocks/tools.js';
import {pointCoords} from '../js/blocks/model.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {planMotorDrop,planPlacedMotorOutput,planDraggedMotorOutput} from '../js/blocks/motor-drop.js';
import {connectDraggedMotorOutput} from '../js/blocks/motor-drop-ui.js';
import {analyzeDof} from '../js/blocks/dof.js';
import {planMemberFrame} from '../js/blocks/member-frame.js';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
const plate=makeStandardBlank({kind:'plate',columns:16,rows:12,origin:{x:-64,y:-40}});
plate.comp.p1.type=plate.comp.p2.type='fixed';
const fabrication=structuredClone(FABRICATION_DEFAULTS);
Object.assign(fabrication.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});fabrication.drive.n20Spec=1;
const base={kind:'blocks',v:1,comps:[plate.comp],params:plate.params,fabrication};
const req={position:{x:0,y:0},face:'back',orientation:'horizontal',angleDeg:15,start:-20,end:70};
const coords=()=>pointCoords(S.comps);let undo=[],notes=[];
globalThis.document={getElementById:()=>null};globalThis.window={confirm:()=>assert.fail('unexpected confirmation')};
Tools.init({svg:{style:{}},draw(){},rebuild(){},pause(){},cancelMotorMode(){},deselectLink(){},selectLink(){},selectTriangle(){},
 pushUndo:()=>undo.push(structuredClone({comps:S.comps,params:S.topo.params})),setBanner(){},clearBanner(){},notify:m=>notes.push(m),
 worldFromEvent:e=>e?.world,pointCoords:coords,displayPointCoords:coords,snapWorld:()=>2,promptText:s=>s,
 nearestDisplayToPoint:(p,exclude=[])=>Object.entries(coords()).find(([id,q])=>!exclude.includes(id)&&Math.hypot(p.x-q.x,p.y-q.y)<.01)?.[0]});
for(const type of ['mg995','tt','n20'])for(const method of ['blank','draw-start','draw-end']){
 const installed=planMotorDrop(base,{...req,type});assert.ok(installed.ok,installed.message);
 Object.assign(S,{comps:installed.comps,topo:{params:installed.params},fabrication,modules:[],counter:10,theta:0,motorAngles:{}});undo=[];notes=[];
 const motor=S.comps.find(c=>c.type==='motor'),center=motor.p1.id,initial=JSON.stringify(S.comps);
 if(method==='blank'){Tools.startStandardBlank({kind:'bar',lengthMm:56});Tools.updateStandardBlank({origin:{x:0,y:0}});await Tools.confirmStandardBlank();}
 else{Tools.startDrawLink();Tools.startLinkAt(method==='draw-start'?{x:0,y:0}:{x:56,y:56});await Tools.finishDrawLink({world:method==='draw-start'?{x:56,y:56}:{x:0,y:0}});}
 const out=S.comps.find(c=>c.isInput);assert.ok(out,notes.join('\n'));assert.equal(S.comps.filter(c=>c.type==='motor').length,0);assert.equal(out.motorMount.partId,motor.id);assert.equal(out.motorMount.center,center);assert.equal(out.motorMount.frameBody,plate.comp.id);assert.ok(Math.abs(out.motorMount.angleDeg-15)<1e-8);
 if(type==='mg995'){assert.equal(out.servoStart,-20);assert.equal(out.servoEnd,70);}
 assert.equal(undo.length,1);assert.equal(JSON.stringify(undo[0].comps),initial);
 const saved=normalizeSnapshot({kind:'blocks',v:1,comps:S.comps,params:S.topo.params,fabrication});assert.ok(saved);const compiled=compileTopology(saved.comps,{params:saved.params},new Set());
 const a=solveTopology(compiled,{thetaDeg:0}),b=solveTopology(compiled,{thetaDeg:30});assert.ok(a.isValid&&b.isValid);const tip=out.p1.id===center?out.p2.id:out.p1.id;assert.ok(Math.hypot(a.points[tip].x-b.points[tip].x,a.points[tip].y-b.points[tip].y)>1,'output must move');
 const detached=planMotorInstallation(saved,{...req,type,existingId:out.id,outputId:'',hostId:plate.comp.id,hostEnd:center,orientation:'follow-frame'},a.points);assert.ok(detached.ok,detached.message);assert.ok(detached.comps.some(c=>c.type==='motor'&&c.id===motor.id));
}
const installed=planMotorDrop(base,{...req,type:'mg995'}),motor=installed.comps.find(c=>c.type==='motor'),rod=makeStandardBlank({kind:'bar',lengthMm:56,origin:{x:0,y:0},n:20});rod.comp.p1.id=motor.p1.id;
const work={...base,comps:[...installed.comps,rod.comp],params:{...installed.params,...rod.params}},before=JSON.stringify(work);
assert.ok(planPlacedMotorOutput(work,rod.comp.id).ok);assert.equal(JSON.stringify(work),before,'pure candidate');
rod.comp.p2.type='fixed';assert.equal(planPlacedMotorOutput(work,rod.comp.id).ok,false,'fixed opposite end is explained, not driven');rod.comp.p2.type='floating';
rod.comp.moduleId='other';assert.equal(planPlacedMotorOutput(work,rod.comp.id).ok,false);delete rod.comp.moduleId;
rod.comp.p1.id='Separate';assert.equal(planPlacedMotorOutput(work,rod.comp.id).matched,false,'visual overlap alone is not a connection');
console.log('Motor-first output placement: three models, standard/exact and both drawn endpoints, one undo, real motion, reopen, detach, conflicts and source purity passed');
for(const type of ['mg995','tt','n20'])for(const end of ['p1','p2']){
 const mounted=planMotorDrop(base,{...req,type}),m=mounted.comps.find(c=>c.type==='motor'),free=makeStandardBlank({kind:'bar',lengthMm:56,origin:{x:-10,y:-70},n:40});
 const s={...base,comps:[...mounted.comps,free.comp],params:{...mounted.params,...free.params}},original=JSON.stringify(s);
 const result=planDraggedMotorOutput(s,free.comp[end].id,m.p1.id,pointCoords(s.comps));assert.ok(result.ok,result.message);assert.equal(JSON.stringify(s),original);
 const o=result.comps.find(c=>c.id===free.comp.id);assert.equal(o[end].id,m.p1.id);assert.equal(o.motorMount.partId,m.id);assert.equal(result.params[o.lenParam],56);assert.ok(result.simulation.ok);
 const state={comps:s.comps,topo:{params:s.params},modules:[],fabrication,undoStack:[],theta:0,motorAngles:{}},snap=()=>JSON.stringify(state.comps),expected=snap();let message='';
 const args={S:state,fromId:free.comp[end].id,toId:m.p1.id,candidate:s,points:pointCoords(s.comps),before:original,expected,snapshotStr:snap,rebuild(){},draw(){},notify:v=>message=v,selectLink(){},updateUndoBtn(){}};
 connectDraggedMotorOutput({...args,expected:'stale'});assert.equal(state.undoStack.length,0);assert.equal(snap(),expected);
 connectDraggedMotorOutput(args);assert.equal(state.undoStack.length,1);assert.ok(state.comps.some(c=>c.isInput));assert.match(message,/已接上/);
 const blocked=structuredClone(s);blocked.comps.at(-1)[end==='p1'?'p2':'p1'].type='fixed';assert.equal(planDraggedMotorOutput(blocked,free.comp[end].id,m.p1.id).ok,false);
 const linked=structuredClone(s),q=linked.comps.at(-1);linked.comps.push({type:'bar',id:'Other',p1:{...q.p2},p2:{id:'Far',type:'floating',x:70,y:-70},fixedLen:true});assert.equal(planDraggedMotorOutput(linked,free.comp[end].id,m.p1.id).ok,false,'connected rod not silently detached');
}
console.log('Existing rod drop: all motors/both ends, pose/length, one undo, stale result, fixed/shared refusals passed');

// A floating carrier may be assembled before grounding; no world anchor is invented.
for(const type of ['tt','n20','mg995'])for(const end of ['p1','p2']){
 const loose=structuredClone(base);loose.comps[0].p1.type=loose.comps[0].p2.type='floating';
 const mounted=planMotorDrop(loose,{...req,type}),motor=mounted.comps.find(c=>c.type==='motor');
 const free=makeStandardBlank({kind:'bar',lengthMm:56,origin:{x:-10,y:-70},n:40});
 const source={...loose,comps:[...mounted.comps,free.comp],params:{...mounted.params,...free.params}},before=JSON.stringify(source);
 const attached=planDraggedMotorOutput(source,free.comp[end].id,motor.p1.id,pointCoords(source.comps));
 assert.ok(attached.ok,attached.message);assert.equal(JSON.stringify(source),before);
 assert.ok(attached.comps.every(c=>['p1','p2','p3'].every(k=>!c[k]||c[k].type==='floating')),'assembly must not ground any part');
 assert.equal(attached.simulation.ok,false,'floating assembly stays unavailable for simulation');
 const out=attached.comps.find(c=>c.id===free.comp.id);assert.equal(out.motorMount.partId,motor.id);assert.equal(out.motorMount.frameBody,plate.comp.id);
 const saved=normalizeSnapshot({...loose,comps:attached.comps,params:attached.params});assert.ok(saved);
 const grounded=planMemberFrame({...saved,id:plate.comp.id});assert.ok(grounded.ok,grounded.message);
 assert.equal(analyzeDof(grounded.comps).dof,1,'status counts mounted shaft joint');assert.equal(analyzeDof(saved.comps).dof,4,'free carrier still has three rigid-body freedoms');
 const compiled=compileTopology(grounded.comps,{params:saved.params},new Set()),a=solveTopology(compiled,{thetaDeg:0}),b=solveTopology(compiled,{thetaDeg:30});
 assert.ok(a.isValid&&!a.isUnderconstrained&&b.isValid&&!b.isUnderconstrained,'grounding completes the same assembly');
 const tip=out[end==='p1'?'p2':'p1'].id;assert.ok(Math.hypot(a.points[tip].x-b.points[tip].x,a.points[tip].y-b.points[tip].y)>1);
 const release=planMotorInstallation(saved,{...req,type,existingId:out.id,outputId:'',hostId:plate.comp.id,hostEnd:motor.p1.id,orientation:'follow-frame'},pointCoords(saved.comps));
 assert.ok(release.ok,release.message);assert.ok(release.comps.some(c=>c.id===motor.id&&c.type==='motor'));
 const reconnect=planMotorInstallation({...saved,...release},{...req,type,existingId:motor.id,outputId:out.id,outputEnd:end,hostId:plate.comp.id,hostEnd:motor.p1.id,orientation:'follow-frame'},pointCoords(release.comps));
 assert.ok(reconnect.ok,reconnect.message);assert.equal(reconnect.simulation.ok,false);
}
console.log('Floating plate output: three motors/both ends, attach/save/release/reconnect, no implicit grounding, explicit frame then real motion passed');
