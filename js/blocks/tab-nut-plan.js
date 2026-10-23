/** Adapter from persisted connections to the shared laser geometry plan. */
import {buildMountSurfaces,findMountSurface} from './mount-surfaces.js';
import {planTabNutGeometry,ringDistance} from './tab-nut-geometry.js';
import {isFixedMountPart} from './part-types.js';
import {readConnectionDescriptor} from './connection-descriptor.js';

export const hasTabNut=modules=>(modules||[]).some(m=>m.mount?.face?.selection?.fastener);
function rawPlan(comps,modules,params,mod,opts){
  if(!mod.mount?.face?.selection?.fastener)return null;
  const fail=reason=>({ok:false,reason,moduleId:mod.id,connectionId:`connection:${mod.id}`});
  const d=readConnectionDescriptor({comps,modules,childId:mod.id});
  if(!d.ok)return fail(d.diagnostics[0]?.message||'接合參照無效。');
  const parts=[d.host.partId,d.child.partId].map(id=>comps.find(c=>c.id===id));
  if(parts.some(c=>!c||!['bar','triangle'].includes(c.type)||!isFixedMountPart(c)||c.barFusion||c.barFusionRoot||c.fusedWith))return fail('榫槽試作只支援獨立固定桿／板；自動機架、活動件與合成件請使用其他接法。');
  const surfaces=(moduleId,partId)=>buildMountSurfaces({comps,modules,params,moduleId,partId,exportSettings:opts.exportSettings||{},thicknessMm:opts.stockMm||3,drilling:true}).surfaces||[];
  const host=findMountSurface(surfaces(d.host.moduleId),mod.mount.to),child=surfaces(mod.id,d.child.partId).find(s=>s.compId===d.child.partId);
  if(!host||!child)return fail('找不到實際接合板件。');
  return {...planTabNutGeometry({host,child,face:mod.mount.face,connectionId:d.id}),host,child,moduleId:mod.id};
}
export function tabNutPlans(comps,modules,params,opts={}){
  const plans=modules.map(m=>rawPlan(comps,modules,params,m,opts)).filter(Boolean);
  for(let i=0;i<plans.length;i++)for(let j=i+1;j<plans.length;j++){
    const a=plans[i],b=plans[j];if(!a.ok||!b.ok)continue;
    for(const ak of ['host','child'])for(const bk of ['host','child'])if(a[ak].compId===b[bk].compId&&a.features[ak].some(r=>b.features[bk].some(s=>ringDistance(r,s)<Math.max(a.settings.minWebMm,b.settings.minWebMm)))){
      a.ok=b.ok=false;a.reason=b.reason='榫槽與另一筆接合太近；請移動接合位置。';
    }
    // Outer-edge edits are deliberately single-owner until multi-edge composition is verified.
    if(a.child.compId===b.child.compId){a.ok=b.ok=false;a.reason=b.reason='同一立板暫只支援一筆榫槽外框修改。';}
  }
  return plans;
}
export function appendTabNutFeatures(extras,comps,modules,params,opts={}){
  const plans=tabNutPlans(comps,modules,params,opts);extras.tabNutPlans=plans;extras.tabNutGeometry={};
  for(const plan of plans){
    if(plan.ok)for(const role of ['host','child']){
      const id=plan[role].compId,oldHoles=[...(extras.linkHoles[id]||[]),...(extras.plateHoles[id]||[])];
      if(oldHoles.length){plan.ok=false;plan.reason='榫槽板上另有角碼／轉接孔；本版請改選獨立板件。';}
    }
    if(!plan.ok){(extras.diagnostics||=[]).push({status:'fail',code:'tab_nut_invalid',moduleId:plan.moduleId,reason:plan.reason});continue;}
    for(const role of ['host','child']){
      const id=plan[role].compId,g=structuredClone(plan[`${role}Geometry`]);
      const existing=extras.tabNutGeometry[id];
      if(existing){
        if(role==='child'){g.holes.push(...existing.addedHoles);g.cutouts.push(...existing.addedCutouts);extras.tabNutGeometry[id]={...g,addedHoles:existing.addedHoles,addedCutouts:existing.addedCutouts};}
        else{const holes=g.holes.slice(plan.host.holes.length),cuts=g.cutouts.slice((plan.host.cutouts||[]).length);existing.holes.push(...holes);existing.cutouts.push(...cuts);existing.addedHoles.push(...holes);existing.addedCutouts.push(...cuts);}
      }else extras.tabNutGeometry[id]={...g,addedHoles:role==='host'?g.holes.slice(plan.host.holes.length):[],addedCutouts:role==='host'?g.cutouts.slice((plan.host.cutouts||[]).length):[]};
    }
  }
  return extras;
}
/** Export geometry is expressed in the module's home XY; bar catalogs use p1-local XY. */
export function tabNutPartGeometry(extras,comp,{local=false}={}){
  const raw=extras?.tabNutGeometry?.[comp.id];if(!raw)return null;
  const g=structuredClone(raw);if(!local)return g;
  const a=comp.p1,b=comp.p2,t=Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(t),s=Math.sin(t),move=p=>({x:(p.x-a.x)*c+(p.y-a.y)*s,y:-(p.x-a.x)*s+(p.y-a.y)*c});
  return {...g,outlines:g.outlines.map(r=>r.map(move)),holes:g.holes.map(h=>({...h,...move(h)})),cutouts:g.cutouts.map(h=>({...h,points:h.points.map(move)}))};
}
