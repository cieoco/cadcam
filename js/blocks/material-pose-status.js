import {unsolvedMovingPoints} from './solve-health.js';
export function materialSolveValidity(comps,sol){const missing=unsolvedMovingPoints(comps,sol);return {valid:!!sol&&sol.isValid!==false&&!!sol.points&&!missing.length,reason:!sol?'solve_failed':sol.isValid===false?'unsolved_pose':missing.length?'moving_points_unresolved':null,sourceIds:missing};}
/** Current-pose ownership. An awaited result cannot validate a newer/playing scene. */
export function createMaterialPoseStatus(){
 let revision=0,signature='',model=null,playing=false,candidate=false,report=null,lastReport=null,pending=null;
 const snapshot=()=>({poseRevision:revision,geometryKey:model?.geometryKey || '',playing,candidate,report,lastReport,solveValidity:model?.solveValidity || null,checking:!!pending,status:playing||candidate||!report?'not_checked':report.status});
 return {
  observe(next,{isPlaying=false,isCandidate=false}={}){
   const sig=next?JSON.stringify([next.geometryKey,next.solveValidity,next.materialParts?.map(p=>[p.partId,p.pose.matrix])]):'';
   if(sig!==signature){signature=sig;revision++;report=null;pending=null;}
   model=next;playing=isPlaying;candidate=isCandidate;
   if(playing||candidate||!model||model.solveValidity?.valid!==true){report=null;pending=null;}
   return snapshot();
  },
  async check(compute){
   if(!model||model.solveValidity?.valid!==true||playing||candidate||report||pending)return snapshot();
   const target=model,at=revision,token={};pending=token;
   let result;
   try{result=await compute({...target,poseRevision:at});}catch(e){result={status:'not_supported',geometryKey:target.geometryKey,poseRevision:at,findings:[],pairs:[],coverage:{notSupported:[{status:'not_supported',reason:'material_check_failed',detail:e.message}]}};}
   if(pending===token&&revision===at&&model?.geometryKey===target.geometryKey&&!playing&&!candidate&&model.solveValidity?.valid===true){
    if(result?.poseRevision!==at||result?.geometryKey!==target.geometryKey||!Array.isArray(result.findings)||!['pass','fail','not_checked','not_supported'].includes(result.status))result={status:'not_supported',geometryKey:target.geometryKey,poseRevision:at,findings:[],pairs:[],coverage:{notSupported:[{status:'not_supported',reason:'invalid_material_check_result'}]}};
    report=result;lastReport=result;pending=null;
   }
   return snapshot();
  },
  snapshot
 };
}
