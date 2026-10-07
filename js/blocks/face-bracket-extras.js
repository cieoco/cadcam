/** Recompute confirmed drilling against current stock; stale/invalid plans produce no holes. */
import { buildMountSurfaces } from './mount-surfaces.js';
import { planFaceBrackets, FACE_BRACKET_SPEC } from './face-bracket-geometry.js';

function rawPlan(comps, modules, params, mod, opts={}) {
  if (!mod?.mount?.face?.selection?.brackets?.enabled) return null;
  const surfaces=(id,partId)=>buildMountSurfaces({comps,modules,params,moduleId:id,partId,exportSettings:opts.exportSettings || {},thicknessMm:opts.stockMm || 3,drilling:true}).surfaces || [];
  const host=surfaces(mod.mount.to.module).find(s=>s.outputId===mod.mount.to.output);
  const part=mod.mount.face.selection.brackets.childPart, own=surfaces(mod.id,part);
  const child=own.find(s=>part && part!=='frame'?s.compId===part:s.kind==='frame');
  if (!host || !child || host.body?.kind==='rack' || child.body?.kind==='rack') return {ok:false,reason:'找不到支援開孔的接合板'};
  return {...planFaceBrackets(host,child,mod.mount.face,mod.mount.face.selection.brackets.offsets),host,child};
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
        if(surface.moduleId===target.moduleId && surface.compId===target.compId && holes.some(h=>existing.some(q=>Math.hypot(h.x-q.x,h.y-q.y)<FACE_BRACKET_SPEC.diameter+FACE_BRACKET_SPEC.web)))
          return {...plan,ok:false,reason:'孔位與另一組角碼太接近',hostHoles:[],childHoles:[]};
      }
    }
  }
  return plan;
}

export function appendFaceBracketHoles(extras, comps, modules, params, opts={}) {
  for(const mod of modules || []) {
    const plan=faceBracketPlan(comps,modules,params,mod,opts);
    if (!plan?.ok) continue;
    for(const [surface,holes] of [[plan.host,plan.hostHoles],[plan.child,plan.childHoles]]) {
      if(surface.kind==='frame') {
        const nodes=holes.map((p,i)=>({id:`BRK_${mod.id}_${surface.moduleId}_${i}`,x:p.x,y:p.y,holeDiameterMm:FACE_BRACKET_SPEC.diameter,holeLayer:'ADAPTER_HOLE',outlineExempt:true}));
        const owner=modules.find(m=>m.id===surface.moduleId);
        if(owner?.mount) (extras.frameNodes[surface.moduleId] ||= []).push(...nodes);
        else extras.worldFrameNodes.push(...nodes);
      } else if(surface.body?.kind==='bar') {
        const c=comps.find(c=>c.id===surface.compId),a=c.p1,b=c.p2,len=Math.hypot(b.x-a.x,b.y-a.y);
        if(!len) continue;
        (extras.linkHoles[c.id] ||= []).push(...holes.map(p=>({u:((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/len,v:((p.y-a.y)*(b.x-a.x)-(p.x-a.x)*(b.y-a.y))/len,diameterMm:FACE_BRACKET_SPEC.diameter})));
      } else if(surface.body?.kind==='triangle') {
        (extras.plateHoles[surface.compId] ||= []).push(...holes.map(p=>({x:p.x,y:p.y,diameterMm:FACE_BRACKET_SPEC.diameter})));
      }
    }
  }
  return extras;
}
