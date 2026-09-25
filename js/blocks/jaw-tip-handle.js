/** 在既有爪端方向上改長短；手勢預覽交給共用 member editor，不直接改 snapshot。 */
import { jawCenterline } from './plate-geometry.js';
import { memberDimensionValue } from './member-dimensions.js';

export function projectedTipLength(point, corner, direction) {
  const length = Math.hypot(direction.x, direction.y);
  if (!length || ![point?.x, point?.y, corner?.x, corner?.y, length].every(Number.isFinite)) return null;
  return Math.max(8, Math.min(160, Math.round(((point.x - corner.x) * direction.x + (point.y - corner.y) * direction.y) / length * 10) / 10));
}

export function createJawTipHandle({ svg, project, worldFromEvent, editor, getParams }) {
  const NS = 'http://www.w3.org/2000/svg';
  let pose = null, drag = null;
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const finish = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    stop(e); const previous = drag; drag = null;
    try { svg.releasePointerCapture(previous.id); } catch (_) {}
    editor.finishTipPreview(cancel || !previous.moved);
  };
  svg.addEventListener('pointerdown', e => {
    if (drag || !pose || !e.target.closest?.('[data-jaw-tip]') || (e.button !== undefined && e.button !== 0)) return;
    stop(e);
    const previous = { ...pose };
    if (!editor.beginTipPreview()) return;
    drag = { ...previous, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  }, true);
  svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    stop(e);
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
    const p = worldFromEvent(e);
    const value = p && projectedTipLength(p, drag.corner, drag.direction);
    if (value == null) return;
    drag.moved = true; editor.previewTip(value);
  }, true);
  svg.addEventListener('pointerup', e => finish(e, false), true);
  svg.addEventListener('pointercancel', e => finish(e, true), true);
  svg.addEventListener('lostpointercapture', e => {
    if (drag && e.pointerId === drag.id) { drag = null; editor.finishTipPreview(true); }
  });
  document.addEventListener('keydown', e => {
    if (drag && e.key === 'Escape') { finish({ ...e, pointerId: drag.id, preventDefault: () => e.preventDefault(), stopImmediatePropagation: () => e.stopImmediatePropagation() }, true); return; }
    if (!e.target.closest?.('[data-jaw-tip]') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const comp = editor.selected();
    if (comp?.shape !== 'jaw') return;
    stop(e); editor.selectDimension('tip');
    editor.setValue(Math.max(8, Math.min(160, memberDimensionValue(comp, getParams(), 'tip') + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1))));
    svg.querySelector('[data-jaw-tip]')?.focus();
  }, true);
  function draw(points) {
    pose = null;
    const comp = editor.displayComp(editor.selected());
    if (comp?.shape !== 'jaw') return null;
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-jaw-tip', comp.id); group.setAttribute('role', 'slider'); group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', '爪端長度拖曳把手');
    group.setAttribute('aria-valuemin', '8'); group.setAttribute('aria-valuemax', '160');
    group.style.cursor = 'grab'; group.style.touchAction = 'none';
    const unit = 1 / (svg.getScreenCTM?.()?.a || 1);
    const circle = (radius, fill, stroke) => {
      const node = document.createElementNS(NS, 'circle');
      node.setAttribute('r', radius * unit); node.setAttribute('fill', fill);
      if (stroke) { node.setAttribute('stroke', stroke); node.setAttribute('stroke-width', 2 * unit); }
      group.appendChild(node); return node;
    };
    const hit = circle(20, 'transparent'), dot = circle(7, '#fff', '#c2410c');
    const title = document.createElementNS(NS, 'title'); title.textContent = '拖爪端改長短；方向鍵微調；Esc 取消。不移動連接孔。'; group.appendChild(title);
    const update = current => {
      const chain = jawCenterline(['p1', 'p2', 'p3'].map(ref => current[comp[ref]?.id]), comp.jawTurnSign, comp.jawTipLength);
      group.style.display = chain ? '' : 'none';
      if (!chain) { pose = null; return; }
      const corner = chain[2], end = chain[3], p = project(end);
      pose = { corner, direction: { x: end.x - corner.x, y: end.y - corner.y } };
      [hit, dot].forEach(node => { node.setAttribute('cx', p.x); node.setAttribute('cy', p.y); });
      group.setAttribute('aria-valuenow', Math.round(Math.hypot(end.x - corner.x, end.y - corner.y) * 10) / 10);
    };
    svg.appendChild(group); update(points); return update;
  }
  return { draw };
}
