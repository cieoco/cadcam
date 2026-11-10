/** Display-only thinning; no hole is removed from the design or export. */
import {isHoleUsed} from './used-holes.js';
import {idCounts} from '../core/local-holes.js';
export function hiddenGridHoles(comps,points,{modules,params,project,bounds,keep=[]}={}){
 const hidden=new Set(),protectedIds=new Set(keep),use=idCounts(comps,modules);
 for(const c of comps){
  if(!c.standardBlank||(c.holes?.length||0)<128)continue;
  const origin=project({x:0,y:0}),unit=project({x:8,y:0}),stride=Math.max(1,Math.ceil(20/Math.hypot(unit.x-origin.x,unit.y-origin.y)));
  for(const h of c.holes){
   if(protectedIds.has(h.id)||isHoleUsed(c,h,comps,{params,use}))continue;
   const p=points[h.id];if(!p)continue;const q=project(p);
   if(q.x<bounds.left||q.x>bounds.right||q.y<bounds.top||q.y>bounds.bottom){hidden.add(h.id);continue;}
   // Keep exceptional off-grid holes; sample regular rows/columns evenly.
   if(Number.isInteger(h.u/8)&&Number.isInteger(h.v/8)&&(h.u/8%stride!==0||h.v/8%stride!==0))hidden.add(h.id);
  }
 }
 return hidden;
}
