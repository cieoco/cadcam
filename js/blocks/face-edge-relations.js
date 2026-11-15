import {boxFaces,transformMatePoint} from './face-mate.js';
const axes=['x','y','z'],dot=(a,b)=>axes.reduce((s,k)=>s+a[k]*b[k],0),sub=(a,b)=>Object.fromEntries(axes.map(k=>[k,a[k]-b[k]]));
const unit=v=>{const n=Math.hypot(v.x,v.y,v.z);return Object.fromEntries(axes.map(k=>[k,v[k]/n]));};
/** Physical contour segments of the selected extruded material face, in design coordinates. */
export function faceBoundaryEdges(surface,faceId){
 const face=boxFaces(surface?.box).find(f=>f.id===faceId);if(!face)return [];
 const broad=['top','bottom'].includes(faceId),z=face.center.z,out=[];
 const add=(key,ringCount,a,b)=>{if(Math.hypot(...axes.map(k=>b[k]-a[k]))<1e-6)return;out.push({key,ringCount,a,b,direction:unit(sub(b,a))});};
 for(const [r,ring]of (surface.outlines || (surface.outline?[surface.outline]:[])).entries()){
 const perimeter=ring.reduce((s,p,j)=>s+Math.hypot(p.x-ring[(j+1)%ring.length].x,p.y-ring[(j+1)%ring.length].y),0);
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  if(broad){
   // Rounded contours are sampled polylines. Do not offer their tiny, evenly
   // turning arc chords as dozens of fictitious straight CAD edges.
   const prev=ring[(i+ring.length-1)%ring.length],next=ring[(i+2)%ring.length],v={x:b.x-a.x,y:b.y-a.y},len=Math.hypot(v.x,v.y);
   const curved=q=>{const n=Math.hypot(q.x,q.y),cos=(q.x*v.x+q.y*v.y)/(n*len);return n>0&&Math.abs(n-len)<len*.02&&cos>.866&&cos<.999999;};
   if(len<perimeter*.1&&(curved({x:a.x-prev.x,y:a.y-prev.y})||curved({x:next.x-b.x,y:next.y-b.y})))continue;
   add(`cap/${r}/${i}`,ring.length,{x:a.x,y:a.y,z},{x:b.x,y:b.y,z});continue;
  }
  if(Math.abs(dot(face.n,sub({x:a.x,y:a.y,z:0},face.center)))>1e-5||Math.abs(dot(face.n,sub({x:b.x,y:b.y,z:0},face.center)))>1e-5)continue;
  const lo=surface.box.min.z,hi=surface.box.max.z,ps=[{...a,z:lo},{...b,z:lo},{...b,z:hi},{...a,z:hi}];
  ps.forEach((p,j)=>add(`side/${r}/${i}/${j}`,ring.length,p,ps[(j+1)%4]));
 }
 }
 return out;
}
export const edgeReference=e=>({key:e.key,ringCount:e.ringCount,direction:{...e.direction}});
export function normalizeEdgeRelations(raw){
 if(!Array.isArray(raw)||raw.length>2)return null;
 const ref=r=>r&&/^((cap\/\d+\/\d+)|(side\/\d+\/\d+\/[0-3]))$/.test(r.key)&&Number.isInteger(r.ringCount)&&r.ringCount>=3&&r.direction&&axes.every(k=>Number.isFinite(r.direction[k]))&&Math.abs(dot(r.direction,r.direction)-1)<1e-6;
 if(!raw.every(r=>r&&['edge','center'].includes(r.kind)&&ref(r.host)&&Number.isFinite(r.offsetMm)&&(r.kind==='edge'?ref(r.child):ref(r.host2))))return null;
 const clean=r=>({key:r.key,ringCount:r.ringCount,direction:Object.fromEntries(axes.map(k=>[k,r.direction[k]]))});
 return raw.map(r=>({kind:r.kind,host:clean(r.host),...(r.kind==='edge'?{child:clean(r.child)}:{host2:clean(r.host2)}),offsetMm:r.offsetMm}));
}
/** Solve at most two independent in-face translation constraints; rotation stays unchanged. */
export function applyEdgeRelations(mate,{host,child,hostFace,childFace,relations}){
 const rules=normalizeEdgeRelations(relations);if(!rules)return {ok:false,reason:'接合邊關係無效，請重新選邊。'};
 const hf=boxFaces(host.box).find(f=>f.id===hostFace),he=faceBoundaryEdges(host,hostFace),ce=faceBoundaryEdges(child,childFace);
 const find=(list,ref)=>list.find(e=>e.key===ref.key&&e.ringCount===ref.ringCount&&dot(e.direction,ref.direction)>.999999);
 const hc=Object.fromEntries(axes.map(k=>[k,(host.box.min[k]+host.box.max[k])/2])),cc=Object.fromEntries(axes.map(k=>[k,(child.box.min[k]+child.box.max[k])/2]));
 const hp=p=>sub(p,hc),cp=p=>transformMatePoint(mate,sub(p,cc)),equations=[];
 for(const r of rules){
  const a=find(he,r.host);if(!a)return {ok:false,reason:'承接板的原接合邊已改變，請重新選邊。'};
  const d=a.direction,n=unit({x:hf.n.y*d.z-hf.n.z*d.y,y:hf.n.z*d.x-hf.n.x*d.z,z:hf.n.x*d.y-hf.n.y*d.x});
  const h=dot(n,hp(a.a));let current,target=h;
  if(r.kind==='edge'){
   const b=find(ce,r.child);if(!b)return {ok:false,reason:'安裝板的原接合邊已改變，請重新選邊。'};
   const p=cp(b.a),q=cp(b.b);if(Math.abs(dot(n,sub(q,p)))>1e-5)return {ok:false,reason:'兩條邊不平行，請換邊或調整接合角度。'};
   current=dot(n,p);
  }else{
   const b=find(he,r.host2);if(!b||Math.abs(dot(n,sub(b.b,b.a)))>1e-5||Math.abs(dot(n,hp(b.a))-h)<1e-5)return {ok:false,reason:'置中需要承接板兩條不同的平行邊。'};
   target=(h+dot(n,hp(b.a)))/2;
   const values=ce.flatMap(e=>[dot(n,cp(e.a)),dot(n,cp(e.b))]);if(!values.length)return {ok:false,reason:'找不到安裝面的實際邊界，無法置中。'};
   current=(Math.min(...values)+Math.max(...values))/2;
  }
  equations.push({a:dot(n,hf.u),b:dot(n,hf.v),d:target+r.offsetMm-current});
 }
 let u=0,v=0;
 if(equations.length){const a=equations[0];u=a.a*a.d;v=a.b*a.d;
  if(equations.length===2){const b=equations[1],det=a.a*b.b-a.b*b.a;
   if(Math.abs(det)<1e-8){if(Math.abs(b.a*u+b.b*v-b.d)>1e-5)return {ok:false,reason:'兩個對齊關係互相衝突，請移除其中一個。'};}
   else {u=(a.d*b.b-a.b*b.d)/det;v=(a.a*b.d-a.d*b.a)/det;}
  }
 }
 return {...mate,translation:Object.fromEntries(axes.map(k=>[k,mate.translation[k]+u*hf.u[k]+v*hf.v[k]]))};
}
