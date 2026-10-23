/** Atomic box changes. All returned data is a draft until the caller commits. */
import {checkedBox} from './box-generator.js';
import {BOX_ROLES,boxPanelSize,normalizeBoxSettings} from './box-config.js';
import {instantiateComposite,COMPOSITE_MAX_MODULES} from './module-ops.js';

export async function planBoxChange(source,settings,{rootPart=null}={}){
 source={...source,modules:source.modules || []};
 const fail=reason=>({ok:false,reason}),params=source.params || source.topo?.params || {};
 if(!normalizeBoxSettings(settings))return fail('請輸入有效尺寸：內長／寬 60–400、高 25–120、板厚 2.5–3.5 mm。');
 const base=rootPart && source.comps.find(c=>c.id===rootPart && c.boxPanel?.role==='base');
 let options={},prior=[];
 if(rootPart){
  if(!base)return fail('找不到這個盒體，請重新開啟。');
  prior=source.comps.filter(c=>c.boxPanel?.rootPart===rootPart);
  if(prior.length!==5||BOX_ROLES.some(role=>prior.filter(c=>c.boxPanel.role===role).length!==1))return fail('盒體板件已拆改，請建立新的完整盒體。');
  const mods=new Set(prior.map(c=>c.moduleId));
  if(source.comps.some(c=>mods.has(c.moduleId)&&!prior.includes(c))||source.modules.some(m=>(mods.has(m.id)&&m.mount&&!mods.has(m.mount.to.module))||(!mods.has(m.id)&&mods.has(m.mount?.to?.module))))return fail('盒體已連接其他零件；請先拆下外部接合，再修改盒體尺寸。');
  if(Math.abs(base.p2.y-base.p1.y)>1e-6||base.p2.x<=base.p1.x)return fail('盒體基準已旋轉，請先還原基準方向再修改尺寸。');
  const ids=Object.fromEntries(prior.map(c=>[c.boxPanel.role,{part:c.id,module:c.moduleId,p1:c.p1.id,p2:c.p2.id,param:c.lenParam}]));
  const newLength=boxPanelSize({role:'base',settings}).length;
  options={ids,origin:{x:base.p1.x+newLength/2,y:base.p1.y}};
 }else if(source.modules.length+5>COMPOSITE_MAX_MODULES)return fail(`作品最多 ${COMPOSITE_MAX_MODULES} 個設計；新增盒體需要 5 個。`);
 const preview=await checkedBox(settings,options);
 if(!preview.ok||!preview.saveable)return fail(preview.reason || '這組尺寸無法通過板件／五金檢查，請調整榫距或螺絲長度。');
 let added={comps:preview.work.comps,modules:preview.work.modules,params:preview.work.params,counter:source.counter || 0};
 if(!base){
  const tokens=new Set(),visit=v=>{if(typeof v==='string')tokens.add(v);else if(v&&typeof v==='object')Object.values(v).forEach(visit);};visit(source);
  const right=Math.max(0,...source.comps.flatMap(c=>[c.p1?.x,c.p2?.x,c.p3?.x].filter(Number.isFinite)));
  added=instantiateComposite({kind:'blocks-composite',...added},{counter:source.counter || 0,existingTokens:tokens,place:{x:source.comps.length?right+100:0,y:0}});
 }else{
  added.comps=added.comps.map(c=>({...c,stock:{...c.stock,material:prior.find(old=>old.id===c.id)?.stock?.material || 'unspecified'}}));
  added.modules=added.modules.map(m=>({...m,name:source.modules.find(old=>old.id===m.id)?.name || m.name}));
 }
 const merge=(original,replacements)=>base?original.map(item=>replacements.find(r=>r.id===item.id)||item):[...original,...replacements];
 const ownedParams=Object.fromEntries(added.comps.map(c=>[c.lenParam,added.params[c.lenParam]]));
 const work={...structuredClone(source),comps:merge(source.comps,added.comps),modules:merge(source.modules,added.modules),params:{...params,...ownedParams},counter:Math.max(source.counter || 0,added.counter)};
 // A draft is a snapshot, not a second mutable topology object with stale params.
 delete work.topo;
 if(Array.isArray(source.assemblyMembers))work.assemblyMembers=[...new Set([...source.assemblyMembers,...added.modules.map(m=>m.id)])];
 const root=added.comps.find(c=>c.boxPanel.role==='base');
 return {ok:true,work,preview,rootPart:root.id,rootModule:root.moduleId};
}
