/** Machining semantics stay intact; triangulation uses the union of machining voids. */
import {unionOutlines,area as signedArea} from './part-fusion.js';
const EPS=1e-7;
const area=r=>Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p.x*q.y-q.x*p.y;},0)/2);
const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const crosses=(a,b,c,d)=>side(a,b,c)*side(a,b,d)<-EPS*EPS&&side(c,d,a)*side(c,d,b)<-EPS*EPS;
const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(l<EPS*EPS)return Math.hypot(p.x-a.x,p.y-a.y);const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
const inside=(p,r)=>{if(r.some((a,i)=>distance(p,a,r[(i+1)%r.length])<=EPS))return true;let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;};
export function materialCircleContour(h,circumscribed=false){const n=64,r=h.r/(circumscribed?Math.cos(Math.PI/n):1);return Array.from({length:n},(_,i)=>{const a=(i+.5)*2*Math.PI/n;return {x:h.x+r*Math.cos(a),y:h.y+r*Math.sin(a)};});}
/** Entries may be rings, or {points,circle} for an exact representation circle. */
export function normalizeMaterialVoids(input){
 const rows=input.map((v,i)=>({original:v,i,points:Array.isArray(v)?v:v.points,circle:v.circle}));
 const contains=(a,b)=>{
  if(a.circle&&b.circle)return Math.hypot(a.circle.x-b.circle.x,a.circle.y-b.circle.y)+b.circle.r<=a.circle.r+EPS;
  if(a.circle)return b.points.every(p=>Math.hypot(p.x-a.circle.x,p.y-a.circle.y)<=a.circle.r+EPS);
  if(b.circle)return inside(b.circle,a.points)&&a.points.every((p,i)=>distance(b.circle,p,a.points[(i+1)%a.points.length])>=b.circle.r-EPS);
  return b.points.every((p,i)=>inside(p,a.points)&&inside({x:(p.x+b.points[(i+1)%b.points.length].x)/2,y:(p.y+b.points[(i+1)%b.points.length].y)/2},a.points))&&!b.points.some((p,i)=>a.points.some((q,j)=>crosses(p,b.points[(i+1)%b.points.length],q,a.points[(j+1)%a.points.length])));
 };
 const kept=rows.filter(b=>!rows.some(a=>a!==b&&contains(a,b)&&(!contains(b,a)||a.i<b.i)));
 let overlap=false;
 for(let i=0;i<kept.length;i++)for(let j=i+1;j<kept.length;j++){
  const a=kept[i].points,b=kept[j].points;
  if(inside(a[0],b)||inside(b[0],a)||a.some((p,k)=>b.some((q,l)=>crosses(p,a[(k+1)%a.length],q,b[(l+1)%b.length]))))overlap=true;
 }
 if(overlap){
  let merged;try{merged=unionOutlines(kept.map(r=>r.points),{precisionMm:1e-9,sampleMm:1e-9,minAreaMm2:0,splitScale:1e14});}catch(_){throw Error('void_union_failed');}
  // A negative boundary encloses material within a void union. This needs a
  // material-island representation, rather than feeding nested holes to Earcut.
  if(!merged.length||merged.some(r=>signedArea(r)<=EPS))throw Error('void_union_material_island');
  return merged.map(points=>Array.isArray(input[0])?points:{points});
 }
 return kept.map(r=>r.original);
}
