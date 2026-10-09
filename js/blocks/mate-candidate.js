/** Legacy mate previews own their work and scene; never replace the live state. */
import {prepareConnectionWork} from './connection-work.js';
import {faceSourceRevision,facePoseRevision,faceCandidateModel,validateFaceCandidate,freezeData} from './face-candidate.js';

export function createMateCandidate({readSource,readPose,onChange=()=>{},model=faceCandidateModel,validate=validateFaceCandidate}) {
 let current=null,serial=0;
 const fresh=()=>!!current&&current.sourceRevision===faceSourceRevision(readSource())&&current.poseRevision===facePoseRevision(readPose());
 return {
  set(value){
   serial++;current=null;if(!value)return null;
   const source=readSource(),pose=structuredClone(readPose()),work=structuredClone({...source,...value});
   work.topo ||= {params:work.params || {}};
   const prepared=prepareConnectionWork(work.comps,work.modules,work.topo,{stockMm:work.fabrication?.cnc?.stockThicknessMm,exportSettings:work.exportSettings});
   work.modules=prepared.modules;work.params=work.topo.params;
   const candidate=freezeData({ok:true,work,sourceRevision:faceSourceRevision(source),validation:{checks:[]}}),scene=model(candidate,pose),at=serial;
   current={candidate,scene,sourceRevision:candidate.sourceRevision,poseRevision:facePoseRevision(pose),result:null};
   Promise.resolve().then(()=>validate(candidate,pose,undefined,scene)).then(result=>{
    if(at!==serial||!fresh())return;current.result=result;onChange();
   }).catch(error=>{if(at!==serial||!fresh())return;current.result={saveable:false,reason:error.message};onChange();});
   return {comps:work.comps,modules:work.modules};
  },
  snapshot(){return fresh()?current:null;},
  take(){if(!fresh()||!current.result?.saveable)return null;const result=structuredClone(current.result);serial++;current=null;return result;},
  cancel(){serial++;current=null;}
 };
}
