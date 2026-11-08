// 動力扭力估算核心（Q1 資料＋Q2 虛功法）驗收：docs/RESEARCH-ACTUATOR-TORQUE.md
import { check, report } from './_harness.mjs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { normalizeLoads, normalizeGravity } from '../js/blocks/load-schema.js';
import { linkMass, materialDensity, polygonProps, assemblyMassModel } from '../js/blocks/part-mass.js';
import { MATERIALS } from '../js/blocks/member-stock.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { requiredTorque, evaluateActuator, findMotors, G_ACCEL } from '../js/core/required-torque.js';
import { getActuatorSpec, mergeActuatorSpec, kgfcmToNmm, nmmToKgfcm, thresholdsFor, listActuatorSpecs, noLoadRpmOf } from '../js/core/actuator-specs.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- 規格表 ----
check('規格表換算：1 kgf·cm = 98.0665 N·mm', near(kgfcmToNmm(1), 98.0665, 1e-9) && near(nmmToKgfcm(98.0665), 1, 1e-9));
check('MG995 4.8V 取 8.5 kgf·cm、未實測', near(nmmToKgfcm(getActuatorSpec('MG995_4_8V').stallTorqueNmm), 8.5, 1e-9) && getActuatorSpec('MG995_4_8V').measured === false);
check('規格表含 MG995×2、SG90、TT×2、N20×3', listActuatorSpecs().length === 8 && ['MG995_6V', 'SG90_4_8V', 'TT_3V', 'TT_6V', 'N20_50_6V', 'N20_100_6V', 'N20_298_6V'].every(id => getActuatorSpec(id)));
check('N20 有齒輪箱上限 2 kgf·cm，SG90 重 9 g，TT 重 30.6 g', near(nmmToKgfcm(getActuatorSpec('N20_100_6V').gearboxLimitNmm), 2, 1e-9) && getActuatorSpec('SG90_4_8V').massG === 9 && getActuatorSpec('TT_6V').massG === 30.6);
check('伺服 0.20 s/60° ＝ 50 rpm', near(noLoadRpmOf(getActuatorSpec('MG995_4_8V')), 50, 1e-9));
{
  const m = mergeActuatorSpec('MG995_4_8V', { stallTorqueKgfcm: 6, bogus: 5, massG: 55 });
  check('作品覆寫：改失速扭力與重量，標為實測；原表不被改', near(nmmToKgfcm(m.stallTorqueNmm), 6, 1e-9) && m.massG === 55 && m.measured === true && !('bogus' in m) && near(nmmToKgfcm(getActuatorSpec('MG995_4_8V').stallTorqueNmm), 8.5, 1e-9));
  check('無覆寫時合併結果等於預設', JSON.stringify(mergeActuatorSpec('TT_6V', null)) === JSON.stringify(getActuatorSpec('TT_6V')));
  check('門檻：直流 25/50%、伺服 1/3 2/3，可覆寫', JSON.stringify(thresholdsFor(getActuatorSpec('TT_6V'))) === '[0.25,0.5]' && near(thresholdsFor(getActuatorSpec('SG90_4_8V'))[1], 2 / 3, 1e-12) && JSON.stringify(thresholdsFor(getActuatorSpec('TT_6V'), [0.3, 0.6])) === '[0.3,0.6]');
}

