/**
 * blocks / grid-marks
 *
 * 孔格例外的呈現（docs/SDD-GRID-BLOCKS.md G2）：畫布標記、選取面板段落、製作包「孔格例外」一節，
 * 以及數字輸入新產生離格時的狀態列提示。判定本身在 grid-rule.js；本檔只負責把結果接到畫面。
 * 首次載入不需要：由 app.js 在 rebuild 後動態 import。結果在 rebuild（sync）時重算並快取，播放影格不重算。
 * 純函式（issueKey / markSpecs / newIssues / panelLines / buildPackSection）不碰 DOM，有 Node 測試。
 */
import { gridIssues, GRID_PITCH_MM } from './grid-rule.js';
import { partLabel } from './part-labels.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_TEXT = '例外';
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let issues = [];      // 目前作品的離格項目（快取）
let prevKeys = null;  // 上一次的項目 key 集合；null＝尚無基準（載入／復原後第一次不提示）

// 項目身分：同一零件同一規則同一處；偏差大小改變不算新項目。
export const issueKey = i => [i.componentId || `frame:${i.moduleId || ''}`, i.rule, i.subject, i.param || '', i.mateId || '', i.pointId || ''].join('|');

// 只回傳 next 中 prev 沒有的項目。
export function newIssues(prev, next) {
  const had = new Set((prev || []).map(issueKey));
  return (next || []).filter(i => !had.has(issueKey(i)));
}

const labelOf = (i, comps, modules) => i.type === 'frame' ? (i.moduleId ? `${partLabel(`${i.moduleId}-frame`, comps, modules)}` : '機架板') : partLabel(i.componentId, comps, modules);

// 「〇〇 離開 8 mm 孔格，已標示為例外」；多項時只點名第一項。
export function noticeText(list, comps, modules) {
  if (!list.length) return '';
  const first = list[0], name = `${labelOf(first, comps, modules)}（${first.subject}）`;
  return `${name}離開 ${GRID_PITCH_MM} mm 孔格，已標示為例外${list.length > 1 ? `（另有 ${list.length - 1} 項）` : ''}`;
}

