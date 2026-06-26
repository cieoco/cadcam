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
 *   selectLink / selectSlider / setBanner / clearBanner / worldFromEvent /
 *   pointCoords / nearestDisplayToPoint / snapWorld / mobilePrompt / promptText
 */

import { S } from './state.js';
import * as View from './view.js';
import * as Model from './model.js';
import { ownedParamKeys } from './part-types.js';   // 零件型別表：元件擁有的 topo.params key

const SVG_NS = 'http://www.w3.org/2000/svg';
const { W, H, TX, TY } = View;
const barHullPath = View.barHullPath;

// 樂高孔距幾何常數與純 helper（與 app.js 同值；畫桿/三角的長度一律對齊 8mm 孔距）
const LEGO_STEP = 8;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);
const roundMm = v => Math.round(Number(v) || 0);

// ---- 注入的外部依賴（由 app 在啟動時提供）----
let svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectSlider,
    setBanner, clearBanner, worldFromEvent, pointCoords, nearestDisplayToPoint, snapWorld,
    mobilePrompt, promptText;

export function init(deps) {
  ({ svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectSlider,
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
  if (mobilePrompt()) {
    S.drawActive = false;
    S.drawStart = null;
    S.drawStartNodeId = null;
    S.drawPreview = null;
  } else {
    S.drawActive = true;                       // 進來就活著：滑鼠一移動就更新（不必壓住）
    S.drawStart = View.worldFromScreen(W * 0.18, H * 0.26); // 支點＝畫布左上、靠按鈕右側的空白處
    S.drawStartNodeId = null;                   // 新桿件兩端都自由：不自動吸附既有接點（要連接改用拖曳合併）
    S.drawPreview = { x: S.drawStart.x + LINK_DEFAULT_LEN, y: S.drawStart.y }; // 先給一根預設長度
  }
  setBanner(kind === 'rail'
    ? promptText('移動滑鼠拉出滑軌，按右鍵確定', '按住起點拖出滑軌，放開建立')
    : promptText('移動滑鼠改長度，按右鍵確定', '按住起點拖到終點，放開建立連桿'));
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

export function startDrawTriangle() {
  if (S.drawingTriangle) { exitDrawTriangle(); draw(); return; }
  pause();
  cancelMotorMode();
  exitDrawLink();
  deselectLink();
  S.drawingTriangle = true;
  S.triangleStage = 'base';
  const a = View.worldFromScreen(W * 0.18, H * 0.26);
  const b = { x: a.x + 64, y: a.y };
  const first = resolveTrianglePointAt(a);
  S.trianglePoints = [first];
  S.trianglePreview = b;
  svg.style.cursor = 'crosshair';
  setBanner(promptText(
    '三點桿：先移動調第一段，按右鍵確定（8mm 倍數）',
    '三點桿：先拖曳調第一段，放開確定（8mm 倍數）'
  ));
  draw();
}
export function exitDrawTriangle() {
  S.drawingTriangle = false;
  S.triangleStage = 'base';
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
    floating = S.triangleStage === 'base' ? resolveTriangleBaseEnd(S.trianglePreview) : resolveTriangleThirdPoint(S.trianglePreview);
    if (floating) pts.push(floating.pos);
  }
  if (pts.length >= 2) {
    const path = document.createElementNS(SVG_NS, pts.length >= 3 ? 'polygon' : 'polyline');
    path.setAttribute('points', pts.map(p => `${TX(p.x)},${TY(p.y)}`).join(' '));
    path.setAttribute('fill', pts.length >= 3 ? '#27ae6022' : 'none');
    path.setAttribute('stroke', '#27ae60');
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
  if (floating) {
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
function confirmTriangleBase(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (!cur || S.trianglePoints.length !== 1) return;
  const picked = resolveTriangleBaseEnd(cur);
  if (!picked) return;
  S.trianglePoints.push(picked);
  S.triangleStage = 'third';
  const a = S.trianglePoints[0].pos, b = S.trianglePoints[1].pos;
  S.trianglePreview = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.max(40, picked.len * 0.8) };
  setBanner(promptText(
    '三點桿：移動選第三孔，按一下或右鍵確定（距離自動對齊 8mm）',
    '三點桿：拖曳選第三孔，放開確定（距離自動對齊 8mm）'
  ));
  draw();
}
export function finishDrawTriangle(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (S.triangleStage === 'base') { confirmTriangleBase(e); return; }
  if (!cur || S.trianglePoints.length < 2) return;
  const picked = resolveTriangleThirdPoint(cur);
  if (!picked) return;
  pushUndo();
  const n = ++S.counter;
  const suffix = ['a', 'b', 'c'];
  const all = [...S.trianglePoints, picked];
  const pts = all.map((p, i) => ({
    id: p.nodeId || `T${n}${suffix[i]}`,
    type: 'floating',
    x: p.pos.x,
    y: p.pos.y
  }));
  const dist = (a, b) => Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const gParam = 'TG' + n, r1Param = 'TR1_' + n, r2Param = 'TR2_' + n;
  S.comps.push({
    type: 'triangle', id: 'Tri' + n, color: '#27ae60',
    p1: pts[0], p2: pts[1], p3: pts[2],
    gParam, r1Param, r2Param, sign: 1
  });
  S.topo.params[gParam] = dist(pts[0], pts[1]);
  S.topo.params[r1Param] = picked.r1 || dist(pts[0], pts[2]);
  S.topo.params[r2Param] = picked.r2 || dist(pts[1], pts[2]);
  S.selectedNodeId = pts[2].id;
  exitDrawTriangle();
  rebuild(); draw();
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
