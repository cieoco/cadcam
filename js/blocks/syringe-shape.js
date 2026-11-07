import {SYRINGE_EAR_MM,attachmentPoint,hasSyringeClamp,syringeBarrelOffset,syringePivotEar,syringePivotFrame} from '../core/syringe.js';
// Ring dimensions reference the teacher F3D models (2026-10-14).
// Ear pitch is now authored at 24 mm; its wall/hardware clearance is unverified.
// Local X follows the barrel, Y spans the feet, Z=0 is the barrel axis.
// Both holes remain centered in the rounded ears; requested pitch is now 24 mm.
export function syringeClampShape(mode='fixed-axis'){
 // 可轉安裝用同一個雙耳固定環（形狀與固定安裝完全相同），差別只在鎖幾顆螺絲。
 const pivot=mode==='pivot';
 const width=12,thickness=1.5,innerRadius=9.25,outer=10.75,baseZ=-6.75,holeRadius=1.75;
 const holeY=[-SYRINGE_EAR_MM,SYRINGE_EAR_MM],spacing=holeY[1]-holeY[0];
 const arc=(radius,from,to)=>Array.from({length:65},(_,i)=>{const a=from+(to-from)*i/64;return {y:radius*Math.cos(a),z:radius*Math.sin(a)};});
 const profile=[{y:-outer,z:baseZ},...arc(outer,Math.PI,0),{y:outer,z:baseZ},{y:innerRadius,z:baseZ},...arc(innerRadius,0,Math.PI),{y:-innerRadius,z:baseZ}];
 const feet=[-1,1].map((sign,index)=>{
  const center=sign*SYRINGE_EAR_MM,outline=[{x:-width/2,y:sign*innerRadius},{x:width/2,y:sign*innerRadius}];
  for(let i=0;i<=32;i++){const a=i*Math.PI/32;outline.push({x:width/2*Math.cos(a),y:center+sign*width/2*Math.sin(a)});}
  return {outline,hole:{x:0,y:holeY[index],r:holeRadius}};
 });
 return {width,thickness,innerRadius,outerRadius:outer,spacing,holeRadius,baseZ,profile,feet,extent:SYRINGE_EAR_MM+width/2,pivot};
}
// 鎖住的耳在 feet 陣列的索引：pivotEar=+1 對應筒身左側（局部 y 為正）的耳。
export const syringeLockedFoot=c=>syringePivotEar(c)===1?1:0;
// Two-ear pipe clamp: manufacturing holes, not kinematic joints. Keep them
// out of the frame's reference axis; each ear needs its own supporting land.
export function syringeClampFrameNodes(comps,nodes){
 const ids=new Set(nodes.map(p=>p.id)),out=[];
 for(const c of comps.filter(c=>c.type==='syringe'&&hasSyringeClamp(c))){
  const clamp=syringeClampShape(c.mountMode);
  const owner=comps.find(o=>o.id===c.a.componentId);
  if(!owner?.p1||!ids.has(owner.p1.id)||owner.p2&&!ids.has(owner.p2.id))continue;
  const params=owner.p2?{[owner.lenParam||owner.gParam]:Math.hypot(owner.p2.x-owner.p1.x,owner.p2.y-owner.p1.y)}:{};
  const a=attachmentPoint(c.a,comps,params);
  if(c.mountMode==='pivot'){
   // 只有鎖住的那一耳在底板上鑽孔；孔位就是接點 A（轉軸），另一耳不鎖、不鑽。
   if(!a)continue;
   const foot=syringeLockedFoot(c),hole=clamp.feet[foot].hole;
   out.push({id:`${c.id}_clamp_${foot}`,x:a.x,y:a.y,holeDiameterMm:hole.r*2,holeLayer:'SYRINGE_PIVOT',outlineExempt:true,mountRadiusMm:10});
   continue;
  }
  const angle=c.axisDeg*Math.PI/180;
  if(!a||!Number.isFinite(angle))continue;
  clamp.feet.forEach((foot,i)=>out.push({id:`${c.id}_clamp_${i}`,x:a.x-Math.sin(angle)*foot.hole.y,y:a.y+Math.cos(angle)*foot.hole.y,
   holeDiameterMm:foot.hole.r*2,holeLayer:'SYRINGE_CLAMP',outlineExempt:true,mountRadiusMm:10}));
 }
 return out;
}
// Shared mm appearance for 2D and 3D. Mount offset is an illustrative clamp layout.
export function syringeShape(c,comps,params,points){
 const a=attachmentPoint(c.a,comps,params,points)||c.a.position,b=attachmentPoint(c.b,comps,params,points)||c.b.position;if(!a||!b)return null;
 const pivot=c.mountMode==='pivot',frame=pivot?syringePivotFrame(a,b,syringePivotEar(c)):null;
 const fixed=c.mountMode==='fixed-axis',length=frame?frame.length:fixed?c.spec.lmin+c.extension:Math.hypot(b.x-a.x,b.y-a.y),angle=frame?frame.angle:fixed?c.axisDeg*Math.PI/180:Math.atan2(b.y-a.y,b.x-a.x);
 // Fixed installation stays aligned with its drilling even when the linkage has no valid pose.
 const endPoint=fixed?{x:a.x+length*Math.cos(angle),y:a.y+length*Math.sin(angle)}:b;
 const body=c.spec.bodyLength,r=c.spec.outerDiameter/2,start=hasSyringeClamp(c)?-syringeBarrelOffset(c):0,end=start+body;
 return {id:c.id,a:frame?frame.center:a,b:endPoint,angle,length,r,start,end,rodWidth:c.spec.rodDiameter,fixed,pivot,...(pivot?{anchor:a,pivotEar:syringePivotEar(c),lockedFoot:syringeLockedFoot(c)}:{}),clamp:hasSyringeClamp(c)?syringeClampShape(c.mountMode):null,tips:(c.passiveTips||[]).map(t=>{const owner=comps.find(o=>o.id===t.hostId),p=points?.[owner?.p3?.id]||owner?.p3,o=points?.[owner?.p1?.id]||owner?.p1;if(!p||!o)return null;const theta=Math.atan2(p.y-o.y,p.x-o.x)+t.angleDeg*Math.PI/180;return {a:p,b:{x:p.x+t.length*Math.cos(theta),y:p.y+t.length*Math.sin(theta)}};}).filter(Boolean)};
}
export function syringeShapes(comps,params,points){return comps.filter(c=>c.type==='syringe').map(c=>syringeShape(c,comps,params,points)).filter(Boolean);}
