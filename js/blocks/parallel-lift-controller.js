/** 平行四連桿任務卡：草稿只顯示候選數值，確認才更新作品。 */
import { prepareParallelLiftOperation, createParallelLiftOperationSession } from './parallel-lift-operations.js';
import { taskSnapshotKey } from './task-operation-support.js';
export function createParallelLiftController({getSnapshot,applySnapshot,pause,draw,setPose,fitView,isEditing}){
  const el=id=>document.getElementById(id);
  let active=false,draft={},result={ok:false},key=null;
  const operations=createParallelLiftOperationSession({getSnapshot,applySnapshot:s=>{applySnapshot(s);sync();}});
  const fields={parallelArmLength:'armLengthMm',parallelStartHeight:'startHeightMm',parallelEndHeight:'endHeightMm'};
  function render(){
    const card=el('exampleLessonCard'),content=el('parallelWorkflowContent');if(!card||!content)return;
    content.style.display=active?'':'none';
    if(!active){if(card.dataset.taskOwner==='parallel')delete card.dataset.taskOwner;return;}
    card.dataset.taskOwner='parallel';
    const editing=Boolean(isEditing?.()),canvas=el('workRangeCard')?.parentElement;
    canvas?.classList.toggle('gripper-workflow-active',true);canvas?.classList.toggle('gripper-card-visible',!editing);
    card.classList.toggle('workflow-active',true);card.classList.toggle('workflow-hidden',editing);card.style.display=editing?'none':'';
    el('exampleLessonContent').style.display='none';el('gripperWorkflowContent').style.display='none';
    const p=getSnapshot().params;
    for(const [id,k]of Object.entries(fields)){const input=el(id);if(input&&document.activeElement!==input)input.value=draft[k]??(k==='armLengthMm'?p.LL1:k==='startHeightMm'?p.parallelStartHeight:p.parallelEndHeight);}
    const pending=Object.keys(draft).length>0;
    el('parallelDraftActions').style.display=pending?'':'none';
    el('parallelConfirm').disabled=!result.ok;el('parallelStart').disabled=pending||!result.ok;el('parallelEnd').disabled=pending||!result.ok;
    el('parallelStatus').textContent=result.ok?`${pending?'候選，確認後更新：':''}${result.plan.start.theta.toFixed(1)}→${result.plan.end.theta.toFixed(1)}° · ${result.validation.sampleCount}點採樣；CD保持垂直。`:result.issues?.[0]?.message||'尚未啟用任務';
    canvas?.style.setProperty('--gripper-card-space',`${(card.offsetHeight||0)+16}px`);
  }
  function recompute(){const snapshot=getSnapshot();active=Number(snapshot.params.parallelWorkflow)===1;
    if(active){const nextKey=taskSnapshotKey({...snapshot,params:{...snapshot.params,theta:0},draft});if(nextKey!==key){key=nextKey;result=prepareParallelLiftOperation(snapshot,{operationVersion:1,action:'updateTask',parameters:draft});}}
    else{draft={};key=null;operations.cancel();}
    render();return result;
  }
  function sync(){draft={};operations.cancel();return recompute();}
  function preview(id,value){if(!active)return;pause();const k=fields[id];draft[k]=value===''?'':Number(value);result=operations.prepare({operationVersion:1,action:'updateTask',parameters:draft});key=null;render();}
  function cancel(){draft={};key=null;operations.cancel();recompute();draw();}
  function confirm(){if(!result.ok)return;const applied=operations.confirm();if(!applied.ok){result=applied;render();return applied;}draft={};key=null;recompute();moveTo('start');return applied;}
  function moveTo(which){if(Object.keys(draft).length||!result.ok)return;pause();setPose(result.plan[which].theta,'1');fitView?.();draw();}
  for(const id of Object.keys(fields))el(id)?.addEventListener('input',e=>preview(id,e.target.value));
  el('parallelConfirm')?.addEventListener('click',confirm);el('parallelCancel')?.addEventListener('click',cancel);
  el('parallelStart')?.addEventListener('click',()=>moveTo('start'));el('parallelEnd')?.addEventListener('click',()=>moveTo('end'));
  return {sync,recompute,syncVisibility:render,isActive:()=>active,currentPlan:()=>Object.keys(draft).length?{ok:false,message:'請先確認或取消候選再播放。'}:result.ok?result.plan:{ok:false,message:result.issues?.[0]?.message},range:()=>active&&result.ok&&!Object.keys(draft).length?result.plan.range:null,moveToStart:()=>moveTo('start'),operations,preview,confirm,cancel};
}
