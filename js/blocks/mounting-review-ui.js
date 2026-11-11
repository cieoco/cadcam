import {planActuatorPlateHoles} from './actuator-plate-holes.js';
/** One review for both pointer and numeric candidates. No undo/write before acceptance. */
import {inspectMountingChange} from './mounting-review.js';
import {integrityGate} from './integrity-gate.js';

export const mountingWork=S=>({comps:S.comps,modules:S.modules,params:S.topo.params,fabrication:S.fabrication});
/** Focused editors replace only their design; review the same complete work that will be saved. */
export function mountingCandidate(before,result,scope){
  const ids=new Set(scope.map(c=>c.id));
  return {...before,comps:[...before.comps.filter(c=>!ids.has(c.id)),...result.comps],params:{...before.params,...result.params},fabrication:result.fabrication||before.fabrication};
}
/** Adapter for existing synchronous editors: mutate a clone, review, then one undo/write. */
export function commitMountingEdit(S,mutate,{pushUndo,notify}={}){
  const before=mountingWork(S),candidate=structuredClone(before);
  if(mutate(candidate)===false)return false;
  // 修改前就有的座板問題（例如馬達軸心離開原孔）不擋不相干的修改；只擋這次新造成的。
  const platePlan=planActuatorPlateHoles(candidate);if(platePlan.ok)candidate.comps=platePlan.comps;else if(planActuatorPlateHoles(before).ok){notify?.(platePlan.message);return false;}
  if(!confirmMountingChange(before,candidate,{notify}))return false;
  pushUndo();
  // Keep selected-component references used by the existing panels, after approval only.
  const originals=new Map(S.comps.map(c=>[c.id,c]));
  S.comps=candidate.comps.map(c=>{const old=originals.get(c.id);if(!old)return c;Object.keys(old).forEach(k=>delete old[k]);return Object.assign(old,c);});
  S.modules=candidate.modules;S.topo.params=candidate.params;
  return true;
}
/** Compatibility adapter for geometry helpers still reading S. No render/save/undo inside mutate. */
export function commitLegacyMountingEdit(S,mutate,options){
  return commitMountingEdit(S,draft=>{
    const saved={comps:S.comps,modules:S.modules,topo:S.topo};
    S.comps=draft.comps;S.modules=draft.modules;S.topo={...saved.topo,params:draft.params};
    try{if(mutate()===false)return false;draft.comps=S.comps;draft.modules=S.modules;draft.params=S.topo.params;}finally{Object.assign(S,saved);}
  },options);
}

export function confirmMountingChange(before,after,{ask=message=>window.confirm(message),notify=message=>window.alert(message)}={}){
  if(!integrityGate(before,after,notify))return false;
  let review;
  try{review=inspectMountingChange(before,after);}catch(e){notify(`無法核對固定孔位：${e.message}`);return false;}
  if(!review.ok){notify(review.issues.join('\n'));return false;}
  if(!review.changes.length)return true;
  const names=[...new Set(review.changes.map(c=>c.label))].join('、');
  return ask(`${names}與原固定孔位不一致。\n是否更新對應的固定孔位？\n\n確定：一起更新安裝與孔位，可一次復原。\n取消：保留原孔位，返回調整。\n已加工的板件不會因此自動改孔。`);
}
