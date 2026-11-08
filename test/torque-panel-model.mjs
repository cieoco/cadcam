// 扭力面板的純函式驗收（建議、曲線座標、負載編輯）。介面本身見 test/browser/torque-panel.cjs。
import { check, report } from './_harness.mjs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { requiredTorque, evaluateActuator, findMotors } from '../js/core/required-torque.js';
import { getActuatorSpec, listActuatorSpecs, kgfcmToNmm } from '../js/core/actuator-specs.js';
import { normalizeLoads } from '../js/blocks/load-schema.js';
import { summaryText, noteLines, curveGeometry, pathOf, suggestions, nextLoadId, attachPoints, defaultAttachPoint, SHRINK_IMPRACTICAL, speedRows, powerAdvice, attachBars, loadFromForm, upsertLoad, removeLoad, describeAttach, motorLabel, fmtKg, pct } from '../js/blocks/torque-model.js';

const near = (a, b, t) => Math.abs(a - b) <= t;
const stick = { type: 'bar', id: 'Arm', color: '#3498db', p1: { id: 'O', type: 'fixed', x: 0, y: 0, physicalMotor: '1' }, p2: { id: 'E', type: 'floating', x: 160, y: 0 }, lenParam: 'L1', isInput: true, fixedLen: true, physicalMotor: '1', motorType: 'mg995', stock: { widthMm: 13, thicknessMm: 3, material: 'plywood' } };
const snap = (extra = {}) => ({ kind: 'blocks', v: 1, counter: 3, params: { L1: 160, theta: 0 }, comps: [{ type: 'anchor', id: 'Anchor1', p1: { id: 'O', type: 'fixed', x: 0, y: 0 } }, stick], loads: [{ id: 'W1', massG: 50, at: { pointId: 'E' } }], ...extra });
const res = requiredTorque(snap(), { motorId: '1', thetaRange: [0, 360], stepDeg: 5 });
const specs = listActuatorSpecs();
const evOf = id => evaluateActuator(res, getActuatorSpec(id));

// ---- 摘要與等級 ----
{
  const ev = evOf('SG90_4_8V');
  const t = summaryText(res, ev);
  check('摘要：最大需求 0.84 kgf·cm、使用率約 47%、黃燈', /最大需求 0\.8\d kgf·cm/.test(t) && /使用率 4[6-8]%/.test(t) && t.includes('黃燈'), t);
  check('摘要：無結果時回傳原因而非丟錯', summaryText({ ok: false, reason: '作品中沒有馬達' }, null) === '作品中沒有馬達');
  check('格式化：fmtKg／pct', fmtKg(kgfcmToNmm(1.234)) === '1.23' && pct(0.4749) === '47%' && fmtKg(null) === '—');
}

