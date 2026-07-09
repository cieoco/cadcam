export const DEFAULT_PLATE_RADIUS_WORLD = 9;
export const MAX_PLATE_POINTS = 6;

const EPS = 1e-6;

function cleanPoints(points) {
  return (points || [])
    .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > EPS);
}

function arcPoints(center, radius, a0, a1, steps = 14, clockwise = false) {
  let delta = a1 - a0;
  if (clockwise) {
    while (delta >= 0) delta -= Math.PI * 2;
    while (delta < -Math.PI * 2) delta += Math.PI * 2;
  } else {
    while (delta <= 0) delta += Math.PI * 2;
  }
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + delta * (i / steps);
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

function lineIntersection(a, ua, b, ub) {
  const den = ua.x * ub.y - ua.y * ub.x;
  if (Math.abs(den) < 1e-9) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * ub.y - dy * ub.x) / den;
  return { x: a.x + ua.x * t, y: a.y + ua.y * t };
}

function convexHull(points) {
  const pts = cleanPoints(points);
  if (pts.length <= 2) return pts;
  const sorted = [...pts].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  sorted.forEach(p => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  });
  const upper = [];
  [...sorted].reverse().forEach(p => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 沿一個已排好序（逆時針）的封閉環，每邊外擴 radius、每個角用圓弧收圓。
function roundClosedRing(ordered, radius) {
  if (ordered.length < 2) return [];
  if (ordered.length === 2) return cleanPolylineOutline(ordered, radius);

  const tangent = (p, q) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dy / dist;
    const ny = -dx / dist;
    return {
      start: { x: p.x + nx * radius, y: p.y + ny * radius },
      end: { x: q.x + nx * radius, y: q.y + ny * radius }
    };
  };
  const out = [];
  const ts = ordered.map((p, i) => tangent(p, ordered[(i + 1) % ordered.length]));
  out.push(ts[0].start);
  for (let i = 0; i < ts.length; i++) {
    const curr = ts[i];
    const next = ts[(i + 1) % ts.length];
    const corner = ordered[(i + 1) % ordered.length];
    out.push(curr.end);
    out.push(...arcPoints(
      corner,
      radius,
      Math.atan2(curr.end.y - corner.y, curr.end.x - corner.x),
      Math.atan2(next.start.y - corner.y, next.start.x - corner.x),
      14
    ));
  }
  return out;
}

export function roundedHullOutline(points, radius = DEFAULT_PLATE_RADIUS_WORLD) {
  return roundClosedRing(convexHull(points), radius);
}

// 封閉圓角多邊形：把孔位依「繞形心的角度」排序成不自交的簡單多邊形再收圓。
// 與 hull 不同——保留凹形（星狀點集皆可），不像凸包會把凹處抹平。
export function roundedPolygonOutline(points, radius = DEFAULT_PLATE_RADIUS_WORLD) {
  const pts = cleanPoints(points);
  if (pts.length < 3) return roundClosedRing(pts, radius);
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const ring = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return roundClosedRing(ring, radius);
}

export function cleanPolylineOutline(points, radius = DEFAULT_PLATE_RADIUS_WORLD) {
  const clean = cleanPoints(points);
  if (clean.length < 2) return [];
  const segs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= EPS) continue;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    segs.push({ ux, uy, nx, ny, nAng: Math.atan2(ny, nx) });
  }
  if (!segs.length) return [];

  const sidePoint = (p, seg, side) => ({ x: p.x + seg.nx * radius * side, y: p.y + seg.ny * radius * side });
  const sideAngle = (seg, side) => seg.nAng + (side < 0 ? Math.PI : 0);
  const buildSide = (side) => {
    const chain = [sidePoint(clean[0], segs[0], side)];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = segs[i - 1];
      const next = segs[i];
      const p = clean[i];
      const hit = lineIntersection(
        sidePoint(p, prev, side), { x: prev.ux, y: prev.uy },
        sidePoint(p, next, side), { x: next.ux, y: next.uy }
      );
      chain.push(hit || sidePoint(p, next, side));
    }
    chain.push(sidePoint(clean[clean.length - 1], segs[segs.length - 1], side));
    return chain;
  };

  const left = buildSide(1);
  const right = buildSide(-1);
  const last = segs[segs.length - 1];
  const first = segs[0];
  return [
    ...left,
    ...arcPoints(clean[clean.length - 1], radius, sideAngle(last, 1), sideAngle(last, -1), 14, true),
    ...right.reverse(),
    ...arcPoints(clean[0], radius, sideAngle(first, -1), sideAngle(first, 1), 14, true)
  ];
}

export function jawCenterline(points, turnSign = 0) {
  const [pivot, drive, tip] = points || [];
  if (!pivot || !drive || !tip) return null;
  const dx = tip.x - pivot.x;
  const dy = tip.y - pivot.y;
  const len = Math.hypot(dx, dy);
  if (len <= EPS) return null;
  const ux = dx / len;
  const uy = dy / len;
  const cross = ux * (drive.y - pivot.y) - uy * (drive.x - pivot.x);
  const side = Number(turnSign) < 0 ? -1 : (Number(turnSign) > 0 ? 1 : (Math.sign(cross) || 1));
  const turn = side * 55 * Math.PI / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const ex = ux * cos - uy * sin;
  const ey = ux * sin + uy * cos;
  const extend = Math.max(38, Math.min(84, len * 0.58));
  const end = { x: tip.x + ex * extend, y: tip.y + ey * extend };
  return [drive, pivot, tip, end];
}

