/**
 * blocks / storage
 *
 * 課堂閉環的存取層：把機構壓成 snapshot，支援
 *   - localStorage 自動存檔 / 還原（重新整理不掉作品）
 *   - 下載 / 開啟 .json 檔
 *   - 壓成分享連結（沿用 js/share-codec.js 的安全編解碼）
 *
 * snapshot 形狀（純資料、可被 share-codec 的白名單閘接受）：
 *   { kind:'blocks', v:1, counter, comps, params }
 * comps 是 wizard 風格組件陣列、params 是長度等參數（topo.params）。
 */

import { encodeSnapshot, decodeShareString } from '../share-codec.js';

const AUTOSAVE_KEY = 'cadcam.blocks.autosave';

// ---- 純：序列化 / 還原 ----
export function toSnapshot(comps, topo, counter) {
  return {
    kind: 'blocks',
    v: 1,
    counter: Number(counter) || 0,
    comps: comps || [],
    params: (topo && topo.params) ? topo.params : {},
  };
}

// 把外來物件正規化成 { comps, params, counter }，不合法回傳 null。
export function normalizeSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const comps = Array.isArray(obj.comps) ? obj.comps : null;
  if (!comps) return null;
  const params = (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) ? obj.params : {};
  return { comps, params, counter: Number(obj.counter) || 0 };
}

// 掃出所有 id 尾端數字的最大值，避免還原後新增零件時 id 撞號。
export function highestIdNum(comps) {
  let max = 0;
  const scan = (s) => {
    if (typeof s !== 'string') return;
    const m = s.match(/(\d+)/g);
    if (m) m.forEach(n => { const v = Number(n); if (v > max) max = v; });
  };
  (comps || []).forEach(c => {
    scan(c.id);
    ['p1', 'p2', 'p3'].forEach(k => { if (c[k]) scan(c[k].id); });
  });
  return max;
}

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
