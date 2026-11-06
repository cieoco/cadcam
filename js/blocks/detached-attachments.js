import {attachmentPoint} from '../core/syringe.js';

// Losing a host severs its relation, not the attached object. Position is a
// display seed only; attachmentPoint and the solver never treat it as a joint.
export function detachDeletedAttachments(comps,deletedIds,params,points) {
  return comps.map(c=>{
    if(c.type!=='syringe'||deletedIds.has(c.id))return c;
    const patch={};
    for(const key of ['a','b'])if(deletedIds.has(c[key]?.componentId)){
      const position=attachmentPoint(c[key],comps,params,points);
      patch[key]={componentId:'',u:0,v:0,...(position?{position:{x:position.x,y:position.y}}:{})};
    }
    return Object.keys(patch).length?{...c,...patch}:c;
  });
}
