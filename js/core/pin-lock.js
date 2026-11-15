import {localHoles,holeWorld} from './local-holes.js';
const safe=s=>typeof s==='string'&&/^[\w.-]+$/.test(s);
const keys=c=>['p1','p2',...(c.type==='triangle'?['p3']:[])].map(k=>c[k]).filter(Boolean);
export const pinPoints=c=>[...keys(c),...localHoles(c).map(h=>({...h,...holeWorld(c,h)}))];
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function localPoint(c,id,params){
 const a=c.p1,b=c.p2,L=c.type==='gear'?Number(params[c.pinRadiusParam]??c.pinRadius??Math.hypot(b.x-a.x,b.y-a.y)):Number(params[c.lenParam||c.gParam]??Math.hypot(b.x-a.x,b.y-a.y));
 if(id===a.id)return {x:0,y:0};if(id===b.id)return {x:L,y:0};
 if(c.p3?.id===id){const r=Number(params[c.r1Param]??gap(a,c.p3)),q=Number(params[c.r2Param]??gap(b,c.p3)),x=(L*L+r*r-q*q)/(2*L);return {x,y:(c.sign<0?-1:1)*Math.sqrt(Math.max(0,r*r-x*x))};}
 const h=localHoles(c).find(p=>p.id===id);return h&&{x:h.u,y:h.v*(c.standardBlank&&c.p3&&c.sign<0?-1:1)};
}
export const pinRadius=(c,a,b,params)=>{const p=localPoint(c,a,params),q=localPoint(c,b,params);return p&&q?gap(p,q):NaN;};

export function normalizePinLocks(raw){
 if(!Array.isArray(raw)||raw.length>32)throw Error('插銷鎖固資料無效。');
 return raw.map(r=>{
  if(!r||!['id','at','with','ownRef','otherRef'].every(k=>safe(r[k]))||!['distanceMm','ownRadiusMm','otherRadiusMm'].every(k=>Number.isFinite(r[k])&&r[k]>1e-6)||![1,-1].includes(r.side))throw Error('插銷鎖固參考孔無效。');
  if(r.distanceMm>r.ownRadiusMm+r.otherRadiusMm+1e-6||r.distanceMm<Math.abs(r.ownRadiusMm-r.otherRadiusMm)-1e-6)throw Error('插銷鎖固三角孔距無法成立。');
  return Object.fromEntries(['id','at','with','ownRef','otherRef','distanceMm','side','ownRadiusMm','otherRadiusMm'].map(k=>[k,r[k]]));
 });
}
export function expandPinLocks(comps,params={}){
 const extra=[],seen=new Set(),lockIds=new Set(),fail=message=>({ok:false,message});
 for(const owner of comps)for(const lock of owner.pinLocks||[]){
  let r;try{r=normalizePinLocks([lock])[0];}catch(e){return fail(e.message);}
  if(lockIds.has(r.id))return fail('插銷鎖固編號重複，請重新建立。');lockIds.add(r.id);
  const other=comps.find(c=>c.id===r.with),a=pinPoints(owner),b=other&&pinPoints(other);
  if(!other||other===owner||!['bar','triangle','gear'].includes(owner.type)||!['bar','triangle','gear'].includes(other.type)||(owner.moduleId||'')!==(other.moduleId||''))return fail('插銷鎖固的兩個零件不存在或不在同一設計。');
  const pivot=a.find(p=>p.id===r.at),q=b.find(p=>p.id===r.at),u=a.find(p=>p.id===r.ownRef),v=b.find(p=>p.id===r.otherRef);
  if(!pivot||!q||!u||!v||u.id===v.id||gap(pivot,u)<1e-6||gap(q,v)<1e-6)return fail('插銷鎖固的共享孔或參考孔已變更，請先解鎖。');
  if(Math.abs(pinRadius(owner,r.at,r.ownRef,params)-r.ownRadiusMm)>.001||Math.abs(pinRadius(other,r.at,r.otherRef,params)-r.otherRadiusMm)>.001)return fail('插銷鎖固參考孔距已變更，請先解鎖再改尺寸。');
  const pair=[owner.id,other.id].sort().join('|')+'|'+r.at;if(seen.has(pair))return fail('同一對零件的插銷鎖固重複。');seen.add(pair);
  extra.push({type:'triangle',id:'pin-lock-'+r.id,hidden:true,p1:{...pivot,type:'floating'},p2:{...u,type:'floating'},p3:{...v,type:'floating'},gParam:r.ownRadiusMm,r1Param:r.otherRadiusMm,r2Param:r.distanceMm,sign:r.side});
 }
 return {ok:true,comps:extra.length?[...comps,...extra]:comps,extra};
}
