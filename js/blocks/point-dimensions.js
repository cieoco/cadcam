/** A joint exposes its owners' existing dimensions, never a second geometry model. */
import {memberDimensions,dimensionLock} from './member-dimensions.js';

export function pointDimensions(comps,pointId){
  if(!pointId)return [];
  const kind=c=>c.shape==='disk'?'圓盤':c.type==='triangle'?'三點板':c.boxPanel?'盒板':c.type==='bar'?'連桿':c.type;
  return comps.flatMap(comp=>memberDimensions(comp).filter(d=>d.param&&d.refs?.some(ref=>comp[ref]?.id===pointId)).map(d=>({
    ...d,componentId:comp.id,key:JSON.stringify([comp.id,d.id]),
    optionLabel:`${comp.label||comp.name||`${kind(comp)} ${comps.filter(c=>kind(c)===kind(comp)).indexOf(comp)+1}`} · ${d.label}`,
    lock:dimensionLock(comp,comps,d.id)
  })));
}