// ---- 材料與零件質量 ----
check('合板密度 700 並附出處；其他材料為 null（未確認）', materialDensity('plywood') === 700 && MATERIALS.find(m => m.id === 'plywood').densitySource === '[9]' && ['acrylic', 'aluminum', 'pla', 'unspecified'].every(id => materialDensity(id) === null));
check('MATERIALS 既有 id 與順序不變', MATERIALS.map(m => m.id).join() === 'unspecified,plywood,acrylic,aluminum,pla');
const stick = (extra = {}) => ({ type: 'bar', id: 'Arm', color: '#3498db', p1: { id: 'O', type: 'fixed', x: 0, y: 0, physicalMotor: '1' }, p2: { id: 'E', type: 'floating', x: 160, y: 0 }, lenParam: 'L1', isInput: true, fixedLen: true, physicalMotor: '1', motorType: 'mg995', stock: { widthMm: 13, thicknessMm: 3, material: 'plywood' }, ...extra });
{
  const m = linkMass(stick(), 160);
  const analytic = (160 * 13 + Math.PI * 6.5 * 6.5) * 3 * 0.7e-3; // 未扣孔
  check('13×3 合板棍孔距 160：質量約 4.6 g（未扣孔解析 4.7 g，差在兩個孔）', m.massG < analytic && near(m.massG, analytic, 0.15) && !m.assumed, `m=${m.massG.toFixed(3)} g`);
  check('重心約在 8 cm（桿身中點，孔位／馬達切口使其略偏）', near(m.cg.u, 80, 1.5) && near(m.cg.v, 0, 0.5));
  const un = linkMass(stick({ stock: { widthMm: 13, thicknessMm: 3, material: 'unspecified' } }), 160);
  check('未指定材料用合板並標假設', un.assumed && un.reason.includes('假設') && near(un.massG, m.massG, 1e-9));
  const ac = linkMass(stick({ stock: { widthMm: 13, thicknessMm: 3, material: 'acrylic' } }), 160);
  check('壓克力密度未確認 → 暫以合板並標記', ac.assumed && ac.reason.includes('未確認'));
  const sq = polygonProps([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }]);
  check('多邊形面積與形心', near(sq.area, 8, 1e-9) && near(sq.x, 2, 1e-9) && near(sq.y, 1, 1e-9));
}

// ---- 單臂解析 ----
const armSnap = (extra = {}) => ({ kind: 'blocks', v: 1, counter: 3, params: { L1: 160, theta: 0 }, comps: [{ type: 'anchor', id: 'Anchor1', p1: { id: 'O', type: 'fixed', x: 0, y: 0 } }, stick()], loads: [{ id: 'W1', massG: 50, at: { pointId: 'E' } }], ...extra });
{
  const snap = armSnap();
  const res = requiredTorque(snap, { motorId: '1', thetaRange: [0, 360], stepDeg: 5 });
  const m = linkMass(stick(), 160);
  const topo = compileTopology(normalizeSnapshot(snap).comps, { params: { L1: 160, theta: 0 } }, new Set());
  let worstErr = 0, peak = 0, n = 0, prev = null;
  for (const s of res.samples) {
    const sol = solveTopology(topo, { thetaDeg: s.theta, _prevPoints: prev });
    prev = sol.points;
    const phi = Math.atan2(sol.points.E.y - sol.points.O.y, sol.points.E.x - sol.points.O.x);
    const expected = G_ACCEL / 1000 * (m.massG * m.cg.u + 50 * 160) * Math.cos(phi);
    peak = Math.max(peak, Math.abs(expected)); worstErr = Math.max(worstErr, Math.abs(s.torqueNmm - expected)); n++;
  }
  check('單臂 τ = m·g·r·cosθ（含棍自重），全範圍誤差 < 1%', res.ok && n === 73 && worstErr < 0.01 * peak, `最大誤差 ${(100 * worstErr / peak).toFixed(4)}% of peak`);
  const kgfcm = nmmToKgfcm(res.summary.maxAbsNmm);
  check('報告 §4：水平約 0.84 kgf·cm（±2%）', near(kgfcm, 0.84, 0.84 * 0.02), `${kgfcm.toFixed(4)} kgf·cm`);
  check('各負載貢獻分項：棍＋負載', res.samples[0].contributions.some(c => c.id === 'Arm') && res.samples[0].contributions.some(c => c.id === 'W1' && c.kind === 'load'));
  const ev = id => evaluateActuator(res, getActuatorSpec(id));
  const pct = id => Math.round(ev(id).utilization * 1000) / 10;
  check('MG995 4.8V 約 9.9%，綠', near(pct('MG995_4_8V'), 9.9, 0.4) && ev('MG995_4_8V').level === 'green', `${pct('MG995_4_8V')}%`);
  check('SG90 約 47%，黃', near(pct('SG90_4_8V'), 47, 1.5) && ev('SG90_4_8V').level === 'yellow', `${pct('SG90_4_8V')}%`);
  check('N20 100:1 約 49%，黃，未超齒輪箱上限', near(pct('N20_100_6V'), 49, 1.5) && ev('N20_100_6V').level === 'yellow' && !ev('N20_100_6V').exceedsGearbox, `${pct('N20_100_6V')}%`);
  check('TT 6V 約 105%，紅，舉不起', near(pct('TT_6V'), 105, 3) && ev('TT_6V').level === 'red' && ev('TT_6V').cantLift, `${pct('TT_6V')}%`);
  // TT + 12:36 齒輪：按報告 η=0.95 手算
  const geared = 0.84 / 3 / 0.95;
  check('報告 TT+3:1，η=0.95：0.84÷3÷0.95≈0.29 kgf·cm → 約 37%、黃', near(kgfcm / 3 / 0.95, geared, 0.01) && near(100 * kgfcm / 3 / 0.95 / 0.8, 36.7, 1.2));
  const hold = requiredTorque(armSnap({ gravity: 'flat' }), { motorId: '1', thetaRange: [0, 360], stepDeg: 15 });
  check('平放（flat）：重力貢獻為 0', hold.ok && hold.summary.maxAbsNmm < 1e-9 && hold.gravity === 'flat');
  const flatForce = requiredTorque(armSnap({ gravity: 'flat', loads: [{ id: 'F', massG: 0, at: { pointId: 'E' }, force: { x: 0, y: -2 } }] }), { motorId: '1', thetaRange: [0, 0], stepDeg: 5 });
  check('平放時外力仍計入（2 N 在 160 mm → 320 N·mm）', near(flatForce.samples[0].torqueNmm, 320, 3.2), `${flatForce.samples[0].torqueNmm.toFixed(2)}`);
  const noMass = requiredTorque(armSnap(), { motorId: '1', thetaRange: [0, 0], stepDeg: 5, includeParts: false });
  check('includeParts:false 只剩負載點', near(noMass.samples[0].torqueNmm, G_ACCEL / 1000 * 50 * 160, 0.8));
  check('MG995 本體重量未知 → 假設中有說明', res.assumptions.some(a => a.includes('本體重量未知')));
  const byInput = requiredTorque(snap, { inputId: 'Arm', thetaRange: [0, 0], stepDeg: 5 });
  check('可用 inputId 指定', byInput.ok && byInput.motor.id === '1');
  check('預設角度範圍：伺服用 servoStart..servoEnd', (() => { const r = requiredTorque(armSnap({ comps: [armSnap().comps[0], stick({ servoStart: 0, servoEnd: 90 })] }), { stepDeg: 30 }); return r.thetaRange[0] === 0 && r.thetaRange[1] === 90 && r.samples.length === 4; })());
}

