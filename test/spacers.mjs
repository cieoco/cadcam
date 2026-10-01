// L6a（走通舉升＋夾取 第 6 包）：螺絲頭／螺帽刮到鄰層 → 在那兩層之間加隔圈，拉開空間；
// 疊層改用 mm 高度（zMm）計算，跨過隔圈的螺絲變長、清單列出隔圈、干涉檢查視為已解決。
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
const IF = await import('../js/blocks/interference.js');
check('interference.js 匯出 resolveSpacers', typeof IF.resolveSpacers === 'function');
if (typeof IF.resolveSpacers !== 'function') { report('spacers'); process.exit(1); }

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
const base = { comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc };
const part = (plan, prefix) => plan.parts.find(p => p.name === prefix || p.name.startsWith(prefix + '_'));
const joint = (plan, prefix) => plan.joints.find(j => j.id === prefix || j.id.startsWith(prefix + '_'));
const GF = `${G.id}-frame`;

// ---------- 1. 沒有隔圈：舊行為不變，另多 zMm 與空的 gaps ----------
{
  const plan = BP.buildPlan(base);
  check('沒有隔圈：plan.gaps 是空陣列', Array.isArray(plan.gaps) && plan.gaps.length === 0);
  check('每片板有 zMm（底面高度）＝層號 × 3 mm', plan.parts.every(p => p.zMm === p.layer * 3));
  check('沒有隔圈：關節 spanMm 不變（GPA 6、GCB 9）', joint(plan, 'GPA').spanMm === 6 && joint(plan, 'GCB').spanMm === 9);
  check('沒有隔圈：每個關節 spacers 是空陣列', plan.joints.every(j => Array.isArray(j.spacers) && j.spacers.length === 0));
}

// ---------- 2. 手動指定隔圈 ----------
{
  const plan = BP.buildPlan({ ...base, spacers: [{ below: 3, mm: 3 }, { below: 3, mm: 2 }, { below: 1, mm: 3 }] });
  check('gaps 依 below 合併（取最大 mm）並排序', JSON.stringify(plan.gaps) === JSON.stringify([{ below: 1, mm: 3 }, { below: 3, mm: 3 }]));
  check('zMm：第 1 層＝3＋隔圈 3＝6', part(plan, 'LiftRackGear').zMm === 6);
  check('zMm：第 2 層＝9、第 3 層＝9＋3＋3＝15、第 4 層＝18', part(plan, GF).zMm === 9 && part(plan, 'GearA').zMm === 15 && part(plan, 'LeftJaw').zMm === 18);
  check('層號不變（隔圈不是一層）', part(plan, 'GearA').layer === 3 && part(plan, GF).layer === 2);
  const lga = joint(plan, 'LGA'), gcb = joint(plan, 'GCB'), gpa = joint(plan, 'GPA'), lo = joint(plan, 'LiftOutput');
  check('導銷 LGA 跨過第 0／1 層間隔圈：spacers=[{below:1,mm:3}]、spanMm 6+3=9', JSON.stringify(lga.spacers) === JSON.stringify([{ below: 1, mm: 3 }]) && lga.spanMm === 9);
  check('惰輪軸 GCB（2～4 層）跨過 below 3：spanMm 9+3=12', gcb.spacers.length === 1 && gcb.spacers[0].below === 3 && gcb.spanMm === 12);
  check('GPA（3～4 層）不跨隔圈：不變', gpa.spacers.length === 0 && gpa.spanMm === 6);
  check('LiftOutput（1～2 層）不跨 below 1（隔圈在它下面）', lo.spacers.length === 0 && lo.spanMm === 6);
  check('螺絲長度跟著變：LGA 9+4=13 → M3×16', BP.jointScrewSpec(lga) === 'M3×16');

  const hw = BP.hardwareList(plan);
  const sp = hw.find(r => /隔圈/.test(r.spec) && /3/.test(r.spec));
  // 穿過隔圈的螺絲關節：LGA、LGB（below 1）、GCB（below 3）→ 3 個；馬達軸（LPC、GCA）不算
  check('五金清單列出 3 mm 隔圈，數量＝跨過隔圈的螺絲關節數（3）', sp && sp.qty === 3);
  const html = BP.buildPackHtml(plan, { title: 'T', cnc });
  check('製作包說明層間隔圈（第 0、1 層之間 3 mm）', /隔圈/.test(html) && /第 0、1 層之間/.test(html));
  check('製作包提醒穿過隔圈的馬達軸要墊高（輪轂／舵盤）', /墊高/.test(html));
}

// ---------- 3. 干涉檢查改用 mm 高度 ----------
const pr = { '1': { lo: -100, hi: 100 }, '2': { lo: 0, hi: 24 } };
{
  const plan = BP.buildPlan(base);
  const w = IF.findInterference({ ...base, plan, ranges: pr, samplesPerMotor: 9 });
  const hw = w.filter(x => x.kind === 'hardware');
  check('沒隔圈：仍找到螺絲頭干涉（GPA、GPB 刮夾爪底板；LiftOutputB 刮機架）',
    hw.some(x => x.parts.some(p => p.startsWith('GearA')) && x.parts.includes(GF)) &&
    hw.some(x => x.parts.some(p => p.startsWith('LiftRackGear')) && x.parts.includes('frame')));
  check('螺絲頭干涉附建議 fix：{ below, mm }，螺絲頭那側 below＝關節最低層', hw.every(x => x.fix && Number.isInteger(x.fix.below) && x.fix.mm >= 3));
  const gpaHit = hw.find(x => x.parts.some(p => p.startsWith('GearA')) && x.parts.includes(GF));
  check('GPA 螺絲頭（3～4 層）→ 建議第 2、3 層之間加隔圈（below 3）', gpaHit && gpaHit.fix.below === 3);

  const fixed = BP.buildPlan({ ...base, spacers: [{ below: 1, mm: 3 }, { below: 3, mm: 3 }] });
  const w2 = IF.findInterference({ ...base, plan: fixed, ranges: pr, samplesPerMotor: 9 });
  check('加了隔圈：不再報螺絲頭干涉', !w2.some(x => x.kind === 'hardware'));
  check('加了隔圈：MG995 機身干涉仍在（行程問題，L6b 處理）', w2.some(x => x.kind === 'motor-body'));
}

// ---------- 4. resolveSpacers：自動加隔圈直到螺絲頭不再刮 ----------
{
  const r = IF.resolveSpacers({ ...base, ranges: pr, samplesPerMotor: 9 });
  check('resolveSpacers 回傳 { plan, interference, spacers }', r && r.plan && Array.isArray(r.interference) && Array.isArray(r.spacers));
  check('自動得到兩處隔圈：第 0／1 層間、第 2／3 層間', JSON.stringify(r.plan.gaps.map(g => g.below)) === JSON.stringify([1, 3]));
  check('自動加隔圈後沒有螺絲頭干涉', !r.interference.some(x => x.kind === 'hardware'));
  check('剩下的干涉只有 MG995 機身', r.interference.length > 0 && r.interference.every(x => x.kind === 'motor-body'));
  const clean = IF.resolveSpacers({ ...base, ranges: { '1': { lo: 0, hi: 0 }, '2': { lo: 0, hi: 0 } }, samplesPerMotor: 1 });
  check('不改輸入 comps', S.comps.every(c => !('layer' in c) && !('zMm' in c)));
  check('回傳的 spacers 與 plan.gaps 一致', JSON.stringify(r.spacers) === JSON.stringify(r.plan.gaps) && Array.isArray(clean.spacers));
}
report('spacers');
