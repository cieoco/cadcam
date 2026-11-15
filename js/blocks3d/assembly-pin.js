import {applyMatrix4} from './orthogonal-3d.js';
/** Uses existing drilled holes; adds hardware only, never cuts either board. */
export function attachAssemblyPins(model,modules){
 const parts=model.materialParts;
 for(const mod of modules){const mount=mod.mount,pin=mount?.face?.selection?.pin;if(!pin)continue;
  const host=modules.find(m=>m.id===mount.to.module),hostId=host?.outputs?.find(o=>o.id===mount.to.output)?.body?.id;
  const a=parts.find(p=>p.moduleId===host?.id&&p.partId===hostId),b=parts.find(p=>p.moduleId===mod.id&&p.partId===mount.face.childPart);
  const ah=a?.geometry.holes.find(h=>h.id===pin.hostHole),bh=b?.geometry.holes.find(h=>h.id===pin.childHole);
  if(!a||!b||!ah||!bh){model.geometryDiagnostics.push({code:'assembly_pin_hole_missing',status:'not_supported',sourceIds:[hostId,mount.face.childPart]});continue;}
  const m=a.pose.matrix,n=[m[8],m[9],m[10]],origin=applyMatrix4(m,{...ah,z:0}),ends=[0,a.geometry.thicknessMm];
  for(const z of [0,b.geometry.thicknessMm]){const q=applyMatrix4(b.pose.matrix,{...bh,z});ends.push((q.x-origin.x)*n[0]+(q.y-origin.y)*n[1]+(q.z-origin.z)*n[2]);}
  const lo=Math.min(...ends)-1.5,hi=Math.max(...ends)+1.5,id=`connection:${mod.id}/pin`,pair=`assembly-pin:${mod.id}`,matrix=[...m];
  matrix[12]=origin.x+n[0]*lo;matrix[13]=origin.y+n[1]*lo;matrix[14]=origin.z+n[2]*lo;
  // Pair metadata is representation-only; each original catalog hole stays editable.
  for(const [p,h]of [[a,ah],[b,bh]])p.geometry={...p.geometry,holes:p.geometry.holes.map(q=>q===h?{...q,holePairId:pair}:q)};
  const geometry={id,partId:id,kind:'pin',geometryVersion:1,thicknessMm:hi-lo,outlines:[Array.from({length:64},(_,i)=>({x:pin.diameterMm/2*Math.cos(i*Math.PI/32),y:pin.diameterMm/2*Math.sin(i*Math.PI/32)}))],holes:[],cutouts:[]};
  parts.push({partId:id,moduleId:mod.id,pickKey:id,geometry,holePairId:pair,pose:{partId:id,matrix},color:pin.locked?'#d89421':'#e2e8ee'});
 }
 return model;
}
