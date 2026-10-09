/** Fabrication geometry is design data; solved positions are separate PartPose data. */
import * as Exporters from './exporters.js';
import { pointCoords, frameConnectorNodes } from './model.js';
import { frameStockOf } from './frame-stock.js';
import { memberStock } from './member-stock.js';
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';
import { compileAssembly, solveAssembly, machineFrameComps, machineMounts, outputPose, splitFrameMounts } from './assembly.js';
import { deriveMotorMounts } from './build-plan.js';
import { framePlateHomes } from './module-plates.js';
import {identifiedHoles} from './part-hole-trace.js';
import { orthogonalExportExtras, withWorldAdapterNodes } from './orthogonal-joint.js';

export const PART_GEOMETRY_VERSION = 1;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const localizer=(a,b)=>{const t=angle(a,b),c=Math.cos(t),s=Math.sin(t);return p=>({x:(p.x-a.x)*c+(p.y-a.y)*s,y:-(p.x-a.x)*s+(p.y-a.y)*c});};
const mapGeometry=(g,move)=>({outlines:(g.outlines || (g.outline?[g.outline]:[])).map(r=>r.map(move)),holes:(g.holes || []).map(h=>({...h,...move(h)})),cutouts:(g.cutouts || []).map(c=>({...c,points:c.points.map(move)}))});
const identityPoint=p=>({x:p.x,y:p.y});
const circle=r=>Array.from({length:48},(_,i)=>({x:r*Math.cos(i*Math.PI/24),y:r*Math.sin(i*Math.PI/24)}));

/** Key intentionally excludes drive angle and camera. All shape dependencies remain. */
export function partGeometryKey({comps=[],modules=[],params={},fabrication={},exportSettings={},frameNodes,mounts,frameMounts}={}) {
  const {theta,...designParams}=params;
  return JSON.stringify([PART_GEOMETRY_VERSION,comps,modules,designParams,fabrication,exportSettings,frameNodes,mounts,frameMounts]);
}

