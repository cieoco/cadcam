import { check, report } from './_harness.mjs';
import { inspectFrameExport } from '../js/blocks/exporters.js';

const settings = { barWidthMm: 16, holeDiameterMm: 5 };
const ttMount = {
  center: { x: 0, y: 0 }, rotDeg: 0,
  settings: { shaftDiameterMm: 6, screwDiameterMm: 3, screwOffsetXMm: -20.6, screwSpacingMm: 17.3, locatorDiameterMm: 4, locatorOffsetXMm: -11.18, locatorOffsetYMm: 0 }
};

const motorOnly = inspectFrameExport([{ id: 'M', x: 0, y: 0 }], settings, [ttMount]);
check('單一馬達固定點仍產生機架安裝板', Boolean(motorOnly && motorOnly.outlines.length));
check('單一馬達安裝板保留 TT 軸、螺絲與定位孔', motorOnly?.holes.filter(h => h.layer.startsWith('TT_')).length === 4);

const motorBar = inspectFrameExport([{ id: 'A', x: -80, y: 0 }, { id: 'M', x: 0, y: 0 }], settings, [ttMount]);
check('兩點機架加馬達座仍維持單一連續桿形外框', Boolean(motorBar && motorBar.outlines.length === 1 && motorBar.outlines[0].length > 20));

const triangle = inspectFrameExport([{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 0, y: 40 }], settings);
check('非共線固定點產生外擴底板', Boolean(triangle && triangle.outlines[0].length === 3));

const plainBar = inspectFrameExport([{ x: 0, y: 0 }, { x: 100, y: 0 }], settings);
const barXs = plainBar?.outlines[0].map(p => p.x) || [];
check('桿狀機架兩端都向外圓弧封口', Math.min(...barXs) < -7.9 && Math.max(...barXs) > 107.9);

const cramped = inspectFrameExport([{ x: 0, y: 0 }, { x: 6, y: 0 }], settings);
check('過近固定孔會產生製造警告', cramped?.warnings.some(text => text.includes('固定孔')));

report('frame-export');
