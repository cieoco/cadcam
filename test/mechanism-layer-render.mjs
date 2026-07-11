// 連桿與節點互動層的最小 DOM 驗收。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; this.listeners = new Map(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
}
globalThis.document = { createElementNS: (_ns, tag) => new FakeElement(tag) };
const { renderLinks, renderNodes } = await import('../js/blocks/mechanism-layer-render.js');

const svg = new FakeElement('svg'), layer = new FakeElement('g'), updates = [];
const points = { O: { x: 0, y: 0 }, A: { x: 40, y: 0 }, Hidden: { x: 10, y: 10 } };
const link = { id: 'Link1', p1: 'O', p2: 'A', style: 'crank', color: '#e74c3c' };
const linksResult = renderLinks({
  links: [link], comps: [{ type: 'bar', id: 'Link1', fixedLen: true }], points,
  triangleEdgeKeys: new Set(), isGroundBar: () => false, selectedLinkId: 'Link1', pickBars: null,
  interactionBlocked: () => false, onTryPick: () => {}, onFreeDrag: () => false, onSelect: () => {},
  groupForLayer: () => layer, linkLayer: new Map([[link, 0]]), groundIds: new Set(['O']), hullRadius: 9, scale: 1,
  barHullPath: () => 'M 0 0 L 40 0 Z', project: p => ({ x: p.x, y: -p.y }), hostedMounts: new Map(),
  inspectHostedFrame: () => null, registerUpdate: update => updates.push(update)
});
check('連桿層建立桿身與非固定端孔位', layer.children.map(child => child.tag).join(',') === 'path,circle');
check('連桿層回傳可見桿與缺漏計數', linksResult.linksToDraw.length === 1 && linksResult.countMissing(points) === 0 && linksResult.countMissing({ O: points.O }) === 1);

renderNodes({
  points, svg, groundIds: new Set(['O']), motorCenterIds: new Set(), camCenterIds: new Set(), hiddenPointIds: new Set(['Hidden']),
  gearPinIds: new Set(), pulleyPinIds: new Set(), camFollowerIds: new Set(), workpieceIds: new Set(), dragId: '',
  sliderMountInfo: () => null, project: p => ({ x: p.x, y: -p.y }), onPointerDown: () => {}, registerUpdate: update => updates.push(update)
});
check('節點層略過隱藏點並區分固定方塊與活動圓點', svg.children.map(child => child.tag).join(',') === 'rect,circle');
updates.forEach(update => update({ O: { x: 2, y: 3 }, A: { x: 42, y: 3 }, Hidden: points.Hidden }));
check('連桿與節點 updater 可更新座標', layer.children[0].style.display === '' && svg.children[0].getAttribute('x') === '-5');

report('mechanism-layer-render');
