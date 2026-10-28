/** External files with new machining semantics must not silently load in old readers.
 * Internal undo snapshots stay editable v1 records. The old reader requires top-level
 * comps, so this explicit envelope fails closed there instead of discarding face v2.
 */
export function storedProject(snapshot){
  if(snapshot?.kind==='blocks-envelope')return snapshot;
  const requires=[];
  if(snapshot?.modules?.some(m=>m.mount?.face?.selection?.fastener))requires.push('tab-nut-m3-v1');
  if(snapshot?.comps?.some(c=>c.boxPanel))requires.push('box-panel-v1');
  // Older readers would drop extra joint sets and lid closures.
  if(snapshot?.modules?.some(m=>m.mount?.face?.selection?.fastener?.moreAlongMm)||snapshot?.comps?.some(c=>c.boxPanel?.closures))requires.push('tab-nut-sets-v1');
  return requires.length?{kind:'blocks-envelope',v:1,requires,project:snapshot}:snapshot;
}
export function readStoredProject(value){
  if(value?.kind!=='blocks-envelope')return value;
  if(value.v!==1||!Array.isArray(value.requires)||!value.requires.length||value.requires.some(k=>!['tab-nut-m3-v1','box-panel-v1','tab-nut-sets-v1'].includes(k))||!Array.isArray(value.project?.comps)||!['blocks','blocks-composite'].includes(value.project.kind))return null;
  return value.project;
}
