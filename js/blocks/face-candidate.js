/** Plain F1 candidate and once-only transaction; no S, DOM, undo or storage access. */
import {buildMountSurfaces,findMountSurface} from './mount-surfaces.js';
import {buildFacePlacement} from './face-placement.js';
import {mountFacePlacement} from './face-mount.js';
import {faceBracketPlan} from './face-bracket-extras.js';
import {prepareConnectionWork} from './connection-work.js';
import {compileAssembly,solveAssembly} from './assembly.js';
import {buildPartGeometryCatalog} from './part-geometry.js';
import {buildPreviewModelInputs} from './preview-model-inputs.js';
import {buildMaterialScene} from '../blocks3d/material-scene.js';
import {planeInputs} from '../blocks3d/orthogonal-3d.js';
import {motorPointIds,pointCoords} from './model.js';
import {motorTypeAt} from './motor-tools.js';
import {buildMotorMounts,buildMotorExportMounts} from './motor-mounts.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {materialSolveValidity} from './material-pose-status.js';
import {DEFAULT_PLATE_RADIUS_WORLD} from './plate-geometry.js';
import {resolveSpacers,findInterference} from './interference.js';
export const freezeData=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freezeData);Object.freeze(value);}return value;};
export function faceSourceRevision(source){const {theta,...params}=source.topo?.params || source.params || {};const {params:unused,...topo}=source.topo || {};return JSON.stringify([source.comps,source.modules,params,topo,source.fabrication,source.exportSettings,source.stockMm,source.joint]);}
export const facePoseRevision=pose=>JSON.stringify([pose?.theta ?? 0,pose?.motorAngles || {},pose?._prevPoints || null]);
export function centeredFaceSurface(surface){const center=Object.fromEntries(['x','y','z'].map(k=>[k,(surface.box.min[k]+surface.box.max[k])/2]));return {surface,box:{min:Object.fromEntries(['x','y','z'].map(k=>[k,surface.box.min[k]-center[k]])),max:Object.fromEntries(['x','y','z'].map(k=>[k,surface.box.max[k]-center[k]]))}};}
const failed=(code,reason,sourceRevision)=>freezeData({ok:false,reason,validation:{status:'fail',sourceRevision,checks:[{status:'fail',code,reason}],coverage:{scope:'face_candidate'}}});
export function buildFaceCandidate(source,{childId,hostEndpoint,childEndpoint,selection,reselect=false}={}){
 const sourceRevision=faceSourceRevision(source),work=structuredClone(source);
 if(work.comps.some(c=>!['anchor','bar','triangle','gear','rack'].includes(c.type)))return failed('candidate_format_not_supported','此候選材料流程目前支援桿件、板件、齒輪與齒條；其他材料尚未接入。',sourceRevision);
 work.topo=work.topo || {params:work.params || {}};
 work.params=work.topo.params;
 const stockMm=work.stockMm || Number(work.fabrication?.cnc?.stockThicknessMm) || FABRICATION_DEFAULTS.cnc.stockThicknessMm;
 const joint=work.joint || work.fabrication?.joint,exportSettings=work.exportSettings || work.fabrication?.export || {};
 if(!selection||!['hostFace','childFace'].every(k=>['top','bottom','front','back','left','right'].includes(selection[k]))||!['alignU','alignV','offsetU','offsetV','gap','quarterTurns'].every(k=>typeof selection[k]==='number'&&Number.isFinite(selection[k]))||selection.gap<0||!Number.isInteger(selection.quarterTurns)||selection.rotationDeg!==undefined&&!Number.isFinite(selection.rotationDeg)||selection.brackets&&Object.values(selection.brackets.offsets || {}).some(n=>!Number.isFinite(n)))return failed('invalid_selection','選面或尺寸輸入不合法。',sourceRevision);
 if(reselect)work.modules=work.modules.map(m=>m.id===childId?{...m,mount:null}:m);
 const opts={comps:work.comps,modules:work.modules,params:work.params,exportSettings,thicknessMm:stockMm,drilling:true};
 const host=findMountSurface(buildMountSurfaces({...opts,moduleId:hostEndpoint?.moduleId}).surfaces,hostEndpoint);
 const child=buildMountSurfaces({...opts,moduleId:childId,...(childEndpoint?.partId&&childEndpoint.partId!=='frame'?{partId:childEndpoint.partId}:{})}).surfaces?.find(s=>childEndpoint?.partId==='frame'?s.kind==='frame':s.compId===childEndpoint?.partId);
 if(!host||!child)return failed('endpoint_missing','接合端點已不存在，請重新選面。',sourceRevision);
 const placement=buildFacePlacement({host:centeredFaceSurface(host),child:centeredFaceSurface(child),selection});
 if(!placement.ok)return failed('placement_invalid',placement.reason,sourceRevision);
 const face={version:1,childPart:child.compId || 'frame',...placement.record.transform,selection:placement.record.selection,hostThicknessMm:host.box.max.z-host.box.min.z,childThicknessMm:child.box.max.z-child.box.min.z};
 const mounted=mountFacePlacement(work.comps,work.modules,childId,{hostId:host.moduleId,outputId:host.outputId,frameEdge:hostEndpoint?.frame?.edge ?? hostEndpoint?.frameEdge,face},work.params);
 if(!mounted.ok)return failed('mount_invalid',mounted.reason,sourceRevision);
 work.modules=work.modules.map(m=>m.id===childId?{...m,mount:mounted.mount}:m);
 const prepared=prepareConnectionWork(work.comps,work.modules,work.topo,{stockMm,exportSettings});work.modules=prepared.modules;work.params=work.topo.params;
 const mod=work.modules.find(m=>m.id===childId);
 const bracket=selection.brackets?faceBracketPlan(work.comps,work.modules,work.params,mod,{stockMm,joint,exportSettings}):null;
 if(selection.brackets&&!bracket?.ok){
  // Placement can be viewed while its requested fasteners are invalid. Only
  // this display copy omits unconfirmed holes; it can never be committed.
  const displayWork=structuredClone({...work,stockMm,joint,exportSettings});
  delete displayWork.modules.find(m=>m.id===childId).mount.face.selection.brackets;
  const invalid=failed('fastener_invalid',bracket?.reason || '角碼固定設定不合法。',sourceRevision);
  return freezeData({...invalid,validation:{...invalid.validation,checks:[...invalid.validation.checks,{status:'pass',code:'placement_valid'}]},saveable:false,selectionRevision:JSON.stringify(selection),hostSurface:host,placement:placement.record,bracket,work:{...work,stockMm,joint,exportSettings},displayWork});
 }
 return freezeData({ok:true,sourceRevision,selectionRevision:JSON.stringify(selection),hostSurface:host,work:{...work,stockMm,joint,exportSettings},placement:placement.record,bracket,
  validation:{status:'not_checked',sourceRevision,checks:[{status:'pass',code:'placement_valid'},{status:bracket?'pass':'not_checked',code:bracket?'fastener_valid':'fastener_not_requested'}],coverage:{scope:'face_candidate'}}});
}
export function faceCandidateModel(candidate,pose={}){
 const work=structuredClone(candidate.displayWork || candidate.work);
 work.topo ||= {params:work.params || {}};
 work.stockMm ||= Number(work.fabrication?.cnc?.stockThicknessMm) || FABRICATION_DEFAULTS.cnc.stockThicknessMm;
 work.exportSettings ||= work.fabrication?.export || {};work.joint ||= work.fabrication?.joint || FABRICATION_DEFAULTS.joint;
 work.topo.params.theta=pose.theta || 0;const prepared=prepareConnectionWork(work.comps,work.modules,work.topo,{stockMm:work.stockMm,exportSettings:work.exportSettings});work.modules=prepared.modules;work.params=work.topo.params;
 const asm=compileAssembly(work.comps,work.modules,work.topo),sol=solveAssembly(asm,{thetaDeg:pose.theta || 0,motorAngles:pose.motorAngles || {},_prevPoints:pose._prevPoints});
 const validity=materialSolveValidity(work.comps,sol);if(!validity.valid)return {solveValidity:validity};
 const ids=motorPointIds(work.comps),groundIds=new Set(work.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p&&['fixed','motor'].includes(p.type)).map(p=>p.id)));
 const mounts=buildMotorMounts({motorIds:ids,groundIds,staticPoints:pointCoords(work.comps),comps:work.comps,compiledSteps:prepared.compiled.steps,sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:id=>motorTypeAt(work.comps,id)});
 const exportMounts=buildMotorExportMounts({comps:work.comps,pts:pointCoords(work.comps),motorCenterIds:ids,motorMounts:mounts,typeForCenter:id=>motorTypeAt(work.comps,id),ttSettings:work.fabrication?.ttMount || FABRICATION_DEFAULTS.ttMount,mg995Settings:work.fabrication?.mg995Mount || FABRICATION_DEFAULTS.mg995Mount});
 const catalog=buildPartGeometryCatalog({...work,mounts:exportMounts});
 const inputs=buildPreviewModelInputs({comps:work.comps,params:work.params,theta:pose.theta || 0,links:prepared.compiled.visualization.links,polygons:prepared.compiled.visualization.polygons || [],points:sol.points,groundIds,motorCenterIds:ids,motorTypes:new Map([...ids].map(id=>[id,motorTypeAt(work.comps,id)])),motorMounts:mounts,
  sliderTravelStart:c=>c.travelStart || 0,sliderTravelEnd:c=>c.travelEnd || 100,sliderBodyLength:c=>c.bodyLen || 60,rackBodyHeight:c=>c.bodyHeight || 20,rackPhaseShift:()=>0,pulleyRadius:()=>32,pulleyPinRadius:()=>20});
 const model=buildMaterialScene({...work,catalog,inputs:planeInputs(inputs,work.comps,work.modules,null),allPlanes:inputs,points:sol.points,asm,hullR:DEFAULT_PLATE_RADIUS_WORLD,solveValidity:validity});
 const hostGeometry=catalog.parts[candidate.hostSurface?.framePartId || candidate.hostSurface?.compId],homeIds=hostGeometry?.binding.pointIds || [],[a,b]=homeIds.map(id=>catalog.homePoints[id]);
 const hostReference=candidate.hostSurface?.kind==='frame'?{origin:{x:0,y:0},angle:0}:hostGeometry?.binding.kind==='rack'&&a?{origin:a,angle:hostGeometry.binding.axisDeg*Math.PI/180}:a&&b?{origin:a,angle:Math.atan2(b.y-a.y,b.x-a.x)}:null;
 return {model,work,mounts:exportMounts,catalog,points:sol.points,hostReference,solveValidity:validity};
}
export async function validateFaceCandidate(candidate,pose={},compute,sceneInput){
 if(!candidate.ok&&!candidate.displayWork)return candidate;
 const poseRevision=facePoseRevision(pose),scene=sceneInput || faceCandidateModel(candidate,pose),checks=[...candidate.validation.checks];
 if(!scene.solveValidity.valid)return freezeData({...candidate,saveable:false,validation:{...candidate.validation,status:'not_checked',poseRevision,checks:[...checks,{status:'not_checked',code:scene.solveValidity.reason}],coverage:{scope:'single_pose',notSupported:[]}}});
 checks.push({status:'pass',code:'solve_valid'});
 const model={...scene.model,poseRevision};
 const material=compute?await compute(model):(await import('./material-interference.js')).checkMaterialInterference(model);
 if(!material||material.geometryKey!==model.geometryKey||material.poseRevision!==poseRevision||!['pass','fail','not_supported'].includes(material.status))return freezeData({...candidate,saveable:false,validation:{...candidate.validation,status:'not_checked',poseRevision,checks:[...checks,{status:'not_checked',code:'material_check_failed'}]}});
 const materialUnsupported=(material.coverage?.notSupported || []).some(r=>r.code!=='material_representation_not_supported'||!['motors','pins','grounds'].includes(r.kind));
 const args={comps:scene.work.comps,modules:scene.work.modules,params:scene.work.params,exportSettings:{...scene.work.exportSettings,drive:scene.work.fabrication?.drive || FABRICATION_DEFAULTS.drive},cnc:scene.work.fabrication?.cnc,mounts:scene.mounts,joint:scene.work.joint};
 const {plan}=resolveSpacers(args),plane=findInterference({...args,plan,pose:{...(pose.motorAngles || {}),'1':pose.motorAngles?.['1'] ?? pose.theta ?? 0}});
 checks.push({status:plane.length?'fail':'pass',code:'in_plane_interference',findings:plane},{status:material.status,code:'material_interference',findings:material.findings});
 return freezeData({...candidate,saveable:candidate.ok&&!materialUnsupported,...(materialUnsupported?{reason:'部分板件材料或姿態無法驗證，不能確認。'}:{}),work:candidate.ok?scene.work:candidate.work,model,points:scene.points,hostReference:scene.hostReference,validation:{status:!candidate.ok||plane.length||material.status==='fail'?'fail':material.status,sourceRevision:candidate.sourceRevision,selectionRevision:candidate.selectionRevision,geometryKey:model.geometryKey,poseRevision,checks,material,coverage:material.coverage}});
}
export function createFaceCandidateTransaction({readSource,readPose=()=>({}),build=buildFaceCandidate,validate=validateFaceCandidate,commit}){
 const sourceRevision=faceSourceRevision(readSource());let serial=0,current=null,pending=false,closed=false,confirming=false;
 const reject=(code,reason)=>({ok:false,code,reason});
 return {
  async preview(request){if(closed)return reject('closed','預覽已關閉。');const at=++serial;current=null;pending=true;
   const source=structuredClone(readSource()),pose=structuredClone(readPose());
   if(faceSourceRevision(source)!==sourceRevision){pending=false;return reject('source_stale','作品已變動，請重新開啟並計算接合。');}
   let result;try{result=await validate(build(source,request),pose);}catch(e){result=reject('validation_failed',e.message);}
   if(closed||at!==serial||faceSourceRevision(readSource())!==sourceRevision||facePoseRevision(readPose())!==facePoseRevision(pose)){if(at===serial)pending=false;return reject('candidate_stale','候選或姿態已變動，請重新預覽。');}
   pending=false;current=freezeData({...result,candidateId:String(at)});return current;
  },
  async confirm({candidateId,selectionRevision}={}){
   if(closed||confirming)return reject('already_committed','這筆候選已確認或關閉。');
   if(pending||!current?.saveable)return reject('candidate_not_ready','候選尚未完成有效姿態檢查。');
   if(current.candidateId!==candidateId||current.selectionRevision!==selectionRevision)return reject('candidate_stale','設定已變動，請重新預覽。');
   if(faceSourceRevision(readSource())!==sourceRevision)return reject('source_stale','作品已變動，請重新開啟並計算接合。');
   const at=serial,target=current,pose=structuredClone(readPose());
   if(facePoseRevision(pose)!==target.validation.poseRevision)return reject('pose_stale','目前姿態已變動，請重新預覽後確認。');
   confirming=true;
   try{const checked=await validate(target,pose);
    if(closed||at!==serial||target!==current||faceSourceRevision(readSource())!==sourceRevision||facePoseRevision(readPose())!==facePoseRevision(pose))return reject('candidate_stale','候選或姿態已變動，請重新預覽。');
    if(!checked.saveable)return reject('candidate_invalid','目前姿態無法驗證，請重新預覽。');
    closed=true;commit(checked.work,checked.validation,checked);return {ok:true,candidate:checked};
   }catch(e){return reject('validation_failed',e.message);}finally{confirming=false;}
  },
  cancel(){closed=true;serial++;current=null;pending=false;},snapshot:()=>({sourceRevision,current,pending,closed,confirming})
 };
}
