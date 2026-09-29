// M1a 組合求解（SDD-ASSEMBLY-MODULES §4.1、E-M1／E-M2／E-M3／E-M5／E-M7）。
import { readFileSync } from 'node:fs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology, sweepTopology } from '../js/multilink/solver.js';
import { compileAssembly, solveAssembly, sweepAssembly, outputPose, rebakeModules, canMergePoints } from '../js/blocks/assembly.js';
import { check, report } from './_harness.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const samePt = (p, q, tol = 1e-6) => p && q && dist(p, q) < tol;
const deg = r => r * 180 / Math.PI;
const ang = (p, q) => deg(Math.atan2(q.y - p.y, q.x - p.x));
const angDiff = (a, b) => { let d = ((a - b) % 360 + 540) % 360 - 180; return d; };
const fixture = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url), 'utf8'));
const solveAt = (asm, m1, m2) => solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': m1, '2': m2 } });

// ---------- E-M1 升降＋夾爪 ----------
{
  const f = clone(fixture);
  const asm = compileAssembly(f.comps, f.modules, { params: f.params });
  check('E-M1 compile：兩個模組、沒有根零件時 units 只含模組（或根為空）', Array.isArray(asm.units) && asm.units.filter(u => u.comps.length).length === 2);
  check('E-M1 compile：宿主排在前面', asm.units.findIndex(u => u.id === 'Lift1') < asm.units.findIndex(u => u.id === 'Grip1'));
  const tipAt = {};
  let ok = true, why = '';
  for (const m1 of [-40, 0, 60]) for (const m2 of [0, 30]) {
    const s = solveAt(asm, m1, m2);
    if (!s.isValid) { ok = false; why ||= `M1=${m1} M2=${m2} 無效`; continue; }
    if (!samePt(s.points.GCA, s.points.LiftOutput)) { ok = false; why ||= `M1=${m1} M2=${m2} GCA 未貼在 LiftOutput`; }
    if (!near(dist(s.points.GCA, s.points.GCB), 60)) { ok = false; why ||= `M1=${m1} M2=${m2} 中心距 ${dist(s.points.GCA, s.points.GCB)}`; }
    const tip = dist(s.points.LT, s.points.RT);
    if (tipAt[m2] === undefined) tipAt[m2] = tip; else if (!near(tip, tipAt[m2])) { ok = false; why ||= `M2=${m2} 爪尖距隨 M1 改變`; }
    if (s.perModule?.Lift1?.reason !== 'ok' || s.perModule?.Grip1?.reason !== 'ok') { ok = false; why ||= 'perModule 未標 ok'; }
  }
  check('E-M1：各姿態有效、夾爪貼滑台、中心距 60、爪尖距只隨 M2', ok, why);
  check('E-M1：M2 改變爪尖距', !near(tipAt[0], tipAt[30], 1));
  const a = solveAt(asm, 60, 0), b = solveAt(asm, 60, 30);
  check('E-M1：M2 不影響 LiftOutput', samePt(a.points.LiftOutput, b.points.LiftOutput));
  check('E-M1：M1=60 時 LiftOutput 升到 y≈119.416（88＋30·π/3）', near(a.points.LiftOutput.y, 88 + 30 * Math.PI / 3, 1e-6) && near(a.points.LiftOutput.x, 45, 1e-6));
  check('E-M1：outputPose 取 at 位置與齒條方向', (() => {
    const p = outputPose(f.modules[0], 'carriage', a.points, f.comps);
    return p && samePt(p, a.points.LiftOutput) && near(p.a, 90, 1e-9);
  })());
  check('E-M1：B＝tracePoint 的點', (() => {
    const asmT = compileAssembly(f.comps, f.modules, { params: f.params, tracePoint: 'LT' });
    const s = solveAt(asmT, 0, 0);
    return samePt(s.B, s.points.LT);
  })());
  check('E-M1：_prevPoints 以世界座標傳入時仍選同一分支', (() => {
    const s0 = solveAt(asm, 60, 30);
    const s1 = solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': 62, '2': 31 }, _prevPoints: s0.points });
    return s1.isValid && dist(s1.points.LT, s0.points.LT) < 5 && dist(s1.points.RT, s0.points.RT) < 5;
  })());
  check('E-M1：不改動輸入 comps／modules', JSON.stringify(f) === JSON.stringify(fixture));
}

