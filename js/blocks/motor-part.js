/**
 * 馬達是獨立零件（docs/SDD-MOTOR-PART.md，M0）：舊形狀 <-> 馬達零件形狀的純轉換器。
 * 純函式，不碰 DOM、不碰 S；M0 不接進程式（app 的任何模組都還沒有 import 這個檔案）。
 *
 * ── 目標形狀（M0 定案）──────────────────────────────────────────────
 * 一顆馬達一個零件，放在 comps 裡：
 *   {
 *     id,                       // 驅動件有 motorMount.partId 時沿用它；否則 `Motor.<軸心 id>`（撞名加 `.2`、`.3`…）。獨立馬達沿用原 id。
 *     type: 'motor',
 *     motorType: 'tt'|'n20'|'mg995',
 *     motor: '1',               // 馬達編號（字串）
 *     p1: {id, x, y, type, …},  // 軸心。裝在座板上時 id＝座板孔 id。點上不再有 physicalMotor。
 *                               // 驅動件的馬達：只有 {id,x,y,type}（座標取自輸出件上的軸心點，不改它）；獨立馬達：保留原 p1 的其他欄位（frameStock 等）。
 *     mount?: {                 // 只有舊資料有寫才有（沒寫＝沒有，不補預設，舊檔的缺席要能原樣還原）
 *       frameBody?, face?, orientation?, angleDeg?, reversed?,   // 原 motorMount 的同名欄位
 *       carrier?,                                                // 原 motorCarrier（騎乘馬達：承載件會動）
 *     },
 *     drives?: {body, phaseOffset?},  // body＝輸出件（桿／齒輪…）id；沒有 drives＝尚未接輸出。phaseOffset 舊資料有寫才有
 *     servoStart?, servoEnd?,         // 只有 mg995
 *     moduleId?, name?, …             // 其餘欄位原樣保留（驅動件的馬達沿用輸出件的 moduleId）
 *   }
 * 輸出件（桿／齒輪／三點桿／凸輪／皮帶輪）失去：physicalMotor、motorType、motorMount、phaseOffset、motorCarrier、servoStart、servoEnd、
 * 軸心點上的 physicalMotor；`isInput` 改為 false（桿件本來就一定帶這個欄位，非輸入桿是 false）。
 * 座板的 motorMountPoint／standardBlank.mountHoles 是板子上的加工資料，不動。
 *
 * ── 不屬於 M0 範圍（原樣保留）──────────────────────────────────────
 * 活塞式輸入（bar.style==='piston'）與滑軌輸入（type:'slider' 的 isInput）是線性致動器的閥門編號，不是旋轉馬達，不轉換。
 * 找不到軸心點的輸出件、同一軸心有兩個以上帶資料的輸出件，也原樣保留（內建範例與 fixture 沒有這兩種；測試會確認）。
 *
 * ── 往返的已知差異（測試逐項列出）───────────────────────────────────
 * 1. 軸心點上的 physicalMotor「副本」：舊資料裡共用軸心 id 的其他零件有的帶、有的不帶（座板端點、地錨、三點桿…）。toMotorParts 把共用該 id 且編號相同的副本全部拿掉；
 *    toLegacy 只在擁有者（輸出件或獨立馬達）自己的軸心點補回，不補在其他零件上——補了會讓 normalizeBar 把那根桿誤判成輸入桿。
 *    所以「原本帶在非擁有者點上的副本」不會還原（它們是冗餘資料：馬達編號與擁有者一致，求解結果由測試逐點核對相同）。
 * 2. 齒輪／皮帶輪／三點桿／凸輪的零件層 physicalMotor（與軸心點上的重複，topology 只讀點）不還原；內建資料沒有，測試斷言為 0。
 * 3. 驅動件的 partId 以 id 是否以 `Motor.` 開頭判斷是否為自動編號；真實 partId（`Motor<n>`）沒有點，不會誤判。
 */
import {motorRecords} from './motor-roles.js';
import {pointKeysFor} from './part-types.js';

export const GENERATED_ID_PREFIX = 'Motor.';
/** 舊形狀中，輸出件上屬於馬達的零件層欄位（isInput 另處理）。 */
export const LEGACY_MOTOR_FIELDS = ['physicalMotor', 'motorType', 'motorMount', 'phaseOffset', 'motorCarrier', 'servoStart', 'servoEnd'];

const clone = v => structuredClone(v);
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
const isStr = v => typeof v === 'string' && v !== '';
/** 新形狀的馬達零件：有 motor 編號，且沒有舊的 physicalMotor／motorMount。 */
export const isMotorPart = c => !!c && c.type === 'motor' && c.motor !== undefined && !has(c, 'physicalMotor') && !has(c, 'motorMount');
const isLegacyIndependent = c => !!c && c.type === 'motor' && !isMotorPart(c);
const isLinearOwner = c => c?.type === 'slider' || (c?.type === 'bar' && c.style === 'piston');
const MOUNT_KEYS = ['frameBody', 'face', 'orientation', 'angleDeg', 'reversed'];
const hasData = c => !!c && (!!c.isInput || has(c, 'physicalMotor') || (c.motorMount && typeof c.motorMount === 'object'));

