/**
 * blocks / work-sheet
 *
 * 手機（直立）工作區保護的畫面部分，首次在手機版面才載入：
 *  - 下方三段式抽屜（收合／半開／全開）：把新增面板、調整、視圖、專案、選取後的編輯面板、量尺卡、
 *    工作範圍卡與任務卡搬進同一個可捲動的抽屜；收合時只剩分頁列＋一行摘要（選了零件就是精簡列）。
 *  - 點空白處、拖曳、平移、雙指縮放：抽屜收合；點零件不改高度。
 *  - 一般訊息走頂端訊息帶（點擊穿透）；錯誤收進播放列的狀態圓點，點一下展開。
 * 版面離開手機直立（桌機、橫放、組立模式）時，所有搬動過的節點放回原位，桌機版面不變。
 * 狀態文字與三段規則在 mobile-workspace.js（純函式，有 Node 測試）。
 */
import {SHEET_QUERY, nextSheetState, setSheet, sheetState, sheetMode} from './mobile-workspace.js';
import {S} from './state.js';
import {dimensionSummaryText} from './dimensions.js';
import * as View from './view.js';

const $ = id => document.getElementById(id);
const homes = new Map();   // 節點 → 原位置的占位註解
const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const TAB_HINT = {
  build: '新增：連桿、板件、馬達、模組…', edit: '調整：點零件改尺寸，點孔調整固定',
  view: '視圖：置中、3D、量尺、尺規', project: '專案：存檔、開啟、範例、輸出'
};

function put(node, parent, {first = false} = {}) {
  if (!node || !parent || node.parentElement === parent) return;
  if (!homes.has(node)) { const mark = document.createComment(node.id || node.className); node.before(mark); homes.set(node, mark); }
  first ? parent.prepend(node) : parent.append(node);
}
function giveBack() {
  for (const [node, mark] of homes) { if (mark.isConnected) mark.replaceWith(node); }
  homes.clear();
}
function layoutIn() {
  const body = $('sheetBody'), wrap = $('stageSvg').parentElement, lane = $('messageLane'), bar = document.querySelector('.controls');
  const cards = ['dimPanel', 'workRangeCard', 'exampleLessonCard'].map($).filter(Boolean);
  cards.forEach(c => put(c, body));
  put(document.querySelector('.part-palette'), body);
  put(document.querySelector('.mobile-panel'), body);
  wrap.querySelectorAll(':scope > .inspector-panel').forEach(p => put(p, body));
  ['modeBanner', 'viewPlaneHint'].forEach(id => put($(id), lane));
  if (lane.nextElementSibling !== $('stageSvg')) $('stageSvg').before(lane);   // 液壓頁的控制列在畫布上方：訊息帶緊貼畫布，不蓋住控制列
  put($('mechanismStatus'), bar);
  refresh();
}
function sync() {
  if (sheetMode()) layoutIn(); else giveBack();
}

