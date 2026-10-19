import {compileAssembly,solveAssembly} from './assembly.js';
import {syringeIssues} from '../core/syringe.js';
import {motionPoseIssue} from './solve-health.js';

// 組立裡的針筒控制：每支針筒屬於自己的模組、各自有伸出量；一次只推一支，其餘維持原位。純函式，不改傳入資料。
// 順序依安裝層級：底層模組（例如升降）在前，裝在它輸出端的模組（例如夾爪）在後。
export function assemblySyringeControls(comps,modules){
  const depth=id=>{let d=0,m=modules.find(x=>x.id===id);const seen=new Set();while(m?.mount?.to?.module&&!seen.has(m.id)){seen.add(m.id);d++;m=modules.find(x=>x.id===m.mount.to.module);}return d;};
  return comps.filter(c=>c.type==='syringe').map((c,i)=>{
    const module=modules.find(m=>m.id===c.moduleId);
    return {id:c.id,moduleId:c.moduleId||null,label:`${module?.name||c.moduleId||'組立'} 針筒`,extension:c.extension,stroke:c.spec?.stroke,order:[module?depth(module.id):0,Math.max(0,modules.indexOf(module)),i]};
  }).sort((a,b)=>a.order[0]-b.order[0]||a.order[1]-b.order[1]||a.order[2]-b.order[2]).map(({order,...x})=>x);
}
export function planAssemblySyringe(comps,modules,params,id,extension,previous=null){
  const candidate=structuredClone(comps),c=candidate.find(o=>o.id===id&&o.type==='syringe');
  if(!c)return {ok:false,message:'找不到針筒。'};
  const stroke=c.spec?.stroke;
  if(!Number.isFinite(extension)||!(extension>=0&&extension<=stroke))return {ok:false,message:`伸出量超出針筒行程：請設在 0–${stroke} mm 之間。`};
  c.extension=extension;
  const issues=candidate.filter(o=>o.type==='syringe').flatMap(o=>syringeIssues(o,candidate,params));
  if(issues.length)return {ok:false,message:issues.join(' ')};
  try{
    const result=solveAssembly(compileAssembly(candidate,modules,{params}),{thetaDeg:0,motorAngles:{},_prevPoints:previous});
    if(!result.isValid||result.isUnderconstrained)return {ok:false,message:result.errorReason||'目前伸出量無法形成有效的組立姿勢；已保留原姿勢。',result};
    return {ok:true,comps:candidate,points:result.points,result};
  }catch(e){return {ok:false,message:`目前伸出量無法形成有效的組立姿勢：${e.message}`};}
}
// 一次指定多支針筒的伸出量（動作序列用）：不改傳入資料；失敗時回傳說明，成功時回傳整組候選零件與接點。
export function planAssemblyExtensions(comps,modules,params,extensions,previous=null){
  const candidate=structuredClone(comps);
  for(const [id,extension] of Object.entries(extensions||{})){
    const c=candidate.find(o=>o.id===id&&o.type==='syringe');
    if(!c)return {ok:false,message:'找不到針筒。'};
    const stroke=c.spec?.stroke;
    if(!Number.isFinite(extension)||!(extension>=0&&extension<=stroke))return {ok:false,message:`伸出量超出針筒行程：請設在 0–${stroke} mm 之間。`};
    c.extension=extension;
  }
  const issues=candidate.filter(o=>o.type==='syringe').flatMap(o=>syringeIssues(o,candidate,params));
  if(issues.length)return {ok:false,message:issues.join(' ')};
  try{
    const result=solveAssembly(compileAssembly(candidate,modules,{params}),{thetaDeg:0,motorAngles:{},_prevPoints:previous});
    const issue=motionPoseIssue(candidate,result);
    if(issue)return {ok:false,message:issue.message,result};
    return {ok:true,comps:candidate,points:result.points,result};
  }catch(e){return {ok:false,message:`目前伸出量無法形成有效的組立姿勢：${e.message}`};}
}
