/** 馬達與接地的單一答案（SDD-CONNECTION-INTEGRITY 3.1）：relations.js 與啟動路徑共用。 */
import {pointKeysFor} from './part-types.js';
const str = v => typeof v === 'string' && v !== '';
export const isGroundPoint = p => !!p && ['fixed', 'motor', 'linear'].includes(p.type);
/** 規範化的馬達關係，每個擁有者一筆；sources 記每個欄位從哪裡來。 */
export const motorRecords = comps => comps.flatMap(c => {
  const m = c.motorMount && typeof c.motorMount === 'object' ? c.motorMount : null, part = c.type === 'motor';
  const on = pointKeysFor(c).map(k => c[k]).find(p => str(p?.id) && p.physicalMotor != null && p.physicalMotor !== '');
  if (!(part || c.physicalMotor != null || m || (on && (c.isInput || c.motorType || c.type === 'gear' || on.type === 'motor')))) return [];
  const [motor, from] = c.physicalMotor != null ? [c.physicalMotor, 'physicalMotor'] : m?.motor != null ? [m.motor, 'motorMount.motor']
    : on ? [on.physicalMotor, 'point.physicalMotor'] : [1, 'default'];
  const [centerId, center] = str(m?.center) ? [m.center, 'motorMount.center'] : part ? [c.p1?.id ?? null, 'p1'] : on ? [on.id, 'point.physicalMotor'] : [null, 'none'];
  return [{ownerId: c.id, motor: String(motor), type: c.motorType || m?.type || 'tt', centerId,
    carrierId: str(c.motorCarrier) ? c.motorCarrier : null, frameBodyId: str(m?.frameBody) ? m.frameBody : null,
    partId: str(m?.partId) ? m.partId : null, mountPointId: str(c.motorMountPoint) ? c.motorMountPoint : null,
    isInput: !!c.isInput, phaseOffset: Number(c.phaseOffset) || 0, independent: part, sources: {motor: from, center}}];
});
/** 以零件 id 或軸心點 id 查馬達關係；無則 null。 */
export const motorRecordOf = (records, id) => records.find(r => r.ownerId === id) || records.find(r => r.centerId === id) || null;
export const motorOfComps = (comps, id) => motorRecordOf(motorRecords(comps), id);
