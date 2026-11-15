/** Shared designs retain ordinary materialized modules for the existing solver. */
import {moduleToTemplate,instantiateTemplate} from './module-ops.js';
import {pointKeysFor,ownedParamKeys} from './part-types.js';
import {transformComp,orthogonalHostEdge} from './assembly.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const paramsOf=w=>w.topo?.params || w.params || {};
const fail=(w,reason)=>({...w,ok:false,reason,warnings:[reason]});
function sourceOf(modules,id){
 const seen=new Set();let m=modules.find(m=>m.id===id);
 while(m?.designInstance){if(seen.has(m.id))return null;seen.add(m.id);m=modules.find(x=>x.id===m.designInstance.sourceId);}
 return m;
}
function context(w,excluded){
 const values=new Set(),motors=new Set();
 const scan=v=>{if(typeof v==='string')values.add(v);else if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==='object')Object.entries(v).forEach(([k,x])=>{values.add(k);if(['motor','physicalMotor'].includes(k)&&x!==undefined)motors.add(String(x));scan(x);});};
 scan(w.comps.filter(c=>c.moduleId!==excluded));scan(w.modules);scan(paramsOf(w));
 return {counter:w.counter || 0,existingTokens:values,usedMotorIds:[...motors]};
}
function anchor(comps,id){for(const c of comps)for(const k of pointKeysFor(c))if(c[k]?.id===id)return {x:c[k].x,y:c[k].y};return null;}
function reference(comps){
 const points=comps.flatMap(c=>pointKeysFor(c).map(k=>c[k])).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 const a=points[0],b=points.find(p=>a&&Math.hypot(p.x-a.x,p.y-a.y)>1e-7);
 return a?{a:a.id,...(b?{b:b.id}:{}),angle:b?Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI:0}:null;
}
function withParams(w,params){return w.topo?{...w,topo:{...w.topo,params}}:{...w,params};}
export function createDesignInstance(work,sourceId,place){
 const w=work || {},mods=w.modules || [];if(mods.length>=16)return fail(w,'最多可放置 16 份設計');
 const source=sourceOf(mods,sourceId);if(!source)return fail(w,'找不到來源設計');
 const template=moduleToTemplate(w.comps,mods,paramsOf(w),source.id);
 if(!template.comps.length)return fail(w,'來源設計沒有零件');
 if(place&&(!Number.isFinite(place.x)||!Number.isFinite(place.y)))return fail(w,'放置座標無效');
 const r=instantiateTemplate(template,{...context(w),place:place || anchor(template.comps,template.base) || {x:0,y:0}});
 r.module.designInstance={sourceId:source.id,...r.identity,reference:reference(template.comps)};
 const next=withParams({...w,comps:[...w.comps,...r.comps],modules:[...mods,r.module],counter:r.counter},{...paramsOf(w),...r.params});
 if(next.topo&&Array.isArray(next.topo.assemblyMembers))next.topo={...next.topo,assemblyMembers:[...next.topo.assemblyMembers,r.module.id]};
 return {...next,ok:true,moduleId:r.module.id,warnings:[]};
}
export function synchronizeDesignInstances(work){
 let w={...work,comps:[...work.comps],modules:[...work.modules]},params={...paramsOf(work)};
 for(const instance of work.modules.filter(m=>m.designInstance)){
  const source=sourceOf(work.modules,instance.id);if(!source)return fail(work,'實例的來源設計遺失，請先還原來源設計');
  const template=moduleToTemplate(work.comps,work.modules,paramsOf(work),source.id);
  if(!template.comps.length)return fail(work,'來源設計已沒有零件，請先移除組立中的實例');
  const prior=w.comps.filter(c=>c.moduleId===instance.id),place=anchor(prior,instance.base) || anchor(prior,prior.flatMap(c=>pointKeysFor(c).map(k=>c[k]?.id)).find(Boolean)) || {x:0,y:0};
  const r=instantiateTemplate(template,{...context(w,instance.id),moduleId:instance.id,identity:instance.designInstance,place});
  // Infer the independently placed rigid transform from the previous source reference.
  // Source resizing changes this reference only after its old placement has been recovered.
  const oldRef=instance.designInstance.reference,oldA=oldRef&&anchor(prior,instance.designInstance.tokens[oldRef.a]),oldB=oldRef?.b&&anchor(prior,instance.designInstance.tokens[oldRef.b]);
  const rotation=oldA&&oldB?Math.atan2(oldB.y-oldA.y,oldB.x-oldA.x)*180/Math.PI-oldRef.angle:0;
  const newA=oldRef&&anchor(r.comps,r.identity.tokens[oldRef.a]);
  if(oldA&&newA)r.comps=r.comps.map(c=>transformComp(c,{...newA,a:0},{...oldA,a:rotation},rotation));
  const tokens=c=>[c.id,...pointKeysFor(c).map(k=>c[k]?.id),...(c.holes || []).map(h=>h.id),...(c.standardBlank?.mountHoles || []).map(h=>h.id)].filter(Boolean);
  const newIds=new Set(r.comps.flatMap(tokens));
  const removed=new Set(prior.flatMap(tokens).filter(id=>!newIds.has(id)));
  const hasRemoved=v=>typeof v==='string'?removed.has(v):Array.isArray(v)?v.some(hasRemoved):v&&typeof v==='object'?Object.values(v).some(hasRemoved):false;
  if(w.modules.some(m=>hasRemoved(m.mount)))return fail(work,'來源修改移除了組立接合使用的零件或孔，請先解除該接合');
  if(w.modules.some(m=>m.mount?.to?.module===instance.id&&!m.mount.to.frame&&!r.module.outputs.some(o=>o.id===m.mount.to.output)))return fail(work,'來源修改移除了組立使用的輸出端，請先解除該接合');
  prior.forEach(c=>ownedParamKeys(c).forEach(k=>delete params[k]));Object.assign(params,r.params);
  const index=w.comps.findIndex(c=>c.moduleId===instance.id);w.comps=w.comps.filter(c=>c.moduleId!==instance.id);w.comps.splice(index<0?w.comps.length:index,0,...r.comps);
  w.modules=w.modules.map(m=>m.id===instance.id?{...r.module,name:source.name,mount:copy(instance.mount || null),...(instance.placementPlane?{placementPlane:instance.placementPlane}:{}),...(instance.rigidGroups?{rigidGroups:instance.rigidGroups}:{}),designInstance:{sourceId:source.id,...r.identity,reference:reference(template.comps)}}:m);
  if(Object.keys(r.identity.tokens).length>Object.keys(instance.designInstance.tokens).length)w.counter=Math.max(w.counter || 0,r.counter);
 }
 return {...withParams(w,params),ok:true,warnings:[]};
}

