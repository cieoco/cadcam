// 速度、行程時間與電流（Q4）與製作包「動力檢查」一節。介面見 test/browser/torque-panel.cjs。
import { check, report } from './_harness.mjs';
import { getActuatorSpec, mergeActuatorSpec, nmmToKgfcm } from '../js/core/actuator-specs.js';
import { speedAtTorque, currentAtTorque, strokeEstimate, outputRpm } from '../js/core/actuator-speed.js';
import { requiredTorque } from '../js/core/required-torque.js';
import { speedRows, powerAdvice } from '../js/blocks/torque-model.js';
import { powerCheckSection } from '../js/blocks/power-check.js';
import { getExample, getExampleLesson, loadUnitStarts, BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { evaluateActuator } from '../js/core/required-torque.js';
import { gridIssues } from '../js/blocks/grid-rule.js';
import { CATALOG_FAMILIES } from '../js/blocks/example-catalog.js';
import { offerExampleFromUrl } from '../js/blocks/example-entry.js';

const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const tt = getActuatorSpec('TT_6V'), ttI0 = mergeActuatorSpec(tt, { noLoadCurrentA: 0.2 }), mg = getActuatorSpec('MG995_4_8V');
const flat = (tau, [a, b] = [0, 360], step = 5) => ({ ok: true, thetaRange: [a, b], summary: { maxAbsNmm: Math.abs(tau), worstTheta: a }, samples: Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => ({ theta: a + i * step, torqueNmm: tau, flags: [] })) });

