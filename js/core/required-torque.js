/**
 * 需求扭力估算（虛功法，準靜態）。docs/RESEARCH-ACTUATOR-TORQUE.md §3。
 *
 * τ(θ) = dU/dθ − Σ F·dP/dθ ：U 為重力位能（重力朝畫面 −y）、F 為作用在機構上的外力、P 為力的作用點。
 * dP/dθ 以既有求解器在 θ±Δθ 的中心差分取得；只呼叫 compileTopology／solveTopology，不改求解流程。
 * 單位：長度 mm、質量 g、力 N、扭力 N·mm（nmmToKgfcm 可轉 kgf·cm）。正＝馬達要推，負＝負載會帶著馬達轉（需要保持）。
 * 不計摩擦（只用齒輪效率）、慣量與衝擊；結果是「靜態估算」。
 */
import { compileTopology } from './topology.js';
import { solveTopology } from '../multilink/solver.js';
import { gearTrain } from './gear-train.js';
import { assemblyMassModel } from '../blocks/part-mass.js';
import { normalizeLoads, normalizeGravity } from '../blocks/load-schema.js';
import { normalizeSnapshot } from '../blocks/schema.js';
import { getActuatorSpec, defaultSpecIdForMotorType, thresholdsFor } from './actuator-specs.js';

export const G_ACCEL = 9.80665; // m/s²
export const DEFAULT_EFFICIENCY = 0.9;
export const DEFAULT_DELTA_DEG = 0.5;
const KEYS = ['p1', 'p2', 'p3'];
const rad = d => d * Math.PI / 180;
const fin = Number.isFinite;

