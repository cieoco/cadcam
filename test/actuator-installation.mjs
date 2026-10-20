import assert from 'node:assert/strict';
import {actuatorSource as source} from './fixtures/actuator-installation.mjs';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {motorInstallationScene} from '../js/blocks/actuator-install-scene.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {buildMotorMounts,motorMountPatternRotDegForCenter} from '../js/blocks/motor-mounts.js';
const request={hostId:'Frame',hostEnd:'p1',outputId:'Arm',outputEnd:'p1',face:'back',orientation:'follow-frame',type:'mg995',angle:0};
const original=JSON.stringify(source);
for(const type of ['mg995','tt'])for(const face of ['front','back'])for(const end of ['p1','p2']){
 const r=planMotorInstallation(source,{...request,type,face,outputEnd:end,angle:30});assert.ok(r.ok,r.message);
 const arm=r.comps.find(c=>c.id==='Arm'),host=r.comps.find(c=>c.id==='Frame');
 assert.equal(arm[end].id,'A');assert.equal(host.motorMountPoint,'A');assert.equal(arm.motorCarrier,'Frame');assert.equal(arm.motorMount.face,face);
 assert.equal(host.p1.type,'fixed');assert.equal(host.p2.type,'fixed');
 const model=motorInstallationScene(r),motor=model.motors[0],frame=model.sticks.find(s=>s.id==='Frame'),output=model.sticks.find(s=>s.id==='Arm');
 assert.equal(motor.face,face);assert.equal(motor.shaftDirection,face==='front'?-1:1);
 if(face==='front'){assert.ok(output.z<frame.z);assert.ok(motor.shaftEndZ<motor.mountZ);}else{assert.ok(output.z>frame.z);assert.ok(motor.shaftEndZ>motor.mountZ);}
 const saved=normalizeSnapshot({kind:'blocks',v:1,comps:r.comps,params:r.params});
 assert.equal(saved.comps.find(c=>c.id==='Arm').motorMount.face,face);
 assert.ok(solveTopology(compileTopology(saved.comps,{params:saved.params},new Set()),{thetaDeg:45}).isValid);
 const edited=planMotorInstallation(saved,{...request,type,face,outputEnd:end,angle:30},r.points,{thetaDeg:30,motorAngles:{'1':30}});
 assert.ok(edited.ok,edited.message);assert.deepEqual(edited.points,r.points,'reopening mount settings does not shift phase');
}
assert.equal(JSON.stringify(source),original,'candidate does not mutate source');
assert.equal(planMotorInstallation(source,{...request,hostId:''}).ok,false);
assert.equal(planMotorInstallation(source,{...request,outputId:'Frame'}).ok,false);
assert.equal(planMotorInstallation(source,{...request,hostId:'world',face:'front'}).ok,false,'front face requires a real carrier');
const connected=structuredClone(source);connected.comps.push({type:'bar',id:'Other',p1:{...connected.comps[1].p2},p2:{id:'E',type:'floating',x:200,y:80},lenParam:'Q'});connected.params.Q=80;
assert.equal(planMotorInstallation(connected,request).ok,false,'connected output cannot be silently translated');
const base=planMotorInstallation(source,request);
const transfer=structuredClone(base);
transfer.comps.push({type:'bar',id:'Follower',p1:{id:'B',type:'fixed',x:80,y:0},p2:{id:'E',type:'floating',x:80,y:80},lenParam:'L',fixedLen:true},
 {type:'bar',id:'Coupler',p1:{...transfer.comps[1].p2},p2:{id:'E',type:'floating',x:80,y:80},lenParam:'F',fixedLen:true});
const transferred=planMotorInstallation(transfer,{...request,existingId:'Arm',outputId:'Follower',hostEnd:'p2',motorId:'2'});
assert.ok(transferred.ok,transferred.message);assert.equal(transferred.motor,'1');
assert.equal(transferred.comps.filter(c=>c.isInput).length,1,'changing output transfers the existing motor instead of duplicating it');
const moving=structuredClone(base);moving.comps.push({type:'bar',id:'Tool',p1:{...moving.comps[1].p2},p2:{id:'T',type:'floating',x:40,y:80},lenParam:'T',fixedLen:true});moving.params.T=40;
const ride={...request,hostId:'Arm',hostEnd:'p2',outputId:'Tool',motorId:'2',angle:20};
const r=planMotorInstallation(moving,ride,{}, {motorAngles:{'1':30}});assert.ok(r.ok,r.message);
assert.equal(r.comps.find(c=>c.id==='Tool').p1.type,'floating','riding motor is not grounded');
assert.equal(r.comps.find(c=>c.id==='Tool').motorCarrier,'Arm');
const r2=planMotorInstallation(moving,ride,{}, {motorAngles:{'1':60}});assert.ok(r2.ok,r2.message);assert.notDeepEqual(r.points.T,r2.points.T,'host motion carries actuator output');
assert.equal(planMotorInstallation(moving,{...ride,orientation:'horizontal'}).ok,false,'moving carrier cannot retain world orientation');
const gear=structuredClone(source);gear.comps[1]={type:'gear',id:'Gear',p1:{...gear.comps[0].p1},p2:{id:'P',type:'floating',x:20,y:0},teeth:20,module:2,radiusParam:'R',pinRadiusParam:'PR'};gear.params.R=20;gear.params.PR=20;
for(const face of ['front','back']){
 const r=planMotorInstallation(gear,{...request,outputId:'Gear',face});assert.ok(r.ok,r.message);
 const saved=normalizeSnapshot({kind:'blocks',v:1,comps:r.comps,params:r.params});assert.equal(saved.comps[1].motorMount.face,face);
 const model=motorInstallationScene(r);assert.equal(model.gears.length,1);assert.equal(model.motors.length,1);
 const host=model.sticks[0];assert.ok(face==='front'?host.z>model.gears[0].z:host.z<model.gears[0].z);
}
const horizontal=planMotorInstallation(source,{...request,orientation:'horizontal',reversed:true});
const mounts=buildMotorMounts({motorIds:new Set(['A']),groundIds:new Set(['A','B']),staticPoints:horizontal.points,comps:horizontal.comps,compiledSteps:[],sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:()=> 'mg995'});
const mount=mounts.get('A');assert.equal(motorMountPatternRotDegForCenter({id:'A',pts:horizontal.points,comps:horizontal.comps,mount}),mount.rotDeg-90,'export holes retain explicit orientation/reverse');
console.log('Actuator installation: fixed/riding motor, TT/servo, both ends/faces, gear, pure candidates, roundtrip, phase, 3D and holes passed');
