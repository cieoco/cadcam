/**
 * blocks / measurement
 *
 * 工作範圍與兩點夾持量測的純計算（不碰 DOM）。輸入沿用 multilink sweepTopology 的
 * 軌跡資料形狀（trace.results[i] = { isValid, B:{x,y} }）；呈現（量測卡 / 量測線）留在 app.js。
 */

// 工作範圍＝工作點在一個完整有效運動範圍內，任兩個位置的最大直線距離。
// 這比軌跡總長更接近「末端實際能伸到多遠」，也讓圓弧、擺動與直線推拉能用同一個數字比較。
export function workRangeFromTrace(trace) {
  const pts = (trace?.results || []).filter(r => r && r.isValid && r.B &&
    Number.isFinite(r.B.x) && Number.isFinite(r.B.y)).map(r => r.B);
  if (pts.length < 2) return null;
  let a = pts[0], b = pts[1], maxDistance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (d > maxDistance) { maxDistance = d; a = pts[i]; b = pts[j]; }
    }
  }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return {
    a, b,
    distance: maxDistance,
    spanX: Math.max(...xs) - Math.min(...xs),
    spanY: Math.max(...ys) - Math.min(...ys)
  };
}

export function clampRangeFromTraces(firstTrace, secondTrace) {
  const aResults = firstTrace?.results || [];
  const bResults = secondTrace?.results || [];
  let min = null, max = null;
  const count = Math.min(aResults.length, bResults.length);
  for (let i = 0; i < count; i++) {
    const a = aResults[i], b = bResults[i];
    if (!a?.isValid || !b?.isValid || !a.B || !b.B ||
        !Number.isFinite(a.B.x) || !Number.isFinite(a.B.y) ||
        !Number.isFinite(b.B.x) || !Number.isFinite(b.B.y)) continue;
    const distance = Math.hypot(a.B.x - b.B.x, a.B.y - b.B.y);
    const sample = { a: a.B, b: b.B, distance };
    if (!min || distance < min.distance) min = sample;
    if (!max || distance > max.distance) max = sample;
  }
  return min && max ? { min, max } : null;
}

export function currentPointDistance(points, pointIds) {
  if (!points || !pointIds || pointIds.length !== 2) return null;
  const a = points[pointIds[0]], b = points[pointIds[1]];
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}
