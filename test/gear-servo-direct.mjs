import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {planMotorDrop,planDraggedMotorOutput,planPlacedMotorOutput} from '../js/blocks/motor-drop.js';
import {planMotorInstallation,actuatorHostPoints} from '../js/blocks/actuator-installation.js';
import {connectDraggedMotorOutput} from '../js/blocks/motor-drop-ui.js';
import {planMotorRelease} from '../js/blocks/motor-release.js';
import {planMemberFrame} from '../js/blocks/member-frame.js';
import {pointCoords} from '../js/blocks/model.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {toStoredShape,prepareMotorParts} from '../js/blocks/storage.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {deleteSelectedPart,planDelete} from '../js/blocks/delete-part.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
import {withMotorShaftHoles} from '../js/core/local-holes.js';
import {encodeSnapshot} from '../js/share-codec.js';

globalThis.document={getElementById:()=>null};globalThis.window={confirm:()=>assert.fail('unexpected confirmation')};
const fabrication=structuredClone(FABRICATION_DEFAULTS);
Object.assign(fabrication.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});
const plate=makeStandardBlank({kind:'plate',columns:18,rows:14,origin:{x:-64,y:-48},n:1});
const request={type:'mg995',face:'back',orientation:'horizontal',angleDeg:45,start:-35,end:65,position:{x:0,y:0}};
function source(mode){
 const base={kind:'blocks',v:1,counter:10,comps:mode==='standalone'?[]:[structuredClone(plate.comp)],params:{...plate.params},fabrication};
 if(mode==='fixed')base.comps[0].p1.type=base.comps[0].p2.type='fixed';
 const mounted=mode==='standalone'?planMotorInstallation(base,{...request,hostId:'world'}):planMotorDrop(base,request);
 assert.ok(mounted.ok,mounted.message);
 const s={...base,comps:mounted.comps,params:mounted.params};
 s.comps.push({type:'gear',id:'Gear11',p1:{id:'GC11',type:'floating',x:-100,y:-90},p2:{id:'GP11',type:'floating',x:-84,y:-90},radiusParam:'GR11',pinRadiusParam:'GPR11',teeth:24,module:2,phase:0,pinHoleDiameter:5});
 Object.assign(s.params,{GR11:24,GPR11:16});return s;
}
const solve=(s,t)=>solveTopology(compileTopology(s.comps,{params:s.params},new Set()),{thetaDeg:t,motorAngles:{1:t}});
for(const mode of ['standalone','fixed','floating']){
 const s=source(mode),motor=s.comps.find(c=>c.type==='motor'),before=JSON.stringify(s),shaft=motor.p1.id;
 const r=planDraggedMotorOutput(s,'GC11',shaft,pointCoords(s.comps));assert.ok(r.ok,r.message);assert.equal(JSON.stringify(s),before,'candidate/cancel leaves source intact');
 const gear=r.comps.find(c=>c.id==='Gear11');assert.equal(gear.p1.id,shaft);assert.equal(gear.p1.physicalMotor,'1');assert.equal(gear.motorType,'mg995');assert.equal(gear.servoStart,-35);assert.equal(gear.servoEnd,65);assert.equal(gear.motorMount.partId,motor.id);assert.equal(gear.motorMount.angleDeg,motor.motorMount.angleDeg);assert.equal(gear.motorMount.frameBody,motor.motorMount.frameBody);
 assert.equal(r.comps.filter(c=>c.type==='bar').length,0,'no fake output rod');assert.ok(!r.comps.some(c=>c.type==='motor'));assert.equal(r.simulation.ok,mode!=='floating');
 if(mode==='floating')assert.ok(r.comps.every(c=>['p1','p2','p3'].every(k=>!c[k]||c[k].type==='floating')),'does not ground assembly');
 const n=normalizeSnapshot({...s,comps:r.comps,params:r.params});assert.ok(n);
 const file=await toStoredShape(n);await prepareMotorParts(file);const opened=normalizeSnapshot(file);assert.ok(opened);assert.equal(opened.comps.find(c=>c.id===gear.id).motorType,'mg995');
 let ready=mode==='floating'?{...opened,...planMemberFrame({...opened,id:plate.comp.id})}:opened;assert.ok(ready.comps);
 if(mode==='floating'){const ungrounded=structuredClone(ready);ungrounded.comps.find(c=>c.id===plate.comp.id).p1.type=ungrounded.comps.find(c=>c.id===plate.comp.id).p2.type='floating';assert.ok(solve(ungrounded,0).isUnderconstrained,'ungrounding does not leave a false fixed shaft');}
 if(mode==='floating'){const pinned=structuredClone(opened),h=pinned.comps.find(c=>c.id===plate.comp.id);const holes=h.holes.slice(0,2);holes.forEach(p=>p.type='fixed');assert.equal(withMotorShaftHoles(pinned.comps).find(c=>c.id===gear.id).p1.type,'fixed','two fixed grid holes ground the gear shaft');}
 const a=solve(ready,0),b=solve(ready,30);assert.ok(a.isValid&&!a.isUnderconstrained&&b.isValid&&!b.isUnderconstrained,`${mode}: ${a.errorReason} ${a.reason} ${a.isUnderconstrained}`);assert.ok(Math.hypot(a.points.GP11.x-b.points.GP11.x,a.points.GP11.y-b.points.GP11.y)>1,'real rotation');
 const host=s.comps.find(c=>c.id===motor.motorMount.frameBody),hostEnd=host&&actuatorHostPoints(host).find(p=>p.id===shaft).key;
 for(const released of [planMotorInstallation({...s,comps:r.comps,params:r.params},{...request,existingId:gear.id,outputId:'',hostId:host?.id||'world',hostEnd},pointCoords(r.comps)),planMotorRelease({...s,comps:r.comps,params:r.params},gear.id,pointCoords(r.comps))]){
  assert.ok(released.ok,released.message);const m=released.comps.find(c=>c.type==='motor'),g=released.comps.find(c=>c.id===gear.id);assert.equal(m.id,motor.id);assert.equal(m.servoStart,-35);assert.equal(m.servoEnd,65);assert.equal(m.motorMount.frameBody,motor.motorMount.frameBody);assert.notEqual(g.p1.id,shaft);assert.equal(g.p1.type,'floating');assert.ok(!g.motorMount&&!g.p1.physicalMotor);assert.deepEqual({x:g.p2.x,y:g.p2.y},{x:gear.p2.x,y:gear.p2.y});
  assert.ok(planDraggedMotorOutput({...s,comps:released.comps,params:released.params},g.p1.id,m.p1.id).ok,'can reconnect released gear');
 }
 const state={comps:s.comps,topo:{params:s.params},fabrication,modules:[],theta:0,motorAngles:{},undoStack:[]},snap=()=>JSON.stringify(state.comps),expected=snap();
 const args={S:state,fromId:'GC11',toId:shaft,candidate:s,points:pointCoords(s.comps),before,expected,snapshotStr:snap,rebuild(){},draw(){},notify(){},selectLink(){assert.fail('gear is not a bar')},updateUndoBtn(){}};
 connectDraggedMotorOutput({...args,expected:'stale'});assert.equal(state.undoStack.length,0);connectDraggedMotorOutput(args);assert.equal(state.undoStack.length,1);assert.equal(state.undoStack[0],before);
 // A shared-ID new gear takes the same planner; visual overlap alone is not enough.
 const placed=structuredClone(s),g=placed.comps.find(c=>c.id==='Gear11'),dx=motor.p1.x-g.p1.x,dy=motor.p1.y-g.p1.y;for(const k of ['p1','p2']){g[k].x+=dx;g[k].y+=dy;}
 assert.equal(planPlacedMotorOutput(placed,g.id).matched,false);g.p1.id=shaft;assert.ok(planPlacedMotorOutput(placed,g.id).ok);
}
// The whole loose gear pair stays ungrounded on a floating carrier; existing mesh is preserved.
{
 const s=source('floating'),g=s.comps.find(c=>c.id==='Gear11');s.comps.push({...structuredClone(g),id:'Gear12',mesh:g.id,p1:{id:'GC12',type:'floating',x:-52,y:-90},p2:{id:'GP12',type:'floating',x:-36,y:-90}});
 const motor=s.comps.find(c=>c.type==='motor'),r=planDraggedMotorOutput(s,g.p1.id,motor.p1.id);assert.ok(r.ok,r.message);assert.equal(r.simulation.ok,false);assert.equal(r.comps.find(c=>c.id==='Gear12').p1.type,'floating');assert.equal(r.comps.find(c=>c.id==='Gear12').mesh,g.id);
 const b=structuredClone(s);b.comps.find(c=>c.id==='Gear11').p2.type='fixed';assert.equal(planDraggedMotorOutput(b,g.p1.id,motor.p1.id).ok,false,'existing fixed constraint protected');
}
// A released train can reconnect in place without moving or deleting fixed companions.
{
 const s=source('fixed'),g=s.comps.find(c=>c.id==='Gear11');s.comps.push({...structuredClone(g),id:'Gear12',mesh:g.id,p1:{id:'GC12',type:'floating',x:-52,y:-90},p2:{id:'GP12',type:'floating',x:-36,y:-90}});
 const motor=s.comps.find(c=>c.type==='motor'),r=planDraggedMotorOutput(s,g.p1.id,motor.p1.id);assert.ok(r.ok,r.message);
 const a=solve({...s,...r},25);assert.ok(a.isValid&&!a.isUnderconstrained);
 const host=r.comps.find(c=>c.id===plate.comp.id),req={...request,existingId:g.id,outputId:'',hostId:host.id,hostEnd:actuatorHostPoints(host).find(p=>p.id===motor.p1.id).key};
 for(const released of [planMotorInstallation({...s,...r},req,a.points),planMotorRelease({...s,...r},g.id,a.points)]){
  assert.ok(released.ok,released.message);const gear=released.comps.find(c=>c.id===g.id),other=released.comps.find(c=>c.id==='Gear12'),m=released.comps.find(c=>c.type==='motor');assert.equal(other.mesh,g.id);assert.equal(other.p1.type,'fixed');assert.deepEqual(other.p1,r.comps.find(c=>c.id==='Gear12').p1,'fixed axle retained');assert.equal(other.p2.x,a.points.GP12.x);assert.equal(other.p2.y,a.points.GP12.y);
  assert.equal(gear.p2.x,a.points.GP11.x);assert.equal(gear.p2.y,a.points.GP11.y);
  const again=planDraggedMotorOutput({...s,...released},gear.p1.id,m.p1.id,{}, {thetaDeg:25});assert.ok(again.ok,again.message);assert.equal(again.simulation.ok,true);assert.equal(again.comps.find(c=>c.id==='Gear12').mesh,g.id);
  assert.equal(planDraggedMotorOutput({...s,...released},gear.p1.id,m.p1.id,{[m.p1.id]:{x:m.p1.x+8,y:m.p1.y}}).ok,false,'fixed train cannot be translated');
 }
}
// Deleting an output gear keeps its physical motor, just like deleting an output bar.
await loadIntegrity();
for(const type of ['mg995','tt'])for(const mode of ['standalone','fixed','floating']){
 const s=source(mode),originalMotor=s.comps.find(c=>c.type==='motor');originalMotor.motorType=type;
 const attached=planDraggedMotorOutput(s,'GC11',originalMotor.p1.id);assert.ok(attached.ok,attached.message);
 const work={...s,...attached},gear=work.comps.find(c=>c.id==='Gear11'),shown=mode==='floating'?pointCoords(work.comps):solve(work,25).points;
 const before=JSON.stringify(work),pure=planDelete({...work,points:shown},{part:gear});assert.ok(pure.ok,pure.message);assert.equal(JSON.stringify(work),before);
 const state={comps:structuredClone(work.comps),topo:{params:{...work.params}},fabrication,modules:[],counter:20,selectedGearId:gear.id},undos=[],notes=[];
 assert.ok(deleteSelectedPart({S:state,points:shown,transient:m=>notes.push(m),pushUndo:()=>undos.push(JSON.stringify({comps:state.comps,params:state.topo.params})),pause(){},closeMobileEditPanel(){},setSliderDetailRows(){},rebuild(){},draw(){}}),notes.join('|'));
 assert.equal(undos.length,1);assert.deepEqual(JSON.parse(undos[0]),{comps:work.comps,params:work.params});
 assert.ok(!state.comps.some(c=>c.type==='gear'));const kept=state.comps.find(c=>c.type==='motor');assert.ok(kept);assert.equal(kept.id,originalMotor.id);assert.equal(kept.motorType,type);assert.equal(kept.physicalMotor,originalMotor.physicalMotor);assert.equal(kept.motorMount.frameBody,originalMotor.motorMount.frameBody);assert.equal(kept.motorMount.face,originalMotor.motorMount.face);assert.equal(kept.motorMount.angleDeg,originalMotor.motorMount.angleDeg);assert.equal(kept.motorMount.reversed,originalMotor.motorMount.reversed);assert.equal(kept.p1.x,shown[gear.p1.id].x);assert.equal(kept.p1.y,shown[gear.p1.id].y);
 if(type==='mg995'){assert.equal(kept.servoStart,-35);assert.equal(kept.servoEnd,65);}
 if(mode!=='standalone'){const a=work.comps.find(c=>c.id===plate.comp.id),b=state.comps.find(c=>c.id===plate.comp.id);assert.deepEqual(b.holes,a.holes);assert.deepEqual(b.standardBlank.mountHoles,a.standardBlank.mountHoles);assert.equal(b.motorMountPoint,a.motorMountPoint);}
 assert.match(notes.join('|'),/馬達留在.*尚未接輸出/);
 const file=await toStoredShape({...s,comps:state.comps,params:state.topo.params});await prepareMotorParts(file);const reopened=normalizeSnapshot(file);assert.ok(reopened);assert.deepEqual(reopened.comps.find(c=>c.type==='motor'),kept,'kept hardware saves and reopens');
}
console.log('Deleting attached gear: MG995/TT standalone/fixed/floating, retained identity/settings/shaft/host holes, pure plan, one undo and save/reopen passed');
// Optional browser fixture output, kept out of normal test runs.
if(process.argv.includes('--fixture')){
 mkdirSync('output/gear-servo-direct',{recursive:true});const modes=['floating','fixed','standalone'];const links=[];
 for(const mode of modes){const s=source(mode);writeFileSync(`output/gear-servo-direct/${mode}.json`,JSON.stringify(s,null,2));links.push(`<p><a href="../../blocks.html#m=${encodeSnapshot(s)}">${mode}: MG995 + loose gear</a></p>`);}
 writeFileSync('output/gear-servo-direct/index.html',`<!doctype html><meta charset="utf-8"><title>MG995 direct gear fixtures</title><h1>MG995 direct gear fixtures</h1><p>Drag the red gear centre onto the MG995 shaft. Floating carrier should assemble and remain unavailable for simulation until grounded. Settings: 45° housing, −35° to 65° servo range.</p>${links.join('')}`);
}
console.log('MG995 direct gear: standalone/fixed/floating carriers, drag/new shared ID, settings, real rotation after grounding, release/reconnect, save/reopen, stale/cancel/undo and protected constraints passed');
