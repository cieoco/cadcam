import assert from 'node:assert/strict';
import {
  exportLinksAsDxf,
  exportLinksAsSvg,
  hostedBarGeometry,
  inspectLinkExport,
  inspectPlateExport,
  normalizeExportSettings,
} from '../js/blocks/exporters.js';

const bounds = outlines => {
  const points = outlines.flat();
  return {
    minX: Math.min(...points.map(p => p.x)),
    maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)),
    maxY: Math.max(...points.map(p => p.y)),
  };
};

const bar = {
  id: 'StockBar', type: 'bar',
  p1: { id: 'A' }, p2: { id: 'B' },
  stock: { widthMm: 24, thicknessMm: 6, material: 'acrylic' },
};
const points = { A: { x: 0, y: 0 }, B: { x: 80, y: 0 } };
const settings = { barWidthMm: 40, holeDiameterMm: 12.96 };
const narrowFrame = normalizeExportSettings({ ...settings, barWidthMm: 2 });
assert.equal(narrowFrame.holeDiameterMm, 12.96, 'frame width never resizes member holes');
assert.equal(narrowFrame.ttShaftFlatDiameterMm, 5.4, 'frame width never resizes TT shaft interface');

const linkGeometry = inspectLinkExport(bar, 80, settings);
assert.equal(bounds(linkGeometry.outlines).minY, -12);
assert.equal(bounds(linkGeometry.outlines).maxY, 12);
assert.deepEqual(linkGeometry.holes.map(h => h.r), [6.48, 6.48], 'link hole size comes from export settings');
assert.equal(linkGeometry.cutouts.length, 0);

const jaw = {
  id: 'StockJaw', type: 'triangle', shape: 'jaw',
  p1: { id: 'P' }, p2: { id: 'D' }, p3: { id: 'T' },
  jawTipLength: 55.5,
  stock: { widthMm: 24, thicknessMm: 6, material: 'aluminum' },
};
const jawPoints = [{ x: 0, y: 0 }, { x: 0, y: 18 }, { x: -65, y: -85 }];
const jawGeometry = inspectPlateExport(jaw, jawPoints, settings);
const thinJawGeometry = inspectPlateExport({ ...jaw, stock: undefined }, jawPoints, settings);
assert.ok(bounds(jawGeometry.outlines).minX < bounds(thinJawGeometry.outlines).minX);
assert.ok(bounds(jawGeometry.outlines).minY < bounds(thinJawGeometry.outlines).minY);
assert.deepEqual(jawGeometry.holes.map(h => h.r), [6.48, 6.48, 6.48]);

const ttBar = {
  ...bar, isInput: true, motorType: 'tt',
  p1: { id: 'A', physicalMotor: true },
};
const ttGeometry = inspectLinkExport(ttBar, 80, {
  ...settings, ttShaftFlatDiameterMm: 6, ttShaftFlatThicknessMm: 4,
});
assert.equal(ttGeometry.cutouts.length, 1);
assert.equal(ttGeometry.cutouts[0].layer, 'TT_SHAFT_FLAT');
assert.ok(Math.abs(Math.max(...ttGeometry.cutouts[0].points.map(p => p.x)) - 2) < 1e-9);
assert.ok(Math.abs(Math.max(...ttGeometry.cutouts[0].points.map(p => p.y)) - 3) < 1e-9);
assert.equal(ttGeometry.holes.length, 1, 'non-motor endpoint remains a circular hole');

const hosted = hostedBarGeometry(bar, points, settings, [{ kind: 'tt', center: { x: 40, y: 0 } }]);
assert.ok(hosted && hosted.outlines.length > 0, 'hosted bar keeps its mount outline');
assert.ok(bounds(hosted.outlines).minY <= -12, 'hosted bar frame geometry includes stock width');

class FakeAnchor {
  click() {}
  remove() {}
}
const downloads = [];
globalThis.document = {
  body: { appendChild() {} },
  createElement: () => new FakeAnchor(),
};
globalThis.URL = class FakeURL {
  static createObjectURL(blob) {
    const url = `blob:member-stock-${downloads.length}`;
    downloads.push({ url, blob });
    return url;
  }
  static revokeObjectURL() {}
};
globalThis.setTimeout = () => 0;

const tri = {
  id: 'Plate<&>', type: 'triangle',
  p1: { id: 'A' }, p2: { id: 'B' }, p3: { id: 'C' },
  stock: { widthMm: 24, thicknessMm: 6, material: 'plywood' },
};
const triPoints = { A: { x: 0, y: 0 }, B: { x: 80, y: 0 }, C: { x: 40, y: 50 } };
const exportComps = [bar, tri];
const exportPoints = { ...points, C: triPoints.C };
assert.equal(exportLinksAsSvg(exportComps, exportPoints, {}, settings), 2);
const svgTexts = await Promise.all(downloads.map(({ blob }) => blob.text()));
assert.ok(svgTexts.some(svg => svg.includes('<desc>材料與尺寸：壓克力') && svg.includes('板寬 24 mm') && svg.includes('厚度 6 mm')));
assert.ok(svgTexts.some(svg => svg.includes('材料與尺寸：夾板') && svg.includes('板寬 24 mm') && svg.includes('&lt;&amp;&gt;')));
assert.ok(svgTexts.find(svg => svg.includes('<title>StockBar</title>')).includes('r="6.48"'));

downloads.length = 0;
const hostedMount = { frameBody: 'StockBar', kind: 'tt', center: { x: 40, y: 0 } };
assert.equal(exportLinksAsSvg([bar], exportPoints, {}, settings, [hostedMount]), 1);
const hostedSvg = await downloads[0].blob.text();
assert.ok(hostedSvg.includes('材料與尺寸：壓克力') && hostedSvg.includes('板寬 24 mm') && hostedSvg.includes('厚度 6 mm'));

downloads.length = 0;
assert.equal(exportLinksAsDxf(exportComps, exportPoints, {}, settings, [hostedMount]), 2);
const dxfTexts = await Promise.all(downloads.map(({ blob }) => blob.text()));
assert.ok(dxfTexts.some(dxf => dxf.includes('STOCK material=acrylic widthMm=24 thicknessMm=6')));
assert.ok(dxfTexts.some(dxf => dxf.includes('STOCK material=plywood widthMm=24 thicknessMm=6')));

downloads.length = 0;
assert.equal(exportLinksAsDxf([bar], exportPoints, {}, settings, [hostedMount]), 1);
assert.ok((await downloads[0].blob.text()).includes('STOCK material=acrylic widthMm=24 thicknessMm=6'));

console.log('member stock export checks passed');
