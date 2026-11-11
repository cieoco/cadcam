/**
 * blocks / motor-part-io  (pack M2 of docs/SDD-MOTOR-PART.md)
 * 檔案與分享連結的馬達零件形狀：寫出時 toMotorParts，讀入時 toLegacy（之後的正規化與所有讀取端仍吃今日的舊形狀）。
 * 按需載入（project-envelope.js 的 loadMotorPartIO）；啟動路徑不載入 motor-part.js。純函式，不碰 DOM。
 */
import {toMotorParts, toLegacy, isMotorPart, LEGACY_MOTOR_FIELDS} from './motor-part.js';

/** 寫出：作品有馬達就換成馬達零件形狀；沒有馬達則原物件返回（輸出與今日逐字相同）。 */
export function writeMotorParts(snapshot) {
  const out = toMotorParts(snapshot);
  return out.comps.some(isMotorPart) ? out : snapshot;
}

/** 讀入：新舊欄位並存（輸出件已有馬達零件驅動，卻仍帶舊馬達欄位）視為被改壞，拒絕而不是半轉換。 */
export function readMotorParts(work) {
  const parts = work.comps.filter(isMotorPart);
  for (const P of parts) {
    const owner = P.drives?.body && work.comps.find(c => c.id === P.drives.body);
    if (!owner || isMotorPart(owner)) continue;
    const left = LEGACY_MOTOR_FIELDS.filter(k => owner[k] !== undefined);
    if (owner.isInput) left.push('isInput');
    if (left.length) throw Error(`作品檔同時含有馬達零件 ${P.id} 與 ${owner.id} 上舊的馬達欄位（${left.join('、')}），可能被手動改過，為避免讀錯沒有開啟。`);
  }
  return toLegacy(work);
}