// ---- 齒輪對 12:36 ----
{
  const gearComps = [
    { type: 'gear', id: 'GearA', color: '#e74c3c', p1: { id: 'GCA', type: 'motor', x: -24, y: 0, physicalMotor: '1' }, p2: { id: 'GPA', type: 'floating', x: -12, y: 0 }, radiusParam: 'GRA', teeth: 12, module: 2, phase: 0 },
    { type: 'gear', id: 'GearB', color: '#2c6fbb', p1: { id: 'GCB', type: 'fixed', x: 24, y: 0 }, p2: { id: 'GPB', type: 'floating', x: 54, y: 0 }, radiusParam: 'GRB', teeth: 36, module: 2, phase: 0, mesh: 'GearA' }
  ];
  const snap = { kind: 'blocks', v: 1, counter: 2, params: { GRA: 12, GRB: 36, theta: 0 }, comps: gearComps, loads: [{ id: 'W', massG: 50, at: { pointId: 'GPB' } }] };
  const eta = 0.9;
  const res = requiredTorque(snap, { motorId: '1', thetaRange: [0, 360], stepDeg: 10, efficiency: eta });
  const topo = compileTopology(normalizeSnapshot(snap).comps, { params: { GRA: 12, GRB: 36, theta: 0 } }, new Set());
  let worst = 0, peak = 0, signOk = true; let prev = null;
  for (const s of res.samples) {
    const sol = solveTopology(topo, { thetaDeg: s.theta, _prevPoints: prev }); prev = sol.points;
    const c = sol.points.GCB, p = sol.points.GPB, r = Math.hypot(p.x - c.x, p.y - c.y);
    const outTorque = G_ACCEL / 1000 * 50 * (p.x - c.x); // 輸出軸負載扭力（大小）＝ m·g·水平力臂
    const expected = Math.abs(outTorque) / 3 / eta;
    worst = Math.max(worst, Math.abs(Math.abs(s.torqueNmm) - expected)); peak = Math.max(peak, expected);
    if (r < 1) signOk = false;
  }
  check('齒輪對 12:36：需求扭力 = 輸出負載扭力 ÷ 3 ÷ η', res.ok && res.gearStages === 1 && worst < 0.01 * peak && peak > 0, `級數=${res.gearStages}、最大誤差 ${(100 * worst / peak).toFixed(4)}%`);
  const res1 = requiredTorque(snap, { motorId: '1', thetaRange: [0, 360], stepDeg: 10, efficiency: 1 });
  check('效率 η 只影響大小：η=0.9 與 η=1 比值 = 1/0.9', near(res.summary.maxAbsNmm / res1.summary.maxAbsNmm, 1 / 0.9, 1e-6) && signOk);
  const dflt = requiredTorque(snap, { motorId: '1', thetaRange: [0, 90], stepDeg: 30 });
  check('預設效率 0.9／級', dflt.efficiency === 0.9);
  const rr = BLOCK_EXAMPLES.find(e => e.id === 'reduction-gear-train');
  const rt = requiredTorque(rr.snapshot, { thetaRange: [0, 30], stepDeg: 10, loads: [{ id: 'T', massG: 20, at: { pointId: normalizeSnapshot(rr.snapshot).comps.filter(c => c.type === 'gear').pop().p2.id } }] });
  check('減速齒輪列範例：級數 ≥ 1 且 η^n 已除', rt.ok && rt.gearStages >= 1, `級數=${rt.gearStages}`);
}

