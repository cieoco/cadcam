/**
 * blocks / dimension-ui
 *
 * 量尺的畫面與互動（第一次按「量尺」或開啟含量尺的作品時才動態載入）。
 * 計算在 dimensions.js；這裡只管：量測模式下的大型可點候選點、建立流程的大按鈕、
 * 製圖式標註（延伸線、箭頭、數字）、量尺卡片（名稱、目前、最小／最大）與端點拖曳。
 * D1 只量同一平面的設計模式；組立與跨平面量測尚未支援。
 */
import {S} from './state.js';
import * as View from './view.js';
import {openOverlapPicker} from './overlap-picker.js';
import {dimensionCandidates, dimensionBaselines, measureDimension, dimensionRange, resolveRef} from './dimensions.js';

const NS = 'http://www.w3.org/2000/svg';
const COLOR = '#c2185b';          // 量尺專用色（與量測綠、軌跡色區分）
const KIND_NAME = {distance: '距離', height: '高度', horizontal: '水平', displacement: '位移'};
const PICK_PX = 30, SNAP_PX = 36;  // 觸控點選／拖曳吸附半徑（畫面 px）
const OUT_OF_SCOPE = '量尺目前只量設計模式、同一個平面；組立與跨平面量測之後再做。';
const CSS = `
#dimPanel{box-sizing:border-box;position:absolute;left:12px;bottom:64px;width:292px;max-height:46%;overflow:auto;z-index:6;padding:8px;background:rgba(255,255,255,.97);border:1px solid #f0b7cf;border-radius:10px;box-shadow:0 6px 18px #0002;color:#7a1038;font-size:13px;line-height:1.4}
#dimPanel[hidden]{display:none}
@media (max-width:700px),(max-width:1099px) and (max-height:500px){#dimPanel{position:static;flex:0 0 auto;width:auto;max-height:34vh;margin:0 8px;z-index:auto}}
#dimPanel button,#dimPanel select,#dimPanel input{font:inherit;color:inherit}
#dimPanel .dim-head{display:flex;align-items:center;gap:6px;margin-bottom:4px}
#dimPanel .dim-head b{flex:1}
#dimPanel .dim-btn{min-height:44px;padding:6px 10px;border:1px solid #e9a3c2;border-radius:8px;background:#fff0f6;cursor:pointer}
#dimPanel .dim-big{min-height:56px;padding:4px;font-size:14px;font-weight:700;line-height:1.25}
#dimPanel .dim-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#dimPanel .dim-grid.four{grid-template-columns:repeat(4,1fr)}
#dimPanel.stepping{height:168px;max-height:none}
#dimPanel .dim-list{display:flex;flex-direction:column;gap:6px}
#dimPanel .dim-card{border:1px solid #f0c6d8;border-radius:8px;padding:6px 8px;background:#fff}
#dimPanel .dim-card.sel{border:2px solid ${COLOR};padding:5px 7px}
#dimPanel .dim-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
#dimPanel .dim-name{flex:1;min-width:0;min-height:36px;padding:2px 6px;border:1px solid #e7c3d3;border-radius:6px;background:#fff;font-weight:700}
#dimPanel .dim-now{font-size:16px;font-weight:800}
#dimPanel .dim-sub{color:#6b4a58;font-size:12px}
#dimPanel .dim-x{min-width:44px;min-height:44px}
#dimPanel .dim-note{color:#8a5a6c;font-size:12px}`;

const el = (tag, text, parent, cls) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  if (parent) parent.append(n);
  return n;
};
const svgEl = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.append(n);
  return n;
};
const fmt = v => Number.isFinite(v) ? (Math.abs(v) < 0.05 ? 0 : v).toFixed(1) : '—';
const inputText = (input, v) => input.kind === 'syringe' ? `伸出 ${fmt(v)} mm` : input.unit === 'mm' ? `${fmt(v)} mm` : `${Math.round(v)}°`;

