import {inspectFrameExport,inspectLinkExport} from './exporters.js';
import {frameConnectorNodes} from './model.js';
import {createPlateGeometry} from './plate-geometry.js';
import {inside} from './part-fusion.js';
import {attachmentFrame} from '../core/syringe.js';
import {isDisk,diskDiameter} from './disk-plate.js';

// UI placement constraint only. Clamp holes and mechanism validity are checked
// by the existing candidate/material pipelines, not inferred from this point.
export function syringePositionOnFrame(owner,params,points,p,source=null){
 const f=owner&&attachmentFrame(owner,params,points);if(!f)return null;
 if(isDisk(owner)){
  const dx=p.x-f.p.x,dy=p.y-f.p.y,r=diskDiameter(owner)/2,n=Math.hypot(dx,dy),k=n>r?r/n:1;
  return {x:f.p.x+dx*k,y:f.p.y+dy*k};
 }
 if(owner.type==='triangle'||source&&owner.type==='bar'){
  const rings=owner.type==='triangle'?createPlateGeometry(owner,[owner.p1,owner.p2,owner.p3].map(q=>points?.[q.id]||q)).outlines:!owner.frameSeparate&&!owner.standardBlank?inspectFrameExport(frameConnectorNodes(source.comps),source.fabrication?.export||{}).outlines:inspectLinkExport(owner,f.length,source.fabrication?.export||{}).outlines.map(r=>r.map(q=>({x:f.p.x+q.x*f.x-q.y*f.y,y:f.p.y+q.x*f.y+q.y*f.x})));
  if(rings.some(r=>inside(p,r)))return {...p};
  let best=null,d=Infinity;for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),q={x:a.x+t*dx,y:a.y+t*dy},n=Math.hypot(q.x-p.x,q.y-p.y);if(n<d){d=n;best=q;}}
  return best;
 }
 const t=Math.max(0,Math.min(f.length,(p.x-f.p.x)*f.x+(p.y-f.p.y)*f.y));
 return {x:f.p.x+f.x*t,y:f.p.y+f.y*t};
}
