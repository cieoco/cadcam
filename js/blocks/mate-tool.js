/**
 * blocks / mate-tool
 *
 * 設計分頁的「接合面」工具（SDD-MATE-FACES §5.1，M2）：在 2D 舞台上畫出可標的邊、已標的承接面與四個安裝方向箭頭，
 * 點一下就標記／改安裝方向。幾何來自 mates-view.js（純函式）；資料操作來自 mates.js；這裡只做 DOM、點擊與一筆復原。
 *
 * 啟動後舞台的指標輸入只剩「點接合面目標」與「平移／縮放」：svg 的 capture 階段先接手 pointerdown 並擋住冒泡，
 * 節點拖曳、選取零件、畫圖都收不到（雙指縮放的帳本與滾輪縮放照舊）。input.js 的手機接點優先命中以 S.mateMode 略過。
 * 版面都在「畫面 px」算：每個目標有 44 px 的隱形點擊區，任兩個目標至少相距 SEP px。
 */
import { S } from './state.js';
import { openConnectionEditor } from './connection-editor.js';
import * as View from './view.js';
import { mateOverlay, ARROW_GAP_PX, ARROW_LEN_PX } from './mates-view.js';
import { effectiveMates, suggestMates, setAttach, addReceive, removeReceive, renameReceive } from './mates.js';

