/** External files with new machining semantics must not silently load in old readers.
 * Internal undo snapshots stay editable v1 records. The old reader requires top-level
 * comps, so this explicit envelope fails closed there instead of discarding face v2.
 */
/** M2 (docs/SDD-MOTOR-PART.md): a motor part of the new shape = type 'motor' with a motor number and no legacy physicalMotor/motorMount. Same test as motor-part.js isMotorPart, kept here so startup need not load the converter. */
export const isMotorPartShape=c=>!!c&&c.type==='motor'&&c.motor!==undefined&&c.physicalMotor===undefined&&c.motorMount===undefined;
export const hasMotorParts=work=>Array.isArray(work?.comps)&&work.comps.some(isMotorPartShape);
let motorIO=null;
/** The converter (motor-part-io.js -> motor-part.js) is loaded on demand: open paths await this before normalizeSnapshot, the writer before storedProject. */
export async function loadMotorPartIO(){return motorIO??(motorIO=await import('./motor-part-io.js'));}
/** Open paths call this with the raw parsed file / share payload before normalizeSnapshot, so the sync reader below can convert motor parts. */
export async function prepareMotorParts(raw){if(hasMotorParts(raw?.kind==='blocks-envelope'?raw.project:raw))await loadMotorPartIO();}
export function storedProject(snapshot){
  if(snapshot?.kind==='blocks-envelope')return snapshot;
  const requires=[];
  if(snapshot?.comps?.some(c=>c.type==='motor'||c.motorMount?.partId))requires.push('independent-motor-v1');
  if(snapshot?.modules?.some(m=>m.mount?.face?.selection?.fastener))requires.push('tab-nut-m3-v1');
  if(snapshot?.comps?.some(c=>c.boxPanel))requires.push('box-panel-v1');
  // Older readers would drop extra joint sets and lid closures.
  if(snapshot?.modules?.some(m=>m.mount?.face?.selection?.fastener?.moreAlongMm)||snapshot?.comps?.some(c=>c.boxPanel?.closures))requires.push('tab-nut-sets-v1');
  if(hasMotorParts(snapshot))requires.push('motor-part-v2');
  return requires.length?{kind:'blocks-envelope',v:1,requires,project:snapshot}:snapshot;
}
function motorPartsToLegacy(project){
  if(!hasMotorParts(project))return project;
  if(!motorIO)throw Error('作品含馬達零件，但轉換器尚未載入');
  return motorIO.readMotorParts(project);
}
export function readStoredProject(value){
  if(value?.kind!=='blocks-envelope')return motorPartsToLegacy(value);
  if(value.v!==1||!Array.isArray(value.requires)||!value.requires.length||value.requires.some(k=>!['tab-nut-m3-v1','box-panel-v1','tab-nut-sets-v1','independent-motor-v1','motor-part-v2'].includes(k))||!Array.isArray(value.project?.comps)||!['blocks','blocks-composite'].includes(value.project.kind))return null;
  return motorPartsToLegacy(value.project);
}
