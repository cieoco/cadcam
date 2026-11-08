/**
 * 動力規格表與判定門檻（docs/RESEARCH-ACTUATOR-TORQUE.md §2、§3.4）。
 * 內部一律用 N·mm；畫面可用 nmmToKgfcm 轉成 kgf·cm。
 * 數值是廠商標示（來源代號見報告「來源」）而非實測，measured:false；市售伺服多為仿製品，應實測後覆寫。
 */
export const KGFCM_TO_NMM = 98.0665;
export const kgfcmToNmm = v => v * KGFCM_TO_NMM;
export const nmmToKgfcm = v => v / KGFCM_TO_NMM;

const s = (id, label, kind, voltage, kgfcm, speed, extra) => Object.freeze({
  id, label, kind, voltage, stallTorqueNmm: kgfcmToNmm(kgfcm),
  secPer60deg: speed.sec ?? null, noLoadRpm: speed.rpm ?? null,
  stallCurrentA: extra.amp ?? null, noLoadCurrentA: extra.i0 ?? null,
  gearboxLimitNmm: extra.limit ? kgfcmToNmm(extra.limit) : null,
  massG: extra.mass ?? null, source: extra.src, note: extra.note || '', measured: false
});

export const ACTUATOR_SPECS = Object.freeze([
  s('MG995_4_8V', 'MG995 伺服 4.8 V', 'servo', 4.8, 8.5, { sec: 0.20 }, { src: '[1]', note: '另一份標示 9.4 kgf·cm [2]；預設取較低值' }),
  s('MG995_6V', 'MG995 伺服 6 V', 'servo', 6, 10, { sec: 0.16 }, { src: '[1]', note: '另一份標示 11 kgf·cm [2]' }),
  s('SG90_4_8V', 'SG90 伺服 4.8 V', 'servo', 4.8, 1.8, { sec: 0.10 }, { mass: 9, src: '[3]' }),
  s('TT_3V', 'TT 減速馬達 1:48 3 V', 'dc', 3, 0.4, { rpm: 90 }, { amp: 1.1, mass: 30.6, src: '[4]', note: '轉速標示 90、實測 120；電流為實測' }),
  s('TT_6V', 'TT 減速馬達 1:48 6 V', 'dc', 6, 0.8, { rpm: 200 }, { amp: 1.5, mass: 30.6, src: '[4]', note: '轉速標示 200、實測 250；電流為實測' }),
  s('N20_50_6V', 'N20 HP 50:1 6 V', 'dc', 6, 0.86, { rpm: 590 }, { amp: 1.6, limit: 2, src: '[5]' }),
  s('N20_100_6V', 'N20 HP 100:1 6 V', 'dc', 6, 1.7, { rpm: 310 }, { amp: 1.6, limit: 2, src: '[5][6]' }),
  s('N20_298_6V', 'N20 HP 298:1 6 V', 'dc', 6, 4.0, { rpm: 100 }, { amp: 1.6, limit: 2, src: '[5]', note: '標示扭力超過齒輪箱建議瞬間上限' })
]);

const DEFAULT_BY_MOTOR_TYPE = Object.freeze({ mg995: 'MG995_4_8V', tt: 'TT_6V', n20: 'N20_100_6V' });

/** 綠／黃上限（使用率）；超過黃上限為紅。直流 25%／50%（Pololu 20–30% 建議＋專案預設），伺服 1/3、2/3（專案預設）。 */
export const DEFAULT_THRESHOLDS = Object.freeze({ dc: Object.freeze([0.25, 0.5]), servo: Object.freeze([1 / 3, 2 / 3]) });

export const listActuatorSpecs = () => [...ACTUATOR_SPECS];
export const getActuatorSpec = id => ACTUATOR_SPECS.find(x => x.id === id) || null;
export const defaultSpecIdForMotorType = type => DEFAULT_BY_MOTOR_TYPE[type] || DEFAULT_BY_MOTOR_TYPE.tt;

/** 無負載轉速 rpm：直流直接取；伺服由 s／60° 換算（10 ÷ 秒）。 */
export const noLoadRpmOf = spec => spec?.noLoadRpm ?? (spec?.secPer60deg > 0 ? 10 / spec.secPer60deg : null);

const NUM_KEYS = ['stallTorqueNmm', 'noLoadRpm', 'secPer60deg', 'stallCurrentA', 'noLoadCurrentA', 'gearboxLimitNmm', 'massG'];

/**
 * 預設＋作品覆寫。override 只認有限數值（stallTorqueKgfcm 會換成 N·mm）與 label／note；
 * 任何被覆寫的數值欄位都把 measured 設為 override.measured（預設 true，代表使用者提供的實測值）。
 */
export function mergeActuatorSpec(base, override) {
  const spec = typeof base === 'string' ? getActuatorSpec(base) : base;
  if (!spec) return null;
  if (!override || typeof override !== 'object') return { ...spec };
  const out = { ...spec }; let touched = false;
  for (const k of NUM_KEYS) if (Number.isFinite(override[k]) && override[k] >= 0) { out[k] = override[k]; touched = true; }
  if (Number.isFinite(override.stallTorqueKgfcm) && override.stallTorqueKgfcm > 0) { out.stallTorqueNmm = kgfcmToNmm(override.stallTorqueKgfcm); touched = true; }
  if (typeof override.label === 'string' && override.label.trim()) out.label = override.label.trim().slice(0, 40);
  if (typeof override.note === 'string') out.note = override.note.slice(0, 120);
  if (touched) { out.measured = override.measured !== false; out.source = override.source || '作品覆寫'; }
  return out;
}

/** 判定門檻：override 可為 [綠上限, 黃上限]（0<綠<黃≤1），否則用 kind 預設。 */
export function thresholdsFor(spec, override) {
  if (Array.isArray(override) && override.length === 2 && override[0] > 0 && override[1] > override[0] && override[1] <= 1) return [override[0], override[1]];
  return [...DEFAULT_THRESHOLDS[spec?.kind === 'servo' ? 'servo' : 'dc']];
}
