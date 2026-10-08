import { readConnectionDescriptor } from './connection-descriptor.js';
/** Recompute confirmed drilling against current stock; stale/invalid plans produce no holes. */
import { buildMountSurfaces } from './mount-surfaces.js';
import { planFaceBrackets } from './face-bracket-geometry.js?v=20261008_bracket3d';

function rawPlan(comps, modules, params, mod, opts={}) {
  if (!mod?.mount?.face?.selection?.brackets?.enabled) return null;
  const descriptor=readConnectionDescriptor({comps,modules,childId:mod.id,mount:mod.mount});
  if(!descriptor.capabilities.drilling)return {ok:false,reason:descriptor.diagnostics[0]?.message || '找不到支援開孔的接合板',diagnostics:descriptor.diagnostics};
  const surfaces=(id,partId)=>buildMountSurfaces({comps,modules,params,moduleId:id,partId,exportSettings:opts.exportSettings || {},thicknessMm:opts.stockMm || 3,drilling:true}).surfaces || [];
  const host=surfaces(mod.mount.to.module).find(s=>s.outputId===mod.mount.to.output);
  const part=descriptor.child.partId, own=surfaces(mod.id,part);
  const child=own.find(s=>part && part!=='frame'?s.compId===part:s.kind==='frame');
  if (!host || !child || host.body?.kind==='rack' || child.body?.kind==='rack') return {ok:false,reason:'找不到支援開孔的接合板'};
  return {...planFaceBrackets(host,child,mod.mount.face,mod.mount.face.selection.brackets.offsets,true,{joint:opts.joint,connectionId:descriptor.id}),host,child};
}

export function faceBracketPlan(comps, modules, params, mod, opts={}) {
  const plan=rawPlan(comps,modules,params,mod,opts);
  if(!plan?.ok) return plan;
  for(const other of modules) {
    if(other.id===mod.id) continue;
    const p=rawPlan(comps,modules,params,other,opts);
    if(!p?.ok) continue;
    for(const [surface,holes] of [[plan.host,plan.hostHoles],[plan.child,plan.childHoles]]) {
      for(const [target,existing] of [[p.host,p.hostHoles],[p.child,p.childHoles]]) {
        if(surface.moduleId===target.moduleId && surface.compId===target.compId && holes.some(h=>existing.some(q=>Math.hypot(h.x-q.x,h.y-q.y)<plan.spec.diameter+plan.spec.web)))
          return {...plan,ok:false,reason:'孔位與另一組角碼太接近',hostHoles:[],childHoles:[]};
      }
    }
  }
  return plan;
}

export function appendFaceBracketHoles(extras, comps, modules, params, opts={}) {
  extras.adapters ||= [];
  for(const mod of modules || []) {
    const plan=faceBracketPlan(comps,modules,params,mod,opts);
    if (!plan?.ok) continue;
    extras.adapters.push({moduleId:mod.id,connectionId:`connection:${mod.id}`,kind:'bracket-m3',
      hostCompId:plan.host.compId,hostPartName:plan.host.kind==='frame'?`${plan.host.moduleId}-frame`:null,
      childPart:plan.child.kind==='frame'?`${mod.id}-frame`:plan.child.compId,
      holesPerFlange:plan.physical.length,holeDiameterMm:plan.spec.diameter,physical:plan.physical,spec:plan.spec});
    for(const [surface,holes] of [[plan.host,plan.hostHoles],[plan.child,plan.childHoles]]) {
      if(surface.kind==='frame') {
        const nodes=holes.map(p=>({...p,holeDiameterMm:p.diameterMm,holeLayer:'ADAPTER_HOLE',outlineExempt:true}));
        const owner=modules.find(m=>m.id===surface.moduleId);
        if(owner?.mount) (extras.frameNodes[surface.moduleId] ||= []).push(...nodes);
        else extras.worldFrameNodes.push(...nodes);
      } else if(surface.body?.kind==='bar') {
        const c=comps.find(c=>c.id===surface.compId),a=c.p1,b=c.p2,len=Math.hypot(b.x-a.x,b.y-a.y);
        if(!len) continue;
        (extras.linkHoles[c.id] ||= []).push(...holes.map(p=>({...p,u:((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/len,v:((p.y-a.y)*(b.x-a.x)-(p.x-a.x)*(b.y-a.y))/len,diameterMm:p.diameterMm})));
      } else if(surface.body?.kind==='triangle') {
        (extras.plateHoles[surface.compId] ||= []).push(...holes.map(p=>({...p,x:p.x,y:p.y,diameterMm:p.diameterMm})));
      }
    }
  }
  return extras;
}

/** Read-only diagnosis also covers older placements without confirmed drilling. */
export function faceBracketStatus(comps, modules, params, mod, opts={}) {
  const confirmed=faceBracketPlan(comps,modules,params,mod,opts);
  if(confirmed)return {fixed:confirmed.ok,reason:confirmed.ok?`角碼 ${confirmed.brackets.length} 顆 · 兩板固定孔已生成 Ø3.2 mm`:`角碼孔暫停輸出：${confirmed.reason}`};
  if(!mod?.mount?.face)return {fixed:false,reason:'尚未設定接合面'};
  const descriptor=readConnectionDescriptor({comps,modules,childId:mod.id,mount:mod.mount});
  if(!descriptor.capabilities.drilling)return {fixed:false,reason:descriptor.diagnostics[0]?.message || '找不到支援開孔的接合板',diagnostics:descriptor.diagnostics};
  const selection=mod.mount.face.selection;
  const candidate={...mod,mount:{...mod.mount,face:{...mod.mount.face,selection:{...selection,brackets:{enabled:true,childPart:descriptor.child.partId,offsets:{}}}}}};
  const plan=faceBracketPlan(comps,modules.map(m=>m.id===mod.id?candidate:m),params,candidate,opts);
  return {fixed:false,reason:plan?.ok?'此位置可配置角碼，尚未確認生成固定孔。':`無法配置角碼：${plan?.reason || '找不到接合板，請重新選面'}`};
}
