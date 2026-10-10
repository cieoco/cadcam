import { getExample } from './examples.js';
import { planTippingBucket } from './tipping-bucket-workflow.js';
import { taskIssue, prepareTaskSnapshot, createTaskOperationSession } from './task-operation-support.js';
export function prepareTippingBucketOperation(sourceSnapshot,request){
  const fail=(code,message,targets=[])=>({ok:false,operationVersion:1,issues:[taskIssue(code,message,targets)],changes:[]});
  if(!request||typeof request!=='object'||Array.isArray(request)||request.operationVersion!==1||!['createFromExample','updateTask'].includes(request.action))return fail('INVALID_REQUEST','請提供版本1的建立或修改請求。');
  const create=request.action==='createFromExample',allowed=['operationVersion','action','parameters',...(create?['exampleId']:[])];
  if(Object.keys(request).some(k=>!allowed.includes(k))||(create&&request.exampleId!=='tipping-bucket'))return fail('INVALID_REQUEST','本操作僅支援tipping-bucket與既定欄位。');
  const params=request.parameters===undefined?{}:request.parameters;
  if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>!['stowAngleDeg','dumpAngleDeg'].includes(k)))return fail('INVALID_REQUEST','僅可設定收納角及傾倒角。');
  for(const [key,v]of Object.entries(params))if(typeof v!=='number'||!Number.isFinite(v)||(v<-120||v>30))return fail('ANGLE_OUT_OF_RANGE','角度須為有限數字；立體料斗教學分支−120～0°，舊側視來源−120～30°。',[key]);
  const prepared=prepareTaskSnapshot(create?getExample('tipping-bucket').snapshot:sourceSnapshot,{allowAssembly:true});
  if(!prepared.ok)return {...prepared,operationVersion:1};
  const candidate=prepared.candidateSnapshot,changes=[];
  const set=(k,v)=>{if(candidate.params[k]!==v){changes.push({path:`params.${k}`,before:candidate.params[k],after:v});candidate.params[k]=v;}};
  if(candidate.modules?.length){
    if(Object.values(params).some(v=>!Number.isInteger(v)))return fail('ANGLE_OUT_OF_RANGE','共用 MG995 存檔使用整數角度，請輸入整數。');
    const driver=candidate.comps.find(c=>c.id==='Drive');
    if(!driver)return fail('UNSUPPORTED_STRUCTURE','缺少MG995驅動。');
    for(const [key,field]of [['stowAngleDeg','servoStart'],['dumpAngleDeg','servoEnd']])if(Object.hasOwn(params,key)&&driver[field]!==params[key]){changes.push({path:`comps.Drive.${field}`,before:driver[field],after:params[key]});driver[field]=params[key];}
  }else{
    if(Object.hasOwn(params,'stowAngleDeg'))set('bucketStowAngle',params.stowAngleDeg);
    if(Object.hasOwn(params,'dumpAngleDeg'))set('bucketDumpAngle',params.dumpAngleDeg);
    set('bucketWorkflow',1);
  }
  const plan=planTippingBucket(candidate);
  if(!plan.ok)return {ok:false,operationVersion:1,issues:plan.issues,changes,validation:plan.validation};
  return {ok:true,operationVersion:1,issues:[],changes,candidateSnapshot:candidate,plan,validation:plan.validation};
}
export function createTippingBucketOperationSession(options){return createTaskOperationSession({...options,prepareOperation:prepareTippingBucketOperation});}
