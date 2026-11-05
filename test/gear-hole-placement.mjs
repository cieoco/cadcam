import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planGearHolePlacement,commitGearHolePlacement,outputPoint,outputRadius,gearHoleAtPoint} from '../js/blocks/gear-hole-placement.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {toSnapshot,normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
const source=JSON.parse(readFileSync(new URL('./fixtures/gear-member-mount.json',import.meta.url),'utf8'));
source.comps=source.comps.slice(0,2);source.comps[0].phase=30;
const request={gearId:'GearB',mode:'mirror',referenceId:'GearA'},before=JSON.stringify(source);
const plan=planGearHolePlacement(source,request);assert.ok(plan.ok,plan.reason);
assert.equal(plan.radius,18);assert.equal(plan.angle,150);assert.equal(JSON.stringify(source),before);
assert.deepEqual(plan.comps[0],source.comps[0]);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const orientation of [0,45,90,200]){
 const s=structuredClone(source),a=s.comps[0].p1,b=s.comps[1].p1,phi=orientation*Math.PI/180;
 b.x=a.x+60*Math.cos(phi);b.y=a.y+60*Math.sin(phi);
 const p=planGearHolePlacement(s,request);assert.ok(p.ok,p.reason);
 const topo=compileTopology(p.comps,{params:p.params},new Set());
 for(let theta=0;theta<=360;theta+=15){
  const solved=solveTopology(topo,{thetaDeg:theta});assert.ok(solved.isValid);const left=solved.points.GPA,right=solved.points.GPB;
  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,projection=(left.x-mx)*Math.cos(phi)+(left.y-my)*Math.sin(phi);
  near(right.x,left.x-2*projection*Math.cos(phi));near(right.y,left.y-2*projection*Math.sin(phi));
 }
}
const manual=planGearHolePlacement(source,{gearId:'GearB',radius:18,angle:450});assert.ok(manual.ok);assert.equal(manual.angle,90);
near(manual.comps[1].p2.x,20);near(manual.comps[1].p2.y,18);
const current=solveTopology(compileTopology(plan.comps,{params:plan.params},new Set()),{thetaDeg:17});
near(Math.atan2(current.points.GPB.y,current.points.GPB.x-20)*180/Math.PI,133);
const param=structuredClone(source);param.comps[1].pinRadiusParam='PB';param.params.PB=23;
assert.equal(planGearHolePlacement(param,request).params.PB,18);
for(const req of [{gearId:'bad'},{referenceId:'GearB'},{referenceId:''},{mode:'manual',radius:NaN,angle:0},{mode:'manual',radius:3,angle:0},{mode:'manual',radius:27,angle:0},{mode:'manual',radius:18,angle:NaN}])assert.equal(planGearHolePlacement(source,{...request,...req}).ok,false);
for(const mutate of [s=>s.comps[1].moduleId='other',s=>s.comps[1].teeth=16,s=>delete s.comps[1].mesh,s=>s.comps[1].p1.type='floating',s=>s.comps[1].p1.x+=1]){const s=structuredClone(source);mutate(s);assert.equal(planGearHolePlacement(s,request).ok,false);}
for(const extra of [{type:'bar',id:'L',p1:{id:'GPB',x:43,y:0},p2:{id:'E',x:80,y:0}},{type:'rack',id:'R',pinion:'GearB'},{type:'syringe',id:'S',a:{componentId:'GearB'}}])assert.match(planGearHolePlacement({...source,comps:[...source.comps,extra]},request).reason,/已連接/);
assert.match(planGearHolePlacement({...source,modules:[{outputs:[{at:'GPB'}]}]},request).reason,/模組/);
const shared=structuredClone(param);shared.comps[0].pinRadiusParam='PB';shared.params.PB=18;
assert.match(planGearHolePlacement(shared,{gearId:'GearB',radius:19,angle:150}).reason,/共用/);
const saved=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(plan.comps,{params:plan.params},2))));
assert.equal(saved.comps[1].phase,150);assert.equal(saved.comps[1].pinRadius,18);near(outputPoint(saved.comps[1],saved.params).y,9);
const catalog=buildPartGeometryCatalog({comps:saved.comps,params:saved.params});assert.ok(catalog.parts.GearB);
for(const fn of [exportLinksAsSvg,exportLinksAsDxf]){const files=[];fn(saved.comps,{},saved.params,{},[],null,(text,name,mime,ids)=>files.push({text,ids}));assert.ok(files.some(f=>f.ids?.includes('GearB')&&f.text.length>100));}
let live=source,undo=[];const commit={plan,revision:before,fingerprint:()=>JSON.stringify(live),pushUndo:()=>undo.push(structuredClone(live)),apply:p=>live={...live,comps:p.comps,params:p.params}};
assert.match(commitGearHolePlacement({...commit,revision:'stale'}),/已變更/);assert.equal(undo.length,0);
assert.equal(commitGearHolePlacement(commit),'');assert.equal(undo.length,1);live=undo.pop();assert.equal(JSON.stringify(live),before);
const unchanged=planGearHolePlacement(plan,request);assert.ok(unchanged.ok&&!unchanged.changed);
assert.equal(commitGearHolePlacement({...commit,plan:unchanged}),'');assert.equal(undo.length,0);
console.log('gear hole placement: arbitrary-axis mirror sweep, initial angle, references, persistence, exports and atomic undo passed');

// Direct dragging and numeric input describe the same hole, including rotated/translated gears.
const dragGear=source.comps[1],cx=dragGear.p1.x,cy=dragGear.p1.y;
for(const [x,y,r,a] of [[0,18,18,90],[-18,0,18,180],[0,-18,18,270],[100,0,26,0],[1,0,4,0],[18.4,0,18,0],[18.6,0,19,0]]){
 const value=gearHoleAtPoint(dragGear,source.params,{x:cx+x,y:cy+y});
 near(value.radius,r);near(value.angle,a);
 const viaDrag=planGearHolePlacement(source,{gearId:dragGear.id,...value});
 const viaNumber=planGearHolePlacement(source,{gearId:dragGear.id,radius:r,angle:a});
 assert.deepEqual(viaDrag,viaNumber);
}
assert.equal(gearHoleAtPoint(dragGear,source.params,{x:NaN,y:0}),null);
assert.equal(gearHoleAtPoint({...dragGear,phase:37},source.params,{x:cx,y:cy}).angle,37);
assert.equal(gearHoleAtPoint(dragGear,{...source.params,[dragGear.radiusParam]:30.8},{x:cx+100,y:cy}).radius,26);
const posed=gearHoleAtPoint(dragGear,source.params,{x:100,y:118},{center:{x:100,y:100},poseDeg:30});
assert.deepEqual(posed,{radius:18,angle:60},'main-canvas pointer removes current drive pose from initial angle');
const precise=planGearHolePlacement(source,{gearId:dragGear.id,radius:18.25,angle:12.5});
assert.ok(precise.ok);near(outputRadius(precise.comps.find(c=>c.id===dragGear.id),precise.params),18.25);

const preciseSaved=normalizeSnapshot(toSnapshot(precise.comps,{params:precise.params},1));
near(outputRadius(preciseSaved.comps.find(c=>c.id===dragGear.id),preciseSaved.params),18.25);
