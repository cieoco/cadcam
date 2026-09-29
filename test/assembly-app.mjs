// M1b 刀 1：app 接線用的純函式（組裝姿態、世界機架過濾）與 motion.js 求解注入（SDD-ASSEMBLY-MODULES §4.2、D3）。
import { readFileSync } from 'node:fs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { compileAssembly, solveAssembly, sweepAssembly, homePoseFor, homeAdjustment, worldFrameComps, mountedBaseIds, moduleOfPoint } from '../js/blocks/assembly.js';
import { planMotion, traceSweeps } from '../js/blocks/motion.js';
import { check, report } from './_harness.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- homePoseFor / homeAdjustment（D3：編輯已安裝模組前回到組裝姿態） ----------
{
  const f = clone(fixture);
  check('homePoseFor：已安裝模組回傳 mount.home', same(homePoseFor(f.modules, 'Grip1'), { '1': 0 }));
  check('homePoseFor：未安裝模組、根、不存在 → {}', same(homePoseFor(f.modules, 'Lift1'), {}) && same(homePoseFor(f.modules, null), {}) && same(homePoseFor(f.modules, 'Nope'), {}));
  // 三層：C 裝在 B、B 裝在 A；B.home={1:10}，C.home={1:20, 2:30} → 祖先先併、自己覆蓋
  const chain = [
    { id: 'A', name: 'A', outputs: [{ id: 'o', name: 'o', at: 'a2', body: { kind: 'bar', id: 'LA' } }], mount: null },
    { id: 'B', name: 'B', outputs: [{ id: 'o', name: 'o', at: 'b2', body: { kind: 'bar', id: 'LB' } }], mount: { to: { module: 'A', output: 'o' }, ref: { x: 0, y: 0, a: 0 }, home: { '1': 10, '5': 50 } } },
    { id: 'C', name: 'C', outputs: [], mount: { to: { module: 'B', output: 'o' }, ref: { x: 0, y: 0, a: 0 }, home: { '1': 20, '2': 30 } } }
  ];
  check('homePoseFor：沿安裝鏈合併，自己的 home 覆蓋祖先', same(homePoseFor(chain, 'C'), { '1': 20, '5': 50, '2': 30 }));

  check('homeAdjustment：已在組裝姿態 → null', homeAdjustment(f.modules, 'Grip1', { activeMotor: '1', theta: 360, motorAngles: { '2': 45 } }) === null);
  const adj = homeAdjustment(f.modules, 'Grip1', { activeMotor: '1', theta: 60, motorAngles: { '2': 45 } });
  check('homeAdjustment：控制中馬達不在 home → 回傳新的 theta，其他馬達角不動', adj && adj.theta === 0 && same(adj.motorAngles, { '2': 45 }));
  const adj2 = homeAdjustment(f.modules, 'Grip1', { activeMotor: '2', theta: 45, motorAngles: { '1': 60 } });
  check('homeAdjustment：凍結中的馬達不在 home → 改 motorAngles，theta 不動', adj2 && adj2.theta === 45 && same(adj2.motorAngles, { '1': 0 }));
  check('homeAdjustment：不改動傳入的 motorAngles', (() => { const m = { '1': 60 }; homeAdjustment(f.modules, 'Grip1', { activeMotor: '2', theta: 0, motorAngles: m }); return m['1'] === 60; })());
  check('homeAdjustment：跨 0°／360° 邊界視為同角', homeAdjustment(f.modules, 'Grip1', { activeMotor: '1', theta: 359.99999999, motorAngles: {} }) === null
    && homeAdjustment(f.modules, 'Grip1', { activeMotor: '1', theta: -0.00000001, motorAngles: {} }) === null);
  check('homeAdjustment：凍結角缺席視為 0', homeAdjustment(f.modules, 'Grip1', { activeMotor: '2', theta: 0, motorAngles: {} }) === null);
  check('homeAdjustment：未安裝模組 → null', homeAdjustment(f.modules, 'Lift1', { activeMotor: '1', theta: 60, motorAngles: {} }) === null);
}

