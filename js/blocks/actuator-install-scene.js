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
  return buildSceneModel(links,points,{groundIds,motorCenters:motorIds,motorTypes,motorMounts,
    gears:comps.filter(c=>c.type==='gear').map(c=>({...c,center:c.p1.id,pin:c.p2.id,radius:params[c.radiusParam]})),params});
}
