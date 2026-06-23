/**
 * blocks / render
 *
 * SVG 繪製基元（純呈現層）：把座標 / 角度 / 尺寸畫成 SVG 元素，畫進指定的 parent。
 * 不持有機構狀態（comps / theta…）——一律由呼叫端把算好的座標傳進來。
 *
 * 兩個外部依賴用 init() 注入，避免與 app 狀態互相 import：
 *   - svg         預設 parent（drawGround 與各函式的 parent 預設值）
 *   - onNodeDown  滑軌固定孔的指標互動（回呼到 app 的拖曳處理）
 *
 * 座標投影 / 冰棒棍外形一律取自 view.js（TX / TY / barHullPath / getScale）。
 */

import * as View from './view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const { TX, TY, W } = View;
const barHullPath = View.barHullPath;

// ---- 注入的外部依賴 ----
let _svg = null;             // 預設 parent
let _onNodeDown = () => {};   // 滑軌固定孔的 pointerdown 回呼

export function init({ svg, onNodeDown }) {
  _svg = svg;
  if (onNodeDown) _onNodeDown = onNodeDown;
}

// 飄浮地面基線（沒有固定銷時的世界地板暗示）；機架連接線在 app.js drawGround()。
export function drawGroundBaseline(parent = _svg) {
  const y = TY(0);
  const base = document.createElementNS(SVG_NS, 'line');
  base.setAttribute('x1', 0); base.setAttribute('y1', y);
  base.setAttribute('x2', W); base.setAttribute('y2', y);
  base.setAttribute('stroke', '#cfd6e0'); base.setAttribute('stroke-width', 2);
  parent.appendChild(base);
  for (let x = 20; x < W; x += 26) {
    const h = document.createElementNS(SVG_NS, 'line');
    h.setAttribute('x1', x); h.setAttribute('y1', y);
    h.setAttribute('x2', x - 10); h.setAttribute('y2', y + 10);
    h.setAttribute('stroke', '#dfe4ec'); h.setAttribute('stroke-width', 2);
    parent.appendChild(h);
  }
}