export function buildPartGeometryCatalog(args={}) {
  const input=structuredClone(args);
  const {comps=[],modules=[],params={},fabrication={},frameNodes}=input;
  const settings={...(fabrication.export || {}),...(input.exportSettings || {}),drive:fabrication.drive || FABRICATION_DEFAULTS.drive};
  const stockMm=Number(fabrication.cnc?.stockThicknessMm) || FABRICATION_DEFAULTS.cnc.stockThicknessMm;
  const joint=fabrication.joint || FABRICATION_DEFAULTS.joint;
  const mounts=input.mounts || deriveMotorMounts(comps),split=Exporters.splitMountsByHost(comps,mounts);
  const extras=orthogonalExportExtras(comps,modules,params,{stockMm,joint,exportSettings:settings});
  const parts={},diagnostics=[],memberStocks={},fusedParts={};
  const motors=Object.fromEntries(comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p?.physicalMotor).map(p=>[p.physicalMotor,0])));
  const solved=solveAssembly(compileAssembly(comps,modules,{params}),{thetaDeg:0,motorAngles:motors});
  const homePoints={...pointCoords(comps),...(solved.isValid?solved.points:{})};
  if(!solved.isValid)diagnostics.push({status:'not_supported',code:'design_reference_unsolved',sourceIds:comps.map(c=>c.id)});
  const add=(id,kind,g,thicknessMm,sourceIds,binding,moduleId=null)=>{
    const geometry=mapGeometry(g,identityPoint);
    if(!geometry.outlines.length){diagnostics.push({status:'not_supported',code:'material_outline_missing',sourceIds});return;}
    const record={id,partId:id,kind,moduleId,sourceIds,geometryVersion:PART_GEOMETRY_VERSION,thicknessMm,...geometry,binding};
    record.holes=identifiedHoles(id,record.holes);
    record.cutouts=record.cutouts.map((c,i)=>({...c,id:c.id || `${id}/cutout:${c.layer || 'CUTOUT'}:${i}`,purpose:c.layer || 'CUTOUT'}));
    parts[id]=record;
  };
  for(const comp of comps) {
    try {
      const stock={...memberStock(comp),thicknessMm:Number(comp.stock?.thicknessMm) || stockMm};
      if(comp.type==='bar') {
        const a=homePoints[comp.p1.id],b=homePoints[comp.p2.id],length=Math.hypot(b.x-a.x,b.y-a.y);
        const g=split.hosted.has(comp.id)?Exporters.hostedBarGeometry(comp,homePoints,settings,split.hosted.get(comp.id),extras.linkHoles[comp.id] || []):Exporters.inspectLinkExport(comp,length,settings,extras.linkHoles[comp.id] || []);
        add(comp.id,'bar',g,stock.thicknessMm,[comp.id],{kind:'member',pointIds:[comp.p1.id,comp.p2.id]},comp.moduleId);
        memberStocks[comp.id]=stock;
      } else if(comp.type==='triangle'&&!comp.fusedWith) {
        const ids=[comp.p1.id,comp.p2.id,comp.p3.id],points=ids.map(id=>homePoints[id]);
        const g=Exporters.inspectPlateExport(comp,points,settings,split.hosted.get(comp.id),extras.plateHoles[comp.id] || []);
        add(comp.id,'triangle',mapGeometry(g,localizer(points[0],points[1])),stock.thicknessMm,[comp.id],{kind:'member',pointIds:ids},comp.moduleId);
        memberStocks[ids.join(',')]=stock;
      } else if(comp.type==='gear') {
        memberStocks[comp.id]=stock;
        const plate=comps.find(p=>p.fusedWith===comp.id);
        if(plate) {
          Exporters.assertFusionFeatures(comps,mounts,extras);
          const f=Exporters.inspectFusion(comps,plate,params,settings);
          if(!f.ok)throw Error(f.reason);
          add(comp.id,'fusion',f.geometry,Number(plate.stock?.thicknessMm) || stockMm,[comp.id,plate.id],{kind:'gear',pointIds:[comp.p1.id,comp.p2.id],seedAngle:angle(comp.p1,comp.p2)},comp.moduleId);
          fusedParts[comp.id]={...f,ids:[plate.p1.id,plate.p2.id,plate.p3.id],thicknessMm:parts[comp.id].thicknessMm};
        } else add(comp.id,'gear',Exporters.inspectGearExport(comp,params,settings,comps),stock.thicknessMm,[comp.id],{kind:'gear',pointIds:[comp.p1.id,comp.p2.id],seedAngle:angle(comp.p1,comp.p2)},comp.moduleId);
      } else if(!['anchor','motor','triangle'].includes(comp.type))diagnostics.push({status:'not_supported',code:'material_kind_not_supported',sourceIds:[comp.id],kind:comp.type});
    } catch(e){diagnostics.push({status:'not_supported',code:'material_geometry_unavailable',sourceIds:[comp.id],reason:e.message});}
  }
  const mainNodes=withWorldAdapterNodes(frameNodes || frameConnectorNodes(machineFrameComps(comps,modules)),extras);
  const worldMounts=input.frameMounts || machineMounts(splitFrameMounts(split.free,comps,modules).world,comps,modules);
  const frame=Exporters.inspectFrameExport(mainNodes,settings,worldMounts);
  if(frame?.outlines?.length){
    const nodeIds=new Set(mainNodes.map(n=>n.id));
    const owners=[...new Set(comps.filter(c=>[c.p1,c.p2,c.p3].some(p=>p&&nodeIds.has(p.id))).map(c=>c.moduleId || null))];
    add('frame','frame',frame,frameStockOf(mainNodes).thicknessMm || stockMm,['frame'],{kind:'frame'},owners.length===1?owners[0]:null);
    parts.frame.sourceModuleIds=owners;
  }
  const homes=framePlateHomes(comps,modules,params,{exportSettings:settings,mounts,joint,stockMm});
  for(const h of homes)add(h.name,'mounted-frame',h.geometry,h.stockMm,[h.moduleId,'frame'],{kind:'module-frame'},h.moduleId);
  for(const adapter of extras.adapters)for(const b of adapter.physical || [])for(const w of b.wings) {
    const box=w.box,th=box.size.z;
    const holeDelta={x:box.hole.center.x-box.center.x,y:box.hole.center.y-box.center.y,z:box.hole.center.z-box.center.z};
    add(box.id,'bracket-wing',{outlines:[[{x:-box.size.x/2,y:-box.size.y/2},{x:box.size.x/2,y:-box.size.y/2},{x:box.size.x/2,y:box.size.y/2},{x:-box.size.x/2,y:box.size.y/2}]],holes:[{id:box.hole.id,connectionId:b.connectionId,holePairId:box.holePairId,wingId:box.id,x:dot(holeDelta,box.axes[0]),y:dot(holeDelta,box.axes[1]),r:box.hole.diameterMm/2,layer:'M3_THREAD'}]},th,[b.connectionId],{kind:'bracket'},adapter.moduleId);
    Object.assign(parts[box.id],{connectionId:b.connectionId,bracketId:b.id,holePairId:box.holePairId});
    const s=w.screw;
    add(s.id,'screw',{outlines:[circle(s.diameterMm/2)]},s.lengthMm,[s.connectionId],{kind:'screw'},adapter.moduleId);
    add(`${s.id}/head`,'screw-head',{outlines:[circle(s.headDiameterMm/2)]},s.headHeightMm,[s.connectionId],{kind:'screw-head'},adapter.moduleId);
    Object.assign(parts[`${s.id}/head`],{solid:{kind:'pan-head',profile:[[0,s.headHeightMm],[s.headDiameterMm/2,s.headHeightMm],[s.headDiameterMm/2,s.headHeightMm*.45],[s.headDiameterMm*.43,s.headHeightMm*.15],[s.headDiameterMm*.25,0],[0,0]],radiusMm:s.headDiameterMm/2,heightMm:s.headHeightMm}});
    for(const id of [s.id,`${s.id}/head`])Object.assign(parts[id],{connectionId:b.connectionId,bracketId:b.id,holePairId:s.holePairId});
  }
  return {key:partGeometryKey(args),geometryVersion:PART_GEOMETRY_VERSION,parts,diagnostics,homePoints,memberStocks,fusedParts,extras,frameHomes:homes};
}

export function createPartGeometrySource() {
  let cached=null;
  return {get(args){const key=partGeometryKey(args);if(cached?.key!==key)cached=buildPartGeometryCatalog(args);return cached;},invalidate(){cached=null;}};
}

export const poseMatrix=(a={x:0,y:0},theta=0,z=0)=>{const c=Math.cos(theta),s=Math.sin(theta);return [c,s,0,0,-s,c,0,0,0,0,1,0,a.x,a.y,z,1];};
export function moduleFramePose(geometry,modules,comps,points,z) {
  const mod=modules.find(m=>m.id===geometry.moduleId);
  if(!mod?.mount || mod.mount.face || mod.mount.orient)return poseMatrix(undefined,0,z);
  const host=modules.find(m=>m.id===mod.mount.to.module),now=host&&outputPose(host,mod.mount.to.output,points,comps),ref=mod.mount.ref;
  if(!now||!ref)return null;
  const t=(now.a-ref.a)*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
  return poseMatrix({x:now.x-ref.x*c+ref.y*s,y:now.y-ref.x*s-ref.y*c},t,z);
}