function usedIdsOf(comps, modules) {
  const used = new Set();
  for (const c of comps) {
    used.add(c.id);
    for (const k of pointKeysFor(c)) if (c[k]?.id) used.add(c[k].id);
    for (const h of [...(c.holes || []), ...(c.standardBlank?.mountHoles || [])]) if (h?.id) used.add(h.id);
  }
  for (const m of modules || []) if (m?.id) used.add(m.id);
  return used;
}

/** 舊形狀 -> 馬達零件形狀。輸入視為已正規化的作品（normalizeSnapshot 之後）；冪等。 */
export function toMotorParts(work) {
  const out = clone(work || {});
  const comps = Array.isArray(out.comps) ? out.comps : [];
  const legacy = comps.filter(c => !isMotorPart(c));
  const used = usedIdsOf(comps, out.modules);
  const records = motorRecords(legacy).filter(r => r.centerId && !isLinearOwner(legacy.find(c => c.id === r.ownerId)));
  const groups = new Map();
  for (const r of records) (groups.get(r.centerId) || groups.set(r.centerId, []).get(r.centerId)).push(r);
  const byId = id => comps.find(c => c.id === id);
  const centerPoint = (o, id) => pointKeysFor(o).map(k => o[k]).find(p => p?.id === id);
  const strong = rs => rs.filter(r => !r.independent && hasData(byId(r.ownerId)));
  const replace = new Map();   // 獨立馬達：原位換成新形狀
  const after = new Map();     // 驅動件的馬達：緊接在輸出件之後
  const converted = [];        // {centerId, motor, owner ids to strip}

  for (const [centerId, rs] of groups) {
    const indep = rs.find(r => r.independent);
    const st = strong(rs);
    const outs = rs.filter(r => !r.independent);
    const primary = st[0] || outs.find(r => byId(r.ownerId).type === 'gear') || outs[0] || null;
    if (st.length > 1 || (!indep && !primary) || (indep && st.length)) continue;   // 範圍外：原樣保留
    const owner = !indep && primary ? byId(primary.ownerId) : null;                 // 獨立馬達旁只有「複製點」型的擁有者：不剝它的欄位
    const shaft = owner && centerPoint(owner, centerId);
    if (owner && !shaft) continue;
    let part;
    if (indep) {
      const c = byId(indep.ownerId), m = c.motorMount || {}, {physicalMotor: _pm, ...p1} = c.p1 || {};
      const {type: _t, id, p1: _p, physicalMotor: _a, motorType: _b, motorMount: _c, servoStart, servoEnd, ...rest} = c;
      part = {id, type: 'motor', motorType: indep.type, motor: indep.motor, p1,
        mount: Object.fromEntries(MOUNT_KEYS.filter(k => has(m, k)).map(k => [k, m[k]])),
        ...(servoStart !== undefined ? {servoStart} : {}), ...(servoEnd !== undefined ? {servoEnd} : {}), ...rest};
      replace.set(c.id, part);
    } else {
      const m = owner.motorMount && typeof owner.motorMount === 'object' ? owner.motorMount : null;
      let id = isStr(m?.partId) && !used.has(m.partId) ? m.partId : null;
      if (!id) { let n = 1, cand = `${GENERATED_ID_PREFIX}${centerId}`; while (used.has(cand)) cand = `${GENERATED_ID_PREFIX}${centerId}.${++n}`; id = cand; }
      used.add(id);
      const mount = {...(m ? Object.fromEntries(MOUNT_KEYS.filter(k => has(m, k)).map(k => [k, m[k]])) : {}), ...(isStr(owner.motorCarrier) ? {carrier: owner.motorCarrier} : {})};
      part = {id, type: 'motor', motorType: primary.type, motor: primary.motor,
        p1: {id: centerId, x: shaft.x, y: shaft.y, type: shaft.type},
        ...(Object.keys(mount).length ? {mount} : {}),
        drives: {body: owner.id, ...(has(owner, 'phaseOffset') ? {phaseOffset: owner.phaseOffset} : {})},
        ...(has(owner, 'servoStart') ? {servoStart: owner.servoStart} : {}), ...(has(owner, 'servoEnd') ? {servoEnd: owner.servoEnd} : {}),
        ...(owner.moduleId ? {moduleId: owner.moduleId} : {})};
      after.set(owner.id, part);
    }
    converted.push({centerId, motor: part.motor, owner: owner?.id || null});
  }
  // 剝掉輸出件上的馬達欄位與共用軸心點上的 physicalMotor 副本。
  const stripOwners = new Set(converted.map(x => x.owner).filter(Boolean));
  for (const c of comps) {
    if (isMotorPart(c)) continue;
    if (stripOwners.has(c.id)) {
      for (const k of LEGACY_MOTOR_FIELDS) delete c[k];
      if (has(c, 'isInput')) c.isInput = false;
    }
    for (const k of pointKeysFor(c)) {
      const p = c[k];
      if (p && has(p, 'physicalMotor') && converted.some(x => x.centerId === p.id && String(p.physicalMotor) === String(x.motor))) delete p.physicalMotor;
    }
  }
  out.comps = comps.flatMap(c => [replace.get(c.id) || c, ...(after.has(c.id) ? [after.get(c.id)] : [])]);
  return out;
}

