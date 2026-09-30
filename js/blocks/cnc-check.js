// L4：依 CNC 刀徑檢查匯出特徵（純函式、不碰 DOM）。
// 比刀小的圓孔銑不進去；窄於刀的開口銑不進去；尖角（內角 ≤ 135°）會被刀留下 R=刀徑/2 的圓角。
// parts = [{ name, holes:[{r, layer}], cutouts:[{points:[{x,y}], layer}] }]；回傳去重後的中文訊息。

const EPS = 1e-9;
const SHARP_CORNER_DEG = 135;

// 數字格式：最多 digits 位小數並去掉多餘的 0（3.175 → "3.175"、3 → "3"）。
const fmt = (n, digits = 3) => String(Number(Number(n).toFixed(digits)));

function convexHull(points) {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = list => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

// 最小寬度：對每條凸包邊，取所有點在該邊法線方向的投影範圍，再取最小。
function minWidth(points) {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < EPS) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    let lo = Infinity, hi = -Infinity;
    for (const p of hull) {
      const d = p.x * nx + p.y * ny;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    best = Math.min(best, hi - lo);
  }
  return Number.isFinite(best) ? best : null;
}

// 閉合多邊形中內角 ≤ 135° 的頂點數；細分的圓（內角接近 180°）不計入。
function sharpCornerCount(points) {
  const poly = [];
  for (const p of points) {
    const last = poly[poly.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > EPS) poly.push(p);
  }
  if (poly.length > 1 && Math.hypot(poly[0].x - poly[poly.length - 1].x, poly[0].y - poly[poly.length - 1].y) <= EPS) poly.pop();
  if (poly.length < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  const sign = area2 >= 0 ? 1 : -1;
  let count = 0;
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length], cur = poly[i], next = poly[(i + 1) % poly.length];
    const ux = cur.x - prev.x, uy = cur.y - prev.y, vx = next.x - cur.x, vy = next.y - cur.y;
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180 / Math.PI;
    const interior = 180 - sign * turn;
    if (interior <= SHARP_CORNER_DEG + EPS) count++;
  }
  return count;
}

export function cncWarnings(parts, cnc) {
  const tool = Number(cnc && cnc.toolDiameterMm);
  if (!Number.isFinite(tool) || tool <= 0) return [];
  const out = new Set();
  const holeGroups = new Map();

  for (const part of parts || []) {
    const name = part && part.name;
    for (const h of (part && part.holes) || []) {
      const dia = 2 * Number(h.r);
      if (!Number.isFinite(dia) || !(dia < tool - EPS)) continue;
      const key = `${name}\u0000${h.layer}\u0000${fmt(dia)}`;
      const g = holeGroups.get(key) || { name, layer: h.layer, dia, count: 0 };
      g.count++;
      holeGroups.set(key, g);
    }
    for (const c of (part && part.cutouts) || []) {
      const points = (c && c.points) || [];
      if (points.length < 3) continue;
      const w = minWidth(points);
      if (w !== null && w < tool - EPS) {
        out.add(`${name}（${c.layer}）開口最窄 ${fmt(w)} mm 比刀徑小（刀徑 ${fmt(tool)} mm），銑不進去`);
      }
      const n = sharpCornerCount(points);
      if (n > 0) {
        out.add(`${name}（${c.layer}）有 ${n} 個尖角，刀徑 ${fmt(tool)} mm 會留下 R${fmt(tool / 2, 2)} 圓角，方角裝配件需狗骨清角或放大開口`);
      }
    }
  }
  for (const g of holeGroups.values()) {
    const qty = g.count > 1 ? ` ×${g.count}` : '';
    out.add(`${g.name}（${g.layer}）Ø${fmt(g.dia)}${qty} 比刀徑 ${fmt(tool)} mm 小，銑不進去；改用鑽頭或加大孔徑`);
  }
  return [...out];
}
