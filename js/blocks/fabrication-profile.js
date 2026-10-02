/** Versioned, JSON-safe fabrication settings. No browser state or DOM access. */

export const FABRICATION_VERSION = 1;

const freezeRecord = record => Object.freeze(record);

export const FABRICATION_DEFAULTS = Object.freeze({
  v: FABRICATION_VERSION,
  export: freezeRecord({
    // These match normalizeExportSettings({}) after the three preference loaders run.
    barWidthMm: 18,
    // 使用者現場決定：關節一律 M3 螺絲＋防鬆螺帽，新作品預設 3.2
    holeDiameterMm: 3.2,
    frameMarginMm: 18,
    frameHoleDiameterMm: 3.2,
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
  // 使用者現場：3.175 mm（1/8 吋）銑刀、3 mm 木板；匯出時據此檢查孔徑／開口／尖角。
  cnc: freezeRecord({
    toolDiameterMm: 3.175,
    stockThicknessMm: 3,
  }),
  // 馬達帶動齒輪的鎖固孔：TT 用附的輪轂鎖兩顆螺絲、MG995 用圓舵盤鎖 N 顆螺絲。
  // 以下是常見值，請實量輪轂／舵盤後修改。
  drive: freezeRecord({
    ttHubCenterMm: 6,
    ttHubScrewMm: 3.2,
    ttHubScrewSpacingMm: 12,
    hornCenterMm: 6,
    hornScrewMm: 2.2,
    hornScrewCount: 4,
    hornScrewCircleMm: 14,
  }),
  // F1：直角接合件。預設用現成 M3 帶牙金屬角碼（13×9.5×7、厚 1.2、孔心離腳端 3.5）；
  // 規格存在作品裡，實量後可改，孔位、五金清單、3D 都引用這裡。
  joint: Object.freeze({
    defaultKind: 'bracket-m3',
    bracket: freezeRecord({
      widthMm: 7,
      thicknessMm: 1.2,
      longLegMm: 13,
      shortLegMm: 9.5,
      holeEndMm: 3.5,
    }),
  }),
});

// 直角接合件的種類與角碼規格範圍（joint 群組非全數字，另外處理）。
export const JOINT_KIND_IDS = Object.freeze(['bracket-m3', 'printed']);
const JOINT_RANGES = Object.freeze({
  widthMm: [3, 30],
  thicknessMm: [0.5, 5],
  longLegMm: [5, 60],
  shortLegMm: [5, 60],
  holeEndMm: [1.5, 20],
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
  cnc: freezeRecord({
    toolDiameterMm: [0.5, 12],
    stockThicknessMm: [0.5, 50],
  }),
  drive: freezeRecord({
    ttHubCenterMm: [1, 20],
    ttHubScrewMm: [0.5, 8],
    ttHubScrewSpacingMm: [0, 40],
    hornCenterMm: [0, 20],
    hornScrewMm: [0.5, 6],
    hornScrewCount: [0, 8],
    hornScrewCircleMm: [0, 40],
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
  cnc: { ...FABRICATION_DEFAULTS.cnc },
  drive: { ...FABRICATION_DEFAULTS.drive },
  joint: { defaultKind: FABRICATION_DEFAULTS.joint.defaultKind, bracket: { ...FABRICATION_DEFAULTS.joint.bracket } },
});
const cloneProfile = profile => ({
  v: FABRICATION_VERSION,
  export: { ...profile.export },
  ttMount: { ...profile.ttMount },
  mg995Mount: { ...profile.mg995Mount },
  cnc: { ...profile.cnc },
  drive: { ...profile.drive },
  joint: { defaultKind: profile.joint.defaultKind, bracket: { ...profile.joint.bracket } },
});
const roundHundredth = value => Math.round((value + Number.EPSILON) * 100) / 100;
const roundThousandth = value => Math.round((value + Number.EPSILON) * 1000) / 1000;

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
  if (group === 'drive' && key === 'hornScrewCount' && !Number.isInteger(value)) {
    return invalid('drive.hornScrewCount 必須是整數。', 'drive.hornScrewCount');
  }
  return { ok: true, value: group === 'cnc' ? roundThousandth(value) : roundHundredth(value) };
}

const clampTo = (value, [min, max]) => Math.min(max, Math.max(min, value));

// 角碼規格的整理：缺少、非有限數字、<=0 一律回預設；其餘夾進範圍；孔心離腳端必須小於兩腳長。
// 不合理的組合（孔端 >= 腳長）整組退回預設，不丟錯，因為舊檔或手改的檔都要能開。
function normalizeJointSettings(source) {
  const out = { defaultKind: FABRICATION_DEFAULTS.joint.defaultKind, bracket: { ...FABRICATION_DEFAULTS.joint.bracket } };
  if (!isRecord(source)) return out;
  if (JOINT_KIND_IDS.includes(source.defaultKind)) out.defaultKind = source.defaultKind;
  const raw = isRecord(source.bracket) ? source.bracket : {};
  for (const key of Object.keys(JOINT_RANGES)) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.bracket[key] = roundHundredth(clampTo(v, JOINT_RANGES[key]));
  }
  const b = out.bracket;
  if (!(b.holeEndMm < b.longLegMm && b.holeEndMm < b.shortLegMm)) {
    b.holeEndMm = FABRICATION_DEFAULTS.joint.bracket.holeEndMm;
    if (!(b.holeEndMm < b.longLegMm && b.holeEndMm < b.shortLegMm)) {
      b.longLegMm = FABRICATION_DEFAULTS.joint.bracket.longLegMm;
      b.shortLegMm = FABRICATION_DEFAULTS.joint.bracket.shortLegMm;
    }
  }
  return out;
}

// 單一 joint 欄位的編輯檢查（設定面板用）：defaultKind 必須是已知種類；角碼數字必須在範圍內、孔端小於兩腳。
function validateJointEdit(current, key, value) {
  if (key === 'defaultKind') {
    if (!JOINT_KIND_IDS.includes(value)) return invalid('joint.defaultKind 必須是 bracket-m3 或 printed。', 'joint.defaultKind');
    return { ok: true, value };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalid(`joint.bracket.${key} 必須是有限數字。`, `joint.bracket.${key}`);
  const [min, max] = JOINT_RANGES[key];
  if (value < min || value > max) return invalid(`joint.bracket.${key} 必須介於 ${min}–${max} mm。`, `joint.bracket.${key}`);
  const next = { ...current.bracket, [key]: roundHundredth(value) };
  if (!(next.holeEndMm < next.longLegMm && next.holeEndMm < next.shortLegMm)) {
    return invalid('角碼孔心離末端必須小於長邊與短邊。', `joint.bracket.${key}`);
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
  // 沒有 v 欄位的物件視為 v1（test/joint-profile.mjs 以 {} 與 { joint } 呼叫）；有 v 但不是 1 仍拒絕。
  if (own(raw, 'v') && raw.v !== FABRICATION_VERSION) {
    return invalid(`不支援的 fabrication 版本：${String(raw.v)}。`, 'fabrication.v');
  }

  const warnings = [];
  for (const key of Object.keys(raw)) {
    if (!['v', ...GROUPS].includes(key)) warnings.push(`忽略未知欄位 fabrication.${key}。`);
  }

  const profile = cloneDefaults();
  for (const group of GROUPS) {
    if (group === 'joint') {
      // F1：joint 靜默補預設（舊作品沒有），值不合理時回預設或夾進範圍，不拒絕載入。
      profile.joint = normalizeJointSettings(raw.joint);
      continue;
    }
    if (!own(raw, group)) {
      // 舊作品沒有 cnc／drive 群組：靜默補預設，不算缺漏。
      if (group === 'cnc' || group === 'drive') continue;
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
 * Plan an immutable single-field edit. `group` is export, ttMount,
 * mg995Mount, cnc, drive, or joint（joint 的 key 為 defaultKind 或角碼規格欄位）. Numeric edits require actual finite numbers; invalid edits are
 * rejected without clamping or changing the supplied profile.
 */
export function planFabricationProfile(current, group, key, rawValue) {
  const normalized = normalizeFabricationProfile(current);
  if (!normalized.ok) return normalized;
  const knownKey = group === 'joint' ? (key === 'defaultKind' || own(JOINT_RANGES, key)) : (GROUPS.includes(group) && own(FABRICATION_DEFAULTS[group], key));
  if (!GROUPS.includes(group) || !knownKey) {
    return invalid(`不支援的 fabrication 欄位 ${String(group)}.${String(key)}。`, `${group}.${key}`);
  }

  const profile = cloneProfile(normalized.profile);
  if (group === 'joint') {
    const checkedJoint = validateJointEdit(normalized.profile.joint, key, rawValue);
    if (!checkedJoint.ok) return checkedJoint;
    if (key === 'defaultKind') profile.joint.defaultKind = checkedJoint.value;
    else profile.joint.bracket[key] = checkedJoint.value;
  } else {
    const checked = validateKnownValue(group, key, rawValue);
    if (!checked.ok) return checked;
    profile[group][key] = checked.value;
  }

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