/** Refuse edits which would silently detach an original shared design's mount references. */
export function validateDesignInstanceChange(before,after){
 const sources=new Set((before.modules || []).filter(m=>m.designInstance).map(m=>m.designInstance.sourceId));
 const tokens=comps=>new Set(comps.flatMap(c=>[c.id,...pointKeysFor(c).map(k=>c[k]?.id),...(c.holes || []).map(h=>h.id),...(c.standardBlank?.mountHoles || []).map(h=>h.id)]).filter(Boolean));
 const hit=(v,removed)=>typeof v==='string'?removed.has(v):Array.isArray(v)?v.some(x=>hit(x,removed)):v&&typeof v==='object'?Object.values(v).some(x=>hit(x,removed)):false;
 const coords=w=>Object.fromEntries(w.comps.flatMap(c=>[...pointKeysFor(c).map(k=>c[k]),...(c.holes || [])]).filter(p=>p?.id).map(p=>[p.id,p]));
 for(const sourceId of sources){
  const old=tokens(before.comps.filter(c=>c.moduleId===sourceId)),next=tokens(after.comps.filter(c=>c.moduleId===sourceId)),removed=new Set([...old].filter(id=>!next.has(id)));
  const source=after.modules.find(m=>m.id===sourceId);
  for(const m of after.modules){
   const mount=m.mount;if(!mount)continue;
   if(hit(mount,removed))return {ok:false,reason:'來源修改移除了組立接合使用的零件或孔，請先解除該接合'};
   if(mount.to?.module!==sourceId)continue;
   if(!source)return {ok:false,reason:'來源設計仍被組立引用，請先解除該接合'};
   if(mount.to.output&&!source.outputs?.some(o=>o.id===mount.to.output))return {ok:false,reason:'來源修改移除了組立使用的輸出端，請先解除該接合'};
   if(mount.to.frame){
    const previous=before.modules.find(x=>x.id===m.id)?.mount;
    if(previous?.to?.frame){
     let oldEdge,newEdge;try{oldEdge=orthogonalHostEdge(before.comps,before.modules,previous,coords(before),paramsOf(before),{home:true});newEdge=orthogonalHostEdge(after.comps,after.modules,mount,coords(after),paramsOf(after),{home:true});}catch{return {ok:false,reason:'來源修改後無法核對機架接合邊，請先解除該接合'};}
     if(oldEdge&&!newEdge)return {ok:false,reason:'來源修改移除了組立使用的機架邊，請先解除該接合'};
    }
   }
  }
 }
 return {ok:true};
}
