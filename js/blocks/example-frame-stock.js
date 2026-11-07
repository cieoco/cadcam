import {frameConnectorNodes} from './model.js';
import {pointKeysFor} from './part-types.js';

/** Author built-in stock without changing a single mechanism coordinate or ratio.
 * Call only for reviewed examples: old snapshots are never migrated by loading.
 */
export function standardizeExampleFrame(snapshot) {
  // Built-ins author slider mount points explicitly, matching existing schema
  // defaults. Do not normalize here: examples also load while schema initializes.
  const nodes=frameConnectorNodes(snapshot.comps).filter(p=>!p.frameHole&&!String(p.holeLayer||'').startsWith('SYRINGE')).sort((a,b)=>a.id.localeCompare(b.id));
  if(!nodes.length)return;
  let a=nodes[0],b=a,distance=0;
  for(const p of nodes)for(const q of nodes){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d>distance+1e-9){a=p;b=q;distance=d;}}
  const span=key=>Math.max(...nodes.map(p=>p[key]))-Math.min(...nodes.map(p=>p[key]));
  const direction=span('y')>span('x')?90:0,angle=distance?Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI:90;
  const stock={thicknessMm:3,grid:{axisOffsetDeg:direction-angle}},ids=new Set(nodes.map(p=>p.id));
  snapshot.comps.forEach(c=>pointKeysFor(c).forEach(k=>{if(ids.has(c[k]?.id))c[k].frameStock=structuredClone(stock);}));
}
