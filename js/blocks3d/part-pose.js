/** Scene structure supplies heights; catalog supplies material. No shape reconstruction. */
import { IDENTITY_4, multiply4 } from './orthogonal-3d.js';
import {assemblyRoles} from '../blocks/assembly-roles.js';
import {readConnectionDescriptor} from '../blocks/connection-descriptor.js';
import { poseMatrix, moduleFramePose } from '../blocks/part-geometry.js';
const unit=v=>{const n=Math.hypot(v.x,v.y,v.z);return {x:v.x/n,y:v.y/n,z:v.z/n};};
const basis=(u,v,n,p)=>[u.x,u.y,u.z,0,v.x,v.y,v.z,0,n.x,n.y,n.z,0,p.x,p.y,p.z,1];

/** Child matrices already include all ancestors. Never compose a second parent. */
export function attachPartMaterials(model,catalog,{comps=[],modules=[],points={},assemblyScope=false}={}) {
  const materialParts=[],diagnostics=[...catalog.diagnostics];
  const add=(id,localMatrix,parent,pickKey,color)=>{
    const geometry=catalog.parts[id];
    if(!geometry||!localMatrix||!localMatrix.every(Number.isFinite)){diagnostics.push({status:'not_supported',code:'material_pose_or_geometry_missing',sourceIds:[id],pickKey});return false;}
    materialParts.push({partId:id,moduleId:geometry.moduleId,pickKey,geometry,pose:{partId:id,matrix:multiply4(parent,localMatrix)},color,
      ...(geometry.connectionId?{connectionId:geometry.connectionId,bracketId:geometry.bracketId,holePairId:geometry.holePairId}: {})});
    return true;
  };
  const visit=(scene,parent,prefix='')=>{
    const frame=scene.frame && {...scene.frame};
    if(frame&&add('frame',poseMatrix(undefined,0,frame.z),parent,`${prefix}frame`,frame.color))frame.materialPartId='frame';
    const sticks=(scene.sticks || []).map(s=>{
      const matrix=poseMatrix(s.a,Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x),s.z);
      return add(s.id,matrix,parent,`${prefix}stick:${s.id}`,s.color)?{...s,materialPartId:s.id}:s;
    });
    const plates=(scene.plates || []).map(p=>{
      const geometry=Object.values(catalog.parts).find(g=>g.kind==='triangle'&&g.binding.pointIds.join(',')===p.ids.join(','))
        ||Object.values(catalog.parts).find(g=>g.kind==='fusion'&&g.sourceIds.some(id=>comps.find(c=>c.id===id&&c.type==='triangle'&&[c.p1.id,c.p2.id,c.p3.id].join(',')===p.ids.join(','))));
      if(!geometry){diagnostics.push({status:'not_supported',code:'plate_material_missing',sourceIds:p.ids});return p;}
      const [a,b]=geometry.binding.pointIds.map(id=>points[id]);
      if(!a||!b){add(geometry.id,null,parent,`${prefix}plate:${p.ids.join('-')}`,p.color);return p;}
      const theta=Math.atan2(b.y-a.y,b.x-a.x)-(geometry.binding.seedAngle || 0);
      return add(geometry.id,poseMatrix(a,theta,p.z),parent,`${prefix}plate:${p.ids.join('-')}`,p.color)?{...p,materialPartId:geometry.id}:p;
    });
    const gears=(scene.gears || []).map(g=>{
      const geometry=catalog.parts[g.id];
      return add(g.id,poseMatrix(g.center,g.angle-(geometry?.binding.seedAngle || 0),g.z),parent,`${prefix}gear:${g.id}`,g.color)?{...g,partGeometry:geometry,materialPartId:g.id}:g;
    });
    const modulePlates=(scene.modulePlates || []).map(p=>{
      const id=`${p.moduleId}-frame`,geometry=catalog.parts[id];
      return add(id,geometry&&moduleFramePose(geometry,modules,comps,points,p.z),parent,`${prefix}modframe:${p.moduleId}`,p.color || '#8799aa')?{...p,materialPartId:id}:p;
    });
    for(const key of ['rails','carriages','racks','cams','pulleys','belts','motors','pins','grounds'])for(const [i,p] of (scene[key] || []).entries())diagnostics.push({status:'not_supported',code:'material_representation_not_supported',kind:key,sourceIds:[p.id || `${prefix}${key}:${i}`]});
    return {...scene,frame,sticks,plates,gears,modulePlates};
  };
  const main=visit(model,IDENTITY_4);
  main.orthogonal=(model.orthogonal || []).map(child=>{
    for(const d of child.diagnostics || [])diagnostics.push({...d,status:'not_supported',sourceIds:[d.partId || child.id]});
    if(child.displayAnchor?.resolvedEndpoint===false)diagnostics.push({status:'not_supported',code:'material_endpoint_unresolved',sourceIds:[child.id]});
    return {...child,model:visit(child.model,child.matrix,`${child.id}/`)};
  });
  for(const [i,b] of (model.brackets || []).entries()) {
    const ax=b.axes,p={x:b.center.x-ax[2].x*b.size.z/2,y:b.center.y-ax[2].y*b.size.z/2,z:b.center.z-ax[2].z*b.size.z/2};
    if(!add(b.id,basis(ax[0],ax[1],ax[2],p),IDENTITY_4,`${b.moduleId}/bracket:${i}`,'#a8afb5'))diagnostics.push({status:'not_supported',code:'legacy_bracket_material_bridge',sourceIds:[b.id || b.moduleId]});
  }
  for(const [i,s] of (model.screws || []).entries()) {
    const n=unit({x:s.tip.x-s.head.x,y:s.tip.y-s.head.y,z:s.tip.z-s.head.z});
    const helper=Math.abs(n.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0};
    const u=unit({x:helper.y*n.z-helper.z*n.y,y:helper.z*n.x-helper.x*n.z,z:helper.x*n.y-helper.y*n.x});
    const v={x:n.y*u.z-n.z*u.y,y:n.z*u.x-n.x*u.z,z:n.x*u.y-n.y*u.x};
    add(s.id,basis(u,v,n,s.head),IDENTITY_4,`${s.moduleId}/screw:${i}`,'#414952');
    add(`${s.id}/head`,basis(u,v,n,{x:s.head.x-n.x*s.headHeightMm,y:s.head.y-n.y*s.headHeightMm,z:s.head.z-n.z*s.headHeightMm}),IDENTITY_4,`${s.moduleId}/screw:${i}`,'#414952');
  }
  main.brackets=(model.brackets || []).map(b=>({...b,materialPartId:catalog.parts[b.id]?b.id:null}));
  main.screws=(model.screws || []).map(s=>({...s,materialPartId:catalog.parts[s.id]?s.id:null}));
  if(assemblyScope){
    const active=new Set(assemblyRoles(modules).machine);
    const shown=new Set(materialParts.map(p=>p.partId));
    for(const geometry of Object.values(catalog.parts))if((geometry.moduleId==null || active.has(geometry.moduleId))&&!shown.has(geometry.partId))diagnostics.push({status:'not_supported',code:'expected_material_pose_missing',sourceIds:[geometry.partId],moduleId:geometry.moduleId});
    for(const mod of modules.filter(m=>m.mount?.face)){
      const connection=readConnectionDescriptor({comps,modules,childId:mod.id});
      if(!connection.ok)for(const d of connection.diagnostics)diagnostics.push({...d,status:'not_supported',sourceIds:[d.partId || mod.id]});
    }
  }
  return {...main,materialParts,geometryDiagnostics:diagnostics,geometryKey:catalog.key};
}
