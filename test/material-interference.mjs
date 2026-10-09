import assert from 'node:assert/strict';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const pose=(x=0,y=0,z=0,a=0)=>{const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,x,y,z,1];};
const part=(id,outline=rect(0,0,10,10),matrix=pose(),extra={})=>({partId:id,moduleId:id,pickKey:id,geometry:{kind:'bar',outlines:[outline],holes:[],cutouts:[],thicknessMm:2,geometryVersion:1,...extra},pose:{matrix}});
const run=(parts)=>checkMaterialInterference({materialParts:parts,geometryKey:'test',poseRevision:1});
assert.equal(run([part('A'),part('B',undefined,pose(0,0,2-1e-4))]).status,'fail','1e-4 mm true material penetration must be detected');
assert.equal(run([part('A'),part('B',undefined,pose(0,0,2))]).status,'pass','flush is contact');
assert.equal(run([part('A'),part('B',undefined,pose(0,0,2.01))]).status,'pass','gap');
console.log('material SAT: positive volume vs flush/gap');

// Concave stock: an object in its empty notch must not collide with the bounds.
const concave=[{x:0,y:0},{x:10,y:0},{x:10,y:3},{x:3,y:3},{x:3,y:10},{x:0,y:10}];
assert.equal(run([part('A',concave),part('B',rect(5,5,2,2))]).status,'pass');
assert.equal(run([part('A',concave),part('B',rect(1,5,2,2))]).status,'fail');
assert.equal(run([part('A'),part('B',rect(0,0,3,3),pose(11,5,0,Math.PI/4))]).status,'fail','rotation moves material past the edge');
const slot=part('A',undefined,pose(),{cutouts:[{id:'slot',points:rect(3,3,4,4)}]});
assert.equal(run([slot,part('B',rect(4,4,2,2))]).status,'pass');
assert.equal(run([slot,part('B',rect(2.9,4,2,2))]).status,'fail','cutout wall');
const drilled=part('A',undefined,pose(),{holes:[{x:5,y:5,r:2,id:'h'}]});
assert.equal(run([drilled,part('B',rect(4.5,4.5,1,1))]).status,'pass','actual circular void');
assert.equal(run([drilled,part('B',rect(6.9,4.5,1,1))]).status,'fail','material beyond hole wall');
assert.notEqual(run([drilled,part('B',rect(6.9999,4.9999,.0002,.0002))]).status,'pass','arc boundary cannot cause a false pass');
const invalid=part('A',[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]);
assert.equal(run([invalid,part('B')]).status,'not_supported','unverifiable geometry cannot pass');
const circle=r=>Array.from({length:48},(_,i)=>({x:r*Math.cos(i*Math.PI/24),y:r*Math.sin(i*Math.PI/24)}));
const screw={...part('S',circle(1),pose(5,5,-1),{kind:'screw',thicknessMm:4}),holePairId:'pair'};
const paired=part('A',undefined,pose(),{holes:[{id:'h',holePairId:'pair',x:5,y:5,r:1.1}]});
assert.equal(run([paired,screw]).status,'pass','coaxial shaft in named circular drilling');
const crooked=structuredClone(screw);crooked.pose.matrix=[1,0,0,0,0,0,1,0,0,-1,0,0,5,5,-1,1];
assert.equal(run([paired,crooked]).findings[0].reason,'paired_fastener_axis_invalid');
const offcenter=structuredClone(screw);offcenter.pose.matrix[12]+=.2;
assert.equal(run([paired,offcenter]).findings[0].reason,'paired_fastener_hits_hole_wall');
const other=part('C',rect(4,4,2,2),pose(0,0,-.5));
assert.equal(run([paired,screw,other]).status,'fail','named screw is still tested against unrelated material');
const head=part('S/head',circle(2),pose(5,5,-1),{kind:'screw-head',thicknessMm:1});head.holePairId='pair';
assert.equal(run([paired,screw,head]).status,'pass','head flush at exterior seat');
const submerged=structuredClone(head);submerged.pose.matrix[14]+=.0001;
assert.equal(run([paired,screw,submerged]).status,'fail','head into board is never exempted');
import {f1AssemblyFixture} from './fixtures/f1-assembly-fixture.mjs';
import {f1MaterialScene} from './fixtures/f1-material-scene.mjs';
for(const theta of [0,20,40]){
 const f=f1AssemblyFixture(),{model}=f1MaterialScene(theta,f);
 const report=checkMaterialInterference({...model,poseRevision:theta});
 assert.equal(report.coverage.checkedPartIds.length,model.materialParts.length,'all standard F1 material prepared');
 assert.ok(!report.coverage.notSupported.some(p=>p.partId),'F1 boards and joint solids must be supported');
 console.log('F1',theta,report.status,report.findings.map(f=>f.partIds.join('/')),report.coverage.notSupported.map(f=>f.reason || f.code));
 assert.equal(report.geometryKey,model.geometryKey);assert.equal(report.poseRevision,theta);
}
console.log('material SAT: concave/cutout/circular holes, conservative arc boundary, paired shafts/head, F1');

