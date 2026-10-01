// L4（走通舉升＋夾取 第 4 包）：依刀徑檢查匯出特徵——比刀小的孔、窄於刀的開口、尖角會留圓角。
import { check, report } from './_harness.mjs';

let CC = null;
try { CC = await import('../js/blocks/cnc-check.js'); } catch (_) {}
check('cnc-check.js 匯出 cncWarnings', typeof CC?.cncWarnings === 'function');
const Ex = await import('../js/blocks/exporters.js');
check('exporters 匯出 cncPartsForExport', typeof Ex.cncPartsForExport === 'function');
if (typeof CC?.cncWarnings !== 'function' || typeof Ex.cncPartsForExport !== 'function') { report('cnc-check'); process.exit(1); }

const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const rect = (w, h) => [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];
const circlePts = (r, n = 36) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos(2 * Math.PI * i / n), y: r * Math.sin(2 * Math.PI * i / n) }));

// 圓孔
{
  const w = CC.cncWarnings([{ name: 'frame', holes: [{ r: 1.5, layer: 'TT_SCREW' }, { r: 2, layer: 'TT_LOCATOR' }, { r: 6.48, layer: 'PIVOT_HOLE' }], cutouts: [] }], cnc);
  check('Ø3 孔比 3.175 刀小 → 警告（含零件名、孔徑、刀徑、鑽孔建議）', w.some(m => m.includes('frame') && m.includes('3') && m.includes('3.175') && /鑽/.test(m)));
  check('Ø4、Ø12.96 孔不警告', !w.some(m => m.includes('TT_LOCATOR') || m.includes('PIVOT_HOLE')));
  check('同一零件兩個相同小孔只列一次（含數量）', (() => {
    const w2 = CC.cncWarnings([{ name: 'f', holes: [{ r: 1.5, layer: 'TT_SCREW' }, { r: 1.5, layer: 'TT_SCREW' }], cutouts: [] }], cnc);
    return w2.length === 1 && /2/.test(w2[0]);
  })());
}
// 開口寬度與尖角
{
  const narrow = CC.cncWarnings([{ name: 'p', holes: [], cutouts: [{ points: rect(2.5, 10), layer: 'SLOT' }] }], cnc);
  check('寬 2.5 的開口比刀窄 → 警告', narrow.some(m => m.includes('SLOT') && /窄/.test(m)));
  const slot = CC.cncWarnings([{ name: 'Mod2-frame', holes: [], cutouts: [{ points: rect(41.2, 20.2), layer: 'MG995_SLOT' }] }], cnc);
  check('MG995 方槽：不因寬度警告', !slot.some(m => /窄/.test(m)));
  check('MG995 方槽：4 個尖角 → 提醒會留 R1.59 圓角、需狗骨清角', slot.some(m => m.includes('MG995_SLOT') && /4/.test(m) && m.includes('1.59') && /狗骨/.test(m)));
  const round = CC.cncWarnings([{ name: 'q', holes: [], cutouts: [{ points: circlePts(5), layer: 'ROUND' }] }], cnc);
  check('圓形開口（細分點）不算尖角', round.length === 0);
  check('刀徑 1 mm 時 2.5 寬開口不警告', !CC.cncWarnings([{ name: 'p', holes: [], cutouts: [{ points: rect(2.5, 10), layer: 'SLOT' }] }], { toolDiameterMm: 1, stockThicknessMm: 3 }).some(m => /窄/.test(m)));
  check('沒有特徵 → 空陣列', CC.cncWarnings([], cnc).length === 0);
}
// 從匯出的真實幾何收集零件
{
  const gear = { type: 'gear', id: 'LiftPinion', teeth: 15, module: 4, radiusParam: 'R', p1: { id: 'C', x: 0, y: 0, physicalMotor: '1' }, p2: { id: 'P', x: 18, y: 0 } };
  const bar = { type: 'bar', id: 'Crank', p1: { id: 'A', x: 0, y: 0 }, p2: { id: 'B', x: 40, y: 0 } };
  const pts = { C: { x: 0, y: 0 }, P: { x: 18, y: 0 }, A: { x: 0, y: 0 }, B: { x: 40, y: 0 } };
  const parts = Ex.cncPartsForExport([gear, bar], pts, { R: 30 }, { holeDiameterMm: 12.96 }, []);
  const names = parts.map(p => p.name).sort();
  check('cncPartsForExport：列出桿件與齒輪（名稱同匯出檔名）', names.includes('LiftPinion') && names.includes('Crank'));
  const lp = parts.find(p => p.name === 'LiftPinion');
  check('cncPartsForExport：TT 驅動輪帶著輪轂孔（L2b 取代扁孔）', lp && lp.holes.some(h => h.layer === 'TT_HUB_SCREW') && lp.holes.some(h => h.layer === 'TT_HUB_CENTER'));
  const servo = { type: 'gear', id: 'GearA', teeth: 15, module: 4, radiusParam: 'R', motorType: 'mg995', p1: { id: 'S', x: 0, y: 0, physicalMotor: '2' }, p2: { id: 'Q', x: 18, y: 0 } };
  const sp = Ex.cncPartsForExport([servo], { S: { x: 0, y: 0 }, Q: { x: 18, y: 0 } }, { R: 30 }, { holeDiameterMm: 12.96 }, []);
  const w = CC.cncWarnings(sp, cnc);
  check('MG995 舵盤 Ø2.2 螺絲孔在 3.175 刀下被提醒要用鑽頭', w.some(m => m.includes('GearA') && m.includes('MG995_HORN_SCREW') && /鑽/.test(m)));
}
report('cnc-check');
