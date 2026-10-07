/**
 * blocks / mate-wizard-ui
 *
 * 組立台的「接合精靈」（SDD-MATE-FACES §5.2，M4）：手機與電腦同一套，取代預設的接口面板；工程面板收進「進階」。
 * 結構清單（#mateTree）→ 選一個機構 → 選承接面（卡片或 3D 裡亮起的面）→ 預覽（換接法、微調、看干涉）→ 接上／取消。
 * 資料全部走 mate-connect.js（mateTargets／mateConnect／mateStyles／setMateStyle）與 bench.js（benchAdjust）。
 * 預覽的候選作品不寫進 S（沒有復原紀錄、不存檔）：由 app.js 的 setCandidate／withCandidate 暫時換進去重畫；
 * 接上時才經 bench-ui 的 commit（一筆復原，與工程面板同一條重建流程）。
 * bench-ui 把它需要的內部放在 h（見 createBench 結尾）；這裡不碰 3D 與 S 以外的全域。
 */
import { S } from './state.js';
import { mateTargets, mateConnect, mateOfMount, mateStyle, mateStyles, setMateStyle } from './mate-connect.js';
import { benchAdjust } from './bench.js';

const LS_KEY = 'blocks.mateAdvanced';
const KIND = t => t.kind === 'bolt' ? '平貼對鎖' : '角碼直角';
const ADJ = { 'slide-': '◀ 沿邊移 5 mm', 'slide+': '沿邊移 5 mm ▶', side: '換邊', reverse: '掉頭' };
const DONE = { 'slide-': '已沿邊往起點移 5 mm', 'slide+': '已沿邊往終點移 5 mm', side: '已換到宿主的另一邊', reverse: '已掉頭（前後反過來）' };
const NO_SLIDE = '已經滑到邊的盡頭了';