const NS = 'http://www.w3.org/2000/svg';
const HIT_R = 22, SEP = 28, SLOP = 9;      // 點擊區半徑、目標最小間距、點與拖的分界（畫面 px）
const BLUE = '#1d4ed8', AMBER = '#f59e0b', GREEN = '#16a34a', GREY = '#64748b';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (parent) parent.appendChild(e); return e; };
const $ = id => document.getElementById(id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createMateTool(deps) {
  const { svg, module: focusModule, points, pushUndo, rebuild, draw, transient, pause } = deps;
  let on = false, modId = null, layout = null, pop = null, showAll = false;   // showAll：預設只顯示主要候選，「全部的邊」才含一般連桿的邊
  const pointers = new Set(), taps = new Map();

  // ---------- 座標：世界 mm → 畫面 px（client）→ svg user units ----------
  function geo() {
    const m = svg.getScreenCTM();
    if (!m || !m.a) return null;
    return { k: m.a, px: View.getScale() * m.a, toC: p => ({ x: m.a * View.TX(p.x) + m.e, y: m.d * View.TY(p.y) + m.f }), toU: c => ({ x: (c.x - m.e) / m.a, y: (c.y - m.f) / m.d }) };
  }
  const overlayOf = (mod, g, P) => mateOverlay(S.comps, S.modules, mod.id, P || points() || {}, S.topo.params, { pxPerMm: g.px });

  // ---------- 版面：每個目標一個畫面位置，彼此 ≥ SEP px、在畫布內、不壓到浮動按鈕 ----------
  function place(ov, g) {
    const r = svg.getBoundingClientRect(), inset = 16;
    const box = { l: r.left + inset, t: r.top + inset, r: r.right - inset, b: r.bottom - inset };
    const avoid = ['mateDock', 'designTabs'].map($).concat([...document.querySelectorAll('.controls')]).filter(Boolean)
      .map(e => e.getBoundingClientRect()).filter(q => q.width > 0 && q.height > 0);
    const free = c => c.x >= box.l && c.x <= box.r && c.y >= box.t && c.y <= box.b && !avoid.some(q => c.x > q.left - 8 && c.x < q.right + 8 && c.y > q.top - 8 && c.y < q.bottom + 8);
    const placed = [], out = { arrows: [], bands: [] };
    const ok = c => free(c) && placed.every(q => dist(c, q) >= SEP);
    const take = c => { placed.push(c); return c; };
    ov.arrows.forEach(a => { const c = g.toC({ x: (a.tail.x + a.tip.x) / 2, y: (a.tail.y + a.tip.y) / 2 }); out.arrows.push({ a, at: take(c), tail: g.toC(a.tail), tip: g.toC(a.tip) }); });
    const shown = ov.bands.filter(b => showAll || b.primary), order = [...shown.filter(b => b.kind === 'bolt'), ...shown.filter(b => b.kind === 'edge')];
    order.forEach(b => {
      const A = g.toC(b.a), B = g.toC(b.b), len = dist(A, B), mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      let n = b.n ? { x: b.n.x, y: -b.n.y } : { x: 0, y: -1 };
      const nl = Math.hypot(n.x, n.y) || 1; n = { x: n.x / nl, y: n.y / nl };
      const cands = [];
      if (b.kind === 'bolt') cands.push({ c: mid, cost: 0 });
      else [0.5, 0.3, 0.7, 0.15, 0.85].forEach(t => [16, 26, 38, 52, 68, 86].forEach(off => cands.push({ c: { x: A.x + (B.x - A.x) * t + n.x * off, y: A.y + (B.y - A.y) * t + n.y * off }, cost: off + Math.abs(t - 0.5) * len * 0.4 })));
      cands.sort((u, v) => u.cost - v.cost);
      let at = (cands.find(q => ok(q.c)) || {}).c;
      for (let rad = 20; !at && rad <= 360; rad += 10) for (let ang = 0; ang < 360; ang += 15) {   // 附近都滿了：從邊中點往外一圈一圈找空位
        const c = { x: mid.x + rad * Math.cos(ang * Math.PI / 180), y: mid.y + rad * Math.sin(ang * Math.PI / 180) };
        if (ok(c)) { at = c; break; }
      }
      out.bands.push({ b, A, B, mid, n, at: take(at || { x: mid.x + n.x * 40, y: mid.y + n.y * 40 }) });
    });
    return out;
  }

  // ---------- 繪製 ----------
  function drawActive(g, mod, ov, layer) {
    const u = v => v / g.k, L = place(ov, g);
    layout = { ov, L, mod };
    L.bands.forEach(e => {   // 先畫帶子與引線，目標圓點蓋在上面
      const { b } = e, col = b.marked ? BLUE : AMBER, a = g.toU(e.A), z = g.toU(e.B), h = g.toU(e.at), m = g.toU(e.mid);
      if (b.kind === 'edge') {
        el('line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: col, 'stroke-width': u(b.marked ? 7 : 8), 'stroke-opacity': b.marked ? 0.9 : 0.4, 'stroke-linecap': 'round', 'pointer-events': 'none' }, layer);
        if (dist(e.at, e.mid) > 10) el('line', { x1: m.x, y1: m.y, x2: h.x, y2: h.y, stroke: col, 'stroke-width': u(1.2), 'stroke-opacity': 0.5, 'pointer-events': 'none' }, layer);
      } else el('circle', { cx: m.x, cy: m.y, r: u(13), fill: b.marked ? BLUE : 'none', 'fill-opacity': 0.25, stroke: col, 'stroke-width': u(b.marked ? 4 : 3), 'stroke-opacity': b.marked ? 0.95 : 0.6, 'pointer-events': 'none' }, layer);
    });
    L.bands.forEach(e => {
      const { b } = e, col = b.marked ? BLUE : AMBER, h = g.toU(e.at), grp = el('g', {}, layer);
      el('circle', { cx: h.x, cy: h.y, r: u(9), fill: b.marked ? BLUE : '#fff', stroke: col, 'stroke-width': u(2.5), 'pointer-events': 'none' }, grp);
      const t = el('text', { x: h.x, y: h.y + u(4.5), 'text-anchor': 'middle', 'font-size': u(14), 'font-weight': 800, fill: b.marked ? '#fff' : col, 'pointer-events': 'none' }, grp);
      t.textContent = b.marked ? '✓' : '+';
      if (b.marked) {   // 名稱標在圓點旁（朝畫面外側）
        const r = svg.getBoundingClientRect(), right = e.at.x + 14 + b.name.length * 13 < r.right - 6, lab = el('text', { x: h.x + u(right ? 14 : -14), y: h.y + u(4.5), 'text-anchor': right ? 'start' : 'end', 'font-size': u(13), 'font-weight': 800, fill: BLUE, stroke: '#fff', 'stroke-width': u(3.5), 'paint-order': 'stroke', 'pointer-events': 'none' }, grp);
        lab.textContent = b.name;
      }
      const hit = el('circle', { cx: h.x, cy: h.y, r: u(HIT_R), fill: 'transparent', 'data-mate': `band:${b.portId}`, style: 'pointer-events:all;cursor:pointer' }, grp);
      el('title', {}, hit).textContent = b.name + (b.marked ? '（已標：點一下改名／取消）' : '（點一下標成承接面）');
    });
    L.arrows.forEach(e => {
      const { a } = e, col = a.active ? GREEN : GREY, T = g.toU(e.tail), P = g.toU(e.tip), grp = el('g', {}, layer);
      const ang = Math.atan2(P.y - T.y, P.x - T.x), hl = u(13), hw = u(8), bx = P.x - Math.cos(ang) * hl, by = P.y - Math.sin(ang) * hl;
      el('line', { x1: T.x, y1: T.y, x2: bx, y2: by, stroke: col, 'stroke-width': u(a.active ? 7 : 4), 'stroke-linecap': 'round', 'stroke-opacity': a.active ? 1 : 0.7, 'pointer-events': 'none' }, grp);
      el('polygon', { points: `${P.x},${P.y} ${bx - Math.sin(ang) * hw},${by + Math.cos(ang) * hw} ${bx + Math.sin(ang) * hw},${by - Math.cos(ang) * hw}`, fill: a.active ? GREEN : '#fff', stroke: col, 'stroke-width': u(2.5), 'stroke-linejoin': 'round', 'pointer-events': 'none' }, grp);
      if (a.active) {
        const c = g.toU(e.at), vertical = Math.abs(P.y - T.y) > Math.abs(P.x - T.x);
        const lab = el('text', { x: vertical ? c.x + u(12) : c.x, y: vertical ? c.y + u(4) : c.y + (a.normalDeg === 90 ? u(-12) : u(24)), 'text-anchor': vertical ? 'start' : 'middle', 'font-size': u(13), 'font-weight': 800, fill: GREEN, stroke: '#fff', 'stroke-width': u(3.5), 'paint-order': 'stroke', 'pointer-events': 'none' }, grp);
        lab.textContent = '安裝方向';
      }
      const hit = el('circle', { cx: g.toU(e.at).x, cy: g.toU(e.at).y, r: u(HIT_R), fill: 'transparent', 'data-mate': `arrow:${a.normalDeg}`, style: 'pointer-events:all;cursor:pointer' }, grp);
      el('title', {}, hit).textContent = a.active ? '目前的安裝方向' : '改成從這一側裝上去';
    });
  }
  // 沒開工具：只在設計分頁淡淡畫出已存的承接面與安裝方向（細、低透明、沒有名稱、點不到）
  function drawFaint(g, ov, layer) {
    const u = v => v / g.k;
    layer.setAttribute('pointer-events', 'none'); layer.setAttribute('opacity', 0.4);
    ov.bands.filter(b => b.marked).forEach(b => {
      const a = g.toU(g.toC(b.a)), z = g.toU(g.toC(b.b));
      if (b.kind === 'edge') el('line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: BLUE, 'stroke-width': u(3), 'stroke-linecap': 'round' }, layer);
      else el('circle', { cx: a.x, cy: a.y, r: u(11), fill: 'none', stroke: BLUE, 'stroke-width': u(2) }, layer);
    });
    ov.arrows.filter(a => a.active).forEach(a => {
      const T = g.toU(g.toC(a.tail)), P = g.toU(g.toC(a.tip)), ang = Math.atan2(P.y - T.y, P.x - T.x), hl = u(9), hw = u(5.5), bx = P.x - Math.cos(ang) * hl, by = P.y - Math.sin(ang) * hl;
      el('line', { x1: T.x, y1: T.y, x2: bx, y2: by, stroke: GREEN, 'stroke-width': u(2.5), 'stroke-linecap': 'round' }, layer);
      el('polygon', { points: `${P.x},${P.y} ${bx - Math.sin(ang) * hw},${by + Math.cos(ang) * hw} ${bx + Math.sin(ang) * hw},${by - Math.cos(ang) * hw}`, fill: GREEN }, layer);
    });
  }
  // draw() 呼叫：回傳每幀更新用的函式（播放時機構在動，淡標記要跟著走）；沒東西要畫回 null
  function render() {
    const mod = focusModule(), g = mod && geo();
    if (!g || !(on || mod.mates)) { if (!on) layout = null; return null; }
    const layer = el('g', { 'data-mate-layer': on ? 'active' : 'faint' }, svg);
    const fill = P => {
      const m = focusModule(), gg = geo();
      layer.replaceChildren();
      if (!m || !gg) return;
      const ov = overlayOf(m, gg, P);
      if (on) drawActive(gg, m, ov, layer); else drawFaint(gg, ov, layer);
    };
    fill(null);
    return fill;
  }

  // ---------- 資料：一筆編輯＝一步復原 ----------
  const materialise = (modules, id) => modules.map(m => m.id === id && !m.mates ? { ...m, mates: suggestMates(S.comps, modules, id, S.topo.params) } : m);
  function commit(fn) {
    const mod = focusModule();
    if (!mod) return false;
    const base = materialise(S.modules, mod.id), r = fn(base);
    if (r && r.ok === false) { transient(r.reason || '無法標記'); return false; }
    const next = r && r.modules ? r.modules : r;
    if (!Array.isArray(next) || next === base) return false;   // 沒有實際改動（改名沒變、已經是這個方向…）
    pushUndo();
    S.modules = next;
    closePop(); rebuild(); draw();
    return true;
  }
  const adopt = () => {
    const mod = focusModule();
    if (!mod || mod.mates) return;
    pushUndo(); S.modules = materialise(S.modules, mod.id); closePop(); rebuild(); draw();
  };

  // ---------- 點擊 ----------
  function tapTarget(key, at) {
    const mod = focusModule();
    if (!mod || !layout) return;
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'arrow') {
      const deg = Number(id), cur = layout.ov.arrows.find(a => a.active);
      closePop();
      if (cur && cur.normalDeg === deg) return;   // 已經是這個方向
      commit(mods => setAttach(mods, mod.id, deg));
    } else {
      const b = layout.ov.bands.find(x => x.portId === id);
      if (!b) return;
      if (!b.marked) { closePop(); commit(mods => addReceive(S.comps, mods, mod.id, id, S.topo.params)); } else openPop(b, at);
    }
  }
  function onDown(e) {
    pointers.add(e.pointerId);
    if (!on) return;
    if (pointers.size > 1) { taps.forEach(t => { t.moved = true; }); return; }   // 第二指：交給縮放，這一筆不算點擊
    if (e.pointerType === 'mouse' && e.button !== 0) { e.stopPropagation(); return; }
    e.stopPropagation(); e.preventDefault();
    const t = e.target && e.target.closest ? e.target.closest('[data-mate]') : null;
    taps.set(e.pointerId, { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, key: t ? t.getAttribute('data-mate') : null, moved: false });
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    const t = taps.get(e.pointerId);
    if (!on || !t) return;
    if (pointers.size > 1) { t.moved = true; return; }
    if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) < SLOP) return;
    t.moved = true; closePop();
    View.panByClient(svg, e.clientX - t.lx, e.clientY - t.ly);   // 空白處（或目標上）拖＝平移
    t.lx = e.clientX; t.ly = e.clientY;
    draw();
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    const t = taps.get(e.pointerId);
    taps.delete(e.pointerId);
    if (!on || !t || t.moved || e.type === 'pointercancel') return;
    if (t.key) tapTarget(t.key, { x: t.x, y: t.y }); else closePop();
  }
  const swallow = e => { if (on) { e.stopPropagation(); e.preventDefault(); } };
  svg.addEventListener('pointerdown', onDown, true);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  ['click', 'dblclick', 'contextmenu'].forEach(t => svg.addEventListener(t, swallow, true));

  // ---------- 小選單：改名／取消標記 ----------
  function closePop() { pop = null; const p = $('matePopover'); if (p) { p.style.display = 'none'; p.replaceChildren(); } }
  function openPop(b, at) {
    const p = $('matePopover');
    if (!p) return;
    pop = { id: b.mateId };
    p.replaceChildren();
    const mk = (tag, props = {}, parent = p) => { const e = document.createElement(tag); Object.assign(e, props); parent.appendChild(e); return e; };
    mk('div', { className: 'mate-pop-title', textContent: b.name });
    const row = mk('div', { className: 'mate-pop-row' });
    mk('button', { type: 'button', textContent: '改名' }, row).dataset.act = 'rename';
    mk('button', { type: 'button', textContent: '取消標記' }, row).dataset.act = 'remove';
    mk('button', { type: 'button', textContent: '✕', title: '關閉', className: 'mate-pop-x' }, row).dataset.act = 'close';
    p.style.display = 'block';
    const host = p.offsetParent ? p.offsetParent.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }, w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(6, Math.min(host.width - w - 6, at.x - host.left - w / 2)) + 'px';
    p.style.top = Math.max(6, Math.min(host.height - h - 6, at.y - host.top + 26)) + 'px';
  }
  function renameForm(p) {
    const cur = (layout && layout.ov.bands.find(x => x.mateId === pop.id)) || {};
    p.replaceChildren();
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'text', maxLength: 24, value: cur.name || '', id: 'mateRenameInput' });
    const row = document.createElement('div'); row.className = 'mate-pop-row';
    const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: '確定' }), no = Object.assign(document.createElement('button'), { type: 'button', textContent: '取消' });
    const done = () => { const id = pop && pop.id, v = inp.value; closePop(); if (id) commit(mods => renameReceive(mods, focusModule().id, id, v)); };
    ok.onclick = done; no.onclick = closePop;
    inp.onkeydown = e => { if (e.key === 'Enter') done(); else if (e.key === 'Escape') closePop(); };
    row.append(ok, no); p.append(inp, row);
    inp.focus(); inp.select();
  }
  const popEl = $('matePopover');
  if (popEl) popEl.addEventListener('click', e => {
    const act = e.target.closest && e.target.closest('[data-act]');
    if (!act || !pop) return;
    if (act.dataset.act === 'close') closePop();
    else if (act.dataset.act === 'remove') { const id = pop.id; closePop(); commit(mods => removeReceive(mods, focusModule().id, id)); }
    else if (act.dataset.act === 'rename') renameForm(popEl);
  });

  // ---------- 開關與介面 ----------
  function sync() {
    const mod = focusModule();
    if (on && (!mod || mod.id !== modId || deps.busy())) turnOff();
    const allBtn = $('mateAll'), dock = $('mateDock'), btn = $('mateToolBtn'), ban = $('mateBanner'), adoptBtn = $('mateAdopt'), inv = $('mateInvalid');
    if (dock) dock.style.display = mod ? '' : 'none';
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    if (allBtn) { allBtn.textContent = showAll ? '只看主要' : '全部的邊'; allBtn.setAttribute('aria-pressed', showAll ? 'true' : 'false'); }
    if (ban) ban.style.display = on ? '' : 'none';
    const eff = on && mod ? effectiveMates(S.comps, S.modules, mod.id, S.topo.params) : null;
    if (adoptBtn) adoptBtn.style.display = eff && eff.suggested ? '' : 'none';
    if (inv) {
      const bad = eff ? eff.receive.filter(r => !r.valid) : [];
      inv.style.display = bad.length ? '' : 'none';
      inv.replaceChildren();
      bad.forEach(r => {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: `⚠ ${r.name} 找不到零件・移除` });
        b.onclick = () => commit(mods => removeReceive(mods, mod.id, r.id));
        inv.appendChild(b);
      });
    }
  }
  function turnOff() { on = false; modId = null; layout = null; S.mateMode = false; closePop(); taps.clear(); }
  function set(v) {
    if (!v) { if (on) { turnOff(); sync(); draw(); } return false; }
    const mod = focusModule();
    if (!mod) { if (S.mode === 'design') transient('先把這個設計存成模組，再標接合面'); return false; }
    if (on && modId === mod.id) return true;
    on = true; modId = mod.id; S.mateMode = true; showAll = false;
    pause(); deps.clearSelection(); closePop();
    sync(); deps.fit();
    return true;
  }
  function debug() {
    const mod = focusModule(), g = on && mod && geo();
    const out = { active: on, moduleId: on ? modId : null, suggested: false, attach: null, receive: [], candidates: [], arrows: [] };
    if (!g) return out;
    const eff = effectiveMates(S.comps, S.modules, mod.id, S.topo.params), L = layout && layout.L;
    out.suggested = eff.suggested; out.attach = eff.attach;
    out.receive = eff.receive.map(r => ({ id: r.id, name: r.name, valid: r.valid, portId: r.port ? r.port.id : null }));
    if (L) {
      out.candidates = L.bands.map(e => ({ portId: e.b.portId, name: e.b.name, kind: e.b.kind, marked: e.b.marked, x: e.at.x, y: e.at.y }));
      out.arrows = L.arrows.map(e => ({ normalDeg: e.a.normalDeg, active: e.a.active, x: e.at.x, y: e.at.y }));
    }
    return out;
  }
  const btn = $('mateToolBtn'), adoptBtn = $('mateAdopt');
  $('facePartsBtn')?.addEventListener('click', () => {
    const mod = focusModule(); if (!mod) return;
    pause();
    openConnectionEditor({ mod, comps: S.comps, params: S.topo.params, settings: S.fabrication?.export || {},
      commit: changed => {
        pushUndo(); S.modules = S.modules.map(m => m.id === mod.id ? changed : m);
        rebuild(); draw(); deps.scheduleAutosave?.(); transient('已選定接合面');
      }
    });
  });
  if (btn) btn.addEventListener('click', () => set(!on));
  if (adoptBtn) adoptBtn.addEventListener('click', adopt);
  const allBtn = $('mateAll');
  if (allBtn) allBtn.addEventListener('click', () => { if (!on) return; showAll = !showAll; closePop(); sync(); draw(); });
  return { set, reset: () => { if (on) turnOff(); }, isOn: () => on, sync, render, debug, reach: () => ARROW_GAP_PX + ARROW_LEN_PX };
}
