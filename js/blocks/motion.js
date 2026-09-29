/**
 * blocks / motion
 *
 * 播放運動分析（純函式，不碰 DOM）：判斷機構是「整圈轉」還是「來回擺」，
 * 以及來回擺的兩端極限在哪。求解器一行不改，這裡只是反覆呼叫它探路。
 */

import { solveTopology, sweepTopology } from '../multilink/solver.js';
import { pointKeysFor } from './part-types.js';

export const PLAY_STEP = 2;           // 每幀轉幾度（僅供 walkBranch/planMotion 探路使用，不參與播放計時）
export const norm360 = deg => ((deg % 360) + 360) % 360;

// S2b：窄範圍軌跡取樣。整圈／寬範圍維持每 5°；範圍太窄（如夾爪 3.8°）時 5° 取不到足夠點，
// 改成把範圍切成至少 TRACE_MIN_SAMPLES 個點的步長，並讓 end 多推一點點以蓋過浮點累加誤差。
export const TRACE_STEP_DEG = 5;
export const TRACE_MIN_SAMPLES = 25;
export function traceSweepRange(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return { start: 0, end: 360, step: TRACE_STEP_DEG };
  const span = hi - lo;
  if (span === 0) return { start: lo, end: hi, step: TRACE_STEP_DEG };
  if (span / TRACE_STEP_DEG + 1 >= TRACE_MIN_SAMPLES) return { start: lo, end: hi, step: TRACE_STEP_DEG };
  const step = span / (TRACE_MIN_SAMPLES - 1);
  return { start: lo, end: hi + step * 1e-6, step };
}

// S1 依時間播放：播放角速度改以「度／秒」計，與螢幕更新率無關。
export const PLAY_SPEED_DEG_PER_SEC = 120;   // 預設播放角速度（= 舊版 60Hz × 2°）
export const MAX_FRAME_DT_MS = 100;          // 單幀 dt 上限，避免切分頁回來後暴衝
export const NOMINAL_FRAME_DT_MS = 1000 / 60; // 第一幀沒有上一個時間戳可用時的名目幀長

// 依 dt（毫秒）與角速度（度／秒）算出這一幀該前進幾度。
export function playStepDeg(dtMs, degPerSec = PLAY_SPEED_DEG_PER_SEC) {
  if (!Number.isFinite(dtMs) || !Number.isFinite(degPerSec) || dtMs < 0 || degPerSec < 0) return 0;
  const clamped = Math.min(dtMs, MAX_FRAME_DT_MS);
  return degPerSec * clamped / 1000;
}

// 依時間前進 theta（整圈轉模式用）；不做 360 取模，沿用舊版累加語意。
export function advanceByTime(theta, dtMs, degPerSec = PLAY_SPEED_DEG_PER_SEC, dir = 1) {
  return theta + (dir < 0 ? -1 : 1) * playStepDeg(dtMs, degPerSec);
}

// 用「上一點 + 速度」外插出預測位置當求解種子：靠動量挑連續分支，
// 平行四邊形過共線點時才不會翻成交叉四邊形（單純取最近解會挑錯邊）。
export function extrapolateSeed(last, prev) {
  const seed = {};
  for (const id in last) {
    const a = last[id], b = prev[id];
    seed[id] = (b && Number.isFinite(b.x)) ? { x: 2 * a.x - b.x, y: 2 * a.y - b.y } : a;
  }
  return seed;
}

