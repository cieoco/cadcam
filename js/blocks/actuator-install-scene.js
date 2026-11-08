import {deriveMotorMounts} from './build-plan.js';
import {inspectPlateExport,inspectLinkExport,splitMountsByHost} from './exporters.js';
import {memberStock} from './member-stock.js';
import {compileTopology} from '../core/topology.js';
import {buildSceneModel} from '../blocks3d/scene-model.js';
import {buildMotorMounts} from './motor-mounts.js';
/** Installation preview uses the same layer/motor planner as the main viewer. */
export function motorInstallationScene(candidate){
  const {comps,params,points}=candidate,topology=compileTopology(comps,{params},new Set());
  const groundIds=new Set(comps.flatMap(c=>[c.p1,c.p2,c.p3]).filter(p=>p?.type==='fixed').map(p=>p.id));
  const motorIds=new Set(comps.flatMap(c=>[c.p1,c.p2]).filter(p=>p?.physicalMotor).map(p=>p.id));
  const motorTypes=new Map(comps.filter(c=>c.motorMount).map(c=>[c.motorMount.center,c.motorType]));
  const motorMounts=buildMotorMounts({motorIds,groundIds,staticPoints:points,comps,compiledSteps:topology.steps||[],sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:id=>motorTypes.get(id)});
  const links=comps.filter(c=>c.type==='bar').map(c=>({id:c.id,p1:c.p1.id,p2:c.p2.id,color:c.color,isCrank:!!c.isInput,_frameSeparate:!!c.frameSeparate}));
  const mounts=deriveMotorMounts(comps).map(m=>({...m,center:points[m.pointId] || m.center,settings:candidate.fabrication?.[m.kind==='mg995'?'mg995Mount':'ttMount']})),split=splitMountsByHost(comps,mounts),plateGeometries={},barGeometries={},memberStocks={},polygons=[];
  for(const c of comps){if(c.type==='triangle'){const ids=[c.p1.id,c.p2.id,c.p3.id],g=inspectPlateExport(c,ids.map(id=>points[id]),{},split.hosted.get(c.id));plateGeometries[ids.join(',')]={outline:g.outlines[0],holes:g.holes,cutouts:g.cutouts};memberStocks[ids.join(',')]=memberStock(c);polygons.push({points:ids,color:c.color,...(c.standardBlank?.kind==='plate'?{id:c.id}:{})});}else if(c.type==='bar'&&!split.hosted.has(c.id)){const g=inspectLinkExport(c,params[c.lenParam],{drive:candidate.fabrication?.drive});barGeometries[c.id]={outline:g.outlines[0],holes:g.holes,cutouts:g.cutouts};memberStocks[c.id]=memberStock(c);}}
  return buildSceneModel(links,points,{polygons,plateGeometries,barGeometries,memberStocks,groundIds,motorCenters:motorIds,motorTypes,motorMounts,
    gears:comps.filter(c=>c.type==='gear').map(c=>({...c,center:c.p1.id,pin:c.p2.id,radius:params[c.radiusParam]})),params});
}