// ---------- E-M2 旋轉宿主：夾爪裝在 1 號馬達帶動的臂端 ----------
function armFixture(phaseOffset = 0) {
  const grip = clone(BLOCK_EXAMPLES.find(e => e.id === 'gear-gripper').snapshot);
  const params = { ...grip.params, ARM: 120 };
  delete params.gripperWorkflow; delete params.gripperObjectWidth; delete params.gripperClearance;
  const comps = [
    { type: 'anchor', id: 'Base', moduleId: 'Arm1', p1: { id: 'O', type: 'fixed', x: 0, y: 0 } },
    { type: 'bar', id: 'Arm', moduleId: 'Arm1', p1: { id: 'O', type: 'fixed', x: 0, y: 0, physicalMotor: '1' },
      p2: { id: 'A', type: 'floating', x: 120, y: 0 }, lenParam: 'ARM', isInput: true, physicalMotor: '1', phaseOffset }
  ];
  grip.comps.forEach(c => {
    c.moduleId = 'Grip1';
    ['p1', 'p2', 'p3'].forEach(k => { if (!c[k]) return; c[k].x += 150; if (c[k].physicalMotor) c[k].physicalMotor = '2'; });
    comps.push(c);
  });
  return {
    comps, params,
    modules: [
      { id: 'Arm1', name: '旋轉臂', base: 'O', outputs: [{ id: 'tip', name: '臂端', at: 'A', body: { kind: 'bar', id: 'Arm' } }], mount: null },
      { id: 'Grip1', name: '齒輪夾爪', base: 'GCA', outputs: [], mount: { to: { module: 'Arm1', output: 'tip' }, ref: { x: 120, y: 0, a: 0 }, home: { '1': 0 } } }
    ]
  };
}
{
  const f = armFixture(0);
  const asm = compileAssembly(f.comps, f.modules, { params: f.params });
  const home = solveAt(asm, 0, 20);
  const relPin0 = angDiff(ang(home.points.GCA, home.points.GPA), ang(home.points.O, home.points.A));
  let ok = true, why = '';
  for (const th of [0, 45, 90]) {
    const s = solveAt(asm, th, 20);
    const armAng = ang(s.points.O, s.points.A);
    if (!s.isValid) { ok = false; why ||= `${th}° 無效`; continue; }
    if (!samePt(s.points.GCA, s.points.A)) { ok = false; why ||= `${th}° GCA 未在臂端`; }
    if (!near(dist(s.points.GCA, s.points.GCB), 60)) { ok = false; why ||= `${th}° 中心距`; }
    if (!near(angDiff(ang(s.points.GCA, s.points.GCB), armAng), 0, 1e-7)) { ok = false; why ||= `${th}° 底座未跟著臂轉`; }
    if (!near(angDiff(ang(s.points.GCA, s.points.GPA), armAng), relPin0, 1e-7)) { ok = false; why ||= `${th}° 齒輪銷相對角改變`; }
  }
  check('E-M2：臂轉 0／45／90° 時夾爪整組跟轉、中心距 60、齒輪銷相對底座角不變', ok, why);
}

