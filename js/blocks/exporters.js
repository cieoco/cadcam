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

// MG995 穿板槽的 local 外形（+X＝機身反方向、輸出軸心在原點）：
// 矩形本體槽，機身尾端可帶線材缺口——走線出口兼 180° 反裝防呆
//（軸心偏一端、耳孔卻對稱，反裝鎖得上但軸心會偏掉；反裝時出線端被板封死，一裝就發現）。
// 缺口寬或深為 0 則是純矩形。2D 預覽與 DXF/SVG 匯出共用這一份。
export function mg995SlotOutline(m = {}) {
  const bodyLen = Number(m.bodyLengthMm) || 41.2;
  const halfW = (Number(m.bodyWidthMm) || 20.2) / 2;
  const shaftOffset = Number(m.shaftOffsetMm) || 10;
  const notchW = Math.min(Number(m.cableNotchWidthMm) || 0, halfW * 2);
  const notchD = Number(m.cableNotchDepthMm) || 0;
  const maxX = shaftOffset;                 // 槽近端（輸出軸側）
  const minX = shaftOffset - bodyLen;       // 槽遠端（機身尾端、出線側）
  if (notchW <= 0 || notchD <= 0) {
    return [{ x: minX, y: -halfW }, { x: maxX, y: -halfW }, { x: maxX, y: halfW }, { x: minX, y: halfW }];
  }
  const hn = notchW / 2;
  return [
    { x: minX, y: -halfW }, { x: maxX, y: -halfW }, { x: maxX, y: halfW }, { x: minX, y: halfW },
    { x: minX, y: hn }, { x: minX - notchD, y: hn }, { x: minX - notchD, y: -hn }, { x: minX, y: -hn }
  ];
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

// 凸包的圓角等距外擴（凸包與半徑 offset 圓的 Minkowski 和）：
// 每條邊沿外法線平移 offset，相鄰邊之間用圓弧接起來。
// 相較於舊版「兩邊外移取交點」的尖角 miter，銳角頂點不會爆衝成又大又歪的尖楔，
// 而是收成一段外弧，整片板貼著孔群、四周等距、圓角收邊。
function roundedOffsetHull(points, offset) {
  if (points.length < 3 || offset <= 0) return points;
  const ccw = signedArea(points) >= 0;
  const n = points.length;
  // 邊 p→q 的單位外法線
  const outward = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return ccw ? { x: dy / len, y: -dx / len } : { x: -dy / len, y: dx / len };
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n], r = points[(i + 2) % n];
    const nEdge = outward(p, q), nNext = outward(q, r);
    // 這條邊平移後的兩端
    out.push({ x: p.x + nEdge.x * offset, y: p.y + nEdge.y * offset });
    out.push({ x: q.x + nEdge.x * offset, y: q.y + nEdge.y * offset });
    // 頂點 q 的圓角：外法線由本邊掃到下一邊（取內部點，兩端已由相鄰邊供應）
    const a0 = Math.atan2(nEdge.y, nEdge.x) * 180 / Math.PI;
    let a1 = Math.atan2(nNext.y, nNext.x) * 180 / Math.PI;
    if (ccw) { while (a1 < a0) a1 += 360; } else { while (a1 > a0) a1 -= 360; }
    if (Math.abs(a1 - a0) > 0.5) {
      const steps = Math.max(1, Math.round(Math.abs(a1 - a0) / 15));
      out.push(...arcPoints(q.x, q.y, offset, a0, a1, steps).slice(1, -1));
    }
  }
  return out;
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

function plateGeometry(comp, points, settings, mounts = []) {
  const { holeDiameterMm } = normalizeExportSettings(settings);
  return createPlateGeometry(comp, points, {
    radius: DEFAULT_PLATE_RADIUS_WORLD,
    holeRadius: holeDiameterMm / 2,
    ...plateMountExtras(mounts)
  });
}

