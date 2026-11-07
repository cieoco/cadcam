/** Optional rigid-body local holes. Expansion uses existing triangle constraints. */
export const localHoles=c=>['bar','triangle'].includes(c?.type)?(c.holes || []).filter(h=>Number.isFinite(h.u)&&Number.isFinite(h.v)):[];
export const holeSide=c=>c.standardBlank&&c.p3&&((c.p2.x-c.p1.x)*(c.p3.y-c.p1.y)-(c.p2.y-c.p1.y)*(c.p3.x-c.p1.x))<0?-1:1;
export function holeWorld(c,h){const a=c.p1,b=c.p2,v=h.v*holeSide(c),L=Math.hypot(b.x-a.x,b.y-a.y);if(!L)return {x:a.x,y:a.y};const ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;return {x:a.x+h.u*ux-v*uy,y:a.y+h.u*uy+v*ux};}
export function expandLocalHoles(comps,params){
 const next=comps.map(c=>localHoles(c).length?{...c,holes:(c.holes || []).filter(h=>!localHoles(c).includes(h))}:c),values={...params},aux=[];
 for(const c of comps)for(const h of localHoles(c)){
  const g=c.type==='bar'?c.lenParam:c.gParam,a=Math.hypot(h.u,h.v),b=Math.hypot(h.u-Number(params[g]),h.v);values[a]=a;values[b]=b;
  const item={type:'triangle',id:`localHole.${c.id}.${h.id}`,p1:c.p1,p2:c.p2,p3:{id:h.id,type:h.type==='fixed'?'fixed':'floating',...holeWorld(c,h)},gParam:g,r1Param:a,r2Param:b,sign:h.v*holeSide(c)<0?-1:1};
  aux.push(item);next.push(item);
 }
 return {comps:next,params:values,aux};
}
