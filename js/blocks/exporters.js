import { DEFAULT_PLATE_RADIUS_WORLD, createPlateGeometry } from './plate-geometry.js';
import { createGearPath } from '../utils/gear-geometry.js';

export const DEFAULT_BAR_WIDTH_MM = DEFAULT_PLATE_RADIUS_WORLD * 2;
export const DEFAULT_HOLE_DIAMETER_MM = DEFAULT_PLATE_RADIUS_WORLD * 2 * 0.72;
const TT_SHAFT_FLAT_DIAMETER_MM = 5.4;
const TT_SHAFT_FLAT_THICKNESS_MM = 3.7;

const round = (v, digits = 3) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
};

const esc = s => String(s).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[ch]));

const safeName = s => String(s || 'link').replace(/[^\w.-]+/g, '_');

export function normalizeExportSettings(settings = {}) {
  const barWidth = Number(settings.barWidthMm);
  const holeDiameter = Number(settings.holeDiameterMm);
  const ttShaftFlatDiameter = Number(settings.ttShaftFlatDiameterMm);
  const ttShaftFlatThickness = Number(settings.ttShaftFlatThicknessMm);
  const safeBarWidth = Number.isFinite(barWidth) ? Math.max(2, Math.min(120, barWidth)) : DEFAULT_BAR_WIDTH_MM;
  const safeHoleDiameter = Number.isFinite(holeDiameter)
    ? Math.max(0.5, Math.min(safeBarWidth - 0.5, holeDiameter))
    : Math.min(DEFAULT_HOLE_DIAMETER_MM, safeBarWidth - 0.5);
  const safeFlatDiameter = Number.isFinite(ttShaftFlatDiameter)
    ? Math.max(1, Math.min(safeBarWidth - 0.5, ttShaftFlatDiameter))
    : Math.min(TT_SHAFT_FLAT_DIAMETER_MM, safeBarWidth - 0.5);
  const safeFlatThickness = Number.isFinite(ttShaftFlatThickness)
    ? Math.max(0.5, Math.min(safeFlatDiameter - 0.1, ttShaftFlatThickness))
    : Math.min(TT_SHAFT_FLAT_THICKNESS_MM, safeFlatDiameter - 0.1);
  return {
    barWidthMm: round(safeBarWidth, 2),
    holeDiameterMm: round(safeHoleDiameter, 2),
    ttShaftFlatDiameterMm: round(safeFlatDiameter, 2),
    ttShaftFlatThicknessMm: round(safeFlatThickness, 2)
  };
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function linkLength(comp, pts, params) {
  const a = pts && comp.p1 && pts[comp.p1.id];
  const b = pts && comp.p2 && pts[comp.p2.id];
  const d = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const param = comp.lenParam ? Number(params && params[comp.lenParam]) : 0;
  return round(d || param || 1, 3);
}

function exportableLinks(comps, pts, params) {
  return comps
    .filter(c => c && c.type === 'bar' && c.p1 && c.p2)
    .map(c => ({ comp: c, length: linkLength(c, pts, params) }))
    .filter(item => item.length > 0);
}

function pointForExport(comp, key, pts) {
  const id = comp && comp[key] && comp[key].id;
  const solved = id && pts && pts[id];
  if (solved && Number.isFinite(solved.x) && Number.isFinite(solved.y)) return solved;
  const seed = comp && comp[key];
  return seed && Number.isFinite(Number(seed.x)) && Number.isFinite(Number(seed.y))
    ? { x: Number(seed.x), y: Number(seed.y) }
    : null;
}

function exportablePlates(comps, pts) {
  return comps
    .filter(c => c && c.type === 'triangle' && c.p1 && c.p2 && c.p3)
    .map(c => ({ comp: c, points: [pointForExport(c, 'p1', pts), pointForExport(c, 'p2', pts), pointForExport(c, 'p3', pts)] }))
    .filter(item => item.points.every(Boolean));
}

function exportableGears(comps, params, settings) {
  return comps
    .filter(c => c && c.type === 'gear' && c.p1 && c.p2)
    .map(c => ({ comp: c, geometry: gearGeometry(c, params, settings) }))
    .filter(item => item.geometry && item.geometry.outline.length >= 3);
}

function isTtMotorEnd(comp, key) {
  return Boolean(comp && comp.isInput && comp.motorType !== 'mg995' && comp[key] && comp[key].physicalMotor);
}

function ttShaftFlatPoints(cx, cy, settings = {}, steps = 12) {
  const normalized = normalizeExportSettings(settings);
  const r = normalized.ttShaftFlatDiameterMm / 2;
  const halfAcrossFlats = normalized.ttShaftFlatThicknessMm / 2;
  const y = Math.sqrt(Math.max(0, r * r - halfAcrossFlats * halfAcrossFlats));
  const rightTop = Math.atan2(-y, halfAcrossFlats) * 180 / Math.PI;
  const leftTop = Math.atan2(-y, -halfAcrossFlats) * 180 / Math.PI;
  const leftBottom = Math.atan2(y, -halfAcrossFlats) * 180 / Math.PI;
  const rightBottom = Math.atan2(y, halfAcrossFlats) * 180 / Math.PI;
  return [
    ...arcPoints(cx, cy, r, rightTop, leftTop, steps),
    ...arcPoints(cx, cy, r, leftBottom, rightBottom, steps),
  ];
}

function svgTtShaftFlatPath(cx, cy, settings) {
  return svgPolyline(ttShaftFlatPoints(cx, cy, settings));
}

function linkHoleSpecs(comp, length, settings) {
  const { holeDiameterMm, ttShaftFlatDiameterMm, ttShaftFlatThicknessMm } = normalizeExportSettings(settings);
  const holeR = round(holeDiameterMm / 2, 3);
  const flat = { ttShaftFlatDiameterMm, ttShaftFlatThicknessMm };
  return [
    isTtMotorEnd(comp, 'p1')
      ? { kind: 'tt-shaft-flat', x: 0, y: 0, settings: flat }
      : { kind: 'circle', x: 0, y: 0, r: holeR },
    isTtMotorEnd(comp, 'p2')
      ? { kind: 'tt-shaft-flat', x: length, y: 0, settings: flat }
      : { kind: 'circle', x: length, y: 0, r: holeR }
  ];
}

function svgForLink(comp, length, settings) {
  const { barWidthMm, holeDiameterMm } = normalizeExportSettings(settings);
  const r = round(barWidthMm / 2, 3);
  const holes = linkHoleSpecs(comp, length, { barWidthMm, holeDiameterMm });
  const width = round(length + r * 2, 3);
  const height = round(r * 2, 3);
  const d = [
    `M 0 ${-r}`,
    `L ${length} ${-r}`,
    `A ${r} ${r} 0 0 1 ${length} ${r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 0 ${-r}`,
    'Z'
  ].join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${-r} ${-r} ${width} ${height}">
  <title>${esc(comp.id || 'link')}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
    <path d="${d}" />
${holes.map(h => h.kind === 'tt-shaft-flat'
    ? `    <path d="${svgTtShaftFlatPath(h.x, h.y, h.settings)}" data-hole="TT_SHAFT_FLAT" />`
    : `    <circle cx="${h.x}" cy="${h.y}" r="${h.r}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfPair(code, value) {
  return `${code}\n${value}`;
}

function arcPoints(cx, cy, radius, startDeg, endDeg, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = deg * Math.PI / 180;
    pts.push({ x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius });
  }
  return pts;
}

function dxfPolyline(points, layer) {
  const rows = [
    dxfPair(0, 'LWPOLYLINE'),
    dxfPair(8, layer),
    dxfPair(90, points.length),
    dxfPair(70, 1)
  ];
  points.forEach(p => {
    rows.push(dxfPair(10, round(p.x)));
    rows.push(dxfPair(20, round(p.y)));
  });
  return rows.join('\n');
}

function dxfCircle(x, y, radius, layer) {
  return [
    dxfPair(0, 'CIRCLE'),
    dxfPair(8, layer),
    dxfPair(10, round(x)),
    dxfPair(20, round(y)),
    dxfPair(30, 0),
    dxfPair(40, round(radius))
  ].join('\n');
}

function gearGeometry(comp, params = {}, settings = {}) {
  const teeth = Math.max(6, Math.round(Number(comp.teeth) || 12));
  const pitchR = Number(params && comp.radiusParam ? params[comp.radiusParam] : NaN) ||
    (Number(comp.module) > 0 ? teeth * Number(comp.module) / 2 : 36);
  const module = Math.max(0.1, 2 * pitchR / teeth);
  const outline = createGearPath({ teeth, module, segmentsPerTooth: 8 })
    .map(p => ({ x: round(p.x), y: round(p.y) }));
  const pinR = Number(params && comp.pinRadiusParam ? params[comp.pinRadiusParam] : NaN) ||
    Number(comp.pinRadius) ||
    Math.max(4, pitchR * 0.6);
  const seedCenter = comp.p1 || { x: 0, y: 0 };
  const seedPin = comp.p2 || { x: Number(seedCenter.x) + pinR, y: Number(seedCenter.y) };
  const dx = Number(seedPin.x) - Number(seedCenter.x);
  const dy = Number(seedPin.y) - Number(seedCenter.y);
  const angle = Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : 0;
  const { holeDiameterMm } = normalizeExportSettings(settings);
  const centerR = holeDiameterMm / 2;
  const outputR = Math.max(0.5, Number(comp.pinHoleDiameter) > 0 ? Number(comp.pinHoleDiameter) / 2 : centerR);
  return {
    outline,
    holes: [
      { x: 0, y: 0, r: centerR, layer: 'CENTER_HOLE' },
      { x: pinR * Math.cos(angle), y: pinR * Math.sin(angle), r: outputR, layer: 'PIN_HOLE' }
    ]
  };
}

function hull(points) {
  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
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

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const crosses = ((a.y > p.y) !== (b.y > p.y)) &&
      (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function lineDistance(p, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / d;
}

function barOutline(a, b, radius) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const rightAngle = Math.atan2(ny, nx) * 180 / Math.PI;
  const leftAngle = Math.atan2(-ny, -nx) * 180 / Math.PI;
  return [
    { x: a.x + nx * radius, y: a.y + ny * radius },
    { x: b.x + nx * radius, y: b.y + ny * radius },
    ...arcPoints(b.x, b.y, radius, rightAngle, leftAngle, 18).slice(1),
    { x: a.x - nx * radius, y: a.y - ny * radius },
    // 從左端下側繞到上側時必須經過桿外側（-180°）；直接走到同值角度會繞進桿內側形成凹口。
    ...arcPoints(a.x, a.y, radius, leftAngle, rightAngle - 360, 18).slice(1)
  ];
}

function roundPadOutline(center, radius) {
  return arcPoints(center.x, center.y, radius, 0, 360, 32).slice(0, -1);
}

function signedArea(points) {
  return points.reduce((sum, p, index) => {
    const q = points[(index + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}

function offsetLineIntersection(a, ua, b, ub) {
  const cross = ua.x * ub.y - ua.y * ub.x;
  if (Math.abs(cross) < 1e-9) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = (dx * ub.y - dy * ub.x) / cross;
  return { x: a.x + ua.x * t, y: a.y + ua.y * t };
}

// 凸包的真正等距外擴：每一條邊平行外移後取交點，避免舊版「由中心放射」造成邊距不一。
function offsetConvexHull(points, offset) {
  if (points.length < 3 || offset <= 0) return points;
  const ccw = signedArea(points) >= 0;
  const shifted = points.map((p, index) => {
    const q = points[(index + 1) % points.length];
    const dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = (ccw ? dy : -dy) / length;
    const ny = (ccw ? -dx : dx) / length;
    return { point: { x: p.x + nx * offset, y: p.y + ny * offset }, dir: { x: dx / length, y: dy / length } };
  });
  return shifted.map((edge, index) => {
    const previous = shifted[(index - 1 + shifted.length) % shifted.length];
    return offsetLineIntersection(previous.point, previous.dir, edge.point, edge.dir) || edge.point;
  });
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function frameWarnings(outlines, holes) {
  const warnings = [];
  const pivots = holes.filter(h => h.layer === 'PIVOT_HOLE');
  const minWeb = 3;
  pivots.forEach((hole, index) => {
    let edgeDistance = Infinity;
    outlines.forEach(outline => outline.forEach((p, i) => {
      edgeDistance = Math.min(edgeDistance, pointToSegmentDistance(hole, p, outline[(i + 1) % outline.length]));
    }));
    if (edgeDistance - hole.r < minWeb) {
      warnings.push(`固定孔距外緣僅 ${round(Math.max(0, edgeDistance - hole.r), 1)} mm，建議至少 ${minWeb} mm`);
    }
    pivots.slice(index + 1).forEach(other => {
      const web = Math.hypot(hole.x - other.x, hole.y - other.y) - hole.r - other.r;
      if (web < minWeb) warnings.push(`兩個固定孔間肉厚僅 ${round(Math.max(0, web), 1)} mm，建議至少 ${minWeb} mm`);
    });
  });
  return [...new Set(warnings)];
}

function arcOutlinePoints(center, radius, a0, a1, steps = 10, shortest = false) {
  let delta = a1 - a0;
  if (shortest) {
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
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

function arcOutlinePointsClockwise(center, radius, a0, a1, steps = 14) {
  let delta = a1 - a0;
  while (delta >= 0) delta -= Math.PI * 2;
  while (delta < -Math.PI * 2) delta += Math.PI * 2;
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

function roundedPolylineOutline(points, radius) {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6);
  if (clean.length < 2) return [];
  const segs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i], b = clean[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    segs.push({ a, b, ux, uy, nx, ny, nAng: Math.atan2(ny, nx) });
  }
  if (!segs.length) return [];
  const sidePoint = (p, seg, side) => ({ x: p.x + seg.nx * radius * side, y: p.y + seg.ny * radius * side });
  const sideAngle = (seg, side) => seg.nAng + (side < 0 ? Math.PI : 0);
  const buildSide = (side) => {
    const chain = [sidePoint(clean[0], segs[0], side)];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = segs[i - 1], next = segs[i], p = clean[i];
      const turn = prev.ux * next.uy - prev.uy * next.ux;
      const outer = side > 0 ? turn > 0 : turn < 0;
      if (outer) {
        chain.push(sidePoint(p, prev, side));
        chain.push(...arcOutlinePoints(p, radius, sideAngle(prev, side), sideAngle(next, side), 10, true));
      } else {
        const hit = lineIntersection(
          sidePoint(p, prev, side), { x: prev.ux, y: prev.uy },
          sidePoint(p, next, side), { x: next.ux, y: next.uy }
        );
        chain.push(hit || sidePoint(p, next, side));
      }
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
    ...arcOutlinePointsClockwise(clean[clean.length - 1], radius, sideAngle(last, 1), sideAngle(last, -1), 14),
    ...right.reverse(),
    ...arcOutlinePointsClockwise(clean[0], radius, sideAngle(first, -1), sideAngle(first, 1), 14)
  ];
}

function cleanPolylineOutline(points, radius) {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6);
  if (clean.length < 2) return [];
  const segs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i], b = clean[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    segs.push({ a, b, ux, uy, nx, ny, nAng: Math.atan2(ny, nx) });
  }
  if (!segs.length) return [];
  const sidePoint = (p, seg, side) => ({ x: p.x + seg.nx * radius * side, y: p.y + seg.ny * radius * side });
  const sideAngle = (seg, side) => seg.nAng + (side < 0 ? Math.PI : 0);
  const buildSide = (side) => {
    const chain = [sidePoint(clean[0], segs[0], side)];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = segs[i - 1], next = segs[i], p = clean[i];
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
    ...arcOutlinePointsClockwise(clean[clean.length - 1], radius, sideAngle(last, 1), sideAngle(last, -1), 14),
    ...right.reverse(),
    ...arcOutlinePointsClockwise(clean[0], radius, sideAngle(first, -1), sideAngle(first, 1), 14)
  ];
}

function roundedTriangleOutline(a, b, c, radius) {
  const pts = [a, b, c];
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const ordered = area < 0 ? [a, c, b] : pts;
  const tangent = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dy / dist, ny = -dx / dist;
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
      corner.x, corner.y, radius,
      Math.atan2(curr.end.y - corner.y, curr.end.x - corner.x) * 180 / Math.PI,
      Math.atan2(next.start.y - corner.y, next.start.x - corner.x) * 180 / Math.PI,
      14
    ).slice(1));
  }
  return out;
}

function jawCenterline(pivot, drive, tip, turnSign = 0) {
  const dx = tip.x - pivot.x;
  const dy = tip.y - pivot.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return null;
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

function jawPlateOutline(pivot, drive, tip, turnSign = 0) {
  const centerline = jawCenterline(pivot, drive, tip, turnSign);
  if (!centerline) return roundedTriangleOutline(pivot, drive, tip, DEFAULT_PLATE_RADIUS_WORLD);
  return cleanPolylineOutline(centerline, DEFAULT_PLATE_RADIUS_WORLD);
}

function svgPolyline(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${round(p.x)} ${round(p.y)}`).join(' ') + ' Z';
}

function plateGeometry(comp, points, settings) {
  const { holeDiameterMm } = normalizeExportSettings(settings);
  return createPlateGeometry(comp, points, {
    radius: DEFAULT_PLATE_RADIUS_WORLD,
    holeRadius: holeDiameterMm / 2
  });
}

function boundsForGeometry(outlines, holes = []) {
  const xs = [], ys = [];
  outlines.flat().forEach(p => { xs.push(p.x); ys.push(p.y); });
  holes.forEach(h => {
    xs.push(h.x - h.r, h.x + h.r);
    ys.push(h.y - h.r, h.y + h.r);
  });
  const pad = 4;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad
  };
}

function svgForPlate(comp, points, settings) {
  const geometry = plateGeometry(comp, points, settings);
  const b = boundsForGeometry(geometry.outlines, geometry.holes);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const paths = geometry.outlines.map(outline => `    <path d="${svgPolyline(outline)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(comp.id || 'plate')}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
${paths}
${geometry.holes.map(h => `    <circle cx="${round(h.x)}" cy="${round(h.y)}" r="${round(h.r)}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfForPlate(comp, points, settings) {
  const geometry = plateGeometry(comp, points, settings);
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    ...geometry.outlines.map(outline => dxfPolyline(outline, 'CUT')),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, 'HOLE')),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

function svgForGear(comp, geometry) {
  const b = boundsForGeometry([geometry.outline], geometry.holes);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(comp.id || 'gear')}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
    <path d="${svgPolyline(geometry.outline)}" data-layer="GEAR_CUT" />
${geometry.holes.map(h => `    <circle cx="${round(h.x)}" cy="${round(h.y)}" r="${round(h.r)}" data-layer="${esc(h.layer)}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfForGear(comp, geometry) {
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    dxfPolyline(geometry.outline, 'GEAR_CUT'),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer)),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

function frameGeometry(frameNodes, settings = {}, ttMounts = []) {
  const nodes = (frameNodes || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const { barWidthMm, holeDiameterMm } = normalizeExportSettings(settings);
  const holeR = holeDiameterMm / 2;
  const frameR = barWidthMm / 2;
  const outlines = [];
  const mountOutlines = [];
  const holes = [];
  let barAxis = null;
  const addHole = (x, y, r, layer = 'HOLE') => {
    const q = { x: round(x), y: round(y), r: round(r), layer };
    const duplicate = holes.some(h => Math.hypot(h.x - q.x, h.y - q.y) < 0.05 && Math.abs(h.r - q.r) < 0.05 && h.layer === q.layer);
    if (!duplicate) holes.push(q);
  };

  if (nodes.length >= 2) {
    const maxLineDist = nodes.length === 2 ? 0 : Math.max(...nodes.map(p => lineDistance(p, nodes[0], nodes[nodes.length - 1])));
    const isBarLike = nodes.length === 2 || maxLineDist < 6;
    if (isBarLike) {
    const sorted = [...nodes].sort((a, b) => (a.x - b.x) || (a.y - b.y));
      const a = sorted[0], b = sorted[sorted.length - 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        barAxis = { a, ux: dx / len, uy: dy / len, len };
        outlines.push(barOutline(a, b, frameR));
      }
    } else {
    const baseHull = hull(nodes);
      if (baseHull.length >= 3) outlines.push(offsetConvexHull(baseHull, Math.max(18, frameR)));
    }
  } else if (nodes.length === 1) {
    outlines.push(roundPadOutline(nodes[0], Math.max(18, frameR + holeR + 4)));
  }

  nodes.forEach(p => addHole(p.x, p.y, holeR, 'PIVOT_HOLE'));

  ttMounts.forEach(mount => {
    if (!mount || !mount.center || !Number.isFinite(mount.center.x)) return;
    const rot = (Number(mount.rotDeg) || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const local = (x, y) => ({
      x: mount.center.x + x * cos + y * sin,
      y: mount.center.y - x * sin + y * cos
    });
    const m = mount.settings || {};
    const shaftR = (Number(m.shaftDiameterMm) || 6) / 2;
    const screwR = (Number(m.screwDiameterMm) || 3) / 2;
    const locatorR = (Number(m.locatorDiameterMm) || 4) / 2;
    const screwX = Number(m.screwOffsetXMm) || -20.6;
    const screwSpacing = Number(m.screwSpacingMm) || 17.3;
    const locatorX = Number(m.locatorOffsetXMm) || -11.18;
    const locatorY = Number(m.locatorOffsetYMm) || 0;
    const margin = 5;
    const minX = Math.min(screwX, 0, locatorX) - Math.max(screwR, shaftR, locatorR, margin);
    const maxX = Math.max(screwX, 0, locatorX) + Math.max(screwR, shaftR, locatorR, margin);
    const minY = Math.min(-screwSpacing / 2, 0, locatorY) - Math.max(screwR, shaftR, locatorR, margin);
    const maxY = Math.max(screwSpacing / 2, 0, locatorY) + Math.max(screwR, shaftR, locatorR, margin);
    mountOutlines.push([
      local(minX, minY),
      local(maxX, minY),
      local(maxX, maxY),
      local(minX, maxY)
    ]);
    let p = local(0, 0); addHole(p.x, p.y, shaftR, 'TT_SHAFT');
    p = local(screwX, screwSpacing / 2); addHole(p.x, p.y, screwR, 'TT_SCREW');
    p = local(screwX, -screwSpacing / 2); addHole(p.x, p.y, screwR, 'TT_SCREW');
    p = local(locatorX, locatorY); addHole(p.x, p.y, locatorR, 'TT_LOCATOR');
  });

  for (let i = holes.length - 1; i >= 0; i--) {
    if (holes[i].layer !== 'PIVOT_HOLE') continue;
    const overlapsMotorHole = holes.some((h, j) =>
      j !== i && h.layer.startsWith('TT_') && Math.hypot(h.x - holes[i].x, h.y - holes[i].y) < 0.05);
    if (overlapsMotorHole) holes.splice(i, 1);
  }

  if (mountOutlines.length && barAxis) {
    // 兩點機架＝明確的主桿。馬達座不可再與它取凸包，否則會變成一大片梯形板；
    // 改為沿主桿方向延長／加寬，讓所有馬達孔落在同一條可製造的連續機架桿內。
    let minAlong = 0, maxAlong = barAxis.len, halfWidth = frameR;
    mountOutlines.flat().forEach(p => {
      const dx = p.x - barAxis.a.x, dy = p.y - barAxis.a.y;
      const along = dx * barAxis.ux + dy * barAxis.uy;
      const across = Math.abs(dx * -barAxis.uy + dy * barAxis.ux);
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
      halfWidth = Math.max(halfWidth, across);
    });
    const start = { x: barAxis.a.x + barAxis.ux * minAlong, y: barAxis.a.y + barAxis.uy * minAlong };
    const end = { x: barAxis.a.x + barAxis.ux * maxAlong, y: barAxis.a.y + barAxis.uy * maxAlong };
    outlines.length = 0;
    outlines.push(barOutline(start, end, halfWidth));
  } else if (mountOutlines.length && outlines.length) {
    const merged = hull([...outlines.flat(), ...mountOutlines.flat()]);
    outlines.length = 0;
    outlines.push(merged);
  } else if (mountOutlines.length) {
    outlines.push(hull(mountOutlines.flat()));
  }

  if (!outlines.length) return null;
  return { outlines, holes, warnings: frameWarnings(outlines, holes) };
}

export function inspectFrameExport(frameNodes, settings, ttMounts = []) {
  return frameGeometry(frameNodes, settings, ttMounts);
}

export function frameExportWarnings(frameNodes, settings, ttMounts = []) {
  return inspectFrameExport(frameNodes, settings, ttMounts)?.warnings || [];
}

function boundsForFrame(geometry) {
  const xs = [], ys = [];
  geometry.outlines.flat().forEach(p => { xs.push(p.x); ys.push(p.y); });
  geometry.holes.forEach(h => {
    xs.push(h.x - h.r, h.x + h.r);
    ys.push(h.y - h.r, h.y + h.r);
  });
  const pad = 4;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad
  };
}

function svgForFrame(frameNodes, settings, ttMounts) {
  const geometry = frameGeometry(frameNodes, settings, ttMounts);
  if (!geometry) return null;
  const b = boundsForFrame(geometry);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const paths = geometry.outlines.map(points => `    <path d="${svgPolyline(points)}" />`).join('\n');
  const holes = geometry.holes.map(h =>
    `    <circle cx="${h.x}" cy="${h.y}" r="${h.r}" data-layer="${esc(h.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>frame</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
${paths}
${holes}
  </g>
</svg>
`;
}

function dxfForFrame(frameNodes, settings, ttMounts) {
  const geometry = frameGeometry(frameNodes, settings, ttMounts);
  if (!geometry) return null;
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    ...geometry.outlines.map(points => dxfPolyline(points, 'FRAME_CUT')),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer)),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

function dxfForLink(comp, length, settings) {
  const { barWidthMm, holeDiameterMm } = normalizeExportSettings(settings);
  const r = round(barWidthMm / 2, 3);
  const holes = linkHoleSpecs(comp, length, { barWidthMm, holeDiameterMm });
  const outline = [
    { x: 0, y: r },
    { x: length, y: r },
    ...arcPoints(length, 0, r, 90, -90, 18).slice(1),
    { x: 0, y: -r },
    ...arcPoints(0, 0, r, -90, -270, 18).slice(1)
  ];
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    dxfPolyline(outline, 'CUT'),
    ...holes.map(h => h.kind === 'tt-shaft-flat'
      ? dxfPolyline(ttShaftFlatPoints(h.x, h.y, h.settings, 18), 'TT_SHAFT_FLAT')
      : dxfCircle(h.x, h.y, h.r, 'HOLE')),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

export function exportLinksAsSvg(comps, pts, params, settings) {
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    downloadText(svgForLink(comp, length, settings), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const plates = exportablePlates(comps, pts);
  plates.forEach(({ comp, points }) => {
    downloadText(svgForPlate(comp, points, settings), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const gears = exportableGears(comps, params, settings);
  gears.forEach(({ comp, geometry }) => {
    downloadText(svgForGear(comp, geometry), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  return links.length + plates.length + gears.length;
}

export function exportLinksAsDxf(comps, pts, params, settings) {
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    downloadText(dxfForLink(comp, length, settings), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const plates = exportablePlates(comps, pts);
  plates.forEach(({ comp, points }) => {
    downloadText(dxfForPlate(comp, points, settings), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const gears = exportableGears(comps, params, settings);
  gears.forEach(({ comp, geometry }) => {
    downloadText(dxfForGear(comp, geometry), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  return links.length + plates.length + gears.length;
}

export function exportFrameAsSvg(frameNodes, settings, ttMounts = []) {
  const svg = svgForFrame(frameNodes, settings, ttMounts);
  if (!svg) return 0;
  downloadText(svg, 'frame.svg', 'image/svg+xml');
  return 1;
}

export function exportFrameAsDxf(frameNodes, settings, ttMounts = []) {
  const dxf = dxfForFrame(frameNodes, settings, ttMounts);
  if (!dxf) return 0;
  downloadText(dxf, 'frame.dxf', 'application/dxf');
  return 1;
}
