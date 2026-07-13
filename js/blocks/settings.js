/**
 * 匯出與馬達安裝設定（localStorage 持久化）
 *   - 匯出設定：桿寬 / 連接孔 / TT 扁軸孔（沿用 exporters 的 normalizeExportSettings 白名單）
 *   - TT 馬達安裝孔位：軸孔 / 螺絲孔 / 定位孔
 *   - MG995 穿板式固定：開槽 / 耳孔 / 線槽缺口
 * 讀寫 S 上的對應欄位、同步 data-*-setting 表單欄位；改動安裝設定後呼叫注入的 draw() 重繪。
 */

import { S } from './state.js';
import * as Exporters from './exporters.js';

const EXPORT_SETTINGS_KEY = 'cadcam.blocks.exportSettings';
const TT_MOUNT_SETTINGS_KEY = 'cadcam.blocks.ttMountSettings.v7';
const TT_MOUNT_DEFAULTS = {
  shaftDiameterMm: 6,
  screwDiameterMm: 3,
  screwOffsetXMm: -20.6,
  screwSpacingMm: 17.3,
  locatorDiameterMm: 4,
  locatorOffsetXMm: -11.18,
  locatorOffsetYMm: 0
};
const MG995_MOUNT_SETTINGS_KEY = 'cadcam.blocks.mg995MountSettings.v1';
// MG995 穿板式固定（3mm 板）：本體 40.7×19.7 開槽各加 0.5 公差；
// 耳孔 M3 通孔＋螺帽，長向兩耳孔心距 49.5、每耳兩孔距 10；輸出軸心距槽近端 10。
// 線槽缺口開在機身尾端：出線口兼 180° 反裝防呆，設 0 則不開。
const MG995_MOUNT_DEFAULTS = {
  bodyLengthMm: 41.2,
  bodyWidthMm: 20.2,
  shaftOffsetMm: 10,
  screwDiameterMm: 3.2,
  screwSpanMm: 49.5,
  screwSpacingMm: 10,
  cableNotchWidthMm: 8,
  cableNotchDepthMm: 4
};

// ---- 綁定層注入（同 tools/input 慣例）----
let draw = () => {};

export function init(deps) {
  ({ draw } = deps);
}