export function createMateWizard(h) {
  const { el, st, deps } = h;
  let adv = false;
  try { adv = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* 沒有儲存空間：預設精靈 */ }
  const body = () => document.body && document.body.classList;
  body()?.toggle('mate-wizard', !adv);
  let pv = null;   // 預覽：{ childId, mateId, host, name, refs, cand:{comps,modules}, hits, rev }
  let cache = { key: '', targets: new Map(), styles: new Map() };
  let treeSig = '', panelSig = '', panelAt = '';
  const liveLine = el('div', 'mate-live'); liveLine.id = 'mateLive'; liveLine.setAttribute('aria-live', 'polite');   // 一行的干涉狀態（接上／拆下的上方）
  const sel = () => (st.selected && h.modOf(st.selected)) || null;
  const params = () => S.topo.params;
  const opts = () => ({ joint: S.fabrication?.joint });
  const hostsOthers = m => S.modules.some(x => x && x.mount && x.mount.to && x.mount.to.module === m.id);
  const state = () => pv ? 'preview' : !sel() ? 'idle' : sel().mount ? 'mounted' : 'pick';
  const stale = () => !!pv && (S.comps !== pv.refs.comps || S.modules !== pv.refs.modules);   // 預覽期間作品被復原／讀檔／刪除換掉了

  // ---------------------------------------------------------------- 資料（同一份作品只算一次）
  function fresh() {
    const key = JSON.stringify(S.modules.map(m => [m.id, m.name, m.mount || 0, m.mates || 0]));
    if (cache.key !== key) cache = { key, targets: new Map(), styles: new Map() };
  }
  function targetsOf(id) {
    fresh();
    if (!cache.targets.has(id)) cache.targets.set(id, mateTargets(S.comps, S.modules, id, params()));
    return cache.targets.get(id);
  }
  const okTargets = id => targetsOf(id).filter(t => t.ok);
  function stylesOf(id) {
    fresh();
    if (!cache.styles.has(id)) cache.styles.set(id, mateStyles(S.comps, S.modules, id, params(), opts()));
    return cache.styles.get(id);
  }
  const offsetOf = (modules, id) => { const m = modules.find(x => x.id === id); return (m && m.mount && m.mount.orient && m.mount.orient.offsetMm) || 0; };
  // 這個微調現在能不能做（滑到頭也算不能）；{ ok, reason? }。
  function canAdj(comps, modules, id, act) {
    const r = benchAdjust(comps, modules, id, act, params(), opts());
    if (!r.ok) return { ok: false, reason: r.reason || '這個動作現在不能用' };
    if ((act === 'slide+' || act === 'slide-') && offsetOf(r.modules, id) === offsetOf(modules, id)) return { ok: false, reason: NO_SLIDE };
    return { ok: true, r };
  }

  // ---------------------------------------------------------------- 預覽
  function setCand(comps, modules) {
    pv.cand = deps.setCandidate({ comps, modules }); pv.rev++;
    const child = pv.cand.modules.find(m => m.id === pv.childId);
    h.setGhost(h.ghostFor(child, pv.cand.comps));
    deps.draw(); h.liveCheck(true); pv.hits = h.liveCount();
    h.syncUI(true); h.drawMarkers();
  }
  function pickTarget(t) {
    const mod = sel();
    if (!mod || mod.mount) { h.say('請先在清單選一個還沒安裝的機構'); return false; }
    const r = mateConnect(S.comps, S.modules, mod.id, { module: t.module, mate: t.mateId }, params(), h.motorState());
    if (!r.ok) { h.say(r.reason || '接不上'); return false; }
    pv = { childId: mod.id, mateId: t.mateId, host: t.module, name: t.name, refs: { comps: S.comps, modules: S.modules }, cand: null, hits: 0, rev: 0 };
    h.say('', { toast: false });
    setCand(r.comps, r.modules);
    return true;
  }
  function pickKey(key) {
    const t = okTargets(st.selected || '').find(x => `${x.module}|${x.portId}` === key || x.portId === key);
    if (!t) { h.say('這個承接面不能接'); return false; }
    return pickTarget(t);
  }
  function cancel({ silent = false } = {}) {
    if (!pv) return false;
    pv = null;
    deps.setCandidate(null); h.clearGhost(); deps.draw(); h.liveCheck(true);
    if (!silent) h.say('已取消，機構回到原位', { toast: false });
    h.syncUI(true); h.drawMarkers();
    return true;
  }
  function commit() {
    if (!pv) return false;
    if (stale()) { cancel({ silent: true }); return false; }
    const p = pv; pv = null;
    h.commit(p.cand.comps, p.cand.modules, `已接上「${h.displayName(p.childId)}」：${h.displayName(p.host)}・${p.name}`);
    return true;
  }
  // 預覽中調整：換接法、微調（都只改候選）。已接好的則直接生效（各一筆復原）。
  function setStyle(style) {
    const id = pv ? pv.childId : st.selected;
    const r = setMateStyle(pv ? pv.cand.comps : S.comps, pv ? pv.cand.modules : S.modules, id, style, params(), opts());
    if (!r.ok) { h.say(r.reason || '這個接法現在不能用'); return; }
    const label = (pv ? mateStyles(pv.cand.comps, pv.cand.modules, id, params(), opts()) : stylesOf(id)).find(x => x.style === style);
    if (pv) { setCand(r.comps, r.modules); h.say(`已改成「${label ? label.label : style}」`, { toast: false }); }
    else h.apply(r, `已改成「${label ? label.label : style}」`);
  }
  function adjust(act) {
    if (!pv) { h.adjust(act); return; }
    const c = canAdj(pv.cand.comps, pv.cand.modules, pv.childId, act);
    if (!c.ok) { h.say(c.reason); return; }
    setCand(c.r.comps, c.r.modules);
    h.say(DONE[act] || '完成', { toast: false });
  }

  // ---------------------------------------------------------------- 結構清單
  function treeRows() {
    const mods = S.modules.filter(Boolean), byId = new Map(mods.map(m => [m.id, m]));
    const hostOf = m => (m.mount && m.mount.to && byId.get(m.mount.to.module)) || null;
    const out = [], seen = new Set();
    const walk = (m, depth) => { if (seen.has(m.id)) return; seen.add(m.id); out.push({ m, depth }); mods.filter(c => hostOf(c) === m).forEach(c => walk(c, depth + 1)); };
    mods.filter(m => !hostOf(m)).forEach(m => walk(m, 0));
    mods.forEach(m => walk(m, 0));   // 環狀等例外
    return out;
  }
  function describe(m) {
    const mate = m.mount ? mateOfMount(S.comps, S.modules, m.id, params()) : null;
    const sty = mate ? stylesOf(m.id).find(x => x.current) : null;
    const note = !m.mount ? '' : mate ? `→ ${[h.displayName(mate.module), mate.name, sty && sty.label].filter(Boolean).join('・\u200b')}` : h.statusOf(m);
    return { mate, sty, note, tag: !m.mount && !hostsOthers(m) && m !== S.modules[0] ? '未安裝' : '' };
  }
  function renderTree() {
    let tree = document.getElementById('mateTree');
    if (!tree) {
      tree = el('div', 'mate-tree'); tree.id = 'mateTree'; tree.setAttribute('aria-label', '結構清單');
      h.listEl().prepend(tree);
    }
    const rows = treeRows().map(({ m, depth }) => ({ m, depth, ...describe(m) }));
    const sig = JSON.stringify([rows.map(r => [r.m.id, h.displayName(r.m.id), r.depth, r.note, r.tag]), st.selected]);
    if (sig === treeSig) return;
    treeSig = sig;
    while (tree.firstChild) tree.removeChild(tree.firstChild);
    if (!rows.length) tree.appendChild(el('div', 'bench-empty', '作品裡還沒有機構。回「設計」從模組庫插入。'));
    rows.forEach(({ m, depth, note, tag }) => {
      const row = el('div', 'mate-tree-row' + (m.id === st.selected ? ' selected' : ''));
      row.dataset.module = m.id; row.tabIndex = 0;
      row.setAttribute('role', 'button'); row.setAttribute('aria-pressed', m.id === st.selected ? 'true' : 'false');
      row.style.marginLeft = `${Math.min(depth, 4) * 14}px`;
      const top = el('span', 'mate-tree-name'); top.appendChild(el('b', null, (depth ? '└ ' : '') + h.displayName(m.id)));
      if (tag) top.appendChild(el('small', 'mate-tree-tag', tag));
      row.appendChild(top);
      if (note) row.appendChild(el('small', 'mate-tree-note', note));
      const go = () => h.select(m.id);
      row.addEventListener('click', go);
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      tree.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- 面板
  function head(title, sub) {
    const d = el('div', 'bench-head');
    d.appendChild(el('div', 'bench-title', title));
    if (sub) d.appendChild(el('div', 'bench-sub', sub));
    return d;
  }
  const btn = (text, cls, onClick) => { const b = el('button', 'bench-btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', onClick); return b; };
  // 按不動的鈕不用 disabled（手指點了才看得到原因）：灰掉，點了在訊息列說明。
  const soft = (b, c, onOk) => { b.addEventListener('click', () => { if (!c.ok) h.say(c.reason); else onOk(); }); if (!c.ok) { b.classList.add('is-disabled'); b.setAttribute('aria-disabled', 'true'); b.title = c.reason; } return b; };

  function styleBox(comps, modules, id, list) {
    if (!list.length) return null;
    const sec = el('div', 'bench-section');
    sec.appendChild(el('div', 'bench-label', list.length > 1 ? '接法（點一下換）' : '接法'));
    const seg = el('div', 'bench-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '接法');
    list.forEach(s => {
      const b = btn(s.label, 'bench-seg-btn mate-style' + (s.current ? ' is-on' : ''), () => {});
      b.dataset.style = s.style; b.setAttribute('aria-pressed', String(!!s.current));
      soft(b, s.ok ? { ok: true } : { ok: false, reason: `「${s.label}」現在不能用：${s.reason}` }, () => { if (!s.current) setStyle(s.style); });
      seg.appendChild(b);
    });
    sec.appendChild(seg);
    return sec;
  }
  function adjustBox(comps, modules, id) {
    const m = modules.find(x => x.id === id), to = m && m.mount && m.mount.to;
    if (!m || !m.mount || !m.mount.orient) return null;   // 對鎖不能沿邊滑動
    const style = mateStyle(modules, id), grid = el('div', 'bench-grid');
    Object.keys(ADJ).forEach(act => {
      if (act === 'side' && to && (to.frame !== undefined || to.edge !== undefined)) return;   // 板邊、機架邊只有朝外一側
      if (act === 'reverse' && style !== 'hang') return;                                      // 立在面上時站立邊已決定方向
      const b = btn(ADJ[act], 'mate-adj', () => {}); b.dataset.act = act;
      soft(b, canAdj(comps, modules, id, act), () => adjust(act));
      grid.appendChild(b);
    });
    const sec = el('div', 'bench-section');
    sec.appendChild(el('div', 'bench-label', `微調位置（沿邊 ${offsetOf(modules, id)} mm）`));
    sec.appendChild(grid);
    return sec;
  }

  function pickView(root, mod) {
    const ts = targetsOf(mod.id), ok = ts.filter(t => t.ok), no = ts.filter(t => !t.ok), name = h.displayName(mod.id);
    root.appendChild(ok.length ? head(`把「${name}」接到哪裡？`, '點下面的卡片，或直接點 3D 裡亮起來的承接面。') : head(name, '還沒安裝'));
    if (ok.length) {
      const list = el('div', 'bench-ports');
      ok.forEach(t => {
        const b = btn('', 'bench-port mate-target', () => pickTarget(t));
        b.dataset.module = t.module; b.dataset.mate = t.mateId;
        b.appendChild(el('span', 'bench-port-name', `${h.displayName(t.module)}・${t.name}`));
        b.appendChild(el('small', 'bench-port-kind', KIND(t)));
        list.appendChild(b);
      });
      root.appendChild(list);
    } else root.appendChild(el('div', 'bench-note', hostsOthers(mod) ? `「${name}」是底座，別的機構會接在它上面。` : '沒有可以接的承接面。到「設計」分頁用「接合面」標出來。'));
    if (no.length) {
      const det = el('details', 'bench-more');
      det.appendChild(el('summary', 'bench-more-sum', `不能接的（${no.length}）`));
      no.forEach(t => det.appendChild(el('div', 'bench-note mate-nope', `${h.displayName(t.module)}・${t.name}：${t.reason}`)));
      root.appendChild(det);
    }
  }
  function previewView(root, mod) {
    root.appendChild(head(`預覽：「${h.displayName(mod.id)}」`, `接到 ${h.displayName(pv.host)}・${pv.name}`));
    root.appendChild(liveLine);
    const row = el('div', 'bench-row');
    const ok = btn('接上', 'primary', commit); ok.id = 'mateCommit';
    const no = btn('取消', '', () => cancel()); no.id = 'mateCancel';
    row.appendChild(ok); row.appendChild(no); root.appendChild(row);
    const { comps, modules } = pv.cand;
    [styleBox(comps, modules, pv.childId, mateStyles(comps, modules, pv.childId, params(), opts())), adjustBox(comps, modules, pv.childId)].forEach(x => x && root.appendChild(x));
  }
  function mountedView(root, mod) {
    const mate = mateOfMount(S.comps, S.modules, mod.id, params());
    root.appendChild(mate ? head(`接在：${h.displayName(mate.module)}・${mate.name}`, h.displayName(mod.id)) : head(h.displayName(mod.id), h.statusOf(mod)));
    root.appendChild(liveLine);
    const row = el('div', 'bench-row');
    const off = btn('拆下', 'danger', () => h.adjust('unmount')); off.id = 'mateDetach';
    const edit = btn('回設計修改', '', () => h.adjust('edit')); edit.id = 'mateEdit';
    row.appendChild(off); row.appendChild(edit); root.appendChild(row);
    if (mate) [styleBox(S.comps, S.modules, mod.id, stylesOf(mod.id)), adjustBox(S.comps, S.modules, mod.id)].forEach(x => x && root.appendChild(x));
    else root.appendChild(el('div', 'bench-note', '這是用工程模式接上的，要微調請按最下面的「進階」。'));
  }

  function renderPanel(force) {
    const root = h.panelEl();
    if (!root) return;
    const mod = sel(), s = state();
    const sig = JSON.stringify([s, st.selected, cache.key, pv && [pv.mateId, pv.rev, pv.hits], st.msg, adv]);
    if (!force && sig === panelSig && root.contains(h.liveBox)) return;
    panelSig = sig;
    const at = s + '|' + st.selected;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (at !== panelAt) { panelAt = at; root.scrollTop = 0; }   // 換了畫面：從頭看起（接上／干涉狀態在最上面）
    syncLive();
    if (s === 'preview') previewView(root, h.modOf(pv.childId));
    else if (s === 'pick') pickView(root, mod);
    else if (s === 'mounted') mountedView(root, mod);
    else root.appendChild(head('接合精靈', '先從清單選一個要安裝的機構'));
    const msg = el('div', 'bench-msg', st.msg); msg.id = 'benchMsg'; msg.setAttribute('aria-live', 'polite');
    root.appendChild(msg);
    root.appendChild(h.liveBox);   // 即時干涉＋全行程測試（預覽中檢查的是預覽的姿勢）
    ensureToggle(root);
  }
  function render(force) {
    if (stale()) cancel({ silent: true });
    if (force) cache.key = '';
    renderTree(); renderPanel(force);
    if (force) fit();
  }
  // 一行干涉狀態：✔ 沒有干涉／✖ 撞到 n 處＋撞到的機構名稱（只用機構名，不露零件 id）。
  function syncLive() {
    const i = h.liveInfo(), comps = pv ? pv.cand.comps : S.comps;
    let state = 'none', text = '干涉檢查中…';
    if (i.ready && !i.n) { state = 'ok'; text = '✔ 目前沒有干涉'; }
    else if (i.ready) {
      const names = new Set();
      i.hits.forEach(n => {
        const f = /^(.+)-frame$/.exec(n), c = f ? null : comps.find(x => x && (x.id === n || n.includes(x.id)));
        const m = h.modOf(f ? f[1] : c && c.moduleId);
        if (m) names.add(h.displayName(m.id));
      });
      state = 'hit'; text = `✖ 撞到 ${i.n} 處${names.size ? '：' + [...names].join('、') : ''}`;
    }
    liveLine.dataset.state = state; liveLine.textContent = text;
  }

  // ---------------------------------------------------------------- 3D 鏡頭：框住相關的機構（保留視角，只調距離與目標）
  const fitIds = () => pv ? [pv.host, pv.childId] : null;   // 預覽：宿主＋要接的；其餘：全部
  function keyTest(ids) {
    if (!ids) return undefined;
    const set = new Set(ids), part = new Set(), comps = pv ? pv.cand.comps : S.comps;
    comps.filter(c => c && set.has(c.moduleId)).forEach(c => { part.add(c.id); ['p1', 'p2', 'p3', 'p4'].forEach(k => c[k] && c[k].id && part.add(c[k].id)); });
    return key => {
      const slash = key.indexOf('/');
      if (slash >= 0 && set.has(key.slice(0, slash))) return true;
      const rest = key.slice(slash + 1), id = rest.slice(rest.indexOf(':') + 1);
      return [...set].some(m => id === m || id === `${m}-frame`) || part.has(id) || id.split('-').some(t => part.has(t));
    };
  }
  let watched = null, fitTimer = 0;
  function bottomInset(v) {   // 播放列蓋住畫布下方的高度
    const bar = document.querySelector('.controls'), cr = bar && bar.getBoundingClientRect(), vr = v.canvas.getBoundingClientRect();
    return cr && cr.height > 0 && cr.top < vr.bottom && cr.bottom > vr.top ? Math.max(0, vr.bottom - cr.top + 4) : 0;
  }
  function fit() {
    const v = h.viewer();
    if (adv || !v || !v.fitTo || !h.isBench()) return;
    if (watched !== v.canvas && 'ResizeObserver' in window && v.canvas.parentElement) {   // 畫布大小變了（面板長高、轉向）就重新框
      watched = v.canvas;
      new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 120); }).observe(v.canvas.parentElement);
    }
    const o = { insetBottom: bottomInset(v) };
    v.fitTo(keyTest(fitIds()), o) || v.fitTo(undefined, o);
  }

  // ---------------------------------------------------------------- 進階（工程模式）開關
  const toggle = el('button', 'bench-btn mate-adv'); toggle.type = 'button'; toggle.id = 'mateAdvanced';
  function setAdvanced(on) {
    if (pv) cancel({ silent: true });
    h.cancelAdvancedPreview();
    adv = !!on;
    if (adv && h.viewer() && h.viewer().releaseFit) h.viewer().releaseFit();
    try { localStorage.setItem(LS_KEY, adv ? '1' : '0'); } catch (e) { /* 存不了就只在這次有效 */ }
    body()?.toggle('mate-wizard', !adv);
    treeSig = ''; panelSig = '';
    h.syncUI(true); h.drawMarkers();
  }
  toggle.addEventListener('click', () => setAdvanced(!adv));
  function ensureToggle(root) {
    toggle.textContent = adv ? '回到精靈' : '進階（工程模式）';
    if (root && root.lastChild !== toggle) root.appendChild(toggle);
  }

  // ---------------------------------------------------------------- 3D 承接面標記
  // 選了還沒安裝的機構（還沒進預覽）時，亮起所有「可接」的承接面；點它就是選那張卡片。
  function markers() {
    if (state() !== 'pick') return [];
    const ts = okTargets(st.selected), all = h.computeMarkers();
    const ms = ts.map(t => { const m = all.find(x => x.module === t.module && x.portId === t.portId); return m && { ...m, compatible: true, suggested: true, name: t.name, labelPx: 24 }; }).filter(Boolean);
    const y = m => m.points.reduce((a, p) => a + p.y, 0) / m.points.length, mean = ms.reduce((a, m) => a + y(m), 0) / (ms.length || 1);
    return ms.map(m => ({ ...m, labelDir: y(m) > mean ? 1 : -1 }));   // 比較上面的標籤放上方、下面的放下方，互不遮住
  }
  function debug() {
    const v = h.viewer(), mod = sel(), s = state(), ms = markers();
    const at = m => {
      const ps = v && m ? m.points.map(p => v.project(p)) : [];
      if (!ps.length || ps.some(p => !p)) return null;
      const x = ps.reduce((a, p) => a + p.x, 0) / ps.length, y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
      return x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight ? { x, y } : null;
    };
    const targets = s === 'pick' ? targetsOf(mod.id).map(t => {
      const o = { module: t.module, mateId: t.mateId, name: t.name, ok: t.ok };
      if (!t.ok) o.reason = t.reason; else Object.assign(o, at(ms.find(m => m.module === t.module && m.portId === t.portId)));
      return o;
    }) : [];
    const tree = treeRows().map(({ m, depth }) => {
      const d = describe(m), host = m.mount && m.mount.to ? m.mount.to.module : null;
      return { id: m.id, name: h.displayName(m.id), depth, parent: host != null && S.modules.some(x => x.id === host) ? host : null, mateName: d.mate ? d.mate.name : '', style: mateStyle(S.modules, m.id), unmounted: !m.mount };
    });
    const fill = v && v.viewFill ? v.viewFill(keyTest(fitIds())) || v.viewFill() : 0;
    return {
      advanced: adv, selected: st.selected, state: s, targets, tree, view: { fill: Math.round(fill * 1000) / 1000 },
      preview: pv ? { mateId: pv.mateId, style: mateStyle(pv.cand.modules, pv.childId), offsetMm: offsetOf(pv.cand.modules, pv.childId), hits: pv.hits } : null
    };
  }
  // 進組立：只有一個未安裝的機構有地方可接 → 直接選它。
  function onEnter() {
    cache.key = ''; treeSig = ''; panelSig = '';
    if (adv || st.selected) return;
    const cs = S.modules.filter(m => m && !m.mount && okTargets(m.id).length);
    if (cs.length === 1) h.select(cs[0].id);
  }

  return { advanced: () => adv, render, markers, pickKey, cancel, previewOf: () => pv ? pv.childId : null, ensureToggle, onEnter, debug, fit, syncLive };
}
