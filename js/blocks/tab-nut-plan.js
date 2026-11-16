/** Adapter from persisted connections to the shared laser geometry plan. */
import {buildMountSurfaces,findMountSurface} from './mount-surfaces.js';
import {planTabNutGeometry,ringDistance} from './tab-nut-geometry.js';
import {isFixedMountPart} from './part-types.js';
import {readConnectionDescriptor} from './connection-descriptor.js';
import {planActualTabContact,actualTabContact,relativeTabFace} from './tab-nut-contact.js';
import {boxPanelGeometry} from '../plugins/box-maker/box-contract.js';

export const hasTabNut=modules=>(modules||[]).some(m=>m.mount?.face?.selection?.fastener);
function rawPlan(comps,modules,params,mod,opts,over={}){
  if(!mod.mount?.face?.selection?.fastener||!over.id&&comps.find(c=>c.id===mod.mount.face.childPart)?.boxPanel?.role==='lid')return null;
  const fail=reason=>({ok:false,reason,moduleId:mod.id,connectionId:`connection:${mod.id}`});
  const d=readConnectionDescriptor({comps,modules,childId:mod.id,mount:mod.mount});
  if(!d.ok)return fail(d.diagnostics[0]?.message||'接合參照無效。');
  const parts=[d.host.partId,d.child.partId].map(id=>comps.find(c=>c.id===id));
  if(parts.some(c=>!c||!['bar','triangle'].includes(c.type)||!isFixedMountPart(c)||c.barFusion||c.barFusionRoot||c.fusedWith||c.shape==='disk'))return fail('榫槽試作只支援獨立固定桿／板；自動機架、活動件與合成件請使用其他接法。');
  const surfaces=(moduleId,partId)=>buildMountSurfaces({comps,modules,params,moduleId,partId,exportSettings:opts.exportSettings||{},thicknessMm:opts.stockMm||3,drilling:true}).surfaces||[];
  const host=findMountSurface(surfaces(d.host.moduleId),mod.mount.to),child=over.child||surfaces(mod.id,d.child.partId).find(s=>s.compId===d.child.partId);
  if(!host||!child)return fail('找不到實際接合板件。');
  const plan=mod.mount.face.selection.fastener.contactMode==='actual'?planActualTabContact({host,child,face:mod.mount.face,connectionId:over.id||d.id,settings:mod.mount.face.selection.fastener,comps,modules,params}):{...planTabNutGeometry({host,child,face:mod.mount.face,connectionId:over.id||d.id}),host,child};
  return {...plan,moduleId:mod.id};
}
export function tabNutPlans(comps,modules,params,opts={}){
  const plans=modules.map(m=>rawPlan(comps,modules,params,m,opts)).filter(Boolean);
  // Additional physical contacts do not become extra kinematic parents. Each is
  // explicitly selected in this connection's preview and retains its own sizes.
  for(const mod of modules){
    const settings=mod.mount?.face?.selection?.fastener;if(settings?.contactMode!=='actual')continue;
    const primary=plans.find(p=>p.moduleId===mod.id),childPart=mod.mount.face.childPart;
    if(!primary)continue;primary.contactTargets=[];
    const child=buildMountSurfaces({comps,modules,params,moduleId:mod.id,partId:childPart,exportSettings:opts.exportSettings||{},thicknessMm:opts.stockMm||3,drilling:true}).surfaces?.find(s=>s.compId===childPart);
    const d=readConnectionDescriptor({comps,modules,childId:mod.id,mount:mod.mount}),requested=settings.peers||[],found=new Set();
    if(child)for(const c of comps){
      if(c.moduleId===mod.id||c.id===d.host?.partId||!['bar','triangle'].includes(c.type)||!isFixedMountPart(c)||c.barFusion||c.barFusionRoot||c.fusedWith||c.shape==='disk')continue;
      const face=relativeTabFace(modules,c.moduleId,mod.id,comps);if(!face)continue;
      const host=buildMountSurfaces({comps,modules,params,moduleId:c.moduleId,partId:c.id,exportSettings:opts.exportSettings||{},thicknessMm:opts.stockMm||3,drilling:true}).surfaces?.find(s=>s.compId===c.id);
      if(!host||!actualTabContact(host,child,face))continue;
      const peer=requested.find(p=>p.moduleId===c.moduleId&&p.partId===c.id),m=modules.find(m=>m.id===c.moduleId),siblings=modules.filter(x=>x.name===m?.name),label=(m?.name||c.moduleId)+(siblings.length>1?' '+(siblings.indexOf(m)+1):'');
      primary.contactTargets.push({moduleId:c.moduleId,partId:c.id,label,selected:!!peer});found.add(c.moduleId+'/'+c.id);
      if(peer)plans.push({...planActualTabContact({host,child,face,connectionId:`connection:${mod.id}/peer:${c.id}`,settings:peer.settings,comps,modules,params}),moduleId:mod.id,peer:{moduleId:c.moduleId,partId:c.id}});
    }
    for(const peer of requested)if(!found.has(peer.moduleId+'/'+peer.partId))plans.push({ok:false,moduleId:mod.id,connectionId:`connection:${mod.id}/peer:${peer.partId}`,reason:'額外榫接板件已不存在或不再貼合；請取消該處榫接或修改定位。'});
  }
  // Lid closure joints are derived (fabrication only); the side outline already carries its base-end tabs.
  for(const lid of comps)for(const [role,face] of Object.entries(lid.boxPanel?.closures||{})){
    const side=comps.find(c=>c.boxPanel?.rootPart===lid.boxPanel.rootPart&&c.boxPanel.role===role),mod=modules.find(m=>m.id===side?.moduleId),low=plans.find(q=>q.child?.compId===side?.id),g=low?.childGeometry;
    if(mod&&low?.ok)plans.push({...rawPlan(comps,modules,params,{...mod,mount:{to:{module:lid.moduleId,output:'panel'},face}},opts,{id:`connection:${mod.id}/lid`,child:{...low.child,outlines:g.outlines,outline:g.outlines[0]}})||{ok:false,reason:'上蓋接合無效。'},moduleId:lid.moduleId});
  }
  for(let i=0;i<plans.length;i++)for(let j=i+1;j<plans.length;j++){
    const a=plans[i],b=plans[j];if(!a.ok||!b.ok)continue;
    for(const ak of ['host','child'])for(const bk of ['host','child'])if(a[ak].compId===b[bk].compId&&a.features[ak].some(r=>b.features[bk].some(s=>ringDistance(r,s)<Math.max(a.settings.minWebMm,b.settings.minWebMm)))){
      a.ok=b.ok=false;a.reason=b.reason='榫槽與另一筆接合太近；請移動接合位置。';
    }
    // One owner per edge of a child plate.
    if(a.child.compId===b.child.compId&&a.edgeKey===b.edgeKey){a.ok=b.ok=false;a.reason=b.reason='同一立板暫只支援一筆榫槽外框修改。';}
  }
  return plans;
}
export function appendTabNutFeatures(extras,comps,modules,params,opts={}){
  const plans=tabNutPlans(comps,modules,params,opts);extras.tabNutPlans=plans;extras.tabNutGeometry={};
  for(const plan of plans){
    if(plan.ok)for(const role of ['host','child']){
      const id=plan[role].compId,oldHoles=[...(extras.linkHoles[id]||[]),...(extras.plateHoles[id]||[])];
      if(oldHoles.some(h=>(plan.features[role]||[]).some(r=>ringDistance(r,Array.from({length:24},(_,i)=>({x:h.x+((h.diameterMm||3.2)/2+.02)*Math.cos(i*Math.PI/12),y:h.y+((h.diameterMm||3.2)/2+.02)*Math.sin(i*Math.PI/12)})))<plan.settings.minWebMm))){plan.ok=false;plan.reason='角碼／轉接孔與榫槽太近，請保留材料強度所需的間距。';}
    }
    if(!plan.ok){(extras.diagnostics||=[]).push({status:'fail',code:'tab_nut_invalid',moduleId:plan.moduleId,reason:plan.reason});continue;}
    for(const role of ['host','child']){
      const surface=plan[role],id=surface.compId,g=structuredClone(plan[`${role}Geometry`]);
      let existing=extras.tabNutGeometry[id];
      if(!existing){existing={outlines:structuredClone(surface.outlines),holes:structuredClone(surface.holes||[]),cutouts:structuredClone(surface.cutouts||[]),addedHoles:[],addedCutouts:[],omittedHoleIds:[]};extras.tabNutGeometry[id]=existing;}
      if(role==='child'&&!existing.editedEdges){existing.outlines=g.outlines;existing.editedEdges=1;}
      else if(role==='child'){
        const edit=plan.edgeEdit,ring=existing.outlines[0],same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-5;
        const i=edit?ring.findIndex((a,i)=>same(a,edit.a)&&same(ring[(i+1)%ring.length],edit.b)):-1;
        if(i<0){plan.ok=false;plan.reason='同一板邊的榫形修改互相衝突，請調整榫接設定。';(extras.diagnostics||=[]).push({status:'fail',code:'tab_nut_invalid',moduleId:plan.moduleId,reason:plan.reason});continue;}
        const merged=[...ring.slice(0,i),...edit.path,...ring.slice(i+2)];if(same(merged[0],merged.at(-1)))merged.pop();existing.outlines=[merged,...existing.outlines.slice(1)];existing.editedEdges++;
      }
      const omitted=new Set(plan.omittedHoles?.[role]||[]);existing.omittedHoleIds.push(...omitted);existing.holes=existing.holes.filter(h=>!omitted.has(h.id));
      const holes=g.holes.filter(h=>!surface.holes.some(b=>b.id===h.id&&b.x===h.x&&b.y===h.y)),cuts=g.cutouts.filter(c=>!surface.cutouts?.some(b=>b.id===c.id));
      existing.holes.push(...holes);existing.cutouts.push(...cuts);existing.addedHoles.push(...holes);existing.addedCutouts.push(...cuts);
      for(const h of [...(extras.linkHoles[id]||[]),...(extras.plateHoles[id]||[])])if(!existing.holes.some(p=>p.id===h.id))existing.holes.push({...h,r:(h.diameterMm||3.2)/2});
    }
  }
  return extras;
}
/** Export geometry is expressed in the module's home XY; bar catalogs use p1-local XY. */
export function tabNutPartGeometry(extras,comp,{local=false}={}){
  let raw=extras?.tabNutGeometry?.[comp.id];
  if(!raw && comp.boxPanel){
    const g=boxPanelGeometry(comp);if(!g)return null;if(local)return g;
    const a=comp.p1,b=comp.p2,t=Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(t),s=Math.sin(t);
    raw={...g,outlines:g.outlines.map(r=>r.map(p=>({x:a.x+p.x*c-p.y*s,y:a.y+p.x*s+p.y*c})))};
  }
  if(!raw)return null;
  const g=structuredClone(raw);if(!local)return g;
  const a=comp.p1,b=comp.p2,t=Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(t),s=Math.sin(t),move=p=>({x:(p.x-a.x)*c+(p.y-a.y)*s,y:-(p.x-a.x)*s+(p.y-a.y)*c});
  return {...g,outlines:g.outlines.map(r=>r.map(move)),holes:g.holes.map(h=>({...h,...move(h)})),cutouts:g.cutouts.map(h=>({...h,points:h.points.map(move)}))};
}