// 標記位置：每個零件（或每個機架）一個標記，取該零件參考點（p1／p2／p3）在 pts 的平均位置。
// 回傳 [{ id, x, y, count, messages }]，x／y 為世界座標。
export function markSpecs(list, comps, pts) {
  const groups = new Map();
  for (const i of list) {
    const id = i.componentId || `frame:${i.moduleId || ''}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(i);
  }
  const out = [];
  for (const [id, items] of groups) {
    const refs = [];
    if (items[0].type === 'frame') {
      for (const it of items) if (it.pointId && pts[it.pointId]) refs.push(pts[it.pointId]);
    } else {
      const c = (comps || []).find(x => x.id === id);
      for (const k of ['p1', 'p2', 'p3']) if (c && c[k] && pts[c[k].id]) refs.push(pts[c[k].id]);
    }
    const ok = refs.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!ok.length) continue;
    out.push({ id, x: ok.reduce((s, p) => s + p.x, 0) / ok.length, y: ok.reduce((s, p) => s + p.y, 0) / ok.length, count: items.length, messages: items.map(i => i.message) });
  }
  return out;
}

// 選取面板段落的文字行；compId 為 ''（機架）時列出所有機架項目。
export function panelLines(list, compId, comps, modules) {
  return list.filter(i => compId === '' ? i.type === 'frame' : i.componentId === compId)
    .map(i => `${labelOf(i, comps, modules)}：${i.message}`);
}

// 製作包「孔格例外」一節（沒有離格項目回空字串）。
export function buildPackSection(list, comps, modules) {
  if (!list.length) return '';
  const rows = list.map(i => `<tr><td>${esc(labelOf(i, comps, modules))}</td><td>${esc(i.rule)} ${esc(i.subject)}</td><td>${esc(i.message)}</td></tr>`).join('');
  return `<h2 id="gridExceptions">孔格例外</h2>\n<p class="muted">下列孔位離開 ${GRID_PITCH_MM} mm 孔格，是設計者以數值輸入的例外；加工前請確認孔距。</p>\n<table data-grid-exceptions><thead><tr><th>零件</th><th>項目</th><th>說明</th></tr></thead><tbody>${rows}</tbody></table>\n\n`;
}
// 插入製作包 HTML（CNC 注意事項之前）；沒有例外時原樣回傳。
export function addGridToBuildPack(html, S) {
  const sec = buildPackSection(gridIssues(S.comps, S.topo?.params || {}), S.comps, S.modules);
  if (!sec) return html;
  const at = html.indexOf('<h2>CNC 注意事項</h2>');
  return at < 0 ? html.replace('</body>', `${sec}</body>`) : html.slice(0, at) + sec + html.slice(at);
}

/**
 * rebuild 後呼叫：重算並快取；quiet（載入／復原／換範例後第一次）只建立基準不提示。
 * 離格集合有變時呼叫 redraw（app 的 draw）重畫標記；回傳是否有變。
 */
export function sync(S, quiet, notify, redraw) {
  const next = gridIssues(S.comps, S.topo?.params || {});
  const nextKeys = new Set(next.map(issueKey));
  const added = quiet || !prevKeys ? [] : next.filter(i => !prevKeys.has(issueKey(i)));
  const changed = nextKeys.size !== (prevKeys?.size ?? 0) || [...nextKeys].some(k => !prevKeys?.has(k)) || next.length !== issues.length;
  issues = next; prevKeys = nextKeys;
  if (added.length && notify) notify(noticeText(added, S.comps, S.modules));
  syncPanel(S);
  if (changed) redraw?.();
  return changed;
}

export const currentIssues = () => issues;

// 畫布標記：不擋操作（pointer-events:none），每次 draw 重畫，位置取當下 pts。
let last = null;   // 最近一次 drawMarks 的參數；離格集合改變時只重畫標記，不整頁重畫（避免替換正在被點選的零件節點）
export const repaint = () => !!last && (drawMarks(...last), true);
export function drawMarks(S, svg, pts, TX, TY) {
  last = [S, svg, pts, TX, TY];
  svg.querySelectorAll('[data-grid-marks]').forEach(n => n.remove());
  syncPanel(S);
  if (!issues.length) return;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('data-grid-marks', ''); g.style.pointerEvents = 'none';
  // 固定螢幕字級：SVG 會隨視窗縮放，手機上 11 個 SVG 單位會小到看不見。
  const k = 1 / (svg.getScreenCTM?.()?.a || 1), px = v => (v * k).toFixed(1);
  for (const m of markSpecs(issues, S.comps, pts)) {
    const p = { x: TX(m.x), y: TY(m.y) }, t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('data-grid-exception', m.id);
    t.setAttribute('x', (p.x + 8 * k).toFixed(1)); t.setAttribute('y', (p.y - 8 * k).toFixed(1));
    t.setAttribute('font-size', px(12)); t.setAttribute('font-weight', '700'); t.setAttribute('fill', '#c2570c');
    t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', px(3)); t.setAttribute('paint-order', 'stroke');
    t.style.pointerEvents = 'none';
    const tip = document.createElementNS(SVG_NS, 'title'); tip.textContent = m.messages.join('\n');
    t.textContent = MARK_TEXT; t.appendChild(tip); g.appendChild(t);
  }
  svg.appendChild(g);
}

// 選取面板：選到的零件有離格項目時，在其編輯面板尾端加一小段（沒有就移除）。
export function syncPanel(S) {
  if (typeof document === 'undefined') return;
  const sel = S.selectedLinkId || S.selectedTriangleId || S.selectedGearId, frame = !sel && S.frameEditorOpen;
  const host = document.getElementById(S.selectedGearId && !S.selectedLinkId && !S.selectedTriangleId ? 'gearEditor' : sel ? 'lenEditor' : frame ? 'frameEditor' : '');
  let box = document.querySelector('[data-grid-panel]');
  const lines = host ? panelLines(issues, frame ? '' : sel, S.comps, S.modules) : [];
  if (!lines.length) { box?.remove(); return; }
  if (!box) { box = document.createElement('div'); box.setAttribute('data-grid-panel', ''); box.style.cssText = 'flex-basis:100%;font-size:12px;color:#c2570c;margin-top:4px'; }
  box.innerHTML = `<b>孔格例外</b>${lines.map(l => `<div>${esc(l)}</div>`).join('')}`;
  if (box.parentElement !== host) host.appendChild(box);
}
