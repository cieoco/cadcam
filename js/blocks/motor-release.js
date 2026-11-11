/** 馬達與輸出桿的解除連接，以及「軸心已離開座板原孔」的偵測與修復。按需載入；純規劃函式不碰 DOM。
 *  M1（docs/SDD-MOTOR-PART.md）：解除／放回／離開座板在「馬達是獨立零件」的形狀上規劃（*Parts 版本，由 runEdit 的 shape:'parts' 轉換進出）；
 *  planMotorRelease／planMotorReturn／planMotorLeave 是今日形狀進出的包裝（給測試與修復項目直接呼叫）。id 一律用今日形狀的 id：
 *  接著輸出件的馬達用輸出件 id，獨立馬達用馬達 id。offPlateMotors／attachedGroup 仍讀今日形狀（給還沒搬家的呼叫端）。 */
import {holeWorld} from '../core/local-holes.js';
import {actuatorHostPoints,fixedPlate} from './actuator-installation.js';
import {buildRelations} from './relations.js';
import {pointKeysFor} from './part-types.js';
import {runEdit} from './edit-pipeline.js';
import {onParts,settlePlateHoles} from './plan-shape.js';
import {isMotorPart,GENERATED_ID_PREFIX} from './motor-part.js';
import {frameNodeIds} from './model.js';
import {freezeDisplayedPose} from './pose-freeze.js';

const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=0.01;
const holeLabel=(host,h)=>host.type==='bar'?`第${h.u/8+1}孔`:`長向第${h.u/8+1}、直向第${h.v/8+1}孔`;

/** 軸心 id 是座板格孔，但存檔座標不在那個孔上（例如解除位置鎖定後拖走）。 */
export function offPlateMotors(comps=[]){
  const out=[],rel=buildRelations({comps});
  for(const c of comps){
    const m=rel.motorOf(c.id),center=m?.ownerId===c.id&&m.centerId,host=m?.frameBodyId&&comps.find(h=>h.id===m.frameBodyId);
    if(!center||!host?.standardBlank)continue;
    const hole=[...(host.holes||[]),...(host.standardBlank.mountHoles||[])].find(h=>h.id===center);
    const shaft=pointKeysFor(c).map(k=>c[k]).find(p=>p?.id===center);
    if(!hole||!shaft)continue;
    const world=holeWorld(host,hole);
    if(!near(shaft,world))out.push({id:c.id,center,host,hole,shaft:{x:shaft.x,y:shaft.y},world});
  }
  return out;
}
export function offPlateMessage(item){
  return `馬達軸心不在「${item.host.name||item.host.id}」的原孔（${holeLabel(item.host,item.hole)}）上，畫面與製作會對不起來。請選「把馬達放回座板原孔」或「讓馬達離開座板（改成獨立固定點）」，也可以刪除馬達。`;
}

const work=source=>({...structuredClone(source),comps:structuredClone(source.comps),params:{...source.params}});
// 只經由活動接點與這顆馬達相連的零件（不含座板本身、也沒接到其他固定點）。
export function attachedGroup(comps,item){
  const rel=buildRelations({comps}),owner=comps.find(c=>c.id===item.id),host=item.host,hostIds=new Set(host?pointKeysFor(host).map(k=>host[k]?.id):[]);
  // 以關係索引找共用某個點 id 的其他零件（座板本身不算）。
  const sharing=id=>rel.copiesOf(id).filter(r=>r.key&&r.compId!==host?.id).map(r=>rel._internal.compById(r.compId));
  const group=new Set([owner]),nodes=new Set(pointKeysFor(owner).map(k=>owner[k]?.id).filter(id=>id&&id!==item.center)),queue=[...nodes];
  let free=true;
  while(queue.length)for(const c of sharing(queue.pop())){
    if(group.has(c))continue;group.add(c);
    for(const k of pointKeysFor(c)){const p=c[k];if(!p||p.id===item.center)continue;if(p.type==='fixed'||p.type==='motor'||hostIds.has(p.id))free=false;if(!nodes.has(p.id)){nodes.add(p.id);queue.push(p.id);}}
  }
  for(const id of nodes)if(sharing(id).some(c=>!group.has(c)))free=false;
  return {group,free};
}

// ---- 馬達零件形狀上的規劃（comps 裡的馬達是 type:'motor' 零件；輸出件用 drives.body 指回）----
/** 軸心 id 是座板格孔，但馬達零件記的位置不在那個孔上。id＝今日形狀的 id（接著輸出件時是輸出件 id）。 */
export function offPlateParts(comps=[]){
  const out=[];
  for(const P of comps){
    if(!isMotorPart(P))continue;
    const host=P.mount?.frameBody&&comps.find(h=>h.id===P.mount.frameBody);
    if(!host?.standardBlank)continue;
    const hole=[...(host.holes||[]),...(host.standardBlank.mountHoles||[])].find(h=>h.id===P.p1.id);
    if(!hole)continue;
    const world=holeWorld(host,hole);
    if(!near(P.p1,world))out.push({id:P.drives?.body||P.id,part:P,center:P.p1.id,host,hole,shaft:{x:P.p1.x,y:P.p1.y},world});
  }
  return out;
}

