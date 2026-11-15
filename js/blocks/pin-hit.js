// Pointer tolerance is in screen pixels, independent of drawn-hole detail level.
export function pickPinTargets(targets,point,radius=24){
 const near=targets.map(t=>({...t,d:Math.hypot(t.x-point.x,t.y-point.y)})).filter(t=>Number.isFinite(t.d)&&t.d<=radius).sort((a,b)=>a.d-b.d);
 if(!near.length)return [];
 const ids=new Set();return near.filter(t=>t.d<=near[0].d+.75).filter(t=>{const key=t.ownerId+'|'+t.id;if(ids.has(key))return false;ids.add(key);return true;});
}