// ---------- worldFrameComps / mountedBaseIds / moduleOfPoint ----------
{
  const f = clone(fixture);
  const root = { type: 'anchor', id: 'RootAnchor', p1: { id: 'R0', type: 'fixed', x: -200, y: 0 } };
  const comps = [...f.comps, root];
  const world = worldFrameComps(comps, f.modules);
  check('worldFrameComps：保留根與未安裝模組，排除已安裝模組', world.includes(root) && world.some(c => c.moduleId === 'Lift1') && !world.some(c => c.moduleId === 'Grip1'));
  check('worldFrameComps：沒有模組時原樣回傳全部', worldFrameComps(comps, []).length === comps.length);
  check('worldFrameComps：moduleId 指向不存在的模組視為根', worldFrameComps([{ ...root, moduleId: 'Ghost' }], f.modules).length === 1);
  const ids = mountedBaseIds(comps, f.modules);
  check('mountedBaseIds：已安裝模組的 fixed／motor 點（GCA motor、GCB fixed）', ids instanceof Set && ids.has('GCA') && ids.has('GCB') && ids.size === 2);
  check('mountedBaseIds：不含未安裝模組與根的固定點', !ids.has('LPC') && !ids.has('R0'));
  check('moduleOfPoint：模組點、齒條孔、根點、不存在', moduleOfPoint(comps, 'GCA') === 'Grip1' && moduleOfPoint(comps, 'LiftOutput') === 'Lift1'
    && moduleOfPoint(comps, 'R0') === null && moduleOfPoint(comps, 'Nope') === null);
}

// ---------- motion.js 注入：沒有模組時與原本完全相同 ----------
{
  let bad = '';
  for (const ex of BLOCK_EXAMPLES) {
    const s = ex.snapshot;
    if (!s?.comps?.length) continue;
    const topo = { params: { ...s.params } };
    const compiled = compileTopology(clone(s.comps), topo, new Set());
    const asm = compileAssembly(clone(s.comps), [], { params: { ...s.params } });
    const solveFn = p => solveAssembly(asm, p);
    const a = planMotion(compiled, { params: compiled.params }, 0, {}, null);
    const b = planMotion(compiled, { params: compiled.params }, 0, {}, null, solveFn);
    if (!same(a, b)) bad ||= `${ex.id} planMotion`;
    const ids = (s.tracePoints || (s.tracePoint ? [s.tracePoint] : []));
    if (ids.length) {
      const sweepFn = (c, p, st, en, step) => sweepAssembly(asm, p, st, en, step);
      if (!same(traceSweeps(compiled, compiled.params, ids, 0, 360, 10), traceSweeps(compiled, compiled.params, ids, 0, 360, 10, sweepFn))) bad ||= `${ex.id} traceSweeps`;
    }
  }
  check('planMotion／traceSweeps：注入沒有模組的 assembly 時結果與預設完全相同', !bad, bad);
  check('planMotion：有傳 solveFn 時確實使用它', (() => {
    const s = BLOCK_EXAMPLES.find(e => e.id === 'fourbar-crank-rocker').snapshot;
    const compiled = compileTopology(clone(s.comps), { params: { ...s.params } }, new Set());
    let calls = 0;
    planMotion(compiled, { params: compiled.params }, 0, {}, null, p => { calls++; return solveTopology(compiled, p); });
    return calls > 0;
  })());
}

// ---------- motion.js 注入：組合作品（升降＋夾爪） ----------
{
  const f = clone(fixture);
  const all = compileTopology(f.comps, { params: { ...f.params } }, new Set());   // 繪製用的整體編譯（§4.2 雙軌）
  const asm = compileAssembly(f.comps, f.modules, { params: f.params });
  const sweepFn = (c, p, st, en, step) => sweepAssembly(asm, p, st, en, step);
  const params = { ...asm.params, motorAngles: { '2': 0 }, sweepMotor: '1' };
  const [lt] = traceSweeps(all, params, ['LT'], 0, 360, 10, sweepFn);
  const ys = lt.results.filter(r => r.isValid && r.B).map(r => r.B.y), xs = lt.results.filter(r => r.isValid && r.B).map(r => r.B.x);
  check('組合作品：掃 M1 時爪尖 LT 跟著升降（y 行程 ≈ 30·2π＝188.5，x 不動）',
    lt.results.every(r => r.isValid) && Math.abs((Math.max(...ys) - Math.min(...ys)) - 30 * 2 * Math.PI) < 0.5 && Math.max(...xs) - Math.min(...xs) < 1e-6,
    `${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} / ${(Math.max(...xs) - Math.min(...xs)).toExponential(1)}`);
  const plan = planMotion(all, { params: asm.params }, 0, {}, { active: '1', frozen: { '2': 0 } }, p => solveAssembly(asm, p));
  check('組合作品：planMotion 用組合求解時 M1（齒條）可整圈轉', plan.mode === 'rotate');
  const planDefault = planMotion(all, { params: asm.params }, 0, {}, { active: '1', frozen: { '2': 0 } });
  check('對照：不注入時整體編譯把夾爪當成固定在世界，爪尖不會跟著升降', (() => {
    const s = solveTopology(all, { thetaDeg: 0, motorAngles: { '1': 60, '2': 0 } });
    const t = solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': 60, '2': 0 } });
    return planDefault && Math.abs(s.points.LT.y - t.points.LT.y) > 10;
  })());
}

report('assembly-app');
