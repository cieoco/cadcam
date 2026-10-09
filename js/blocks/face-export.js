/** Isolated F1 manufacturing verification; neither UI reports nor mutable S. */
import {faceSourceRevision,facePoseRevision,faceCandidateModel,validateFaceCandidate,freezeData} from './face-candidate.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {buildPlan,buildPackHtml} from './build-plan.js';
import {cncWarnings} from './cnc-check.js';
import {machineComps} from './assembly-roles.js';
import {machineFrameComps,machineMounts,moduleFrameExports,moduleFrameNodes,splitFrameMounts} from './assembly.js';
import {frameConnectorNodes} from './model.js';
import {withWorldAdapterNodes,withAdapterNodes} from './orthogonal-joint.js';
import {splitMountsByHost} from './exporters.js';
import {readConnectionDescriptor} from './connection-descriptor.js';
export const usesFaceExport=source=>source.comps.every(c=>['anchor','bar','triangle','gear'].includes(c.type))&&(source.modules.some(m=>m.mount?.face)||(source.modules.some(m=>m.mount?.orient?.joint?.kind==='bracket-m3')&&source.modules.every(m=>!m.mount?.orient||m.mount.orient.joint?.kind==='bracket-m3')));
function exportScene(source,pose){
 // Validate the requested identity before normalization can discard a malformed
 // mount. Losing an invalid requested connection must never enable export.
 for(const mod of source.modules.filter(m=>m.mount?.face)){
  const connection=readConnectionDescriptor({...source,childId:mod.id});
  if(!connection.ok)throw Error(`角碼孔暫停輸出：${connection.diagnostics[0]?.message || '接合端點無法驗證'}`);
 }
 const sourceRevision=faceSourceRevision(source),work=structuredClone(source);
 work.topo ||= {params:work.params || {}};work.params=work.topo.params;
 work.stockMm ||= Number(work.fabrication?.cnc?.stockThicknessMm) || FABRICATION_DEFAULTS.cnc.stockThicknessMm;
 work.exportSettings ||= work.fabrication?.export || {};work.joint ||= work.fabrication?.joint || FABRICATION_DEFAULTS.joint;
 const candidate={ok:true,work,sourceRevision,selectionRevision:null,validation:{checks:[{status:'pass',code:'requested_fasteners_valid'}]}};
 const scene=faceCandidateModel(candidate,pose),invalid=scene.catalog?.extras.diagnostics?.find(d=>d.status==='fail');
 if(invalid)throw Error(`角碼孔暫停輸出：${invalid.reason}`);
 if(!scene.solveValidity.valid)throw Error('目前姿態無有效解，材料尚未驗證。');
 return {candidate,scene};
}
/** Manufacturing coordinates are the shared catalog's home coordinates, never posed points. */
export function faceFileExportData(source,pose={}){
 const {scene}=exportScene(source,pose),{work,catalog}=scene,comps=machineComps(work.comps,work.modules),modules=work.modules;
 const mounts=machineMounts(scene.mounts,comps,modules),split=splitFrameMounts(splitMountsByHost(comps,mounts).free,comps,modules),extras=catalog.extras;
 const frames=[{name:'frame',nodes:withWorldAdapterNodes(frameConnectorNodes(machineFrameComps(comps,modules)),extras),mounts:split.world},...moduleFrameExports(comps,modules,work.params).map(entry=>({name:entry.fileBase,nodes:withAdapterNodes(entry.moduleId,moduleFrameNodes(entry,frameConnectorNodes(entry.comps)),extras),mounts:split.byModule[entry.moduleId] || []}))];
 return {comps,modules,params:work.params,points:catalog.homePoints,settings:{...work.exportSettings,drive:work.fabrication?.drive || FABRICATION_DEFAULTS.drive},mounts,extras,frames,catalog};
}
export function faceBuildPackHtml(result){
 if(!result.ok)throw Error(result.reason || '製作資料尚未驗證');
 const {work,catalog,validation}=result,cnc=work.fabrication?.cnc || FABRICATION_DEFAULTS.cnc;
 const boards=result.plan.parts.map(p=>({name:p.name,...catalog.parts[p.compId || p.name]})),warnings=cncWarnings(boards,cnc);
 if(Object.entries(FABRICATION_DEFAULTS.drive).every(([k,v])=>(work.fabrication?.drive?.[k] ?? v)===v)&&boards.some(p=>p.holes?.some(h=>/^(TT_HUB_|MG995_HORN_)/.test(h.layer || ''))))warnings.unshift('TT 輪轂／MG995 舵盤孔位用的是常見預設值，請實量後修改');
 const title=work.modules.map(m=>m.name).filter(Boolean).join('＋') || '機構作品';
 return buildPackHtml(result.plan,{title,cnc,warnings,comps:work.comps,modules:work.modules,validation,validationRevision:{sourceRevision:result.sourceRevision,poseRevision:result.poseRevision,geometryKey:result.model.geometryKey}});
}
export async function validateFaceExport(source,pose,compute){
 const sourceRevision=faceSourceRevision(source),poseRevision=facePoseRevision(pose);let candidate,scene;
 try{({candidate,scene}=exportScene(source,pose));}catch(e){return {ok:false,reason:e.message,sourceRevision,poseRevision};}
 const checked=await validateFaceCandidate(candidate,pose,compute,scene);
 if(!checked.saveable)return {ok:false,reason:checked.reason || '目前姿態無有效解，材料尚未驗證。',validation:checked.validation,sourceRevision,poseRevision};
 const plan=buildPlan({comps:checked.work.comps,modules:checked.work.modules,params:checked.work.params,exportSettings:{...checked.work.exportSettings,drive:checked.work.fabrication?.drive},cnc:checked.work.fabrication?.cnc,joint:checked.work.joint,mounts:scene.mounts,extras:scene.catalog.extras});
 return freezeData({ok:true,work:checked.work,catalog:scene.catalog,plan,model:checked.model,validation:{...checked.validation,scope:'single_pose',theta:pose.theta,motorAngles:pose.motorAngles || {}},sourceRevision,poseRevision});
}
/** Pause, clone once, recompute, and guard again before the download side effect. */
export function createFaceExportCoordinator({readSource,readPose,isPlaying=()=>false,pause,validate=validateFaceExport,download,notify=()=>{}}){
 let pending=false;
 return {async run(){
  if(pending)return {ok:false,reason:'製作包檢查中，請稍候。'};
  pending=true;
  try{
   pause();const source=structuredClone(readSource()),pose=structuredClone(readPose());notify('正在檢查目前姿態與製作資料…');
   const result=await validate(source,pose);
   if(isPlaying()||faceSourceRevision(readSource())!==faceSourceRevision(source)||facePoseRevision(readPose())!==facePoseRevision(pose))return {ok:false,reason:'作品或姿態已變動，請重新產生製作包。'};
   if(!result.ok)return result;
   if(result.sourceRevision!==faceSourceRevision(source)||result.poseRevision!==facePoseRevision(pose)||!result.model||result.validation?.scope!=='single_pose'||!['pass','fail','not_supported'].includes(result.validation?.status)||['sourceRevision','poseRevision','geometryKey'].some(k=>result.validation[k]!== (k==='geometryKey'?result.model.geometryKey:result[k])))return {ok:false,reason:'材料報告已過期，請重新檢查。'};
   download(result);return result;
  }catch(e){return {ok:false,reason:e.message};}finally{pending=false;}
 },pending:()=>pending};
}
