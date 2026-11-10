// 數位積木 G6 齒輪對格（docs/SDD-GRID-BLOCKS.md R5）。跑法：node test/grid-gear.mjs
import { check, report } from './_harness.mjs';
import { gearGridSuggestions, gearHoleGridAtPoint, gearCenterText } from '../js/blocks/grid-gear.js';
import { pitchDeviation, gridIssues } from '../js/blocks/grid-rule.js';

// 建議組合：模數 6 時 z1+z2 需為 8 的倍數
const s = gearGridSuggestions(12, 18, 6);
check('建議最多 3 組且皆使中心距為 8 的倍數', s.length === 3 && s.every(x => pitchDeviation(6 * (x.z1 + x.z2) / 2).ok));
check('依變動量排序（總變動 2，最大變動小者在前）', JSON.stringify(s) === JSON.stringify([{ z1: 13, z2: 19 }, { z1: 12, z2: 20 }, { z1: 14, z2: 18 }]), JSON.stringify(s));
check('已在格上的目前組合不被建議', !gearGridSuggestions(12, 20, 6).some(x => x.z1 === 12 && x.z2 === 20));
check('max 參數限制筆數', gearGridSuggestions(12, 18, 6, 1).length === 1);
check('模數 4 時 z1+z2 為 4 的倍數即在格上', gearGridSuggestions(15, 20, 4).every(x => (x.z1 + x.z2) % 4 === 0) && gearGridSuggestions(15, 20, 4)[0].z1 + gearGridSuggestions(15, 20, 4)[0].z2 === 36);
check('提示文字：在格上', gearCenterText(12, 20, 6) === '中心距 96 mm＝12 格', gearCenterText(12, 20, 6));
check('提示文字：離格列出建議', gearCenterText(12, 18, 6) === '中心距 90 mm 離格，可改齒數：13/19、12/20、14/18', gearCenterText(12, 18, 6));

// 輸出孔吸附
const gear = { p1: { x: 100, y: 50 }, radiusParam: 'R' }, params = { R: 60 };   // 節圓半徑 60 → 孔距上限 56
const near = (a, b) => Math.abs(a - b) < 1e-6;
const at = (lx, ly, pose = 0) => { const t = pose * Math.PI / 180; return { x: 100 + lx * Math.cos(t) - ly * Math.sin(t), y: 50 + lx * Math.sin(t) + ly * Math.cos(t) }; };
let h = gearHoleGridAtPoint(gear, params, at(17, 23), { poseDeg: 0 });
check('局部 (17,23) 吸附到 (16,24)：孔距 8√13、角度 atan2(3,2)', h && near(h.radius, 8 * Math.sqrt(13)) && near(h.angle, Math.atan2(3, 2) * 180 / Math.PI), JSON.stringify(h));
for (const pose of [30, 90, 200, -45]) {
  h = gearHoleGridAtPoint(gear, params, at(17, 23, pose), { poseDeg: pose });
  check(`姿態 ${pose}° 下結果與姿態無關`, h && near(h.radius, 8 * Math.sqrt(13)) && near(h.angle, Math.atan2(3, 2) * 180 / Math.PI), JSON.stringify(h));
}
h = gearHoleGridAtPoint(gear, params, at(2, 1));
check('太靠近中心（< 8）退到次近合法格點', h && near(h.radius, 8) && near(h.angle, 0), JSON.stringify(h));
h = gearHoleGridAtPoint(gear, params, at(100, 0));
check('超出節圓範圍退到次近合法格點（孔距 ≤ 56）', h && h.radius <= 56 + 1e-9 && h.radius >= 8 && near(Math.round(h.radius * h.radius / 64), h.radius * h.radius / 64), JSON.stringify(h));
check('孔距一律是 8√n', [at(30, -11), at(-45, 20), at(5, 5)].every(p => { const r = gearHoleGridAtPoint(gear, params, p).radius / 8, n = Math.round(r * r); return near(r * r, n); }));
check('節圓太小無合法格點回 null', gearHoleGridAtPoint(gear, { R: 10 }, at(5, 0)) === null);

// 預設齒輪對在格上（模數為 GEAR_MODULE）
globalThis.window = { confirm: () => true, alert: m => { throw Error(m); } };
class FakeElement { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; } appendChild(c) { this.children.push(c); return c; } addEventListener() {} }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); }, createElement: () => new FakeElement() };
const { S } = await import('../js/blocks/state.js');
const Model = await import('../js/blocks/model.js');
const { createGearEditor } = await import('../js/blocks/gear-editor.js');
const noop = () => {};
const editor = createGearEditor({ pushUndo: noop, pause: noop, rebuild: noop, draw: noop, renderFrame: noop, transient: noop, scheduleAutosave: noop,
  cancelMotorMode: noop, exitDrawTools: noop, openMobileEditPanel: noop, closeMobileEditPanel: noop, hideEditorPanels: noop,
  snapshotStr: () => '', updateUndoBtn: noop, recordManualTrace: noop, worldFromEvent: () => null, mobilePrompt: () => false,
  pointCoords: () => Model.pointCoords(S.comps), updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y), pointIsGround: id => Model.pointIsGround(S.comps, id) });
editor.addGearPair();
const [a, b] = S.comps.filter(c => c.type === 'gear');
const center = a.module * (a.teeth + b.teeth) / 2;
check('新建齒輪對預設中心距在 8 mm 格上', pitchDeviation(center).ok && b.teeth === 2 * a.teeth && center === 72 && b.p1.x - a.p1.x === center, `${a.teeth}:${b.teeth} 中心距 ${center}`);
check('預設齒輪對無 R5 中心距離格', !gridIssues(S.comps, S.topo.params).some(i => i.rule === 'R5' && i.subject === '齒輪中心距'));
report('grid-gear');