// ---- 直流：直線關係 ----
{
  const s0 = speedAtTorque(tt, 0), sS = speedAtTorque(tt, tt.stallTorqueNmm), sH = speedAtTorque(tt, tt.stallTorqueNmm / 2), sNeg = speedAtTorque(tt, -tt.stallTorqueNmm / 2);
  check('直流：τ=0 轉速 = 無負載轉速 200 rpm（1200°/s）', s0.ok && near(s0.rpm, 200) && near(s0.degPerS, 1200) && !s0.stalled);
  check('直流：τ=失速 轉速 0 且判定卡住', sS.rpm === 0 && sS.stalled);
  check('直流：τ=失速一半 轉速減半；負值取絕對值', near(sH.rpm, 100) && near(sNeg.rpm, 100));
  const i0 = currentAtTorque(ttI0, 0), iS = currentAtTorque(ttI0, tt.stallTorqueNmm), iH = currentAtTorque(ttI0, tt.stallTorqueNmm / 2), iOver = currentAtTorque(ttI0, tt.stallTorqueNmm * 3);
  check('直流：τ=0 電流 = 空載電流 I0；τ=失速 = 失速電流', near(i0.amps, 0.2) && near(iS.amps, 1.5));
  check('直流：電流與扭力成直線（一半 = (I0+Istall)/2），超過失速不再增加', near(iH.amps, 0.85) && near(iOver.amps, 1.5));
  const iu = currentAtTorque(tt, tt.stallTorqueNmm / 2);
  check('空載電流未知：不編數字（amps 為 null），只給下限與失速電流上限並寫出原因', iu.amps === null && near(iu.lowerA, 0.75) && near(iu.upperA, 1.5) && iu.reason.includes('未知'), JSON.stringify(iu));
  check('規格自帶的欄位目前沒有 I0（不虛構）', tt.noLoadCurrentA === null && getActuatorSpec('N20_100_6V').noLoadCurrentA === null);
  check('作品可用 noLoadCurrentA 覆寫（實測）', mergeActuatorSpec(tt, { noLoadCurrentA: 0.3 }).noLoadCurrentA === 0.3 && mergeActuatorSpec(tt, { noLoadCurrentA: 0.3 }).measured === true);
  check('缺欄位回傳 null＋原因，不丟錯', !speedAtTorque(null, 1).ok && !speedAtTorque({ ...tt, noLoadRpm: null, secPer60deg: null }, 1).ok && currentAtTorque(mg, 5).amps === null && currentAtTorque(mg, 5).reason.includes('沒有電流'));
}
// ---- 伺服 ----
{
  const s = speedAtTorque(mg, 300);
  check('伺服：速度取規格 0.20 s／60°（300°/s），標示負載會讓它更慢', s.ok && near(s.degPerS, 300) && s.loadSlows);
  check('伺服：τ ≥ 失速 → 卡住', speedAtTorque(mg, mg.stallTorqueNmm).stalled && speedAtTorque(mg, mg.stallTorqueNmm).degPerS === 0);
}
// ---- 行程時間 ----
{
  const half = flat(tt.stallTorqueNmm / 2), e = strokeEstimate(half, tt);
  check('定扭力：行程時間 = 行程 ÷ 當時轉速（360° ÷ 600°/s = 0.6 s）', e.ok && near(e.timeS, 0.6, 1e-9) && near(e.strokeDeg, 360) && !e.cantFinish, JSON.stringify(e));
  check('定扭力：無負載時間 0.3 s、慢 100%、最吃力處 100 rpm', near(e.noLoadTimeS, 0.3) && near(e.slowdown, 2) && near(e.peakRpm, 100));
  const unloaded = strokeEstimate(flat(0), tt);
  check('零扭力：時間 = 行程 ÷ ω0', near(unloaded.timeS, 0.3) && near(unloaded.slowdown, 1));
  const ramp = { ok: true, thetaRange: [0, 100], summary: { maxAbsNmm: tt.stallTorqueNmm / 2, worstTheta: 100 }, samples: Array.from({ length: 21 }, (_, i) => ({ theta: i * 5, torqueNmm: tt.stallTorqueNmm / 2 * i / 20, flags: [] })) };
  const er = strokeEstimate(ramp, tt);  // ∫ dθ/(ω0(1−0.5x)) 對 x∈[0,1]
  const analytic = (100 / 1200) * (Math.log(2) / 0.5);
  check('扭力線性上升：梯形積分接近解析解（誤差 < 1%）', near(er.timeS / analytic, 1, 0.01), `${er.timeS} vs ${analytic}`);
  const heavy = strokeEstimate(flat(tt.stallTorqueNmm * 1.05), tt), atStall = strokeEstimate(flat(tt.stallTorqueNmm), tt);
  check('需求 ≥ 失速扭力：標示無法完成行程、時間為 null', heavy.cantFinish && heavy.timeS === null && atStall.cantFinish && atStall.timeS === null);
  const gap = flat(tt.stallTorqueNmm / 2); gap.samples[10].torqueNmm = null; gap.samples[10].flags = ['singular'];
  const eg = strokeEstimate(gap, tt);
  check('個別角度無解：不補造整段時間，回報缺口數', !eg.ok && eg.timeS===null && eg.gapSamples===1);
  const sv = strokeEstimate(flat(300, [0, 90], 15), mg);
  check('伺服：時間 = 規格 × 角度 ÷ 60 = 0.20 × 90 ÷ 60 = 0.30 s，標示至少', near(sv.timeS, 0.3, 1e-9) && sv.loadSlows && sv.kind === 'servo');
  check('伺服：規格沒有電流 → current.amps 為 null（不虛構）', sv.current.amps === null && sv.current.lowerA === null);
  check('輸出轉速 = 馬達轉速 ÷ 總減速比', near(outputRpm(200, 3), 200 / 3) && outputRpm(200, 0) === null && outputRpm(null, 3) === null);
  check('結果無效時回傳 ok:false 與原因', !strokeEstimate({ ok: false, reason: '作品中沒有馬達' }, tt).ok && strokeEstimate({ ok: false, reason: '作品中沒有馬達' }, tt).reason === '作品中沒有馬達' && !strokeEstimate(half, null).ok);
}
// ---- 白話列與電源建議 ----
{
  const sv = strokeEstimate(flat(300, [0, 90], 15), mg), rows = speedRows(sv, mg);
  check('伺服列：寫「至少」與「有負載會更慢」；電流寫「未知（規格沒有電流資料）」', rows[0].text.includes('至少 0.30 秒') && rows[0].text.includes('更慢') && rows[1].text.includes('未知') && rows[1].text.includes('沒有電流資料'), JSON.stringify(rows));
  const dc = speedRows(strokeEstimate(flat(tt.stallTorqueNmm / 2), tt), tt);
  check('直流列：行程時間、慢多少、至少電流與失速電流', dc[0].text.includes('0.60 秒') && dc[0].text.includes('慢 100%') && dc[1].text.includes('至少約 0.75 A') && dc[1].text.includes('1.5 A'), JSON.stringify(dc));
  const dcI0 = speedRows(strokeEstimate(flat(tt.stallTorqueNmm / 2), ttI0), ttI0);
  check('有 I0 時直接寫峰值電流 0.85 A', dcI0[1].text.includes('約 0.85 A'), dcI0[1].text);
  const bad = speedRows(strokeEstimate(flat(tt.stallTorqueNmm * 1.2), tt), tt);
  check('已達失速電流時寫「已達失速電流」而非「至少」', speedRows(strokeEstimate(flat(tt.stallTorqueNmm * 0.99), tt), tt)[1].text.includes('已達失速電流') || speedRows(strokeEstimate(flat(tt.stallTorqueNmm * 0.99), tt), tt)[1].text.includes('至少約 1.49'));
  check('卡住：明說無法完成行程並標紅', bad[0].bad && bad[0].text.includes('無法完成行程'));
  const adv = powerAdvice(strokeEstimate(flat(tt.stallTorqueNmm / 2), tt), tt);
  check('電源建議：TT 6V → 4 顆 AA 標稱 6 V、失速電流 1.5 A、請實測；不保證撐得住', adv[0].includes('4 顆 AA') && adv[0].includes('6 V') && adv[1].includes('1.5 A') && adv[1].includes('實測') && !adv.join('').includes('可以放心'), adv.join(' | '));
  check('電源建議：伺服沒有電流資料時不編數字', powerAdvice(strokeEstimate(flat(300, [0, 90], 15), mg), mg)[1].includes('沒有電流資料'));
  check('電源建議：3 V 的 TT → 2 顆 AA', powerAdvice(null, getActuatorSpec('TT_3V'))[0].includes('2 顆 AA'));
}
// ---- 製作包「動力檢查」----
{
  const stick = { type: 'bar', id: 'Arm', color: '#3498db', p1: { id: 'O', type: 'fixed', x: 0, y: 0, physicalMotor: '1' }, p2: { id: 'E', type: 'floating', x: 160, y: 0 }, lenParam: 'L1', isInput: true, fixedLen: true, physicalMotor: '1', motorType: 'tt', stock: { widthMm: 13, thicknessMm: 3, material: 'plywood' } };
  const snap = { kind: 'blocks', v: 1, counter: 3, params: { L1: 160, theta: 0 }, comps: [{ type: 'anchor', id: 'Anchor1', p1: { id: 'O', type: 'fixed', x: 0, y: 0 } }, stick], loads: [{ id: 'W1', massG: 50, at: { pointId: 'E' } }] };
  const html = powerCheckSection(snap);
  check('動力檢查：有馬達時產生一節，含規格、最大需求、使用率與燈號、行程時間、峰值電流、假設', html.includes('<h2 id="powerCheck">動力檢查</h2>') && html.includes('TT 減速馬達 1:48 6 V') && html.includes('kgf·cm @') && html.includes('紅燈') && html.includes('無法完成行程') && html.includes('峰值電流') && html.includes('準靜態估算') && html.includes('<small>預設規格</small>'), html.slice(0, 600));
  const mgSnap = { ...snap, comps: [snap.comps[0], { ...stick, motorType: 'mg995' }] };
  const mgHtml = powerCheckSection(mgSnap, { specIds: { 1: 'MG995_6V' } });
  check('動力檢查：面板選過的規格優先（MG995 6 V），伺服時間寫「至少」', mgHtml.includes('MG995 伺服 6 V') && !mgHtml.includes('<small>預設規格</small>') && mgHtml.includes('至少') && mgHtml.includes('綠燈'));
  check('沒有馬達的作品不產生這一節', powerCheckSection({ ...snap, comps: [snap.comps[0]] }) === '' && powerCheckSection(null) === '');
  check('動力檢查標明靜態估算、重力方向與負載數', html.includes('直立') && html.includes('負載標記 1 個') && powerCheckSection({ ...snap, gravity: 'flat' }).includes('平放'));
}
// ---- 對照練習「TT 為什麼舉不起手臂？」（C2）----
{
  check('載入前不在啟動資料裡', !getExample('torque-arm-direct') && !getExample('torque-arm-geared'));
  const before = BLOCK_EXAMPLES.length;
  await loadUnitStarts(); await loadUnitStarts();
  check('按需載入後各出現一次，重複載入不重複登記', getExample('torque-arm-direct') && getExample('torque-arm-geared') && new Set(BLOCK_EXAMPLES.map(e => e.id)).size === BLOCK_EXAMPLES.length && BLOCK_EXAMPLES.filter(e => e.id.startsWith('torque-arm-')).length === 2 && BLOCK_EXAMPLES.length > before);
  const run = id => { const snap = normalizeSnapshot(structuredClone(getExample(id).snapshot)); return { snap, r: requiredTorque(snap, { motorId: '1' }) }; };
  const A = run('torque-arm-direct'), B = run('torque-arm-geared');
  check('兩個範例保留 50 g 末端負載，正規化後不遺失', A.snap.loads?.length === 1 && A.snap.loads[0].massG === 50 && B.snap.loads?.length === 1 && B.snap.loads[0].massG === 50 && B.snap.loads[0].at.pointId === 'ClawLiftTip');
  const util = (x, id) => evaluateActuator(x.r, getActuatorSpec(id));
  const uA = util(A, 'TT_6V'), uB = util(B, 'TT_6V'), uM = util(A, 'MG995_4_8V');
  check('A：TT 6 V 直接帶 ≈ 105% 紅燈、舉不起；MG995 4.8 V ≈ 10% 綠燈（與教材表格一致）', uA.level === 'red' && uA.cantLift && Math.round(uA.utilization * 100) === 105 && uM.level === 'green' && Math.round(uM.utilization * 100) === 10, `${uA.utilization} ${uM.utilization}`);
  check('B：TT＋3:1 齒輪 ≈ 39% 黃燈（1 級齒輪、效率 0.9），最大需求約 0.31 kgf·cm', uB.level === 'yellow' && Math.round(uB.utilization * 100) === 39 && B.r.gearStages === 1 && near(nmmToKgfcm(B.r.summary.maxAbsNmm), 0.31, 0.005), `${uB.utilization} ${B.r.gearStages}`);
  check('A 最大需求約 0.84 kgf·cm；B 是 A 的 1/(3×0.9) 附近（齒輪質量掛在固定軸上不增加扭力）', near(nmmToKgfcm(A.r.summary.maxAbsNmm), 0.84, 0.01) && near(B.r.summary.maxAbsNmm / A.r.summary.maxAbsNmm, 1 / 2.7, 0.01), `${B.r.summary.maxAbsNmm / A.r.summary.maxAbsNmm}`);
  check('B 的 TT 行程時間比無負載慢（速度換扭力）', strokeEstimate(B.r, getActuatorSpec('TT_6V')).slowdown > 1);
  check('兩個範例都在 8 mm 孔格上（沒有離格項目）', gridIssues(A.snap.comps, A.snap.params, { modules: [] }).length === 0 && gridIssues(B.snap.comps, B.snap.params, { modules: [] }).length === 0, JSON.stringify(gridIssues(A.snap.comps, A.snap.params, { modules: [] })));
  const lessons = ['torque-arm-direct', 'torque-arm-geared'].map(getExampleLesson);
  check('教學資料完整（用途、學到什麼、嘗試、預測、量測、說明），不是練習判定', lessons.every(l => l.use && l.learn && l.try.length >= 3 && l.predict && l.measure && l.explain && l.group === 'transmission' && l.level === '比較'));
  check('教材的數字與計算機一致：lesson 寫的約 105%／39%／10%', lessons[0].try.join('').includes('約 105%') && lessons[0].try.join('').includes('約 10%') && lessons[1].try.join('').includes('約 39%'));
  check('目錄有「手臂扭力」家族，兩個 ID 各一次', CATALOG_FAMILIES.find(f => f.id === 'torque-arm')?.variants.map(v => v.id).join() === 'torque-arm-direct,torque-arm-geared');
  class El { constructor(t) { this.tag = t; this.children = []; } setAttribute() {} append(...c) { this.children.push(...c); } addEventListener() {} showModal() { this.open = true; } close() {} remove() {} focus() {} }
  const doc = { body: new El('body'), createElement: t => new El(t) };
  await offerExampleFromUrl({ document: doc, location: { href: 'https://example.org/blocks.html?example=torque-arm-geared' }, history: { state: null, replaceState() {} }, loadExample: () => true, notify: () => {} });
  check('網址深連結 ?example=torque-arm-geared 可開啟', doc.body.children[0]?.open === true);
}
report('actuator-speed');
