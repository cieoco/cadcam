/**
 * blocks / tools
 *
 * 放置 / 繪製「工具模式」的互動層：畫桿（link）、畫滑軌（rail）、畫三點桿（triangle），
 * 以及把既有連桿就地升級成滑軌（convertLinkToSlider）。負責這些模式的進入 / 退出、
 * 拖曳預覽繪製、終點吸附判定，與放下時把零件 push 進 S.comps。
 *
 * 共用機構 / 編輯狀態直接 import state.js 的 S；座標投影與冰棒棍外形取自 view.js；
 * 節點合併取自 model.js。其餘跨檔 helper（app 的控制器動作與查詢）用 init() 注入，
 * 避免與 app 互相 import：
 *   svg / draw / rebuild / pushUndo / pause / cancelMotorMode / deselectLink /
 *   selectLink / selectTriangle / selectSlider / setBanner / clearBanner / worldFromEvent /
 *   pointCoords / nearestDisplayToPoint / snapWorld / mobilePrompt / promptText
 */

import { S } from './state.js';
import * as View from './view.js';
import * as Model from './model.js';
import { MAX_PLATE_POINTS, worldToLocal } from './plate-geometry.js';
import { ownedParamKeys } from './part-types.js';   // 零件型別表：元件擁有的 topo.params key

const SVG_NS = 'http://www.w3.org/2000/svg';
const { W, H, TX, TY } = View;
const barHullPath = View.barHullPath;
const roundedTriangleHullPath = View.roundedTriangleHullPath;
const jawPlatePath = View.jawPlatePath;

// 樂高孔距幾何常數與純 helper（與 app.js 同值；畫桿/三角的長度一律對齊 8mm 孔距）
const LEGO_STEP = 8;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);
const roundMm = v => Math.round(Number(v) || 0);
const pointLimitMessage = () => `多點桿最多 ${MAX_PLATE_POINTS} 點；點數太多時，請拆成兩片板件或減少外形控制點。`;

// ---- 注入的外部依賴（由 app 在啟動時提供）----
let svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle, selectSlider,
    setBanner, clearBanner, worldFromEvent, pointCoords, nearestDisplayToPoint, snapWorld,
    mobilePrompt, promptText;

export function init(deps) {
  ({ svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle, selectSlider,
     setBanner, clearBanner, worldFromEvent, pointCoords, nearestDisplayToPoint, snapWorld,
     mobilePrompt, promptText } = deps);
}

