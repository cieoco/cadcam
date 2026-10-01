// L3a（走通舉升＋夾取 第 3 包前半）：齒條要能匯出（齒形＋M3 導銷長槽＋M3 孔），機架導銷孔改 M3。
import { check, report } from './_harness.mjs';

class FakeAnchor { click() {} remove() {} }
const downloads = [];
globalThis.document = { body: { appendChild() {} }, createElement: () => new FakeAnchor() };
globalThis.URL = class { static createObjectURL(b) { downloads.push(b); return 'x'; } static revokeObjectURL() {} };
globalThis.setTimeout = () => 0;

const Ex = await import('../js/blocks/exporters.js');
const Ops = await import('../js/blocks/module-ops.js');
const Model = await import('../js/blocks/model.js');
const Sch = await import('../js/blocks/schema.js');
check('exporters 匯出 inspectRackExport', typeof Ex.inspectRackExport === 'function');
if (typeof Ex.inspectRackExport !== 'function') { report('rack-export'); process.exit(1); }

const t = Ops.builtinTemplate('rack-lift');
const rack = t.comps.find(c => c.type === 'rack');
const pinion = t.comps.find(c => c.id === rack.pinion);
const params = t.params;
const near = (a, b, e) => Math.abs(a - b) <= e;
const ext = pts => ({ minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)) });

// 內建升降模板：M3 導銷與鎖付
check('模板：齒條長槽寬 3.4（M3 導銷）', rack.slot && rack.slot.width === 3.4);
check('模板：齒條兩端孔 Ø3.2（M3）', rack.holes.length >= 2 && rack.holes.every(h => h.diameter === 3.2));
check('模板：齒條記錄機架導銷孔 Ø3.2', rack.pinHoleDiameterMm === 3.2);

// 齒條幾何（齒條座標：x 沿齒條軸、y 沿法向 n=(-uy,ux)，原點＝rack.p1，與 solver 的孔位公式一致）
const g = Ex.inspectRackExport(rack, params, pinion);
const L = params[rack.lenParam] + 2 * rack.endMargin;
const o = ext(g.outline);
// createRackPath 保留 ±(L/2+10) 內的完整齒，所以外形比標稱長度多出不到一齒；與畫面、3D 同一形狀，不截半齒。
const pitch = Math.PI * 2 * params[pinion.radiusParam] / pinion.teeth;
check('外形長度介於 齒條長＋兩端留邊 與 再加一齒距＋10 之間（與畫面同形）', o.maxX - o.minX >= L - 0.5 && o.maxX - o.minX <= L + pitch + 10);
const slots = (g.cutouts || []).filter(c => c.layer === 'RACK_SLOT');
check('一條 RACK_SLOT 長槽', slots.length === 1);
const s = ext(slots[0]?.points || [{ x: 0, y: 0 }]);
check('長槽總長 ＝ 槽長＋槽寬（144＋3.4）', near(s.maxX - s.minX, rack.slot.length + 3.4, 0.3));
check('長槽寬 3.4', near(s.maxY - s.minY, 3.4, 0.05));
const holes = g.holes.filter(h => h.layer === 'RACK_HOLE');
check('兩個 RACK_HOLE、半徑 1.6', holes.length === 2 && holes.every(h => near(h.r, 1.6, 1e-6)));
const half = params[rack.lenParam] / 2;
check('兩端孔在 x ＝ ±齒條長/2（與 solver 的 endA／endB 一致）', holes.some(h => near(h.x, -half, 0.01)) && holes.some(h => near(h.x, half, 0.01)));
check('孔在 y ＝ v（-15），與長槽中心線同一條線', holes.every(h => near(h.y, -15, 0.01)) && near((s.minY + s.maxY) / 2, -15, 0.05));
check('孔與長槽都在外形範圍內', holes.every(h => h.x - h.r > o.minX && h.x + h.r < o.maxX && h.y - h.r > o.minY && h.y + h.r < o.maxY) && s.minY > o.minY && s.maxY < o.maxY);

// 匯出檔：齒條檔
{
  downloads.length = 0;
  const pts = {}; t.comps.forEach(c => ['p1', 'p2'].forEach(k => c[k] && (pts[c[k].id] = { x: c[k].x, y: c[k].y })));
  Ex.exportLinksAsDxf(t.comps, pts, params, { holeDiameterMm: 12.96 }, []);
  const files = await Promise.all(downloads.map(b => b.text()));
  const rk = files.find(f => f.includes('RACK_CUT'));
  check('匯出 DXF 含齒條檔（RACK_CUT＋RACK_SLOT＋RACK_HOLE）', rk && rk.includes('RACK_SLOT') && rk.includes('RACK_HOLE'));
  check('cncPartsForExport 也列出齒條', Ex.cncPartsForExport(t.comps, pts, params, { holeDiameterMm: 12.96 }, []).some(p => p.name === rack.id && p.cutouts.some(c => c.layer === 'RACK_SLOT')));
}

// 機架：導銷孔改 M3
{
  const nodes = Model.frameConnectorNodes(t.comps);
  const f = Ex.inspectFrameExport(nodes, { holeDiameterMm: 12.96, frameHoleDiameterMm: 12.96 }, []);
  const at = (x, y) => f.holes.filter(h => Math.hypot(h.x - x, h.y - y) < 0.05);
  const pins = rack.framePins.map(id => t.comps.flatMap(c => ['p1'].map(k => c[k])).find(p => p && p.id === id));
  check('機架上兩個導銷孔都是 Ø3.2', pins.every(p => at(p.x, p.y).length >= 1 && at(p.x, p.y).every(h => near(h.r, 1.6, 1e-6))));
}

// 存檔往返
{
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: t.comps, params })));
  const r2 = n.comps.find(c => c.type === 'rack');
  check('存檔往返保留 pinHoleDiameterMm、槽寬 3.4、孔徑 3.2', r2.pinHoleDiameterMm === 3.2 && r2.slot.width === 3.4 && r2.holes.every(h => h.diameter === 3.2));
}
report('rack-export');