export function exportSettings() {
  return Exporters.normalizeExportSettings({
    barWidthMm: S.exportBarWidthMm,
    holeDiameterMm: S.exportHoleDiameterMm,
    frameMarginMm: S.frameMarginMm,
    frameHoleDiameterMm: S.frameHoleDiameterMm,
    ttShaftFlatDiameterMm: S.exportTtShaftFlatDiameterMm,
    ttShaftFlatThicknessMm: S.exportTtShaftFlatThicknessMm
  });
}
function normalizeTtMountSettings(settings = {}) {
  const from = { ...TT_MOUNT_DEFAULTS, ...(settings || {}) };
  const clamp = (key, min, max) => {
    const v = Number(from[key]);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : TT_MOUNT_DEFAULTS[key];
  };
  return {
    shaftDiameterMm: Number(clamp('shaftDiameterMm', 0.5, 30).toFixed(2)),
    screwDiameterMm: Number(clamp('screwDiameterMm', 0.5, 20).toFixed(2)),
    screwOffsetXMm: Number(clamp('screwOffsetXMm', -120, 120).toFixed(2)),
    screwSpacingMm: Number(clamp('screwSpacingMm', 0, 80).toFixed(2)),
    locatorDiameterMm: Number(clamp('locatorDiameterMm', 0.5, 20).toFixed(2)),
    locatorOffsetXMm: Number(clamp('locatorOffsetXMm', -120, 120).toFixed(2)),
    locatorOffsetYMm: Number(clamp('locatorOffsetYMm', -80, 80).toFixed(2))
  };
}
export function ttMountSettings() {
  return normalizeTtMountSettings({
    shaftDiameterMm: S.ttShaftDiameterMm,
    screwDiameterMm: S.ttScrewDiameterMm,
    screwOffsetXMm: S.ttScrewOffsetXMm,
    screwSpacingMm: S.ttScrewSpacingMm,
    locatorDiameterMm: S.ttLocatorDiameterMm,
    locatorOffsetXMm: S.ttLocatorOffsetXMm,
    locatorOffsetYMm: S.ttLocatorOffsetYMm
  });
}
function normalizeMg995MountSettings(settings = {}) {
  const from = { ...MG995_MOUNT_DEFAULTS, ...(settings || {}) };
  const clamp = (key, min, max) => {
    const v = Number(from[key]);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : MG995_MOUNT_DEFAULTS[key];
  };
  return {
    bodyLengthMm: Number(clamp('bodyLengthMm', 20, 80).toFixed(2)),
    bodyWidthMm: Number(clamp('bodyWidthMm', 10, 40).toFixed(2)),
    shaftOffsetMm: Number(clamp('shaftOffsetMm', 0, 40).toFixed(2)),
    screwDiameterMm: Number(clamp('screwDiameterMm', 0.5, 10).toFixed(2)),
    screwSpanMm: Number(clamp('screwSpanMm', 20, 80).toFixed(2)),
    screwSpacingMm: Number(clamp('screwSpacingMm', 0, 30).toFixed(2)),
    cableNotchWidthMm: Number(clamp('cableNotchWidthMm', 0, 20).toFixed(2)),
    cableNotchDepthMm: Number(clamp('cableNotchDepthMm', 0, 20).toFixed(2))
  };
}
export function mg995MountSettings() {
  return normalizeMg995MountSettings({
    bodyLengthMm: S.mg995BodyLengthMm,
    bodyWidthMm: S.mg995BodyWidthMm,
    shaftOffsetMm: S.mg995ShaftOffsetMm,
    screwDiameterMm: S.mg995ScrewDiameterMm,
    screwSpanMm: S.mg995ScrewSpanMm,
    screwSpacingMm: S.mg995ScrewSpacingMm,
    cableNotchWidthMm: S.mg995CableNotchWidthMm,
    cableNotchDepthMm: S.mg995CableNotchDepthMm
  });
}
function applyMg995MountSettings(settings) {
  S.mg995BodyLengthMm = settings.bodyLengthMm;
  S.mg995BodyWidthMm = settings.bodyWidthMm;
  S.mg995ShaftOffsetMm = settings.shaftOffsetMm;
  S.mg995ScrewDiameterMm = settings.screwDiameterMm;
  S.mg995ScrewSpanMm = settings.screwSpanMm;
  S.mg995ScrewSpacingMm = settings.screwSpacingMm;
  S.mg995CableNotchWidthMm = settings.cableNotchWidthMm;
  S.mg995CableNotchDepthMm = settings.cableNotchDepthMm;
}
function syncExportSettingInputs() {
  const settings = exportSettings();
  Object.entries(settings).forEach(([key, value]) => {
    document.querySelectorAll(`[data-export-setting="${key}"]`).forEach(el => { el.value = value; });
  });
}
function syncTtMountSettingInputs() {
  const settings = ttMountSettings();
  Object.entries(settings).forEach(([key, value]) => {
    document.querySelectorAll(`[data-tt-mount-setting="${key}"]`).forEach(el => { el.value = value; });
  });
}
function syncMg995MountSettingInputs() {
  const settings = mg995MountSettings();
  Object.entries(settings).forEach(([key, value]) => {
    document.querySelectorAll(`[data-mg995-mount-setting="${key}"]`).forEach(el => { el.value = value; });
  });
}
export function loadExportSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(EXPORT_SETTINGS_KEY) || 'null'); } catch (_) {}
  const settings = Exporters.normalizeExportSettings(saved || {});
  S.exportBarWidthMm = settings.barWidthMm;
  S.exportHoleDiameterMm = settings.holeDiameterMm;
  S.frameMarginMm = settings.frameMarginMm;
  S.frameHoleDiameterMm = settings.frameHoleDiameterMm;
  S.exportTtShaftFlatDiameterMm = settings.ttShaftFlatDiameterMm;
  S.exportTtShaftFlatThicknessMm = settings.ttShaftFlatThicknessMm;
  syncExportSettingInputs();
}
export function loadTtMountSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TT_MOUNT_SETTINGS_KEY) || 'null'); } catch (_) {}
  const settings = normalizeTtMountSettings(saved || {});
  S.ttShaftDiameterMm = settings.shaftDiameterMm;
  S.ttScrewDiameterMm = settings.screwDiameterMm;
  S.ttScrewOffsetXMm = settings.screwOffsetXMm;
  S.ttScrewSpacingMm = settings.screwSpacingMm;
  S.ttLocatorDiameterMm = settings.locatorDiameterMm;
  S.ttLocatorOffsetXMm = settings.locatorOffsetXMm;
  S.ttLocatorOffsetYMm = settings.locatorOffsetYMm;
  syncTtMountSettingInputs();
}
export function loadMg995MountSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(MG995_MOUNT_SETTINGS_KEY) || 'null'); } catch (_) {}
  applyMg995MountSettings(normalizeMg995MountSettings(saved || {}));
  syncMg995MountSettingInputs();
}
export function setExportSetting(key, value) {
  if (key === 'barWidthMm') S.exportBarWidthMm = Number(value);
  if (key === 'holeDiameterMm') S.exportHoleDiameterMm = Number(value);
  if (key === 'frameMarginMm') S.frameMarginMm = Number(value);
  if (key === 'frameHoleDiameterMm') S.frameHoleDiameterMm = Number(value);
  if (key === 'ttShaftFlatDiameterMm') S.exportTtShaftFlatDiameterMm = Number(value);
  if (key === 'ttShaftFlatThicknessMm') S.exportTtShaftFlatThicknessMm = Number(value);
  const settings = exportSettings();
  S.exportBarWidthMm = settings.barWidthMm;
  S.exportHoleDiameterMm = settings.holeDiameterMm;
  S.frameMarginMm = settings.frameMarginMm;
  S.frameHoleDiameterMm = settings.frameHoleDiameterMm;
  S.exportTtShaftFlatDiameterMm = settings.ttShaftFlatDiameterMm;
  S.exportTtShaftFlatThicknessMm = settings.ttShaftFlatThicknessMm;
  try { localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  syncExportSettingInputs();
  draw();
}
export function setTtMountSetting(key, value) {
  const map = {
    shaftDiameterMm: 'ttShaftDiameterMm',
    screwDiameterMm: 'ttScrewDiameterMm',
    screwOffsetXMm: 'ttScrewOffsetXMm',
    screwSpacingMm: 'ttScrewSpacingMm',
    locatorDiameterMm: 'ttLocatorDiameterMm',
    locatorOffsetXMm: 'ttLocatorOffsetXMm',
    locatorOffsetYMm: 'ttLocatorOffsetYMm'
  };
  if (map[key]) S[map[key]] = Number(value);
  const settings = ttMountSettings();
  S.ttShaftDiameterMm = settings.shaftDiameterMm;
  S.ttScrewDiameterMm = settings.screwDiameterMm;
  S.ttScrewOffsetXMm = settings.screwOffsetXMm;
  S.ttScrewSpacingMm = settings.screwSpacingMm;
  S.ttLocatorDiameterMm = settings.locatorDiameterMm;
  S.ttLocatorOffsetXMm = settings.locatorOffsetXMm;
  S.ttLocatorOffsetYMm = settings.locatorOffsetYMm;
  try { localStorage.setItem(TT_MOUNT_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  syncTtMountSettingInputs();
  draw();
}
export function setMg995MountSetting(key, value) {
  const map = {
    bodyLengthMm: 'mg995BodyLengthMm',
    bodyWidthMm: 'mg995BodyWidthMm',
    shaftOffsetMm: 'mg995ShaftOffsetMm',
    screwDiameterMm: 'mg995ScrewDiameterMm',
    screwSpanMm: 'mg995ScrewSpanMm',
    screwSpacingMm: 'mg995ScrewSpacingMm',
    cableNotchWidthMm: 'mg995CableNotchWidthMm',
    cableNotchDepthMm: 'mg995CableNotchDepthMm'
  };
  if (map[key]) S[map[key]] = Number(value);
  const settings = mg995MountSettings();
  applyMg995MountSettings(settings);
  try { localStorage.setItem(MG995_MOUNT_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  syncMg995MountSettingInputs();
  draw();
}
