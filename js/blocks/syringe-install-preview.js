// Candidate-only local design scene, using the same material pipeline as the workspace.
import {markAllPlaneZlift} from './render-scene.js';
import {compileAssembly,solveAssembly} from './assembly.js';
import {prepareConnectionWork} from './connection-work.js';
import {buildPartGeometryCatalog} from './part-geometry.js';
import {buildPreviewModelInputs} from './preview-model-inputs.js';
import {buildMaterialScene} from '../blocks3d/material-scene.js';
import {planeInputs} from '../blocks3d/orthogonal-3d.js';
import {computeBodyLayers} from '../blocks3d/scene-model.js';
import {motorPointIds,pointCoords} from './model.js';
import {motorTypeAt} from './motor-tools.js';
import {buildMotorMounts,buildMotorExportMounts} from './motor-mounts.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {materialSolveValidity} from './material-pose-status.js';
import {DEFAULT_PLATE_RADIUS_WORLD} from './plate-geometry.js';
import {resolveSpacers} from './interference.js';
import {collectSceneIds,prepareRenderScene} from './render-scene.js';
export function buildSyringeInstallPreview(n){
  const work={comps:structuredClone(n.comps),modules:[],params:{...n.params},fabrication:structuredClone(n.fabrication || FABRICATION_DEFAULTS)};
  work.comps.forEach(c=>{delete c.moduleId;});
  work.topo={params:work.params};work.stockMm=Number(work.fabrication.cnc.stockThicknessMm);work.exportSettings=work.fabrication.export||{};work.joint=work.fabrication.joint;
  const prepared=prepareConnectionWork(work.comps,work.modules,work.topo,{stockMm:work.stockMm,exportSettings:work.exportSettings});work.modules=prepared.modules;work.params=work.topo.params;
  const asm=compileAssembly(work.comps,work.modules,work.topo),sol=solveAssembly(asm,{thetaDeg:0,motorAngles:{},...n.motion});
  const validity=materialSolveValidity(work.comps,sol);if(!validity.valid)return {validity};
  const ids=motorPointIds(work.comps),groundIds=new Set(work.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p&&['fixed','motor'].includes(p.type)).map(p=>p.id)));
  const mounts=buildMotorMounts({motorIds:ids,groundIds,staticPoints:pointCoords(work.comps),comps:work.comps,compiledSteps:prepared.compiled.steps,sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:id=>motorTypeAt(work.comps,id)});
  const exportMounts=buildMotorExportMounts({comps:work.comps,pts:pointCoords(work.comps),motorCenterIds:ids,motorMounts:mounts,typeForCenter:id=>motorTypeAt(work.comps,id),ttSettings:work.fabrication.ttMount||FABRICATION_DEFAULTS.ttMount,mg995Settings:work.fabrication.mg995Mount||FABRICATION_DEFAULTS.mg995Mount});
  const catalog=buildPartGeometryCatalog({...work,mounts:exportMounts});
  const sceneIds=collectSceneIds({compiled:prepared.compiled,comps:work.comps,motorPointIds:ids});
  prepareRenderScene({compiled:prepared.compiled,comps:work.comps,points:sol.points,frameGeometry:catalog.parts.frame||null,sceneIds,computeBodyLayers,motorAssemblyLayerForBody:()=>null,motorMounts:mounts});
  markAllPlaneZlift(prepared.compiled.visualization.links,prepared.compiled.visualization.polygons||[],work.comps);
  const inputs=buildPreviewModelInputs({comps:work.comps,params:work.params,theta:n.motion?.thetaDeg || 0,links:prepared.compiled.visualization.links,polygons:prepared.compiled.visualization.polygons||[],points:sol.points,groundIds,motorCenterIds:ids,motorTypes:new Map([...ids].map(id=>[id,motorTypeAt(work.comps,id)])),motorMounts:mounts,
    sliderTravelStart:c=>c.travelStart||0,sliderTravelEnd:c=>c.travelEnd||100,sliderBodyLength:c=>c.bodyLen||60,rackBodyHeight:c=>c.bodyHeight||20,rackPhaseShift:()=>0,pulleyRadius:()=>32,pulleyPinRadius:()=>20});
  const args={comps:work.comps,modules:work.modules,params:work.params,exportSettings:{...work.exportSettings,drive:work.fabrication.drive||FABRICATION_DEFAULTS.drive},cnc:work.fabrication.cnc,mounts:exportMounts,joint:work.joint};
  const {plan}=resolveSpacers(args);
  const model=buildMaterialScene({...work,catalog,inputs:planeInputs(inputs,work.comps,work.modules,null),allPlanes:inputs,points:sol.points,asm,plan,combineSyringeFrame:true,hullR:DEFAULT_PLATE_RADIUS_WORLD,solveValidity:validity});
  return {model,work,points:sol.points};
}