export function createDimensionUI(h) {
  const svg = h.svg;
  document.head.append(Object.assign(document.createElement('style'), {textContent: CSS}));
  const panel = el('section');
  panel.id = 'dimPanel'; panel.hidden = true; panel.setAttribute('aria-label', '量尺');
  (svg.parentElement.querySelector('.controls') || svg).before(panel);

  let mode = null;            // {step:'first'|'kind'|'second'|'baseline', a, aLabel}
  let selected = null;        // 目前展開的量尺 id
  let layer = null, pts = {}, drag = null, tap = null, sig = '';
  const pointers = new Set(), rows = new Map(), cache = new Map();
  let rangeTimer = 0, lastRange = 0, quiet = 0;

  const cur = d => dims().find(x => x.id === d.id);   // 復原後物件會換新，編輯一律找現在這一份
  const dims = () => S.topo.dimensions || (S.topo.dimensions = []);
  const inDesign = () => S.mode === 'design';
  const kk = () => { const m = svg.getScreenCTM(); return m && m.a ? 1 / Math.abs(m.a) : 1; };   // 每個畫面 px 對應的 svg 單位
  const toClient = w => { const m = svg.getScreenCTM(); return m ? new DOMPoint(View.TX(w.x), View.TY(w.y)).matrixTransform(m) : {x: 0, y: 0}; };
  const comps = () => h.comps();
  const candidates = () => dimensionCandidates(comps(), S.topo.params, pts);
  const compIds = () => new Set(comps().flatMap(c => [c.id, c.p1?.id, c.p2?.id, c.p3?.id]).filter(Boolean));
  const inView = (d, ids) => [d.a, d.b].filter(Boolean).every(r => ids.has(r.pointId ?? r.compId)) &&
    (!d.baseline || d.baseline === 'ground' || ids.has(d.baseline.slice(2)));
  const refLabel = ref => candidates().find(c => JSON.stringify(c.ref) === JSON.stringify(ref))?.label || '所選的點';

  // ---------- 變更（都進復原與自動存檔）----------
  function commit(fn) { h.pushUndo(); fn(); h.save(); }
  function addDim(dim) {
    const used = new Set(dims().map(d => d.id));
    let n = 1; while (used.has(`d${n}`)) n++;
    const count = dims().filter(d => d.kind === dim.kind).length + 1;
    commit(() => dims().push({id: `d${n}`, name: `${KIND_NAME[dim.kind]} ${count}`, ...dim}));
    selected = `d${n}`; mode = null; cache.delete(selected); sig = '';
    h.draw();
  }

  // ---------- 量測與全行程範圍 ----------
  const motorKey = () => `${S.activeMotor}|${JSON.stringify(S.motorAngles)}`;
  function rangeOf(d) {
    const key = `${h.version()}|${motorKey()}|${JSON.stringify(d)}`, hit = cache.get(d.id);
    if (hit && hit.key === key) return hit.res;
    if (hit && (h.dragging() || Date.now() - lastRange < 300)) {   // 拖曳中、滑桿連續移動時先用舊值，停一下再重算
      if (!rangeTimer) rangeTimer = setTimeout(() => { rangeTimer = 0; h.draw(); }, 350);
      return hit.res;
    }
    let res;
    try { res = dimensionRange(d, h.scopeComps(), S.topo.params, {motorId: S.activeMotor, range: h.inputRange(), motorAngles: h.frozenAngles(), motion: h.motion()}); }
    catch (e) { res = {ok: false, message: `無法掃描：${e.message}`}; }
    cache.set(d.id, {key, res}); lastRange = Date.now();
    return res;
  }

  // ---------- 畫面標註 ----------
  const P = w => ({x: View.TX(w.x), y: View.TY(w.y)});
  function drawDim(g, d, m, isSel) {
    const k = kk(), A = P(m.from), B = P(m.to), dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const ux = len > 1e-6 ? dx / len : 1, uy = len > 1e-6 ? dy / len : 0;
    let nx, ny;
    if (m.kind === 'height') { nx = 1; ny = 0; }
    else if (m.kind === 'horizontal') { nx = 0; ny = 1; }
    else { nx = uy; ny = -ux; if (Math.abs(ny) < 0.3 ? nx < 0 : ny > 0) { nx = -nx; ny = -ny; } }   // 近垂直的標在右側，其餘標在上方
    const off = (isSel ? 34 : 28) * k, w = isSel ? 2 : 1.4 * 1;
    const stroke = {stroke: COLOR, 'stroke-width': w * k, fill: 'none'};
    const DA = {x: A.x + nx * off, y: A.y + ny * off}, DB = {x: B.x + nx * off, y: B.y + ny * off};
    const grp = svgEl('g', {'data-dim': d.id}, g);
    // 基準線（地面或經過固定點的線）
    if (m.base) {
      const far = 4000;
      if (m.base.kind === 'h') svgEl('line', {x1: -far, x2: far, y1: A.y, y2: A.y, ...stroke, 'stroke-width': 1 * k, 'stroke-dasharray': `${10 * k} ${3 * k} ${2 * k} ${3 * k}`, opacity: .55}, grp);
      else svgEl('line', {y1: -far, y2: far, x1: A.x, x2: A.x, ...stroke, 'stroke-width': 1 * k, 'stroke-dasharray': `${10 * k} ${3 * k} ${2 * k} ${3 * k}`, opacity: .55}, grp);
    }
    // 延伸線：從被量的點稍微留空，超出尺寸線一小段
    for (const [Q, D] of [[A, DA], [B, DB]]) {
      svgEl('line', {x1: Q.x + nx * 3 * k, y1: Q.y + ny * 3 * k, x2: D.x + nx * 6 * k, y2: D.y + ny * 6 * k, ...stroke, 'stroke-width': 1 * k}, grp);
    }
    // 尺寸線與箭頭（尺寸太短時箭頭畫在外側）
    const inner = len > 26 * k, tail = 12 * k;
    svgEl('line', {x1: DA.x - (inner ? 0 : ux * tail), y1: DA.y - (inner ? 0 : uy * tail), x2: DB.x + (inner ? 0 : ux * tail), y2: DB.y + (inner ? 0 : uy * tail), ...stroke}, grp);
    const arrow = (T, sx) => {
      const dir = sx * (inner ? 1 : -1), bx = T.x + ux * dir * 10 * k, by = T.y + uy * dir * 10 * k;
      svgEl('path', {d: `M${T.x} ${T.y} L${bx - uy * 3.6 * k} ${by + ux * 3.6 * k} L${bx + uy * 3.6 * k} ${by - ux * 3.6 * k} Z`, fill: COLOR}, grp);
    };
    arrow(DA, 1); arrow(DB, -1);
    // 數字：沿尺寸線、白色描邊讓它在機構上也看得清楚
    let ang = Math.atan2(uy, ux) * 180 / Math.PI;
    if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
    const mx = (DA.x + DB.x) / 2, my = (DA.y + DB.y) / 2;
    const text = svgEl('text', {transform: `translate(${mx} ${my}) rotate(${ang})`, y: -5 * k, 'text-anchor': 'middle', 'font-size': 14 * k, 'font-weight': 800, fill: COLOR,
      stroke: '#fff', 'stroke-width': 4 * k, 'paint-order': 'stroke', 'stroke-linejoin': 'round', style: 'pointer-events:all'}, grp);
    text.textContent = fmt(m.value);
    // 點尺寸線也能選取（透明粗線）
    svgEl('line', {x1: DA.x, y1: DA.y, x2: DB.x, y2: DB.y, stroke: 'transparent', 'stroke-width': 28 * k, style: 'pointer-events:stroke'}, grp);
    if (d.kind === 'displacement') {
      svgEl('path', {d: `M${A.x - 6 * k} ${A.y - 6 * k} L${A.x + 6 * k} ${A.y + 6 * k} M${A.x + 6 * k} ${A.y - 6 * k} L${A.x - 6 * k} ${A.y + 6 * k}`, ...stroke}, grp);
      const t = svgEl('text', {x: A.x + 8 * k, y: A.y + 16 * k, 'font-size': 11 * k, 'font-weight': 700, fill: COLOR, stroke: '#fff', 'stroke-width': 3 * k, 'paint-order': 'stroke'}, grp);
      t.textContent = '歸零';
    }
  }
  function drawTargets(g, list, ringRef) {
    const k = kk();
    for (const c of list) {
      const q = P(c), mine = ringRef && JSON.stringify(c.ref) === JSON.stringify(ringRef);
      svgEl('circle', {cx: q.x, cy: q.y, r: (mine ? 15 : 11) * k, fill: mine ? COLOR : '#fff', 'fill-opacity': mine ? .25 : .92, stroke: COLOR, 'stroke-width': (mine ? 3 : 2) * k}, g);
      const t = svgEl('text', {x: q.x + 12 * k, y: q.y - 10 * k, 'font-size': 11 * k, 'font-weight': 800, fill: COLOR, stroke: '#fff', 'stroke-width': 3 * k, 'paint-order': 'stroke'}, g);
      t.textContent = c.short;
    }
  }
  function paint(allPts) {
    pts = allPts || pts;
    if (!layer || !layer.isConnected) return;
    layer.replaceChildren();
    if (!inDesign()) { mode = null; panel.hidden = true; sig = ''; return; }
    const ids = compIds(), cs = comps(), k = kk();
    for (const d of dims()) {
      if (!inView(d, ids)) continue;
      const m = measureDimension(d, cs, S.topo.params, pts);
      if (m.ok) drawDim(layer, d, m, d.id === selected);
    }
    if (mode || drag) drawTargets(layer, candidates(), mode?.a);
    const sel = dims().find(d => d.id === selected);
    if (sel && !mode && inView(sel, ids)) {   // 選取中的量尺：端點可拖曳（會吸附到候選點）
      for (const which of ['a', 'b']) {
        const q = sel[which] && resolveRef(sel[which], cs, pts);
        if (!q) continue;
        const c = P(q);
        svgEl('circle', {cx: c.x, cy: c.y, r: 13 * k, fill: '#fff', 'fill-opacity': .5, stroke: COLOR, 'stroke-width': 2.5 * k, 'data-dim-handle': which, 'data-dim-id': sel.id, style: 'pointer-events:all;cursor:grab'}, layer);
      }
    }
    syncPanel();
  }

  // ---------- 面板 ----------
  function structure() {
    const ids = compIds();
    return JSON.stringify([mode && [mode.step, mode.kind, mode.a], selected, inDesign(), dims().map(d => [d.id, d.kind, d.baseline, inView(d, ids), d.zero])]);
  }
  function syncPanel() {
    const want = structure();
    if (want !== sig) { sig = want; buildPanel(); }
    updateValues();
  }
  function buildPanel() {
    rows.clear();
    panel.replaceChildren();
    const ids = compIds(), mine = dims().filter(d => inView(d, ids));
    panel.hidden = !inDesign() || (!mode && !mine.length);
    panel.classList.toggle('stepping', !!mode);
    if (panel.hidden) return;
    const head = el('div', null, panel, 'dim-head');
    el('b', '📏 量尺', head);
    if (mode) { el('button', '取消', head, 'dim-btn').onclick = cancel; }
    else el('button', '＋ 新量尺', head, 'dim-btn').onclick = () => start();
    if (mode) { buildSteps(); return; }
    const list = el('div', null, panel, 'dim-list');
    for (const d of mine) buildCard(list, d);
  }
  function buildSteps() {
    if (mode.step === 'first') {
      el('div', '點畫面上的孔或接點（也可點零件，會選最主要的點）。', panel, 'dim-note');
    } else if (mode.step === 'kind') {
      el('div', `第一點：${mode.aLabel}。要量什麼？`, panel, 'dim-note');
      const grid = el('div', null, panel, 'dim-grid four');
      const b = (text, fn) => { el('button', text, grid, 'dim-btn dim-big').onclick = fn; };
      b('量到另一點', () => { mode = {...mode, step: 'second'}; h.draw(); });
      b('到地面', () => addDim({kind: 'height', a: mode.a, baseline: 'ground'}));
      b('水平距離', () => { mode = {...mode, step: 'baseline'}; h.draw(); });
      b('歸零位移', () => { const q = resolveRef(mode.a, comps(), pts); if (q) addDim({kind: 'displacement', a: mode.a, zero: {x: q.x, y: q.y}}); });
    } else if (mode.step === 'second') {
      el('div', `第一點：${mode.aLabel}。再點第二個點。`, panel, 'dim-note');
    } else if (mode.step === 'baseline') {
      el('div', '選垂直基準線（量到它的水平距離）：', panel, 'dim-note');
      const grid = el('div', null, panel, 'dim-grid');
      for (const bl of dimensionBaselines(comps(), pts).filter(x => x.kind === 'v').slice(0, 8)) {
        el('button', bl.label, grid, 'dim-btn').onclick = () => addDim({kind: 'horizontal', a: mode.a, baseline: bl.id});
      }
      if (!grid.children.length) el('div', '這個機構沒有固定點可當垂直基準線。', panel, 'dim-note');
    }
  }
  function buildCard(list, d) {
    const isSel = d.id === selected, card = el('div', null, list, `dim-card${isSel ? ' sel' : ''}`);
    const row = el('div', null, card, 'dim-row');
    if (isSel) {
      const name = el('input', null, row, 'dim-name');
      name.value = d.name || ''; name.maxLength = 24; name.setAttribute('aria-label', '量尺名稱');
      name.onchange = () => commit(() => { const c = cur(d); if (c) c.name = name.value.trim().slice(0, 24); });
    } else el('b', d.name || KIND_NAME[d.kind], row).style.flex = '1';
    const now = el('span', null, row, 'dim-now');
    const del = el('button', '✕', row, 'dim-btn dim-x');
    del.setAttribute('aria-label', '刪除量尺');
    del.onclick = () => { commit(() => { S.topo.dimensions = dims().filter(x => x.id !== d.id); }); cache.delete(d.id); if (selected === d.id) selected = null; sig = ''; h.draw(); };
    const range = el('div', null, card, 'dim-sub');
    const extra = el('div', null, card, 'dim-sub');
    rows.set(d.id, {now, range, extra, d});
    card.addEventListener('click', e => { if (selected !== d.id && !e.target.closest('button')) { selected = d.id; sig = ''; h.draw(); } });
    if (!isSel) return;
    const tools = el('div', null, card, 'dim-row');
    if (d.kind === 'height' || d.kind === 'horizontal') {
      const sel = el('select', null, tools, 'dim-name');
      sel.setAttribute('aria-label', '基準線');
      const want = d.kind === 'height' ? 'h' : 'v';
      for (const bl of dimensionBaselines(comps(), pts).filter(x => x.kind === want)) sel.append(new Option(bl.label, bl.id, false, bl.id === d.baseline));
      sel.onchange = () => { commit(() => { const c = cur(d); if (c) c.baseline = sel.value; }); cache.delete(d.id); sig = ''; h.draw(); };
    }
    if (d.kind === 'displacement') {
      el('button', '重新歸零', tools, 'dim-btn').onclick = () => {
        const q = resolveRef(d.a, comps(), pts);
        if (q) { commit(() => { const c = cur(d); if (c) c.zero = {x: q.x, y: q.y}; }); cache.delete(d.id); h.draw(); }
      };
    }
    el('span', '拖曳圓圈可改量的點', tools, 'dim-note');
  }
  function updateValues() {
    const cs = comps();
    for (const {now, range, extra, d: old} of rows.values()) {
      const d = dims().find(x => x.id === old.id) || old;   // 復原後物件會換新，不能用建面板時的舊物件
      const m = measureDimension(d, cs, S.topo.params, pts);
      now.textContent = m.ok ? `目前 ${fmt(m.value)} mm` : '—';
      extra.textContent = m.ok && d.kind === 'displacement' ? `Δ左右 ${fmt(m.dx)} mm · Δ上下 ${fmt(m.dy)} mm` : m.ok ? '' : m.message;
      if (!m.ok) { range.textContent = ''; continue; }
      const r = rangeOf(d);
      if (!r) range.textContent = '計算全行程…';
      else if (!r.ok) range.textContent = r.message || '無法算出全行程';
      else range.textContent = `最小 ${fmt(r.min)}（${inputText(r.input, r.minAt)}）· 最大 ${fmt(r.max)}（${inputText(r.input, r.maxAt)}）${r.partial ? ' · 部分角度無解已略過' : ''}`;
    }
  }

  // ---------- 流程 ----------
  function cancel() { mode = null; sig = ''; h.draw(); }
  function start(pointId) {
    if (!inDesign()) { h.notify(OUT_OF_SCOPE); return; }
    if (!comps().length) { h.notify('先建立機構，再用量尺。'); return; }
    h.pause();
    pts = h.points() || pts;
    mode = {step: 'first'};
    if (pointId) {
      const c = candidates().find(x => x.ref.pointId === pointId);
      if (c) mode = {step: 'kind', a: c.ref, aLabel: c.label};
    }
    sig = ''; h.draw();
  }
  function pick(c) {
    if (!mode) return;
    if (mode.step === 'first') mode = {step: 'kind', a: c.ref, aLabel: c.label};
    else if (mode.step === 'second') {
      if (JSON.stringify(c.ref) === JSON.stringify(mode.a)) { h.notify('請點另一個點'); return; }
      addDim({kind: 'distance', a: mode.a, b: c.ref}); return;
    } else return;
    sig = ''; h.draw();
  }

  // ---------- 點選：最近候選點／零件上最主要的點／重疊選單 ----------
  function nearest(x, y, limit) {
    return candidates().map(c => { const q = toClient(c); return {c, d: Math.hypot(q.x - x, q.y - y)}; })
      .filter(o => o.d <= limit).sort((a, b) => a.d - b.d);
  }
  function partPoint(x, y) {
    for (const node of document.elementsFromPoint(x, y)) {
      const id = svg.contains(node) && node.getAttribute?.('data-pick-component');
      const comp = id && comps().find(c => c.id === id);
      if (!comp) continue;
      const mine = candidates().filter(c => c.compId === comp.id || [comp.p1, comp.p2, comp.p3].some(p => p?.id === c.ref.pointId));
      const tip = mine.find(c => c.kind === 'tip');
      if (tip) return tip;
      return mine.map(c => { const q = toClient(c); return {c, d: Math.hypot(q.x - x, q.y - y)}; }).sort((a, b) => a.d - b.d)[0]?.c || null;
    }
    return null;
  }
  function pickAt(x, y) {
    const near = nearest(x, y, PICK_PX);
    if (near.length === 1 || (near.length > 1 && near[1].d > near[0].d * 1.7 + 4)) return pick(near[0].c);
    if (near.length > 1) { openOverlapPicker(near.slice(0, 6).map(o => ({label: o.c.label, c: o.c})), item => pick(item.c)); return; }
    const part = partPoint(x, y);
    if (part) return pick(part);
    h.notify('點孔、接點或零件上的點');
  }

  // ---------- 指標（document 擷取：比畫布上的拖曳、選取處理更早）----------
  function inLayer(e) { return e.target?.closest?.('#dimLayer'); }
  document.addEventListener('pointerdown', e => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) { tap = null; return; }
    if (!inDesign() || !svg.contains(e.target) || (e.button !== undefined && e.button > 0)) return;
    const handle = e.target.closest?.('[data-dim-handle]');
    if (handle && !mode) {
      e.preventDefault(); e.stopPropagation();
      drag = {id: handle.getAttribute('data-dim-id'), which: handle.getAttribute('data-dim-handle'), moved: false};
      return;
    }
    if (mode) {
      if (mode.step !== 'first' && mode.step !== 'second') return;
      const swallow = nearest(e.clientX, e.clientY, PICK_PX).length || partPoint(e.clientX, e.clientY);
      if (!swallow) return;     // 空白處照常平移／縮放
      e.preventDefault(); e.stopPropagation();
      tap = {id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), kind: 'pick'};
      return;
    }
    const hit = inLayer(e) && e.target.closest('[data-dim]');
    if (hit) { e.preventDefault(); e.stopPropagation(); tap = {id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), kind: 'select', dim: hit.getAttribute('data-dim')}; }
  }, true);
  document.addEventListener('pointermove', e => {
    if (drag) {
      const near = nearest(e.clientX, e.clientY, SNAP_PX)[0];
      const d = dims().find(x => x.id === drag.id);
      if (!d || !near) { paint(pts); return; }
      if (!drag.moved) { h.pushUndo(); drag.moved = true; }   // 第一次真的移動才記一筆復原
      d[drag.which] = near.c.ref; cache.delete(d.id);
      paint(pts);
    } else if (tap && tap.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) tap = null;
  }, true);
  const release = e => {
    pointers.delete(e.pointerId);
    if (drag) {
      const moved = drag.moved; drag = null; quiet = Date.now() + 500;
      if (moved) h.save();
      sig = ''; h.draw();
      return;
    }
    if (!tap || tap.id !== e.pointerId) return;
    const t = tap; tap = null;
    if (e.type === 'pointercancel' || Date.now() - t.t > 800) return;
    quiet = Date.now() + 500;
    if (t.kind === 'pick') pickAt(t.x, t.y);
    else if (t.kind === 'select') { selected = selected === t.dim ? null : t.dim; sig = ''; h.draw(); }
  };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  // 點選後版面會變動；接著補發的 click 不能落到剛長出來的按鈕上
  document.addEventListener('click', e => { if (Date.now() < quiet) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mode) cancel(); });

  return {
    start,
    cancel,
    reset() { mode = null; selected = null; cache.clear(); sig = ''; },
    active: () => !!mode,
    // 每次重畫：把量尺層放在最上面，回傳播放時逐幀更新用的函式
    render(allPts) {
      layer = svgEl('g', {id: 'dimLayer'}, svg);
      layer.style.pointerEvents = 'none';
      paint(allPts);
      return p => paint(p);
    }
  };
}
