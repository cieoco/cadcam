/** 只在選取剛性零件時顯示共用尺寸；尺寸線是選取入口，不是額外桿件。 */
import { memberDimensions, memberDimensionValue } from './member-dimensions.js';
import { jawCenterline } from './plate-geometry.js';

const NS = 'http://www.w3.org/2000/svg';
export function drawMemberDimensions({ svg, comp, points, params, selected, project, onSelect }) {
  if (!comp) return null;
  const dimensions = memberDimensions(comp);
  if (!dimensions.length) return null;
  const group = document.createElementNS(NS, 'g');
  group.setAttribute('id', 'memberDimensions');
  const screen = svg.getScreenCTM?.();
  const px = 1 / (Math.hypot(screen?.a || 1, screen?.b || 0) || 1);
  const make = (tag, attrs, parent = group) => {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    parent.appendChild(element); return element;
  };
  const refs = [...new Set(dimensions.flatMap(d => d.refs))];
  const labels = refs.map(ref => ({ ref, node: make('text', {
    'font-size': 12 * px, 'font-weight': '700', fill: '#334155', stroke: '#fff',
    'stroke-width': 3 * px, 'paint-order': 'stroke', 'pointer-events': 'none'
  }) }));
  labels.forEach(({ ref, node }) => { node.textContent = { p1: 'A', p2: 'B', p3: 'C', tip: 'T' }[ref]; });
  const lines = dimensions.map(dimension => {
    const active = dimension.id === selected;
    const button = make('g', { role: 'button', tabindex: '0', 'aria-label': `調整${dimension.label}` });
    button.style.cursor = 'pointer';
    const choose = event => { event.preventDefault(); event.stopPropagation(); onSelect(dimension.id); };
    button.addEventListener('pointerdown', choose);
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') choose(event); });
    const hit = make('line', { stroke: 'transparent', 'stroke-width': 16 * px }, button);
    const line = make('line', { stroke: active ? '#0369a1' : '#94a3b8', 'stroke-width': (active ? 2 : 1) * px, 'stroke-dasharray': `${4 * px} ${3 * px}`, 'pointer-events': 'none' }, button);
    const label = make('text', { 'text-anchor': 'middle', 'font-size': 11 * px, 'font-weight': active ? '700' : '400', fill: active ? '#0369a1' : '#64748b', stroke: '#fff', 'stroke-width': 3 * px, 'paint-order': 'stroke' }, button);
    label.textContent = `${dimension.label.replace('孔距 ', '').replace('爪端長度 ', '').replace('（跨距）', '')} ${Number(memberDimensionValue(comp, params, dimension.id).toFixed(1))} mm`;
    return { dimension, button, hit, line, label };
  });
  function update(current) {
    const p = Object.fromEntries(refs.map(ref => [ref, current[comp[ref]?.id]]));
    if (comp.shape === 'jaw') p.tip = jawCenterline(['p1', 'p2', 'p3'].map(ref => p[ref]), comp.jawTurnSign, comp.jawTipLength)?.at(-1);
    labels.forEach(({ ref, node }) => {
      node.style.display = p[ref] ? '' : 'none';
      if (p[ref]) { const q = project(p[ref]); node.setAttribute('x', q.x + 9 * px); node.setAttribute('y', q.y - 9 * px); }
    });
    lines.forEach(({ dimension, button, hit, line, label }) => {
      const [a, b] = dimension.refs.map(ref => p[ref] && project(p[ref]));
      button.style.display = a && b ? '' : 'none';
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const offset = (dimension.id === 'r2' ? -22 : 22) * px;
      const ox = -dy / length * offset, oy = dx / length * offset;
      [hit, line].forEach(node => {
        node.setAttribute('x1', a.x + ox); node.setAttribute('y1', a.y + oy);
        node.setAttribute('x2', b.x + ox); node.setAttribute('y2', b.y + oy);
      });
      label.setAttribute('x', (a.x + b.x) / 2 + ox); label.setAttribute('y', (a.y + b.y) / 2 + oy - 5 * px);
    });
  }
  svg.appendChild(group); update(points); return update;
}