export function inspectPlateExport(comp, points, settings, mounts = []) {
  return plateGeometry(comp, points, settings, mounts);
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

function svgForPlate(comp, points, settings, mounts = []) {
  const geometry = plateGeometry(comp, points, settings, mounts);
  const b = boundsForGeometry([...geometry.outlines, ...(geometry.cutouts || []).map(c => c.points)], geometry.holes);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const paths = geometry.outlines.map(outline => `    <path d="${svgPolyline(outline)}" />`).join('\n');
  const cutouts = (geometry.cutouts || []).map(c =>
    `    <path d="${svgPolyline(c.points)}" data-layer="${esc(c.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(comp.id || 'plate')}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
${paths}
${cutouts ? cutouts + '\n' : ''}${geometry.holes.map(h => `    <circle cx="${round(h.x)}" cy="${round(h.y)}" r="${round(h.r)}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfForPlate(comp, points, settings, mounts = []) {
  const geometry = plateGeometry(comp, points, settings, mounts);
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    ...geometry.outlines.map(outline => dxfPolyline(outline, 'CUT')),
    ...(geometry.cutouts || []).map(c => dxfPolyline(c.points, c.layer)),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer || 'HOLE')),
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

// 單一動力來源的加工特徵（世界座標）：corners＝安裝內容角點（供外形合併／延伸判斷）、
// cutouts＝非圓形切割（MG995 穿板槽）、holes＝圓孔。自動地基、宿主機架桿與結構板共用。
export function motorMountFeatures(mount) {
  if (!mount || !mount.center || !Number.isFinite(mount.center.x)) return null;
  const rot = (Number(mount.rotDeg) || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const local = (x, y) => ({
    x: mount.center.x + x * cos + y * sin,
    y: mount.center.y - x * sin + y * cos
  });
  const cutouts = [];
  const holes = [];
  if (mount.kind === 'mg995') {
    // MG995 穿板式固定：本體矩形槽（含線槽缺口）+ 兩耳共 4 個螺絲孔。
    // CAD local 與 TT 同慣例：+X 為機身反方向（機殼沿 -X 延伸），輸出軸心在原點。
    const m = mount.settings || {};
    const bodyLen = Number(m.bodyLengthMm) || 41.2;
    const bodyWidth = Number(m.bodyWidthMm) || 20.2;
    const shaftOffset = Number(m.shaftOffsetMm) || 10;
    const screwR = (Number(m.screwDiameterMm) || 3.2) / 2;
    const screwSpan = Number(m.screwSpanMm) || 49.5;
    const screwSpacing = Number(m.screwSpacingMm) || 10;
    const halfW = bodyWidth / 2;
    const slotOutline = mg995SlotOutline(m);
    cutouts.push({ layer: 'MG995_SLOT', points: slotOutline.map(p => local(p.x, p.y)) });
    const slotMinX = Math.min(...slotOutline.map(p => p.x));   // 含缺口深度
    const slotMaxX = Math.max(...slotOutline.map(p => p.x));
    const earX = shaftOffset - bodyLen / 2;    // 耳孔跨距以機殼中心為準，不是軸心
    [-1, 1].forEach(sx => [-1, 1].forEach(sy => {
      const p = local(earX + sx * screwSpan / 2, sy * screwSpacing / 2);
      holes.push({ x: p.x, y: p.y, r: screwR, layer: 'MG995_SCREW' });
    }));
    const margin = 5;
    const pad = Math.max(screwR, margin);
    const contentMinX = Math.min(slotMinX, earX - screwSpan / 2);
    const contentMaxX = Math.max(slotMaxX, earX + screwSpan / 2);
    const contentHalfY = Math.max(halfW, screwSpacing / 2 + screwR);
    const corners = [
      local(contentMinX - pad, -(contentHalfY + margin)),
      local(contentMaxX + pad, -(contentHalfY + margin)),
      local(contentMaxX + pad, contentHalfY + margin),
      local(contentMinX - pad, contentHalfY + margin)
    ];
    return { corners, cutouts, holes };
  }
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
  const corners = [
    local(minX, minY),
    local(maxX, minY),
    local(maxX, maxY),
    local(minX, maxY)
  ];
  holes.push({ x: local(0, 0).x, y: local(0, 0).y, r: shaftR, layer: 'TT_SHAFT' });
  let p = local(screwX, screwSpacing / 2); holes.push({ x: p.x, y: p.y, r: screwR, layer: 'TT_SCREW' });
  p = local(screwX, -screwSpacing / 2); holes.push({ x: p.x, y: p.y, r: screwR, layer: 'TT_SCREW' });
  p = local(locatorX, locatorY); holes.push({ x: p.x, y: p.y, r: locatorR, layer: 'TT_LOCATOR' });
  return { corners, cutouts, holes };
}

// 結構板宿主的 mount 特徵 → createPlateGeometry 的 extras 形狀。
export function plateMountExtras(mounts = []) {
  const extraCutouts = [];
  const extraHoles = [];
  (mounts || []).forEach(m => {
    const feats = motorMountFeatures(m);
    if (!feats) return;
    extraCutouts.push(...feats.cutouts);
    extraHoles.push(...feats.holes);
  });
  return { extraCutouts, extraHoles };
}

function frameGeometry(frameNodes, settings = {}, motorMounts = []) {
  const nodes = (frameNodes || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const { barWidthMm, holeDiameterMm } = normalizeExportSettings(settings);
  const holeR = holeDiameterMm / 2;
  const frameR = barWidthMm / 2;
  const outlines = [];
  const mountOutlines = [];
  const cutouts = [];   // 非圓形的內部切割（MG995 穿板槽），與 holes 一樣屬於板內開孔
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
      if (baseHull.length >= 3) outlines.push(roundedOffsetHull(baseHull, Math.max(18, frameR)));
    }
  } else if (nodes.length === 1) {
    outlines.push(roundPadOutline(nodes[0], Math.max(18, frameR + holeR + 4)));
  }

  nodes.forEach(p => addHole(p.x, p.y, holeR, 'PIVOT_HOLE'));

  motorMounts.forEach(mount => {
    const feats = motorMountFeatures(mount);
    if (!feats) return;
    cutouts.push(...feats.cutouts);
    feats.holes.forEach(h => addHole(h.x, h.y, h.r, h.layer));
    mountOutlines.push(feats.corners);
  });

  for (let i = holes.length - 1; i >= 0; i--) {
    if (holes[i].layer !== 'PIVOT_HOLE') continue;
    const overlapsMotorHole = holes.some((h, j) =>
      j !== i && (h.layer.startsWith('TT_') || h.layer.startsWith('MG995_')) && Math.hypot(h.x - holes[i].x, h.y - holes[i].y) < 0.05);
    // 落在 MG995 穿板槽內的固定孔沒有意義（那塊材料被切掉了），一併移除。
    const insideCutout = cutouts.some(c => pointInPoly(holes[i], c.points));
    if (overlapsMotorHole || insideCutout) holes.splice(i, 1);
  }

  if (mountOutlines.length && barAxis) {
    // 兩點機架＝明確的主桿。長樑：沿主桿方向延長／加寬成等寬膠囊，讓馬達孔落在同一條
    // 連續機架桿內（取凸包會變一大片梯形板）。但短桿＋垂直大馬達座時，等寬膠囊會爆成
    // 巨大圓端板——改成兩案並比：膠囊 vs「節點＋馬達座角點」圓角凸包，取面積小者。
    // 凸包案自然形成「馬達端寬、另一端收窄」的錐形支架板（伺服支架掛軸轂的典型形狀）。
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
    const capsule = barOutline(start, end, halfWidth);
    const base = hull([...nodes, ...mountOutlines.flat()]);
    const taperedPlate = base.length >= 3 ? roundedOffsetHull(base, Math.max(18, frameR)) : null;
    const area = pts => Math.abs(signedArea(pts));
    outlines.length = 0;
    // 凸包要「明顯」較小（<75%）才捨棄膠囊——長樑上的馬達座兩案面積接近時，
    // 維持等寬連續樑的可製造外形，避免抖動成梯形板。
    outlines.push(taperedPlate && area(taperedPlate) < area(capsule) * 0.75 ? taperedPlate : capsule);
  } else if (mountOutlines.length) {
    // 有馬達座（非兩點主桿）：把機架節點與馬達座角點一起取凸包，再做一次圓角等距外擴。
    // 不對「已外擴的外形」再取尖角凸包，才不會產生歪斜尖楔。
    const seeds = [...nodes, ...mountOutlines.flat()];
    const base = hull(seeds);
    outlines.length = 0;
    if (base.length >= 3) outlines.push(roundedOffsetHull(base, Math.max(18, frameR)));
    else if (base.length) outlines.push(roundPadOutline(base[0], Math.max(18, frameR)));
  }

  if (!outlines.length) return null;
  // 固定孔貼近槽緣一樣是薄肉，警告時把槽邊當外緣一起檢查。
  const warnEdges = [...outlines, ...cutouts.map(c => c.points)];
  return { outlines, cutouts, holes, warnings: frameWarnings(warnEdges, holes) };
}

export function inspectFrameExport(frameNodes, settings, motorMounts = []) {
  return frameGeometry(frameNodes, settings, motorMounts);
}

// 靜態結構板：三點桿有 ≥2 個機架固定點＝使用者畫的機架本體（整片板都是靜止剛體）。
export function isStaticPlate(comp) {
  return Boolean(comp && comp.type === 'triangle' &&
    ['p1', 'p2', 'p3'].filter(k => comp[k] && comp[k].type === 'fixed').length >= 2);
}

// 馬達安裝特徵的宿主分派：
// 1. bar.motorMountPoint = 馬達軸心接點 id → 該機架桿承載（顯式宣告）。
// 2. 馬達軸心是某塊靜態結構板的頂點 → 該板承載（馬達就鎖在板上，無需宣告）。
// hosted：宿主零件 id → mounts；free：仍由自動地基（frame.dxf）承載。
export function splitMountsByHost(comps, mounts = []) {
  const hosted = new Map();
  const free = [];
  (mounts || []).forEach(m => {
    // `frameBody` is explicit assembly semantics for a riding motor. Prefer it
    // over the moving motor-centre lookup used by older snapshots.
    const host = m?.frameBody
      ? (comps || []).find(c => c && c.id === m.frameBody)
      : (m && m.pointId
        ? ((comps || []).find(c => c && c.type === 'bar' && c.motorMountPoint === m.pointId)
          || (comps || []).find(c => isStaticPlate(c) && ['p1', 'p2', 'p3'].some(k => c[k] && c[k].id === m.pointId)))
        : null);
    if (host) {
      if (!hosted.has(host.id)) hosted.set(host.id, []);
      hosted.get(host.id).push(m);
    } else {
      free.push(m);
    }
  });
  return { hosted, free };
}

// 宿主機架桿幾何：桿局部座標（p1 在原點、+X 沿桿軸），複用 frameGeometry 的
// 「沿桿軸延長/加寬＋槽內固定孔剔除」邏輯，讓桿本體、端點孔與馬達穿板特徵成為同一塊料。
export function hostedBarGeometry(comp, pts, settings, mounts = []) {
  const a = pointForExport(comp, 'p1', pts);
  const b = pointForExport(comp, 'p2', pts);
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 1e-6) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const barAngleDeg = Math.atan2(uy, ux) * 180 / Math.PI;
  const toLocal = p => ({
    x: (p.x - a.x) * ux + (p.y - a.y) * uy,
    y: -(p.x - a.x) * uy + (p.y - a.y) * ux
  });
  const localMounts = (mounts || [])
    .filter(m => m && m.center && Number.isFinite(m.center.x) && Number.isFinite(m.center.y))
    .map(m => ({ ...m, center: toLocal(m.center), rotDeg: (Number(m.rotDeg) || 0) + barAngleDeg }));
  if (!localMounts.length) return null;
  return frameGeometry([{ x: 0, y: 0 }, { x: len, y: 0 }], settings, localMounts);
}

