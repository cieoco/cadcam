import {attachmentPoint} from '../core/syringe.js';
// Shared mm appearance for 2D and 3D. Mount offset is an illustrative clamp layout.
export function syringeShape(c,comps,params,points){
 const a=attachmentPoint(c.a,comps,params,points),b=attachmentPoint(c.b,comps,params,points);if(!a||!b)return null;
 const length=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x),fixed=c.mountMode==='fixed-axis';
 const body=c.spec.bodyLength,r=c.spec.outerDiameter/2,start=fixed?-body*.7:0,end=start+body;
 return {id:c.id,a,b,angle,length,r,start,end,rodWidth:c.spec.rodDiameter,fixed,clampSpacing:29.344,tips:(c.passiveTips||[]).map(t=>{const owner=comps.find(o=>o.id===t.hostId),p=points?.[owner?.p3?.id]||owner?.p3,o=points?.[owner?.p1?.id]||owner?.p1;if(!p||!o)return null;const theta=Math.atan2(p.y-o.y,p.x-o.x)+t.angleDeg*Math.PI/180;return {a:p,b:{x:p.x+t.length*Math.cos(theta),y:p.y+t.length*Math.sin(theta)}};}).filter(Boolean)};
}
export function syringeShapes(comps,params,points){return comps.filter(c=>c.type==='syringe').map(c=>syringeShape(c,comps,params,points)).filter(Boolean);}
