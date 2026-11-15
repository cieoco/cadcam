import {pinPoints,pinRadius,expandPinLocks} from '../core/pin-lock.js';
const keys=c=>['p1','p2',...(c.type==='triangle'?['p3']:[])].map(k=>c[k]).filter(Boolean);
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function makePinLock(comps,{ownerId,otherId,at,id},positions={},params={}){
 const owner=comps.find(c=>c.id===ownerId),other=comps.find(c=>c.id===otherId),fail=message=>({ok:false,message});
 if(!owner||!other||owner===other||!['bar','triangle','gear'].includes(owner.type)||!['bar','triangle','gear'].includes(other.type))return fail('請選兩個剛性零件的共用孔。');
 if([owner,other].some(c=>c.boxPanel||c.barFusion||c.barFusionRoot||c.fixedLen===false||c.style==='piston'))return fail('這個零件尚不支援插銷鎖固。');
 const points=c=>pinPoints(c).map(p=>({...p,...positions[p.id]})),a=points(owner),b=points(other),pivot=a.find(p=>p.id===at);
 if(!pivot||!b.some(p=>p.id===at))return fail('兩件尚未共用這個孔。');
 if([owner,other].some(c=>c.motorMount?.center===at||keys(c).some(p=>p.id===at&&p.physicalMotor)))return fail('這是動力輸出軸，請沿原馬達安裝流程修改。');
 if(a.some(p=>p.id!==at&&b.some(q=>q.id===p.id)))return fail('兩件已由另一插銷限制，請先拔除多餘插銷。');
 for(const u of a.filter(p=>p.id!==at))for(const v of b.filter(p=>p.id!==at&&p.id!==u.id)){
  const cross=(u.x-pivot.x)*(v.y-pivot.y)-(u.y-pivot.y)*(v.x-pivot.x);
  if(gap(u,v)<1e-5)continue;
  const ownRadiusMm=pinRadius(owner,at,u.id,params),otherRadiusMm=pinRadius(other,at,v.id,params),ua=gap(pivot,u),vb=gap(pivot,v);
  if(!(ua>1e-6&&vb>1e-6))continue;
  const x=(u.x-pivot.x)*ownRadiusMm/ua-(v.x-pivot.x)*otherRadiusMm/vb,y=(u.y-pivot.y)*ownRadiusMm/ua-(v.y-pivot.y)*otherRadiusMm/vb;
  const record={id,at,with:other.id,ownRef:u.id,otherRef:v.id,distanceMm:Math.hypot(x,y),side:cross<0?-1:1,ownRadiusMm,otherRadiusMm};
  const next=structuredClone(comps),target=next.find(c=>c.id===owner.id);target.pinLocks=[...(target.pinLocks||[]),record];
  const check=expandPinLocks(next,params);return check.ok?{ok:true,comps:next,record}:check;
 }
 return fail('參考孔完全重合，這種鎖固目前尚未支援；仍保留可轉插銷。');
}