export function frameExportWarnings(frameNodes, settings, motorMounts = []) {
  return inspectFrameExport(frameNodes, settings, motorMounts)?.warnings || [];
}

function boundsForFrame(geometry) {
  const xs = [], ys = [];
  geometry.outlines.flat().forEach(p => { xs.push(p.x); ys.push(p.y); });
  (geometry.cutouts || []).forEach(c => c.points.forEach(p => { xs.push(p.x); ys.push(p.y); }));
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

function svgForFrame(frameNodes, settings, motorMounts) {
  const geometry = frameGeometry(frameNodes, settings, motorMounts);
  if (!geometry) return null;
  return svgForFrameGeometry(geometry, 'frame');
}

function svgForFrameGeometry(geometry, title) {
  const b = boundsForFrame(geometry);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const paths = geometry.outlines.map(points => `    <path d="${svgPolyline(points)}" />`).join('\n');
  const cutouts = (geometry.cutouts || []).map(c =>
    `    <path d="${svgPolyline(c.points)}" data-layer="${esc(c.layer)}" />`).join('\n');
  const holes = geometry.holes.map(h =>
    `    <circle cx="${h.x}" cy="${h.y}" r="${h.r}" data-layer="${esc(h.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(title)}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
${paths}
${cutouts ? cutouts + '\n' : ''}${holes}
  </g>
</svg>
`;
}

function dxfForFrame(frameNodes, settings, motorMounts) {
  const geometry = frameGeometry(frameNodes, settings, motorMounts);
  if (!geometry) return null;
  return dxfForFrameGeometry(geometry);
}

function dxfForFrameGeometry(geometry) {
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    ...geometry.outlines.map(points => dxfPolyline(points, 'FRAME_CUT')),
    ...(geometry.cutouts || []).map(c => dxfPolyline(c.points, c.layer)),
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

export function exportLinksAsSvg(comps, pts, params, settings, mounts = []) {
  const { hosted } = splitMountsByHost(comps, mounts);
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    // 宿主機架桿：桿身直接帶馬達穿板特徵（同一塊料），其餘桿件走一般路徑。
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, pts, settings, hosted.get(comp.id)) : null;
    const text = hostGeometry ? svgForFrameGeometry(hostGeometry, comp.id) : svgForLink(comp, length, settings);
    downloadText(text, `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const plates = exportablePlates(comps, pts);
  plates.forEach(({ comp, points }) => {
    downloadText(svgForPlate(comp, points, settings, hosted.get(comp.id)), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const gears = exportableGears(comps, params, settings);
  gears.forEach(({ comp, geometry }) => {
    downloadText(svgForGear(comp, geometry), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  return links.length + plates.length + gears.length;
}

export function exportLinksAsDxf(comps, pts, params, settings, mounts = []) {
  const { hosted } = splitMountsByHost(comps, mounts);
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, pts, settings, hosted.get(comp.id)) : null;
    const text = hostGeometry ? dxfForFrameGeometry(hostGeometry) : dxfForLink(comp, length, settings);
    downloadText(text, `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const plates = exportablePlates(comps, pts);
  plates.forEach(({ comp, points }) => {
    downloadText(dxfForPlate(comp, points, settings, hosted.get(comp.id)), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const gears = exportableGears(comps, params, settings);
  gears.forEach(({ comp, geometry }) => {
    downloadText(dxfForGear(comp, geometry), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  return links.length + plates.length + gears.length;
}

export function exportFrameAsSvg(frameNodes, settings, motorMounts = []) {
  const svg = svgForFrame(frameNodes, settings, motorMounts);
  if (!svg) return 0;
  downloadText(svg, 'frame.svg', 'image/svg+xml');
  return 1;
}

export function exportFrameAsDxf(frameNodes, settings, motorMounts = []) {
  const dxf = dxfForFrame(frameNodes, settings, motorMounts);
  if (!dxf) return 0;
  downloadText(dxf, 'frame.dxf', 'application/dxf');
  return 1;
}