// ---- 建議 ----
{
  const green = suggestions(res, evOf('MG995_4_8V'), getActuatorSpec('MG995_4_8V'), { specs });
  check('綠燈沒有建議', green.length === 0);
  const sg = getActuatorSpec('SG90_4_8V'), evSg = evOf('SG90_4_8V');
  const tipsSg = suggestions(res, evSg, sg, { specs });
  const ratio = evSg.utilization / (evSg.thresholds[0] * res.efficiency);
  const m = tipsSg.find(t => t.includes('減速齒輪'));
  check('黃燈：給出所需齒比 = 使用率 ÷ (綠門檻 × η)，並提到效率與轉速變慢', m && m.includes(`${(Math.ceil(ratio * 10) / 10).toFixed(1)}:1`) && m.includes('效率') && m.includes('轉速'), m);
  check('黃燈：縮短力臂的比例 = 綠門檻 ÷ 使用率', tipsSg.some(t => t.includes('縮短手臂') && t.includes(`${Math.floor(evSg.thresholds[0] / evSg.utilization * 100)}%`)), tipsSg.join('|'));
  check('黃燈：列出更強且到綠燈的同類型型號（MG995），不含自己與直流馬達', tipsSg.some(t => t.includes('MG995 伺服 4.8 V') && !t.includes('TT')), tipsSg.join('|'));
  // 縮短手臂：要縮到 40% 以下時不給小百分比
  check('縮短手臂：需縮到 40% 以下時改說單靠縮短不實際，不寫百分比', (() => {
    const big = requiredTorque(snap({ loads: [{ id: 'W1', massG: 400, at: { pointId: 'E' } }] }), { motorId: '1', thetaRange: [0, 90], stepDeg: 30 }), ev = evaluateActuator(big, sg), tips = suggestions(big, ev, sg, { specs });
    return ev.thresholds[0] / ev.utilization < SHRINK_IMPRACTICAL && tips.some(t => t.includes('單靠縮短手臂不實際') && !/縮到約/.test(t)) && !tips.some(t => /縮到約\s*\d+%/.test(t));
  })());
  check('縮短手臂：還算實際時保留百分比建議', tipsSg.some(t => /縮到約 \d+% 長度/.test(t)));
  const tt = getActuatorSpec('TT_6V'), evTt = evOf('TT_6V'), tipsTt = suggestions(res, evTt, tt, { specs });
  check('紅燈且舉不起：第一句明說舉不起來（估算）', tipsTt[0].includes('舉不起來'));
  check('直流：N20 100:1 不是綠燈就不會被推薦', !tipsTt.some(t => t.includes('N20 HP 100:1')) || evOf('N20_100_6V').level === 'green');
  const flat = requiredTorque(snap({ gravity: 'flat' }), { motorId: '1', thetaRange: [0, 360], stepDeg: 30 });
  const withFlat = suggestions(res, evSg, sg, { specs, flatPeakNmm: flat.summary.maxAbsNmm });
  check('傳入平放結果時提示「平放不算重力」並寫出新使用率', withFlat.some(t => t.includes('平放') && t.includes('使用率 0%')), withFlat.join('|'));
  check('平放沒有改善時不亂提示', !suggestions(res, evSg, sg, { specs, flatPeakNmm: res.summary.maxAbsNmm }).some(t => t.includes('平放')));
  const noStronger = suggestions(res, evOf('MG995_6V'), getActuatorSpec('MG995_6V'), { specs: [] });
  check('輸入缺資料時不丟錯', Array.isArray(noStronger) && suggestions(null, null, null).length === 0);
}
{
  // N20 298:1 的失速 4 kgf·cm 高於齒輪箱上限 2：需求 2.4 超過上限，雖未超過失速仍為紅燈
  const heavy = requiredTorque(snap({ loads: [{ id: 'W1', massG: 150, at: { pointId: 'E' } }] }), { motorId: '1', thetaRange: [0, 90], stepDeg: 15 });
  const spec = getActuatorSpec('N20_298_6V'), ev = evaluateActuator(heavy, spec);
  const tips = suggestions(heavy, ev, spec, { specs });
  check('N20 超過齒輪箱上限 → 紅燈並提示齒輪箱', ev.level === 'red' && !ev.cantLift && ev.exceedsGearbox && tips[0].includes('齒輪箱'), tips[0]);
}

