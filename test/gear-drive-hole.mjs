// L2a（走通舉升＋夾取 第 2 包）：TT 帶動的齒輪中心切 TT 扁軸孔（D-D），才能真的傳扭。
import { check, report } from './_harness.mjs';

class FakeAnchor { click() {} remove() {} }
const downloads = [];
globalThis.document = { body: { appendChild() {} }, createElement: () => new FakeAnchor() };
globalThis.URL = class { static createObjectURL(blob) { downloads.push(blob); return `blob:${downloads.length}`; } static revokeObjectURL() {} };
globalThis.setTimeout = () => 0;

const Ex = await import('../js/blocks/exporters.js');
check('exporters 匯出 inspectGearExport', typeof Ex.inspectGearExport === 'function');
if (typeof Ex.inspectGearExport !== 'function') { report('gear-drive-hole'); process.exit(1); }

const params = { R: 30, PR: 18 };
const gear = (id, extra = {}, p1extra = {}) => ({ type: 'gear', id, teeth: 15, module: 4, radiusParam: 'R', pinRadiusParam: 'PR', pinHoleDiameter: 5,
  p1: { id: id + 'C', x: 0, y: 0, ...p1extra }, p2: { id: id + 'P', x: 18, y: 0 }, ...extra });
const settings = { holeDiameterMm: 12.96 };
const radii = pts => pts.map(p => Math.hypot(p.x, p.y));

// TT 驅動輪
{
  const g = Ex.inspectGearExport(gear('TTG', {}, { physicalMotor: '1' }), params, settings);
  const center = g.holes.filter(h => h.layer === 'CENTER_HOLE');
  const flats = (g.cutouts || []).filter(c => c.layer === 'TT_SHAFT_FLAT');
  check('TT 驅動輪：中心不再是圓孔', center.length === 0);
  check('TT 驅動輪：中心是一個 TT 扁軸孔', flats.length === 1);
  const pts = flats[0]?.points || [];
  check('扁軸孔外徑 ≈ 5.4 mm（預設）', pts.length > 4 && Math.abs(Math.max(...radii(pts)) * 2 - 5.4) < 0.05);
  const xs = pts.map(p => Math.abs(p.x)), ys = pts.map(p => Math.abs(p.y));
  const across = Math.min(Math.max(...xs), Math.max(...ys)) * 2;
  check('扁軸孔兩平面間距 ≈ 3.7 mm（預設）', Math.abs(across - 3.7) < 0.05);
  check('扁軸孔圍繞齒輪中心', Math.abs(pts.reduce((s, p) => s + p.x, 0) / pts.length) < 0.5 && Math.abs(pts.reduce((s, p) => s + p.y, 0) / pts.length) < 0.5);
  check('輸出孔（PIN_HOLE）不變', g.holes.some(h => h.layer === 'PIN_HOLE' && Math.abs(h.r - 2.5) < 1e-9));
  const g2 = Ex.inspectGearExport(gear('TTG', {}, { physicalMotor: '1' }), params, { ...settings, ttShaftFlatDiameterMm: 5.6, ttShaftFlatThicknessMm: 3.9 });
  const p2 = g2.cutouts[0].points;
  check('扁軸孔尺寸跟著匯出設定', Math.abs(Math.max(...radii(p2)) * 2 - 5.6) < 0.05);
}
// 從動輪、MG995 驅動輪維持原樣（MG995 舵盤介面另案 L2b）
{
  const idle = Ex.inspectGearExport(gear('IDL'), params, settings);
  check('從動輪：中心仍是 12.96 圓孔、沒有扁軸孔', idle.holes.some(h => h.layer === 'CENTER_HOLE' && Math.abs(h.r - 6.48) < 1e-9) && !(idle.cutouts || []).length);
  const servo = Ex.inspectGearExport(gear('SRV', { motorType: 'mg995' }, { physicalMotor: '2' }), params, settings);
  check('MG995 驅動輪：本包不改（仍是圓孔、沒有 TT 扁軸孔）', servo.holes.some(h => h.layer === 'CENTER_HOLE') && !(servo.cutouts || []).some(c => c.layer === 'TT_SHAFT_FLAT'));
}
// 實際匯出檔
{
  downloads.length = 0;
  const comps = [gear('TTG', {}, { physicalMotor: '1', type: 'fixed' }), gear('IDL', { mesh: 'TTG' })];
  const pts = { TTGC: { x: 0, y: 0 }, TTGP: { x: 18, y: 0 }, IDLC: { x: 60, y: 0 }, IDLP: { x: 78, y: 0 } };
  Ex.exportLinksAsDxf(comps, pts, params, settings, []);
  const dxf = await Promise.all(downloads.map(b => b.text()));
  const drv = dxf.find(t => t.includes('TT_SHAFT_FLAT')), idl = dxf.filter(t => !t.includes('TT_SHAFT_FLAT'));
  check('DXF：驅動輪檔含 TT_SHAFT_FLAT 聚合線、不含 CENTER_HOLE', drv && /LWPOLYLINE\n8\nTT_SHAFT_FLAT/.test(drv) && !drv.includes('CENTER_HOLE'));
  check('DXF：從動輪檔仍有 CENTER_HOLE', idl.length === 1 && idl[0].includes('CENTER_HOLE'));
  downloads.length = 0;
  Ex.exportLinksAsSvg(comps, pts, params, settings, []);
  const svg = await Promise.all(downloads.map(b => b.text()));
  check('SVG：驅動輪以 path 畫出 TT_SHAFT_FLAT（閉合）', svg.some(t => /<path d="M[^"]+Z?"[^>]*data-layer="TT_SHAFT_FLAT"/.test(t)));
}
report('gear-drive-hole');