// 從目前姿勢沿著「同一組裝態」往單一方向走，走到「無解」或「接點瞬移過大」為止。
// 瞬移過大＝求解器被迫跳到另一組鏡像裝態（桿件會看起來塌掉），那就是這個方向的真正極限。
function walkBranch(compiled, topo, theta, lastSolved, dir, motorCtx, solveFn) {
  const ids = new Set();
  (compiled.visualization.links || []).forEach(l => { if (!l.hidden) { ids.add(l.p1); ids.add(l.p2); } });
  const lens = (compiled.visualization.links || [])
    .filter(l => !l.hidden && l.lenParam).map(l => Math.abs(topo.params[l.lenParam]) || 0);
  const jumpTol = 0.25 * Math.max(60, ...lens); // 單步位移超過此值＝跳裝態＝到極限
  const solveAt = (deg, seed) => {
    let s = null;
    const params = { thetaDeg: norm360(deg), _prevPoints: seed };
    // 多馬達：探路的角度只掃 active 那顆，其餘馬達凍結在 motorCtx.frozen 的角度。
    if (motorCtx) params.motorAngles = { ...motorCtx.frozen, [motorCtx.active]: norm360(deg) };
    try { s = solveFn(params); } catch (_) {}
    return s;
  };
  const maxDisp = (seed, pts) => {
    let m = 0;
    for (const id of ids) {
      const a = seed[id], b = pts && pts[id];
      if (a && b && Number.isFinite(b.x)) { const d = Math.hypot(b.x - a.x, b.y - a.y); if (d > m) m = d; }
    }
    return m;
  };
  const s0 = solveAt(theta, lastSolved);
  let cur = (s0 && s0.points) ? { ...s0.points } : {};
  let before = {};                 // 用來外插的「再前一格」
  let last = theta;
  const steps = Math.round(360 / PLAY_STEP);
  for (let k = 1; k <= steps; k++) {
    const th = theta + dir * PLAY_STEP * k;
    const s = solveAt(th, extrapolateSeed(cur, before)); // 帶動量預測，分支判斷才一致
    if (!s || s.isValid === false || !s.points) return { full: false, limit: last };
    if (maxDisp(cur, s.points) > jumpTol) return { full: false, limit: last };
    before = cur;
    cur = { ...cur, ...s.points };
    last = th;
  }
  return { full: true };           // 繞一整圈都沒斷 = 可整圈轉
}

// S2：軌跡點共用同一份 compiled，只呼叫一次 sweepTopology，再分別取出每個軌跡點的 B，取代逐點各掃一次。
// sweepFn 選填：組合作品要改用 sweepAssembly 求解時注入，預設仍是 sweepTopology（行為不變）。
export function traceSweeps(compiled, params, ids, startDeg, endDeg, stepDeg, sweepFn = sweepTopology) {
  if (!ids.length) return [];
  const { results } = sweepFn(compiled, params, startDeg, endDeg, stepDeg);
  return ids.map(id => ({
    id,
    results: results.map(step => ({
      theta: step.theta,
      isValid: step.isValid,
      B: step.isValid ? (step.points ? step.points[id] : undefined) : null,
      points: step.points
    }))
  }));
}

// S4：compile 給的預設軌跡點（沒指定軌跡點時的退回值）常是地錨或馬達軸心——這種點本來就不動，
// 畫出來只會得到一個定點、量測卡也會顯示「工作範圍 0 mm」。這裡把「該不該畫」的判斷抽成純函式：
// 只要這個 id 在任一零件上出現的點是 fixed 或 motor，就一律不畫；找不到這個點也不畫。
export function fallbackTraceIds(comps, id) {
  if (!id) return [];
  let found = false;
  for (const c of comps || []) {
    for (const key of pointKeysFor(c)) {
      const pt = c && c[key];
      if (pt && pt.id === id) {
        found = true;
        if (pt.type === 'fixed' || pt.type === 'motor') return [];
      }
    }
  }
  return found ? [id] : [];
}

// 開始播放前先規劃這個機構是「整圈轉」還是「來回擺」、以及來回擺的兩端在哪。
// solveFn 選填：組合作品要改用 sweepAssembly／solveAssembly 求解時注入，預設仍是 solveTopology（行為不變）。
export function planMotion(compiled, topo, theta, lastSolved, motorCtx, solveFn = p => solveTopology(compiled, p)) {
  const fwd = walkBranch(compiled, topo, theta, lastSolved, 1, motorCtx, solveFn);
  const bwd = walkBranch(compiled, topo, theta, lastSolved, -1, motorCtx, solveFn);
  if (fwd.full || bwd.full || (fwd.limit - bwd.limit) >= 360 - PLAY_STEP) {
    return { mode: 'rotate' };
  }
  return { mode: 'rock', lo: bwd.limit, hi: fwd.limit };
}