/** 找出作品中的馬達：{id, shaftPointId, compId, motorType, servoStart, servoEnd, carrier}。 */
export function findMotors(comps) {
  const map = new Map();
  for (const c of [...comps].sort((a,b)=>Number(!!(b?.isInput||b?.type==='gear'))-Number(!!(a?.isInput||a?.type==='gear')))) {
    if (!c || typeof c !== 'object') continue;
    for (const k of KEYS) {
      const pm = c[k]?.physicalMotor ?? c[k]?.physical_motor;
      if (pm === undefined || pm === null || pm === '') continue;
      const id = String(pm);
      if (!map.has(id)) map.set(id, { id, shaftPointId: c[k].id, compId: c.id, motorType: c.motorType || 'tt', servoStart: c.servoStart, servoEnd: c.servoEnd, carrier: c.motorCarrier || null });
    }
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

function resolveMotor(comps, motors, opts) {
  if (opts.motorId !== undefined) return motors.find(m => m.id === String(opts.motorId)) || null;
  if (opts.inputId !== undefined) {
    const c = comps.find(x => x.id === opts.inputId);
    const id = c && String(c.physicalMotor ?? c.p1?.physicalMotor ?? c.p2?.physicalMotor ?? '');
    return motors.find(m => m.id === id) || null;
  }
  return motors[0] || null;
}

/** 以馬達軸為輸入的齒輪級數（嚙合次數最大值）；沒有齒輪傳動為 0。 */
function gearStages(comps, params, motorId) {
  if (!comps.some(c => c.type === 'gear')) return { stages: 0, reason: '' };
  const gt = gearTrain(comps, params);
  if (gt.reason) return { stages: 0, reason: gt.reason };
  let stages = 0;
  for (const g of comps.filter(c => c.type === 'gear')) {
    const st = gt.state(g);
    const root = st?.root && String(st.root.p1?.physicalMotor ?? st.root.p1?.physical_motor ?? '');
    if (st && root === motorId) stages = Math.max(stages, st.depth);
  }
  return { stages, reason: '' };
}

const fail = (reason, extra = {}) => ({ ok: false, reason, samples: [], summary: null, ...extra });

/**
 * @param snapshot Blocks 作品（原始 JSON 或正規化後）。
 * @param opts { motorId | inputId, thetaRange:[a,b], stepDeg=5, deltaDeg=0.5, efficiency=0.9, activeAngle=0,
 *               includeParts=true, includeMotors=true, motorMassG:{[motorId]:g}, gravity, loads }
 * @returns {{ok, reason, motor, thetaRange, stepDeg, efficiency, gearStages, samples:Array, summary, assumptions:string[], skipped:Array}}
 *  sample = { theta, valid, torqueNmm（馬達端，含效率）, idealNmm, contributions:[{id,kind,label,gravityNmm,forceNmm,torqueNmm}], flags:[] }
 *  flags: 'invalid'（姿態無解）、'singular'（無法差分）、'nearSingular'（差分步長被縮小）、'nearDeadPoint'（負載點位移率趨近 0）
 *  summary = { maxAbsNmm, worstTheta, maxPushNmm, maxHoldNmm, validCount, flaggedCount }
 */
export function requiredTorque(snapshot, opts = {}) {
  const norm = snapshot && snapshot.kind === 'blocks' ? normalizeSnapshot(snapshot) : snapshot;
  if (!norm || !Array.isArray(norm.comps)) return fail('作品格式無法讀取');
  if(norm.modules?.some(m=>m.mount))return fail('尚不支援已掛接／跨面組立的扭力估算，請核對獨立平面機構。');
  const comps = structuredClone(norm.comps), settings = {...norm.fabrication?.export,drive:norm.fabrication?.drive,fabrication:norm.fabrication};
  const motors = findMotors(comps), motor = resolveMotor(comps, motors, opts);
  if (!motor) return fail(motors.length ? '找不到指定的馬達' : '作品中沒有馬達');
  const gravityMode = normalizeGravity(opts.gravity ?? norm.gravity);
  const loads = normalizeLoads(opts.loads ?? norm.loads);
  const eta = fin(opts.efficiency) && opts.efficiency > 0 && opts.efficiency <= 1 ? opts.efficiency : DEFAULT_EFFICIENCY;
  const stepDeg = fin(opts.stepDeg) && opts.stepDeg > 0 ? opts.stepDeg : 5;
  const baseDelta = fin(opts.deltaDeg) && opts.deltaDeg > 0 ? opts.deltaDeg : DEFAULT_DELTA_DEG;
  const range = Array.isArray(opts.thetaRange) && opts.thetaRange.length === 2 && opts.thetaRange.every(fin) && opts.thetaRange[1] >= opts.thetaRange[0]
    ? opts.thetaRange
    : (motor.motorType === 'mg995' && fin(motor.servoStart) && fin(motor.servoEnd) ? [Math.min(motor.servoStart, motor.servoEnd), Math.max(motor.servoStart, motor.servoEnd)] : [0, 360]);
  const assumptions = ['準靜態估算：不含摩擦、慣量與衝擊', gravityMode === 'flat' ? '平放：重力不產生扭力' : '直立：重力朝畫面下方'];

  let compiled;
  try { compiled = compileTopology(comps, { params: { ...(norm.params || {}), theta: 0 }, tracePoint: '' }, new Set()); }
  catch (e) { return fail(`編譯失敗：${e.message || e}`); }
  const params = compiled.params || norm.params || {};
  const { stages, reason: gearReason } = gearStages(comps, params, motor.id);
  if (gearReason) assumptions.push(`齒輪級數未計：${gearReason}`);
  const effTotal = Math.pow(eta, stages);

  // 其他馬達固定在目前角度（凍結角；現行控制中的馬達用 activeAngle）。
  const frozen = {};
  for (const m of motors) if (m.id !== motor.id) frozen[m.id] = fin(Number(norm.motorAngles?.[m.id])) ? Number(norm.motorAngles[m.id]) : (m.id === String(norm.activeMotor || '1') && fin(opts.activeAngle) ? opts.activeAngle : 0);
  const solveAt = (theta, seed) => {
    const r = solveTopology(compiled, { thetaDeg: theta, motorAngles: { ...frozen, [motor.id]: theta }, _prevPoints: seed || undefined });
    return r && r.isValid !== false && !r.isUnderconstrained && r.points ? r.points : null;
  };

  // 質量項目：{id,kind,label,massG, pos(pts)→{x,y}}；外力項目另列。
  const items = [], skipped = [];
  const frameOf = (pts, ids) => {
    const a = pts[ids[0]], b = pts[ids[1]];
    if (!a || !b) return null;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return d > 1e-9 ? { o: a, e: { x: (b.x - a.x) / d, y: (b.y - a.y) / d } } : null;
  };
  const atLocal = (fr, u, v) => ({ x: fr.o.x + u * fr.e.x - v * fr.e.y, y: fr.o.y + u * fr.e.y + v * fr.e.x });
  const angles=[];for(let a=range[0];a<range[1]-1e-9;a+=stepDeg)angles.push(a);angles.push(range[1]);
  let start=null;for(const a of angles){start=solveAt(a,null);if(start)break;}
  if (!start) return fail('起始姿態無解，無法估算', { motor, thetaRange: range });
  if (opts.includeParts !== false) {
    let model; const assumed = {};
    try { model = assemblyMassModel(comps, start, params, settings); } catch (e) { model = { items: [], skipped: [{ id: '*', type: '*', reason: String(e.message || e) }] }; }
    for (const it of model.items) {
      items.push({ id: it.id, kind: 'part', label: it.id, massG: it.massG, pos: it.anchor
        ? pts => { const a = pts[it.anchor.pointId]; return a ? { x: a.x + it.anchor.dx, y: a.y + it.anchor.dy } : null; }
        : pts => { const fr = frameOf(pts, it.frame); return fr && atLocal(fr, it.cg.u, it.cg.v); } });
      if (it.assumed) (assumed[it.reason] ||= []).push(it.id);
    }
    for (const [reason, ids] of Object.entries(assumed)) assumptions.push(`${ids.join('、')}：${reason}`);
    const fusedIds = model.items.filter(x => x.fused).map(x => x.id), approxIds = model.items.filter(x => x.approx);
    if (fusedIds.length) assumptions.push(`合成桿 ${fusedIds.join('、')}：以聯集外形算質量（重疊處不重複計）`);
    if (approxIds.length) assumptions.push(`${approxIds.map(x => x.id).join('、')}：${[...new Set(approxIds.map(x => x.approx))].join('、')}以匯出外形近似（重心取軸心／原點，不含軸套與螺絲）`);
    skipped.push(...model.skipped);
  }
  if (opts.includeMotors !== false) {
    for (const m of motors) {
      const spec = getActuatorSpec(defaultSpecIdForMotorType(m.motorType));
      const mass = fin(opts.motorMassG?.[m.id]) ? opts.motorMassG[m.id] : spec?.massG;
      if (!fin(mass)) { assumptions.push(`馬達 ${m.id}（${m.motorType}）本體重量未知，未計入`);if(m.carrier)skipped.push({id:'motor'+m.id,type:'motor',reason:'活動宿主馬達本體重量未知'});continue; }
      items.push({ id: `motor${m.id}`, kind: 'motor', label: `馬達 ${m.id}`, massG: mass, pos: pts => pts[m.shaftPointId] || null });
    }
  }
  const forceItems = [];
  for (const l of loads) {
    let pos;
    if (l.at.pointId) { if (!start[l.at.pointId]) { skipped.push({ id: l.id, type: 'load', reason: `找不到接點 ${l.at.pointId}` }); continue; } pos = pts => pts[l.at.pointId] || null; }
    else {
      const c = comps.find(x => x.id === l.at.compId);
      if (!c?.p1 || !c?.p2) { skipped.push({ id: l.id, type: 'load', reason: `找不到零件 ${l.at.compId}` }); continue; }
      pos = pts => { const fr = frameOf(pts, [c.p1.id, c.p2.id]); return fr && atLocal(fr, l.at.u, l.at.v); };
    }
    const label = l.name || l.id;
    if (l.massG > 0) items.push({ id: l.id, kind: 'load', label, massG: l.massG, pos, explicit: true });
    if (l.force) forceItems.push({ id: l.id, kind: 'load', label, force: l.force, pos, explicit: true });
  }

  const explicit = [...items, ...forceItems].filter(x => x.explicit);
  const samples = [];
  let seed = null, maxExplicitRate = 0;
  const ext = (() => { const xs = Object.values(start).filter(p => p && fin(p.x)); const w = Math.max(...xs.map(p => p.x)) - Math.min(...xs.map(p => p.x)), h = Math.max(...xs.map(p => p.y)) - Math.min(...xs.map(p => p.y)); return Math.max(w, h, 1); })();
  const targets = (list, pts) => list.map(it => ({ it, p: it.pos(pts) }));
  for (const theta of angles) {
    const s = { theta: Math.round(theta * 1e6) / 1e6, valid: false, torqueNmm: null, idealNmm: null, contributions: [], flags: [], rateMmPerDeg: 0 };
    const p0 = solveAt(theta, seed);
    samples.push(s);
    if (!p0) { s.flags.push('invalid'); continue; }
    seed = p0; s.valid = true;
    let diff = null, used = baseDelta;
    for (let k = 0; k < 5 && !diff; k++, used = baseDelta / Math.pow(2, k)) {
      const pp = solveAt(theta + used, p0), pm = solveAt(theta - used, p0);
      if (!pp || !pm) continue;
      const jump = Object.keys(p0).some(id => pp[id] && pm[id] && (Math.hypot(pp[id].x - p0[id].x, pp[id].y - p0[id].y) > 0.25 * ext || Math.hypot(pm[id].x - p0[id].x, pm[id].y - p0[id].y) > 0.25 * ext));
      if (!jump) diff = { pp, pm, h: used };
    }
    if (!diff) { s.flags.push('singular'); continue; }
    if (diff.h < baseDelta) s.flags.push('nearSingular');
    const h = rad(diff.h);
    let ideal = 0, rate = 0, explicitRate = 0;
    const grav = gravityMode === 'vertical';
    for (const it of items) {
      const a = it.pos(diff.pp), b = it.pos(diff.pm);
      if (!a || !b) continue;
      const dy = (a.y - b.y) / (2 * h), dx = (a.x - b.x) / (2 * h);
      const t = grav ? (it.massG / 1000) * G_ACCEL * dy : 0;
      ideal += t; s.contributions.push({ id: it.id, kind: it.kind, label: it.label, gravityNmm: t, forceNmm: 0, torqueNmm: t });
      if (it.explicit) explicitRate = Math.max(explicitRate, Math.hypot(dx, dy) * Math.PI / 180);
      rate = Math.max(rate, Math.hypot(dx, dy) * Math.PI / 180);
    }
    for (const it of forceItems) {
      const a = it.pos(diff.pp), b = it.pos(diff.pm);
      if (!a || !b) continue;
      const dx = (a.x - b.x) / (2 * h), dy = (a.y - b.y) / (2 * h);
      const t = -(it.force.x * dx + it.force.y * dy);
      ideal += t;
      const prev = s.contributions.find(c => c.id === it.id);
      if (prev) { prev.forceNmm = t; prev.torqueNmm += t; } else s.contributions.push({ id: it.id, kind: it.kind, label: it.label, gravityNmm: 0, forceNmm: t, torqueNmm: t });
      explicitRate = Math.max(explicitRate, Math.hypot(dx, dy) * Math.PI / 180);
      rate = Math.max(rate, Math.hypot(dx, dy) * Math.PI / 180);
    }
    s.idealNmm = ideal; s.torqueNmm = ideal / effTotal;
    s.rateMmPerDeg = explicit.length ? explicitRate : rate;
    maxExplicitRate = Math.max(maxExplicitRate, s.rateMmPerDeg);
  }
  for (const s of samples) if (s.valid && s.torqueNmm !== null && maxExplicitRate > 0 && s.rateMmPerDeg < 0.1 * maxExplicitRate) s.flags.push('nearDeadPoint');

  const good = samples.filter(s => s.torqueNmm !== null);
  let summary = null;
  if (good.length) {
    const worst = good.reduce((a, b) => Math.abs(b.torqueNmm) > Math.abs(a.torqueNmm) ? b : a);
    summary = {
      maxAbsNmm: Math.abs(worst.torqueNmm), worstTheta: worst.theta,
      maxPushNmm: Math.max(0, ...good.map(s => s.torqueNmm)), maxHoldNmm: Math.max(0, ...good.map(s => -s.torqueNmm)),
      validCount: good.length, flaggedCount: samples.filter(s => s.flags.length).length
    };
  }
  const ok = !!summary;
  return {
    ok, complete:good.length===samples.length, reason: ok ? '' : '整個範圍都無解或無法差分', motor, thetaRange: range, stepDeg, deltaDeg: baseDelta, efficiency: eta, gearStages: stages, gravity: gravityMode,
    samples, summary, assumptions, skipped
  };
}

/**
 * 以規格判定夠不夠。使用率＝最大需求扭力 ÷ 失速扭力；綠≤第一門檻、黃≤第二門檻、其餘紅；
 * 超過齒輪箱瞬間上限（N20）一律紅。thresholds 可覆寫 [綠上限, 黃上限]。
 */
export function evaluateActuator(result, spec, { thresholds } = {}) {
  if (!result?.summary || !spec || !(spec.stallTorqueNmm > 0)) return { ok: false, reason: '缺少需求扭力或規格', utilization: null, level: null, exceedsGearbox: false };
  if(result.complete===false||result.skipped?.length)return {ok:false,reason:'僅有部分有效姿態／已計零件，不能判定整段動力夠用。',utilization:null,level:null,exceedsGearbox:false};
  const peak = result.summary.maxAbsNmm, util = peak / spec.stallTorqueNmm;
  const [g, y] = thresholdsFor(spec, thresholds);
  const exceedsGearbox = spec.gearboxLimitNmm != null && peak > spec.gearboxLimitNmm;
  const level = exceedsGearbox || util > y ? 'red' : util > g ? 'yellow' : 'green';
  return { ok: true, reason: '', peakNmm: peak, utilization: util, level, thresholds: [g, y], exceedsGearbox, worstTheta: result.summary.worstTheta, cantLift: util >= 1 };
}
