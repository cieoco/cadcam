/** Shared representation adapter: fabrication catalog + solved inputs, never S/DOM. */
import {buildSceneModel} from './scene-model.js';
import {buildOrthogonalChildren,attachModulePlates} from './orthogonal-3d.js';
import {attachPartMaterials} from './part-pose.js';
export function buildMaterialScene({comps,modules,params,catalog,inputs,allPlanes=null,points=inputs.pts,stockMm,frameGeometry=catalog.parts.frame || null,
 plates=catalog.frameHomes.map(h=>({moduleId:h.moduleId,plane:h.plane,outlines:h.geometry.outlines,outline:h.geometry.outlines[0],holes:h.geometry.holes,cutouts:h.geometry.cutouts,thicknessMm:catalog.parts[h.name]?.thicknessMm || h.stockMm})),
 plane=null,assemblyScope=true,asm,plan,exportSettings={},joint,hullR=8,solveValidity}={}){
 const base={hullR,plateThickness:stockMm,memberStocks:catalog.memberStocks,gearGeometries:catalog.parts,fusedParts:catalog.fusedParts};
 // Fixed members selected as connection endpoints remain separate material,
 // even when the usual preview combines other ground bars into the frame.
 const endpointIds=new Set(modules.filter(m=>m.mount?.face).flatMap(m=>{
  const host=modules.find(h=>h.id===m.mount.to.module),output=host?.outputs?.find(o=>o.id===m.mount.to.output);
  return [output?.body?.id,m.mount.face.childPart].filter(id=>id&&id!=='frame');
 }));
 const create=(i,frame=null)=>{
  const links=(i.links || []).map(l=>endpointIds.has(l.id)?{...l,_frameSeparate:true}:l);
  for(const c of comps)if(c.type==='bar'&&endpointIds.has(c.id)&&i.pts[c.p1.id]&&i.pts[c.p2.id]&&!links.some(l=>l.id===c.id))links.push({id:c.id,p1:c.p1.id,p2:c.p2.id,color:c.color,_frameSeparate:true});
  const model=buildSceneModel(links,i.pts,{...base,...i,motorCenters:i.motorCenterIds,frameGeometry:frame});
  // A fixed-only module still owns its catalog frame; its material floor is 0.
  model.fixedFrameModuleIds=new Set(plates.filter(p=>comps.some(c=>c.moduleId===p.moduleId&&[c.p1,c.p2,c.p3].some(q=>q&&i.pts[q.id]))).map(p=>p.moduleId));
  return model;
 };
 const model=create(inputs,frameGeometry);attachModulePlates(model,comps,plates,plane);
 if(allPlanes){
  model.orthogonal=buildOrthogonalChildren({comps,modules,inputs:allPlanes,mainModel:model,asm,params,plates,plan,connectionGeometry:catalog.extras,exportSettings,joint,stockMm,buildModel:i=>create(i)});
  const boxes=model.orthogonal.flatMap(c=>c.brackets || []),screws=model.orthogonal.flatMap(c=>c.screws || []);
  if(boxes.length)model.brackets=boxes;if(screws.length)model.screws=screws;
 }
 return {...attachPartMaterials(model,catalog,{comps,modules,points,assemblyScope}),solveValidity};
}
