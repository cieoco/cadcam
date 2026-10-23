/** External files with new machining semantics must not silently load in old readers.
 * Internal undo snapshots stay editable v1 records. The old reader requires top-level
 * comps, so this explicit envelope fails closed there instead of discarding face v2.
 */
export function storedProject(snapshot){
  if(snapshot?.kind==='blocks-envelope')return snapshot;
  if(!snapshot?.modules?.some(m=>m.mount?.face?.selection?.fastener))return snapshot;
  return {kind:'blocks-envelope',v:1,requires:['tab-nut-m3-v1'],project:snapshot};
}
export function readStoredProject(value){
  if(value?.kind!=='blocks-envelope')return value;
  if(value.v!==1||!Array.isArray(value.requires)||value.requires.length!==1||value.requires[0]!=='tab-nut-m3-v1'||!Array.isArray(value.project?.comps)||!['blocks','blocks-composite'].includes(value.project.kind))return null;
  return value.project;
}
