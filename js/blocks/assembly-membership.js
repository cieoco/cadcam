// 單一作品內的組立成員；缺欄位的舊檔保留全部設計。沒有外部檔案引用。
export function designIds(comps=[], modules=[]) {
  const ids=modules.map(m=>m.id);
  if(comps.some(c=>!c.moduleId || !ids.includes(c.moduleId)))ids.push('#root');
  return ids;
}
export function assemblyFamily(modules, id) {
  if(id==='#root')return ['#root'];
  const ids=new Set([id]);
  for(let n=0;n<modules.length;n++)for(const m of modules){
    const parent=m.mount?.to?.module;
    if(parent && modules.some(x=>x.id===parent) && (ids.has(m.id)||ids.has(parent))){ids.add(m.id);ids.add(parent);}
  }
  return [...ids];
}
export function normalizeAssemblyMembers(value, comps, modules) {
  const known=designIds(comps,modules);
  if(!Array.isArray(value))return undefined;
  const selected=new Set(value.filter(id=>known.includes(id)).flatMap(id=>assemblyFamily(modules,id)));
  return known.filter(id=>selected.has(id));
}
export function assemblyWork(comps,modules,topo={}) {
  const members=normalizeAssemblyMembers(topo.assemblyMembers,comps,modules);
  if(!members)return {comps,modules};
  const active=new Set(members),known=new Set(modules.map(m=>m.id));
  return {comps:comps.filter(c=>active.has(known.has(c.moduleId)?c.moduleId:'#root')),modules:modules.filter(m=>active.has(m.id))};
}
export function changeAssemblyMembership(comps,modules,topo,id,include) {
  const known=designIds(comps,modules);
  if(!known.includes(id))return {ok:false,reason:'找不到這個設計'};
  const family=assemblyFamily(modules,id);
  const selected=new Set(normalizeAssemblyMembers(topo.assemblyMembers,comps,modules) ?? known);
  family.forEach(key=>include?selected.add(key):selected.delete(key));
  return {ok:true,members:known.filter(key=>selected.has(key)),affected:family};
}
// 組立候選只修改參與的設計；提交時把保留在作品裡的其他圖稿接回，維持原順序。
export function mergeAssemblyWork(comps,modules,topo,next) {
  const active=assemblyWork(comps,modules,topo);
  const merge=(all,prior,after)=>{
    const oldIds=new Set(prior.map(x=>x.id)),allIds=new Set(all.map(x=>x.id)),byId=new Map(after.map(x=>[x.id,x]));
    return all.flatMap(x=>oldIds.has(x.id)?(byId.has(x.id)?[byId.get(x.id)]:[]):[x]).concat(after.filter(x=>!allIds.has(x.id)));
  };
  return {...next,comps:merge(comps,active.comps,next.comps),modules:merge(modules,active.modules,next.modules)};
}