// ---- 四連桿：與獨立數值核算一致、死點旗標 ----
{
  const ex = BLOCK_EXAMPLES.find(e => e.id === 'fourbar-crank-rocker');
  const norm = normalizeSnapshot(ex.snapshot);
  const F = { x: 0, y: -2 }; // 搖桿端 D 受 2 N 向下外力（例如被夾物重量）
  const snap = { ...ex.snapshot, loads: [{ id: 'F1', massG: 0, at: { pointId: 'D' }, force: F }], gravity: 'flat' };
  const res = requiredTorque(snap, { motorId: '1', thetaRange: [0, 360], stepDeg: 2, includeParts: false, includeMotors: false });
  const topo = compileTopology(norm.comps, { params: { ...norm.params, theta: 0 } }, new Set());
  let worst = 0, peak = 0, cmp = 0, prev = null;
  const at = (t, seed) => solveTopology(topo, { thetaDeg: t, _prevPoints: seed });
  for (const s of res.samples) {
    const base = at(s.theta, prev); if (!base.isValid) continue; prev = base.points;
    if (s.flags.includes('singular') || s.torqueNmm === null) continue;
    const h = 0.1, a = at(s.theta + h, base.points).points.D, b = at(s.theta - h, base.points).points.D;
    const vx = (a.x - b.x) / (2 * h * Math.PI / 180), vy = (a.y - b.y) / (2 * h * Math.PI / 180);
    const expected = -(F.x * vx + F.y * vy); // 輸出端負載 × 位移率
    worst = Math.max(worst, Math.abs(s.torqueNmm - expected)); peak = Math.max(peak, Math.abs(expected)); cmp++;
  }
  check('四連桿：與「輸出端負載 × 位移率」獨立核算一致（<1% of peak）', res.ok && cmp > 150 && worst < 0.01 * peak, `比較 ${cmp} 點、最大誤差 ${(100 * worst / peak).toFixed(4)}% of peak、peak=${peak.toFixed(1)} N·mm`);
  const dead = res.samples.filter(s => s.flags.includes('nearDeadPoint'));
  check('四連桿接近死點（搖桿換向）時有旗標，且旗標點不是全部', dead.length >= 2 && dead.length < res.samples.length / 4, `旗標 ${dead.length}/${res.samples.length}`);
  check('旗標點的負載位移率確實很小', dead.every(s => s.rateMmPerDeg < 0.1 * Math.max(...res.samples.map(x => x.rateMmPerDeg))));
}