// 在馬達中心畫一顆 TT 減速馬達（黃色齒輪箱 + 側視方形馬達罐 + 輸出軸）。
// 畫在桿件底下當固定基座；尺寸用真實比例（mm）並隨縮放縮放。
// rotDeg＝整顆繞輸出軸旋轉的角度（0＝朝畫面下方）；本體沿局部 +Y 方向延伸。
export function drawTTMotor(cx, cy, rotDeg = 0, parent = _svg) {
  const s = View.getScale();
  const jx = TX(cx), jy = TY(cy);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${jx} ${jy}) rotate(${rotDeg})`);
  g.style.pointerEvents = 'none';
  const add = (el, attrs) => {
    const e = document.createElementNS(SVG_NS, el);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    g.appendChild(e);
    return e;
  };
  const sw = (v) => Math.max(1, v * s);
  // TT 馬達側視比例：齒輪箱 37×22.5、輸出軸距頂端 11、馬達罐約 20.5 高、22 長。
  const Wb = 22.5 * s, Lb = 37 * s, ax = 11 * s, Hc = 20.5 * s, Lc = 22 * s, r = 4 * s;
  const top = -ax;                             // 局部座標：軸在原點，齒輪箱頂端在 -ax
  // DC 馬達罐側視：靠齒輪箱端是平的，末端才收圓角。
  const canW = Hc, canTop = top + Lb - r, canEnd = canTop + Lc, canR = 5 * s;
  add('path', {
    d: [
      `M ${-canW / 2} ${canTop}`,
      `L ${canW / 2} ${canTop}`,
      `L ${canW / 2} ${canEnd - canR}`,
      `Q ${canW / 2} ${canEnd} ${canW / 2 - canR} ${canEnd}`,
      `L ${-canW / 2 + canR} ${canEnd}`,
      `Q ${-canW / 2} ${canEnd} ${-canW / 2} ${canEnd - canR}`,
      'Z'
    ].join(' '),
    fill: '#5f6b75', stroke: '#3a434b', 'stroke-width': sw(1)
  });
  // 齒輪箱（黃色圓角矩形）
  add('rect', { x: -Wb / 2, y: top, width: Wb, height: Lb, rx: r, ry: r, fill: '#f7c948', stroke: '#c9971b', 'stroke-width': sw(1.4) });
  // 齒輪箱上的固定孔裝飾
  add('circle', { cx: 0, cy: top + Lb * 0.66, r: 2.4 * s, fill: 'none', stroke: '#c9971b', 'stroke-width': sw(1) });
  parent.appendChild(g);
  return g;   // 回傳根 <g>：播放快路徑只改它的 transform（位置/朝向），不重建內部
}

// MG995 伺服側視：藍色扁方殼 + 兩側固定耳 + 輸出軸上的舵盤（horn）。
// 與 TT 馬達同一套擺位慣例：輸出軸在 local 原點，本體沿 -y（朝機架）延伸。
export function drawMG995Servo(cx, cy, rotDeg = 0, parent = _svg) {
  const s = View.getScale();
  const jx = TX(cx), jy = TY(cy);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${jx} ${jy}) rotate(${rotDeg})`);
  g.style.pointerEvents = 'none';
  const add = (el, attrs) => {
    const e = document.createElementNS(SVG_NS, el);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    g.appendChild(e);
    return e;
  };
  const sw = (v) => Math.max(1, v * s);
  // MG995 標準伺服比例：本體約 40×20、含耳約 54、軸距上緣約 10。
  const Wb = 20 * s, Lb = 40 * s, ax = 10 * s, r = 3 * s;
  const top = -ax;                              // 軸在原點，殼體頂端在 -ax
  const earW = 7 * s, earH = 6 * s, earY = top + Lb * 0.12;
  // 兩側固定耳（先畫，被殼體壓住內緣）
  add('rect', { x: -Wb / 2 - earW, y: earY, width: Wb / 2 + earW, height: earH, rx: r, ry: r,
    fill: '#2c6fbb', stroke: '#1c4f8a', 'stroke-width': sw(1) });
  add('rect', { x: 0, y: earY, width: Wb / 2 + earW, height: earH, rx: r, ry: r,
    fill: '#2c6fbb', stroke: '#1c4f8a', 'stroke-width': sw(1) });
  // 伺服殼體（藍色圓角矩形）
  add('rect', { x: -Wb / 2, y: top, width: Wb, height: Lb, rx: r, ry: r,
    fill: '#3d8bf0', stroke: '#1c4f8a', 'stroke-width': sw(1.4) });
  // 殼體分模線裝飾
  add('line', { x1: -Wb / 2, y1: top + Lb * 0.32, x2: Wb / 2, y2: top + Lb * 0.32,
    stroke: '#1c4f8a', 'stroke-width': sw(0.8), 'stroke-opacity': 0.6 });
  // 輸出軸上的舵盤（horn）：白色圓盤 + 中心軸
  add('circle', { cx: 0, cy: 0, r: 6 * s, fill: '#eef3fb', stroke: '#1c4f8a', 'stroke-width': sw(1.2) });
  add('circle', { cx: 0, cy: 0, r: 1.8 * s, fill: '#1c4f8a' });
  parent.appendChild(g);
  return g;   // 回傳根 <g>：播放快路徑只改它的 transform，不重建內部
}

// 動力來源型號標籤：畫在本體中心上方一點，永遠保持水平（不隨朝向旋轉）。
export function drawMotorLabel(cx, cy, text, color, parent = _svg) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', TX(cx));
  t.setAttribute('y', TY(cy) - 16 * View.getScale());
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', Math.max(9, 9 * View.getScale()));
  t.setAttribute('font-weight', '700');
  t.setAttribute('fill', color);
  t.setAttribute('stroke', '#ffffff');
  t.setAttribute('stroke-width', Math.max(2, 2.4 * View.getScale()));
  t.setAttribute('paint-order', 'stroke');   // 白色描邊在底，文字在上，才看得清
  t.style.pointerEvents = 'none';
  t.textContent = text;
  parent.appendChild(t);
  return t;   // 回傳 <text>：播放快路徑只改它的 x/y（位置），不重建
}

