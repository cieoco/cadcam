/** Display and picking of reserved holes never modifies fabrication geometry. */
import {holeSide,idCounts} from '../core/local-holes.js';
import {isHoleUsed} from '../blocks/used-holes.js';
import {inside} from '../blocks/part-fusion.js';
const cache=new WeakMap();
const edgeDistance=(p,ring)=>Math.min(...ring.map((a,i)=>{const b=ring[(i+1)%ring.length],x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);}));
export function partHoleDisplay(model,part,full=false){
 const source=model.holeDisplaySource,c=source?.comps.find(c=>c.id===part.partId),g=part.geometry;
 if(!c?.standardBlank||c.fusedWith)return {holes:g.holes,reserved:[]};
 let use=cache.get(source);if(!use){use=idCounts(source.comps,source.modules);cache.set(source,use);}
 const used=p=>isHoleUsed(c,p,source.comps,{params:source.params,use}),raw=new Map((c.holes||[]).map(h=>[h.id,h])),ids=new Set(g.holes.map(h=>h.id)),omitted=new Set(source.omitted?.[part.partId]?.omittedHoleIds || []);
 const holes=full||g.holes.length<64?g.holes:g.holes.filter(h=>h.holePairId||!raw.has(h.id)||used(raw.get(h.id)));
 const reserved=(c.holes||[]).filter(h=>!ids.has(h.id)&&!omitted.has(h.id)).map(h=>({id:h.id,x:h.u,y:h.v*holeSide(c),r:(h.diameter||3.2)/2,reserved:true})).filter(h=>Number.isFinite(h.x+h.y+h.r)&&g.outlines.some(r=>inside(h,r)&&edgeDistance(h,r)>=h.r-.001)&&!g.cutouts.some(v=>inside(h,v.points)||edgeDistance(h,v.points)<h.r)&&!g.holes.some(q=>Math.hypot(h.x-q.x,h.y-q.y)<h.r+q.r-.001));
 return {holes,reserved};
}