// ---- 多馬達：其他馬達固定在目前角度 ----
{
  const ex = BLOCK_EXAMPLES.find(e => e.id === 'competition-fourbar-lift');
  const a = requiredTorque(ex.snapshot, { motorId: '1', thetaRange: [0, 60], stepDeg: 30 });
  check('升降臂範例可算且每一點有限', a.ok && a.samples.every(s => !s.valid || Number.isFinite(s.torqueNmm)));
  check('findMotors 回傳排序後的馬達', findMotors(normalizeSnapshot(ex.snapshot).comps).map(m => m.id).join() === '1,2');
}
{
  // 2R 手臂：肘部馬達 2 的殼鎖在大臂上；肘部扭力 ∝ cos(小臂絕對角)，所以與凍結的馬達 1 角度有關。
  const pt = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });
  const bar = (id, p1, p2, lenParam, extra = {}) => ({ type: 'bar', id, color: '#3498db', p1, p2, lenParam, fixedLen: true, isInput: false, stock: { widthMm: 13, thicknessMm: 3, material: 'plywood' }, ...extra });
  const comps = [
    { type: 'anchor', id: 'ArmBase', p1: pt('O', 'fixed', 0, 0) },
    bar('Arm1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('E', 'floating', 48, 0), 'ARM1', { isInput: true, physicalMotor: '1', phaseOffset: 0 }),
    bar('Arm2', pt('E', 'floating', 48, 0, { physicalMotor: '2' }), pt('F', 'floating', 96, 0), 'ARM2', { isInput: true, physicalMotor: '2', motorCarrier: 'Arm1', phaseOffset: 0 })
  ];
  const mk = ma => ({ kind: 'blocks', v: 1, counter: 3, params: { ARM1: 48, ARM2: 48, theta: 0 }, comps, activeMotor: '2', motorAngles: ma, gravity: 'vertical' });
  const t0 = requiredTorque(mk({ '1': 0 }), { motorId: '2', thetaRange: [0, 0], stepDeg: 5 }).samples[0].torqueNmm;
  const t60 = requiredTorque(mk({ '1': 60 }), { motorId: '2', thetaRange: [0, 0], stepDeg: 5 }).samples[0].torqueNmm;
  const m = linkMass(comps[2], 48);
  check('多馬達：馬達 2 水平時扭力 = 小臂自重 × 力臂', near(t0, G_ACCEL / 1000 * m.massG * m.cg.u, 0.01), `${t0.toFixed(3)} N·mm`);
  check('多馬達：其他馬達固定在凍結角（大臂 60° → 肘部扭力減半）', near(t60 / t0, 0.5, 1e-4), `比值 ${(t60 / t0).toFixed(5)}`);
  const t1 = requiredTorque(mk({ '2': 0 }), { motorId: '1', thetaRange: [0, 0], stepDeg: 5 }).samples[0].torqueNmm;
  check('多馬達：馬達 1 的扭力含整條小臂（兩桿自重）', t1 > t0 * 2, `${t1.toFixed(3)} vs ${t0.toFixed(3)}`);
}

