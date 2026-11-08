// 扭力面板的純函式（無 DOM）：曲線座標、建議文字、負載標記編輯。介面在 torque-ui.js。
// 單位：內部 N·mm，顯示 kgf·cm。所有建議都是「估算」，依 docs/RESEARCH-ACTUATOR-TORQUE.md §3.4。
import { nmmToKgfcm } from '../core/actuator-specs.js';

export const LEVELS = Object.freeze({
  green: Object.freeze({ label: '綠燈', color: '#1e8e4e', hint: '夠用' }),
  yellow: Object.freeze({ label: '黃燈', color: '#c98a00', hint: '勉強，建議改善' }),
  red: Object.freeze({ label: '紅燈', color: '#c0392b', hint: '不夠或太吃力' })
});
const fin = Number.isFinite;
/** 力臂要縮到這個比例以下才到綠燈時，不再給百分比，改說「單靠縮短不實際」。 */
export const SHRINK_IMPRACTICAL = 0.4;
export const kg = nmm => (fin(nmm) ? nmmToKgfcm(nmm) : null);
export const fmtKg = nmm => (fin(nmm) ? nmmToKgfcm(nmm).toFixed(2) : '—');
export const pct = u => (fin(u) ? `${Math.round(u * 100)}%` : '—');
const deg = t => `${Math.round(t * 10) / 10}°`;

/** 一行摘要：最大需求 x kgf·cm @ θ°，使用率 %（顏色等級）。 */
export function summaryText(result, ev) {
  if (!result?.ok || !result.summary) return result?.reason || '無法估算';
  const s = `最大需求 ${fmtKg(result.summary.maxAbsNmm)} kgf·cm @ ${deg(result.summary.worstTheta)}`;
  if (!ev?.ok) return s+(ev?.reason?'；'+ev.reason:'');
  return `${s}，使用率 ${pct(ev.utilization)}（${LEVELS[ev.level].label}）`;
}

const NOTE_FLAGS = [
  ['nearDeadPoint', n => `${n} 個角度接近死點（輸出幾乎不動），該處扭力數值會失真，曲線上以菱形標記。`],
  ['singular', n => `${n} 個角度的機構卡在奇異點，無法估算，曲線上以叉號標記。`],
  ['nearSingular', n => `${n} 個角度接近奇異點，已縮小差分步長估算。`],
  ['invalid', n => `${n} 個角度機構無解（連桿接不起來），略過。`]
];

/** 假設、略過項目與旗標的白話清單。 */
export function noteLines(result) {
  if (!result) return [];
  const out = [...(result.assumptions || [])];
  for (const s of result.skipped || []) out.push(`略過 ${s.id}：${s.reason}`);
  for (const [flag, make] of NOTE_FLAGS) {
    const n = (result.samples || []).filter(x => x.flags.includes(flag)).length;
    if (n) out.push(make(n));
  }
  if (result.gearStages > 0) out.push(`齒輪 ${result.gearStages} 級，每級效率 ${Math.round((result.efficiency || 0.9) * 100)}%（預設值，未實測）`);
  return out;
}

/**
 * 曲線座標。畫的是 |需求扭力|（正負都會吃力），門檻線與帶狀底色對應 evaluateActuator 的綠／黃界線。
 * size = {w,h}；回傳可直接餵 SVG 的座標。無資料回傳 null。
 */
