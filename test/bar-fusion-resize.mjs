import assert from 'node:assert/strict';
import {planBarFusionResize,commitBarFusionResize} from '../js/blocks/bar-fusion-resize.js';
import {planBarFusion} from '../js/blocks/bar-fusion-plan.js';
import {inspectBarFusionData} from '../js/core/bar-fusion.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {dimensionLock} from '../js/blocks/member-dimensions.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';

const p=(id,x,y,type='floating')=>({id,x,y,type});
const bar=(id,a,b,input=false)=>({type:'bar',id,p1:{...a},p2:{...b},lenParam:id+'L',isInput:input,fixedLen:true,...(input?{physicalMotor:'1',motorType:'tt',phaseOffset:0.5635468426222473}:{})});
const A={...p('P7a',22.249998249113602,5.708327515671797,'fixed'),physicalMotor:'1'},B=p('P7b',118.2499982491136,5.708327515671797),C=p('P8b',132.18295284274114,-40.22502394371896);
const params={Link7L:96,Link8L:48},raw=[bar('Link7',A,B,true),bar('Link8',B,C)];
const fused=planBarFusion(raw,['Link7','Link8'],params);assert.ok(fused.ok,fused.reason);
const pose=(comps,params,angle=0)=>solveTopology(compileTopology(comps,{params},new Set()),{thetaDeg:angle});
const before=JSON.stringify(fused.comps),positions=pose(fused.comps,params,68).points;
const result=planBarFusionResize(fused.comps,params,'Link7',120,{positions,motion:{thetaDeg:68}});
assert.ok(result.ok,result.reason);assert.equal(JSON.stringify(fused.comps),before);
assert.equal(result.params.Link8L,48);assert.ok(inspectBarFusionData(result.comps,result.comps[0],result.params).ok);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
near(result.comps[0].barFusion.points[2].x-fused.data.points[2].x,24);
near(result.comps[0].barFusion.points[2].y,fused.data.points[2].y);
near(result.points.P7a.x,positions.P7a.x);near(result.points.P7a.y,positions.P7a.y);
const r2=planBarFusionResize(result.comps,result.params,'Link8',64.5,{positions:result.points,motion:{thetaDeg:68}});
assert.ok(r2.ok,r2.reason);near(r2.points.P7b.x,result.points.P7b.x);near(r2.points.P7b.y,result.points.P7b.y);
for(const angle of [0,45,90,180,270]){
 const solved=pose(r2.comps,r2.params,angle);assert.ok(solved.isValid,solved.errorReason);
 near(Math.hypot(solved.points.P8b.x-solved.points.P7b.x,solved.points.P8b.y-solved.points.P7b.y),64.5);
}
const saved=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(r2.comps,{params:r2.params},8))));
assert.ok(saved);assert.deepEqual(saved.comps[0].barFusion,r2.comps[0].barFusion);
assert.equal(saved.comps.filter(c=>c.isInput).length,1);assert.ok(pose(saved.comps,saved.params).isValid);
const catalog=buildPartGeometryCatalog({comps:r2.comps,params:r2.params});
assert.equal(catalog.parts.Link8,undefined);assert.deepEqual(catalog.parts.Link7.sourceIds,['Link7','Link8']);
const tipLocal=r2.comps[0].barFusion.points.find(p=>p.id==='P8b');
assert.ok(catalog.parts.Link7.holes.some(p=>Math.hypot(p.x-tipLocal.x,p.y-tipLocal.y)<1e-6),'3D/export catalog uses the resized end hole');
for(const exportFn of [exportLinksAsSvg,exportLinksAsDxf]){
 const files=[];exportFn(r2.comps,{},r2.params,{},[],null,(text,name,mime,ids)=>files.push({text,ids}));
 assert.equal(files.length,1);assert.deepEqual(files[0].ids,['Link7','Link8']);
 assert.ok(files[0].text.length>100);
}
assert.equal(dimensionLock(fused.comps[0],fused.comps,'g'),'');
assert.ok(dimensionLock(fused.comps[0],fused.comps,'width'));
assert.equal(planBarFusionResize(fused.comps,params,'Link7',NaN).ok,false);

// A branch translates with its parent; reversing endpoint order does not reverse the anchored side.
const branch=bar('Branch',B,p('D',118.2499982491136,65.7083275156718));
const branched=planBarFusion([...raw,branch],['Link7','Link8','Branch'],{...params,BranchL:60});
assert.ok(branched.ok,branched.reason);
const br=planBarFusionResize(branched.comps,{...params,BranchL:60},'Link7',104,{positions:pose(branched.comps,{...params,BranchL:60}).points});
assert.ok(br.ok,br.reason);near(br.comps[0].barFusion.points.find(p=>p.id==='D').x,104);
const reversed=structuredClone(raw);[reversed[1].p1,reversed[1].p2]=[reversed[1].p2,reversed[1].p1];
const rev=planBarFusion(reversed,['Link7','Link8'],params);
assert.ok(planBarFusionResize(rev.comps,params,'Link8',64,{positions:pose(rev.comps,params).points}).ok);

// Closed rings, a second fixed point, and incompatible external links cannot silently deform.
const rA=p('A',0,0,'fixed'),rB=p('B',80,0),rC=p('C',80,80),rD=p('D',0,80);
const ring=[bar('AB',rA,rB),bar('BC',rB,rC),bar('CD',rC,rD),bar('DA',rD,rA)],rp={ABL:80,BCL:80,CDL:80,DAL:80};
const ringPlan=planBarFusion(ring,ring.map(c=>c.id),rp);
assert.match(planBarFusionResize(ringPlan.comps,rp,'AB',96).reason,/封閉環/);
const fixed=structuredClone(fused.comps);fixed[1].p2.type='fixed';
assert.match(planBarFusionResize(fixed,params,'Link7',120).reason,/兩側都有固定/);
const external=bar('External',C,p('X',C.x+20,C.y,'fixed')),ep={...params,ExternalL:20};
const ext=[...fused.comps,external];
assert.equal(planBarFusionResize(ext,ep,'Link7',160,{positions}).ok,false);
assert.equal(JSON.stringify(fused.comps),before);

// One commit, stale lazy load refused, and failed plans do not consume undo.
const S={comps:structuredClone(fused.comps),topo:{params},selectedLinkId:'Link7',theta:68,motorAngles:{},activeMotor:'1'};
let undo=0,rebuilt=0,message='';
const args={S,id:'Link7',value:120,revision:'a',fingerprint:()=> 'a',positions:()=>positions,settings:()=>({}),comps:()=>S.comps,pause:()=>{},pushUndo:()=>undo++,rebuild:()=>rebuilt++,draw:()=>{},notify:s=>message=s};
commitBarFusionResize({...args,revision:'old'});assert.equal(undo,0);assert.match(message,/作品已變更/);
commitBarFusionResize(args);assert.equal(undo,1);assert.equal(rebuilt,1);assert.equal(S.topo.params.Link7L,120);
commitBarFusionResize({...args,value:-1});assert.equal(undo,1);assert.equal(S.topo.params.Link7L,120);
console.log('bar fusion resize: 96/48 pose, branches, reversed ends, constraints, snapshot, export and atomic edit passed');