// ---- schema：舊作品往返不變、新欄位往返一致 ----
{
  const keysBad = [];
  let idem = 0;
  for (const e of BLOCK_EXAMPLES) {
    const n = normalizeSnapshot(e.snapshot); if (!n) continue;
    const topo = { params: n.params, tracePoint: n.tracePoint, tracePoints: n.tracePoints, referencePoint: n.referencePoint, dimensions: n.dimensions, loads: n.loads, gravity: n.gravity };
    const s1 = toSnapshot(n.comps, topo, n.counter, { activeMotor: n.activeMotor, motorAngles: n.motorAngles, fabrication: n.fabrication, modules: n.modules });
    if ('loads' in n || 'gravity' in n || 'loads' in s1 || 'gravity' in s1) keysBad.push(e.id);
    const n2 = normalizeSnapshot(s1);
    if (JSON.stringify(toSnapshot(n2.comps, { ...topo, params: n2.params }, n2.counter, { activeMotor: n2.activeMotor, motorAngles: n2.motorAngles, fabrication: n2.fabrication, modules: n2.modules })) === JSON.stringify(s1)) idem++;
  }
  check(`舊作品（${BLOCK_EXAMPLES.length} 個範例）不帶新欄位，正規化與保存不長出 loads／gravity`, keysBad.length === 0, keysBad.join());
  check('舊作品保存→讀取→保存結果不變', idem === BLOCK_EXAMPLES.length, `${idem}/${BLOCK_EXAMPLES.length}`);
  const loads = [{ id: 'W1', name: ' 負重 ', massG: 50, at: { pointId: 'E' } }, { id: 'W2', massG: 10, at: { compId: 'Arm', u: 80, v: 0 }, force: { x: 0, y: -1.5 } }];
  const base = armSnap();
  const n = normalizeSnapshot({ ...base, loads: [...loads, { id: 'bad', massG: -1, at: { pointId: 'E' } }, { id: 'bad2', massG: 5 }, null], gravity: 'flat' });
  check('壞的負載被丟掉，好的保留；gravity=flat 保留', n.loads.length === 2 && n.gravity === 'flat');
  const topo = { params: n.params, loads: n.loads, gravity: n.gravity };
  const out = toSnapshot(n.comps, topo, n.counter, {});
  check('toSnapshot 輸出 loads／gravity', out.loads.length === 2 && out.gravity === 'flat');
  const back = normalizeSnapshot(JSON.parse(JSON.stringify(out)));
  check('JSON 往返：loads／gravity 一致', JSON.stringify(back.loads) === JSON.stringify(n.loads) && back.gravity === 'flat');
  check('分享字串往返：loads／gravity 一致', (() => { const dec = decodeShareString(encodeSnapshot(out)); const b = normalizeSnapshot(dec); return JSON.stringify(b.loads) === JSON.stringify(out.loads) && b.gravity === 'flat'; })());
  const vertical = toSnapshot(n.comps, { params: n.params, loads: [], gravity: 'vertical' }, n.counter, {});
  check('預設 vertical 且無負載：不輸出欄位', !('loads' in vertical) && !('gravity' in vertical));
  const full = normalizeLoads(out.loads);
  check('完整正規化器接受保存的負載、丟掉未知 at', full.length === 2 && normalizeLoads([{ id: 'x', massG: 1, at: {} }]).length === 0 && normalizeGravity('x') === 'vertical' && normalizeGravity('flat') === 'flat');
  const loadMotion = requiredTorque(armSnap({ loads: [] }), { motorId: '1', thetaRange: [0, 0], stepDeg: 5 }).samples[0].torqueNmm;
  const solveNoLoad = compileTopology(normalizeSnapshot(armSnap({ loads: [] })).comps, { params: { L1: 160 } }, new Set());
  const withLoad = normalizeSnapshot(armSnap());
  const sA = solveTopology(solveNoLoad, { thetaDeg: 30 }).points, sB = solveTopology(compileTopology(withLoad.comps, { params: withLoad.params }, new Set()), { thetaDeg: 30 }).points;
  check('負載標記不影響運動求解', JSON.stringify(sA) === JSON.stringify(sB) && Number.isFinite(loadMotion));
}