/**
 * 讓一顆接著輸出件的馬達變成沒有輸出的獨立馬達（解除輸出與刪掉輸出件共用）：清掉 drives、軸心留在目前畫面的位置、
 * 安裝記錄補成完整（面、方向、角度）、承載座板記下這顆馬達的座孔；相連的零件先記下目前的姿勢。回傳 {ok,comps}（新陣列，不改傳入的）｜{ok:false,message}。
 * 沒有接輸出件的馬達原樣回傳。輸出件本身怎麼處理（保留或刪除）由呼叫端決定。
 */
export function freeMotor(source,motorId,points={}){
  const comps=structuredClone(source),fail=message=>({ok:false,message}),P=comps.find(c=>c.id===motorId);
  if(!isMotorPart(P)||!P.drives)return {ok:true,comps};
  const m=P.mount||{},center=P.p1.id,hostId=m.frameBody||m.carrier||'world',host=hostId==='world'?null:comps.find(c=>c.id===hostId&&['bar','triangle'].includes(c.type))||null;
  const face=m.face||'back',orientation=m.orientation||'horizontal',angleDeg=m.angleDeg??0;
  if(!['horizontal','vertical','follow-frame'].includes(orientation)||!['front','back'].includes(face))return fail('請選有效的馬達型號與安裝方向。');
  if(!Number.isFinite(angleDeg)||Math.abs(angleDeg)>360)return fail('安裝轉角需在 −360～360°。');
  if(!host&&face==='front')return fail('圖面基準沿用背面安裝。');
  if(host?.type==='bar'&&orientation!=='follow-frame'&&![host.p1,host.p2].every(p=>frameNodeIds(comps).has(p.id)))return fail('活動承載桿上的外殼方向需沿承載桿。');
  const body=comps.find(c=>c.id===P.drives.body);
  if(body&&(body.barFusion||body.barFusionRoot))return fail('請先解除桿件合成，再解除個別輸出連接。');
  const seat=host&&actuatorHostPoints(host).find(p=>p.id===center),shown=points[center],at=[shown,seat,P.p1].find(p=>p&&[p.x,p.y].every(Number.isFinite));
  if(body)freezeDisplayedPose(comps,body.id,points);                              // 相連的零件保持目前姿勢，被放開的桿不會跳
  const id=host?center:`${P.id}.A`;
  P.p1={...P.p1,id,type:!host||fixedPlate(host,comps)?'fixed':'floating',x:at.x,y:at.y};
  P.mount={face,orientation,angleDeg,reversed:!!m.reversed,...(host?{frameBody:host.id}:{})};
  if(P.motorType==='mg995'){P.servoStart=P.servoStart??0;P.servoEnd=P.servoEnd??90;}
  delete P.drives;
  for(const c of comps)if(c.motorMountPoint===center&&c.id!==host?.id)delete c.motorMountPoint;
  if(host&&seat){host.motorMountPoint=id;host.frameSeparate=true;}   // 承載件上沒有這個孔就不記（例如範例的馬達掛在世界固定點上）
  return {ok:true,comps};
}

/** 把軸心移回座板原孔；只接在這顆馬達上的零件一起平移，保持原姿勢與長度。work＝馬達零件形狀。 */
export function planMotorReturnParts(source,id){
  const next=work(source),item=offPlateParts(next.comps).find(i=>i.id===id);
  if(!item)return {ok:false,message:'馬達軸心已在座板原孔上。'};
  const dx=item.world.x-item.shaft.x,dy=item.world.y-item.shaft.y,{group,free}=attachedGroup(next.comps,item);
  if(free){const moved=new Set();for(const c of group)for(const k of pointKeysFor(c)){const p=c[k];if(!p||p.id===item.center||moved.has(p))continue;moved.add(p);p.x+=dx;p.y+=dy;}}
  for(const c of next.comps)if(c.id!==item.host.id)for(const k of pointKeysFor(c))if(c[k]?.id===item.center)Object.assign(c[k],{x:item.world.x,y:item.world.y});
  const holes=settlePlateHoles(next);if(!holes.ok)return {ok:false,message:holes.message};
  return {ok:true,comps:holes.comps,params:next.params,message:free?'已把馬達與接在它上面的桿件放回座板原孔，可按復原。':'已把馬達軸心放回座板原孔；相連的零件會依新的軸心重新求解，可按復原。'};
}