export function curveGeometry(result, spec, ev, size = { w: 340, h: 180 }) {
  if (!result?.ok || !result.samples?.length || !spec) return null;
  const { w, h } = size, m = { l: 44, r: 10, t: 10, b: 26 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const [x0, x1] = result.thetaRange, xs = x1 > x0 ? x1 - x0 : 1;
  const stall = spec.stallTorqueNmm, [gT, yT] = ev?.thresholds || [0.25, 0.5];
  const peak = result.summary?.maxAbsNmm || 0;
  const ymax = Math.max(peak, stall * yT, 1e-6) * 1.15;
  const X = t => m.l + (t - x0) / xs * pw, Y = v => m.t + ph - Math.min(v, ymax) / ymax * ph;
  const segments = [], marks = []; let cur = [];
  for (const s of result.samples) {
    if (s.torqueNmm === null || !fin(s.torqueNmm)) { if (cur.length) segments.push(cur); cur = []; if (s.flags.some(f => f === 'singular' || f === 'invalid')) marks.push({ x: X(s.theta), y: Y(0), kind: 'singular', theta: s.theta }); continue; }
    cur.push({ x: X(s.theta), y: Y(Math.abs(s.torqueNmm)) });
    if (s.flags.includes('nearDeadPoint')) marks.push({ x: X(s.theta), y: Y(Math.abs(s.torqueNmm)), kind: 'dead', theta: s.theta });
  }
  if (cur.length) segments.push(cur);
  const lines = [
    { key: 'green', nmm: stall * gT, color: LEVELS.green.color, label: `綠 ≤ ${pct(gT)}` },
    { key: 'yellow', nmm: stall * yT, color: LEVELS.yellow.color, label: `黃 ≤ ${pct(yT)}` }
  ];
  if (stall <= ymax) lines.push({ key: 'red', nmm: stall, color: LEVELS.red.color, label: '失速 100%' });
  if (spec.gearboxLimitNmm != null && spec.gearboxLimitNmm <= ymax) lines.push({ key: 'gearbox', nmm: spec.gearboxLimitNmm, color: LEVELS.red.color, label: '齒輪箱上限', dashed: true });
  for (const l of lines) l.y = Y(l.nmm);
  const bands = [
    { color: LEVELS.green.color, y1: Y(stall * gT), y2: Y(0) },
    { color: LEVELS.yellow.color, y1: Y(stall * yT), y2: Y(stall * gT) },
    { color: LEVELS.red.color, y1: Y(ymax), y2: Y(stall * yT) }
  ];
  const nice = (a, b, n) => { const step = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(step))), f = step / mag, s = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag; return Array.from({ length: Math.floor(b / s) + 1 }, (_, i) => i * s); };
  const yTicks = nice(0, nmmToKgfcm(ymax), 4).map(v => ({ y: Y(v / nmmToKgfcm(1)), label: String(Math.round(v * 100) / 100) }));
  const xTicks = nice(0, xs, 4).map(v => ({ x: X(x0 + v), label: String(Math.round((x0 + v) * 10) / 10) }));
  const worst = result.summary ? { x: X(result.summary.worstTheta), y: Y(result.summary.maxAbsNmm), theta: result.summary.worstTheta } : null;
  return { w, h, plot: { l: m.l, r: w - m.r, t: m.t, b: m.t + ph }, segments, marks, lines, bands, yTicks, xTicks, worst, ymaxNmm: ymax };
}
export const pathOf = seg => seg.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');

/**
 * 黃／紅燈時的白話建議（全部是估算）。
 * opts.specs：可挑選的規格清單；opts.flatPeakNmm：改成平放後的最大需求（UI 另跑一次得到，可省略）。
 */
export function suggestions(result, ev, spec, { specs = [], flatPeakNmm = null } = {}) {
  if (!result?.ok || !ev?.ok || !spec || ev.level === 'green') return [];
  const out = [], peak = ev.peakNmm, g = ev.thresholds[0], util = ev.utilization;
  const eta = result.efficiency || 0.9;
  if (ev.cantLift) out.push(`在最吃力的姿態（${deg(ev.worstTheta)}），需求超過這個動力的失速扭力，估算舉不起來。`);
  else if (ev.exceedsGearbox) out.push('需求超過齒輪箱建議的瞬間上限，長期使用齒輪可能受損。');
  const ratio = util / (g * eta);
  if (ratio > 1) {
    const r1 = (Math.ceil(ratio * 10) / 10).toFixed(1);
    out.push(`加一級減速齒輪，約 ${r1}:1 可估到綠燈（已含每級效率 ${Math.round(eta * 100)}%）。代價是輸出轉速變成約 1/${r1}，也多一級齒輪要做。${ratio > 8 ? '比值偏大，通常要兩級以上。' : ''}`);
  }
  if (util > g) {
    const keep = g / util;
    if (keep < SHRINK_IMPRACTICAL) out.push('單靠縮短手臂不實際：要縮得非常短才到綠燈。請改用上面的齒輪減速或更強的型號，再視情況減輕負載。');
    else out.push(`縮短手臂或把負載移近軸心：需求大致與力臂成正比，縮到約 ${Math.floor(keep * 100)}% 長度可估到綠燈（質量不變時）。`);
  }
  if (flatPeakNmm !== null && fin(flatPeakNmm) && flatPeakNmm < peak * 0.9) {
    out.push(`如果機構其實是平放（在桌面上轉），重力不產生扭力：最大需求約 ${fmtKg(flatPeakNmm)} kgf·cm（使用率 ${pct(flatPeakNmm / spec.stallTorqueNmm)}）。把上方重力改成「平放」可重算。`);
  }
  const better = specs.filter(s => s.id !== spec.id && s.kind === spec.kind && s.stallTorqueNmm > spec.stallTorqueNmm && peak / s.stallTorqueNmm <= g && !(s.gearboxLimitNmm != null && peak > s.gearboxLimitNmm))
    .sort((a, b) => a.stallTorqueNmm - b.stallTorqueNmm).slice(0, 2);
  if (better.length) out.push(`改用清單中更強的型號：${better.map(s => `${s.label}（約 ${pct(peak / s.stallTorqueNmm)}）`).join('、')}。規格為標示值，市售品多半較弱。`);
  else out.push('清單內沒有更強又能到綠燈的同類型型號；可考慮加齒輪或減輕負載。');
  return out;
}