/** 馬達零件形狀 -> 今日程式讀的舊形狀（輸出件長回馬達欄位，獨立馬達長回 physicalMotor／motorMount）。 */
export function toLegacy(work) {
  const out = clone(work || {});
  const comps = Array.isArray(out.comps) ? out.comps : [];
  const parts = comps.filter(isMotorPart);
  const keep = comps.filter(c => !isMotorPart(c));
  const find = id => keep.find(c => c.id === id);
  const result = [];
  const placed = new Map();
  for (const P of parts) {
    const owner = P.drives?.body && find(P.drives.body);
    const mount = P.mount || {}, centerId = P.p1.id;
    if (owner) {
      if (owner.type === 'bar' || P.motorType !== 'tt') owner.motorType = P.motorType;
      if (owner.type === 'bar') { owner.isInput = true; owner.physicalMotor = P.motor; }
      if (has(P.drives, 'phaseOffset')) owner.phaseOffset = P.drives.phaseOffset;
      if (isStr(mount.carrier)) owner.motorCarrier = mount.carrier;
      if (has(P, 'servoStart')) owner.servoStart = P.servoStart;
      if (has(P, 'servoEnd')) owner.servoEnd = P.servoEnd;
      if (Object.keys(mount).some(k => k !== 'carrier') && (owner.type === 'bar' || owner.type === 'gear')) {
        const named = !P.id.startsWith(GENERATED_ID_PREFIX);
        owner.motorMount = {motor: P.motor, ...(named ? {partId: P.id} : {}), center: centerId, outputBody: owner.id,
          ...(mount.frameBody ? {frameBody: mount.frameBody} : {}), ...(has(mount, 'orientation') ? {orientation: mount.orientation} : {}),
          ...(has(mount, 'angleDeg') ? {angleDeg: mount.angleDeg} : {}), reversed: !!mount.reversed, ...(has(mount, 'face') ? {face: mount.face} : {}),
          order: mount.frameBody ? ['motor', 'frameBody', 'outputBody'] : ['motor', 'outputBody']};
      }
    } else {
      const {id, type: _t, motorType, motor, p1, mount: _m, drives: _d, servoStart, servoEnd, ...rest} = P;
      placed.set(P, {type: 'motor', id, p1: {...p1}, physicalMotor: motor, motorType,
        motorMount: {motor, center: p1.id, face: mount.face, orientation: mount.orientation, angleDeg: mount.angleDeg, reversed: !!mount.reversed, ...(mount.frameBody ? {frameBody: mount.frameBody} : {})},
        ...(servoStart !== undefined ? {servoStart} : {}), ...(servoEnd !== undefined ? {servoEnd} : {}), ...rest});
    }
  }
  for (const c of comps) result.push(isMotorPart(c) ? placed.get(c) : c);
  const legacy = result.filter(Boolean);
  // 擁有者的軸心點補回 physicalMotor。其他零件上共用該 id 的點不補：normalizeBar 會因為點上有 physicalMotor 就把那根桿當成輸入桿。
  for (const P of parts) {
    const owner = P.drives?.body && legacy.find(c => c.id === P.drives.body);
    for (const c of owner ? [owner] : legacy.filter(c => c.type === 'motor' && c.id === P.id))
      for (const k of pointKeysFor(c)) if (c[k]?.id === P.p1.id && !has(c[k], 'physicalMotor')) c[k].physicalMotor = P.motor;
  }
  out.comps = legacy;
  return out;
}

/** 編譯端需要的馬達事實，只由馬達零件導出（M1 之後取代各處讀舊欄位）。 */
export function motorFacts(work) {
  return (Array.isArray(work?.comps) ? work.comps : []).filter(isMotorPart).map(P => ({
    id: P.id, centerId: P.p1.id, bodyId: P.drives?.body ?? null, phaseOffset: Number(P.drives?.phaseOffset) || 0,
    carrierId: P.mount?.carrier ?? null, frameBodyId: P.mount?.frameBody ?? null, type: P.motorType, motor: String(P.motor),
    point: {x: P.p1.x, y: P.p1.y, type: P.p1.type}, ...(P.motorType === 'mg995' ? {servo: {start: P.servoStart, end: P.servoEnd}} : {})}));
}