/** 讓馬達離開座板：軸心改成自己的固定點，保留目前畫面上的位置。work＝馬達零件形狀。 */
export function planMotorLeaveParts(source,id){
  const next=work(source),item=offPlateParts(next.comps).find(i=>i.id===id);
  if(!item)return {ok:false,message:'馬達軸心在座板原孔上，不需要改成獨立固定點。'};
  const P=next.comps.find(c=>c.id===item.part.id),m=P.mount,used=new Set(next.comps.flatMap(c=>pointKeysFor(c).map(k=>c[k]?.id)));
  const base=P.drives&&P.id.startsWith(GENERATED_ID_PREFIX)?P.drives.body:P.id;
  let fresh=`${base}.A`,n=2;while(used.has(fresh))fresh=`${base}.A${n++}`;
  for(const c of next.comps)if(c.id!==item.host.id)for(const k of pointKeysFor(c))if(c[k]?.id===item.center)c[k]={...c[k],id:fresh,type:'fixed'};
  const host=next.comps.find(c=>c.id===item.host.id),axis=Math.atan2(host.p2.y-host.p1.y,host.p2.x-host.p1.x)*180/Math.PI;
  if(m.orientation==='follow-frame')Object.assign(m,{orientation:'horizontal',angleDeg:(m.angleDeg||0)+axis});
  delete m.frameBody;
  if(host.motorMountPoint===item.center)delete host.motorMountPoint;
  const holes=settlePlateHoles(next);if(!holes.ok)return {ok:false,message:holes.message};
  return {ok:true,comps:holes.comps,params:next.params,message:'馬達已離開座板，軸心改成獨立固定點；座板原孔已釋出，可按復原。'};
}

/** 從選取的輸入桿解除與馬達的連接；馬達與桿件都保留。work＝馬達零件形狀；barId＝今日形狀的輸出桿 id。 */
export function planMotorReleaseParts(source,barId,points={}){
  const bar=source.comps.find(c=>c.id===barId),P=bar?.type==='bar'&&source.comps.find(c=>isMotorPart(c)&&c.drives?.body===barId);
  if(!P)return {ok:false,message:'這根桿件沒有接在馬達軸上。'};
  const freed=freeMotor(source.comps,P.id,points);if(!freed.ok)return freed;
  const comps=freed.comps,out=comps.find(c=>c.id===barId),center=P.p1.id;
  const key=pointKeysFor(out).find(k=>out[k]?.id===center);if(!key)return {ok:false,message:'原輸出軸心不存在。'};
  const ids=new Set(comps.flatMap(c=>pointKeysFor(c).map(k=>c[k]?.id)));let released=`${out.id}.released`,n=1;while(ids.has(released))released=`${out.id}.released${n++}`;
  out[key]={...out[key],id:released,type:'floating'};                                   // 桿件這一端離開軸心，成為自由端
  const holes=settlePlateHoles({comps,params:{...source.params},modules:source.modules,fabrication:source.fabrication});   // 座板有舊問題時照樣解除
  return {ok:true,comps:holes.ok?holes.comps:comps,params:{...source.params},message:`已解除「${bar.name||bar.id}」與馬達的連接；馬達與桿件都保留，可再接回，也可按復原。`};
}

// 今日形狀進出的包裝（直接呼叫規劃函式的測試與修復項目用）
export const planMotorReturn=onParts(planMotorReturnParts);
export const planMotorLeave=onParts(planMotorLeaveParts);
export const planMotorRelease=onParts((work,barId,points)=>planMotorReleaseParts(work,barId,points));

// ---- 畫面接頭（app 以 window.blocks.motorRelease 呼叫；離開座板的提示由 integrity-hints.js 顯示）----
// 提交走共用的 edit-pipeline（一致性檢查、一次復原、一行回饋）；這裡只負責挑規劃函式。
function commit(api,planner){
  return runEdit({name:'馬達連接',shape:'parts',plan:work=>{const r=planner(work);return r.ok?{...r,clearSelection:false}:r;},
    host:{S:api.S,transient:api.notify,pushUndo:api.pushUndo,pause:api.pause,rebuild:api.rebuild,draw(){api.draw();api.save?.();api.refresh?.();}}});
}
export function run(action,api){
  const S=api.S;
  if(S.mode&&S.mode!=='design'){api.notify('請在設計模式修改馬達連接。');return false;}
  if(action==='release')return commit(api,work=>planMotorReleaseParts(work,api.id||S.selectedLinkId,api.points?.()||{}));
  const id=api.id||offPlateMotors(S.comps)[0]?.id;
  if(action==='back')return commit(api,work=>planMotorReturnParts(work,id));
  if(action==='leave')return commit(api,work=>planMotorLeaveParts(work,id));
  return false;
}
