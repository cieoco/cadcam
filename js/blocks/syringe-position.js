import {attachmentFrame} from '../core/syringe.js';
import {isDisk,diskDiameter} from './disk-plate.js';

// UI placement constraint only. Clamp holes and mechanism validity are checked
// by the existing candidate/material pipelines, not inferred from this point.
export function syringePositionOnFrame(owner,params,points,p){
 const f=owner&&attachmentFrame(owner,params,points);if(!f)return null;
 if(isDisk(owner)){
  const dx=p.x-f.p.x,dy=p.y-f.p.y,r=diskDiameter(owner)/2,n=Math.hypot(dx,dy),k=n>r?r/n:1;
  return {x:f.p.x+dx*k,y:f.p.y+dy*k};
 }
 if(owner.type==='triangle')return {...p};
 const t=Math.max(0,Math.min(f.length,(p.x-f.p.x)*f.x+(p.y-f.p.y)*f.y));
 return {x:f.p.x+f.x*t,y:f.p.y+f.y*t};
}
