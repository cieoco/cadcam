// 馬達安裝規劃與機架 SVG 模組驗收。
import { buildMotorMounts, motorAssemblyLayerForBody } from '../js/blocks/motor-mounts.js';
import { check, report } from './_harness.mjs';

const comps = [
  { type: 'gear', id: 'GearA', p1: { id: 'CA' }, p2: { id: 'PA' } },
  { type: 'gear', id: 'GearB', mesh: 'GearA', p1: { id: 'CB' }, p2: { id: 'PB' } }
];
const staticPoints = { CA: { x: 0, y: 0 }, PA: { x: 20, y: 0 }, CB: { x: 60, y: 0 }, PB: { x: 40, y: 0 } };
const mounts = buildMotorMounts({
  motorIds: new Set(['CA']), groundIds: new Set(['CA', 'CB']), staticPoints, comps,
  compiledSteps: [], sliderMountInfo: () => null, isHiddenSliderRailPoint: () => false,
  motorTypeForCenter: () => 'tt'
});
const gearMount = mounts.get('CA');
check('齒輪馬達安裝方向背向嚙合齒輪', gearMount?.reason === 'gear-mesh' && gearMount.dir.x < -0.99);
check('馬達輸出齒輪取得底層裝配順位', motorAssemblyLayerForBody('GearA', mounts) === 0);

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
}
globalThis.document = { createElementNS: (_ns, tag) => new FakeElement(tag) };
const { drawFrameGeometry, drawMotorMountHoles } = await import('../js/blocks/motor-frame-render.js');
const svg = new FakeElement('svg');
drawFrameGeometry({
  nodes: [{ x: 0, y: 0 }, { x: 60, y: 0 }], svg, project: p => ({ x: p.x, y: -p.y }), drawBaseline: () => {},
  frameGeometry: { outlines: [[{ x: -10, y: -10 }, { x: 70, y: -10 }, { x: 70, y: 10 }, { x: -10, y: 10 }]], cutouts: [{ points: [{ x: 5, y: -4 }, { x: 20, y: -4 }, { x: 20, y: 4 }, { x: 5, y: 4 }] }] }
});
check('機架模組建立底板與穿板切口', svg.children.map(child => child.tag).join(',') === 'polygon,polygon');

const tt = { shaftDiameterMm: 5, screwOffsetXMm: 10, screwSpacingMm: 14, screwDiameterMm: 3, locatorOffsetXMm: 18, locatorOffsetYMm: 0, locatorDiameterMm: 3 };
const mg = { shaftOffsetMm: 10, bodyLengthMm: 40, screwSpanMm: 50, screwSpacingMm: 10, screwDiameterMm: 3 };
drawMotorMountHoles({
  motorIds: new Set(['CA']), motorMounts: mounts, points: staticPoints, svg, scale: 1,
  project: p => ({ x: p.x, y: -p.y }), motorTypeForCenter: () => 'tt', rotationForCenter: () => 0,
  ttSettings: tt, mg995Settings: mg, mg995SlotOutline: () => []
});
const mountLayer = svg.children[2];
check('TT 馬達安裝圖包含軸孔、兩螺絲孔與定位孔', mountLayer.tag === 'g' && mountLayer.children[0].children.filter(child => child.tag === 'circle').length === 4);

report('motor-frame-modules');
