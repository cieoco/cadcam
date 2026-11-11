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
import {gesture,load,bodyDown,nodeDown,setDrive,dom,partEl,driveHooks,crankTurns} from './_drag-rig.mjs';
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
// rows that need the live simulation run through the rig with fake drive / crank / constraint-solver hooks (see _drag-rig.mjs);
// the only spec-only row left is the size handle: it lives in the dimension layer (data-dimension-handle), which input.js never receives.
const SPEC=[
  ['尺寸把手（由尺寸層處理，input.js 收不到）',{grab:'handle'},{free:false},{kind:'resize-handle'}]
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

// ---- 需要即時模擬的格：以假的試動／輸入角／約束求解器掛進真實 input.js
{
  const motorW={comps:[{id:'Motor',type:'motor',motorType:'n20',p1:{id:'M',type:'floating',x:12,y:8}}],params:{theta:0},modules:[]};
  const frameBar=makeStandardBlank({kind:'bar',n:7});frameBar.comp.frameHole={u:0,centered:true};frameBar.comp.p1.type='fixed';
  const frameW=blocks(frameBar);
  const probe=()=>()=>({x:0,y:0});
  const hole136=localHoles(blocked.comps.find(c=>c.id==='Blank136'))[0].id;
  const moves=[[112,104],[150,130],[200,160]];
  async function live(w,down,{drive=false,body=null,to=null,crank=null,solve=null}={}){
    load(w);setDrive(drive?'ready':'none');const log=[];
    driveHooks.body=body&&((c,g)=>body(c,g));driveHooks.to=to&&((t,p)=>{log.push(typeof t==='string'?'drive-id':'drive-probe');return to(t,p);});
    driveHooks.crank=crank;driveHooks.solve=solve&&((id,p)=>{log.push('solve');return solve(id,p);});
    crankTurns.length=0;const before=JSON.stringify(S.comps),pts=Model.pointCoords(S.comps);
    const msgs=await gesture(down,moves);
    const changed=JSON.stringify(S.comps)!==before;
    const kind=crankTurns.length?'crank':log.some(x=>x.startsWith('drive'))?'drive':log.includes('solve')?'move-node':changed?'move-free':'none';
    setDrive('none');return {kind,msgs,log,changed};
  }
  const rows=[
    ['桿件 已接有動力且會跟著轉 桿身',await live(blocked,bodyDown('Blank136'),{drive:true,body:probe,to:()=>true}),{grab:'body'},{follows:true},{kind:'drive'}],
    ['桿件 已接有動力且會跟著轉 孔',await live(blocked,nodeDown(hole136),{drive:true,to:()=>true}),{grab:'hole'},{follows:true},{kind:'drive'}],
    ['桿件 已接有動力但不會跟著轉 桿身',await live(blocked,bodyDown('Blank136'),{drive:true,body:()=>null,to:()=>false}),{grab:'body'},{follows:false},{kind:'none',reason:'body'}],
    ['輸入桿 動端',await live(blocked,nodeDown('P139s'),{crank:()=>({id:'crank'})}),{grab:'end'},{crank:true},{kind:'crank'}],
    ['接點 有動力且會跟著轉',await live(blocked,nodeDown('P139s'),{drive:true,to:()=>true}),{grab:'end'},{follows:true},{kind:'drive'}],
    ['接點 約束求解器能解',await live(blocked,nodeDown('Blank133.C'),{solve:()=>true}),{grab:'end'},{solved:true},{kind:'move-node'}],
    ['固定孔 即使有動力也不被拖走',await live(blocked,nodeDown('Blank133.A'),{drive:true,to:()=>true}),{grab:'end'},{groundLocked:true,follows:true},{kind:'none'}],
    ['獨立馬達 軸心自由',await live(motorW,nodeDown('M')),{grab:'shaft'},{free:true},{kind:'move-free'}],
    ['機架孔',await live(frameW,nodeDown(frameBar.comp.p1.id),{drive:true,to:()=>true}),{grab:'frame-hole'},{},{kind:'none'}]
  ];
  for(const [label,seen,target,ctx,expect] of rows){
    const got=dragIntent(target,ctx);
    check(`[即時] ${label}：dragIntent 預測 ${expect.kind}${expect.reason?'/'+expect.reason:''}`,same(got,expect),JSON.stringify(got));
    check(`[即時] ${label}：真實 input.js 的結果一致（${seen.kind}）`,seen.kind===expect.kind,`observed ${seen.kind} ${seen.log.join(',')}`);
    if(expect.kind==='none'&&expect.reason)check(`[即時] ${label}：說明＝${expect.reason}`,seen.msgs.length===1&&seen.msgs[0]===blockedMessage(expect.reason,true),seen.msgs.join('|'));
    else check(`[即時] ${label}：沒有說明文字`,seen.msgs.length===0,seen.msgs.join('|'));
  }
}

// ---- 手機／桌機：會動的零件優先於底下固定板沒用到的孔（O3b step 1）
{
  const plate=makeStandardBlank({kind:'plate',n:1}),bar=makeStandardBlank({kind:'bar',n:2});
  plate.comp.p1.type=plate.comp.p2.type='fixed';
  const w=blocks(plate,bar),hole=localHoles(plate.comp)[1].id,GROUND=blockedMessage('ground',false);
  const moves=[[112,104],[150,130],[200,160]],barId=bar.comp.id,plateId=plate.comp.id;
  const rig=({unused=true,under=[barId,plateId],drive=false}={})=>{load(w);dom.unused.clear();if(unused)dom.unused.add(hole);dom.under=under.map(partEl);setDrive(drive?'ready':'none');};
  const barPts=()=>Model.pointCoords(S.comps);
  const delta=(a,b,ids)=>ids.map(k=>[b[k].x-a[k].x,b[k].y-a[k].y]);
  // 自由件在底下：抓住它搬動，固定板不動
  rig();let a=barPts(),m=await gesture(nodeDown(hole),moves),b=barPts();
  const dBar=delta(a,b,[bar.comp.p1.id,bar.comp.p2.id]);
  check('[over] 自由件在空孔底下：整件跟著手指搬',dBar.every(d=>Math.hypot(d[0]-100,d[1]-60)<1e-6),JSON.stringify(dBar));
  check('[over] 固定板沒有動、沒有誤說「固定板」',delta(a,b,[plate.comp.p1.id,plate.comp.p2.id]).every(d=>!d[0]&&!d[1])&&m.length===0,m.join('|'));
  // 只點一下：照舊選取那個孔，不動任何東西
  rig();a=JSON.stringify(S.comps);m=await gesture(nodeDown(hole),[]);
  check('[over] 只點一下：照舊選取孔、不動、不說話',JSON.stringify(S.comps)===a&&S.selectedNodeId===hole&&m.length===0);
  // 底下是會隨馬達試動的零件：走試動，不拖空孔
  const pinned={...w,comps:w.comps.map(c=>c.id===barId?{...c,p1:{...c.p1,type:'fixed'}}:c)};   // 一端接固定孔的搖桿：不是自由件
  rig({drive:true});load(pinned);dom.unused.add(hole);dom.under=[partEl(barId),partEl(plateId)];setDrive('ready');const driven=[];driveHooks.body=(c,g)=>c.id===barId?(()=>({x:0,y:0})):null;driveHooks.to=(t,pt)=>{driven.push([typeof t,S.dragId]);return true;};
  a=JSON.stringify(S.comps);m=await gesture(nodeDown(hole),moves);
  check('[over] 底下的零件跟著馬達：試動（不是拖空孔）',driven.length>0&&driven.every(x=>x[0]==='function'&&x[1]!==hole)&&m.length===0,JSON.stringify(driven));
  // 孔有在用、上面沒有東西、上面只有別的固定板、上面的零件帶不動：維持今天的行為（說這是固定板的孔）
  for(const [label,opts] of [['孔有在用（不是空孔）',{unused:false}],['孔上面沒有別的零件',{under:[plateId]}],['上面只有另一個固定零件',{under:['Other',plateId]}]]){
    rig(opts);a=JSON.stringify(S.comps);m=await gesture(nodeDown(hole),moves);
    check(`[over] ${label}：維持原樣，說明固定板、作品不變`,m.length===1&&m[0]===GROUND&&JSON.stringify(S.comps)===a,m.join('|'));
  }
  rig();load(pinned);dom.unused.add(hole);dom.under=[partEl(barId),partEl(plateId)];
  a=JSON.stringify(S.comps);m=await gesture(nodeDown(hole),moves);
  check('[over] 上面的零件自己被固定、也帶不動：維持原樣說明固定板',m.length===1&&m[0]===GROUND&&JSON.stringify(S.comps)===a,m.join('|'));
}
report('drag-intent');
