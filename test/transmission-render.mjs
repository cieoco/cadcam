// 傳動 SVG 模組驗收：齒輪本體、輪緣輸出孔、嚙合警示與動畫更新。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; this.listeners = new Map(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
}

globalThis.document = { createElementNS: (_ns, tag) => new FakeElement(tag) };
const { drawGear } = await import('../js/blocks/transmission-render.js');

const svg = new FakeElement('svg');
const driver = { type: 'gear', id: 'GearA', p1: { id: 'CA' }, p2: { id: 'PA' }, teeth: 12, radiusParam: 'RA' };
const driven = { type: 'gear', id: 'GearB', p1: { id: 'CB' }, p2: { id: 'PB' }, teeth: 24, radiusParam: 'RB', mesh: 'GearA', color: '#2c6fbb' };
const points = { CA: { x: 0, y: 0 }, PA: { x: 24, y: 0 }, CB: { x: 72, y: 0 }, PB: { x: 24, y: 0 } };
const gears = new Map([['GearA', driver], ['GearB', driven]]);
const update = drawGear({
  component: driven, points, svg, scale: 1, project: p => ({ x: p.x, y: -p.y }),
  params: { RA: 24, RB: 48 }, gearById: gears, selected: true, meshOff: true,
  interactionBlocked: () => false, onSelect: () => {}, onRotate: () => {}
});

const group = svg.children[0], bolt = svg.children[1], polygon = group.children[0];
check('齒輪模組建立齒形本體與輪緣輸出孔', group.tag === 'g' && polygon.tag === 'polygon' && bolt.tag === 'circle');
check('齒輪選取與嚙合錯誤外觀保留', polygon.getAttribute('stroke') === '#e74c3c' && polygon.getAttribute('stroke-dasharray') && polygon.children[0]?.tag === 'title');
check('齒輪模組回傳動畫更新函式', typeof update === 'function');
update({ ...points, CB: { x: 74, y: 2 }, PB: { x: 26, y: 2 } });
check('齒輪動畫更新中心與輸出孔位置', group.getAttribute('transform')?.includes('translate(74 -2)') && bolt.getAttribute('cx') === '26' && bolt.getAttribute('cy') === '-2');

report('transmission-render');
