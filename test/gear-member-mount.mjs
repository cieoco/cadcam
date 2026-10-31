import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gearMountMember,planGearMemberMount,commitGearMemberMount} from '../js/blocks/gear-member-mount.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {inspectGearExport,exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
const source=JSON.parse(readFileSync(new URL('./fixtures/gear-member-mount.json',import.meta.url),'utf8'));
const request={memberId:'Link7_8',gearId:'GearB',centerId:'GCA_8',pinId:'GPA_8',matchRadius:true,flipPin:true};
const before=JSON.stringify(source),near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
const tracked={...source,tracePoint:'GPA_8',tracePoints:['GPA_8','P7b_8'],referencePoint:'GCA_8',dimensions:[{a:{pointId:'GPA_8'},b:{pointId:'GCA_8'},baseline:'h:GCA_8'}]};
assert.deepEqual(planGearMemberMount(tracked,request).references,{tracePoint:'GPB',tracePoints:['GPB','P7b_8'],referencePoint:'GCB',dimensions:[{a:{pointId:'GPB'},b:{pointId:'GCB'},baseline:'h:GCB'}]});
assert.match(gearMountMember({...source,modules:[{outputs:[{body:{id:'Link7_8'}}]}]},'Link7_8').reason,/模組介面/);
const pose=(s,t)=>solveTopology(compileTopology(s.comps,{params:s.params},new Set()),{thetaDeg:t});
assert.ok(gearMountMember(source,'Link4_8').ok);
assert.match(gearMountMember(source,'Link7').reason,/其他零件/);
assert.equal(planGearMemberMount(source,{...request,matchRadius:false}).mismatch,true);
const plan=planGearMemberMount(source,request);assert.ok(plan.ok,plan.reason);
assert.equal(JSON.stringify(source),before,'preview is immutable');
near(plan.comps[1].pinRadius,18);assert.equal(plan.comps[1].phase,180);
assert.deepEqual(plan.params,source.params);
assert.deepEqual(plan.comps.slice(0,1),source.comps.slice(0,1));
assert.deepEqual(plan.comps.slice(2,5),source.comps.slice(2,5),'other jaw remains unchanged');
assert.ok(plan.comps[5].barFusion.points.some(p=>p.id==='GCB'));
assert.ok(plan.comps[5].barFusion.points.some(p=>p.id==='GPB'));
assert.ok(!plan.comps[5].barFusion.points.some(p=>p.id==='GCA_8'));
const pinHole=inspectGearExport(plan.comps[1],plan.params,{}).holes.find(h=>h.layer==='PIN_HOLE');
near(Math.hypot(pinHole.x,pinHole.y),18);
const catalog=buildPartGeometryCatalog({comps:plan.comps,params:plan.params});
assert.ok(catalog.parts.GearB&&catalog.parts.Link7_8,'gear and jaw remain separate fabricated parts');
assert.equal(catalog.parts.Link7_8.sourceIds.length,3);
for(const fn of [exportLinksAsSvg,exportLinksAsDxf]){
 const files=[];fn(plan.comps,plan.points,plan.params,{},[],null,(text,name,mime,ids)=>files.push({text,name,ids}));
 assert.ok(files.some(f=>f.ids?.includes('GearB')));assert.ok(files.some(f=>f.ids?.includes('Link7_8')));
}
for(let t=0;t<=30;t+=2){
 const s=pose(plan,t);assert.ok(s.isValid,s.errorReason);assert.equal(s.isUnderconstrained,false);
 const p=s.points;
 near(Math.hypot(p.GPB.x-p.GCB.x,p.GPB.y-p.GCB.y),18);
 near(Math.hypot(p.P5b_8.x-p.GCB.x,p.P5b_8.y-p.GCB.y),96);
 near(Math.hypot(p.P7b_8.x-p.P5b_8.x,p.P7b_8.y-p.P5b_8.y),40);
 near(p.P5b_8.x+p.P5b.x,-20);near(p.P5b_8.y,p.P5b.y);
 near(p.P7b_8.x+p.P7b.x,-20);near(p.P7b_8.y,p.P7b.y);
}
const saved=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(plan.comps,{params:plan.params},8))));
assert.ok(saved);assert.ok(pose(saved,22).isValid);assert.deepEqual(saved.comps[5].barFusion,plan.comps[5].barFusion);
assert.equal(saved.comps.filter(c=>c.isInput).length,0,'gear remains the sole driver');
// Nonzero input pose, reversed hole order and ordinary plates/bars also follow the gear.
assert.ok(planGearMemberMount(source,request,{motion:{thetaDeg:17}}).ok);
assert.ok(planGearMemberMount(source,{...request,centerId:request.pinId,pinId:request.centerId}).ok);
for(const type of ['bar','triangle']){
 const m={type,id:'New',p1:{id:'N1',x:0,y:50,type:'floating'},p2:{id:'N2',x:18,y:50,type:'floating'},fixedLen:true,isInput:false};
 const s={comps:structuredClone(source.comps.slice(0,2)),params:{GRA:30,GRB:30,theta:0,L:18}};
 if(type==='bar')m.lenParam='L';
 else{m.p3={id:'N3',x:5,y:80,type:'floating'};m.gParam='L';m.r1Param='R1';m.r2Param='R2';m.sign=1;s.params.R1=Math.hypot(5,30);s.params.R2=Math.hypot(13,30);}
 s.comps.push(m);
 const r=planGearMemberMount(s,{memberId:'New',gearId:'GearA',centerId:'N1',pinId:'N2',flipPin:true});
 assert.ok(r.ok,`${type}: ${r.reason}`);
 const save=normalizeSnapshot(toSnapshot(r.comps,{params:r.params},1));assert.ok(save);
 for(const t of [0,17,30]){const solved=pose(save,t);assert.ok(solved.isValid);near(solved.points.GPA.x,-40+18*Math.cos((180+t)*Math.PI/180));}
}
for(const patch of [{centerId:'bad'},{pinId:'GCA_8'},{pinId:'P7b_8'},{gearId:'missing'}])assert.equal(planGearMemberMount(source,{...request,...patch}).ok,false);
const connected=structuredClone(source);connected.comps.push({type:'bar',id:'extra',p1:{id:'GPB',x:43,y:0,type:'floating'},p2:{id:'extraEnd',x:60,y:0,type:'floating'},lenParam:'extraL',fixedLen:true});connected.params.extraL=17;
assert.match(planGearMemberMount(connected,request).reason,/已連接/);
const cross=structuredClone(source);cross.comps[1].moduleId='other';assert.match(planGearMemberMount(cross,request).reason,/同一設計/);
const fixed=structuredClone(source);fixed.comps[5].p1.type='fixed';assert.match(planGearMemberMount(fixed,request).reason,/固定/);
const shared=structuredClone(source);shared.comps[1].pinRadiusParam='LL5';assert.match(planGearMemberMount(shared,request).reason,/共用/);
let live=source,undo=[];
const commit={plan,revision:before,fingerprint:()=>JSON.stringify(live),pushUndo:()=>undo.push(structuredClone(live)),apply:p=>{live={...live,comps:p.comps,params:p.params};}};
assert.match(commitGearMemberMount({...commit,revision:'old'}),/作品已變更/);assert.equal(undo.length,0);
assert.equal(commitGearMemberMount(commit),'');assert.equal(undo.length,1);live=undo.pop();assert.equal(JSON.stringify(live),before);
console.log('gear member mount: mirrored 18/23 fixture, symmetry sweep, shared holes, persistence, conflicts and atomic undo passed');
