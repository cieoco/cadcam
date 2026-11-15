import {planMemberFrame} from './member-frame.js';
/** A single rigid plate has no internal motion: its two existing holes define its local assembly frame. */
export function prepareDesignPlacement(work,id){
  const mod=work.modules.find(m=>m.id===id),own=work.comps.filter(c=>c.moduleId===id);
  if(!mod)return {ok:false,reason:'找不到設計'};
  if(mod.base||own.length!==1||!['bar','triangle'].includes(own[0].type))return {ok:true,...work};
  const plan=planMemberFrame({comps:own,params:work.topo.params,id:own[0].id});
  if(!plan.ok)return {ok:false,reason:plan.message};
  return {...work,ok:true,comps:work.comps.map(c=>c.moduleId===id?plan.comps.find(p=>p.id===c.id):c),modules:work.modules.map(m=>m.id===id?{...m,base:own[0].p1.id}:m)};
}
