/**
 * blocks / frame-grid
 *
 * 機架對格（docs/SDD-GRID-BLOCKS.md G4a）。純函式、按需載入，不進首次 JS。
 * 只用在拖曳；數字輸入保留精確值，離格由 G2 標記為例外。
 */
import { GRID_PITCH_MM, GRID_TOLERANCE_MM, latticeEmbedding } from './grid-rule.js';

const clean = v => Math.round(v * 1e9) / 1e9;

// 軸距 L 下，第二固定軸剛好落在 8 mm 格點的方向（度）：|8·√(i²+j²) − L| ≤ 0.01。
export function frameAngleCandidates(length, pitch = GRID_PITCH_MM) {
  const n = Math.ceil(length / pitch) + 1, out = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    if ((i || j) && Math.abs(pitch * Math.hypot(i, j) - length) <= 0.01) out.push(Math.atan2(j, i) * 180 / Math.PI);
  }
  return out;
}

// 取最接近拖曳角的候選（回傳值與拖曳角連續）；沒有候選回傳 null，呼叫端維持整度。
export function snapFrameAngle(length, angleDeg) {
  let best = null;
  for (const c of frameAngleCandidates(length)) {
    const diff = ((c - angleDeg + 180) % 360 + 360) % 360 - 180;
    if (best === null || Math.abs(diff) < Math.abs(best)) best = diff;
  }
  return best === null ? null : angleDeg + best;
}

// 新增機架孔拖曳：points 為機架固定孔（不含新增孔）；axis = { a: 基準孔, u: 單位方向 }；
// (u, v) 為孔在機架軸座標的拖曳值。回傳吸附後的 { u, v }。
export function snapFrameHole(points, axis, u, v = 0, centered = true, pitch = GRID_PITCH_MM) {
  const multiple = () => ({ u: Math.round(u / pitch) * pitch, v: centered ? 0 : Math.round(v / pitch) * pitch });
  const o = points[0], off = (p, k) => { const d = (p[k] - o[k]) / pitch; return Math.abs(d - Math.round(d)) * pitch; };
  // 兩孔機架的方格不唯一：世界格也成立時優先用世界格，否則取 latticeEmbedding 的最佳旋轉。
  const aligned = points.length > 1 && points.every(p => off(p, 'x') <= GRID_TOLERANCE_MM && off(p, 'y') <= GRID_TOLERANCE_MM);
  const e = aligned ? { ok: true, rotationDeg: 0 } : points.length > 1 ? latticeEmbedding(points, pitch) : null;
  if (!e || !e.ok) return multiple();   // 機架本身不在格上
  const t = e.rotationDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const world = (I, J) => ({ x: o.x + pitch * (I * c - J * s), y: o.y + pitch * (I * s + J * c) });
  const local = w => { const dx = w.x - axis.a.x, dy = w.y - axis.a.y; return { u: dx * axis.u.x + dy * axis.u.y, v: -dx * axis.u.y + dy * axis.u.x }; };
  const rx = axis.a.x + axis.u.x * u - axis.u.y * v - o.x, ry = axis.a.y + axis.u.y * u + axis.u.x * v - o.y;
  const fi = Math.round((c * rx + s * ry) / pitch), fj = Math.round((-s * rx + c * ry) / pitch);
  if (!centered) { const l = local(world(fi, fj)); return { u: clean(l.u), v: clean(l.v) }; }
  // 中心線穿過兩個基準格點：格向量除以最大公因數，直接得到所有線上格點的步距。
  // 長斜機架的相鄰格點可以相隔上百格，不能只搜拖點附近再退回局部 8 mm。
  const grid = p => { const dx = p.x - o.x, dy = p.y - o.y; return { i: Math.round((c * dx + s * dy) / pitch), j: Math.round((-s * dx + c * dy) / pitch) }; };
  const a = grid(axis.a), b = points.filter(p => Math.abs(local(p).v) <= GRID_TOLERANCE_MM)
    .sort((p, q) => Math.abs(local(q).u) - Math.abs(local(p).u))[0];
  if (!b) return { u: 0, v: 0 };
  const end = grid(b), di = end.i - a.i, dj = end.j - a.j;
  const gcd = (a, b) => b ? gcd(b, a % b) : a, divisor = gcd(Math.abs(di), Math.abs(dj));
  if (!divisor) return { u: 0, v: 0 };
  const origin = local(world(a.i, a.j)).u, step = local(world(a.i + di / divisor, a.j + dj / divisor)).u - origin;
  const next = origin + Math.round((u - origin) / step) * step;
  const q = { x: axis.a.x + axis.u.x * next, y: axis.a.y + axis.u.y * next }, g = grid(q), snapped = world(g.i, g.j);
  return { u: Math.hypot(q.x - snapped.x, q.y - snapped.y) <= GRID_TOLERANCE_MM ? clean(next) : 0, v: 0 };
}
