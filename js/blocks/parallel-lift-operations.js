import { prepareConnectionWork } from './connection-work.js';
import { getExample } from './examples.js';
import { planParallelLift } from './parallel-lift-workflow.js';
import { taskIssue, prepareTaskSnapshot, createTaskOperationSession } from './task-operation-support.js';
export function prepareParallelLiftOperation(sourceSnapshot,request){
  const fail=(code,message,targets=[])=>({ok:false,operationVersion:1,issues:[taskIssue(code,message,targets)],changes:[]});
  if(!request||typeof request!=='object'||Array.isArray(request)||request.operationVersion!==1||!['createFromExample','updateTask'].includes(request.action))return fail('INVALID_REQUEST','請提供版本1的建立或修改請求。');
  const create=request.action==='createFromExample',allowed=['operationVersion','action','parameters',...(create?['exampleId']:[])];
  if(Object.keys(request).some(k=>!allowed.includes(k))||(create&&!['parallel-fourbar','lift-bucket'].includes(request.exampleId)))return fail('INVALID_REQUEST','本操作僅支援平行升降臂／托斗範例與既定欄位。');
  const params=request.parameters===undefined?{}:request.parameters;
  if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>!['armLengthMm','startHeightMm','endHeightMm'].includes(k)))return fail('INVALID_REQUEST','僅可設定活動臂長及起終高度。');
  for(const [key,v]of Object.entries(params))if(typeof v!=='number'||!Number.isFinite(v)||(key==='armLengthMm'?(v<32||v>120):(v<0||v>120)))return fail('INVALID_DIMENSIONS','活動臂32–120mm、起終高度0–120mm，必須是有限數字。',[key]);
  const prepared=prepareTaskSnapshot(create?getExample(request.exampleId).snapshot:sourceSnapshot,{allowAssembly:!create?Number(sourceSnapshot?.params?.liftBucket)===1:request.exampleId==='lift-bucket'});
  if(!prepared.ok)return {...prepared,operationVersion:1};
  const candidate=prepared.candidateSnapshot,changes=[];
  const set=(k,v)=>{if(candidate.params[k]!==v){changes.push({path:`params.${k}`,before:candidate.params[k],after:v});candidate.params[k]=v;}};
  if(Object.hasOwn(params,'armLengthMm')){set('LL1',params.armLengthMm);set('LL2',params.armLengthMm);}
  if(Object.hasOwn(params,'startHeightMm'))set('parallelStartHeight',params.startHeightMm);
  if(Object.hasOwn(params,'endHeightMm'))set('parallelEndHeight',params.endHeightMm);
  // 舊版原範例可啟用任務；不修補未知結構或不等長活動臂。
  if(candidate.params.parallelStartHeight===undefined)set('parallelStartHeight',10);
  if(candidate.params.parallelEndHeight===undefined)set('parallelEndHeight',35);
  set('parallelWorkflow',1);
  if(Number(candidate.params.liftBucket)===1){
    const r=prepareConnectionWork(candidate.comps,candidate.modules,{params:candidate.params},{stockMm:candidate.fabrication?.cnc?.stockThicknessMm,joint:candidate.fabrication?.joint,exportSettings:candidate.fabrication?.export});
    candidate.modules=r.modules;candidate.params=r.topo.params;
    if(r.warnings.length)return fail('INVALID_CONNECTION','托斗接合需重新確認。');
  }
  const plan=planParallelLift(candidate);
  if(!plan.ok)return {ok:false,operationVersion:1,issues:plan.issues,changes,validation:plan.validation};
  return {ok:true,operationVersion:1,issues:[],changes,candidateSnapshot:candidate,plan,validation:plan.validation};
}
export function createParallelLiftOperationSession(options){return createTaskOperationSession({...options,prepareOperation:prepareParallelLiftOperation});}
