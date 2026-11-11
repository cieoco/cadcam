// Pack O3-B: drag-intent.js is the single statement of "what does this drag mean". This table pins TODAY's behaviour of the real
// input.js (fake-SVG rig) for every part kind x grab point x context, and checks that dragIntent() predicts it.
// Rows whose result needs a live simulation (drive / crank / constraint solver) are 'spec' rows: only dragIntent() is checked.
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import * as Model from '../js/blocks/model.js';
import {S} from '../js/blocks/state.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
import {getExample,loadUnitStarts} from '../js/blocks/examples.js';
import * as MR from '../js/blocks/motor-release.js';
import {localHoles} from '../js/core/local-holes.js';
import {fusionRoot,fusionAtPoint} from '../js/core/bar-fusion.js';
import {dragIntent,blockedMessage} from '../js/blocks/drag-intent.js';
import {gesture,load,bodyDown,nodeDown} from './_drag-rig.mjs';
await loadIntegrity();await loadUnitStarts();

const FIX=new URL('./fixtures/',import.meta.url);
const fixture=n=>normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(n,FIX),'utf8'))));
const example=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
const blocks=(...m)=>({comps:m.map(x=>x.comp),params:Object.assign({theta:0},...m.map(x=>x.params)),modules:[]});
const blocked=fixture('delete-blocked.json');
const repaired=(()=>{const b=MR.planMotorReturn(blocked,MR.offPlateMotors(blocked.comps)[0].id);return {...blocked,comps:b.comps,params:b.params};})();
const released=(()=>{const x=MR.planMotorRelease({comps:repaired.comps,params:repaired.params,fabrication:repaired.fabrication,modules:repaired.modules},'Blank135',{},{});return {...repaired,comps:x.comps,params:x.params};})();
const bell=example('bell-crank-gripper');
const sixBar=example('six-bar-lift');
const groundedL=(()=>{const w=blocks(makeStandardBlank({kind:'l',n:1}));w.comps[0].p1.type='fixed';return w;})();
const lockedTri={comps:[{id:'T',type:'triangle',p1:{id:'a',type:'fixed',x:0,y:0},p2:{id:'b',type:'fixed',x:80,y:0},p3:{id:'c',type:'floating',x:40,y:60},gParam:'g',r1Param:'r1',r2Param:'r2'}],params:{g:80,r1:72.1,r2:72.1,theta:0},modules:[]};
const free={bar:blocks(makeStandardBlank({kind:'bar',n:1})),plate:blocks(makeStandardBlank({kind:'plate',n:1})),l:blocks(makeStandardBlank({kind:'l',n:1}))};
const arms=bell.comps.find(c=>c.standardBlank?.kind==='arms');
const fusedRoot=sixBar.comps.find(c=>c.barFusionRoot);

// context the way the app computes it (model.js helpers; no drive source, no live solver)
function contextOf(w,grab,partId,pointId){
  const comps=w.comps,part=comps.find(c=>c.id===partId),ground=pointId&&Model.pointIsGround(comps,pointId);
  const pointFree=pointId&&(Model.freeLinkForPoint(comps,pointId)||(Model.freeTriangleForPoint&&Model.freeTriangleForPoint(comps,pointId)));
  return {
    free:grab==='body'||grab==='hole'||grab==='shaft'?Model.isFreeBody(comps,part,w.modules||[]):!!pointFree,
    fused:grab==='body'?!!fusionRoot(comps,partId):!!(pointId&&fusionAtPoint(comps,pointId)),
    groundLocked:grab!=='body'&&grab!=='shaft'&&!!ground,
    lockedVertex:!!pointId&&Model.lockedTriangleVertex(comps,pointId),
    solved:!!pointId&&(!!Model.pinnedTriangleForPoint(comps,pointId)||!!Model.looseBarRotation(comps,w.params,pointId)),
    joinedCorner:!!pointId&&comps.some(c=>['p1','p2','p3'].some(k=>c[k]?.id===pointId)&&Model.holeJoined(comps,c)),
    sharedFixed:!!pointId&&!ground&&comps.filter(c=>c.type==='bar'&&c.fixedLen&&c.p1&&c.p2&&(c.p1.id===pointId||c.p2.id===pointId)).length>1,
    follows:false,crank:false
  };
}
// what the real input.js does with this grab (the rig has no drive and no constraint solver)
async function observe(w,grab,partId,pointId){
  load(w);const before=JSON.stringify(S.comps),pts=Model.pointCoords(S.comps);
  const msgs=await gesture(grab==='body'?bodyDown(partId):nodeDown(pointId),[[112,104],[150,130],[200,160]]);
  if(JSON.stringify(S.comps)===before)return {kind:'none',msgs};
  const after=Model.pointCoords(S.comps),moved=Object.keys(pts).filter(k=>after[k]&&Math.hypot(after[k].x-pts[k].x,after[k].y-pts[k].y)>1e-6);
  const d=k=>[after[k].x-pts[k].x,after[k].y-pts[k].y];
  const same=moved.length>1&&moved.every(k=>Math.hypot(d(k)[0]-d(moved[0])[0],d(k)[1]-d(moved[0])[1])<1e-6);
  return {kind:same?'move-free':'move-node',msgs};
}

