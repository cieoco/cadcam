// L5c（走通舉升＋夾取 第 5 包）：干涉檢查——同層零件互撞、螺絲頭／螺帽凸出撞到鄰層、MG995 機身穿到後面幾層。
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
let IF = null;
try { IF = await import('../js/blocks/interference.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
check('interference.js 匯出 findInterference', typeof IF?.findInterference === 'function');
if (typeof IF?.findInterference !== 'function') { report('interference'); process.exit(1); }

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
const ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };

// ---------- 人工例子：兩根各自馬達帶動的桿，同層，B 轉 90° 時撞到 A ----------
const pt = (id, x, y, type = 'floating', extra = {}) => ({ id, x, y, type, ...extra });
const mk = (zliftB = 0) => [
  { type: 'anchor', id: 'AnA', p1: pt('A', 0, 0, 'fixed') }, { type: 'anchor', id: 'AnB', p1: pt('B', 70, 0, 'fixed') },
  { type: 'bar', id: 'BarA', p1: pt('A', 0, 0, 'fixed', { physicalMotor: '1' }), p2: pt('A2', 30, 0), lenParam: 'LA', isInput: true, physicalMotor: '1', phaseOffset: 0 },
  { type: 'bar', id: 'BarB', p1: pt('B', 70, 0, 'fixed', { physicalMotor: '2' }), p2: pt('B2', 70, 30), lenParam: 'LB', isInput: true, physicalMotor: '2', phaseOffset: 90, ...(zliftB ? { zlift: zliftB } : {}) },
];
const fxParams = { LA: 30, LB: 30 };
const ranges = { '1': { lo: 0, hi: 0 }, '2': { lo: -90, hi: 90 } };
{
  const comps = mk();
  const plan = BP.buildPlan({ comps, modules: [], params: fxParams, exportSettings: ex, cnc });
  check('人工例子：兩根桿同層', plan.parts.find(p => p.name === 'BarA').layer === plan.parts.find(p => p.name === 'BarB').layer);
  const w = IF.findInterference({ comps, modules: [], params: fxParams, plan, ranges, samplesPerMotor: 13 });
  const hit = w.find(x => x.kind === 'same-layer' && x.parts.includes('BarA') && x.parts.includes('BarB'));
  check('同層干涉：找到 BarA × BarB', !!hit);
  check('干涉項目帶出馬達與角度（M2，接近 90° 那側）', hit && hit.motor === '2' && Math.abs(hit.angleDeg) >= 45);
  check('干涉項目有中文說明', hit && typeof hit.message === 'string' && hit.message.includes('BarA') && hit.message.includes('BarB'));
  const none = IF.findInterference({ comps, modules: [], params: fxParams, plan, ranges: { '1': { lo: 0, hi: 0 }, '2': { lo: -10, hi: 10 } }, samplesPerMotor: 5 });
  check('範圍內碰不到時不報同層干涉', !none.some(x => x.kind === 'same-layer'));
}
{
  const comps = mk(1);   // BarB 手動往上一層
  const plan = BP.buildPlan({ comps, modules: [], params: fxParams, exportSettings: ex, cnc });
  check('BarB 上移一層後兩根不同層', plan.parts.find(p => p.name === 'BarA').layer !== plan.parts.find(p => p.name === 'BarB').layer);
  const w = IF.findInterference({ comps, modules: [], params: fxParams, plan, ranges, samplesPerMotor: 13 });
  check('不同層就不報同層干涉', !w.some(x => x.kind === 'same-layer' && x.parts.includes('BarA') && x.parts.includes('BarB')));
}

// ---------- 舉升＋夾取 ----------
{
  const plan = BP.buildPlan({ comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc });
  const pr = { '1': { lo: -100, hi: 100 }, '2': { lo: 0, hi: 24 } };
  const w = IF.findInterference({ comps: S.comps, modules: S.modules, params: S.topo.params, plan, ranges: pr, samplesPerMotor: 9 });
  console.log('pilot:', w.map(x => `[${x.kind}] ${x.parts.join('×')} @M${x.motor}=${Math.round(x.angleDeg)}`).join(' | '));
  check('回傳陣列，每項有 kind／parts／layer／motor／angleDeg／message',
    Array.isArray(w) && w.every(x => ['same-layer', 'hardware', 'motor-body'].includes(x.kind) && Array.isArray(x.parts) && Number.isFinite(x.layer) && typeof x.message === 'string'));
  const pair = (a, b) => w.some(x => x.kind === 'same-layer' && x.parts.some(p => p.startsWith(a)) && x.parts.some(p => p.startsWith(b)));
  check('嚙合的齒輪不算同層干涉（GearA × GearB）', !pair('GearA', 'GearB'));
  check('嚙合的小齒輪與齒條不算同層干涉', !pair('LiftPinion', 'LiftRackGear'));
  check('同一組零件只列一次（去重）', new Set(w.map(x => x.kind + '|' + [...x.parts].sort().join('|'))).size === w.length);
}

// ---------- 接到製作包 ----------
{
  const plan = BP.buildPlan({ comps: mk(), modules: [], params: fxParams, exportSettings: ex, cnc });
  const w = IF.findInterference({ comps: mk(), modules: [], params: fxParams, plan, ranges, samplesPerMotor: 13 });
  const html = BP.buildPackHtml(plan, { title: 'T', cnc, warnings: [], interference: w });
  check('製作包有「干涉檢查」段落並列出干涉', html.includes('干涉檢查') && html.includes('BarA') && html.includes('BarB'));
  const clean = BP.buildPackHtml(plan, { title: 'T', cnc, warnings: [], interference: [] });
  check('沒有干涉時寫明已檢查、未發現', clean.includes('干涉檢查') && /未發現/.test(clean));
}
report('interference');
