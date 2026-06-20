/**
 * blocks / motion
 *
 * 播放運動分析（純函式，不碰 DOM）：判斷機構是「整圈轉」還是「來回擺」，
 * 以及來回擺的兩端極限在哪。求解器一行不改，這裡只是反覆呼叫它探路。
 */

import { solveTopology } from '../multilink/solver.js';

export const PLAY_STEP = 2;           // 每幀轉幾度
export const norm360 = deg => ((deg % 360) + 360) % 360;

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
function walkBranch(compiled, topo, theta, lastSolved, dir) {
  const ids = new Set();
  (compiled.visualization.links || []).forEach(l => { if (!l.hidden) { ids.add(l.p1); ids.add(l.p2); } });
  const lens = (compiled.visualization.links || [])
    .filter(l => !l.hidden && l.lenParam).map(l => Math.abs(topo.params[l.lenParam]) || 0);
  const jumpTol = 0.25 * Math.max(60, ...lens); // 單步位移超過此值＝跳裝態＝到極限
  const solveAt = (deg, seed) => {
    let s = null;
    try { s = solveTopology(compiled, { thetaDeg: norm360(deg), _prevPoints: seed }); } catch (_) {}
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

// 開始播放前先規劃這個機構是「整圈轉」還是「來回擺」、以及來回擺的兩端在哪。
export function planMotion(compiled, topo, theta, lastSolved) {
  const fwd = walkBranch(compiled, topo, theta, lastSolved, 1);
  const bwd = walkBranch(compiled, topo, theta, lastSolved, -1);
  if (fwd.full || bwd.full || (fwd.limit - bwd.limit) >= 360 - PLAY_STEP) {
    return { mode: 'rotate' };
  }
  return { mode: 'rock', lo: bwd.limit, hi: fwd.limit };
}
