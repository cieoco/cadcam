/** 畫布上的任務物件：只作尺寸參考，不加入機構、碰撞或加工輸出。 */
import { gripperTips } from './gripper-workflow.js?v=20260925_r1b';

export const resizeObjectWidth = (x, centerX) => Math.max(10, Math.min(150, Math.round(2 * Math.abs(x - centerX))));

export function createGripperObject({ svg, project, worldFromEvent, getReference, getComps, isEditing,
  previewWidth, commitWidth, cancelPreview, pause }) {
  const NS = 'http://www.w3.org/2000/svg';
  let drag = null;
  let group = null;
  let refresh = null;
  const make = (tag, attrs, parent = group) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    parent.appendChild(node);
    return node;
  };
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const finish = (event, cancel = false) => {
    if (!drag || event.pointerId !== drag.id) return;
    stop(event);
    const previous = drag; drag = null;
    try { svg.releasePointerCapture(previous.id); } catch (_) {}
    if (cancel) cancelPreview(); else commitWidth(previous.width);
  };
  // 捕捉在不會被 draw() 替換的 svg 上，重繪物件時仍能收到後續移動和放開。
  svg.addEventListener('pointerdown', event => {
    const handle = event.target.closest?.('[data-gripper-resize]');
    const ref = getReference();
    if (!handle || !ref || (event.button !== undefined && event.button !== 0)) return;
    stop(event); pause();
    drag = { id: event.pointerId, centerX: ref.center.x, width: ref.width };
    try { svg.setPointerCapture(event.pointerId); } catch (_) {}
  }, true);
  svg.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    stop(event);
    const p = worldFromEvent(event);
    if (!p) return;
    const width = resizeObjectWidth(p.x, drag.centerX);
    if (width !== drag.width) { drag.width = width; previewWidth(width); }
  }, true);
  svg.addEventListener('pointerup', event => finish(event), true);
  svg.addEventListener('pointercancel', event => finish(event, true), true);
  svg.addEventListener('lostpointercapture', event => {
    if (drag && event.pointerId === drag.id) { drag = null; cancelPreview(); }
  });
  const keyHandler = event => {
    if (drag && event.key === 'Escape') {
      const id = drag.id; drag = null; stop(event);
      try { svg.releasePointerCapture(id); } catch (_) {}
      cancelPreview(); return;
    }
    const handle = event.target.closest?.('[data-gripper-resize]');
    const ref = getReference();
    if (!handle || !ref || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    stop(event);
    const side = handle.getAttribute('data-gripper-resize');
    const delta = (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? -1 : 1);
    pause(); commitWidth(Math.max(10, Math.min(150, ref.width + delta)));
    svg.querySelector(`[data-gripper-resize="${side}"]`)?.focus();
  };
  // drag 重繪會移除聚焦把手，因此 Escape 也要從文件接收。
  document.addEventListener('keydown', keyHandler, true);

  function draw(points) {
    const ref = getReference();
    refresh = null;
    if (!ref || isEditing()) return null;
    group = make('g', { id: 'gripperObjectGuide', 'pointer-events': 'none' }, svg);
    const screenUnit = 1 / (svg.getScreenCTM()?.a || 1);
    const w = ref.width, c = ref.center;
    const tl = project({ x: c.x - w / 2, y: c.y + w / 2 });
    const br = project({ x: c.x + w / 2, y: c.y - w / 2 });
    make('rect', { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y,
      rx: 4, fill: '#3498db', 'fill-opacity': 0.16, stroke: '#2471a3', 'stroke-dasharray': '5 3', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
    const labelPos = project({ x: c.x, y: c.y + w / 2 });
    const label = make('text', { x: labelPos.x, y: labelPos.y - 7 * screenUnit, 'text-anchor': 'middle', fill: '#195a86', 'font-size': 13 * screenUnit, 'font-weight': 700, 'paint-order': 'stroke', stroke: '#f6f8fb', 'stroke-width': 3 * screenUnit });
    label.textContent = `參考物件 ${w} mm`;
    const infoPos = project({ x: c.x, y: c.y - w / 2 - 12 });
    const current = make('text', { x: infoPos.x, y: infoPos.y + 4 * screenUnit, 'text-anchor': 'middle', fill: '#117a45', 'font-size': 13 * screenUnit, 'paint-order': 'stroke', stroke: '#f6f8fb', 'stroke-width': 4 * screenUnit });
    const formula = make('text', { x: infoPos.x, y: infoPos.y + 22 * screenUnit, 'text-anchor': 'middle', fill: '#536675', 'font-size': 12 * screenUnit });
    formula.textContent = `張開需求 ${w} + 2 × ${ref.clearance} = ${w + 2 * ref.clearance} mm`;
    for (const side of ['left', 'right']) {
      const p = project({ x: c.x + (side === 'left' ? -1 : 1) * w / 2, y: c.y });
      const handle = make('g', {
        'data-gripper-resize': side, 'pointer-events': 'all', role: 'slider', tabindex: 0, 'aria-label': `${side === 'left' ? '左' : '右'}側物件寬度把手`,
        'aria-valuemin': 10, 'aria-valuemax': 150, 'aria-valuenow': w, 'aria-valuetext': `${w} mm；左右方向鍵調整`,
        style: 'cursor:ew-resize;touch-action:none' });
      make('circle', { cx: p.x, cy: p.y, r: 20 * screenUnit, fill: 'transparent' }, handle);
      make('circle', { cx: p.x, cy: p.y, r: 7 * screenUnit, fill: '#fff', stroke: '#2471a3', 'stroke-width': 2 * screenUnit, 'pointer-events': 'none' }, handle);
      make('title', {}, handle).textContent = '拖曳改物件寬度；方向鍵微調';
    }
    refresh = P => {
      const tips = gripperTips(getComps(), P);
      current.textContent = tips ? `目前爪尖淨距 ${tips.gap.toFixed(1)} mm` : '目前姿態無法量測';
    };
    refresh(points);
    return refresh;
  }
  return { draw };
}
