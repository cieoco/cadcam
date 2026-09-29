/**
 * blocks / solve-health
 *
 * S3 漏解警示（SDD-ASSEMBLY-MODULES §4.4）：solver 回報 isValid:true，但某些「會動」的
 * 接點卻沒有出現在 sol.points（或座標非有限數）——代表那個接點其實沒被解出來，畫面上
 * 只是停在原地，使用者卻看不出來。這裡只做偵測，純函式，不碰 DOM、不畫圖。
 */
import { pointKeysFor } from './part-types.js';

// 走訪 comps 收集所有「會動」（非 fixed）的接點 id，找出 sol.points 裡缺席或座標非有限數的那些。
// 結果依首次出現順序、不重複；sol 為 null 或整體無解（isValid===false）時直接回傳空陣列。
export function unsolvedMovingPoints(comps, sol) {
  if (!sol || sol.isValid === false) return [];
  const seenOrder = [];
  const seenSet = new Set();
  const fixedIds = new Set();
  for (const c of comps || []) {
    if (!c || c.type === 'workpiece') continue;
    for (const key of pointKeysFor(c)) {
      const p = c[key];
      if (!p || !p.id) continue;
      if (!seenSet.has(p.id)) { seenSet.add(p.id); seenOrder.push(p.id); }
      if (p.type === 'fixed') fixedIds.add(p.id);
    }
  }
  const points = sol.points || {};
  const out = [];
  for (const id of seenOrder) {
    if (fixedIds.has(id)) continue;
    const pt = points[id];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) out.push(id);
  }
  return out;
}
