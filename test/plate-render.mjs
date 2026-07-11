// 結構板 SVG 模組的最小 DOM 驗收：板身、固定軸轂、自訂造形點與動畫 updater。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; this.listeners = new Map(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
}

globalThis.document = { createElementNS: (_ns, tag) => new FakeElement(tag) };
const { drawPlate } = await import('../js/blocks/plate-render.js');

const svg = new FakeElement('svg'), layer = new FakeElement('g');
const component = {
  id: 'PlateA', color: '#27ae60', shapeMode: 'polyline',
  p1: { id: 'A', type: 'fixed' }, p2: { id: 'B', type: 'fixed' }, p3: { id: 'C', type: 'floating' },
  vertices: [{ solve: true, ref: 'p1' }, { solve: true, ref: 'p2' }, { solve: false, u: 0.5, v: 0.25, hole: true }]
};
const points = { A: { x: 0, y: 0 }, B: { x: 80, y: 0 }, C: { x: 40, y: 50 } };
const updates = [];
drawPlate({
  component, points, svg, scale: 1, project: p => ({ x: p.x, y: -p.y }), selectedId: 'PlateA',
  ctx: { triKey: ids => ids.join('|'), triLayerByKey: new Map([['A|B|C', 0]]), groupForLayer: () => layer },
  interactionBlocked: () => false, onSelect: () => {}, shapeMode: c => c.shapeMode,
  plateExtras: null, platePath: () => 'M 0 0 Z', roundedPath: () => '', vertices: c => c.vertices,
  localToWorld: ([a, b], vertex) => ({ x: a.x + (b.x - a.x) * vertex.u, y: a.y + vertex.v * 80 }),
  onShapeDrag: () => {}, onDeleteShapeVertex: () => {}, registerUpdate: update => updates.push(update)
});

check('結構板模組建立板身與兩個固定軸轂', layer.children.map(el => el.tag).join(',') === 'path,circle,circle');
check('選取結構板時建立自訂造形點握把', svg.children.length === 1 && svg.children[0].getAttribute('fill') === '#e67e22');
check('板身與握把都註冊動畫更新', updates.length === 2);
updates.forEach(update => update({ A: { x: 5, y: 5 }, B: { x: 85, y: 5 }, C: { x: 45, y: 55 } }));
check('更新後板身與造形點仍可見', layer.children[0].style.display === '' && svg.children[0].style.display === '');

report('plate-render');