// ---------- 摘要列 ----------
function selectionSummary(panel) {
  if(panel.id==='syringeEditor')return '針筒：拖固定環移位置';
  const disk=panel.querySelector('#diskDimensions');
  if(disk&&!disk.hidden)return `圓盤：外徑 ${disk.querySelector('input').value} mm・孔距 ${panel.querySelector('#memberDimensionInput').value} mm`;
  if(panel.id==='gearEditor')return `齒輪：${txt(panel.querySelector('#gearTeethVal'))} 齒`;
  const title = txt(panel.querySelector('#lenTitle,.re-title,.se-title,.fe-title'));
  const label = txt(panel.querySelector('#memberDimensionLabel'));
  const input = [...panel.querySelectorAll('input')].find(i => i.type === 'number' && i.value !== '' && shown(i) && !i.closest('details:not([open])'));
  let value = input ? `${input.value} mm` : txt(panel.querySelector('.le-value,.re-status'));
  if (/^[\d.]+$/.test(value)) value += ' mm';
  return [title.replace(/^\p{Extended_Pictographic}️?\s*/u, ''), [label, value].filter(Boolean).join(' ')].filter(Boolean).join('：');
}
function summary() {
  const panel = [...document.querySelectorAll('#sheetBody > .inspector-panel')].find(shown);
  if (panel) return {text: selectionSummary(panel), part: true};
  const dim = $('dimPanel');
  if (shown(dim)) {
    const card = dim.querySelector('.dim-card.sel') || dim.querySelector('.dim-card');
    const now = card?.querySelector('.dim-now');
    const row = card && dimensionSummaryText({name: card.querySelector('input.dim-name')?.value || txt(card.querySelector('b')), value: now?.dataset.value ? Number(now.dataset.value) : null});
    return {text: `📏 量尺：${(dim.classList.contains('stepping') ? txt(dim.querySelector('.dim-note')) : row) || '點「＋ 新量尺」'}`};
  }
  const range = $('workRangeCard');
  if (shown(range)) return {text: `${txt($('workRangeValue'))} · ${txt($('workRangeDetail'))}`};
  const task = $('exampleLessonCard');
  if (shown(task) && task.classList.contains('workflow-active')) return {text: txt(task.querySelector('.lesson-card-title:not([style*="none"])')) || '任務'};
  return {text: TAB_HINT[document.body.dataset.mobilePanel || 'build']};
}
let queued = 0;
function refresh() {
  if (queued) return;
  queued = requestAnimationFrame(() => {
    queued = 0;
    if (!sheetMode()) return;
    const s = summary(), state = sheetState();
    $('sheetSummary').textContent = s.text;
    $('sheetMore').textContent = state === 'full' ? '▼' : s.part && state === 'collapsed' ? '更多 ▲' : '▲';
    $('sheetBar').setAttribute('aria-expanded', String(state !== 'collapsed'));
    document.body.dataset.sheetPart = s.part ? '1' : '';
  });
}