// ---------- E-M3 零回歸：沒有模組時與 solveTopology／sweepTopology 完全相同 ----------
{
  let bad = '';
  let n = 0;
  for (const ex of BLOCK_EXAMPLES) {
    const s = ex.snapshot;
    if (!s?.comps?.length) continue;
    const motors = new Set();
    JSON.stringify(s.comps, (k, v) => { if (k === 'physicalMotor') motors.add(String(v)); return v; });
    for (const mods of [undefined, []]) {
      const asm = compileAssembly(clone(s.comps), mods, { params: { ...s.params } });
      const ref = compileTopology(clone(s.comps), { params: { ...s.params } }, new Set());
      for (const th of [0, 90, 180, 270]) {
        const params = motors.size > 1
          ? { thetaDeg: th, motorAngles: Object.fromEntries([...motors].map(m => [m, m === '1' ? th : 0])) }
          : { thetaDeg: th };
        const a = solveAssembly(asm, params), b = solveTopology(ref, params);
        if (JSON.stringify(a) !== JSON.stringify(b)) { bad ||= `${ex.id} solve @${th}`; }
        n++;
      }
      const sp = motors.size > 1 ? { motorAngles: { '1': 0, '2': 0 }, sweepMotor: '1' } : {};
      const sa = sweepAssembly(asm, { ...ref.params, ...sp }, 0, 360, 30), sb = sweepTopology(ref, { ...ref.params, ...sp }, 0, 360, 30);
      if (JSON.stringify(sa) !== JSON.stringify(sb)) bad ||= `${ex.id} sweep`;
    }
  }
  check('E-M3：所有範例（modules 為 undefined 或 []）solve／sweep 與原本逐位元組相同', !bad && n > 100, bad || `比對 ${n} 次`);
}

