/** Derived manufacturing identity shared by the catalog and serializers. */
export function identifiedHoles(partId,holes=[]){
 return holes.map((h,i)=>({...h,id:h.id || `${partId}/hole:${h.layer || 'HOLE'}:${i}`,purpose:h.purpose || h.layer || 'HOLE',partId}));
}
export function holeTrace(h){
 return Object.fromEntries(['id','partId','purpose','holePairId','wingId','connectionId','role'].filter(k=>h[k]!==undefined).map(k=>[k,h[k]]));
}
