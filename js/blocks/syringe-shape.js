import {attachmentPoint} from '../core/syringe.js';
// Reference saddle measured from both teacher F3D models (2026-10-14).
// Local X follows the barrel, Y spans the feet, Z=0 is the barrel axis.
// Teacher correction: both holes centered in the rounded ears (28 mm pitch).
export function syringeClampShape(){
 const width=12,thickness=1.5,innerRadius=9.25,outer=10.75,baseZ=-6.75,holeRadius=1.75;
 const holeY=[-14,14],spacing=holeY[1]-holeY[0];
 const arc=(radius,from,to)=>Array.from({length:65},(_,i)=>{const a=from+(to-from)*i/64;return {y:radius*Math.cos(a),z:radius*Math.sin(a)};});
 const profile=[{y:-outer,z:baseZ},...arc(outer,Math.PI,0),{y:outer,z:baseZ},{y:innerRadius,z:baseZ},...arc(innerRadius,0,Math.PI),{y:-innerRadius,z:baseZ}];
 const feet=[-1,1].map((sign,index)=>{
  const center=sign*14,outline=[{x:-width/2,y:sign*innerRadius},{x:width/2,y:sign*innerRadius}];
  for(let i=0;i<=32;i++){const a=i*Math.PI/32;outline.push({x:width/2*Math.cos(a),y:center+sign*width/2*Math.sin(a)});}
  return {outline,hole:{x:0,y:holeY[index],r:holeRadius}};
 });
 return {width,thickness,innerRadius,spacing,holeRadius,baseZ,profile,feet,extent:20};
}
// Two-ear pipe clamp: manufacturing holes, not kinematic joints. Keep them
// out of the frame's reference axis; each ear needs its own supporting land.
export function syringeClampFrameNodes(comps,nodes){
 const ids=new Set(nodes.map(p=>p.id)),clamp=syringeClampShape(),out=[];
 for(const c of comps.filter(c=>c.type==='syringe'&&c.mountMode==='fixed-axis')){
  const owner=comps.find(o=>o.id===c.a.componentId);
  if(!owner?.p1||!ids.has(owner.p1.id)||owner.p2&&!ids.has(owner.p2.id))continue;
  const params=owner.p2?{[owner.lenParam||owner.gParam]:Math.hypot(owner.p2.x-owner.p1.x,owner.p2.y-owner.p1.y)}:{};
  const a=attachmentPoint(c.a,comps,params),angle=c.axisDeg*Math.PI/180;
  if(!a||!Number.isFinite(angle))continue;
  clamp.feet.forEach((foot,i)=>out.push({id:`${c.id}_clamp_${i}`,x:a.x-Math.sin(angle)*foot.hole.y,y:a.y+Math.cos(angle)*foot.hole.y,
   holeDiameterMm:foot.hole.r*2,holeLayer:'SYRINGE_CLAMP',outlineExempt:true,mountRadiusMm:10}));
 }
 return out;
}
// Shared mm appearance for 2D and 3D. Mount offset is an illustrative clamp layout.
export function syringeShape(c,comps,params,points){
 const a=attachmentPoint(c.a,comps,params,points),b=attachmentPoint(c.b,comps,params,points);if(!a||!b)return null;
 const length=Math.hypot(b.x-a.x,b.y-a.y),angle=Math.atan2(b.y-a.y,b.x-a.x),fixed=c.mountMode==='fixed-axis';
 const body=c.spec.bodyLength,r=c.spec.outerDiameter/2,start=fixed?-body*.7:0,end=start+body;
 return {id:c.id,a,b,angle,length,r,start,end,rodWidth:c.spec.rodDiameter,fixed,clamp:fixed?syringeClampShape():null,tips:(c.passiveTips||[]).map(t=>{const owner=comps.find(o=>o.id===t.hostId),p=points?.[owner?.p3?.id]||owner?.p3,o=points?.[owner?.p1?.id]||owner?.p1;if(!p||!o)return null;const theta=Math.atan2(p.y-o.y,p.x-o.x)+t.angleDeg*Math.PI/180;return {a:p,b:{x:p.x+t.length*Math.cos(theta),y:p.y+t.length*Math.sin(theta)}};}).filter(Boolean)};
}
export function syringeShapes(comps,params,points){return comps.filter(c=>c.type==='syringe').map(c=>syringeShape(c,comps,params,points)).filter(Boolean);}