// [label, work, grab, partId, pointId, expected {kind,reason?}]
const ROWS=[
  ['桿件 自由 桿身',free.bar,'body',free.bar.comps[0].id,null,{kind:'move-free'}],
  ['桿件 自由 桿端',free.bar,'end',free.bar.comps[0].id,free.bar.comps[0].p2.id,{kind:'move-free'}],
  ['桿件 已接無動力 桿身',blocked,'body','Blank136',null,{kind:'none',reason:'body'}],
  ['桿件 已接無動力 局部孔',blocked,'hole','Blank136',localHoles(blocked.comps.find(c=>c.id==='Blank136'))[0]?.id,{kind:'none',reason:'hole'}],
  ['桿件 已接無動力 自由端（繞另一端轉）',blocked,'end','Blank137','P139s',{kind:'move-node'}],
  ['桿件 共用接點 兩桿共用',blocked,'end','Blank136','Blank136.B',{kind:'none',reason:'shared-fixed'}],
  ['板材 自由 板面',free.plate,'body',free.plate.comps[0].id,null,{kind:'move-free'}],
  ['板材 自由 頂點',free.plate,'end',free.plate.comps[0].id,free.plate.comps[0].p3.id,{kind:'move-free'}],
  ['板材 已接 板面',blocked,'body','Blank133',null,{kind:'none',reason:'body'}],
  ['板材 固定孔頂點（未解鎖）',blocked,'end','Blank133','Blank133.A',{kind:'none'}],
  ['板材 一頂點固定、另一頂點自由',blocked,'end','Blank133','Blank133.C',{kind:'none',reason:'joined-corner'}],
  ['三點桿 頂點被完全決定',lockedTri,'end','T','c',{kind:'none',reason:'locked-vertex'}],
  ['L型件 自由 件面',free.l,'body',free.l.comps[0].id,null,{kind:'move-free'}],
  ['L型件 接固定孔 件面',groundedL,'body',groundedL.comps[0].id,null,{kind:'none',reason:'body'}],
  ['彎桿 已接 件面',bell,'body',arms.id,null,{kind:'none',reason:'body'}],
  ['馬達 座板上 軸心',released,'shaft',null,released.comps.find(c=>c.type==='motor').p1.id,{kind:'none',reason:'hosted-motor'}],
  ['合成桿 桿身',sixBar,'body',fusedRoot?.id,null,{kind:'none'}]
];
// rows that need a live simulation are spec-only: the real result depends on drive-drag.js / the constraint solver
const SPEC=[
  ['桿件 已接有動力且會跟著轉 桿身',{grab:'body'},{follows:true},{kind:'drive'}],
  ['桿件 已接有動力且會跟著轉 孔',{grab:'hole'},{follows:true},{kind:'drive'}],
  ['桿件 已接有動力但不會跟著轉 桿身',{grab:'body'},{follows:false},{kind:'none',reason:'body'}],
  ['輸入桿 動端',{grab:'end'},{crank:true},{kind:'crank'}],
  ['接點 有動力且會跟著轉',{grab:'end'},{follows:true},{kind:'drive'}],
  ['接點 約束求解器能解',{grab:'end'},{solved:true},{kind:'move-node'}],
  ['機架孔',{grab:'frame-hole'},{},{kind:'none'}],
  ['尺寸把手',{grab:'handle'},{free:false},{kind:'resize-handle'}],
  ['固定孔 即使有動力也不被拖走',{grab:'end'},{groundLocked:true,follows:true},{kind:'none'}],
  ['獨立馬達 軸心自由',{grab:'shaft'},{free:true},{kind:'move-free'}]
];
const same=(a,b)=>a.kind===b.kind&&(a.reason||null)===(b.reason||null);
for(const [label,w,grab,partId,pointId,expect] of ROWS){
  const ctx=contextOf(w,grab,partId,pointId),got=dragIntent({grab},ctx);
  const seen=await observe(w,grab,partId,pointId);
  if(!expect){console.log(`INFO ${label}: dragIntent=${JSON.stringify(got)} observed=${seen.kind} ${seen.msgs.join('|')}`);}
  if(expect)check(`${label}：dragIntent 預測 ${expect.kind}${expect.reason?'/'+expect.reason:''}`,same(got,expect),JSON.stringify(got));
  check(`${label}：真實拖曳與 dragIntent 一致（${got.kind}）`,seen.kind===got.kind||(got.kind==='move-free'&&seen.kind==='move-free'),`observed ${seen.kind} vs ${got.kind}`);
  if(got.kind==='none'&&got.reason)check(`${label}：說明文字＝${got.reason}`,seen.msgs.length===1&&seen.msgs[0]===blockedMessage(got.reason,false),seen.msgs.join('|'));
  if(got.kind!=='none'||!got.reason)check(`${label}：沒有多餘的說明`,got.kind==='none'&&!got.reason?seen.msgs.length===0:seen.msgs.length===0,seen.msgs.join('|'));
}
for(const [label,target,ctx,expect] of SPEC)check(`[規格] ${label}`,same(dragIntent(target,ctx),expect),JSON.stringify(dragIntent(target,ctx)));
check('every reason has a plain-language message and no internal ids',['body','hole','locked-vertex','hosted-motor','fused-hole','joined-corner','shared-fixed'].every(k=>{const m=blockedMessage(k,false);return m.length>8&&!/Blank|_H\d|P\d+s/.test(m)&&m!==blockedMessage('nope');}));
report('drag-intent');
