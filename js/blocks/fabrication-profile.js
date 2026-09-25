/** Versioned, JSON-safe fabrication settings. No browser state or DOM access. */

export const FABRICATION_VERSION = 1;

const freezeRecord = record => Object.freeze(record);

export const FABRICATION_DEFAULTS = Object.freeze({
  v: FABRICATION_VERSION,
  export: freezeRecord({
    // These match normalizeExportSettings({}) after the three preference loaders run.
    barWidthMm: 18,
    holeDiameterMm: 12.96,
    frameMarginMm: 18,
    frameHoleDiameterMm: 12.96,
    ttShaftFlatDiameterMm: 5.4,
    ttShaftFlatThicknessMm: 3.7,
  }),
  ttMount: freezeRecord({
    shaftDiameterMm: 6,
    screwDiameterMm: 3,
    screwOffsetXMm: -20.6,
    screwSpacingMm: 17.3,
    locatorDiameterMm: 4,
    locatorOffsetXMm: -11.18,
    locatorOffsetYMm: 0,
  }),
  mg995Mount: freezeRecord({
    bodyLengthMm: 41.2,
    bodyWidthMm: 20.2,
    shaftOffsetMm: 10,
    screwDiameterMm: 3.2,
    screwSpanMm: 49.5,
    screwSpacingMm: 10,
    cableNotchWidthMm: 8,
    cableNotchDepthMm: 4,
  }),
});

const RANGES = Object.freeze({
  export: freezeRecord({
    barWidthMm: [2, 120],
    holeDiameterMm: [0.5, 119],
    frameMarginMm: [8, 80],
    frameHoleDiameterMm: [0.5, 30],
    ttShaftFlatDiameterMm: [1, 30],
    ttShaftFlatThicknessMm: [0.5, 29.9],
  }),
  ttMount: freezeRecord({
    shaftDiameterMm: [0.5, 30],
    screwDiameterMm: [0.5, 20],
    screwOffsetXMm: [-120, 120],
    screwSpacingMm: [0, 80],
    locatorDiameterMm: [0.5, 20],
    locatorOffsetXMm: [-120, 120],
    locatorOffsetYMm: [-80, 80],
  }),
  mg995Mount: freezeRecord({
    bodyLengthMm: [20, 80],
    bodyWidthMm: [10, 40],
    shaftOffsetMm: [0, 40],
    screwDiameterMm: [0.5, 10],
    screwSpanMm: [20, 80],
    screwSpacingMm: [0, 30],
    cableNotchWidthMm: [0, 20],
    cableNotchDepthMm: [0, 20],
  }),
});

const GROUPS = Object.freeze(Object.keys(FABRICATION_DEFAULTS).filter(key => key !== 'v'));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cloneDefaults = () => ({
  v: FABRICATION_VERSION,
  export: { ...FABRICATION_DEFAULTS.export },
  ttMount: { ...FABRICATION_DEFAULTS.ttMount },
  mg995Mount: { ...FABRICATION_DEFAULTS.mg995Mount },
});
const roundHundredth = value => Math.round((value + Number.EPSILON) * 100) / 100;

function invalid(message, path = '') {
  return { ok: false, status: 'invalid', message, path };
}

function validateKnownValue(group, key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid(`${group}.${key} 必須是有限數字。`, `${group}.${key}`);
  }
  const [min, max] = RANGES[group][key];
  if (value < min || value > max) {
    return invalid(`${group}.${key} 必須介於 ${min}–${max} mm。`, `${group}.${key}`);
  }
  return { ok: true, value: roundHundredth(value) };
}

function validateCrossFields(profile) {
  if (profile.export.ttShaftFlatThicknessMm >= profile.export.ttShaftFlatDiameterMm) {
    return invalid('export.ttShaftFlatThicknessMm 必須小於 export.ttShaftFlatDiameterMm。',
      'export.ttShaftFlatThicknessMm');
  }
  return { ok: true };
}

/**
 * Normalize a fabrication profile.
 * Missing whole profile is explicit (`status: "missing"`) so loading code can
 * choose whether fixed defaults or a one-time local preference should apply.
 * A present v1 profile is completed from v1 defaults, with one warning per gap.
 */
export function normalizeFabricationProfile(raw) {
  if (raw === undefined) {
    return {
      ok: true,
      status: 'missing',
      profile: cloneDefaults(),
      warnings: ['作品未附 fabrication；載入端需決定採用固定預設或來源偏好。'],
    };
  }
  if (!isRecord(raw)) return invalid('fabrication 必須是物件。', 'fabrication');
  if (!own(raw, 'v') || raw.v !== FABRICATION_VERSION) {
    return invalid(`不支援的 fabrication 版本：${String(raw.v)}。`, 'fabrication.v');
  }

  const warnings = [];
  for (const key of Object.keys(raw)) {
    if (!['v', ...GROUPS].includes(key)) warnings.push(`忽略未知欄位 fabrication.${key}。`);
  }

  const profile = cloneDefaults();
  for (const group of GROUPS) {
    if (!own(raw, group)) {
      for (const key of Object.keys(FABRICATION_DEFAULTS[group])) {
        warnings.push(`缺少 fabrication.${group}.${key}，已使用 v1 固定預設。`);
      }
      continue;
    }
    const source = raw[group];
    if (!isRecord(source)) return invalid(`fabrication.${group} 必須是物件。`, `fabrication.${group}`);

    for (const key of Object.keys(source)) {
      if (!own(FABRICATION_DEFAULTS[group], key)) {
        warnings.push(`忽略未知欄位 fabrication.${group}.${key}。`);
      }
    }
    for (const key of Object.keys(FABRICATION_DEFAULTS[group])) {
      if (!own(source, key)) {
        warnings.push(`缺少 fabrication.${group}.${key}，已使用 v1 固定預設。`);
        continue;
      }
      const checked = validateKnownValue(group, key, source[key]);
      if (!checked.ok) return checked;
      profile[group][key] = checked.value;
    }
  }

  const cross = validateCrossFields(profile);
  if (!cross.ok) return cross;
  return { ok: true, status: 'present', profile, warnings };
}

/**
 * Plan an immutable single-field edit. `group` is export, ttMount, or
 * mg995Mount. Numeric edits require actual finite numbers; invalid edits are
 * rejected without clamping or changing the supplied profile.
 */
export function planFabricationProfile(current, group, key, rawValue) {
  const normalized = normalizeFabricationProfile(current);
  if (!normalized.ok) return normalized;
  if (!GROUPS.includes(group) || !own(FABRICATION_DEFAULTS[group], key)) {
    return invalid(`不支援的 fabrication 欄位 ${String(group)}.${String(key)}。`, `${group}.${key}`);
  }

  const checked = validateKnownValue(group, key, rawValue);
  if (!checked.ok) return checked;
  const profile = {
    v: FABRICATION_VERSION,
    export: { ...normalized.profile.export },
    ttMount: { ...normalized.profile.ttMount },
    mg995Mount: { ...normalized.profile.mg995Mount },
  };
  profile[group][key] = checked.value;

  const cross = validateCrossFields(profile);
  if (!cross.ok) return cross;
  return {
    ok: true,
    status: normalized.status,
    profile,
    warnings: [...normalized.warnings],
    changed: normalized.status === 'missing' || JSON.stringify(profile) !== JSON.stringify(normalized.profile),
  };
}
