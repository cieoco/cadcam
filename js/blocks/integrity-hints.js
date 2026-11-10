/**
 * blocks / integrity-hints  (pack C3 of docs/SDD-CONNECTION-INTEGRITY.md)
 *
 * 作品套用後（開檔、範例、分享連結、自動還原、整份作品的復原／重做）顯示一般性的檢查提示：一行說明加修復按鈕，
 * 完整說明收在「說明」裡。修復先成為候選，按下按鈕才經 app 一般的提交流程寫入（pushUndo、自動存檔、rebuild/draw），一次復原；
 * 提示顯示之後作品又被改過就拒絕，改為重新檢查。哪些檢查啟用見 integrity-repairs.js 的 ENABLED。按需載入。
 * 提示期間，相關零件在畫布上以橘色（要移動的）與藍色（對照的）標出；狀態列點名沒接的零件時也用同一個標示層（mark／unmark）。
 */
import {findings, workOf, sourceOf, fingerprint} from './integrity-repairs.js';
import {pointKeysFor} from './part-types.js';
import {looseEnds} from './status-text.js';

const MAX_SHOWN = 3, NS = 'http://www.w3.org/2000/svg';
const ORANGE = '#f97316', BLUE = '#2563eb';
let shown = {fp: '', items: []}, dismissed = '';
let marks = {hint: [], hover: []}, last = {}, observer = null;

