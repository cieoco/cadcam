// L2（走通舉升＋夾取 第 2 包）：被馬達帶動的齒輪要能傳扭——TT 用輪轂鎖螺絲、MG995 用圓舵盤鎖螺絲（L2b 取代 L2a 的扁孔）。
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

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const holesOn = (g, layer) => g.holes.filter(h => h.layer === layer);
// TT 驅動輪：輪轂鎖螺絲（L2b，使用者決定；取代 L2a 的 D 型扁孔，3.175 刀做不出貼合的扁孔）
{
  const g = Ex.inspectGearExport(gear('TTG', {}, { physicalMotor: '1' }), params, settings);
  check('TT 驅動輪：沒有 12.96 中心圓孔、也沒有 TT 扁孔', holesOn(g, 'CENTER_HOLE').length === 0 && !(g.cutouts || []).some(c => c.layer === 'TT_SHAFT_FLAT'));
  const c = holesOn(g, 'TT_HUB_CENTER'), sc = holesOn(g, 'TT_HUB_SCREW');
  check('TT 驅動輪：中心過軸孔 Ø6（預設）', c.length === 1 && near(c[0].x, 0) && near(c[0].y, 0) && near(c[0].r, 3));
  check('TT 驅動輪：兩個 Ø3.2 輪轂螺絲孔、孔距 12、對稱於中心', sc.length === 2 && sc.every(h => near(h.r, 1.6)) &&
    near(Math.hypot(sc[0].x - sc[1].x, sc[0].y - sc[1].y), 12) && near(sc[0].x + sc[1].x, 0) && near(sc[0].y + sc[1].y, 0));
  check('輸出孔（PIN_HOLE）不變', holesOn(g, 'PIN_HOLE').some(h => near(h.r, 2.5)));
  const drive = { ttHubCenterMm: 7, ttHubScrewMm: 3, ttHubScrewSpacingMm: 16, hornCenterMm: 5, hornScrewMm: 2, hornScrewCount: 6, hornScrewCircleMm: 18 };
  const g2 = Ex.inspectGearExport(gear('TTG', {}, { physicalMotor: '1' }), params, { ...settings, drive });
  const sc2 = holesOn(g2, 'TT_HUB_SCREW');
  check('輪轂尺寸跟著 settings.drive', sc2.length === 2 && near(holesOn(g2, 'TT_HUB_CENTER')[0]?.r, 3.5) && sc2.every(h => near(h.r, 1.5)) && near(Math.hypot(sc2[0].x - sc2[1].x, sc2[0].y - sc2[1].y), 16));
}
// MG995 驅動輪：圓舵盤鎖螺絲
{
  const g = Ex.inspectGearExport(gear('SRV', { motorType: 'mg995' }, { physicalMotor: '2' }), params, settings);
  const c = holesOn(g, 'MG995_HORN_CENTER'), sc = holesOn(g, 'MG995_HORN_SCREW');
  check('MG995 驅動輪：沒有 12.96 中心圓孔', holesOn(g, 'CENTER_HOLE').length === 0);
  check('MG995 驅動輪：中心孔 Ø6（預設）', c.length === 1 && near(c[0].r, 3));
  check('MG995 驅動輪：4 個 Ø2.2 螺絲孔平均分布在 Ø14 圓上', sc.length === 4 && sc.every(h => near(h.r, 1.1) && near(Math.hypot(h.x, h.y), 7)) &&
    near(sc.reduce((s, h) => s + h.x, 0), 0) && near(sc.reduce((s, h) => s + h.y, 0), 0));
  const g6 = Ex.inspectGearExport(gear('SRV', { motorType: 'mg995' }, { physicalMotor: '2' }), params,
    { ...settings, drive: { ttHubCenterMm: 6, ttHubScrewMm: 3.2, ttHubScrewSpacingMm: 12, hornCenterMm: 6, hornScrewMm: 2, hornScrewCount: 6, hornScrewCircleMm: 18 } });
  check('舵盤螺絲數與孔圓跟著 settings.drive', holesOn(g6, 'MG995_HORN_SCREW').length === 6 && holesOn(g6, 'MG995_HORN_SCREW').every(h => near(Math.hypot(h.x, h.y), 9)));
}
// 從動輪不變
{
  const idle = Ex.inspectGearExport(gear('IDL'), params, settings);
  check('從動輪：中心仍是 12.96 圓孔、沒有輪轂／舵盤孔', holesOn(idle, 'CENTER_HOLE').some(h => near(h.r, 6.48)) &&
    !idle.holes.some(h => /HUB|HORN/.test(h.layer)) && !(idle.cutouts || []).length);
}
// 實際匯出檔
{
  downloads.length = 0;
  const comps = [gear('TTG', {}, { physicalMotor: '1', type: 'fixed' }), gear('IDL', { mesh: 'TTG' })];
  const pts = { TTGC: { x: 0, y: 0 }, TTGP: { x: 18, y: 0 }, IDLC: { x: 60, y: 0 }, IDLP: { x: 78, y: 0 } };
  Ex.exportLinksAsDxf(comps, pts, params, settings, []);
  const dxf = await Promise.all(downloads.map(b => b.text()));
  check('DXF：驅動輪檔含 TT_HUB_CENTER 與 TT_HUB_SCREW、不含 CENTER_HOLE', dxf.some(t => t.includes('TT_HUB_CENTER') && t.includes('TT_HUB_SCREW') && !t.includes('CENTER_HOLE\n')));
  check('DXF：從動輪檔仍有 CENTER_HOLE', dxf.filter(t => !t.includes('TT_HUB')).every(t => t.includes('CENTER_HOLE')));
}
report('gear-drive-hole');