function triangleBasis(points) {
  const [a, b] = points || [];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= EPS) return null;
  const ux = dx / len;
  const uy = dy / len;
  return { origin: a, ux, uy, nx: -uy, ny: ux };
}

export function localToWorld(points, local) {
  const basis = triangleBasis(points);
  if (!basis || !local) return null;
  const u = Number(local.u);
  const v = Number(local.v);
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return {
    x: basis.origin.x + basis.ux * u + basis.nx * v,
    y: basis.origin.y + basis.uy * u + basis.ny * v
  };
}

export function worldToLocal(points, world) {
  const basis = triangleBasis(points);
  if (!basis || !world) return null;
  const dx = world.x - basis.origin.x;
  const dy = world.y - basis.origin.y;
  return {
    u: dx * basis.ux + dy * basis.uy,
    v: dx * basis.nx + dy * basis.ny
  };
}

const PLATE_REF_INDEX = { p1: 0, p2: 1, p3: 2 };

// 由 p1/p2/p3 + outlinePoints 合成一條有順序的頂點清單（相容舊資料，不改動 comp）。
// solve 頂點用 ref 指向求解點；shape 頂點存局部 u,v(,hole)。
export function defaultPlateVertices(comp = {}) {
  const verts = [];
  if (comp.p1 && comp.p1.id) verts.push({ solve: true, ref: 'p1' });
  if (comp.p2 && comp.p2.id) verts.push({ solve: true, ref: 'p2' });
  if (comp.p3 && comp.p3.id) verts.push({ solve: true, ref: 'p3' });
  (comp.outlinePoints || []).forEach(p => {
    const u = Number(p && p.u);
    const v = Number(p && p.v);
    if (Number.isFinite(u) && Number.isFinite(v)) {
      const pt = { solve: false, u, v };
      if (p.hole === true) pt.hole = true;
      verts.push(pt);
    }
  });
  return verts;
}

// 取得有效頂點清單（沒有 comp.vertices 就即時合成）。
export function plateVertices(comp = {}) {
  return (Array.isArray(comp.vertices) && comp.vertices.length)
    ? comp.vertices
    : defaultPlateVertices(comp);
}

// 依頂點順序算出世界座標；solve 頂點取 solved[ref]（每幀由求解器給），shape 頂點做 localToWorld。
// 每點附帶 { solve, hole } 供輪廓 / 孔位使用。
export function plateVertexWorldPoints(comp = {}, points = []) {
  const out = [];
  plateVertices(comp).forEach(vt => {
    if (vt.solve) {
      const w = points[PLATE_REF_INDEX[vt.ref]];
      if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) {
        out.push({ x: w.x, y: w.y, solve: true, hole: true });
      }
    } else {
      const w = localToWorld(points, vt);
      if (w) out.push({ x: w.x, y: w.y, solve: false, hole: vt.hole === true });
    }
  });
  return out;
}

// 造形（非求解）頂點的世界座標；保留給既有呼叫端。
export function outlineControlWorldPoints(comp = {}, points = []) {
  return plateVertexWorldPoints(comp, points)
    .filter(p => !p.solve)
    .map(p => ({ x: p.x, y: p.y, hole: p.hole }));
}

// 依頂點順序的世界輪廓點（求解點 + 造形點）。
export function plateContourPoints(comp = {}, points = []) {
  const world = plateVertexWorldPoints(comp, points).map(p => ({ x: p.x, y: p.y }));
  return world.length ? world : cleanPoints(points);
}

export function plateShapeMode(comp = {}) {
  if (comp.shapeMode === 'polyline' || comp.shapeMode === 'hull' || comp.shapeMode === 'polygon') return comp.shapeMode;
  if (comp.outlineMode === 'polyline' || comp.shape === 'jaw') return 'polyline';
  return 'hull';
}

export function plateCenterline(comp, points) {
  if (comp && comp.shape === 'jaw') return jawCenterline(points, comp.jawTurnSign);
  return plateContourPoints(comp, points);
}

export function createPlateGeometry(comp, points, options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : DEFAULT_PLATE_RADIUS_WORLD;
  const holeRadius = Number.isFinite(Number(options.holeRadius)) ? Number(options.holeRadius) : radius * 0.72;
  const mode = plateShapeMode(comp);
  const world = plateVertexWorldPoints(comp, points);
  const contour = world.map(p => ({ x: p.x, y: p.y }));
  const fallback = contour.length ? contour : cleanPoints(points);
  const usesOrder = (mode === 'polyline' || mode === 'polygon');
  const source = usesOrder ? plateCenterline(comp, points) : fallback;
  let outline;
  if (mode === 'polyline') outline = cleanPolylineOutline(source || fallback, radius);       // 折線桿：沿孔順序的細彎桿
  else if (mode === 'polygon') outline = roundedPolygonOutline(source || fallback, radius);  // 多邊形板：照孔位收成封閉圓角實心板
  else outline = roundedHullOutline(fallback, radius);                                        // 包絡板：凸包外框
  const holePts = world.filter(p => p.solve || p.hole);
  const holes = (holePts.length ? holePts : cleanPoints(points))
    .map(p => ({ x: p.x, y: p.y, r: holeRadius }));
  return {
    mode,
    sourcePoints: source || fallback,
    outlines: outline.length ? [outline] : [],
    holes
  };
}