// ---------------------------------------------------------------- canvas marks (same layer for hints and the status pill)
/** 把零件畫成粗外框疊在畫布上；groups: [{ids, color}]。重畫後（svg 被清空）由 observer 補回。 */
export function paintMarks(api, groups) {
  const {svg, project} = api;
  if (!svg || !project) return 0;
  svg.querySelector?.('[data-integrity-hint]')?.remove();
  let n = 0;
  const layer = document.createElementNS(NS, 'g');
  layer.dataset.integrityHint = ''; layer.style.pointerEvents = 'none';
  const pts = api.points?.() || {};
  for (const {ids, color} of groups) for (const id of ids) {
    const c = api.S.comps.find(c => c.id === id);
    if (!c) continue;
    const list = pointKeysFor(c).map(k => pts[c[k]?.id] || c[k]).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(project);
    if (!list.length) continue;
    const shape = document.createElementNS(NS, list.length > 2 ? 'polygon' : list.length === 2 ? 'polyline' : 'circle');
    shape.dataset.hintPart = id;
    const attrs = list.length > 1 ? {points: list.map(p => `${p.x},${p.y}`).join(' ')} : {cx: list[0].x, cy: list[0].y, r: 16};
    for (const [k, v] of Object.entries({...attrs, fill: 'none', stroke: color, 'stroke-opacity': .65, 'stroke-width': 10, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke'})) shape.setAttribute(k, v);
    layer.append(shape); n++;
  }
  svg.append(layer);
  return n;
}
function refreshMarks() {
  const groups = [...marks.hint, ...marks.hover], api = last;
  if (!api.svg) return;
  if (!groups.length) { api.svg.querySelector?.('[data-integrity-hint]')?.remove(); observer?.disconnect(); observer = null; return; }
  paintMarks(api, groups);
  if (!observer && typeof MutationObserver !== 'undefined')
    observer = new MutationObserver(() => { if (!api.svg.querySelector('[data-integrity-hint]')) paintMarks(last, [...marks.hint, ...marks.hover]); });
  observer?.observe(api.svg, {childList: true});
}

// ---------------------------------------------------------------- hint bar
function styleOnce() {
  if (document.getElementById('integrityHintStyle')) return;
  const st = document.createElement('style');
  st.id = 'integrityHintStyle';
  // 桌機：畫布左上、設計分頁與尺規之下的細長提示；手機與液壓版面：依序排在畫布上方，占版面而不蓋住零件。
  const flow = 'position:relative;top:auto!important;left:auto;margin:4px 8px;max-width:none;width:auto;box-shadow:none;flex:0 0 auto';
  st.textContent = '#integrityHint{position:absolute;left:12px;top:var(--ih-top,150px);z-index:4;box-sizing:border-box;max-width:min(760px,calc(100% - 24px));padding:6px 8px;background:#fff;color:#34495e;border:1px solid #f1c27d;border-left:4px solid #f97316;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.14);font-size:13px;line-height:1.45}'
    + '#integrityHint .ih-item{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}#integrityHint .ih-item+.ih-item{margin-top:6px}'
    + '#integrityHint .ih-short{flex:1 1 110px;font-weight:700;min-width:0}#integrityHint .ih-detail{flex:1 0 100%;margin:0;color:#4a5b6c}#integrityHint .ih-detail[hidden]{display:none}'
    + '#integrityHint .tool-btn{min-height:36px;padding:4px 10px;font-size:13px}#integrityHint .tool-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}#integrityHint .tool-btn.quiet{color:#6b7a8a}'
    + `@media (max-width:700px),(max-width:1099px) and (max-height:500px){#integrityHint{${flow}}#integrityHint .tool-btn{min-height:44px}}`
    + `.hydraulic-active #integrityHint{${flow}}`;
  document.head?.append(st);
}
function panel() {
  let el = document.getElementById('integrityHint');
  if (!el) {
    styleOnce();
    el = document.createElement('div');
    el.id = 'integrityHint'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', '作品檢查提示');
    el.style.display = 'none';
    document.getElementById('solveBanner')?.after(el);
  }
  return el;
}
function button(text, onclick, {label, cls = ''} = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = `tool-btn ${cls}`.trim(); b.textContent = text; b.setAttribute('aria-label', label || text); b.onclick = onclick;
  return b;
}
function place(el) {
  const top = document.querySelector?.('.canvas-top'), wrap = el.parentElement;
  if (top && wrap) el.style.setProperty('--ih-top', `${Math.round(top.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 34)}px`);
}

/** 重新檢查並更新（或隱藏）提示。回傳目前顯示的問題數。 */
export function check(api) {
  last = api;
  const el = panel(), work = workOf(api.S), items = findings(work), fp = fingerprint(work);
  shown = {fp, items};
  if (!items.length || dismissed === fp) { el.style.display = 'none'; el.replaceChildren(); marks.hint = []; refreshMarks(); return 0; }
  dismissed = '';
  const rows = [], visible = items.slice(0, MAX_SHOWN);
  visible.forEach((item, i) => {
    const row = document.createElement('div'); row.className = 'ih-item';
    const short = document.createElement('span'); short.className = 'ih-short'; short.textContent = item.short || item.text;
    const detail = document.createElement('p'); detail.className = 'ih-detail'; detail.hidden = true; detail.textContent = item.text;
    row.append(short);
    item.repairs.forEach((r, j) => row.append(button(r.label, () => repair(api, item, r), {cls: j ? '' : 'primary'})));
    const more = button('說明', () => { detail.hidden = !detail.hidden; more.setAttribute('aria-expanded', String(!detail.hidden)); }, {label: '說明：這項問題的完整解釋'});
    more.setAttribute('aria-expanded', 'false');
    row.append(more);
    if (!i) row.append(button('先不處理', () => { dismissed = fp; el.style.display = 'none'; marks.hint = []; refreshMarks(); }, {label: '先不處理，關閉這則作品檢查提示', cls: 'quiet'}));
    row.append(detail);
    rows.push(row);
  });
  if (items.length > MAX_SHOWN) { const p = document.createElement('p'); p.className = 'ih-detail'; p.textContent = `另外還有 ${items.length - MAX_SHOWN} 項，處理完以上幾項後會再顯示。`; rows.push(p); }
  el.replaceChildren(...rows);
  place(el);
  el.style.display = 'block';
  marks.hint = [{ids: visible.flatMap(i => i.mark?.far || []), color: ORANGE}, {ids: visible.flatMap(i => i.mark?.canon || []), color: BLUE}];
  refreshMarks();
  return items.length;
}

function repair(api, item, r) {
  const S = api.S;
  if (S.mode && S.mode !== 'design') { api.notify('請在設計模式修復作品。'); return false; }
  if (fingerprint(workOf(S)) !== shown.fp) { api.notify('作品在提示出現後已經改變，已重新檢查，請再確認一次。'); check(api); return false; }
  const plan = r.plan(sourceOf(S));
  if (!plan.ok) { api.notify(plan.message); return false; }
  api.pause?.(); api.pushUndo();
  S.comps = plan.comps;
  if (plan.params) S.topo.params = plan.params;
  if (plan.modules) S.modules = plan.modules;
  if (plan.topo) Object.assign(S.topo, plan.topo);
  api.rebuild(); api.draw(); api.save?.(); api.notify(plan.message);
  check(api);
  return true;
}

export function run(action, api) {
  if (action === 'check') return check(api);
  last = {...last, ...api};
  if (action === 'mark') {   // 狀態列點名「有一端沒接」的零件
    marks.hover = [{ids: looseEnds(api.comps || [], api.issue || {}).map(c => c.id), color: ORANGE}];
    refreshMarks(); return true;
  }
  if (action === 'unmark') { marks.hover = []; refreshMarks(); return true; }
  return false;
}
