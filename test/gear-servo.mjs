// L1（走通舉升＋夾取 第 1 包）：齒輪可由 MG995 驅動、夾爪模組有自己的開合範圍、齒條行程只套用在帶動它的馬達。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: tag => new FakeElement(tag)
};

const MT = await import('../js/blocks/motor-tools.js');
const Ops = await import('../js/blocks/module-ops.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const { compileAssembly, solveAssembly } = await import('../js/blocks/assembly.js');
const { jawCenterline } = await import('../js/blocks/plate-geometry.js');
const { memberStock } = await import('../js/blocks/member-stock.js');

const fns = ['motorTypeAt', 'servoRange', 'rackDrivenBy'];
check('motor-tools 匯出純函式 motorTypeAt／servoRange／rackDrivenBy', fns.every(n => typeof MT[n] === 'function'));
if (!fns.every(n => typeof MT[n] === 'function')) { report('gear-servo'); process.exit(1); }

const pt = (id, extra = {}) => ({ id, x: 0, y: 0, type: 'floating', ...extra });

// ---------- motorTypeAt ----------
{
  const servoBar = { type: 'bar', id: 'B1', isInput: true, motorType: 'mg995', servoStart: 10, servoEnd: 70,
    p1: pt('C1', { physicalMotor: '1' }), p2: pt('E1'), physicalMotor: '1' };
  const ttBar = { type: 'bar', id: 'B2', isInput: true, p1: pt('C2', { physicalMotor: '2' }), p2: pt('E2'), physicalMotor: '2' };
  const servoGear = { type: 'gear', id: 'G1', motorType: 'mg995', servoStart: 0, servoEnd: 45, p1: pt('GC1', { physicalMotor: '3' }) };
  const ttGear = { type: 'gear', id: 'G2', p1: pt('GC2', { physicalMotor: '4' }) };
  const comps = [servoBar, ttBar, servoGear, ttGear];
  check('桿件伺服 → mg995', MT.motorTypeAt(comps, 'C1') === 'mg995');
  check('桿件沒標型號 → tt', MT.motorTypeAt(comps, 'C2') === 'tt');
  check('齒輪標 mg995 → mg995', MT.motorTypeAt(comps, 'GC1') === 'mg995');
  check('齒輪沒標型號 → tt', MT.motorTypeAt(comps, 'GC2') === 'tt');
  check('不是馬達中心 → tt', MT.motorTypeAt(comps, 'E1') === 'tt');

  // ---------- servoRange ----------
  const r1 = MT.servoRange(comps, '1');
  check('桿件伺服範圍照舊', r1 && r1.lo === 10 && r1.hi === 70);
  const r3 = MT.servoRange(comps, '3');
  check('齒輪伺服範圍取 servoStart／servoEnd', r3 && r3.lo === 0 && r3.hi === 45);
  check('反向設定也回 lo ≤ hi', (() => { const r = MT.servoRange([{ ...servoGear, servoStart: 60, servoEnd: -20 }], '3'); return r && r.lo === -20 && r.hi === 60; })());
  check('齒輪伺服缺角度時預設 0～90', (() => { const g = { ...servoGear }; delete g.servoStart; delete g.servoEnd; const r = MT.servoRange([g], '3'); return r && r.lo === 0 && r.hi === 90; })());
  check('TT 齒輪沒有伺服範圍', MT.servoRange(comps, '4') === null);
  check('TT 桿件沒有伺服範圍', MT.servoRange(comps, '2') === null);
}

// ---------- rackDrivenBy ----------
{
  const pinion = { type: 'gear', id: 'P', p1: pt('PC', { physicalMotor: '1' }) };
  const idler = { type: 'gear', id: 'I', mesh: 'Q', p1: pt('IC') };
  const driver = { type: 'gear', id: 'Q', p1: pt('QC', { physicalMotor: '5' }) };
  const rack = { type: 'rack', id: 'R', pinion: 'P', p1: pt('RP') };
  const rack2 = { type: 'rack', id: 'R2', pinion: 'I', p1: pt('RP2') };
  const other = { type: 'gear', id: 'O', p1: pt('OC', { physicalMotor: '2' }) };
  check('帶動小齒輪的馬達 → 齒條行程適用', MT.rackDrivenBy([pinion, rack, other], '1') === true);
  check('別的齒輪上的馬達 → 不適用（夾爪 M2 不可借升降行程）', MT.rackDrivenBy([pinion, rack, other], '2') === false);
  check('小齒輪經嚙合鏈由馬達帶動 → 適用', MT.rackDrivenBy([idler, driver, rack2], '5') === true);
  check('沒有齒條 → 不適用', MT.rackDrivenBy([pinion, other], '1') === false);
}

// ---------- 內建夾爪模組 ----------
{
  const t = Ops.builtinTemplate('gear-gripper');
  const drive = t.comps.find(c => c.type === 'gear' && c.p1 && c.p1.physicalMotor);
  check('內建夾爪模組：驅動齒輪是 MG995，範圍 0～24', drive && drive.motorType === 'mg995' && drive.servoStart === 0 && drive.servoEnd === 24);
  check('內建夾爪模組：兩齒輪輸出孔 Ø3.2（M3 接爪臂）', t.comps.filter(c => c.type === 'gear').every(g => g.pinHoleDiameter === 3.2));
  const lift = Ops.builtinTemplate('rack-lift');
  const liftDrive = lift.comps.find(c => c.type === 'gear' && c.p1 && c.p1.physicalMotor);
  check('內建升降模組：仍是 TT', liftDrive && liftDrive.motorType !== 'mg995');

  S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
  S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
  S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
  const q = () => {};
  const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
  ed.insertBuiltin('rack-lift');
  ed.insertBuiltin('gear-gripper');
  const grip = S.modules[1];
  const gDrive = S.comps.find(c => c.moduleId === grip.id && c.type === 'gear' && c.p1 && c.p1.physicalMotor);
  const gm = String(gDrive.p1.physicalMotor);
  check('插入後夾爪馬達改號仍保留 MG995 設定', gDrive.motorType === 'mg995' && gm === '2');
  const range = MT.servoRange(S.comps, gm);
  check('組合作品：夾爪馬達的範圍是 0～24', range && range.lo === 0 && range.hi === 24);
  check('組合作品：夾爪馬達不套用升降齒條行程', MT.rackDrivenBy(S.comps, gm) === false);
  check('組合作品：升降馬達套用齒條行程', MT.rackDrivenBy(S.comps, '1') === true);
  check('組合作品：夾爪馬達中心畫成 MG995', MT.motorTypeAt(S.comps, gDrive.p1.id) === 'mg995');

  // 爪尖＝jawCenterline 末端（p3 只是折彎處）；淨距＝左右爪尖水平距離扣掉兩側半板寬（同 gripper-workflow 的 gripperTips）。
  const jaws = S.comps.filter(c => c.moduleId === grip.id && c.shape === 'jaw');
  const left = jaws.find(c => c.jawTurnSign === 1), right = jaws.find(c => c.jawTurnSign === -1);
  const halfW = memberStock(left).widthMm / 2 + memberStock(right).widthMm / 2;
  const tipOf = (c, pts) => jawCenterline(['p1', 'p2', 'p3'].map(k => pts[c[k].id]), c.jawTurnSign, c.jawTipLength)?.at(-1);
  const asm = compileAssembly(S.comps, S.modules, { params: S.topo.params });
  const gap = [];
  for (let a = range.lo; a <= range.hi + 1e-9; a += 2) {
    const s = solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': 0, [gm]: a } });
    const l = s.isValid && tipOf(left, s.points), r = s.isValid && tipOf(right, s.points);
    gap.push(l && r ? r.x - l.x - halfW : NaN);
  }
  check('開合範圍內每一點都解得出來', gap.every(Number.isFinite));
  check('開合範圍內爪間淨距單調閉合', gap.every((d, i) => i === 0 || d < gap[i - 1]));
  check('張開端淨距 ≥ 100 mm（夾得進常見方塊）', gap[0] >= 100);
  check('閉合端不相碰也不交錯（淨距 ≥ 5 mm）', Math.min(...gap) >= 5);
  check('閉合端確實收攏（淨距 ≤ 15 mm）', gap[gap.length - 1] <= 15);
}

// ---------- 存檔往返（schema）----------
{
  const Sch = await import('../js/blocks/schema.js');
  const t = Ops.builtinTemplate('gear-gripper');
  const norm = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: t.comps, params: t.params })));
  const g = (norm.comps || []).find(c => c.type === 'gear' && c.p1 && c.p1.physicalMotor);
  check('存檔往返：齒輪的 MG995 與 0～24 保留', g && g.motorType === 'mg995' && g.servoStart === 0 && g.servoEnd === 24);
  const lift = Ops.builtinTemplate('rack-lift');
  const n2 = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: lift.comps, params: lift.params })));
  const lg = (n2.comps || []).find(c => c.type === 'gear' && c.p1 && c.p1.physicalMotor);
  check('存檔往返：TT 齒輪不多出 motorType／servo 欄位（舊檔不變）', lg && !('motorType' in lg) && !('servoStart' in lg) && !('servoEnd' in lg));
}

report('gear-servo');