// ---- 曲線座標 ----
{
  const ev = evOf('SG90_4_8V'), spec = getActuatorSpec('SG90_4_8V'), g = curveGeometry(res, spec, ev, { w: 340, h: 180 });
  check('曲線：一段連續折線、73 點', g.segments.length === 1 && g.segments[0].length === 73);
  const xs = g.segments[0].map(p => p.x), ys = g.segments[0].map(p => p.y);
  check('曲線：x 單調遞增、全在繪圖區內', xs.every((x, i) => i === 0 || x > xs[i - 1]) && Math.min(...xs) >= g.plot.l - 1e-9 && Math.max(...xs) <= g.plot.r + 1e-9 && Math.min(...ys) >= g.plot.t - 1e-9 && Math.max(...ys) <= g.plot.b + 1e-9);
  const L = k => g.lines.find(l => l.key === k);
  check('門檻線：綠＝1/3 失速、黃＝2/3 失速（伺服），y 由低到高越上面越小', near(L('green').nmm, spec.stallTorqueNmm / 3, 1e-9) && near(L('yellow').nmm, spec.stallTorqueNmm * 2 / 3, 1e-9) && L('green').y > L('yellow').y);
  check('最吃力點落在曲線最高處（y 最小）且對應 worstTheta', near(g.worst.y, Math.min(...ys), 0.6) && g.worst.theta === res.summary.worstTheta);
  const lineYtoNmm = l => (g.plot.b - l.y) / (g.plot.b - g.plot.t) * g.ymaxNmm;
  check('門檻線高度換回扭力與 nmm 一致', near(lineYtoNmm(L('green')), L('green').nmm, 1e-6));
  check('背景三段帶：綠在最下、紅在最上，互不重疊', g.bands[0].y2 === g.plot.b && g.bands[0].y1 === g.bands[1].y2 && g.bands[1].y1 === g.bands[2].y2);
  check('pathOf：M／L 命令與座標', pathOf([{ x: 1, y: 2 }, { x: 3, y: 4 }]) === 'M1.0,2.0L3.0,4.0');
  const n20 = curveGeometry(res, getActuatorSpec('N20_298_6V'), evOf('N20_298_6V'));
  check('N20 圖上有齒輪箱上限虛線', n20.lines.some(l => l.key === 'gearbox' && l.dashed));
  check('無資料回傳 null', curveGeometry({ ok: false }, spec, ev) === null);
  // 死點與奇異點標記：人造結果
  const fake = { ok: true, thetaRange: [0, 40], summary: { maxAbsNmm: 50, worstTheta: 20 }, samples: [
    { theta: 0, torqueNmm: 10, flags: [] }, { theta: 10, torqueNmm: 40, flags: ['nearDeadPoint'] }, { theta: 20, torqueNmm: -50, flags: [] },
    { theta: 30, torqueNmm: null, flags: ['singular'] }, { theta: 40, torqueNmm: 5, flags: [] }] };
  const gf = curveGeometry(fake, spec, evaluateActuator(fake, spec));
  check('死點為菱形標記、奇異點為叉號；奇異點讓折線斷成兩段；負扭力取絕對值', gf.marks.length === 2 && gf.marks.some(m => m.kind === 'dead' && m.theta === 10) && gf.marks.some(m => m.kind === 'singular' && m.theta === 30) && gf.segments.length === 2 && near(gf.worst.y, gf.segments[0][2].y, 1e-9));
}

// ---- 說明清單 ----
{
  const fake = { assumptions: ['準靜態估算'], skipped: [{ id: 'W9', type: 'load', reason: '找不到接點 Q' }], gearStages: 1, efficiency: 0.9, samples: [{ flags: ['nearDeadPoint'] }, { flags: ['singular'] }, { flags: [] }] };
  const t = noteLines(fake).join('\n');
  check('說明清單：假設、略過、死點、奇異點、齒輪效率都用白話列出', t.includes('準靜態') && t.includes('略過 W9：找不到接點 Q') && t.includes('接近死點') && t.includes('奇異點') && t.includes('90%'), t);
  check('無結果時回傳空陣列', noteLines(null).length === 0);
}

