// 組立成員縮小後，仍驗證留下的教學任務；不把候選寫回整份作品。
import {prepareGripperOperation} from './gripper-operations.js';
import {prepareParallelLiftOperation} from './parallel-lift-operations.js';
export function validateAssemblyTask(snapshot){
  const p=snapshot.params || {},comps=snapshot.comps || [];
  const request={operationVersion:1,action:'updateTask',parameters:{}};
  if(Number(p.gripperWorkflow)===1&&comps.some(c=>['GearA','GearB','LeftJaw','RightJaw'].includes(c.id)))return prepareGripperOperation(snapshot,request);
  if(Number(p.parallelWorkflow)===1&&comps.some(c=>['LL1','LL2','LL3'].includes(c.lenParam)||c.lenParam?.endsWith('_LL1')))return prepareParallelLiftOperation(snapshot,request);
  return null;
}
