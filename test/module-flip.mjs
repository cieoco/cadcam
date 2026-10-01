// L7（走通舉升＋夾取 第 7 包）：夾爪模組「翻面安裝」——底板（含 MG995）放最外層，齒輪與爪臂夾在底板和齒條之間，
// MG995 機身朝外，不再撞小齒輪與機架，升降保留全行程。對鎖螺絲中間空的層用隔柱撐住。
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

const Ops = await import('../js/blocks/module-ops.js');
check('module-ops 匯出 setMountFlip', typeof Ops.setMountFlip === 'function');
if (typeof Ops.setMountFlip !== 'function') { report('module-flip'); process.exit(1); }
const BP = await import('../js/blocks/build-plan.js');
const IF = await import('../js/blocks/interference.js');
const RL = await import('../js/blocks/rack-limits.js');
const Sch = await import('../js/blocks/schema.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');

S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
let undo = 0;
const q = () => {};
const ed = createModuleEditor({ pushUndo: () => { undo++; }, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('rack-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;

// ---------- 1. 純函式與編輯器 ----------
{
  const before = JSON.stringify(S.modules);
  const r0 = Ops.setMountFlip(S.comps, S.modules, G.id, true);
  check('未安裝的模組不能翻面（ok:false，不改輸入）', r0 && r0.ok === false && JSON.stringify(S.modules) === before);
  ed.mountTo(L.id, L.outputs[0].id);
  const mods = JSON.stringify(S.modules), comps = JSON.stringify(S.comps);
  const r1 = Ops.setMountFlip(S.comps, S.modules, G.id, true);
  check('已安裝：setMountFlip 回 ok、mount.flip=true', r1.ok && r1.modules.find(m => m.id === G.id).mount.flip === true);
  check('不改輸入、零件座標不動（翻面只改疊層）', JSON.stringify(S.modules) === mods && JSON.stringify(r1.comps) === comps);
  const r2 = Ops.setMountFlip(r1.comps, r1.modules, G.id, false);
  check('翻回來：mount 不帶 flip 欄位', r2.ok && !('flip' in r2.modules.find(m => m.id === G.id).mount));
  check('編輯器有 toggleFlip', typeof ed.toggleFlip === 'function');
  const u0 = undo;
  ed.toggleFlip();
  check('toggleFlip：選取的夾爪翻面、只記一筆 undo', S.modules.find(m => m.id === G.id).mount.flip === true && undo === u0 + 1);
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: S.comps, modules: S.modules, params: S.topo.params })));
  check('存檔往返：保留 mount.flip', n.modules && n.modules.find(m => m.id === G.id)?.mount?.flip === true);
}

// ---------- 2. 疊層 ----------
const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };
const base = { comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc };
const part = (plan, prefix) => plan.parts.find(p => p.name === prefix || p.name.startsWith(prefix + '_'));
const joint = (plan, prefix) => plan.joints.find(j => j.id === prefix || j.id.startsWith(prefix + '_'));
const GF = `${G.id}-frame`;
{
  const plan = BP.buildPlan(base);
  console.log('flip parts:', plan.parts.map(p => `${p.name}@${p.layer}`).join(' '));
  check('翻面：主機架 0、小齒輪＋齒條 1 不變', part(plan, 'frame').layer === 0 && part(plan, 'LiftPinion').layer === 1 && part(plan, 'LiftRackGear').layer === 1);
  check('翻面：爪臂緊貼齒條外側（第 2 層）', part(plan, 'LeftJaw').layer === 2 && part(plan, 'RightJaw').layer === 2);
  check('翻面：夾爪齒輪第 3 層', part(plan, 'GearA').layer === 3 && part(plan, 'GearB').layer === 3);
  check('翻面：夾爪底板在最外層（第 4 層）', part(plan, GF).layer === 4);
  const lo = joint(plan, 'LiftOutput');
  check('對鎖螺絲 LiftOutput 跨第 1～4 層', lo.layers.join(',') === '1,4');
  check('中間空的兩層（2、3）用隔柱撐住：standoffMm 6', lo.standoffMm === 6);
  check('有板的關節沒有隔柱（GCB 2～4 層三片都有板）', (joint(plan, 'GCB').standoffMm || 0) === 0);
  check('對鎖螺絲 spanMm＝4 層 12 mm → M3×16', lo.spanMm === 12 && BP.jointScrewSpec(lo) === 'M3×16');
  const hw = BP.hardwareList(plan);
  const so = hw.find(r => /隔柱/.test(r.spec) && /6/.test(r.spec));
  check('五金清單：M3 隔柱 6 mm ×2（兩顆對鎖螺絲）', so && so.qty === 2);
  const html = BP.buildPackHtml(plan, { title: 'T', cnc });
  check('組裝步驟提到隔柱', /隔柱/.test(html));

  const unflipped = BP.buildPlan({ ...base, modules: S.modules.map(m => m.id === G.id ? { ...m, mount: { ...m.mount, flip: undefined } } : m) });
  check('沒翻面：疊層照舊（底板 2、齒輪 3、爪臂 4），對鎖螺絲沒有隔柱', part(unflipped, GF).layer === 2 && part(unflipped, 'GearA').layer === 3 && part(unflipped, 'LeftJaw').layer === 4 && (joint(unflipped, 'LiftOutput').standoffMm || 0) === 0);
}

// ---------- 3. 干涉：機身朝外、保留全行程 ----------
{
  const rack = S.comps.find(c => c.type === 'rack');
  const pinion = S.comps.find(c => c.id === rack.pinion);
  const full = RL.rackGuideThetaRange(S.topo.params[pinion.radiusParam], rack.slot.length, rack.slot.width, rack.sign);
  const ranges = { '1': full, '2': { lo: 0, hi: 24 } };
  const r = IF.resolveSpacers({ ...base, ranges, samplesPerMotor: 15 });
  console.log('flip interference:', r.interference.map(x => x.message).join(' | '), 'gaps:', JSON.stringify(r.plan.gaps));
  check('翻面後沒有 MG995 機身干涉', !r.interference.some(x => x.kind === 'motor-body'));
  check('翻面＋自動隔圈後：全行程內干涉 0 項', r.interference.length === 0);
  const sug = IF.suggestRackStops({ ...base, plan: r.plan, ranges });
  check('不需要限位（升降保留全行程）', Array.isArray(sug) && sug.length === 0);
}
report('module-flip');
