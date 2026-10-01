// L5b（走通舉升＋夾取 第 5 包）：製作包＝板件清單＋五金清單＋組裝步驟（可列印 HTML）。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); }, createElement: t => new FakeElement(t) };

const BP = await import('../js/blocks/build-plan.js');
check('build-plan 匯出 hardwareList／buildPackHtml', typeof BP.hardwareList === 'function' && typeof BP.buildPackHtml === 'function');
if (typeof BP.hardwareList !== 'function' || typeof BP.buildPackHtml !== 'function') { report('build-pack'); process.exit(1); }

const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('rack-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
ed.mountTo(L.id, L.outputs[0].id);

const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const plan = BP.buildPlan({ comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 }, cnc });
const part = p => plan.parts.find(x => x.name === p || x.name.startsWith(p + '_'));

// 零件尺寸與孔種類（與匯出幾何同源）
check('每片零件有外形尺寸', plan.parts.every(p => p.widthMm > 0 && p.heightMm > 0));
check('齒條長邊約 200–225 mm（含齒形餘量）', (() => { const r = part('LiftRackGear'); const L = Math.max(r.widthMm, r.heightMm); return L >= 200 && L <= 225; })());
check('孔種類計數：主機架 TT_SCREW ×2、夾爪底板 MG995_SCREW ×4', part('frame').holeLayers?.TT_SCREW === 2 && part(`${G.id}-frame`).holeLayers?.MG995_SCREW === 4);

// 五金清單
const hw = BP.hardwareList(plan);
console.log('hardware:', hw.map(r => `${r.spec}×${r.qty}`).join(' | '));
const qty = re => hw.filter(r => re.test(r.spec)).reduce((s, r) => s + r.qty, 0);
check('M3×10 共 10 支（導銷 2＋對鎖 2＋爪臂銷 2＋MG995 耳孔 4）', qty(/^M3×10\b/) === 10);
check('M3×16 共 1 支（惰輪軸穿三片 9 mm＋防鬆螺帽 → 取標準 16）', qty(/^M3×16\b/) === 1);
check('TT 固定螺絲 M3×30 ×2', qty(/^M3×30\b/) === 2);
check('TT 輪轂螺絲 M3×8 ×2', qty(/^M3×8\b/) === 2);
check('MG995 舵盤螺絲 M2×6 ×4', qty(/^M2×6\b/) === 4);
check('M3 防鬆螺帽數＝穿透式 M3 螺絲數（10＋1＋2，不含鎖進輪轂的 2 支）', qty(/防鬆螺帽/) === 13);
check('馬達：TT 減速馬達 ×1、MG995 ×1', qty(/TT/) >= 1 && hw.some(r => /TT 減速馬達/.test(r.spec) && r.qty === 1) && hw.some(r => /MG995 伺服/.test(r.spec) && r.qty === 1));
check('每列都有用途說明', hw.every(r => typeof r.note === 'string' && r.note.length > 0));

// 製作包 HTML
const html = BP.buildPackHtml(plan, { title: '舉升＋夾取', cnc, warnings: ['測試用警告 A'] });
check('HTML：完整文件、含標題與板材／刀徑', /^<!doctype html>/i.test(html.trim()) && html.includes('舉升＋夾取') && html.includes('3.175') && html.includes('3 mm'));
check('HTML：列出每片零件檔名', plan.parts.every(p => html.includes(p.name)));
check('HTML：組裝步驟由第 0 層到第 4 層', [0, 1, 2, 3, 4].every(n => html.includes(`第 ${n} 層`)) && html.indexOf('第 0 層') < html.indexOf('第 4 層'));
check('HTML：五金清單含 M3×10 與數量', html.includes('M3×10') && /×\s*10|10\s*支/.test(html));
check('HTML：導銷提醒不要鎖死、樞軸提醒防鬆可轉', /不要鎖死/.test(html) && /可(以)?轉/.test(html));
check('HTML：帶出 CNC 警告', html.includes('測試用警告 A'));
check('HTML：沒有 undefined／NaN', !/undefined|NaN/.test(html));
check('HTML：註明輪轂／舵盤尺寸與干涉尚未實物驗證', /實(物|際)?驗證|實量/.test(html));

// 接到 UI
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../blocks.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/blocks/app.js', import.meta.url), 'utf8');
check('匯出區有「製作包」按鈕', /window\.blocks\.downloadBuildPack\(\)/.test(page) && page.includes('製作包'));
check('window.blocks 暴露 downloadBuildPack', /downloadBuildPack\s*[,}]/.test(app.slice(app.indexOf('window.blocks = {'))));
report('build-pack');