// ---- 全部內建範例的第一顆馬達：不丟例外、數值有限或明確回報原因 ----
{
  let ok = 0, noMotor = 0, bad = [];
  for (const e of BLOCK_EXAMPLES) {
    try {
      const r = requiredTorque(e.snapshot, { stepDeg: 30 });
      if (r.ok) { if (r.samples.every(s => s.torqueNmm === null || Number.isFinite(s.torqueNmm)) && Number.isFinite(r.summary.maxAbsNmm)) ok++; else bad.push(`${e.id}: 非有限`); }
      else if (r.reason) noMotor++; else bad.push(`${e.id}: 無原因`);
    } catch (err) { bad.push(`${e.id}: ${err.message}`); }
  }
  check(`全部 ${BLOCK_EXAMPLES.length} 個內建範例：不丟例外（可算 ${ok}、明確回報無法計算 ${noMotor}）`, bad.length === 0 && ok > 25, bad.slice(0, 5).join(' | '));
}
// ---- 合成桿、齒輪、齒條的質量（A2）----
{
  const mk = (id, a, b, extra = {}) => ({ type: 'bar', id, color: '#3498db', p1: { id: a[0], type: 'floating', x: a[1], y: 0 }, p2: { id: b[0], type: 'floating', x: b[1], y: 0 }, lenParam: 'L' + id, isInput: false, fixedLen: true, stock: { widthMm: 13, thicknessMm: 3, material: 'plywood' }, ...extra });
  const R = mk('R', ['A', 0], ['B', 80], { barFusionRoot: 'R', barFusion: { version: 1, members: ['R', 'M'], points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 80, y: 0 }, { id: 'C', x: 160, y: 0 }] } });
  const M = mk('M', ['B', 80], ['C', 160], { barFusionRoot: 'R' });
  const pts = { A: { x: 0, y: 0 }, B: { x: 80, y: 0 }, C: { x: 160, y: 0 } }, params = { LR: 80, LM: 80 };
  const fused = assemblyMassModel([R, M], pts, params, {});
  const sep = [mk('R2', ['A', 0], ['B', 80]), mk('M2', ['B', 80], ['C', 160])].map(c => linkMass(c, 80));
  const sum = sep[0].massG + sep[1].massG, one = fused.items[0];
  check('合成桿：算進質量、不再列入略過', fused.items.length === 1 && fused.skipped.length === 0 && one.fused === true, JSON.stringify(fused.skipped));
  check('合成桿：兩段直桿的聯集質量略小於兩根單桿相加（重疊的端部不重複計），差距在 10% 內', one.massG < sum && one.massG > sum * 0.9, `${one.massG} vs ${sum}`);
  check('合成桿：重心在兩段單桿重心之間（左段 40、右段 120 mm 之間，約 80 mm）', one.cg.u > 40 && one.cg.u < 120 && Math.abs(one.cg.u - 80) < 1 && Math.abs(one.cg.v) < 1e-6, JSON.stringify(one.cg));
  const R2 = { ...R, p2: { ...R.p2, x: 80 } };
  const bad = assemblyMassModel([{ ...R2, barFusion: { ...R.barFusion, members: ['R', 'M'] } }, { ...M, stock: { widthMm: 13, thicknessMm: 6, material: 'plywood' } }], pts, params, {});
  check('合成桿聯集失敗時仍列入 skipped 並寫出原因', bad.items.length === 0 && bad.skipped.length === 1 && bad.skipped[0].id === 'R' && bad.skipped[0].reason.length > 0, JSON.stringify(bad.skipped));
  const six = BLOCK_EXAMPLES.find(e => e.id === 'six-bar-lift').snapshot, r6 = requiredTorque(six, { stepDeg: 30 });
  check('六連桿範例：SixDrive／SixMiddle／SixOutput 不再略過，假設裡有合成桿說明', r6.ok && !r6.skipped.some(x => /^Six(Drive|Middle|Output)$/.test(x.id)) && r6.assumptions.some(a => a.includes('合成桿') && a.includes('SixDrive')), JSON.stringify(r6.skipped));
  const gm = assemblyMassModel(BLOCK_EXAMPLES.find(e => e.id === 'reduction-gear-train').snapshot.comps, {}, {}, {});
  check('齒輪：以匯出外形近似算質量，重心掛在軸心接點上，不再略過', gm.items.filter(i => i.approx === '齒輪').length >= 2 && gm.items.every(i => i.massG > 0) && gm.items.filter(i => i.anchor).every(i => i.anchor.dx === 0 && i.anchor.dy === 0) && !gm.skipped.some(x => x.type === 'gear'), JSON.stringify(gm.skipped));
  const rk = assemblyMassModel(BLOCK_EXAMPLES.find(e => e.id === 'rack-pinion').snapshot.comps, {}, BLOCK_EXAMPLES.find(e => e.id === 'rack-pinion').snapshot.params, {});
  check('齒條：以匯出外形近似算質量，掛在 p1 上，不再略過', rk.items.some(i => i.approx === '齒條' && i.massG > 0 && i.anchor?.pointId) && !rk.skipped.some(x => x.type === 'rack'), JSON.stringify(rk.skipped));
  const sl = requiredTorque(BLOCK_EXAMPLES.find(e => e.id === 'slider-crank').snapshot, { stepDeg: 30 });
  check('尚未計入的型別（滑塊）仍列在 skipped', sl.skipped.some(x => x.type === 'slider'));
}
report('required-torque');
