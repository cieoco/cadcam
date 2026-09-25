/**
 * 作品級加工與馬達安裝設定。
 * 舊 localStorage 僅在建立空作品／遷移舊本機自存時讀取；編輯後由作品 snapshot
 * 負責保存。S.fabrication 是唯一可變來源，舊 S.* 欄位只是既有面板的集中鏡像。
 */

import { S } from './state.js';
import * as Exporters from './exporters.js';
import { FABRICATION_DEFAULTS, normalizeFabricationProfile, planFabricationProfile } from './fabrication-profile.js';

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
let draw = () => {}, pushUndo = () => {}, pause = () => {}, scheduleAutosave = () => {}, notify = () => {};
let legacyLocalProfile = JSON.parse(JSON.stringify(FABRICATION_DEFAULTS));
let sourceLabel = '目前作品的加工設定';

export function init(deps) {
  if (deps.draw) draw = deps.draw;
  if (deps.pushUndo) pushUndo = deps.pushUndo;
  if (deps.pause) pause = deps.pause;
  if (deps.scheduleAutosave) scheduleAutosave = deps.scheduleAutosave;
  if (deps.notify) notify = deps.notify;
  document.querySelectorAll('[data-export-setting],[data-tt-mount-setting],[data-mg995-mount-setting],#frameMarginInput,#frameHoleInput')
    .forEach(input => input.addEventListener('keydown', handleFabricationKey));
}

export function exportSettings() {
  return { ...(S.fabrication?.export || FABRICATION_DEFAULTS.export) };
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
  return { ...(S.fabrication?.ttMount || FABRICATION_DEFAULTS.ttMount) };
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
  return { ...(S.fabrication?.mg995Mount || FABRICATION_DEFAULTS.mg995Mount) };
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
function syncSourceLabel() {
  document.querySelectorAll('[data-fabrication-source]').forEach(el => { el.textContent = sourceLabel; });
}
function applyLegacyMirrors(profile) {
  const e = profile.export, tt = profile.ttMount, mg = profile.mg995Mount;
  S.exportBarWidthMm = e.barWidthMm; S.exportHoleDiameterMm = e.holeDiameterMm;
  S.frameMarginMm = e.frameMarginMm; S.frameHoleDiameterMm = e.frameHoleDiameterMm;
  S.exportTtShaftFlatDiameterMm = e.ttShaftFlatDiameterMm; S.exportTtShaftFlatThicknessMm = e.ttShaftFlatThicknessMm;
  S.ttShaftDiameterMm = tt.shaftDiameterMm; S.ttScrewDiameterMm = tt.screwDiameterMm;
  S.ttScrewOffsetXMm = tt.screwOffsetXMm; S.ttScrewSpacingMm = tt.screwSpacingMm;
  S.ttLocatorDiameterMm = tt.locatorDiameterMm; S.ttLocatorOffsetXMm = tt.locatorOffsetXMm; S.ttLocatorOffsetYMm = tt.locatorOffsetYMm;
  applyMg995MountSettings(mg);
}
export function applyFabricationProfile(profile, { source = '目前作品的加工設定' } = {}) {
  const result = normalizeFabricationProfile(profile);
  if (!result.ok) return result;
  S.fabrication = result.profile;
  sourceLabel = source;
  applyLegacyMirrors(S.fabrication);
  syncExportSettingInputs(); syncTtMountSettingInputs(); syncMg995MountSettingInputs(); syncSourceLabel();
  return result;
}
export function defaultFabrication() { return JSON.parse(JSON.stringify(FABRICATION_DEFAULTS)); }
export function legacyLocalFabrication() { return JSON.parse(JSON.stringify(legacyLocalProfile)); }
export function syncFabricationInputs() {
  syncExportSettingInputs(); syncTtMountSettingInputs(); syncMg995MountSettingInputs(); syncSourceLabel();
}
export function loadExportSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(EXPORT_SETTINGS_KEY) || 'null'); } catch (_) {}
  const settings = Exporters.normalizeExportSettings(saved || {});
  legacyLocalProfile.export = { ...settings };
  applyFabricationProfile(legacyLocalProfile, { source: '新作品：已帶入此瀏覽器的舊加工偏好' });
}
export function loadTtMountSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TT_MOUNT_SETTINGS_KEY) || 'null'); } catch (_) {}
  const settings = normalizeTtMountSettings(saved || {});
  legacyLocalProfile.ttMount = { ...settings };
  applyFabricationProfile(legacyLocalProfile, { source: '新作品：已帶入此瀏覽器的舊加工偏好' });
}
export function loadMg995MountSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(MG995_MOUNT_SETTINGS_KEY) || 'null'); } catch (_) {}
  legacyLocalProfile.mg995Mount = normalizeMg995MountSettings(saved || {});
  applyFabricationProfile(legacyLocalProfile, { source: '新作品：已帶入此瀏覽器的舊加工偏好' });
}
function commit(group, key, value) {
  const raw = typeof value === 'string' ? value.trim() : value;
  const numeric = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw !== '' ? Number(raw) : Number.NaN);
  const result = planFabricationProfile(S.fabrication || FABRICATION_DEFAULTS, group, key, numeric);
  if (!result.ok) { notify(result.message); syncFabricationInputs(); return false; }
  if (!result.changed) { syncFabricationInputs(); return false; }
  pause(); pushUndo(); applyFabricationProfile(result.profile); scheduleAutosave(); draw(); return true;
}
export function setExportSetting(key, value) { return commit('export', key, value); }
export function setTtMountSetting(key, value) {
  return commit('ttMount', key, value);
}
export function setMg995MountSetting(key, value) {
  return commit('mg995Mount', key, value);
}
export function handleFabricationKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); syncFabricationInputs(); event.currentTarget?.blur(); }
  else if (event.key === 'Enter') { event.preventDefault(); event.currentTarget?.blur(); }
}
