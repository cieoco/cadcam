import {placementFrame} from './placement-plane.js';
import {boxFaces,solveFaceMate} from './face-mate.js';
import {orthogonalFrame,planeOf} from './assembly.js';
import {orthogonalMatrix,multiply4,IDENTITY_4} from '../blocks3d/orthogonal-3d.js';
import {pointCoords} from './model.js';
const box={min:{x:-1,y:-1,z:-1},max:{x:1,y:1,z:1}};
const axes=plane=>{if(Array.isArray(plane))return plane;const f=placementFrame(plane || 'xy');return [f.d,f.n,f.m].map(v=>[v.x,v.y,v.z]);};
export function placedModuleAxes({comps,modules,params},id){
 const points=pointCoords(comps),seen=new Set();
 const matrix=plane=>{if(!plane)return IDENTITY_4;if(seen.has(plane))throw Error('接合方向含循環');seen.add(plane);
  const mod=modules.find(m=>m.id===plane),frame=orthogonalFrame(comps,modules,plane,points,params,{home:true});
  if(!frame)return IDENTITY_4;
  return multiply4(mod?.mount?matrix(planeOf(comps,modules,mod.mount.to.module)):IDENTITY_4,orthogonalMatrix(frame));
 };
 const m=matrix(planeOf(comps,modules,id));return [[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];
}
/** Preserve the two placed orientations; pick mating faces whose normals already oppose. */
export function placedFaceSelection(hostPlane,childPlane,hostFace=null,childFace=null){
 const h=axes(hostPlane),c=axes(childPlane),target=h.map(a=>c.map(b=>a.reduce((s,v,i)=>s+v*b[i],0)));
 let best=null;
 for(const hf of boxFaces(box))for(const cf of boxFaces(box))for(let q=0;q<4;q++){
  if(hostFace&&hf.id!==hostFace||childFace&&cf.id!==childFace)continue;
  const r=solveFaceMate({hostBox:box,childBox:box,hostFace:hf.id,childFace:cf.id,quarterTurns:q});
  const error=r.rotation.flatMap((row,i)=>row.map((v,j)=>(v-target[i][j])**2)).reduce((a,b)=>a+b,0);
  const score=error+(hf.id==='top'?0:.01)+(cf.id==='bottom'?0:.001);
  if(!best||score<best.score)best={score,error,hostFace:hf.id,childFace:cf.id,quarterTurns:q,rotationDeg:q*90};
 }
 return best;
}