// ---- 負載標記編輯（存在 S.topo.loads，格式見 load-schema.js）----
export function nextLoadId(loads) {
  const used = new Set((loads || []).map(l => l.id));
  for (let i = 1; ; i++) if (!used.has(`Load${i}`)) return `Load${i}`;
}
/** 固定點（機架、馬達軸）：不會平移，掛負載在上面扭力為 0。type 為 fixed 或 motor。 */
const isGround = p => p?.type === 'fixed' || p?.type === 'motor';
/**
 * 可掛接的接點：所有零件的 p1/p2/p3 去重，標出所屬零件。活動點在前；固定點排最後並標「固定」（掛負載不會產生扭力）。
 * 同一個接點在任何零件上是固定點就視為固定。回傳 {id,label,fixed,x,y}。
 */
export function attachPoints(comps) {
  const seen = new Map();
  for (const c of comps || []) for (const k of ['p1', 'p2', 'p3']) {
    const p = c?.[k]; if (!p?.id) continue;
    const e = seen.get(p.id);
    if (!e) seen.set(p.id, { id: p.id, comp: c.id, fixed: isGround(p), x: Number(p.x), y: Number(p.y) });
    else if (isGround(p)) e.fixed = true;
  }
  const all = [...seen.values()].map(e => ({ id: e.id, fixed: e.fixed, x: e.x, y: e.y, label: e.fixed ? `${e.id}（${e.comp}，固定）` : `${e.id}（${e.comp}）` }));
  return [...all.filter(e => !e.fixed), ...all.filter(e => e.fixed)];
}
/**
 * 新增負載時預設掛的接點：作品的軌跡點（tracePoints／tracePoint，要是活動點）優先；
 * 否則是離馬達軸最遠的活動點（通常是手臂末端）；全是固定點時退回第一個。
 */
export function defaultAttachPoint(comps, { tracePoints = [], tracePoint = '', shaftPointId = '' } = {}) {
  const pts = attachPoints(comps), moving = pts.filter(p => !p.fixed);
  for (const id of [...(tracePoints || []), tracePoint]) if (id && moving.some(p => p.id === id)) return id;
  if (!moving.length) return pts[0]?.id || '';
  const shaft = pts.find(p => p.id === shaftPointId) || pts.find(p => p.fixed);
  if (!shaft || !fin(shaft.x) || !fin(shaft.y)) return moving[0].id;
  const dist = p => (fin(p.x) && fin(p.y) ? Math.hypot(p.x - shaft.x, p.y - shaft.y) : -1);
  return moving.reduce((a, b) => (dist(b) > dist(a) ? b : a)).id;
}
/** 可用「零件上位置」掛接的零件（有 p1、p2 的桿）。 */
export const attachBars = comps => (comps || []).filter(c => c?.p1?.id && c?.p2?.id && c.id).map(c => ({ id: c.id, label: c.id }));
export const describeAttach = l => (l.at?.pointId ? `接點 ${l.at.pointId}` : `${l.at?.compId} 上 (${l.at?.u}, ${l.at?.v}) mm`);

/** 表單值 → 負載；錯誤回傳 {error}。form = {id,name,massG,mode:'point'|'bar',pointId,compId,u,v,fx,fy}（字串或數字皆可）。 */
export function loadFromForm(form) {
  const num = (v, d) => (v === '' || v === undefined || v === null ? d : Number(v));
  const massG = num(form.massG, NaN);
  if (!fin(massG) || massG < 0) return { error: '質量請填 0 以上的數字（克）' };
  const load = { id: form.id, massG };
  if (form.name && String(form.name).trim()) load.name = String(form.name).trim().slice(0, 24);
  if (form.mode === 'bar') {
    const u = num(form.u, NaN), v = num(form.v, 0);
    if (!form.compId || !fin(u) || !fin(v)) return { error: '請選零件並填沿桿距離 u（mm）' };
    load.at = { compId: form.compId, u, v };
  } else {
    if (!form.pointId) return { error: '請選掛接的接點' };
    load.at = { pointId: form.pointId };
  }
  const fx = num(form.fx, 0), fy = num(form.fy, 0);
  if (!fin(fx) || !fin(fy)) return { error: '外力請填數字（N）' };
  if (fx || fy) load.force = { x: fx, y: fy };
  return { load };
}
export const upsertLoad = (loads, load) => (loads || []).some(l => l.id === load.id) ? loads.map(l => l.id === load.id ? load : l) : [...(loads || []), load];
export const removeLoad = (loads, id) => (loads || []).filter(l => l.id !== id);

