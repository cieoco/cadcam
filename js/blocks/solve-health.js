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

// 播放、錄影與逐幀呈現共用；不能把 solver 的補畫座標當成已受約束的解。
export function motionPoseIssue(comps, sol) {
  if (!sol || sol.isValid === false || !sol.points)
    return { code: 'invalid_pose', message: sol?.errorReason || '目前姿態無法求解，請檢查桿長、滑軌行程與接點連接。' };
  const missing = unsolvedMovingPoints(comps, sol);
  if (missing.length) return { code: 'missing_points', sourceIds: missing,
    message: `接點 ${missing.join('、')} 尚未解出位置，請確認孔位已連接、機架已固定。` };
  if (sol.isUnderconstrained) return { code: 'underconstrained',
    message: '活動零件尚未受約束。請補接孔位、固定機架或移除多加的活動桿。' };
  return null;
}

// 僅驗證指定角度範圍的離散姿態；不代表連續行程、碰撞或承載已驗證。
// solveAt 由目前設計／組立注入，避免拿其他分頁的資料阻擋本頁。
export function inspectMotionRange({ comps, solveAt, theta, plan, seed = {}, stepDeg = 2 }) {
  const sample = (angle, previous) => {
    let sol = null;
    try { sol = solveAt(angle, previous); } catch (_) {}
    const issue = motionPoseIssue(comps, sol);
    return { sol, issue: issue && { ...issue, angle, message: `${angle.toFixed(1)}°：${issue.message}` } };
  };
  const current = sample(theta, seed);
  if (current.issue) return { ok: false, ...current.issue };
  const lo = plan?.mode === 'rock' ? plan.lo : theta;
  const hi = plan?.mode === 'rock' ? plan.hi : theta + 360;
  if (![lo, hi, stepDeg].every(Number.isFinite) || hi - lo < 0.01 || stepDeg <= 0)
    return { ok: false, code: 'no_range', message: '目前沒有可播放的有效行程；請檢查桿長、接點或起訖角度。' };
  const count = Math.ceil((hi - lo) / stepDeg);
  if (count > 3600) return { ok: false, code: 'invalid_range', message: '角度範圍過大，請修正起訖角度。' };
  let previous = current.sol.points;
  for (let i = 0; i <= count; i++) {
    const result = sample(lo + (hi - lo) * i / count, previous);
    if (result.issue) return { ok: false, ...result.issue };
    previous = result.sol.points;
  }
  return { ok: true, samples: count + 2, stepDeg };
}
