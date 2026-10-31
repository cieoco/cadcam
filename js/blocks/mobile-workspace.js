// 手機工作區保護：下方抽屜三段式、訊息走頂端訊息帶、置中只用看得到的區域。
// 純函式在前（Node 有測試）；後面是讀版面的小工具。抽屜手勢與搬移面板在 work-sheet.js（手機才載入）。
export const SHEET_STATES = ['collapsed', 'half', 'full'];
export const SHEET_QUERY = '(max-width:700px) and (orientation:portrait)';
const COLLAPSE = ['canvasTap', 'canvasDragStart', 'pinchStart', 'panStart', 'collapse'];
export function nextSheetState(state, event) {
  const i = Math.max(0, SHEET_STATES.indexOf(state));
  if (COLLAPSE.includes(event)) return 'collapsed';
  if (event === 'expand') return SHEET_STATES[Math.min(2, i + 1)];
  if (event === 'shrink') return SHEET_STATES[Math.max(0, i - 1)];
  if (event === 'openTab') return i ? state : 'half';   // 已展開時換分頁不改高度
  return SHEET_STATES[i];                                // selectPart 等：維持現狀，不自動撐開
}
// 工作區看得到的矩形：可視區扣掉頂端列、抽屜與播放列；全被遮住時高度為 0。
export function visibleWorkRect(viewport, {top = 0, sheet = 0, playBar = 0} = {}) {
  return {x: 0, y: top, width: viewport.width, height: Math.max(0, viewport.height - top - sheet - playBar)};
}
// 訊息放哪裡：一般訊息在頂端訊息帶（點擊穿透、幾秒後消失）；錯誤留在狀態提示；只有要確認的才用對話框。
export function messagePlacement(kind) {
  if (kind === 'error') return {lane: 'status', passThrough: true, ttlMs: 0};
  if (kind === 'confirm') return {lane: 'dialog', passThrough: false, ttlMs: 0};
  return {lane: 'top', passThrough: true, ttlMs: kind === 'warn' ? 5000 : 3500};
}
export const sheetMode = () => matchMedia(SHEET_QUERY).matches && document.body.dataset.mode !== 'bench';
export const sheetState = () => document.body.dataset.sheet || 'collapsed';
export function setSheet(state) {
  if (!SHEET_STATES.includes(state) || sheetState() === state) return;
  document.body.dataset.sheet = state;
  document.dispatchEvent(new CustomEvent('sheetchange', {detail: state}));
}
// 畫布上看得到的區域（畫面 px）：svg 扣掉抽屜與播放列；非手機版面或被完全遮住時 null（沿用整個畫布）
function visibleClient(svg) {
  const sheet = document.getElementById('workSheet');
  if (!sheet || !sheetMode()) return null;
  const s = svg.getBoundingClientRect(), a = sheet.getBoundingClientRect(), c = document.querySelector('.controls')?.getBoundingClientRect();
  const r = visibleWorkRect({width: s.width, height: s.height}, {sheet: Math.max(0, s.bottom - a.top), playBar: c?.height ? Math.max(0, a.top - c.top) : 0});
  return r.height ? {x: s.left, y: s.top, width: r.width, height: r.height} : null;
}
export function visibleUserRect(svg) {   // 同上，換成 svg 座標（給 View.fit）
  const r = visibleClient(svg), m = svg.getScreenCTM();
  if (!r || !m) return null;
  const i = m.inverse(), p = new DOMPoint(r.x, r.y).matrixTransform(i), q = new DOMPoint(r.x + r.width, r.y + r.height).matrixTransform(i);
  return {x: p.x, y: p.y, width: q.x - p.x, height: q.y - p.y};
}
// 置中後再量實際畫出來的外框（含馬達外殼等不在接點範圍內的部分）：超出看得到的區域就縮小並移到正中
export function settleInside(svg, view) {
  const a = visibleClient(svg);
  if (!a) return false;
  let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
  for (const el of svg.children) {
    const b = el.getBoundingClientRect();
    if ((!b.width && !b.height) || el.id === 'dimLayer' || el.style.pointerEvents === 'none' || el.getAttribute('pointer-events') === 'none') continue;
    L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom);
  }
  if (R <= L || (L >= a.x && R <= a.x + a.width && T >= a.y && B <= a.y + a.height)) return false;
  const cx = (L + R) / 2, cy = (T + B) / 2;
  view.zoomAt(svg, cx, cy, Math.min(1, (a.width - 16) / (R - L), (a.height - 16) / (B - T)));
  view.panByClient(svg, a.x + a.width / 2 - cx, a.y + a.height / 2 - cy);
  return true;
}
