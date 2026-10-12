import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';
import {attachmentPoint, syringeIssues} from '../core/syringe.js';

// Candidates are pure data; callers commit only successful results through normal undo/save.
export function solveSyringe(comps,params,previous=null,motion={}) {
  const issues=comps.filter(c=>c.type==='syringe').flatMap(c=>syringeIssues(c,comps,params));
  if(issues.length)return {ok:false,message:issues.join(' ')};
  try {
    const topology=compileTopology(comps,{params});
    const result=solveTopology(topology,{thetaDeg:0,...motion,_prevPoints:previous});
    if(!result.isValid||result.isUnderconstrained)return {ok:false,message:result.reason || result.errorReason || '目前輸入無法形成有效組裝姿勢，請檢查固定點與未受約束的零件。',result};
    return {ok:true,result,points:result.points};
  } catch(e) {return {ok:false,message:`目前輸入無法形成有效組裝姿勢：${e.message}`};}
}
export function syringeReading(c,comps,params,points) {
  const a=attachmentPoint(c.a,comps,params,points),b=attachmentPoint(c.b,comps,params,points);
  const arm=comps.find(o=>o.id===c.b.componentId),o=points?.[arm?.p1?.id],end=points?.[arm?.p2?.id];
  return {a,b,length:a&&b?Math.hypot(b.x-a.x,b.y-a.y):NaN,
    angle:o&&end?Math.atan2(end.y-o.y,end.x-o.x)*180/Math.PI:NaN,end,
    branch:a&&b&&o?Math.sign((a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x)):0};
}
export function planSyringeStroke(comps,params,id,extension,previous=null,motion={}) {
  const candidate=structuredClone(comps),c=candidate.find(c=>c.id===id&&c.type==='syringe');
  if(!c)return {ok:false,message:'找不到針筒。'};
  c.extension=extension;
  const result=solveSyringe(candidate,params,previous,motion);
  if(result.ok&&previous){
    const before=syringeReading(c,comps,params,previous),after=syringeReading(c,candidate,params,result.points);
    if(before.branch&&after.branch&&before.branch!==after.branch)return {ok:false,message:'目前輸入會切換組裝分支；已保留原姿勢。'};
  }
  return {...result,comps:candidate};
}
export function scanSyringe(comps,params,id,step=0.5,motion={}) {
  const c=comps.find(c=>c.id===id&&c.type==='syringe');
  if(!c||!(step>0)||!Number.isFinite(step)||c.spec.stroke>10000)return {ok:false,message:'無法掃描這個行程。',samples:[]};
  const initial=solveSyringe(comps,params,null,motion);
  if(!initial.ok)return {...initial,samples:[]};
  let previous=initial.points,maxResidualMm=0;const samples=[];
  const n=Math.ceil(c.spec.stroke/step);
  if(n>2000)return {ok:false,message:'採樣超過 2000 段，請縮小有效行程或調整掃描間距。',samples:[]};
  for(let i=0;i<=n;i++){
    const extension=c.spec.stroke*i/n,result=planSyringeStroke(comps,params,id,extension,previous,motion);
    if(!result.ok)return {...result,atMm:extension,samples,maxResidualMm};
    previous=result.points;maxResidualMm=Math.max(maxResidualMm,result.result.syringeValidation.residualMm);
    samples.push({extension,...syringeReading(c,comps,params,previous)});
  }
  return {ok:true,samples,maxResidualMm,message:`${samples.length} 點幾何採樣通過；干涉、承重與水路未驗證。`};
}
// Reflect at both limits, including long frames. mm/s, independent of refresh rate.
export function advanceSyringe(extension,direction,seconds,stroke,speed=8){
  const phase=(direction>0?extension:2*stroke-extension)+Math.max(0,seconds)*speed;
  const p=((phase%(2*stroke))+2*stroke)%(2*stroke);
  return {extension:p<=stroke?p:2*stroke-p,direction:p<stroke?1:-1};
}
