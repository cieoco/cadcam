/** 馬達與輸出桿的解除連接，以及「軸心已離開座板原孔」的偵測與修復。按需載入；純規劃函式不碰 DOM。 */
import {holeWorld} from '../core/local-holes.js';
import {planMotorInstallation,actuatorHostPoints} from './actuator-installation.js';
import {planActuatorPlateHoles} from './actuator-plate-holes.js';
import {buildRelations} from './relations.js';
import {integrityGate} from './integrity-gate.js';

const keys=['p1','p2','p3'];
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=0.01;
const holeLabel=(host,h)=>host.type==='bar'?`第${h.u/8+1}孔`:`長向第${h.u/8+1}、直向第${h.v/8+1}孔`;

/** 軸心 id 是座板格孔，但存檔座標不在那個孔上（例如解除位置鎖定後拖走）。 */
export function offPlateMotors(comps=[]){
  const out=[],rel=buildRelations({comps});
  for(const c of comps){
    const m=rel.motorOf(c.id),center=m?.ownerId===c.id&&m.centerId,host=m?.frameBodyId&&comps.find(h=>h.id===m.frameBodyId);
    if(!center||!host?.standardBlank)continue;
    const hole=[...(host.holes||[]),...(host.standardBlank.mountHoles||[])].find(h=>h.id===center);
    const shaft=keys.map(k=>c[k]).find(p=>p?.id===center);
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
  const owner=comps.find(c=>c.id===item.id),group=new Set([owner]),nodes=new Set(keys.map(k=>owner[k]?.id).filter(id=>id&&id!==item.center));
  let free=true,grew=true;
  while(grew){grew=false;for(const c of comps){if(group.has(c)||c===item.host||!keys.some(k=>nodes.has(c[k]?.id)))continue;
    group.add(c);grew=true;for(const k of keys){const p=c[k];if(!p)continue;if(p.id===item.center)continue;if(p.type==='fixed'||p.type==='motor'||item.host&&keys.some(j=>item.host[j]?.id===p.id))free=false;nodes.add(p.id);}}}
  if(comps.some(c=>!group.has(c)&&c!==item.host&&keys.some(k=>nodes.has(c[k]?.id))))free=false;
  return {group,free};
}

/** 把軸心移回座板原孔；只接在這顆馬達上的零件一起平移，保持原姿勢與長度。 */
export function planMotorReturn(source,id){
  const next=work(source),item=offPlateMotors(next.comps).find(i=>i.id===id);
  if(!item)return {ok:false,message:'馬達軸心已在座板原孔上。'};
  const dx=item.world.x-item.shaft.x,dy=item.world.y-item.shaft.y,{group,free}=attachedGroup(next.comps,item);
  if(free){const moved=new Set();for(const c of group)for(const k of keys){const p=c[k];if(!p||p.id===item.center||moved.has(p))continue;moved.add(p);p.x+=dx;p.y+=dy;}}
  for(const c of next.comps)if(c!==item.host)for(const k of keys)if(c[k]?.id===item.center)Object.assign(c[k],{x:item.world.x,y:item.world.y});
  const holes=planActuatorPlateHoles(next);if(!holes.ok)return {ok:false,message:holes.message};
  return {ok:true,comps:holes.comps,params:next.params,message:free?'已把馬達與接在它上面的桿件放回座板原孔，可按復原。':'已把馬達軸心放回座板原孔；相連的零件會依新的軸心重新求解，可按復原。'};
}

/** 讓馬達離開座板：軸心改成自己的固定點，保留目前畫面上的位置。 */
export function planMotorLeave(source,id){
  const next=work(source),item=offPlateMotors(next.comps).find(i=>i.id===id);
  if(!item)return {ok:false,message:'馬達軸心在座板原孔上，不需要改成獨立固定點。'};
  const owner=next.comps.find(c=>c.id===id),m=owner.motorMount,used=new Set(next.comps.flatMap(c=>keys.map(k=>c[k]?.id)));
  let fresh=`${m.partId||owner.id}.A`,n=2;while(used.has(fresh))fresh=`${m.partId||owner.id}.A${n++}`;
  for(const c of next.comps)if(c!==item.host)for(const k of keys)if(c[k]?.id===item.center)c[k]={...c[k],id:fresh,type:'fixed'};
  const host=next.comps.find(c=>c.id===item.host.id),axis=Math.atan2(host.p2.y-host.p1.y,host.p2.x-host.p1.x)*180/Math.PI;
  if(m.orientation==='follow-frame')Object.assign(m,{orientation:'horizontal',angleDeg:(m.angleDeg||0)+axis});
  m.center=fresh;delete m.frameBody;if(Array.isArray(m.order))m.order=m.order.filter(k=>k!=='frameBody');
  if(host.motorMountPoint===item.center)delete host.motorMountPoint;
  const holes=planActuatorPlateHoles(next);if(!holes.ok)return {ok:false,message:holes.message};
  return {ok:true,comps:holes.comps,params:next.params,message:'馬達已離開座板，軸心改成獨立固定點；座板原孔已釋出，可按復原。'};
}

/** 從選取的輸入桿解除與馬達的連接；馬達與桿件都保留。 */
export function planMotorRelease(source,barId,points={},motion={}){
  const bar=source.comps.find(c=>c.id===barId);
  if(bar?.type!=='bar'||!bar.isInput||bar.style==='piston')return {ok:false,message:'這根桿件沒有接在馬達軸上。'};
  const m=bar.motorMount||{},center=m.center||[bar.p1,bar.p2].find(p=>p?.physicalMotor)?.id,hostId=m.frameBody||bar.motorCarrier||'world';
  const host=source.comps.find(c=>c.id===hostId),hostEnd=host?actuatorHostPoints(host).find(p=>p.id===center)?.key:'p1';
  const plan=planMotorInstallation(source,{type:bar.motorType||'tt',motorId:String(bar.physicalMotor||'1'),existingId:bar.id,hostId,hostEnd,face:m.face||'back',
    orientation:m.orientation||'horizontal',angleDeg:m.angleDeg??0,reversed:!!m.reversed,outputId:'',outputEnd:bar.p2?.id===center?'p2':'p1',start:bar.servoStart??0,end:bar.servoEnd??90,angle:0},points,motion);
  if(!plan.ok)return plan;
  return {ok:true,comps:plan.comps,params:plan.params,message:`已解除「${bar.name||bar.id}」與馬達的連接；馬達與桿件都保留，可再接回，也可按復原。`};
}

// ---- 畫面接頭（app 以 window.blocks.motorRelease 呼叫；離開座板的提示由 integrity-hints.js 顯示）----
function commit(api,plan){
  if(!plan.ok){api.notify(plan.message);return false;}
  const S=api.S;
  if(!integrityGate({comps:S.comps,modules:S.modules,params:S.topo.params},{comps:plan.comps,modules:plan.modules||S.modules,params:plan.params||S.topo.params},api.notify))return false;
  api.pause?.();api.pushUndo();api.S.comps=plan.comps;if(plan.params)api.S.topo.params=plan.params;
  api.rebuild();api.draw();api.save?.();api.notify(plan.message);api.refresh?.();return true;
}
export function run(action,api){
  const S=api.S,source={comps:S.comps,params:S.topo.params,fabrication:S.fabrication,modules:S.modules,counter:S.counter};
  if(S.mode&&S.mode!=='design'){api.notify('請在設計模式修改馬達連接。');return false;}
  if(action==='release')return commit(api,planMotorRelease(source,api.id||S.selectedLinkId,api.points?.()||{},api.motion||{}));
  const id=api.id||offPlateMotors(S.comps)[0]?.id;
  if(action==='back')return commit(api,planMotorReturn(source,id));
  if(action==='leave')return commit(api,planMotorLeave(source,id));
  return false;
}
