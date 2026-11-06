/** Extra frame holes reuse fixed anchors. Their offset is measured along two existing ground points. */
import {pointKeysFor} from './part-types.js';

export const frameHoleAt = (comps,id) => comps.find(c=>c.type==='anchor'&&c.frameHole&&c.p1.id===id);
export function frameHoleAxis(comps,hole) {
  const h=hole?.frameHole;if(!h)return null;
  const points=comps.filter(c=>(c.moduleId||null)===(hole.moduleId||null)&&!c.frameHole).flatMap(c=>pointKeysFor(c).map(k=>c[k])).filter(Boolean);
  const a=points.find(p=>p.id===h.a&&['fixed','motor','linear'].includes(p.type)),b=points.find(p=>p.id===h.b&&['fixed','motor','linear'].includes(p.type));
  const length=a&&b?Math.hypot(b.x-a.x,b.y-a.y):0;
  return length>1e-6?{a,b,u:{x:(b.x-a.x)/length,y:(b.y-a.y)/length}}:null;
}
export function syncFrameHoles(comps) {
  for(const c of comps.filter(c=>c.frameHole)){
    const axis=frameHoleAxis(comps,c);if(!axis)continue;
    const x=axis.a.x+axis.u.x*c.frameHole.u,y=axis.a.y+axis.u.y*c.frameHole.u;
    for(const other of comps)for(const k of pointKeysFor(other))if(other[k]?.id===c.p1.id)Object.assign(other[k],{x,y});
  }
}