// ---- 畫桿模式：桌機點工具後移動游標調長度；手機則按住起點、拖到終點放開。----
export function startDrawLink() {
  if (S.drawingLink) { exitDrawLink(); draw(); return; } // 再點一次＝取消
  beginDraw('link');
}
// 滑軌：沿用連桿那套拖出線段的互動，只是放開後建的是 slider（軌道+滑塊）而非 bar。
export function startDrawRail() {
  if (S.drawingLink) { exitDrawLink(); draw(); return; }
  beginDraw('rail');
}
function beginDraw(kind) {
  pause();
  cancelMotorMode();
  exitDrawTriangle();
  deselectLink();
  S.drawKind = kind;
  S.drawingLink = true;
  svg.style.cursor = 'crosshair';
  // 連桿 / 滑軌統一改成「點兩下」：起點也由使用者自己點，不再自動落位（與三點桿一致）。
  // 觸控維持按下起點、拖曳、放開一筆完成，起點本來就落在按下處。
  S.drawActive = false;
  S.drawStart = null;
  S.drawStartNodeId = null;
  S.drawPreview = null;
  const noun = kind === 'rail' ? '滑軌' : '連桿';
  setBanner(promptText(
    `${noun}：左鍵點第一點`,
    kind === 'rail' ? '按住起點拖出滑軌，放開建立' : '按住起點拖到終點，放開建立連桿'
  ));
  draw();
}
export function exitDrawLink() {
  S.drawingLink = false;
  S.drawActive = false;
  S.drawStart = null;
  S.drawPreview = null;
  S.drawStartNodeId = null;
  S.drawKind = 'link';
  svg.style.cursor = '';
  clearBanner();
}
// 找最靠近某世界座標的既有接點 id（吸附用），exclude 內的略過
// 命中用「畫面實際位置」(displayCoords) 比對，才點得到 solver 驅動而位置已移動的接點。
export function nearestNodeId(world, exclude = [], maxDist = snapWorld()) {
  return nearestDisplayToPoint(world, exclude, maxDist);
}
// 從起點 start 拖到 cur 時，算出實際終點：靠近既有接點就吸附相接。
// 連桿長度對齊 8mm 孔距；滑軌/滑塊本體屬於外形尺寸，不套孔距限制。
function resolveDrawEnd(start, cur, startNodeId, snapToHoles = true) {
  // 新桿件兩端都自由：不再吸附／合併到既有接點（要連接改用拖曳節點合併，要分開用「分離」）
  const dx = cur.x - start.x, dy = cur.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) return { pos: { x: start.x + LINK_DEFAULT_LEN, y: start.y }, len: LINK_DEFAULT_LEN, nodeId: null };
  const len = snapToHoles ? snapLego(dist) : Math.max(1, roundMm(dist));
  const k = len / (dist || 1);
  return { pos: { x: start.x + dx * k, y: start.y + dy * k }, len, nodeId: null };
}
function linkLenLabel(len, nodeId = null) {
  const holes = (Math.abs(len % LEGO_STEP) < 0.01) ? ` / ${Math.round(len / LEGO_STEP) + 1}孔` : '';
  return len + 'mm' + holes + (nodeId ? ' 🔗' : '');
}
export function drawDrawPreview() {
  if (!S.drawingLink || !S.drawActive || !S.drawStart || !S.drawPreview) return;
  const isRail = S.drawKind === 'rail';
  const res = resolveDrawEnd(S.drawStart, S.drawPreview, S.drawStartNodeId, !isRail);
  const accent = isRail ? '#16a085' : '#3498db';
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', barHullPath(S.drawStart, res.pos));
  path.setAttribute('fill', accent + '22');
  path.setAttribute('stroke', accent);
  path.setAttribute('stroke-width', 2);
  path.setAttribute('stroke-dasharray', '8 6');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  const labelText = isRail ? ('滑軌 ' + res.len + 'mm') : linkLenLabel(res.len, res.nodeId);
  const isMobileLabel = mobilePrompt();
  const fontSize = isMobileLabel ? 22 : 13;
  const labelPadX = isMobileLabel ? 10 : 0;
  const labelPadY = isMobileLabel ? 6 : 0;
  const labelX = (TX(S.drawStart.x) + TX(res.pos.x)) / 2;
  const labelY = (TY(S.drawStart.y) + TY(res.pos.y)) / 2 - (isMobileLabel ? 18 : 10);
  if (isMobileLabel) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    const approxW = labelText.length * fontSize * 0.58 + labelPadX * 2;
    const approxH = fontSize + labelPadY * 2;
    bg.setAttribute('x', labelX - approxW / 2);
    bg.setAttribute('y', labelY - fontSize + 1 - labelPadY);
    bg.setAttribute('width', approxW);
    bg.setAttribute('height', approxH);
    bg.setAttribute('rx', 12);
    bg.setAttribute('ry', 12);
    bg.setAttribute('fill', '#ffffff');
    bg.setAttribute('fill-opacity', '0.92');
    bg.setAttribute('stroke', '#bcd3f0');
    bg.setAttribute('stroke-width', 1.5);
    svg.appendChild(bg);
  }
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', labelX);
  label.setAttribute('y', labelY);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-size', fontSize);
  label.setAttribute('font-weight', '700');
  label.setAttribute('fill', '#2c5282');
  label.setAttribute('paint-order', 'stroke');
  label.setAttribute('stroke', '#ffffff');
  label.setAttribute('stroke-width', isMobileLabel ? 3 : 0);
  label.textContent = labelText;
  svg.appendChild(label);
}