export function drawMountLabel(p, text, parent = _svg) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  const t = document.createElementNS(SVG_NS, 'text');
  const s = View.getScale();
  t.setAttribute('x', TX(p.x));
  t.setAttribute('y', TY(p.y) - 14 * s);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', Math.max(8, 8 * s));
  t.setAttribute('font-weight', '700');
  t.setAttribute('fill', '#34495e');
  t.setAttribute('stroke', '#ffffff');
  t.setAttribute('stroke-width', Math.max(2, 2.2 * s));
  t.setAttribute('paint-order', 'stroke');
  t.style.pointerEvents = 'none';
  t.textContent = text;
  parent.appendChild(t);
}

export function drawSliderMountHole(p, id, isSel = false, label = '', parent = _svg) {
  if (!p || !id || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  const s = View.getScale();
  const outer = document.createElementNS(SVG_NS, 'circle');
  outer.setAttribute('cx', TX(p.x));
  outer.setAttribute('cy', TY(p.y));
  outer.setAttribute('r', Math.max(7, 9 * s));
  outer.setAttribute('fill', '#f8fafc');
  outer.setAttribute('stroke', isSel ? '#e67e22' : '#34495e');
  outer.setAttribute('stroke-width', Math.max(2, 2.8 * s));
  outer.style.cursor = 'grab';
  outer.setAttribute('data-id', id);
  outer.addEventListener('pointerdown', (e) => _onNodeDown(e, id));
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = `${label} 固定孔：承載滑軌桿件的端點，可拖曳或吸附到其他接點`;
  outer.appendChild(title);
  parent.appendChild(outer);

  const inner = document.createElementNS(SVG_NS, 'circle');
  inner.setAttribute('cx', TX(p.x));
  inner.setAttribute('cy', TY(p.y));
  inner.setAttribute('r', Math.max(2.5, 3.5 * s));
  inner.setAttribute('fill', '#34495e');
  inner.style.pointerEvents = 'none';
  parent.appendChild(inner);
}

// 滑軌：承載桿件底座 + 淡灰滑槽 + 兩條導軌線 + 兩端擋塊。a、b 為可滑動軌道兩端。
export function drawSliderTrack(a, b, isSel = false, parent = _svg, carrierA = a, carrierB = b) {
  const s = View.getScale();
  const g = document.createElementNS(SVG_NS, 'g');
  g.style.pointerEvents = 'none';
  const add = (el, attrs) => {
    const e = document.createElementNS(SVG_NS, el);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    g.appendChild(e);
    return e;
  };
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;          // 世界法線
  const off = 6;                            // 導軌半距（世界 mm）
  add('path', { d: barHullPath(carrierA, carrierB), fill: '#f3f5f7', stroke: isSel ? '#f0a35f' : '#d2d8df',
    'stroke-width': Math.max(1, 1.1 * s), 'stroke-linejoin': 'round' });
  // 滑槽底（淡灰膠囊；選取時外框轉橘）
  add('path', { d: barHullPath(a, b), fill: '#e6eaee', stroke: isSel ? '#e67e22' : '#b9c2cc',
    'stroke-width': Math.max(1, (isSel ? 2.4 : 1.2) * s), 'stroke-linejoin': 'round' });
  // 兩條導軌線
  [off, -off].forEach(o => {
    add('line', { x1: TX(a.x + nx * o), y1: TY(a.y + ny * o),
      x2: TX(b.x + nx * o), y2: TY(b.y + ny * o),
      stroke: '#8a96a3', 'stroke-width': Math.max(1, 1.5 * s), 'stroke-linecap': 'round' });
  });
  // 兩端擋塊（垂直短線）
  [[a, 1], [b, 1]].forEach(([p]) => {
    add('line', { x1: TX(p.x + nx * (off + 2)), y1: TY(p.y + ny * (off + 2)),
      x2: TX(p.x - nx * (off + 2)), y2: TY(p.y - ny * (off + 2)),
      stroke: '#6b7783', 'stroke-width': Math.max(1.4, 2.2 * s), 'stroke-linecap': 'round' });
  });
  parent.appendChild(g);
}

// 滑軌行程：從固定端沿軌道量出的 min/max 位置，選取滑軌時顯示。
export function drawSliderTravelMarks(a, b, base, startDist, endDist, parent = _svg) {
  const s = View.getScale();
  const other = base === b ? a : b;
  const dx = other.x - base.x, dy = other.y - base.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const addMark = (dist, color) => {
    const d = Math.max(0, Math.min(L, Number(dist) || 0));
    const p = { x: base.x + ux * d, y: base.y + uy * d };
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', TX(p.x + nx * 12)); line.setAttribute('y1', TY(p.y + ny * 12));
    line.setAttribute('x2', TX(p.x - nx * 12)); line.setAttribute('y2', TY(p.y - ny * 12));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', Math.max(1.6, 2.4 * s));
    line.setAttribute('stroke-linecap', 'round');
    line.style.pointerEvents = 'none';
    parent.appendChild(line);
  };
  addMark(startDist, '#2c5282');
  addMark(endDist, '#c05621');
}

// 滑塊方塊：沿軌道方向（dirDeg 為畫面角度）的圓角矩形，騎在 p3 上。
export function drawSliderBlock(p, dirDeg, isInput = false, isSel = false, parent = _svg, bodyLen = 32) {
  const s = View.getScale();
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${TX(p.x)} ${TY(p.y)}) rotate(${dirDeg})`);
  g.style.pointerEvents = 'none';
  const w = Math.max(16, Number(bodyLen) || 32) * s, h = 16 * s, r = 4 * s;  // 沿軌道方向較長
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', -w / 2); rect.setAttribute('y', -h / 2);
  rect.setAttribute('width', w); rect.setAttribute('height', h);
  rect.setAttribute('rx', r); rect.setAttribute('ry', r);
  rect.setAttribute('fill', isInput ? '#2ecc71' : '#1abc9c');
  rect.setAttribute('fill-opacity', '0.88');
  rect.setAttribute('stroke', isSel ? '#e67e22' : (isInput ? '#1f8f4e' : '#107a63'));
  rect.setAttribute('stroke-width', Math.max(1, (isSel ? 2.6 : 1.6) * s));
  g.appendChild(rect);
  parent.appendChild(g);
}

// 活塞：缸體釘在指定的軌道固定端，伸出桿頂到滑塊。a、b 軌道端、s 滑塊（世界座標）。
export function drawPiston(a, b, s, basePoint = a, parent = _svg) {
  const sc = View.getScale();
  const base = basePoint || a;
  const dx = s.x - base.x, dy = s.y - base.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const g = document.createElementNS(SVG_NS, 'g');
  g.style.pointerEvents = 'none';
  const add = (el, attrs) => {
    const e = document.createElementNS(SVG_NS, el);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    g.appendChild(e);
    return e;
  };
  const cylLen = Math.min(L * 0.6, 26);     // 缸體長（世界 mm，最多 26）
  const cEnd = { x: base.x + ux * cylLen, y: base.y + uy * cylLen };
  // 缸體（深灰膠囊）
  add('path', { d: barHullPath(base, cEnd), fill: '#cfd6dd', stroke: '#6b7783',
    'stroke-width': Math.max(1, 1.4 * sc), 'stroke-linejoin': 'round' });
  // 本體固定點：和求解器的 input_linear 起點一致，避免視覺固定端和物理固定端分離。
  add('circle', { cx: TX(base.x), cy: TY(base.y), r: Math.max(3, 4.5 * sc),
    fill: '#6b7783', stroke: '#ffffff', 'stroke-width': Math.max(1, 1.6 * sc) });
  // 活塞桿（缸口到滑塊的細線）
  add('line', { x1: TX(cEnd.x), y1: TY(cEnd.y), x2: TX(s.x), y2: TY(s.y),
    stroke: '#6b7783', 'stroke-width': Math.max(1.4, 2.4 * sc), 'stroke-linecap': 'round' });
  parent.appendChild(g);
}
