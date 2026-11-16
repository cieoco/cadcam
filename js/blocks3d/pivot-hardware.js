/** M3 pivot stacks derived from real part faces and shared holes; no example IDs or saved pose changes. */
import {applyMatrix4,IDENTITY_4} from './orthogonal-3d.js';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const circle=(r,n=32)=>Array.from({length:n},(_,i)=>({x:r*Math.cos(i*2*Math.PI/n),y:r*Math.sin(i*2*Math.PI/n)}));
const round=n=>Math.round(n*1000)/1000;
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;};
function nearRing(p,ring,r){return inside(p,ring)||ring.some((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=r;});}
function sideSpace(parts,owners,origin,n,lo,hi){let low=Infinity,high=Infinity;for(const part of parts){if(owners.includes(part.partId)||part.pivotId)continue;const P=part.pose.matrix,axis={x:P[8],y:P[9],z:P[10]},d=sub(origin,{x:P[12],y:P[13],z:P[14]});if(Math.abs(dot(axis,n))<.999999)continue;const q={x:d.x*P[0]+d.y*P[1]+d.z*P[2],y:d.x*P[4]+d.y*P[5]+d.z*P[6]};if(!part.geometry.outlines.some(r=>nearRing(q,r,3.3))||part.geometry.holes.some(h=>Math.hypot(q.x-h.x,q.y-h.y)+3.3<=h.r))continue;const a=-dot(d,n),b=a+dot(axis,n)*part.geometry.thicknessMm,start=Math.min(a,b),end=Math.max(a,b);if(end<=lo+.001)low=Math.min(low,lo-end);if(start>=hi-.001)high=Math.min(high,start-hi);}return {low,high};}
const keys=c=>[c.p1,c.p2,c.p3,...(c.holes||[])].map(p=>p?.id).filter(Boolean);
export function pivotHardwarePlan(model){
 const comps=model.holeDisplaySource?.comps||[],parts=model.materialParts||[],byId=new Map(parts.map(p=>[p.partId,p])),joints=[],materialParts=[],diagnostics=[];
 for(const scope of [{id:'',model,matrix:IDENTITY_4},...(model.orthogonal||[])]){
  const M=scope.matrix,n={x:M[8],y:M[9],z:M[10]};
  for(const pin of scope.model.pins||[]){
   const owners=comps.filter(c=>['bar','triangle','gear'].includes(c.type)&&keys(c).includes(pin.id)&&byId.has(c.id));
   if(owners.length<2)continue;
   const primary=new Set(owners.map(c=>c.id)),candidates=owners;
   const origin=applyMatrix4(M,{x:pin.x,y:pin.y,z:0}),stack=[];let unsupported=false;
   for(const c of candidates){const part=byId.get(c.id),P=part.pose.matrix,axis={x:P[8],y:P[9],z:P[10]};
    if(Math.abs(dot(axis,n))<.999999){if(primary.has(c.id))unsupported=true;continue;}
    const holes=part.geometry.holes.filter(h=>{const d=sub(applyMatrix4(P,{x:h.x,y:h.y,z:0}),origin),z=dot(d,n);return Math.hypot(d.x-z*n.x,d.y-z*n.y,d.z-z*n.z)<.001;});
    if(!holes.length){if(primary.has(c.id))unsupported=true;continue;}
    if(holes.some(h=>h.r*2<3||h.r*2>3.6)){unsupported=true;break;}
    const a=dot(sub(applyMatrix4(P,{x:0,y:0,z:0}),origin),n),b=a+dot(axis,n)*part.geometry.thicknessMm;
    stack.push({partId:c.id,lo:Math.min(a,b),hi:Math.max(a,b)});
   }
   if(unsupported){if(owners.length>1)diagnostics.push({id:pin.id,plane:scope.id,reason:'pivot_hole_or_axis_not_supported'});continue;}
   if(stack.length<2)continue;
   stack.sort((a,b)=>a.lo-b.lo);if(stack.some((p,i)=>i&&p.lo<stack[i-1].hi-.001)){diagnostics.push({id:pin.id,plane:scope.id,reason:'overlapping_pivot_stock'});continue;}
   const rigid=owners.length===2&&new Set(keys(owners[0]).filter(id=>keys(owners[1]).includes(id))).size>=2;
   const lo=stack[0].lo,hi=stack.at(-1).hi,span=round(hi-lo),gap=rigid?0:.2,thinNut=rigid?0:2.4,lockNut=4,underHead=lo-.5,need=hi+.5+gap+thinNut+lockNut+1-underHead;
   const length=[10,12,16,20,25,30,35,40,45,50,60].find(l=>l>=need);if(!length){diagnostics.push({id:pin.id,plane:scope.id,reason:'pivot_screw_too_long'});continue;}
   const space=sideSpace(parts,stack.map(p=>p.partId),origin,n,lo,hi),nutsLow=space.low>=.5+gap+thinNut+lockNut&&space.high>=3.5;
   const id=`pivot:${scope.id}:${pin.id}`,spacers=[];
   const add=(suffix,kind,z,thickness,r,inner=0,sides=32)=>{if(thickness<.001)return;const matrix=[M[0],M[1],M[2],0,M[4],M[5],M[6],0,n.x,n.y,n.z,0,origin.x+n.x*z,origin.y+n.y*z,origin.z+n.z*z,1];materialParts.push({partId:`${id}/${suffix}`,moduleId:id,pickKey:`${id}/${suffix}`,color:kind==='pivot-spacer'?'#c5cbd1':'#64748b',geometry:{kind,thicknessMm:round(thickness),outlines:[circle(r,sides)],holes:inner?[{x:0,y:0,r:inner}]:[],cutouts:[],geometryVersion:1},pose:{matrix},pivotId:id});};
   const shaftStart=nutsLow?hi+.5-length:underHead;
   add('shaft','screw-pivot-shaft',shaftStart,length,1.5);add('head','screw-pivot-head',nutsLow?hi+.5:underHead-3,3,2.75);
   add('washer-low','pivot-washer',lo-.5,.5,3,1.6);add('washer-high','pivot-washer',hi,.5,3,1.6);
   const nutZ=nutsLow?lo-.5-gap-thinNut:hi+.5+gap;add('jam-nut','pivot-jam-nut',nutZ,thinNut,5.5/Math.sqrt(3),1.5,6);add('lock-nut','pivot-lock-nut',nutsLow?nutZ-lockNut:nutZ+thinNut,lockNut,5.5/Math.sqrt(3),1.5,6);
   for(let i=1;i<stack.length;i++){const a=stack[i-1].hi,b=stack[i].lo;if(b-a>.001){const mm=round(b-a);spacers.push({mm,between:[stack[i-1].partId,stack[i].partId]});add('spacer-'+i,'pivot-spacer',a,mm,2.5,1.6);}}
   joints.push({id:pin.id,plane:scope.id,hardwareId:id,parts:stack.map(p=>p.partId),stack,spanMm:span,screwLengthMm:length,spacers,kind:rigid?'mount-bolt':'pivot',axialClearanceMm:gap,nutsLow,shaftDiameterMm:3,spacerOuterMm:5,spacerInnerMm:3.2});
  }
 }
 const rows=new Map(),add=(spec,n,note)=>{if(!rows.has(spec))rows.set(spec,{spec,qty:0,note});rows.get(spec).qty+=n;};
 for(const j of joints){add(`M3×${j.screwLengthMm}`,1,j.kind==='pivot'?'樞軸；光桿覆蓋活動板，端部雙螺母互鎖，不夾死板件':'兩孔對鎖；隔套撐板後鎖緊');add('M3 平墊片 Ø6×0.5',2,'樞軸兩端');if(j.kind==='pivot')add('M3 六角螺帽 2.4 mm',1,'與防鬆螺帽互鎖，保留0.2 mm軸向遊隙');add('M3 防鬆螺帽 4 mm',1,'活動軸防脫；兩孔對鎖則鎖緊隔套與板件');for(const s of j.spacers)add(`隔套 Ø5／Ø3.2 × ${s.mm} mm`,1,'長度取兩板實際淨間距');}
 return {joints,materialParts,hardware:[...rows.values()],diagnostics};
}
export function withPivotHardware(model){
 if(!model?.materialParts||model.pivotHardware)return model;const plan=pivotHardwarePlan(model),hide=(m,id)=>({...m,pins:(m.pins||[]).filter(p=>!plan.joints.some(j=>j.plane===id&&j.id===p.id))});
 return {...hide(model,''),orthogonal:(model.orthogonal||[]).map(e=>({...e,model:hide(e.model,e.id)})),materialParts:[...model.materialParts,...plan.materialParts],pivotHardware:plan,geometryDiagnostics:[...(model.geometryDiagnostics||[]).filter(d=>!(d.kind==='pins'&&plan.joints.some(j=>d.sourceIds?.includes(j.id)))),...plan.diagnostics.map(d=>({...d,status:'not_supported',code:d.reason}))]};
}
/** Replace nominal-layer pivot BOM only where real-face hardware was resolved. */
export function pivotPlan(plan,model){
 const pivot=model.pivotHardware||pivotHardwarePlan(model);return {...plan,joints:plan.joints.filter(j=>!pivot.joints.some(p=>p.id===j.id&&(p.plane||null)===(j.plane||null))),pivotHardware:{...pivot},extraHardware:pivot.hardware};
}