// ---- 負載標記編輯 ----
{
  check('nextLoadId 跳過已用編號', nextLoadId([]) === 'Load1' && nextLoadId([{ id: 'Load1' }, { id: 'Load3' }]) === 'Load2');
  const pts = attachPoints(snap().comps);
  check('可掛接點去重、活動點在前、固定點排最後並標「固定」', pts.map(p => p.id).join() === 'E,O' && pts[0].label === 'E（Arm）' && pts[1].fixed && pts[1].label === 'O（Anchor1，固定）', JSON.stringify(pts));
  check('預設掛接點是活動點（離馬達軸最遠的 E），不是固定的 O', defaultAttachPoint(snap().comps, { shaftPointId: 'O' }) === 'E' && defaultAttachPoint(snap().comps) === 'E');
  const six = BLOCK_EXAMPLES.find(e => e.id === 'six-bar-lift').snapshot, sixPts = attachPoints(six.comps);
  const sixDef = defaultAttachPoint(six.comps, { tracePoint: six.tracePoint, tracePoints: six.tracePoints, shaftPointId: findMotors(six.comps)[0].shaftPointId });
  check('六連桿：軌跡點 SixTip 是預設，且不是固定點', sixDef === six.tracePoint && !sixPts.find(p => p.id === sixDef).fixed, sixDef);
  check('六連桿：沒有軌跡點時退回離軸最遠的活動點，一樣不是固定點', !sixPts.find(p => p.id === defaultAttachPoint(six.comps, { shaftPointId: findMotors(six.comps)[0].shaftPointId })).fixed);
  check('六連桿：固定點（SixO 等）全部排在活動點後面', (() => { const k = sixPts.findIndex(p => p.fixed); return k > 0 && sixPts.slice(k).every(p => p.fixed); })());
  check('軌跡點若是固定點就不採用', defaultAttachPoint(snap().comps, { tracePoint: 'O', shaftPointId: 'O' }) === 'E');
  check('可選零件只含有 p1/p2 的桿', attachBars(snap().comps).map(b => b.id).join() === 'Arm');
  const a = loadFromForm({ id: 'Load1', name: ' 杯子 ', massG: '80', mode: 'point', pointId: 'E', fx: '', fy: '' });
  check('表單 → 接點負載（trim 名稱、無外力）', a.load && a.load.name === '杯子' && a.load.massG === 80 && a.load.at.pointId === 'E' && !a.load.force);
  const b = loadFromForm({ id: 'Load2', massG: 20, mode: 'bar', compId: 'Arm', u: '100', v: '5', fx: '0', fy: '-1.5' });
  check('表單 → 零件位置負載＋外力', b.load.at.compId === 'Arm' && b.load.at.u === 100 && b.load.at.v === 5 && b.load.force.y === -1.5 && b.load.force.x === 0);
  check('輸入錯誤回傳 error：負質量、缺接點、非數字', loadFromForm({ id: 'x', massG: -1, mode: 'point', pointId: 'E' }).error && loadFromForm({ id: 'x', massG: 1, mode: 'point' }).error && loadFromForm({ id: 'x', massG: 'abc', mode: 'point', pointId: 'E' }).error && loadFromForm({ id: 'x', massG: 1, mode: 'bar', compId: 'Arm', u: '' }).error);
  const list = upsertLoad(upsertLoad([], a.load), b.load), edited = upsertLoad(list, { ...a.load, massG: 99 });
  check('upsert 新增與覆寫、remove 移除', list.length === 2 && edited.length === 2 && edited[0].massG === 99 && removeLoad(edited, 'Load1').length === 1 && removeLoad(null, 'x').length === 0);
  check('表單產生的負載能通過 schema 正規化（可存檔）', normalizeLoads(list).length === 2 && JSON.stringify(normalizeLoads(list)[1].at) === JSON.stringify(b.load.at));
  const r2 = requiredTorque(snap({ loads: list.map(l => l.id === 'Load1' ? { ...l, at: { pointId: 'E' } } : l) }), { motorId: '1', thetaRange: [0, 90], stepDeg: 30 });
  check('編輯過的負載能直接餵給 requiredTorque', r2.ok && r2.samples[0].contributions.some(c => c.id === 'Load1'));
  check('描述掛接位置', describeAttach(a.load) === '接點 E' && describeAttach(b.load).includes('Arm'));
  check('馬達名稱', motorLabel({ id: '2', motorType: 'tt' }) === '馬達 2（TT 馬達）' && motorLabel({ id: '1', motorType: 'zzz' }).includes('zzz'));
}
report('torque-panel-model');
