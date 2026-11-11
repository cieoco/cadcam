/**
 * blocks / plan-shape  (pack M1 of docs/SDD-MOTOR-PART.md)
 *
 * 讓動作在「馬達是獨立零件」的形狀上規劃：登記 runEdit 的 shape:'parts'（enter＝toMotorParts、leave＝toLegacy），
 * 並提供 onParts(planner)——把一個在新形狀上規劃的函式包成「進、出都是今日形狀」的函式（給直接呼叫規劃函式的測試與修復項目用）。
 * 按需載入：用到的動作模組 import 本檔；啟動路徑不載入 motor-part.js。純函式，不碰 DOM。
 *
 * 轉回今日形狀時的資料保真（M0 §8 的三個不能逐字往返之處，以及「沒動到的馬達不得漂移」）：
 *   - 馬達零件在計畫前後完全相同（沒被這個動作改到）→ 輸出件上的馬達欄位與軸心點副本、獨立馬達整個零件，照計畫前的原樣放回
 *     （含非擁有者點上的 physicalMotor 副本、齒輪／皮帶輪／三點桿／凸輪的零件層 physicalMotor）。所以不碰馬達的動作不會讓馬達資料有任何變動。
 *   - 馬達零件被改到（解除、刪除輸出件…）→ 以 toLegacy 的結果為準，不補回冗餘副本（與舊規劃函式一致：舊的解除也會清掉軸心點副本）。
 */
import {registerShape} from './edit-pipeline.js';
import {toMotorParts, toLegacy, isMotorPart, LEGACY_MOTOR_FIELDS} from './motor-part.js';
import {pointKeysFor} from './part-types.js';

const clone = v => structuredClone(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const equal = (a, b) => same(sorted(a), sorted(b));
const has = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

const entered = new WeakMap();   // 今日形狀的 comps 陣列 -> 轉出的馬達零件 comps（leave 比對「有沒有被改到」用，不重算）

/** 今日形狀 -> 馬達零件形狀（整份 work，其餘欄位原樣複製）。 */
export function enterParts(work) {
  const out = toMotorParts(work);
  entered.set(work.comps, out.comps);
  return out;
}

/** 計畫結果 comps（馬達零件形狀）-> 今日形狀 comps；before＝計畫前的今日形狀 work。 */
export function leaveParts(comps, before) {
  const partsBefore = entered.get(before.comps) || toMotorParts({comps: before.comps, modules: before.modules}).comps;
  const out = toLegacy({comps}).comps;
  const was = new Map(before.comps.map(c => [c.id, c])), partWas = new Map(partsBefore.filter(isMotorPart).map(p => [p.id, p]));
  const at = new Map(out.map(c => [c.id, c]));
  for (const P of comps.filter(isMotorPart)) {
    const Q = partWas.get(P.id);
    if (!Q || !equal(P, Q)) continue;                          // 這顆馬達被動過：照 toLegacy
    const owner = P.drives?.body ? at.get(P.drives.body) : at.get(P.id), old = was.get(owner?.id);
    if (!owner || !old) continue;
    if (!P.drives?.body) { const i = out.indexOf(owner); out[i] = clone(old); at.set(old.id, out[i]); continue; }
    if (old.type !== owner.type) continue;
    for (const f of [...LEGACY_MOTOR_FIELDS, 'isInput']) { if (has(old, f)) owner[f] = clone(old[f]); else delete owner[f]; }
    for (const k of pointKeysFor(owner)) if (owner[k]?.id === P.p1.id) { if (has(old[k], 'physicalMotor')) owner[k].physicalMotor = old[k].physicalMotor; else delete owner[k].physicalMotor; }
  }
  // 冗餘副本：沒被動過的馬達，其軸心 id 在別的零件上的 physicalMotor 副本、非桿件的零件層 physicalMotor 照原樣放回。
  const still = comps.filter(isMotorPart).filter(P => partWas.has(P.id) && equal(P, partWas.get(P.id)));
  for (const c of out) {
    const b = was.get(c.id);
    if (!b || b.type !== c.type) continue;
    for (const k of pointKeysFor(c)) {
      const bp = b[k];
      if (c[k] && has(bp, 'physicalMotor') && bp.id === c[k].id && !has(c[k], 'physicalMotor') && still.some(P => P.p1.id === bp.id && String(P.motor) === String(bp.physicalMotor))) c[k].physicalMotor = bp.physicalMotor;
    }
    if (has(b, 'physicalMotor') && !has(c, 'physicalMotor') && c.type !== 'bar' && c.type !== 'motor' && still.some(P => P.drives?.body === c.id && String(P.motor) === String(b.physicalMotor))) c.physicalMotor = b.physicalMotor;
  }
  return out;
}

registerShape('parts', {enter: enterParts, leave: leaveParts});

/** 把「在馬達零件形狀上規劃」的函式 planner(work, ...rest) 包成進出都是今日形狀的規劃函式。 */
export const onParts = planner => (work, ...rest) => {
  const res = planner(enterParts(work), ...rest);
  return res && res.ok && !res.unchanged ? {...res, comps: leaveParts(res.comps, work)} : res;
};

/** 今日形狀的零件 id -> 馬達零件形狀裡對應的馬達：接著該輸出件的馬達，或該 id 本身的獨立馬達。 */
export const motorOfId = (comps, id) => comps.find(c => isMotorPart(c) && c.drives?.body === id) || comps.find(c => isMotorPart(c) && c.id === id) || null;
