import {plateVertexWorldPoints} from './plate-geometry.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';
import {attachmentPoint, syringeIssues,fixedSyringePointIds} from '../core/syringe.js';

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
  const arm=comps.find(o=>o.id===(c.outputId||c.b.componentId));
  const fixedIds=fixedSyringePointIds(comps);
  const pivot=[arm?.p1,arm?.p2,arm?.p3].find(p=>fixedIds.has(p?.id)) || arm?.p1;
  const tip=c.outputId==='H2Arm'?arm?.p3:[arm?.p2,arm?.p1,arm?.p3].find(p=>p&&p.id!==pivot?.id);
  const o=points?.[pivot?.id],end=points?.[tip?.id];
  const tips=(c.passiveTips||[]).map(t=>points?.[comps.find(o=>o.id===t.hostId)?.p3?.id]);
  const mountGap=tips.length===2&&tips.every(Boolean)?Math.hypot(tips[0].x-tips[1].x,tips[0].y-tips[1].y):null;
  const ends=(c.jawIds||[]).map(id=>{const arm=comps.find(o=>o.id===id);return arm?plateVertexWorldPoints(arm,[arm.p1,arm.p2,arm.p3].map(p=>points?.[p.id]||p)).at(-1):null;});
  const tipGap=ends.length===2&&ends.every(Boolean)?Math.hypot(ends[0].x-ends[1].x,ends[0].y-ends[1].y):null;
  return {a,b,mountGap,tipGap,length:a&&b?Math.hypot(b.x-a.x,b.y-a.y):NaN,
    origin:o,angle:o&&end?Math.atan2(end.y-o.y,end.x-o.x)*180/Math.PI:NaN,end,
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
// 目前伸出量下的比例：每推 1 mm，輸出臂轉幾度、臂端移幾 mm（取大小，不含轉向）。以 ±0.25 mm 中央差分，重用原分支；不改傳入資料。
export function syringeGain(comps,params,id,points) {
  const c=comps.find(o=>o.id===id&&o.type==='syringe'),stroke=c?.spec?.stroke;
  if(!c||!points||!Number.isFinite(c.extension)||!(stroke>0))return null;
  const e0=Math.max(0,c.extension-.25),e1=Math.min(stroke,c.extension+.25);
  if(!(e1>e0))return null;
  const read=e=>{const r=planSyringeStroke(comps,params,id,e,points);return r.ok?syringeReading(c,r.comps,params,r.points):null;};
  const a=read(e0),b=read(e1);
  if(!a||!b||!Number.isFinite(a.angle)||!Number.isFinite(b.angle)||!a.end||!b.end)return null;
  const dAngle=((b.angle-a.angle+540)%360+360)%360-180,dEnd=Math.hypot(b.end.x-a.end.x,b.end.y-a.end.y),span=e1-e0;
  const tipGapMmPerMm=Number.isFinite(a.tipGap)&&Number.isFinite(b.tipGap)?(a.tipGap-b.tipGap)/span:null; // 夾爪：每推 1 mm 端距縮小量（縮小為正）
  return {degPerMm:Math.abs(dAngle)/span,endMmPerMm:dEnd/span,tipGapMmPerMm};
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
  return {ok:true,samples,maxResidualMm,message:`${samples.length} 點${c.passiveTips?.length?'主傳動':'幾何'}採樣通過；${c.passiveTips?.length?'夾片角度手動，接觸未求解；':''}干涉、承重與水路未驗證。`};
}
// Reflect at both limits, including long frames. mm/s, independent of refresh rate.
export function advanceSyringe(extension,direction,seconds,stroke,speed=8){
  const phase=(direction>0?extension:2*stroke-extension)+Math.max(0,seconds)*speed;
  const p=((phase%(2*stroke))+2*stroke)%(2*stroke);
  return {extension:p<=stroke?p:2*stroke-p,direction:p<stroke?1:-1};
}