// Independent witnesses from root's exact circle/profile point-in-material audit.
const localPoint=(m,p)=>{const d={x:p.x-m[12],y:p.y-m[13],z:p.z-m[14]};return {x:m[0]*d.x+m[1]*d.y+m[2]*d.z,y:m[4]*d.x+m[5]*d.y+m[6]*d.z,z:m[8]*d.x+m[9]*d.y+m[10]*d.z};};
const pointInRing=(p,ring)=>{let winding=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],cross=(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y);if(a.y<=p.y&&b.y>p.y&&cross>0)winding++;if(a.y>p.y&&b.y<=p.y&&cross<0)winding--;}return winding!==0;};
const exactMaterialContains=(part,world)=>{
 const p=localPoint(part.pose.matrix,world),g=part.geometry;
 if(!(p.z>0&&p.z<g.thicknessMm))return false;
 if(g.solid?.kind==='pan-head'){
  const profile=g.solid.profile.filter(([r])=>r>0).sort((a,b)=>a[1]-b[1]);
  for(let i=1;i<profile.length;i++){const [ra,za]=profile[i-1],[rb,zb]=profile[i];if(p.z>=za&&p.z<=zb){const r=ra+(rb-ra)*(p.z-za)/(zb-za);return Math.hypot(p.x,p.y)<r;}}
  return false;
 }
 return g.outlines.some(r=>pointInRing(p,r))&&!g.holes.some(h=>Math.hypot(p.x-h.x,p.y-h.y)<=h.r)&&!g.cutouts.some(c=>pointInRing(p,c.points));
};
for(const [theta,a,b,witness] of [[0,'GearA_3','connection:Mod3/slot:L1/wing:child/pair:0/screw/head',{x:196.894803,y:-14.1,z:8.25}],[0,'GearB_3','connection:Mod3/slot:R1/wing:child/pair:0/screw/head',{x:177.35,y:-14.1,z:31.25}],[40,'LiftCrank_1','Mod3-frame',{x:109.334961,y:80.290265,z:6.1}]]){
 const {model}=f1MaterialScene(theta,f1AssemblyFixture()),report=checkMaterialInterference(model);
 assert.ok([a,b].every(id=>exactMaterialContains(model.materialParts.find(p=>p.partId===id),witness)),'hardcoded world witness is strictly inside both actual materials');
 assert.ok(report.findings.some(f=>f.partIds.includes(a)&&f.partIds.includes(b)),'SAT catches independently proven actual penetration');
}
// Common nested rigid rotation cannot change cross-module penetration.
import {multiply4,applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
const {model:plain}=f1MaterialScene(20,f1AssemblyFixture());
const R=[0,0,1,0,1,0,0,0,0,1,0,0,23,-11,9,1],T=pose(-15,17,8,.71),world=multiply4(R,T);
const transformed={...plain,materialParts:plain.materialParts.map(p=>({...p,pose:{...p.pose,matrix:multiply4(world,p.pose.matrix)}}))};
assert.deepEqual(checkMaterialInterference(transformed).findings.map(f=>f.pairId).sort(),checkMaterialInterference(plain).findings.map(f=>f.pairId).sort());
console.log('independent F1 world witnesses and non-commuting nested rigid transforms');

import {f1NestedFixture} from './fixtures/f1-assembly-fixture.mjs';
for(const theta of [0,20,40]){
 const {model}=f1MaterialScene(theta,f1NestedFixture());assert.equal(model.orthogonal.length,2);
 const report=checkMaterialInterference(model);
 assert.equal(report.coverage.checkedPartIds.length,model.materialParts.length,'all nested F1 materials prepared');
 for(const id of ['GearA_3','GearB_3'])assert.ok(report.findings.some(f=>f.partIds.includes(id)&&f.partIds.some(id=>id.endsWith('/head'))),'true recursive nested scene preserves gear/head collisions');
}
console.log('true recursive nested F1 SAT at 0/20/40');

import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {attachPartMaterials} from '../js/blocks3d/part-pose.js';
const fixture=f1AssemblyFixture(),catalog=buildPartGeometryCatalog(fixture);
const absent=attachPartMaterials({},catalog,{...fixture,assemblyScope:true});
assert.ok(absent.geometryDiagnostics.some(d=>d.code==='expected_material_pose_missing'&&d.sourceIds.includes('Mod3-frame')));
assert.equal(checkMaterialInterference(absent).status,'not_supported');
const legacy=structuredClone(fixture);delete legacy.modules[1].mount.face.childPart;delete legacy.modules[1].mount.face.selection.brackets;
const unlocated=attachPartMaterials({},buildPartGeometryCatalog(legacy),{...legacy,assemblyScope:true});
assert.ok(unlocated.geometryDiagnostics.some(d=>d.code==='legacy_child_endpoint_ambiguous'));
const focused=attachPartMaterials({},catalog,{...fixture,assemblyScope:false});
assert.ok(!focused.geometryDiagnostics.some(d=>d.code==='expected_material_pose_missing'),'intentional design focus does not claim missing assembly material');
console.log('missing child pose / ambiguous endpoint coverage cannot become hardware-only partial pass');

const wings=plain.materialParts.filter(p=>p.geometry.kind==='bracket-wing').slice(0,2);
assert.equal(run(wings).status,'pass','legitimate same-bracket bend only');
const results=[-3,3].map(shift=>{const broken=structuredClone(wings),m=broken[0].pose.matrix;for(let i=0;i<3;i++)broken[1].pose.matrix[12+i]+=m[4+i]*shift;return run(broken);});
assert.ok(results.some(r=>r.status==='fail'),'same bracket ID cannot exempt wing material moved into its middle');

import {normalizeMaterialVoids,materialCircleContour} from '../js/blocks/material-voids.js';
const containedHole={id:'pivot',x:5,y:5,r:1},largeSlot={id:'MG995_SLOT',points:rect(3,3,4,4)};
const redundant=part('A',undefined,pose(),{holes:[containedHole],cutouts:[largeSlot]});
assert.equal(run([redundant,part('B',rect(4.5,4.5,1,1))]).status,'pass','fully-contained hole/slot void union');
assert.equal(redundant.geometry.holes[0].id,'pivot','semantic hole retained');
const repr=normalizeMaterialVoids([{circle:containedHole,points:materialCircleContour(containedHole,true)},{points:largeSlot.points}]);assert.equal(repr.length,1);assert.equal(repr[0].points,largeSlot.points,'viewer and checker use the same containment operation');
const partial=part('A',undefined,pose(),{holes:[{x:3,y:5,r:1}],cutouts:[largeSlot]});
assert.equal(run([partial,part('B',rect(2.5,4.7,.2,.2))]).status,'pass','partial hole/slot overlap subtracts the union');
assert.equal(run([partial,part('B',rect(2,3.5,.2,.2))]).status,'fail','material outside the union remains solid');
const voidCycle=[rect(1,1,8,2),rect(1,7,8,2),rect(1,1,2,8),rect(7,1,2,8)];
assert.throws(()=>normalizeMaterialVoids(voidCycle),/void_union_material_island/,'unrepresented material island cannot silently disappear');
const tinyCycle=[rect(1,1,4,1),rect(1,2.001,4,1),rect(1,1,1,2.001),rect(2.001,1,2.999,2.001)];
assert.throws(()=>normalizeMaterialVoids(tinyCycle),/void_union_material_island/,'1e-6 mm² material island cannot be discarded by fusion area filtering');
const thinSlit=part('A',undefined,pose(),{cutouts:[{points:rect(1,1,4,8)},{points:rect(5.000001,1,3.999999,8)}]});
assert.equal(run([thinSlit,part('B',rect(5.0000002,4,.0000002,1))]).status,'fail','1e-6 mm material slit survives void representation');

// Normal opened works supply fabrication mount settings, including MG995's
// concave ear tab. Its two screw circles partly intersect the tab cutout.
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {deriveMotorMounts} from '../js/blocks/build-plan.js';
const opened=normalizeSnapshot({...f1AssemblyFixture(),version:1});
const mounts=deriveMotorMounts(opened.comps).map(m=>({...m,settings:m.kind==='mg995'?opened.fabrication.mg995Mount:opened.fabrication.ttMount}));
const openedCatalog=buildPartGeometryCatalog({...opened,mounts});
for(const theta of [0,20,40]){
 const {model}=f1MaterialScene(theta,opened,openedCatalog),report=checkMaterialInterference(model);
 assert.equal(report.coverage.checkedPartIds.length,model.materialParts.length,'normal opened fabrication prepares every F1 board');
 assert.ok(!report.coverage.notSupported.some(p=>p.partId),'no standard F1 board is unsupported');
 assert.equal(report.status,'fail','true F1 penetration stays red after void union');
 for(const id of ['frame','Mod3-frame']){
  const g=openedCatalog.parts[id],raw=[...g.holes.map(h=>({circle:h,points:materialCircleContour(h,true)})),...g.cutouts.map(c=>({points:c.points}))];
  const merged=normalizeMaterialVoids(raw);assert.ok(merged.length<raw.length,'viewer uses merged machining void contours');
  assert.ok(g.holes.every(h=>h.id),'semantic IDs survive material representation');
 }
}
console.log('opened F1 MG995 ear slot/circle union: checker and viewer share representation');
