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

// 雙馬達共點：M1 曲柄（Link1）的浮動端剛好是 M2 軸心（P4b）。M2 的 mount 必須
// 取自明確宣告的 Link5.motorMount（frameBody=Link4），不得被 Link1 搶答成世界機架。
const dualComps = [
  { type: 'bar', id: 'Link1', isInput: true, p1: { id: 'P4b' }, p2: { id: 'P1b' },
    motorMount: { motor: '1', center: 'P1b', outputBody: 'Link1', orientation: 'horizontal', order: ['motor', 'outputBody'] } },
  { type: 'bar', id: 'Link4', p1: { id: 'P2b' }, p2: { id: 'P4b' } },
  { type: 'bar', id: 'Link5', isInput: true, p1: { id: 'P4b' }, p2: { id: 'P5b' },
    motorMount: { motor: '2', center: 'P4b', outputBody: 'Link5', frameBody: 'Link4', orientation: 'follow-frame', order: ['motor', 'frameBody', 'outputBody'] } }
];
const dualPoints = { P1b: { x: -200, y: 0 }, P2b: { x: -151, y: 39 }, P4b: { x: -174, y: 30 }, P5b: { x: -159, y: 63 } };
const dualMounts = buildMotorMounts({
  motorIds: new Set(['P1b', 'P4b']), groundIds: new Set(['P1b']), staticPoints: dualPoints, comps: dualComps,
  compiledSteps: [], sliderMountInfo: () => null, isHiddenSliderRailPoint: () => false,
  motorTypeForCenter: () => 'tt'
});
const ridingMount = dualMounts.get('P4b');
check('共點騎乘馬達保留宿主桿裝配關係', ridingMount?.outputBody === 'Link5' && ridingMount?.frameBody === 'Link4' && ridingMount?.orientation === 'follow-frame');
const groundMount = dualMounts.get('P1b');
check('共點世界機架馬達不受影響', groundMount?.outputBody === 'Link1' && !groundMount?.frameBody && groundMount?.orientation === 'horizontal');

report('motor-frame-modules');
