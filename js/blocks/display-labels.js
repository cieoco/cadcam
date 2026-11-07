/** Human-facing labels only. Stable IDs remain the interaction/save keys. */
import {pointKeysFor} from './part-types.js';
const shortId=id=>/^[A-Za-z]\d{0,2}(?:_\d+)?$/.test(id || '');
export function partDisplayName(comps,id){
 const c=comps.find(c=>c.id===id);return c?.name || (shortId(id)?id:c?`零件 ${comps.indexOf(c)+1}`:'零件');
}
export function pointDisplayName(comps,id){
 if(shortId(id))return id;
 const owner=comps.find(c=>c.name&&pointKeysFor(c).some(k=>c[k]?.id===id));
 if(owner){const keys=pointKeysFor(owner),index=keys.findIndex(k=>owner[k]?.id===id);return `${owner.name}・孔 ${index+1}`;}
 const ids=[...new Set(comps.flatMap(c=>[...pointKeysFor(c).map(k=>c[k]?.id),...(c.holes || []).map(h=>h.id)]).filter(Boolean))];
 return ids.includes(id)?`接點 ${ids.indexOf(id)+1}`:'未識別接點';
}
