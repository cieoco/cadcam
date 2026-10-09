/** SVG representation only: world points come from the common material + pose. */
import {applyMatrix4} from '../blocks3d/orthogonal-3d.js';
import {materialCircleContour,normalizeMaterialVoids} from './material-voids.js';
import {boxFaces} from './face-mate.js';
export function candidateCoverageText(candidate){
 const rows=candidate.validation?.coverage?.notSupported || [];
 const hardwareOnly=rows.every(r=>r.code==='material_representation_not_supported'&&['motors','pins','grounds'].includes(r.kind));
 return {hardwareOnly,summary:hardwareOnly?'板件未發現穿入；部分五金未檢查。':'部分板件材料或姿態尚未驗證。',title:`未檢查${hardwareOnly?'五金':'材料'} ${rows.length} 項`};
}
export const candidateConfirmLabel=(candidate,pending=false)=>!pending&&candidate?.saveable&&candidate.validation?.status==='fail'?'接上（有干涉）':'接上';
/** Face names and U/V belong to the selected home XY box, not a member AABB. */
export function candidateHostFace(candidate,faceId){
 const part=candidate.model?.materialParts.find(p=>p.partId===candidate.hostSurface?.compId);
 const face=candidate.hostSurface&&boxFaces(candidate.hostSurface.box).find(f=>f.id===faceId);
 if(!part||!face||!candidate.hostReference)return null;
 const {origin,angle}=candidate.hostReference,c=Math.cos(angle),s=Math.sin(angle),t=part.geometry.thicknessMm;
 const local=p=>({x:(p.x-origin.x)*c+(p.y-origin.y)*s,y:-(p.x-origin.x)*s+(p.y-origin.y)*c,z:p.z+t/2});
 const center=applyMatrix4(part.pose.matrix,local(face.center));
 const axis=v=>{const q=applyMatrix4(part.pose.matrix,local({x:face.center.x+v.x,y:face.center.y+v.y,z:face.center.z+v.z}));return {x:q.x-center.x,y:q.y-center.y,z:q.z-center.z};};
 return {center,u:axis(face.u),v:axis(face.v)};
}
export function candidateMaterialFaces(model){
 const faces=[];
 for(const part of model.materialParts || []){
  const g=part.geometry,world=(p,z)=>applyMatrix4(part.pose.matrix,{...p,z});
  let voids=[],unsupported=false;
  try{voids=normalizeMaterialVoids([...g.holes.map(h=>({points:materialCircleContour(h),circle:h})),...g.cutouts.map(c=>({points:c.points}))]).map(v=>v.points);}catch(_){unsupported=true;}
  const add=rings=>faces.push({partId:part.partId,pickKey:part.pickKey,kind:g.kind,color:part.color || '#8799aa',unsupported,rings});
  if(g.solid?.kind==='pan-head'){
   const sections=g.solid.profile.filter(([r])=>r>0).slice().sort((a,b)=>a[1]-b[1]);
   const rings=sections.map(([r,z])=>materialCircleContour({x:0,y:0,r}).map(p=>world(p,z)));
   for(const ring of [rings[0],rings.at(-1)])add([ring]);
   const sides=[];for(let j=0;j<rings.length-1;j++)rings[j].forEach((p,i)=>sides.push([p,rings[j][(i+1)%rings[j].length],rings[j+1][(i+1)%rings[j].length],rings[j+1][i]]));add(sides);continue;
  }
  // All disjoint islands share one evenodd face: unrelated voids cannot turn
  // into additional material islands outside a single outline.
  for(const z of [0,g.thicknessMm])add([...g.outlines,...voids].map(r=>r.map(p=>world(p,z))));
  for(const ring of g.outlines){
   add(ring.map((p,i)=>[world(p,0),world(ring[(i+1)%ring.length],0),world(ring[(i+1)%ring.length],g.thicknessMm),world(p,g.thicknessMm)]));
  }
 }
 return faces;
}