// ---------- 抽屜手勢 ----------
const go = event => setSheet(nextSheetState(sheetState(), event));
function barGestures() {
  const bar = $('sheetBar');
  let drag = null;
  bar.addEventListener('pointerdown', e => { drag = {id: e.pointerId, y: e.clientY, moved: false}; try { bar.setPointerCapture(e.pointerId); } catch (_) {} });
  bar.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || Math.abs(e.clientY - drag.y) < 28) return;
    drag.moved = true; go(e.clientY < drag.y ? 'expand' : 'shrink'); drag.y = e.clientY;   // 一段一段拉
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = !drag.moved && e.type === 'pointerup'; drag = null;
    if (tap) go(sheetState() === 'full' ? 'shrink' : 'expand');
  };
  bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  bar.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(sheetState() === 'full' ? 'shrink' : 'expand'); }
    else if (e.key === 'Escape') go('collapse');
  });
}
const PART = '[data-id],[data-motor-hit],[data-pick-component],[data-link-id],[data-dimension-handle]';
function canvasGestures() {
  const svg = $('stageSvg'), down = new Map();
  const inSvg = e => svg.contains(e.target) && sheetMode();
  document.addEventListener('pointerdown', e => {
    if (!inSvg(e)) return;
    $('mechanismDetails')?.hidePopover();
    down.set(e.pointerId, {x: e.clientX, y: e.clientY, part: !!e.target.closest?.(PART), dimension:!!e.target.closest?.('[data-dimension-handle]'), moved: false});
    if (down.size > 1) go('pinchStart');
  }, true);
  document.addEventListener('pointermove', e => {
    const d = down.get(e.pointerId);
    if (!d || d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    d.moved = true;
    if(!d.dimension)go('canvasDragStart'); // 尺寸把手需保留同步數字，也避免中途改變畫布座標。
  }, true);
  const up = e => {
    const d = down.get(e.pointerId); down.delete(e.pointerId);
    if (d && !d.moved && !d.part && e.type === 'pointerup') go('canvasTap');
  };
  document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  svg.addEventListener('wheel', () => go('panStart'), {passive: true, capture: true});
}
function tabGestures() {
  // 點下方分頁：收合時開半開；已展開就維持高度（收合靠點畫布、往下拉或收合鈕）
  document.querySelector('.mobile-tabs').addEventListener('click', e => {
    if (e.target.closest('.mobile-tab') && sheetMode()) { go('openTab'); refresh(); }
  });
}

// 全開＝全部展開：把抽屜裡收著的細節（外形、更多調整、分類）打開；離開全開時只收回這次打開的
function openAll() {
  const state = sheetState(), body = $('sheetBody');
  if (state === 'full') body.querySelectorAll('details:not([open])').forEach(d => { d.open = true; d.dataset.sheetOpened = '1'; });
  else body.querySelectorAll('details[data-sheet-opened]').forEach(d => { d.open = false; delete d.dataset.sheetOpened; });
  // 展開新增面板時，常用零件要看得到（載入範例後工具是收著的）
  if (state !== 'collapsed' && (document.body.dataset.mobilePanel || 'build') === 'build') $('creationTools').open = true;
}

// 展開抽屜後，選取的零件若被蓋住就把畫面往上移，讓它留在看得到的區域（只移動畫面，不改作品）
function reveal() {
  if (sheetState() === 'collapsed' || !sheetMode()) return;
  const id = S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId || S.selectedGearId || S.selectedNodeId;
  const part = id && [...document.querySelectorAll('#stageSvg [data-link-id],#stageSvg [data-pick-component],#stageSvg circle[data-id]')].filter(e => (e.dataset.linkId || e.dataset.pickComponent || e.dataset.id) === id)
    .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  if (!part) return;
  const b = part.getBoundingClientRect(), limit = Math.min($('workSheet').getBoundingClientRect().top, document.querySelector('.controls').getBoundingClientRect().top) - 10;
  const top = $('stageSvg').getBoundingClientRect().top + 8;
  const dy = b.bottom > limit ? Math.max(limit - b.bottom, top - b.top) : 0;   // 往上移，但不超過畫布頂端
  if (dy < -1) { View.panByClient($('stageSvg'), 0, dy); window.blocks.draw(); }
}

// ---------- 啟動 ----------
function watch() {
  const body = $('sheetBody');
  new MutationObserver(refresh).observe(body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden']});
  // 量尺卡、之後才建立的面板：出現就收進抽屜；量尺要選種類時自動半開，才看得到按鈕
  new MutationObserver(() => { if (sheetMode()) layoutIn(); }).observe($('stageSvg').parentElement, {childList: true});
  new MutationObserver(() => {
    const dim = $('dimPanel');
    if (!sheetMode() || !shown(dim) || !dim.classList.contains('stepping')) return;
    // 量尺選點時讓出畫布；要選種類（按鈕）時才半開
    if (dim.querySelector('.dim-grid')) { if (sheetState() === 'collapsed') setSheet('half'); } else setSheet('collapsed');
  }).observe(body, {subtree: true, childList: true});
  new MutationObserver(() => { sync(); refresh(); }).observe(document.body, {attributes: true, attributeFilter: ['data-mode', 'data-mobile-panel', 'data-mobile-editor']});
  matchMedia(SHEET_QUERY).addEventListener('change', () => { sync(); refresh(); });
  document.addEventListener('sheetchange', () => {
    refresh(); reveal(); openAll();
    if (shown($('view3d'))) window.dispatchEvent(new Event('resize'));   // 3D 預覽跟著抽屜高度重算
  });
  body.addEventListener('click', e => {
    if (e.target.closest('.mobile-editor-done')) setSheet('collapsed');
    // 開始畫桿／放馬達等：抽屜讓出畫布
    else if (e.target.closest('.part-palette .block')) setTimeout(() => { if (!$('cancelCreation').hidden) go('collapse'); }, 0);
  });
}
function start() {
  barGestures(); canvasGestures(); tabGestures(); watch();
  sync(); refresh();
}
start();
