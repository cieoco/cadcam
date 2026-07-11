// 特殊零件 SVG 模組的最小 DOM 驗收：確保凸輪建立完整元素，且動畫 updater 可更新位置。
import { camFollowerState, camRadius } from '../js/utils/cam-profile.js';
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
}

globalThis.document = { createElementNS: (_ns, tag) => new FakeElement(tag) };
const { drawCam } = await import('../js/blocks/special-part-render.js');

const svg = new FakeElement('svg');
const component = {
  type: 'cam', id: 'CamA', profile: 'harmonic',
  p1: { id: 'C' }, p2: { id: 'F' },
  baseRadiusParam: 'BASE', liftParam: 'LIFT', axisDeg: 90, rollerRadius: 6
};
const points = { C: { x: 10, y: 20 }, F: { x: 10, y: 60 } };
const update = drawCam({
  component, points, svg, scale: 1, project: p => ({ x: p.x, y: -p.y }),
  params: { BASE: 24, LIFT: 24 }, theta: () => 30, camRadius, camFollowerState
});

check('凸輪模組建立輪廓、導軌、從動塊、滾子與接觸線',
  svg.children.length === 5 && svg.children.map(el => el.tag).join(',') === 'g,line,rect,circle,line');
check('凸輪模組回傳動畫更新函式', typeof update === 'function');
update({ C: { x: 12, y: 22 }, F: { x: 12, y: 64 } });
check('凸輪動畫更新中心與從動滾子位置',
  svg.children[0].getAttribute('transform')?.includes('translate(12 -22)') &&
  svg.children[3].getAttribute('cx') === '12' && svg.children[3].getAttribute('cy') === '-64');

report('special-part-render');
