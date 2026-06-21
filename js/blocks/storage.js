/**
 * blocks / storage
 *
 * 課堂閉環的存取層：把機構壓成 snapshot，支援
 *   - localStorage 自動存檔 / 還原（重新整理不掉作品）
 *   - 下載 / 開啟 .json 檔
 *   - 壓成分享連結（沿用 js/share-codec.js 的安全編解碼）
 *
 * snapshot 形狀（純資料、可被 share-codec 的白名單閘接受）：
 *   { kind:'blocks', v:1, counter, comps, params, tracePoint? }
 * comps 是 wizard 風格組件陣列、params 是長度等參數（topo.params），tracePoint 是選配軌跡點。
 */

import { encodeSnapshot, decodeShareString } from '../share-codec.js';
import { toSnapshot, normalizeSnapshot, highestIdNum } from './schema.js';

const AUTOSAVE_KEY = 'cadcam.blocks.autosave';

// ---- 純：序列化 / 還原 ----
export { toSnapshot, normalizeSnapshot, highestIdNum };

// 把外來物件正規化成 { comps, params, counter }，不合法回傳 null。
// ---- localStorage 自動存檔 ----
export function saveLocal(snapshot) {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot)); } catch (_) {}
}
export function loadLocal() {
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    return s ? JSON.parse(s) : null;
  } catch (_) { return null; }
}
export function clearLocal() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) {}
}

// ---- 檔案 ----
export function downloadJson(snapshot, filename) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'blocks.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- 分享連結 ----
export function buildShareUrl(snapshot) {
  const enc = encodeSnapshot(snapshot);        // base64url，URL 安全
  return location.origin + location.pathname + '#m=' + enc;
}

// 從目前網址 hash 讀回分享的 snapshot；沒有就回 null，內容可疑會丟錯。
export function readShareFromHash() {
  const h = location.hash || '';
  const m = h.match(/[#&]m=([^&]+)/);
  if (!m) return null;
  return decodeShareString(m[1]);              // 安全閘在這裡把關
}
