/** A joint exposes its owners' existing dimensions, never a second geometry model. */
import {memberDimensions,dimensionLock} from './member-dimensions.js';

export function pointDimensions(comps,pointId){
  if(!pointId)return [];
  return comps.flatMap(comp=>memberDimensions(comp).filter(d=>d.param&&d.refs?.some(ref=>comp[ref]?.id===pointId)).map(d=>({
    ...d,componentId:comp.id,key:JSON.stringify([comp.id,d.id]),
    optionLabel:`${comp.label||comp.name||comp.id} · ${d.label}`,
    lock:dimensionLock(comp,comps,d.id)
  })));
}
