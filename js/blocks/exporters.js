import { HULL_R_WORLD } from './view.js';

export const DEFAULT_BAR_WIDTH_MM = HULL_R_WORLD * 2;
export const DEFAULT_HOLE_DIAMETER_MM = HULL_R_WORLD * 2 * 0.72;

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
  const safeBarWidth = Number.isFinite(barWidth) ? Math.max(2, Math.min(120, barWidth)) : DEFAULT_BAR_WIDTH_MM;
  const safeHoleDiameter = Number.isFinite(holeDiameter)
    ? Math.max(0.5, Math.min(safeBarWidth - 0.5, holeDiameter))
    : Math.min(DEFAULT_HOLE_DIAMETER_MM, safeBarWidth - 0.5);
  return {
    barWidthMm: round(safeBarWidth, 2),
    holeDiameterMm: round(safeHoleDiameter, 2)
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

function svgForLink(comp, length, settings) {
  const { barWidthMm, holeDiameterMm } = normalizeExportSettings(settings);
  const r = round(barWidthMm / 2, 3);
  const holeR = round(holeDiameterMm / 2, 3);
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
    <circle cx="0" cy="0" r="${holeR}" />
    <circle cx="${length}" cy="0" r="${holeR}" />
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
  return [
    { x: a.x + nx * radius, y: a.y + ny * radius },
    { x: b.x + nx * radius, y: b.y + ny * radius },
    ...arcPoints(b.x, b.y, radius, Math.atan2(ny, nx) * 180 / Math.PI, Math.atan2(-ny, -nx) * 180 / Math.PI, 18).slice(1),
    { x: a.x - nx * radius, y: a.y - ny * radius },
    ...arcPoints(a.x, a.y, radius, Math.atan2(-ny, -nx) * 180 / Math.PI, Math.atan2(ny, nx) * 180 / Math.PI, 18).slice(1)
  ];
}

function svgPolyline(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${round(p.x)} ${round(p.y)}`).join(' ') + ' Z';
}

function frameGeometry(frameNodes, settings = {}, ttMounts = []) {
  const nodes = (frameNodes || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (nodes.length < 2) return null;
  const { barWidthMm, holeDiameterMm } = normalizeExportSettings(settings);
  const holeR = holeDiameterMm / 2;
  const frameR = barWidthMm / 2;
  const maxLineDist = nodes.length <= 2 ? 0 : Math.max(...nodes.map(p => lineDistance(p, nodes[0], nodes[nodes.length - 1])));
  const isBarLike = nodes.length === 2 || maxLineDist < 6;
  const outlines = [];
  const mountOutlines = [];
  const holes = [];
  const addHole = (x, y, r, layer = 'HOLE') => {
    const q = { x: round(x), y: round(y), r: round(r), layer };
    const duplicate = holes.some(h => Math.hypot(h.x - q.x, h.y - q.y) < 0.05 && Math.abs(h.r - q.r) < 0.05 && h.layer === q.layer);
    if (!duplicate) holes.push(q);
  };

  if (isBarLike) {
    const sorted = [...nodes].sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const a = sorted[0], b = sorted[sorted.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) return null;
    outlines.push(barOutline(a, b, frameR));
  } else {
    const baseHull = hull(nodes);
    if (baseHull.length < 3) return null;
    const cx = baseHull.reduce((s, p) => s + p.x, 0) / baseHull.length;
    const cy = baseHull.reduce((s, p) => s + p.y, 0) / baseHull.length;
    const pad = Math.max(18, frameR);
    const expanded = baseHull.map(p => {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + dx / d * pad, y: p.y + dy / d * pad };
    });
    outlines.push(expanded);
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

  if (mountOutlines.length) {
    const merged = hull([...outlines.flat(), ...mountOutlines.flat()]);
    outlines.length = 0;
    outlines.push(merged);
  }

  return { outlines, holes };
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
  const holeR = round(holeDiameterMm / 2, 3);
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
    dxfCircle(0, 0, holeR, 'HOLE'),
    dxfCircle(length, 0, holeR, 'HOLE'),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

export function exportLinksAsSvg(comps, pts, params, settings) {
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    downloadText(svgForLink(comp, length, settings), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  return links.length;
}

export function exportLinksAsDxf(comps, pts, params, settings) {
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    downloadText(dxfForLink(comp, length, settings), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  return links.length;
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
