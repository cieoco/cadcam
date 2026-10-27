import * as View from './view.js';
import { setCommandState } from './command-ui.js';

// 1、2、5 系列；至少保留約半個目標寬度，數字不隨裝置像素密度改變。
export function rulerStep(pxPerMm, target = 90) {
  if (!(pxPerMm > 0) || !Number.isFinite(pxPerMm)) return null;
  const ideal = target / pxPerMm;
  const base = 10 ** Math.floor(Math.log10(ideal));
  return [5, 2, 1].find(n => n * base <= ideal) * base;
}

export function rulerTicks(origin, pxPerMm, extent, step, direction = 1) {
  const a = -origin / (pxPerMm * direction);
  const b = (extent - origin) / (pxPerMm * direction);
  const first = Math.ceil(Math.min(a, b) / step);
  const last = Math.floor(Math.max(a, b) / step);
  const ticks = [];
  for (let i = first; i <= last && ticks.length < 500; i++) {
    const value = Number((i * step).toPrecision(12));
    ticks.push({ value, position: origin + value * pxPerMm * direction });
  }
  return ticks;
}

export function createCanvasRulers(svg) {
  const host = svg.parentElement;
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.id = 'canvasRulers';
  overlay.setAttribute('aria-hidden', 'true');
  host.append(overlay);
  const mobile = matchMedia('(max-width:700px), (max-width:1099px) and (max-height:500px)');
  let full = null, pending = false;   // null＝依裝置：電腦完整尺規、手機只留比例尺；按「尺規」後依使用者
  const isFull = () => full ?? !mobile.matches;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; update(); });
  };
  const sync = () => { setCommandState('rulers', isFull()); schedule(); };
  const add = (tag, attrs, text = '') => {
    const el = document.createElementNS(overlay.namespaceURI, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    el.textContent = text;
    overlay.append(el);
  };
  function update() {
    const rect = svg.getBoundingClientRect(), parent = host.getBoundingClientRect();
    const tabs = document.getElementById('designTabs').getBoundingClientRect();
    const top = Math.max(rect.top, tabs.bottom);
    const width = rect.width, height = rect.bottom - top;
    const hidden = document.body.dataset.mode === 'bench' ||
      getComputedStyle(document.getElementById('view3d')).display !== 'none' ||
      width < 80 || height < 60;
    overlay.style.display = hidden ? 'none' : 'block';
    if (hidden) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    // SVG 的 meet 留白、CSS 尺寸與世界縮放都要計入；不能只用 View.getScale()。
    const px = Math.abs(ctm.a) * View.getScale();
    const py = Math.abs(ctm.d) * View.getScale();
    const ox = ctm.a * View.TX(0) + ctm.e - rect.left;
    const oy = ctm.d * View.TY(0) + ctm.f - top;
    Object.assign(overlay.style, { left: `${rect.left - parent.left}px`, top: `${top - parent.top}px`, width: `${width}px`, height: `${height}px` });
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.replaceChildren();
    const step = rulerStep(px);
    if (!isFull()) {
      const length = step * px, y = height - 24;
      add('rect', { x: 6, y: y - 12, width: length + 16, height: 34, rx: 4, class: 'ruler-back' });
      add('path', { d: `M 14 ${y - 5} v 5 h ${length} v -5`, class: 'ruler-line' });
      add('text', { x: 14 + length / 2, y: y + 15, 'text-anchor': 'middle' }, `${step} mm`);
      return;
    }
    const edge = 24;
    add('path', { d: `M 0 0 H ${width} V ${edge} H ${edge} V ${height} H 0 Z`, class: 'ruler-back' });
    for (const tick of rulerTicks(ox, px, width, step / 5)) {
      if (tick.position < edge) continue;
      add('path', { d: `M ${tick.position} 20 v 4`, class: 'ruler-line' });
    }
    for (const tick of rulerTicks(ox, px, width, step)) {
      if (tick.position < edge + 18 || tick.position > width - 18) continue;
      add('text', { x: tick.position, y: 13, 'text-anchor': 'middle' }, tick.value);
      add('path', { d: `M ${tick.position} 16 v 8`, class: 'ruler-line' });
    }
    const yStep = rulerStep(py);
    for (const tick of rulerTicks(oy, py, height, yStep / 5, -1)) {
      if (tick.position < edge) continue;
      add('path', { d: `M 20 ${tick.position} h 4`, class: 'ruler-line' });
    }
    for (const tick of rulerTicks(oy, py, height, yStep, -1)) {
      if (tick.position < edge + 18 || tick.position > height - 18) continue;
      add('text', { transform: `translate(13 ${tick.position}) rotate(-90)`, 'text-anchor': 'middle' }, tick.value);
      add('path', { d: `M 16 ${tick.position} h 8`, class: 'ruler-line' });
    }
    add('rect', { x: 0, y: 0, width: edge, height: edge, class: 'ruler-back' });
    add('text', { x: 12, y: 15, 'text-anchor': 'middle' }, 'mm');
  }
  // 僅視圖／版面變動才重畫尺規，不跟隨播放的每一幀重建。
  View.onViewChange(schedule);
  const sizes = new ResizeObserver(schedule);
  [svg, host, document.getElementById('designTabs')].forEach(el => sizes.observe(el));
  const mode = new MutationObserver(schedule);
  mode.observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'data-mobile-panel'] });
  mode.observe(document.getElementById('view3d'), { attributes: true, attributeFilter: ['style', 'class'] });
  mobile.addEventListener('change', sync);
  window.addEventListener('resize', schedule);
  sync();
  return () => { full = !isFull(); sync(); };
}