/** 馬達顯示名稱。 */
export const MOTOR_NAMES = Object.freeze({ mg995: 'MG995 伺服', tt: 'TT 馬達', n20: 'N20 馬達', linear: '線性致動器' });
export const motorLabel = m => `馬達 ${m.id}（${MOTOR_NAMES[m.motorType] || m.motorType}）`;

// ---- 速度、電流與電源（Q4；計算在 core/actuator-speed.js）----
const amp = a => `${Math.round(a * 100) / 100} A`;
const sec = t => (t < 10 ? t.toFixed(2) : t.toFixed(1)) + ' 秒';
/**
 * 行程時間與電流的白話列：[{key,label,text,bad}]。est 是 strokeEstimate 的結果；全部是估算。
 * 伺服的時間是「至少」（負載會更慢）；直流的電流若缺空載電流，只寫下限與失速電流。
 */
export function speedRows(est, spec) {
  if (!est?.ok) return [{ key: 'time', label: '行程時間', text: est?.reason || '無法估算', bad: false }];
  const deg0 = `${Math.round(est.strokeDeg * 10) / 10}°`, rows = [];
  if (est.cantFinish) rows.push({ key: 'time', label: '行程時間', text: `無法完成行程：最吃力處的需求已達或超過失速扭力，馬達會卡住（${deg0}）`, bad: true });
  else if (est.kind === 'servo') rows.push({ key: 'time', label: '行程時間', text: `至少 ${sec(est.timeS)}（${spec.secPer60deg} 秒／60° × ${deg0}；這是無負載速度，有負載會更慢）`, bad: false });
  else rows.push({ key: 'time', label: '行程時間', text: `約 ${sec(est.timeS)}（轉 ${deg0}；無負載 ${sec(est.noLoadTimeS)}，慢 ${Math.round((est.slowdown - 1) * 100)}%；最吃力處約 ${Math.round(est.peakRpm)} rpm）`, bad: false });
  const c = est.current;
  if (c?.amps !== null && c?.amps !== undefined) rows.push({ key: 'current', label: '峰值電流', text: `約 ${amp(c.amps)}（失速時 ${amp(c.upperA)}）`, bad: false });
  else if (c?.lowerA !== null && c?.lowerA !== undefined && c.lowerA >= c.upperA) rows.push({ key: 'current', label: '峰值電流', text: `約 ${amp(c.upperA)}（已達失速電流）`, bad: false });
  else if (c?.lowerA !== null && c?.lowerA !== undefined) rows.push({ key: 'current', label: '峰值電流', text: `至少約 ${amp(c.lowerA)}（${c.reason}，實際略高；失速時 ${amp(c.upperA)}）`, bad: false });
  else rows.push({ key: 'current', label: '峰值電流', text: `未知（${c?.reason || '規格沒有電流資料'}）`, bad: false });
  return rows;
}
/**
 * 電源建議。只講能從規格得到的事：電壓對應的 AA 電池數、需要能供應的電流；不保證電池一定撐得住。
 * 電壓：每顆 AA 鹼性標稱 1.5 V（串聯相加）。
 */
export function powerAdvice(est, spec) {
  if (!spec) return [];
  const out = [], cells = Math.round(spec.voltage / 1.5);
  out.push(Math.abs(cells*1.5-spec.voltage)<1e-9?`規格電壓 ${spec.voltage} V：${cells} 顆 AA 鹼性電池串聯標稱 ${cells * 1.5} V，與規格相符；電壓低於規格，轉速與扭力都會變小。`:`規格電壓 ${spec.voltage} V：請用符合實物額定範圍的電源；${cells} 顆AA標稱 ${cells*1.5} V不等同 ${spec.voltage} V，未依此重新估性能。`);
  const c = est?.current;
  if (c?.upperA !== null && c?.upperA !== undefined) out.push(`${spec.label.split(' ')[0]} 失速電流 ${amp(c.upperA)}，電源與驅動板要能供應這麼大的瞬間電流；${c.amps !== null ? `這個作品最吃力處約 ${amp(c.amps)}。` : `這個作品最吃力處至少約 ${amp(c.lowerA)}。`}電池在大電流下電壓會下降，請實測。`);
  else out.push('規格沒有電流資料。多顆馬達同時動作或卡住時，電流可能超過電池或穩壓器的能力，請留餘裕並實測。');
  return out;
}