// ---------- E-M5 rebake 與 I1 ----------
const moduleIds = (comps, m) => comps.filter(c => c.moduleId === m);
const pointMap = comps => { const m = {}; comps.forEach(c => ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => { if (c[k]?.id) m[c[k].id] = c[k]; })); return m; };
{
  // (a) 沒變：原 fixture rebake 不改任何東西
  const f = clone(fixture);
  const r = rebakeModules(f.comps, f.modules, f.params);
  check('E-M5a：宿主未改時 changed=false，內容與輸入相同', r.changed === false && JSON.stringify(r.comps) === JSON.stringify(f.comps) && JSON.stringify(r.modules) === JSON.stringify(f.modules));
  check('E-M5a：不改動輸入', JSON.stringify(f) === JSON.stringify(fixture));
}
{
  // (b) 齒條加長 176→200：LiftOutput home 由 y=88 移到 y=100，夾爪整組 +12
  const f = clone(fixture);
  const params = { ...f.params, LRL: 200 };
  const r = rebakeModules(f.comps, f.modules, params);
  const before = pointMap(moduleIds(f.comps, 'Grip1')), after = pointMap(moduleIds(r.comps, 'Grip1'));
  check('E-M5b：changed=true', r.changed === true);
  check('E-M5b：夾爪每個點 +12 y、x 不變', Object.keys(before).every(id => near(after[id].x, before[id].x, 1e-9) && near(after[id].y, before[id].y + 12, 1e-9)));
  check('E-M5b：升降零件不動', JSON.stringify(moduleIds(r.comps, 'Lift1')) === JSON.stringify(moduleIds(f.comps, 'Lift1')));
  check('E-M5b：mount.ref 更新為 (45, 100, 90)', (() => { const ref = r.modules.find(m => m.id === 'Grip1').mount.ref; return near(ref.x, 45) && near(ref.y, 100) && near(ref.a, 90); })());
  check('E-M5b：齒輪 phase 不變（沒有旋轉）', moduleIds(r.comps, 'Grip1').filter(c => c.type === 'gear').every(c => c.phase === 90));
  const asm = compileAssembly(r.comps, r.modules, { params });
  const s = solveAt(asm, 0, 0);
  check('E-M5b I1：home 姿態下齒輪中心與銷的解＝存檔座標', ['GCA', 'GCB', 'GPA', 'GPB'].every(id => samePt(s.points[id], after[id])));
  check('E-M5b I1：爪尖誤差與 rebake 前相同（範例資料原有 0.1087 mm 取整）', ['LT', 'RT'].every(id => near(dist(s.points[id], after[id]), 0.1087, 1e-3)));
  check('E-M5b：再 rebake 一次 changed=false（冪等）', rebakeModules(r.comps, r.modules, params).changed === false);
}
{
  // (c) 旋轉：臂的 phaseOffset 0→30，home 時臂端在 (103.923, 60)、方向 30°
  const f0 = armFixture(0);
  const f = armFixture(30);
  f.modules = clone(f0.modules);           // ref 仍是 phaseOffset=0 時記下的 (120, 0, 0°)
  const r = rebakeModules(f.comps, f.modules, f.params);
  const after = pointMap(moduleIds(r.comps, 'Grip1'));
  const A = { x: 120 * Math.cos(Math.PI / 6), y: 120 * Math.sin(Math.PI / 6) };
  check('E-M5c：changed=true、ref 更新為臂端 30°', r.changed && (() => { const ref = r.modules.find(m => m.id === 'Grip1').mount.ref; return near(ref.x, A.x) && near(ref.y, A.y) && near(ref.a, 30); })());
  check('E-M5c：GCA 搬到臂端、GCB 在 30° 方向 60 mm', samePt(after.GCA, A) && samePt(after.GCB, { x: A.x + 60 * Math.cos(Math.PI / 6), y: A.y + 60 * Math.sin(Math.PI / 6) }));
  check('E-M5c：齒輪 phase 各 +30（90→120）', moduleIds(r.comps, 'Grip1').filter(c => c.type === 'gear').every(c => near(c.phase, 120, 1e-9)));
  check('E-M5c：三角板局部造形頂點 u,v 不動', JSON.stringify(moduleIds(r.comps, 'Grip1').filter(c => c.type === 'triangle').map(c => c.vertices))
    === JSON.stringify(moduleIds(f.comps, 'Grip1').filter(c => c.type === 'triangle').map(c => c.vertices)));
  const asm = compileAssembly(r.comps, r.modules, { params: f.params });
  const s = solveAt(asm, 0, 0);
  check('E-M5c I1：home 姿態下齒輪中心與銷的解＝存檔座標', ['GCA', 'GCB', 'GPA', 'GPB'].every(id => samePt(s.points[id], after[id])),
    ['GCA', 'GCB', 'GPA', 'GPB'].map(id => s.points[id] && after[id] ? dist(s.points[id], after[id]).toExponential(2) : 'x').join(','));
  const s45 = solveAt(asm, 45, 20);
  check('E-M5c：rebake 後臂轉 45° 夾爪仍貼臂端、中心距 60', s45.isValid && samePt(s45.points.GCA, s45.points.A) && near(dist(s45.points.GCA, s45.points.GCB), 60));
}
{
  // (d) 旋轉時其他世界方向角度欄位也要 +δ；有 motorCarrier 的 phaseOffset 與伺服角不動
  const comps = [
    { type: 'anchor', id: 'Base', moduleId: 'H', p1: { id: 'O', type: 'fixed', x: 0, y: 0 } },
    { type: 'bar', id: 'Arm', moduleId: 'H', p1: { id: 'O', type: 'fixed', x: 0, y: 0, physicalMotor: '1' }, p2: { id: 'A', type: 'floating', x: 100, y: 0 }, lenParam: 'ARM', isInput: true, physicalMotor: '1', phaseOffset: 90 },
    { type: 'rack', id: 'R', moduleId: 'M', p1: { id: 'RK', type: 'floating', x: 100, y: 0 }, lenParam: 'RL', axisDeg: 10 },
    { type: 'cam', id: 'C', moduleId: 'M', p1: { id: 'CC', type: 'fixed', x: 100, y: 0 }, p2: { id: 'CF', type: 'floating', x: 100, y: 30 }, baseRadiusParam: 'CB', liftParam: 'CL', axisDeg: 90, phase: 5 },
    { type: 'pulley', id: 'P', moduleId: 'M', p1: { id: 'PC', type: 'fixed', x: 110, y: 0 }, p2: { id: 'PP', type: 'floating', x: 120, y: 0 }, radiusParam: 'PR', phase: 15 },
    { type: 'bar', id: 'W', moduleId: 'M', p1: { id: 'WA', type: 'fixed', x: 100, y: 10, physicalMotor: '3' }, p2: { id: 'WB', type: 'floating', x: 130, y: 10 }, lenParam: 'WL', isInput: true, physicalMotor: '3', phaseOffset: 7, motorType: 'mg995', servoStart: 0, servoEnd: 90 },
    { type: 'bar', id: 'V', moduleId: 'M', p1: { id: 'WB', type: 'floating', x: 130, y: 10, physicalMotor: '4' }, p2: { id: 'VB', type: 'floating', x: 150, y: 10 }, lenParam: 'VL', isInput: true, physicalMotor: '4', phaseOffset: -20, motorCarrier: 'W' }
  ];
  const modules = [
    { id: 'H', name: 'H', base: 'O', outputs: [{ id: 'tip', name: 'tip', at: 'A', body: { kind: 'bar', id: 'Arm' } }], mount: null },
    { id: 'M', name: 'M', base: 'CC', outputs: [], mount: { to: { module: 'H', output: 'tip' }, ref: { x: 100, y: 0, a: 0 }, home: { '1': 0 } } }
  ];
  const r = rebakeModules(comps, modules, { ARM: 100, RL: 80, CB: 20, CL: 10, PR: 10, WL: 30, VL: 20 });
  const by = id => r.comps.find(c => c.id === id);
  check('E-M5d：齒條 axisDeg、凸輪 axisDeg、皮帶輪 phase、世界機架馬達 phaseOffset 各 +90',
    near(by('R').axisDeg, 100, 1e-9) && near(by('C').axisDeg, 180, 1e-9) && near(by('P').phase, 105, 1e-9) && near(by('W').phaseOffset, 97, 1e-9));
  check('E-M5d：凸輪 phase（凸輪自身相位）、有 motorCarrier 的 phaseOffset、伺服角不動',
    by('C').phase === 5 && by('V').phaseOffset === -20 && by('W').servoStart === 0 && by('W').servoEnd === 90);
  check('E-M5d：宿主模組 H 的零件不動', JSON.stringify(r.comps.filter(c => c.moduleId === 'H')) === JSON.stringify(comps.filter(c => c.moduleId === 'H')));
}