export function startDrawTriangle(shape = 'triangle') {
  if (S.drawingTriangle) { exitDrawTriangle(); draw(); return; }
  pause();
  cancelMotorMode();
  exitDrawLink();
  deselectLink();
  S.drawingTriangle = true;
  S.triangleShape = shape === 'jaw' ? 'jaw' : 'triangle';
  // 三點桿統一改成「左鍵點三下」：第一點也由使用者自己點，不再自動落位。
  S.triangleStage = 'first';
  S.trianglePoints = [];
  S.trianglePreview = View.worldFromScreen(W * 0.5, H * 0.5);
  svg.style.cursor = 'crosshair';
  const label = S.triangleShape === 'jaw' ? '夾爪板' : '桿件';
  setBanner(promptText(
    `${label}：左鍵點第一點`,
    `${label}：點一下放第一點`
  ));
  draw();
}
export function exitDrawTriangle() {
  S.drawingTriangle = false;
  S.triangleShape = 'triangle';
  S.triangleStage = 'first';
  S.trianglePoints = [];
  S.trianglePreview = null;
  if (!S.drawingLink) svg.style.cursor = '';
  if (!S.drawingLink) clearBanner();
}
function resolveTrianglePointAt(world, exclude = []) {
  const used = exclude.filter(Boolean);
  const nodeId = nearestNodeId(world, used);
  if (nodeId) {
    const p = pointCoords()[nodeId];
    return { nodeId, pos: { x: p.x, y: p.y } };
  }
  return { nodeId: null, pos: { x: world.x, y: world.y } };
}
function resolveTrianglePoint(world) {
  return resolveTrianglePointAt(world, S.trianglePoints.map(p => p.nodeId));
}
function canAddPlatePoint(extraCount = 1) {
  if (S.trianglePoints.length + extraCount <= MAX_PLATE_POINTS) return true;
  setBanner(pointLimitMessage());
  return false;
}
function resolveTriangleBaseEnd(cur) {
  const start = S.trianglePoints[0];
  if (!start) return null;
  const endNodeId = nearestNodeId(cur, start.nodeId ? [start.nodeId] : []);
  if (endNodeId) {
    const p = pointCoords()[endNodeId];
    const d = Math.hypot(p.x - start.pos.x, p.y - start.pos.y);
    const L = legoLength(d);
    if (Math.abs(d - L) < 0.75) return { nodeId: endNodeId, pos: { x: p.x, y: p.y }, len: L };
  }
  const dx = cur.x - start.pos.x, dy = cur.y - start.pos.y;
  const dist = Math.hypot(dx, dy);
  const len = dist < 6 ? 64 : legoLength(dist);
  const k = len / (dist || 1);
  return { nodeId: null, pos: { x: start.pos.x + dx * k, y: start.pos.y + dy * k }, len };
}
function legoLength(v) {
  return snapLego(v);
}
function jawTurnSign(pivot, drive, tip) {
  const dx = tip.x - pivot.x;
  const dy = tip.y - pivot.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return 1;
  const cross = (dx / len) * (drive.y - pivot.y) - (dy / len) * (drive.x - pivot.x);
  return Math.sign(cross) || 1;
}
function resolveTriangleThirdPoint(cur) {
  if (S.trianglePoints.length < 2) return null;
  const a = S.trianglePoints[0].pos;
  const b = S.trianglePoints[1].pos;
  const exclude = S.trianglePoints.map(p => p.nodeId).filter(Boolean);
  const nodeId = nearestNodeId(cur, exclude);
  if (nodeId) {
    const p = pointCoords()[nodeId];
    const d1 = Math.hypot(p.x - a.x, p.y - a.y);
    const d2 = Math.hypot(p.x - b.x, p.y - b.y);
    if (Math.abs(d1 - legoLength(d1)) < 0.75 && Math.abs(d2 - legoLength(d2)) < 0.75) {
      return { nodeId, pos: { x: p.x, y: p.y }, r1: legoLength(d1), r2: legoLength(d2) };
    }
  }

  const base = Math.hypot(b.x - a.x, b.y - a.y);
  const d1Target = legoLength(Math.hypot(cur.x - a.x, cur.y - a.y));
  const d2Target = legoLength(Math.hypot(cur.x - b.x, cur.y - b.y));
  let best = null, bestScore = Infinity;
  const tryCandidate = (r1, r2) => {
    if (r1 < LEGO_STEP || r2 < LEGO_STEP) return;
    if (r1 + r2 < base || Math.abs(r1 - r2) > base) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-6) return;
    const along = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - along * along;
    if (h2 < -1e-6) return;
    const h = Math.sqrt(Math.max(0, h2));
    const ux = dx / d, uy = dy / d;
    const px = a.x + along * ux, py = a.y + along * uy;
    const nx = -uy, ny = ux;
    [{ x: px + h * nx, y: py + h * ny }, { x: px - h * nx, y: py - h * ny }].forEach(pos => {
      const score = Math.hypot(pos.x - cur.x, pos.y - cur.y);
      if (score < bestScore) { bestScore = score; best = { nodeId: null, pos, r1, r2 }; }
    });
  };
  for (let r1 = Math.max(LEGO_STEP, d1Target - 80); r1 <= d1Target + 80; r1 += LEGO_STEP) {
    for (let r2 = Math.max(LEGO_STEP, d2Target - 80); r2 <= d2Target + 80; r2 += LEGO_STEP) {
      tryCandidate(r1, r2);
    }
  }
  return best;
}
export function drawTrianglePreview() {
  if (!S.drawingTriangle) return;
  const pts = S.trianglePoints.map(p => p.pos);
  let floating = null;
  if (S.trianglePreview) {
    if (S.triangleStage === 'first') floating = resolveTrianglePoint(S.trianglePreview);
    else if (S.triangleStage === 'base') floating = resolveTriangleBaseEnd(S.trianglePreview);
    else floating = resolveTriangleThirdPoint(S.trianglePreview);
    if (floating) pts.push(floating.pos);
  }
  if (pts.length >= 2) {
    const path = document.createElementNS(SVG_NS, 'path');
    const isJaw = S.triangleShape === 'jaw';
    const d = pts.length >= 3
      ? (isJaw ? jawPlatePath(pts[0], pts[1], pts[2], jawTurnSign(pts[0], pts[1], pts[2])) : roundedTriangleHullPath(pts[0], pts[1], pts[2]))
      : `M ${TX(pts[0].x)} ${TY(pts[0].y)} L ${TX(pts[1].x)} ${TY(pts[1].y)}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', pts.length >= 3 ? (isJaw ? '#ff704322' : '#27ae6022') : 'none');
    path.setAttribute('stroke', isJaw ? '#ff7043' : '#27ae60');
    path.setAttribute('stroke-width', 2);
    path.setAttribute('stroke-dasharray', '8 6');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }
  pts.forEach((p, idx) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', TX(p.x)); c.setAttribute('cy', TY(p.y));
    c.setAttribute('r', 6);
    c.setAttribute('fill', idx < S.trianglePoints.length ? '#27ae60' : '#fff');
    c.setAttribute('stroke', '#117a45');
    c.setAttribute('stroke-width', 2);
    svg.appendChild(c);
  });
  if (floating && S.triangleStage !== 'first') {
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', TX(floating.pos.x));
    label.setAttribute('y', TY(floating.pos.y) - 12);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '13');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', '#117a45');
    label.textContent = S.triangleStage === 'base'
      ? `${floating.len}mm`
      : `${floating.r1}/${floating.r2}mm`;
    svg.appendChild(label);
  }
}
// 左鍵放下第一點（可吸附既有接點），進入底邊階段。
function confirmTriangleFirst(cur) {
  if (!cur) return;
  const first = resolveTrianglePoint(cur);
  S.trianglePoints = [first];
  S.triangleStage = 'base';
  S.trianglePreview = { x: first.pos.x + 64, y: first.pos.y };
  const label = S.triangleShape === 'jaw' ? '夾爪板' : '桿件';
  setBanner(promptText(
    `${label}：移動定第二點，左鍵確定（8mm 倍數）`,
    `${label}：移動定第二點，放開確定（8mm 倍數）`
  ));
  draw();
}
function confirmTriangleBase(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (!cur || S.trianglePoints.length !== 1) return;
  if (!canAddPlatePoint()) return;
  const picked = resolveTriangleBaseEnd(cur);
  if (!picked) return;
  S.trianglePoints.push(picked);
  S.triangleStage = 'third';
  const a = S.trianglePoints[0].pos, b = S.trianglePoints[1].pos;
  S.trianglePreview = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.max(40, picked.len * 0.8) };
  const label = S.triangleShape === 'jaw' ? '夾爪板' : '桿件';
  setBanner(promptText(
    `${label}：移動定第三點，左鍵完成`,
    `${label}：移動定第三點，放開完成`
  ));
  draw();
}
function finishTriangleAsLink() {
  if (S.trianglePoints.length < 2) return;
  pushUndo();
  const n = ++S.counter;
  const lp = 'LL' + n;
  const a = S.trianglePoints[0];
  const b = S.trianglePoints[1];
  const len = Math.round(Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y));
  S.comps.push({
    type: 'bar', id: 'Link' + n, color: '#3498db',
    p1: { id: a.nodeId || 'P' + n + 'a', type: 'floating', x: a.pos.x, y: a.pos.y },
    p2: { id: b.nodeId || 'P' + n + 'b', type: 'floating', x: b.pos.x, y: b.pos.y },
    lenParam: lp, isInput: false, fixedLen: true
  });
  S.topo.params[lp] = len;
  exitDrawTriangle();
  rebuild(); draw();
  if (selectLink) selectLink('Link' + n);
}
function finishTriangleFromPoints() {
  if (S.trianglePoints.length < 3) return;
  pushUndo();
  const n = ++S.counter;
  const suffix = ['a', 'b', 'c'];
  const all = S.trianglePoints.slice(0, 3);
  const pts = all.map((p, i) => ({
    id: p.nodeId || `T${n}${suffix[i]}`,
    type: 'floating',
    x: p.pos.x,
    y: p.pos.y
  }));
  const dist = (a, b) => Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const gParam = 'TG' + n, r1Param = 'TR1_' + n, r2Param = 'TR2_' + n;
  const isJaw = S.triangleShape === 'jaw';
  const comp = {
    type: 'triangle', id: (isJaw ? 'Jaw' : 'Tri') + n, color: isJaw ? '#ff7043' : '#27ae60',
    p1: pts[0], p2: pts[1], p3: pts[2],
    gParam, r1Param, r2Param, sign: 1
  };
  if (isJaw) {
    comp.shape = 'jaw';
    comp.shapeMode = 'polyline';
    comp.jawTurnSign = jawTurnSign(pts[0], pts[1], pts[2]);
  }
  S.comps.push(comp);
  S.topo.params[gParam] = dist(pts[0], pts[1]);
  S.topo.params[r1Param] = dist(pts[0], pts[2]);
  S.topo.params[r2Param] = dist(pts[1], pts[2]);
  exitDrawTriangle();
  rebuild(); draw();
  if (selectTriangle) selectTriangle(comp.id);
}
// 確認第三點並建立三點板 / 夾爪板（第三點一放下就完成）。
function confirmTriangleThird(cur) {
  if (!cur || S.trianglePoints.length < 2) return;
  if (!canAddPlatePoint()) return;
  const picked = resolveTriangleThirdPoint(cur);
  if (!picked) return;
  S.trianglePoints.push(picked);
  finishTriangleFromPoints();
}
// 滑鼠：左鍵一路點三下（第一點 → 底邊第二點 → 第三點完成）。
export function placeTrianglePoint(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (!cur) return;
  if (S.triangleStage === 'first') { confirmTriangleFirst(cur); return; }
  if (S.triangleStage === 'base') { confirmTriangleBase(e); return; }
  confirmTriangleThird(cur);
}
// 觸控 / 觸控筆：每次「拖曳→放開」推進一個點，第三點放開即完成。
export function finishDrawTriangle(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (S.triangleStage === 'first') { confirmTriangleFirst(cur); return; }
  if (S.triangleStage === 'base') { confirmTriangleBase(e); return; }
  confirmTriangleThird(cur);
}
// 右鍵逃生門：若已放好底邊（≥2 點）就只用前兩點做連桿；夾爪板不適用。
export function finishPlateAsLinkEarly() {
  if (!S.drawingTriangle || S.triangleShape === 'jaw') return;
  if (S.trianglePoints.length >= 2) finishTriangleAsLink();
}

/* ---- 板件：逐點畫孔、右鍵（或點回起點）收尾。角色由畫的順序決定 ----
 * 前 3 孔＝機構求解孔（p1/p2/p3，進求解）；第 4 孔起＝造形孔（只描外形＋鑽孔，不進求解）。
 * 這一版求解仍沿用三點板；2 求解點的耦桿板留待 Phase 4（需改編譯層的 p3 前提）。 */
export function startDrawPolygon() {
  if (S.drawingPolygon) { exitDrawPolygon(); draw(); return; }
  pause();
  cancelMotorMode();
  exitDrawLink();
  exitDrawTriangle();
  deselectLink();
  S.drawingPolygon = true;
  S.polygonPoints = [];
  S.polygonPreview = View.worldFromScreen(W * 0.5, H * 0.5);
  svg.style.cursor = 'crosshair';
  setBanner(promptText(
    '板件：前 3 孔＝機構求解孔，第 4 點起＝造形點（描外形、預設不鑽孔）；右鍵完成',
    '板件：前 3 孔＝機構孔，之後＝造形點（不鑽孔）；點回起點完成'
  ));
  draw();
}
export function exitDrawPolygon() {
  S.drawingPolygon = false;
  S.polygonPoints = [];
  S.polygonPreview = null;
  if (!S.drawingLink) svg.style.cursor = '';
  if (!S.drawingLink) clearBanner();
}
function polygonNearFirst(world) {
  const first = S.polygonPoints[0];
  if (!first || !world) return false;
  return Math.hypot(world.x - first.pos.x, world.y - first.pos.y) <= snapWorld();
}
// 左鍵：加一個孔（吸附既有接點）；若點回起點且已 ≥3 孔則收尾建立。
export function addPolygonVertex(e) {
  const cur = worldFromEvent(e) || S.polygonPreview;
  if (!cur) return;
  if (S.polygonPoints.length >= 3 && polygonNearFirst(cur)) { finishPolygonDraw(); return; }
  if (S.polygonPoints.length >= MAX_PLATE_POINTS) {
    setBanner(`板件最多 ${MAX_PLATE_POINTS} 孔（前 3 為機構孔）`);
    return;
  }
  const picked = resolveTrianglePointAt(cur, S.polygonPoints.map(p => p.nodeId));
  S.polygonPoints.push(picked);
  const done = S.polygonPoints.length;
  setBanner(done < 3
    ? promptText(`機構孔 ${done}/3；再點放下一孔`, `機構孔 ${done}/3`)
    : promptText('造形點（描外形、不鑽孔）；右鍵完成，或繼續加點', '造形點；點回起點完成'));
  draw();
}
// 右鍵（或點回起點）：≥3 孔就建立板件（前 3 求解、其餘造形孔）。
export function finishPolygonDraw() {
  if (S.polygonPoints.length < 3) { setBanner('板件至少要 3 孔'); return; }
  buildPolygonPlate();
}
function buildPolygonPlate() {
  const all = S.polygonPoints;
  if (all.length < 3) return;
  pushUndo();
  const n = ++S.counter;
  const suffix = ['a', 'b', 'c'];
  const solvePts = all.slice(0, 3);                   // 前 3 孔＝機構求解孔
  const pNode = solvePts.map((p, k) => ({
    id: p.nodeId || `T${n}${suffix[k]}`,
    type: 'floating',
    x: p.pos.x,
    y: p.pos.y
  }));
  const basis = [solvePts[0].pos, solvePts[1].pos];   // 局部座標系＝前兩個機構孔（p1→p2）
  const vertices = all.map((p, i) => {
    if (i < 3) return { solve: true, ref: ['p1', 'p2', 'p3'][i] };
    // 造形點：存局部座標、只描外形。DXF 預設不鑽孔（hole 旗標可日後逐點再設定）。
    const local = worldToLocal(basis, p.pos);
    return { solve: false, u: Number((local && local.u || 0).toFixed(1)), v: Number((local && local.v || 0).toFixed(1)) };
  });
  const dist = (a, b) => Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const gParam = 'TG' + n, r1Param = 'TR1_' + n, r2Param = 'TR2_' + n;
  const comp = {
    type: 'triangle', id: 'Tri' + n, color: '#27ae60',
    p1: pNode[0], p2: pNode[1], p3: pNode[2],
    gParam, r1Param, r2Param, sign: 1,
    vertices
  };
  S.comps.push(comp);
  S.topo.params[gParam] = dist(pNode[0], pNode[1]);
  S.topo.params[r1Param] = dist(pNode[0], pNode[2]);
  S.topo.params[r2Param] = dist(pNode[1], pNode[2]);
  exitDrawPolygon();
  rebuild(); draw();
  if (selectTriangle) selectTriangle(comp.id);
}
export function drawPolygonPreview() {
  if (!S.drawingPolygon) return;
  const pts = S.polygonPoints.map(p => p.pos);
  const chain = pts.slice();
  let closing = false;
  if (S.polygonPreview) {
    closing = pts.length >= 3 && polygonNearFirst(S.polygonPreview);
    if (!closing) chain.push(S.polygonPreview);
  }
  if (chain.length >= 2) {
    const d = 'M ' + chain.map(p => `${TX(p.x)} ${TY(p.y)}`).join(' L ') + (closing ? ' Z' : '');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', closing ? '#27ae6022' : 'none');
    path.setAttribute('stroke', '#27ae60');
    path.setAttribute('stroke-width', 2);
    path.setAttribute('stroke-dasharray', '8 6');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }
  pts.forEach((p, i) => {
    const solve = i < 3;                               // 前 3＝機構孔（綠實心），其餘＝造形點（橘框空心＝不鑽孔）
    const highlightFirst = i === 0 && closing;
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', TX(p.x)); c.setAttribute('cy', TY(p.y));
    c.setAttribute('r', solve ? 7 : 6);
    c.setAttribute('fill', highlightFirst ? '#f1c40f' : (solve ? '#27ae60' : '#fff'));
    c.setAttribute('stroke', solve ? '#117a45' : '#e67e22');
    c.setAttribute('stroke-width', 2);
    svg.appendChild(c);
  });
}
// 滑鼠：左鍵點兩下（第一點放起點，第二點確定長度並建立）；與三點桿的操作一致。
export function placeLinkPoint(e) {
  const cur = worldFromEvent(e) || S.drawPreview;
  if (!cur) return;
  if (!S.drawActive || !S.drawStart) {
    S.drawStart = { x: cur.x, y: cur.y };
    S.drawStartNodeId = null;                  // 兩端都自由：起點不自動吸附（連接改用拖曳合併）
    S.drawPreview = { x: cur.x + LINK_DEFAULT_LEN, y: cur.y };
    S.drawActive = true;
    const noun = S.drawKind === 'rail' ? '滑軌' : '連桿';
    setBanner(promptText(
      `${noun}：移動改長度，左鍵建立`,
      `${noun}：移動改長度，左鍵建立`
    ));
    draw();
    return;
  }
  finishDrawLink(e);
}
export function finishDrawLink(e) {
  if (!S.drawStart) return;
  const cur = worldFromEvent(e) || S.drawPreview || S.drawStart;
  const res = resolveDrawEnd(S.drawStart, cur, S.drawStartNodeId, S.drawKind !== 'rail');
  if (S.drawKind === 'rail') { finishDrawRail(res); return; }
  pushUndo();
  const n = ++S.counter;
  const lp = 'LL' + n;
  S.comps.push({
    type: 'bar', id: 'Link' + n, color: '#3498db',
    p1: { id: 'P' + n + 'a', type: 'floating', x: S.drawStart.x, y: S.drawStart.y },
    p2: { id: 'P' + n + 'b', type: 'floating', x: res.pos.x, y: res.pos.y },
    lenParam: lp, isInput: false, fixedLen: true
  });
  S.topo.params[lp] = res.len;
  // 端點落在既有接點上就合併相接（這就是「連接」）
  if (S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'P' + n + 'a', S.drawStartNodeId);
  if (res.nodeId && res.nodeId !== S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'P' + n + 'b', res.nodeId);
  exitDrawLink();
  rebuild(); draw();
  selectLink('Link' + n);
}
// 滑軌：軌道兩端釘地（fixed），中點放一個滑塊點（floating），沿軌道滑動。
// 之後用🔵連桿把曲柄端接到滑塊點，compile 會自動把它解成 slider（滑塊曲柄）。
function finishDrawRail(res) {
  pushUndo();
  const n = ++S.counter;
  const a = { x: S.drawStart.x, y: S.drawStart.y };
  const b = { x: res.pos.x, y: res.pos.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const lp = 'SL' + n;
  S.comps.push({
    type: 'slider', id: 'Slider' + n, color: '#16a085', sign: 1,
    p1: { id: 'S' + n + 'a', type: 'fixed', x: a.x, y: a.y },
    p2: { id: 'S' + n + 'b', type: 'fixed', x: b.x, y: b.y },
    p3: { id: 'S' + n + 'c', type: 'floating', x: mid.x, y: mid.y },
    m1: { id: 'S' + n + 'm1', type: 'fixed', x: a.x, y: a.y },
    m2: { id: 'S' + n + 'm2', type: 'fixed', x: b.x, y: b.y },
    lenParam: lp,
    baseEnd: 'p1',
    carriageLen: 32,
    carrierLen: res.len,
    railOffset: 0,
    travelStart: 0,
    travelEnd: res.len
  });
  S.topo.params[lp] = res.len;
  // 軌道端點落在既有接點上就合併（讓滑軌掛到既有結構）
  if (S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'S' + n + 'a', S.drawStartNodeId);
  if (res.nodeId && res.nodeId !== S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'S' + n + 'b', res.nodeId);
  exitDrawLink();
  rebuild(); draw();
  setBanner(promptText('用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動', '用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動'));
}
// 連桿就地升級成滑軌：另一條建置路徑——先用連桿把結構接好、錨好，再把要滑動的那根變成滑軌。
// 沿用連桿兩端點的 id 當承載桿件固定孔（m1/m2），原本的連接 / 地錨都靠 id 參照自動保留；
// 軌道（p1/p2）整段貼著承載桿件、滑塊（p3）落在中點，與🟩滑軌工具畫出來的形狀一致。
export function convertLinkToSlider() {
  const c = S.comps.find(x => x.id === S.selectedLinkId && x.type === 'bar' && x.fixedLen);
  if (!c) return;
  pushUndo();
  pause();
  const aId = c.p1.id, bId = c.p2.id;
  const a = { x: c.p1.x || 0, y: c.p1.y || 0 };
  const b = { x: c.p2.x || 0, y: c.p2.y || 0 };
  const len = Math.max(1, Math.round(S.topo.params[c.lenParam] || Math.hypot(b.x - a.x, b.y - a.y)));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const n = ++S.counter;
  const lp = 'SL' + n;
  // 移除原連桿：剛性桿約束由固定的承載桿件取代，避免同兩點同時有桿與移動副
  // 清掉原連桿佔用的參數（型別表宣告它擁有哪些）
  ownedParamKeys(c).forEach(k => delete S.topo.params[k]);
  S.comps = S.comps.filter(x => x.id !== c.id);
  S.comps.push({
    type: 'slider', id: 'Slider' + n, color: '#16a085', sign: 1,
    p1: { id: 'S' + n + 'a', type: 'fixed', x: a.x, y: a.y },
    p2: { id: 'S' + n + 'b', type: 'fixed', x: b.x, y: b.y },
    p3: { id: 'S' + n + 'c', type: 'floating', x: mid.x, y: mid.y },
    // 沿用連桿端點 id → 承載桿件固定孔，保留原本接好的連接與地錨
    m1: { id: aId, type: 'fixed', x: a.x, y: a.y },
    m2: { id: bId, type: 'fixed', x: b.x, y: b.y },
    lenParam: lp,
    baseEnd: 'p1',
    carriageLen: 32,
    carrierLen: len,
    railOffset: 0,
    travelStart: 0,
    travelEnd: len
  });
  S.topo.params[lp] = len;
  S.selectedLinkId = null;
  rebuild(); draw();
  selectSlider('Slider' + n);
  setBanner(promptText('連桿已變成滑軌：用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動', '連桿已變成滑軌：用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動'));
}
