import {pinPoints} from '../core/pin-lock.js';
import {makePinLock} from './pin-lock-plan.js';
import {pointKeysFor} from './part-types.js';
import {freezeDisplayedPose} from './pose-freeze.js';
import {planFirstGearPin} from './gear-first-pin.js';
import {gearPivotRotation,rotateGearPinnedMember} from './gear-pin-connection.js';
import {planGearPinConnection} from './gear-pin-plans.js';
import {pointCoords} from './model.js';
const fail=message=>({ok:false,message});
const supported=c=>['bar','triangle','gear','anchor'].includes(c.type);
const records=comps=>comps.flatMap(c=>(c.pinLocks||[]).map(lock=>({owner:c,lock})));
const pair=(r,a,b,at)=>r.lock.at===at&&((r.owner.id===a&&r.lock.with===b)||(r.owner.id===b&&r.lock.with===a));
const motorAt=(comps,at)=>comps.some(c=>c.type==='motor'&&c.p1?.id===at||c.motorMount?.center===at||['p1','p2'].some(k=>c[k]?.id===at&&c[k].physicalMotor));
const result=(work,comps,message)=>({ok:true,comps,params:{...work.params},message,clearSelection:false});
export function pinPairs(work,at){
 const owners=work.comps.filter(c=>supported(c)&&pinPoints(c).some(p=>p.id===at)),out=[],locks=records(work.comps);
 for(let i=0;i<owners.length;i++)for(let j=i+1;j<owners.length;j++){
  const a=owners[i],b=owners[j];out.push({ownerId:a.id,otherId:b.id,at,locked:locks.some(r=>pair(r,a.id,b.id,at)),limited:pinPoints(a).some(p=>p.id!==at&&pinPoints(b).some(q=>q.id===p.id)),motor:motorAt([a,b],at)});
 }
 return out;
}
export function planPinLock(work,{ownerId,otherId,at}){
 if(records(work.comps).some(r=>pair(r,ownerId,otherId,at)))return {ok:true,unchanged:true};
 const used=new Set(records(work.comps).map(r=>r.lock.id));let n=Number(work.counter)||1;while(used.has('PinLock'+n))n++;
 const r=makePinLock(work.comps,{ownerId,otherId,at,id:'PinLock'+n},work.points||{},work.params);if(!r.ok)return r;
 return result(work,r.comps,'已鎖固這兩件的插銷；相對方向固定，零件仍分開，可改回可轉。');
}
export function planPinUnlock(work,{ownerId,otherId,at}){
 const found=records(work.comps).filter(r=>pair(r,ownerId,otherId,at));if(!found.length)return {ok:true,unchanged:true};
 const comps=structuredClone(work.comps);freezeDisplayedPose(comps,ownerId,work.points||{});
 for(const c of comps)if(c.pinLocks){c.pinLocks=c.pinLocks.filter(lock=>!found.some(r=>r.owner.id===c.id&&r.lock.id===lock.id));if(!c.pinLocks.length)delete c.pinLocks;}
 return result(work,comps,'已改為可轉插銷；共用孔與其他插銷保留。');
}
export function planUnpin(work,{ownerId,otherId,at}){
 const owner=work.comps.find(c=>c.id===ownerId),other=work.comps.find(c=>c.id===otherId);
 if(!owner||!other||!pinPoints(owner).some(p=>p.id===at)||!pinPoints(other).some(p=>p.id===at))return fail('這兩件沒有共用所選孔。');
 if(owner.type==='anchor')return fail('請拔除積木端的插銷，支點本身保留。');
 if(motorAt(work.comps,at))return fail('這是動力輸出軸，請沿原馬達安裝流程解除。');
 if(owner.barFusion||owner.barFusionRoot||owner.boxPanel||owner.fusedWith)return fail('請先解除合成或盒體安裝，再拔除此零件的插銷。');
 const comps=structuredClone(work.comps);freezeDisplayedPose(comps,ownerId,work.points||{});
 const target=comps.find(c=>c.id===ownerId),ids=new Set(comps.flatMap(pinPoints).map(p=>p.id));let fresh=ownerId+'.unpin',n=1;while(ids.has(fresh))fresh=ownerId+'.unpin'+n++;
 for(const k of pointKeysFor(target))if(target[k]?.id===at){target[k].id=fresh;target[k].type='floating';}
 for(const h of target.holes||[])if(h.id===at){h.id=fresh;h.type='floating';}
 for(const c of comps)if(c.pinLocks){c.pinLocks=c.pinLocks.filter(r=>r.at!==at||c.id!==ownerId&&r.with!==ownerId);if(!c.pinLocks.length)delete c.pinLocks;}
 return result(work,comps,'已拔除所選零件在這個孔的插銷；其他零件、孔距與其餘連接保留。');
}
export function planInsertPin(work,{ownerId,otherId,from,to}){
 let owner=work.comps.find(c=>c.id===ownerId),other=work.comps.find(c=>c.id===otherId);
 if(!owner||!other||owner===other||!supported(owner)||!supported(other))return fail('請選兩個不同剛性零件上的孔。');
 if(!pinPoints(owner).some(p=>p.id===from)||!pinPoints(other).some(p=>p.id===to))return fail('所選孔不屬於指定零件。');
 if(motorAt(work.comps,from)||motorAt(work.comps,to))return fail('這是動力輸出軸，請沿原馬達安裝流程接合。');
 if(from===to)return {ok:true,unchanged:true};
 if(owner.type==='anchor'){if(other.type==='anchor')return fail('兩個獨立支點不需插銷；請選積木上的孔。');return planInsertPin(work,{ownerId:otherId,otherId:ownerId,from:to,to:from});}
 if(owner.type==='gear'&&other.type!=='gear')return planInsertPin(work,{ownerId:otherId,otherId:ownerId,from:to,to:from});
 if(owner.type==='gear')return fail('齒輪間請使用嚙合或原有齒輪安裝流程。');
 const comps=structuredClone(work.comps),positions=work.points||pointCoords(comps),motion={thetaDeg:work.theta||0,motorAngles:work.motorAngles||{}};
 const drop={comps,points:positions,topo:{params:work.params},theta:motion.thetaDeg,angles:motion.motorAngles};
 if(other.type==='gear'){
  const rotation=gearPivotRotation(comps,work.params,from,positions);
  if(rotation){
   const target=positions[to]||pinPoints(other).find(p=>p.id===to),moved=rotateGearPinnedMember(comps,work.params,from,target,{positions,snapDistance:.001});
   if(!moved?.candidate||moved.candidate.from!==from||moved.candidate.to!==to)return fail('兩孔距不合，無法在保持第一插銷與尺寸下插入。');
   const shown={...pointCoords(comps)};for(const c of comps.filter(c=>c.type==='gear'))for(const p of pinPoints(c))if(positions[p.id])shown[p.id]=positions[p.id];
   return planGearPinConnection(work,{...drop,points:shown},moved.candidate);
  }
  return planFirstGearPin(work,drop,from,to,other.id);
 }
 const target=positions[to]||pinPoints(other).find(p=>p.id===to),start=positions[from]||pinPoints(owner).find(p=>p.id===from),ownIds=new Set(pinPoints(owner).map(p=>p.id));
 const p=owner.p1,q=owner.p2,t=owner.p3,pairs=owner.type==='bar'?[[p,q,owner.lenParam]]:[[p,q,owner.gParam],[p,t,owner.r1Param],[q,t,owner.r2Param]];
 if(pairs.some(([a,b,k])=>{const x=positions[a.id]||a,y=positions[b.id]||b;return !Number.isFinite(work.params[k])||Math.abs(Math.hypot(x.x-y.x,x.y-y.y)-work.params[k])>.001;}))return fail('目前姿態與零件孔距不符，這次未插入；請先回到有效姿態。');
 const joints=[...new Set(comps.filter(c=>c.id!==ownerId).flatMap(c=>pinPoints(c).filter(p=>ownIds.has(p.id)).map(p=>p.id)))];
 if(joints.length){
  const shared=joints.filter(id=>pinPoints(other).some(p=>p.id===id));
  if(joints.length!==1||shared.length!==1)return fail('此零件已有多個插銷；這個多點接合目前尚未支援，原連接保留。');
  if(records(comps).some(r=>r.owner.id===ownerId||r.lock.with===ownerId))return fail('請先將鎖固插銷改為可轉，再插入第二孔。');
  const pivot=positions[shared[0]]||pinPoints(owner).find(p=>p.id===shared[0]),r=Math.hypot(start.x-pivot.x,start.y-pivot.y),s=Math.hypot(target.x-pivot.x,target.y-pivot.y);
  if(Math.abs(r-s)>.001||r<1e-6||ownIds.has(to))return fail('第二插銷孔距不合，原插銷與尺寸保留。');
  const angle=Math.atan2(target.y-pivot.y,target.x-pivot.x)-Math.atan2(start.y-pivot.y,start.x-pivot.x),cos=Math.cos(angle),sin=Math.sin(angle),body=comps.find(c=>c.id===ownerId);
  if(body.barFusion||body.barFusionRoot||body.boxPanel||body.fusedWith||body.motorMount||body.isInput||body.fixedLen===false)return fail('這個零件尚不支援第二插銷旋轉接合。');
  for(const k of pointKeysFor(body)){const p=body[k];if(!p)continue;const q=positions[p.id]||p,dx=q.x-pivot.x,dy=q.y-pivot.y;Object.assign(p,{x:pivot.x+dx*cos-dy*sin,y:pivot.y+dx*sin+dy*cos});if(p.id===from)p.id=to;}
  for(const h of body.holes||[])if(h.id===from)h.id=to;
  return {...result(work,comps,'已插入第二插銷；兩件由兩孔定位，會一起轉動。'),retarget:[from,to]};
 }
 if(owner.barFusion||owner.barFusionRoot||owner.boxPanel||owner.fusedWith||owner.motorMount||owner.isInput||owner.fixedLen===false||pinPoints(owner).some(p=>['fixed','motor'].includes(p.type)||p.physicalMotor))return fail('請選未固定、未合成的剛性桿件或板件。');
 const body=comps.find(c=>c.id===ownerId);
 for(const k of pointKeysFor(body)){const p=body[k];if(!p)continue;const shown=positions[p.id]||p;Object.assign(p,{x:shown.x+target.x-start.x,y:shown.y+target.y-start.y});if(p.id===from)p.id=to;}
 for(const h of body.holes||[])if(h.id===from)h.id=to;
 return {...result(work,comps,'已插入可轉插銷；兩孔相接，零件可繞此孔旋轉。'),retarget:[from,to]};
}