{
  // (e) ±180° 是同一方向：ref.a = -180、宿主實際 180 → 視為沒變
  const f = armFixture(180);
  f.modules[1].mount.ref = { x: -120, y: 120 * Math.sin(Math.PI), a: -180 };
  const r = rebakeModules(f.comps, f.modules, f.params);
  check('E-M5e：ref.a=-180 與宿主 180° 視為同向，changed=false', r.changed === false);
  // (f) 近 ±180 的小旋轉：ref.a = 179，宿主 -179（實際轉 +2°）→ 齒輪 phase 只 +2
  const g = armFixture(-179);
  g.modules[1].mount.ref = { x: 120 * Math.cos(179 * Math.PI / 180), y: 120 * Math.sin(179 * Math.PI / 180), a: 179 };
  const rg = rebakeModules(g.comps, g.modules, g.params);
  check('E-M5f：179°→-179° 當作 +2°，phase 90→92', rg.changed && moduleIds(rg.comps, 'Grip1').filter(c => c.type === 'gear').every(c => near(c.phase, 92, 1e-9)));
}

// ---------- E-M7 合併防呆 ----------
{
  const f = clone(fixture);
  const extra = [...f.comps, { type: 'bar', id: 'Free', p1: { id: 'X', type: 'floating', x: 0, y: 0 }, p2: { id: 'Y', type: 'floating', x: 9, y: 0 }, lenParam: 'FL' }];
  check('E-M7：不同模組 → false', canMergePoints(extra, 'LiftOutput', 'GCA') === false);
  check('E-M7：同模組 → true', canMergePoints(extra, 'GCA', 'GCB') === true && canMergePoints(extra, 'LPC', 'LiftRack') === true);
  check('E-M7：兩點都在根 → true', canMergePoints(extra, 'X', 'Y') === true);
  check('E-M7：根與模組 → false', canMergePoints(extra, 'X', 'GCA') === false);
  check('E-M7：找不到的點視為根', canMergePoints(extra, 'NOPE', 'X') === true && canMergePoints(extra, 'NOPE', 'GCA') === false);
}

report('assembly');
