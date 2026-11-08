/**
 * 動力的轉速、行程時間與電流估算（docs/RESEARCH-ACTUATOR-TORQUE.md §2.3、§3.5，Q4）。純函式，單位 N·mm、度、秒、安培。
 *
 * 直流減速馬達（固定電壓）：ω = ω0·(1 − τ/τstall)、I = I0 + (Istall − I0)·τ/τstall（兩條都是直線，來源 [7]）。
 * 伺服：只有無負載速度（s／60°），負載會讓它更慢但廠商沒給曲線，所以時間是「至少」；規格沒有電流就不編數字。
 * 欄位不明（null）就回傳 null 並寫出原因，不用猜的值補。
 * 輸入的扭力曲線是「馬達軸端」的需求（requiredTorque 已含齒輪減速與效率），所以 θ 是馬達軸角，時間直接積分；
 * 輸出端轉速另用 outputRpm(馬達轉速, 齒比) 換算。
 */
import { noLoadRpmOf } from './actuator-specs.js';

const fin = Number.isFinite;
export const RPM_TO_DEG_PER_S = 6;

/** 輸出軸轉速＝馬達轉速 ÷ 總減速比（比值大於 1 為減速）。 */
export const outputRpm = (motorRpm, ratio) => (fin(motorRpm) && fin(ratio) && ratio > 0 ? motorRpm / ratio : null);

/**
 * 在扭力 tauNmm（取絕對值）下的轉速。
 * @returns {{ok:boolean, degPerS:number|null, rpm:number|null, noLoadDegPerS:number|null, stalled:boolean, loadSlows:boolean, reason:string}}
 */
export function speedAtTorque(spec, tauNmm) {
  const bad = reason => ({ ok: false, degPerS: null, rpm: null, noLoadDegPerS: null, stalled: false, loadSlows: false, reason });
  if (!spec) return bad('沒有規格');
  const stall = spec.stallTorqueNmm, tau = Math.abs(Number(tauNmm));
  if (!(stall > 0) || !fin(tau)) return bad('失速扭力或需求扭力未知');
  const stalled = tau >= stall;
  if (spec.kind === 'servo') {
    if (!(spec.secPer60deg > 0)) return bad('規格沒有 s／60° 速度');
    const w0 = 60 / spec.secPer60deg;
    return { ok: true, degPerS: stalled ? 0 : w0, rpm: stalled ? 0 : w0 / RPM_TO_DEG_PER_S, noLoadDegPerS: w0, stalled, loadSlows: true, reason: '' };
  }
  const rpm0 = noLoadRpmOf(spec);
  if (!(rpm0 > 0)) return bad('規格沒有無負載轉速');
  const k = Math.max(0, 1 - tau / stall);
  return { ok: true, degPerS: rpm0 * RPM_TO_DEG_PER_S * k, rpm: rpm0 * k, noLoadDegPerS: rpm0 * RPM_TO_DEG_PER_S, stalled, loadSlows: false, reason: '' };
}

/**
 * 在扭力 tauNmm 下的電流。需要失速電流；空載電流未知時 amps 為 null，只給下限（I0 = 0）與上限（失速電流）。
 * @returns {{amps:number|null, lowerA:number|null, upperA:number|null, reason:string}}
 */
export function currentAtTorque(spec, tauNmm) {
  const none = reason => ({ amps: null, lowerA: null, upperA: null, reason });
  const is = spec?.stallCurrentA, stall = spec?.stallTorqueNmm, tau = Math.abs(Number(tauNmm));
  if (!fin(is)) return none('規格沒有電流資料');
  if (!(stall > 0) || !fin(tau)) return none('失速扭力或需求扭力未知');
  const u = Math.min(1, tau / stall), i0 = spec.noLoadCurrentA;
  if (!fin(i0)) return { amps: null, lowerA: is * u, upperA: is, reason: '空載電流未知' };
  return { amps: i0 + (is - i0) * u, lowerA: i0 + (is - i0) * u, upperA: is, reason: '' };
}

/**
 * 沿扭力曲線估一段行程（result.samples 的 θ 範圍）的時間、峰值電流與是否做得完。
 * 時間 = ∫ dθ / ω(τ(θ))（梯形法）；有無解／未約束／奇異樣本或未計零件時保留曲線，但不估完整行程時間。
 * 最大需求 ≥ 失速扭力（cantFinish）時無法完成，timeS 為 null。
 * @returns {{ok:boolean, reason:string, kind, strokeDeg, timeS:number|null, noLoadTimeS:number|null, slowdown:number|null,
 *   cantFinish:boolean, peakNmm, peakRpm:number|null, noLoadRpm:number|null, loadSlows:boolean, current, gapSamples:number}}
 */
export function strokeEstimate(result, spec) {
  const fail = reason => ({ ok: false, reason, kind: spec?.kind ?? null, strokeDeg: null, timeS: null, noLoadTimeS: null, slowdown: null, cantFinish: false, peakNmm: null, peakRpm: null, noLoadRpm: null, loadSlows: false, current: null, gapSamples: 0 });
  if (!result?.ok || !result.summary || !result.samples?.length) return fail(result?.reason || '沒有扭力曲線');
  if (!spec) return fail('沒有規格');
  const gaps=result.samples.filter(s=>s.valid===false||!fin(s.torqueNmm)).length;
  if(result.complete===false||gaps||result.skipped?.length)return {...fail('範圍含無解／未約束／奇異姿態或未計零件，不能估整段完成時間。'),gapSamples:gaps};
  const peak = result.summary.maxAbsNmm, atPeak = speedAtTorque(spec, peak);
  if (!atPeak.ok) return fail(atPeak.reason);
  const samples = result.samples, strokeDeg = samples[samples.length - 1].theta - samples[0].theta;
  const w0 = atPeak.noLoadDegPerS, cantFinish = atPeak.stalled;
  const worst = atPeak.degPerS;
  let timeS = null, gapSamples = 0;
  if (!cantFinish) {
    const w = samples.map(s => (s.torqueNmm === null || !fin(s.torqueNmm) ? null : speedAtTorque(spec, s.torqueNmm).degPerS));
    gapSamples = w.filter(x => x === null).length;
    timeS = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = w[i - 1] ?? w[i] ?? worst, b = w[i] ?? w[i - 1] ?? worst;
      timeS += (samples[i].theta - samples[i - 1].theta) * (1 / a + 1 / b) / 2;
    }
  }
  const noLoadTimeS = strokeDeg / w0;
  return {
    ok: true, reason: '', kind: spec.kind, strokeDeg, timeS, noLoadTimeS, slowdown: timeS === null || noLoadTimeS===0 ? null : timeS / noLoadTimeS,
    cantFinish, peakNmm: peak, peakRpm: atPeak.rpm, noLoadRpm: w0 / RPM_TO_DEG_PER_S, loadSlows: atPeak.loadSlows,
    current: currentAtTorque(spec, peak), gapSamples
  };
}
