/**
 * blocks / view
 *
 * 視圖投影層：世界座標 (mm) <-> 畫面座標 (svg user units)，以及桿件的「冰棒棍」外形路徑。
 * 純計算（barHullPath 不碰 DOM；worldFromEvent / zoomAt 只讀傳入的 svg 做 CTM 反轉）。
 *
 * 投影狀態（scale / ox / oy）是可變的：縮放與平移都改這三個值，TX/TY 即時反映，
 * 其餘模組透過介面取用，不需要知道投影細節。座標單位是 svg viewBox 的 user units
 * （0..W, 0..H），與螢幕 px 之間的換算交給 CTM。
 */

import {
  DEFAULT_PLATE_RADIUS_WORLD,
  createPlateGeometry,
  plateCenterline,
  roundedHullOutline
} from './plate-geometry.js';

export const W = 900;
export const H = 560;
export const HULL_R_WORLD = DEFAULT_PLATE_RADIUS_WORLD;        // 冰棒棍外形半徑（世界 mm）

const SCALE_DEFAULT = 1.4;            // 1mm = 1.4 user units（初始）
const SCALE_MIN = 0.2;
const SCALE_MAX = 8;
const SNAP_PX = 18;                   // 吸附門檻（畫面 user units，換算回世界）

// ---- 可變投影狀態 ----
let scale = SCALE_DEFAULT;
let ox = W / 2;                       // 世界原點對到的畫面 x
let oy = H / 2;                       // 世界原點對到的畫面 y

const clampScale = s => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s));

export const TX = x => ox + x * scale;
export const TY = y => oy - y * scale; // y 向上為正

export function getScale() { return scale; }
export function snapWorld() { return SNAP_PX / scale; } // 吸附門檻（世界 mm，隨縮放維持固定畫面距離）

// 把畫面座標（svg user units，0..W / 0..H）反推成世界座標。
// 畫桿時用來把支點放在「畫布左上、靠連桿按鈕右側的空白處」，而非正中央。
export function worldFromScreen(sx, sy) {
  return { x: (sx - ox) / scale, y: (oy - sy) / scale };
}

export function resetView() {
  scale = SCALE_DEFAULT;
  ox = W / 2;
  oy = H / 2;
}

// 由指標事件反推世界座標（需要 svg 元素做 CTM 反轉）
export function worldFromEvent(svg, e) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: (p.x - ox) / scale, y: (oy - p.y) / scale };
}

// 以游標 / 雙指中心為錨點縮放：縮放後該點在世界中的位置不變（畫面不會跳走）。
export function zoomAt(svg, clientX, clientY, factor) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse()); // svg user 座標
  const wx = (p.x - ox) / scale;
  const wy = (oy - p.y) / scale;
  scale = clampScale(scale * factor);
  ox = p.x - wx * scale;             // 讓 (wx,wy) 仍落在 p
  oy = p.y + wy * scale;
}

// 依「畫面 px 位移」平移（換算成 user units）。
export function panByClient(svg, dxClient, dyClient) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  ox += dxClient / ctm.a;
  oy += dyClient / ctm.d;
}

// 把世界外接框 fit 進畫面（含留白），並置中。
export function fit(bounds) {
  if (!bounds) { resetView(); return; }
  const padPx = 50;
  const wWorld = Math.max(1, bounds.maxX - bounds.minX);
  const hWorld = Math.max(1, bounds.maxY - bounds.minY);
  const sx = (W - 2 * padPx) / wWorld;
  const sy = (H - 2 * padPx) / hWorld;
  scale = clampScale(Math.min(sx, sy));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  ox = W / 2 - cx * scale;
  oy = H / 2 + cy * scale;
}

// 把一根桿（兩端點 a、b）算成「冰棒棍」外形：兩端圓 + 外切線 + 半圓封口。
// 切線/封弧的幾何沿用 mechanism 零件外形（js/parts/renderer.js 的 computeTangentHullPathQuiet），
// 確保半圓封口方向正確。座標用 TX/TY 轉到畫面，弧半徑乘 scale。
export function barHullPath(a, b) {
  const r = HULL_R_WORLD;
  const getTangent = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return null;
    const nx = dy / dist, ny = -dx / dist; // 右側法線（CCW 走訪的外側）
    return {
      start: { x: p.x + nx * r, y: p.y + ny * r },
      end: { x: q.x + nx * r, y: q.y + ny * r }
    };
  };
  const t1 = getTangent(a, b), t2 = getTangent(b, a);
  if (!t1 || !t2) return '';
  const R = r * scale;
  let d = `M ${TX(t1.start.x)} ${TY(t1.start.y)} `;
  d += `L ${TX(t1.end.x)} ${TY(t1.end.y)} `;
  d += `A ${R} ${R} 0 1 0 ${TX(t2.start.x)} ${TY(t2.start.y)} `;
  d += `L ${TX(t2.end.x)} ${TY(t2.end.y)} `;
  d += `A ${R} ${R} 0 1 0 ${TX(t1.start.x)} ${TY(t1.start.y)} Z`;
  return d;
}

// 三個孔中心的圓角三角板外形：把三個等半徑圓做外切線 hull。
export function roundedTriangleHullPath(a, b, c) {
  return polylineOutlinePath(roundedHullOutline([a, b, c], HULL_R_WORLD));
}

function arcWorldPoints(center, radius, a0, a1, steps = 10, shortest = false) {
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

function arcWorldPointsClockwise(center, radius, a0, a1, steps = 14) {
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
        chain.push(...arcWorldPoints(p, radius, sideAngle(prev, side), sideAngle(next, side), 10, true));
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
    ...arcWorldPointsClockwise(clean[clean.length - 1], radius, sideAngle(last, 1), sideAngle(last, -1), 14),
    ...right.reverse(),
    ...arcWorldPointsClockwise(clean[0], radius, sideAngle(first, -1), sideAngle(first, 1), 14)
  ];
}

function polylineOutlinePath(points) {
  if (!points.length) return '';
  return points.map((p, i) => `${i ? 'L' : 'M'} ${TX(p.x)} ${TY(p.y)}`).join(' ') + ' Z';
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

export function jawPlateStrokePath(pivot, drive, tip, turnSign = 0) {
  const centerline = plateCenterline({ shape: 'jaw', jawTurnSign: turnSign }, [pivot, drive, tip]);
  if (!centerline) return '';
  return centerline.map((p, i) => `${i ? 'L' : 'M'} ${TX(p.x)} ${TY(p.y)}`).join(' ');
}

export function jawPlatePath(pivot, drive, tip, turnSign = 0) {
  const geometry = createPlateGeometry(
    { shape: 'jaw', jawTurnSign: turnSign },
    [pivot, drive, tip],
    { radius: HULL_R_WORLD }
  );
  const outline = geometry.outlines[0];
  return outline && outline.length ? polylineOutlinePath(outline) : roundedTriangleHullPath(pivot, drive, tip);
}

export function platePath(comp, points, extras = null) {
  const geometry = createPlateGeometry(comp, points, { radius: HULL_R_WORLD, ...(extras || {}) });
  const outline = geometry.outlines[0];
  if (!outline || !outline.length) return '';
  // 切割槽（如 MG995 穿板槽）當子路徑附加；呼叫端配合 fill-rule="evenodd" 讀作板上開孔。
  const rings = [outline, ...(geometry.cutouts || []).map(c => c.points)];
  return rings.map(polylineOutlinePath).join(' ');
}
