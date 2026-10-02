/**
 * blocks / bench-ui
 *
 * 組立台畫面（SDD-ASSEMBLY-BENCH §2、§3，B3～B5）：「設計／組立」模式切換、模組清單、接法面板、
 * 3D 接口標記、點兩下接、拖曳吸附、預覽（接上／取消）與一鍵調整。
 * 資料操作全部走 ./bench.js 與 ./module-ops.js 的純函式；這裡只管狀態、DOM 與 3D 標記的組裝。
 *
 * 狀態只存在這個模組（S.mode 以外都不存檔）：
 *   selected  清單裡選中的模組 id
 *   preview   { moduleId, portId, preSnap, undoLen } —— 接上前的預覽；取消會還原 preSnap 並丟掉預覽期間的復原紀錄
 *   showAll   是否把不相容的接口也畫出來（暗色、點了說原因）
 */
import { S, motorAnglesNow } from './state.js';
import * as Bench from './bench.js';
import { resolveSpacers, findInterference, interferenceTimeline, hitPartNames } from './interference.js';
import { setMountFlip, unmountModule } from './module-ops.js';
import { pointKeysFor } from './part-types.js';
import { applyMatrix4, moduleFrameZ } from '../blocks3d/orthogonal-3d.js';

const SNAP_PX = 40;          // 拖曳吸附半徑（螢幕 px）
const TAP_PX_MOUSE = 26;     // 點接口的命中半徑（滑鼠）
const TAP_PX_TOUCH = 40;     // 點接口的命中半徑（觸控；手指比較粗）
const DRAG_START_PX = 6;     // 超過這個位移才算「拖曳」，否則算點選
const LIVE_MIN_MS = 200;     // B6 即時干涉：播放時最多每 200 ms 檢查一次（≈5 次／秒）
const TL_STEP_DEG = 5;       // 全行程測試的取樣間距
const TL_ROW_PX = 36;        // 時間軸每列的高度（觸控目標 ≥ 32 px）

// module-ops 的失敗代碼 → 白話。
const OPS_REASONS = {
  'not-mounted': '這個模組還沒安裝',
  'host-invalid': '宿主目前解不出來，無法拆下',
  unsolved: '目前的姿勢解不出來，請先讓機構能動',
  'no-module': '找不到這個模組'
};
const opsReason = code => OPS_REASONS[code] || `操作失敗（${code}）`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function createBench(deps) {
  const {
    pushUndo, rebuild, draw, transient, setViewPlane, motorState,
    snapshotStr, restoreSnapshot, getViewer, is3DActive, set3D, push3D,
    interferenceArgs, setMotorAngles
  } = deps;
  const saveComposite = deps.saveComposite || (() => null);
  const exportComposite = deps.exportComposite || (() => null);   // 組合積木匯出 JSON   // B7：存成組合積木（由 app.js 接到模組編輯器的模組庫）

  const st = { moreOpen: false, selected: null, preview: null, showAll: false, snapId: null, msg: '', lastScene: null, wasIn3D: false, tilted: false, canvasBound: null };
  let listSig = '', panelSig = '';
  const cards = new Map();   // moduleId -> 卡片 DOM（就地更新，不重建，拖曳中的卡片才不會被換掉）
  let drag = null;
  let labels = new Map();    // moduleId -> 顯示標籤（同名模組加編號）

  const listEl = () => document.getElementById('benchList');
  const panelEl = () => document.getElementById('benchPanel');
  const viewer = () => getViewer();
  const modOf = id => S.modules.find(m => m && m.id === id) || null;
  const isBench = () => S.mode === 'bench';
  const hasChildren = mod => S.modules.some(m => m && m.mount && m.mount.to && m.mount.to.module === mod.id);
  const displayName = id => labels.get(id) || id;

  function say(msg, { toast = true } = {}) {
    st.msg = msg;
    if (toast) transient(msg);
    const m = document.getElementById('benchMsg');
    if (m) m.textContent = msg;
  }

  // ---------------------------------------------------------------- 狀態文字
  function statusOf(mod) {
    if (!mod.mount) return '未安裝';
    const host = modOf(mod.mount.to.module);
    const hostName = host ? displayName(host.id) : mod.mount.to.module;
    let outName = mod.mount.to.output || '';
    if (mod.mount.orient) {
      // C1：宿主邊可以是桿、三角板的邊或機架板的邊
      const name = host ? Bench.mountPortName(S.comps, S.modules, mod.mount, S.topo.params) : null;
      outName = name || mod.mount.to.body || (mod.mount.to.frame ? '機架' : '');
    } else if (host) {
      const o = (host.outputs || []).find(x => x.id === mod.mount.to.output);
      outName = o ? o.name : outName;
    }
    const o = mod.mount.orient;
    const tilt = o && o.tiltDeg ? ` 傾斜 ${o.tiltDeg}°` : '';   // D4
    if (o && o.edge === 'child') return `⟂ 立在 ${hostName}・${outName}（${o.face === -1 ? '下面' : '上面'}）${mod.mount.flip ? '（翻面）' : ''}${tilt}`;   // D3
    return `${o ? '⟂ 直角裝在' : '裝在'} ${hostName}・${outName}${mod.mount.flip ? '（翻面）' : ''}${tilt}`;
  }


  // ---------------------------------------------------------------- B6：即時干涉與全行程測試
  // live：目前姿勢的檢查結果；plan：疊層＋隔圈的快取（只在作品內容變了才重算）；tl：全行程時間軸結果。
  const live = { plan: null, planKey: '', args: null, sig: '', findings: [], hits: [], keys: [], at: 0, timer: null, checks: 0, planBuilds: 0, ms: 0, ready: false };
  const tl = { result: null, ranges: null, key: '', summary: [], ms: 0 };
  let liveBox = null;

  // 作品內容的便宜結構鍵：零件＋模組＋參數＋加工設定（theta 是姿勢不是作品內容，排除）。
  function workKey() {
    const { theta, ...params } = S.topo.params || {};
    return JSON.stringify([S.comps, S.modules, params, S.fabrication]);
  }
  function ensurePlan() {
    const key = workKey();
    if (live.plan && live.planKey === key) return live;
    live.planKey = key;
    live.plan = null;
    live.planBuilds++;
    try {
      const args = interferenceArgs();
      const { plan } = resolveSpacers(args);
      live.plan = plan; live.args = args;
    } catch (e) { live.plan = null; live.args = null; }
    live.sig = '';              // 作品變了：目前姿勢要重查
    clearTimeline();            // 全行程結果跟著作品失效
    return live;
  }
  // 目前所有馬達角度（只留有行程的馬達；其他不影響機構）。
  function currentPose() {
    const all = motorAnglesNow();
    const ids = live.args ? Object.keys(live.args.ranges || {}) : Object.keys(all);
    const pose = {};
    ids.forEach(id => { pose[id] = Number(all[id]) || 0; });
    return pose;
  }

  // 零件名稱 → viewer 的 pickKey。成員／齒輪／齒條的零件名＝safeName(comp.id)；
  // 直角子模組的零件 key 有 `${plane}/` 前綴，子模組自己的外形（`${id}-frame`）＝整個前綴；主機架＝'frame'。
  function highlightKeys(findings, plan) {
    const keys = new Set();
    if (!plan) return [];
    const byName = new Map(plan.parts.map(p => [p.name, p]));
    const compById = new Map(S.comps.map(c => [c.id, c]));
    hitPartNames(findings).forEach(n => {
      const fm = /^(.+)-frame$/.exec(n);
      const fmod = fm ? modOf(fm[1]) : null;
      if (fmod && fmod.mount && fmod.mount.orient) { keys.add(`${fmod.id}/*`); return; }
      const part = byName.get(n);
      if (!part) return;
      if (part.kind === 'frame') { keys.add('frame'); return; }
      const c = compById.get(part.compId);
      if (!c) return;
      const pre = part.plane ? `${part.plane}/` : '';
      if (c.type === 'bar') keys.add(`${pre}stick:${c.id}`);
      else if (c.type === 'triangle' && c.p1 && c.p2 && c.p3) keys.add(`${pre}plate:${c.p1.id}-${c.p2.id}-${c.p3.id}`);
      else if (c.type === 'gear' || c.type === 'rack') keys.add(`${pre}${c.type}:${c.id}`);
    });
    return [...keys];
  }

  function nameList(names, max = 4) {
    return names.length > max ? `${names.slice(0, max).join('、')} 等 ${names.length} 件` : names.join('、');
  }

  function renderLiveStatus() {
    if (!liveBox) return;
    const box = liveBox.querySelector('#benchLive');
    if (!box) return;
    if (!live.ready || !live.plan || !(live.plan.parts || []).length) {
      box.dataset.state = 'none';
      box.textContent = '尚無零件可檢查干涉';
      return;
    }
    if (!live.findings.length) {
      box.dataset.state = 'ok';
      box.textContent = '✔ 目前姿勢沒有干涉';
      return;
    }
    box.dataset.state = 'hit';
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el('div', 'bench-live-main', `✖ 撞到：${nameList(live.hits)}（共 ${live.findings.length} 項）`));
    box.appendChild(el('div', 'bench-live-msg', live.findings[0].message));
  }

  function applyHighlight() {
    const v = viewer();
    if (v && v.setHighlight) v.setHighlight(isBench() ? live.keys : []);
  }

  // 檢查目前姿勢。force：忽略節流與「沒變」判斷。
  function runLive(force = false) {
    if (!isBench()) return;
    live.timer = null;
    const st0 = ensurePlan();
    const pose = currentPose();
    const sig = JSON.stringify(pose);
    if (!force && sig === live.sig && live.ready) { updateCursors(); return; }
    const t0 = performance.now();
    let findings = [];
    if (st0.plan && st0.args) {
      try { findings = findInterference({ ...st0.args, plan: st0.plan, pose }); } catch (e) { findings = []; }
    }
    live.ms = performance.now() - t0;
    live.sig = sig; live.at = performance.now(); live.checks++; live.ready = true;
    live.findings = findings;
    live.hits = hitPartNames(findings);
    live.keys = highlightKeys(findings, st0.plan);
    applyHighlight();
    renderLiveStatus();
    updateCursors();
  }
  // 每幀／每次變動都可以呼叫：播放時節流成每 LIVE_MIN_MS 一次，最後一個姿勢用尾端計時器補查。
  function liveCheck(force = false) {
    if (!isBench()) return;
    const wait = LIVE_MIN_MS - (performance.now() - live.at);
    if (force || wait <= 0) { if (live.timer) { clearTimeout(live.timer); live.timer = null; } runLive(force); return; }
    if (!live.timer) live.timer = setTimeout(() => runLive(), wait);
  }
  function resetLive() {
    if (live.timer) { clearTimeout(live.timer); live.timer = null; }
    live.sig = ''; live.findings = []; live.hits = []; live.keys = []; live.ready = false;
    applyHighlight();
    renderLiveStatus();
  }

  // ---- 全行程時間軸 ----
  const motorLabel = id => `M${id}`;
  function clearTimeline() {
    if (!tl.result && !tl.summary.length) return;
    tl.result = null; tl.ranges = null; tl.summary = []; tl.ms = 0;
    renderTimeline();
  }
  // 一顆馬達的連續干涉段：[{ from, to, names }]（角度為取樣點）。
  function runsOf(row) {
    const runs = [];
    let cur = null;
    row.forEach(e => {
      if (e.findings.length) {
        if (!cur) { cur = { from: e.angleDeg, to: e.angleDeg, names: [] }; runs.push(cur); }
        cur.to = e.angleDeg;
        hitPartNames(e.findings).forEach(n => { if (!cur.names.includes(n)) cur.names.push(n); });
      } else cur = null;
    });
    return runs;
  }
  const fmtDeg = a => `${Math.round(a * 10) / 10}°`;
  function runTimeline() {
    if (!isBench()) return null;
    const st0 = ensurePlan();
    if (!st0.plan) { say('目前沒有可檢查的零件'); return null; }
    const args = interferenceArgs();
    const t0 = performance.now();
    let result;
    try { result = interferenceTimeline({ ...args, plan: st0.plan, ranges: args.ranges, stepDeg: TL_STEP_DEG }); } catch (e) { result = { motors: {} }; }
    tl.ms = performance.now() - t0;
    tl.result = result; tl.ranges = args.ranges;
    tl.summary = [];
    Object.keys(result.motors).forEach(id => {
      runsOf(result.motors[id]).forEach(r => {
        tl.summary.push({ motor: id, from: r.from, to: r.to, names: r.names,
          text: `${motorLabel(id)} 在 ${r.from === r.to ? fmtDeg(r.from) : `${fmtDeg(r.from)}～${fmtDeg(r.to)}`} 會撞到 ${nameList(r.names, 5)}` });
      });
    });
    renderTimeline();
    return { ms: tl.ms, summary: tl.summary.map(x => x.text) };
  }
  // 點時間軸某一列：該馬達設到最近的取樣角度，其他馬達 0°，重畫並檢查目前姿勢（零件會變紅）。
  function jumpTo(motorId, angle) {
    if (!tl.result) return false;
    const row = tl.result.motors[motorId];
    if (!row || !row.length) return false;
    const nearest = row.reduce((b, e) => Math.abs(e.angleDeg - angle) < Math.abs(b.angleDeg - angle) ? e : b, row[0]);
    const angles = {};
    Object.keys(tl.result.motors).forEach(id => { angles[id] = 0; });
    angles[motorId] = nearest.angleDeg;
    setMotorAngles(angles);
    liveCheck(true);
    return nearest.angleDeg;
  }
  function renderTimeline() {
    if (!liveBox) return;
    const root = liveBox.querySelector('#benchTl');
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (!tl.result) return;
    const motors = Object.keys(tl.result.motors);
    motors.forEach(id => {
      const row = tl.result.motors[id];
      const lo = row[0].angleDeg, hi = row[row.length - 1].angleDeg;
      const span = hi - lo;
      const pct = a => span > 0 ? (a - lo) / span * 100 : 0;
      const wrap = el('div', 'bench-tl-row');
      wrap.dataset.motor = id;
      wrap.appendChild(el('span', 'bench-tl-label', motorLabel(id)));
      const col = el('div', 'bench-tl-col');
      const bar = el('div', 'bench-tl-bar');
      bar.setAttribute('role', 'button');
      bar.tabIndex = 0;
      bar.style.height = `${TL_ROW_PX}px`;
      bar.setAttribute('aria-label', `${motorLabel(id)} 全行程，點一下跳到該角度`);
      // 每個取樣點負責它左右各半格；有干涉的相鄰格併成一段紅色。
      let i = 0;
      while (i < row.length) {
        if (!row[i].findings.length) { i++; continue; }
        let j = i;
        while (j + 1 < row.length && row[j + 1].findings.length) j++;
        const left = i === 0 ? 0 : (pct(row[i - 1].angleDeg) + pct(row[i].angleDeg)) / 2;
        const right = j === row.length - 1 ? 100 : (pct(row[j].angleDeg) + pct(row[j + 1].angleDeg)) / 2;
        const seg = el('div', 'bench-tl-hit');
        seg.style.left = `${left}%`;
        seg.style.width = `${Math.max(right - left, span > 0 ? 1.5 : 100)}%`;
        seg.dataset.from = row[i].angleDeg; seg.dataset.to = row[j].angleDeg;
        bar.appendChild(seg);
        i = j + 1;
      }
      const cursor = el('div', 'bench-tl-cursor');
      bar.appendChild(cursor);
      const go = clientX => {
        const r = bar.getBoundingClientRect();
        const f = r.width > 0 ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : 0;
        jumpTo(id, lo + f * span);
      };
      bar.addEventListener('click', e => go(e.clientX));
      bar.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const r = bar.getBoundingClientRect();
        go(r.left + r.width / 2);
      });
      col.appendChild(bar);
      const ticks = el('div', 'bench-tl-ticks');
      ticks.appendChild(el('span', null, fmtDeg(lo)));
      if (lo < 0 && hi > 0) { const z = el('span', null, '0°'); z.style.left = `${pct(0)}%`; z.className = 'bench-tl-zero'; ticks.appendChild(z); }
      ticks.appendChild(el('span', null, fmtDeg(hi)));
      col.appendChild(ticks);
      wrap.appendChild(col);
      root.appendChild(wrap);
    });
    const sum = el('div', 'bench-tl-summary');
    sum.id = 'benchTlSummary';
    if (!tl.summary.length) { sum.dataset.state = 'ok'; sum.appendChild(el('div', null, '全行程沒有干涉 ✔')); }
    else { sum.dataset.state = 'hit'; tl.summary.forEach(x => sum.appendChild(el('div', null, x.text))); }
    root.appendChild(sum);
    updateCursors();
  }
  // 時間軸上的白線＝目前姿勢。
  function updateCursors() {
    if (!liveBox || !tl.result) return;
    const pose = motorAnglesNow();
    liveBox.querySelectorAll('.bench-tl-row').forEach(rowEl => {
      const id = rowEl.dataset.motor;
      const row = tl.result.motors[id];
      if (!row) return;
      const lo = row[0].angleDeg, hi = row[row.length - 1].angleDeg;
      const a = Number(pose[id]) || 0;
      const c = rowEl.querySelector('.bench-tl-cursor');
      if (c) { c.style.left = `${hi > lo ? Math.max(0, Math.min(100, (a - lo) / (hi - lo) * 100)) : 0}%`; }
    });
  }
  function makeLiveBox() {
    const box = el('div', 'bench-section bench-livebox');
    const status = el('div', 'bench-live');
    status.id = 'benchLive';
    status.setAttribute('aria-live', 'polite');
    box.appendChild(status);
    const btn = el('button', 'bench-btn bench-tl-btn', '▶ 全行程測試');
    btn.type = 'button'; btn.id = 'benchTlBtn';
    btn.addEventListener('click', () => runTimeline());
    box.appendChild(btn);
    const root = el('div', 'bench-tl');
    root.id = 'benchTl';
    box.appendChild(root);
    return box;
  }
  liveBox = makeLiveBox();
  renderLiveStatus();

  // ---------------------------------------------------------------- 標記
  // 目前選中的子模組的接口標記（要有場景才算得出位置）。
  function computeMarkers() {
    const sc = st.lastScene;
    if (!sc || !st.selected) return [];
    // C2：宿主可能在直角子平面上——標記點先用該平面的 z（子場景桿的 z）算出，再乘上該平面畫進主場景的矩陣。
    const zOf = (id, plane) => {
      const f = plane ? (sc.planes[plane] && sc.planes[plane].zOf) : sc.zOf;
      return f ? f(id) : 0;
    };
    return Bench.portMarkers(S.comps, S.modules, st.selected, sc.ptsAll || sc.pts, S.topo.params, { zOf, thicknessMm: sc.thickness })
      .map(m => {
        const pl = m.plane ? sc.planes[m.plane] : null;
        if (m.plane && !pl) return null;   // 該平面的子場景算不出來，沒辦法放進 3D
        return pl ? { ...m, localPoints: m.points, points: m.points.map(p => applyMatrix4(pl.matrix, p)) } : m;
      }).filter(Boolean)
      // D2：不同模組的接口 id 可能相同（例如每個已安裝模組的底板都有 edge:frame:0），所以每個標記另有唯一的 key＝`模組id|接口id`。
      .map(m => ({ ...m, key: `${m.module}|${m.portId}` }));
  }
  // 要畫出來的標記（不相容的只在「顯示全部接口」時畫，暗色）。
  function visibleMarkers() {
    if (!isBench() || st.preview) return [];
    return computeMarkers().filter(m => m.compatible || st.showAll);
  }
  function toneOf(m) {
    if (m.key === st.snapId) return 'snap';
    if (!m.compatible) return 'dim';
    return m.suggested ? 'suggested' : 'normal';
  }
  function drawMarkers() {
    const v = viewer();
    if (!v) return;
    const list = visibleMarkers().map(m => {
      const tone = toneOf(m);
      return {
        kind: m.kind, points: m.points, tone,
        label: (tone === 'snap' || tone === 'suggested') ? m.name : ''
      };
    });
    v.setMarkers(list);
  }
  function ghostSpec() {
    if (!st.preview) return null;
    const mod = modOf(st.preview.moduleId);
    if (!mod || !mod.mount) return null;
    if (mod.mount.orient) return { prefix: mod.id };
    const ids = new Set();
    S.comps.filter(c => c.moduleId === mod.id).forEach(c => {
      ids.add(c.id);
      pointKeysFor(c).forEach(k => { if (c[k] && c[k].id) ids.add(c[k].id); });
    });
    return { ids };
  }
  function applyGhost() {
    const v = viewer();
    if (v) v.setPreviewGhost(ghostSpec());
  }

  // 每次 push3D 之後（播放每幀也會）：記下這一幀的點與高度，標記跟著宿主走。
  // 某個場景模型（主場景或子平面的子場景）查零件高度的函式。
  function makeZOf(model) {
    const sticks = (model && model.sticks) || [];
    const byId = new Map(sticks.map(s => [s.id, s]));
    // 桿＝stick 的 z；三角板＝與它三個頂點相同的 plate 的 z；機架板＝'frame'（model.frame.z）
    return id => {
      const s = byId.get(id);
      if (s && Number.isFinite(s.z)) return s.z;
      if (id === 'frame') return model && model.frame && Number.isFinite(model.frame.z) ? model.frame.z : 0;
      // D2：已安裝模組的底板＝`${模組id}-frame`，墊在該模組零件的最下面
      const fm = typeof id === 'string' ? /^(.+)-frame$/.exec(id) : null;
      if (fm && modOf(fm[1])) {
        const z = moduleFrameZ(model, S.comps, fm[1]);
        if (z !== null) return z;
        return model && model.frame && Number.isFinite(model.frame.z) ? model.frame.z : 0;
      }
      const c = S.comps.find(x => x && x.id === id);
      if (c && c.type === 'triangle') {
        const key = [c.p1, c.p2, c.p3].map(p => p && p.id).sort().join(',');
        const pl = ((model && model.plates) || []).find(q => Array.isArray(q.ids) && [...q.ids].sort().join(',') === key);
        if (pl && Number.isFinite(pl.z)) return pl.z;
      }
      return 0;
    };
  }
  // ptsAll：所有平面的解（子平面的點是該平面自己的座標）；planes：每個直角子平面的 { matrix, zOf }，
  // matrix 與 viewer 畫該平面子場景用的是同一個（model.orthogonal[].matrix，巢狀已逐層相乘）。
  function afterScene({ pts, ptsAll, model }) {
    const sticks = (model && model.sticks) || [];
    const planes = {};
    ((model && model.orthogonal) || []).forEach(ch => {
      if (ch && ch.id && Array.isArray(ch.matrix) && ch.model) planes[ch.id] = { matrix: ch.matrix, zOf: makeZOf(ch.model), sticks: ch.model.sticks || [] };
    });
    st.lastScene = {
      pts: pts || {},
      ptsAll: ptsAll || pts || {},
      zOf: makeZOf(model),
      planes,
      thickness: sticks.length && Number.isFinite(sticks[0].thickness) ? sticks[0].thickness : 3
    };
    if (isBench()) { drawMarkers(); liveCheck(); }
  }

  // ---------------------------------------------------------------- 模式
  async function setMode(mode) {
    if (mode !== 'design' && mode !== 'bench') return;
    if (S.mode === mode) return;
    if (mode === 'bench') {
      S.mode = 'bench';
      document.body.dataset.mode = 'bench';
      syncModeButtons();
      if (S.viewPlane) setViewPlane(null);
      st.wasIn3D = is3DActive();
      await set3D(true);
      const v = viewer();
      if (v) {
        v.setPickEnabled(false);
        bindCanvas(v);
        if (!st.tilted) { v.tiltView(); st.tilted = true; }
      }
      syncUI(true);
      push3D();
      liveCheck(true);
    } else {
      cancelPreview({ silent: true });
      const v = viewer();
      if (v) { v.setMarkers([]); v.setPreviewGhost(null); v.setPickEnabled(true); }
      S.mode = 'design';
      resetLive(); clearTimeline();
      delete document.body.dataset.mode;
      st.snapId = null;
      syncModeButtons();
      if (!st.wasIn3D) await set3D(false);
    }
  }
  function syncModeButtons() {
    [['modeBtnDesign', 'design'], ['modeBtnBench', 'bench']].forEach(([id, m]) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.classList.toggle('active', S.mode === m);
      b.setAttribute('aria-selected', S.mode === m ? 'true' : 'false');
    });
  }

  // ---------------------------------------------------------------- 選取
  function select(moduleId) {
    if (!isBench()) return false;
    const next = moduleId && modOf(moduleId) ? moduleId : null;
    if (st.preview && next !== st.preview.moduleId) cancelPreview();
    st.selected = next;
    st.snapId = null;
    const mod = next && modOf(next);
    if (mod) {
      if (mod.mount) say(`選了「${displayName(mod.id)}」：${statusOf(mod)}，下面可以調整。`, { toast: false });
      else if (!mod.base) say(`「${displayName(mod.id)}」沒有基準點（base），不能安裝。`);
      else say(`選了「${displayName(mod.id)}」：點 3D 裡發亮的接口，或按右邊的接口按鈕。`, { toast: false });
    }
    syncUI(true);
    drawMarkers();
    return !!next;
  }

  // ---------------------------------------------------------------- 預覽（點兩下／拖吸附共用）
  // portId 可以是 `模組id|接口id`（唯一）或單獨的接口 id（舊寫法；多個模組有同名接口時取第一個相容的）。
  function pickPort(portId) {
    if (!isBench()) return false;
    const childId = st.selected;
    if (!childId) { say('請先在清單選一個要安裝的模組'); return false; }
    if (st.preview) cancelPreview({ silent: true });
    const mod = modOf(childId);
    if (mod && mod.mount) { say(`「${displayName(mod.id)}」已經裝在別處，要先按「拆下」`); return false; }
    const all = computeMarkers();
    const marker = all.find(m => m.key === portId) || all.find(m => m.portId === portId && m.compatible) || all.find(m => m.portId === portId);
    if (!marker) { say('找不到這個接口'); return false; }
    if (!marker.compatible) { say(marker.reason || '這個接口不能接'); return false; }
    const r = Bench.connect(S.comps, S.modules, childId, { module: marker.module, port: marker.portId }, S.topo.params, motorState());
    if (!r.ok) { say(r.reason || '接不上'); return false; }
    const preSnap = snapshotStr();
    const undoLen = S.undoStack.length;
    pushUndo();
    S.comps = r.comps; S.modules = r.modules;
    st.preview = { moduleId: childId, portId: marker.portId, hostId: marker.module, preSnap, undoLen };
    st.snapId = null;
    applyGhost();
    rebuild(); draw();
    say(`預覽：「${displayName(mod.id)}」接到 ${displayName(marker.module)}・${marker.name}。可以先調整，滿意再按「✔ 接上」。`);
    syncUI(true);
    return true;
  }
  function commit() {
    if (!st.preview) { say('目前沒有要接上的預覽'); return false; }
    const mod = modOf(st.preview.moduleId);
    st.preview = null;
    deps.scheduleAutosave?.();   // 預覽期間只保存確認前的作品；接上後才保存新接法。
    applyGhost();
    drawMarkers();
    say(`已接上「${mod ? displayName(mod.id) : ''}」`);
    syncUI(true);
    return true;
  }
  function cancelPreview({ silent = false } = {}) {
    if (!st.preview) return false;
    const { preSnap, undoLen } = st.preview;
    st.preview = null;
    applyGhost();
    restoreSnapshot(preSnap, undoLen);   // 還原接上前的狀態，並丟掉預覽期間（含調整）累積的復原紀錄
    if (!silent) say('已取消，模組回到原位');
    syncUI(true);
    drawMarkers();
    return true;
  }

  // ---------------------------------------------------------------- 一鍵調整
  const ADJUST_DONE = {
    side: '已換到宿主的另一邊',
    reverse: '已掉頭（前後反過來）',
    rotate: '已繞接合線轉 90°',
    face: '已換到宿主板的另一面'
  };
  function adjust(action) {
    if (!isBench()) return false;
    const id = st.selected;
    const mod = id && modOf(id);
    if (!mod) { say('請先在清單選一個模組'); return false; }
    if (action === 'edit') { editModule(id); return true; }
    if (!mod.mount) { say('這個模組還沒安裝，請先接到宿主上'); return false; }
    if (action === 'unmount' && st.preview) { cancelPreview(); return true; }
    let r;
    if (action === 'angle') r = Bench.toggleAngle(S.comps, S.modules, id, S.topo.params, motorState());
    else if (action === 'flip') {
      r = setMountFlip(S.comps, S.modules, id, !mod.mount.flip);
      if (!r.ok) r = { ...r, reason: opsReason(r.reason) };
    } else if (action === 'unmount') {
      r = unmountModule(S.comps, S.modules, id, S.topo.params, motorState());
      if (!r.ok) r = { ...r, reason: opsReason(r.reason) };
    } else r = Bench.benchAdjust(S.comps, S.modules, id, action, S.topo.params);
    if (!r.ok) { say(r.reason || '這個動作現在不能用'); return false; }
    pushUndo();
    S.comps = r.comps; S.modules = r.modules;
    applyGhost();
    rebuild(); draw();
    const after = modOf(id);
    const o = after && after.mount && after.mount.orient;
    let msg;
    if (action === 'slide+' || action === 'slide-') msg = `已沿邊滑動，位置 ${o && o.offsetMm ? (o.offsetMm > 0 ? '+' : '') + o.offsetMm : 0} mm`;
    else if (action === 'tilt+' || action === 'tilt-') msg = o && o.tiltDeg ? `已傾斜 ${o.tiltDeg}°（兩翼夾角 ${90 + o.tiltDeg}°）` : '已回到直角（傾斜 0°）';
    else if (action === 'angle') msg = after && after.mount && after.mount.orient ? '已改成直角安裝（⟂）' : '已改成同平面安裝（═）';
    else if (action === 'flip') msg = after && after.mount && after.mount.flip ? '已翻面' : '已翻回';
    else if (action === 'unmount') msg = `已拆下「${displayName(mod.id)}」，回到原位`;
    else if (action === 'stand') msg = o && o.edge === 'child' ? '已改成立在宿主的板面上（⤒）' : '已改成壓在宿主的邊上';
    else if (action === 'rotate' && o && o.edge === 'child') msg = `已換站立邊（第 ${o.childEdge} 條底板邊）`;
    else msg = ADJUST_DONE[action] || '完成';
    if ((action === 'rotate' || action === 'reverse') && o && o.edge !== 'child') msg += `（方向 ${o.childAxisDeg}°）`;
    say(msg);
    syncUI(true);
    drawMarkers();
    return true;
  }
  async function editModule(id) {
    const mod = modOf(id);
    if (st.preview) commit();
    await setMode('design');
    if (mod && mod.mount && mod.mount.orient) setViewPlane(id);
  }

  // 不實際套用，只問「這個調整現在能不能做」，給按鈕決定要不要灰掉。
  function adjustState(mod, action) {
    if (!mod || !mod.mount) return { ok: false, reason: '還沒安裝，請先接到宿主上' };
    if (action === 'angle' || action === 'flip' || action === 'unmount' || action === 'edit') return { ok: true };
    const r = Bench.benchAdjust(S.comps, S.modules, mod.id, action, S.topo.params);
    if (!r.ok) return { ok: false, reason: r.reason };
    // 滑到頭時結果與現況相同：視為到端點
    if (action === 'slide+' || action === 'slide-') {
      const before = (mod.mount.orient && mod.mount.orient.offsetMm) || 0;
      const after = r.modules.find(m => m.id === mod.id).mount.orient.offsetMm || 0;
      if (before === after) return { ok: false, reason: '已經滑到桿的盡頭了' };
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- 畫面：清單與面板
  function syncUI(force = false) {
    if (!isBench()) return;
    // 預覽中的模組若被復原／讀檔弄掉了，就丟掉預覽狀態
    if (st.preview) { const pm = modOf(st.preview.moduleId); if (!pm || !pm.mount) { st.preview = null; applyGhost(); } }
    if (st.selected && !modOf(st.selected)) st.selected = null;
    labels = Bench.moduleLabels(S.modules);
    renderList();
    renderPanel(force);
    liveCheck();
  }

  function renderList() {
    const root = listEl();
    if (!root) return;
    const ids = S.modules.map(m => m.id);
    const sig = ids.join('|');
    if (sig !== listSig) {
      listSig = sig;
      cards.forEach((c, id) => { if (!ids.includes(id)) { c.remove(); cards.delete(id); } });
      ids.forEach(id => { if (!cards.has(id)) { const c = makeCard(id); cards.set(id, c); } });
      ids.forEach(id => root.appendChild(cards.get(id)));
      let empty = root.querySelector('.bench-empty');
      if (!S.modules.length) {
        if (!empty) { empty = el('div', 'bench-empty', '作品裡還沒有模組。回「✏️ 設計」從模組庫插入。'); root.appendChild(empty); }
      } else if (empty) empty.remove();
    }
    S.modules.forEach(m => {
      const c = cards.get(m.id);
      if (!c) return;
      c.querySelector('.bench-card-name').textContent = displayName(m.id);
      const status = statusOf(m);
      const sEl = c.querySelector('.bench-card-status');
      sEl.textContent = status;
      sEl.dataset.state = m.mount ? (m.mount.orient ? 'orthogonal' : 'mounted') : 'free';
      c.classList.toggle('selected', m.id === st.selected);
      c.classList.toggle('previewing', !!(st.preview && st.preview.moduleId === m.id));
      c.setAttribute('aria-pressed', m.id === st.selected ? 'true' : 'false');
    });
  }

  function makeCard(id) {
    const card = el('div', 'bench-card');
    card.dataset.module = id;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const grip = el('span', 'bench-grip', '⠿');
    grip.title = '按住拖到 3D 裡的接口';
    const main = el('span', 'bench-card-main');
    main.appendChild(el('b', 'bench-card-name'));
    main.appendChild(el('small', 'bench-card-status'));
    card.appendChild(grip); card.appendChild(main);
    card.addEventListener('click', () => { if (!card.dataset.justDragged) select(id); delete card.dataset.justDragged; });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); } });
    card.addEventListener('pointerdown', e => startDrag(e, id, card));
    return card;
  }

  function renderPanel(force) {
    const root = panelEl();
    if (!root) return;
    const mod = st.selected ? modOf(st.selected) : null;
    const markers = mod && !mod.mount ? computeMarkers() : [];
    const compat = markers.filter(m => m.compatible);
    const shown = markers.filter(m => m.compatible || st.showAll);
    const sig = JSON.stringify([
      mod && mod.id, mod && mod.name, mod ? statusOf(mod) : '', !!st.preview, st.showAll,
      shown.map(m => [m.key, m.compatible, m.suggested]),
      mod ? hasChildren(mod) : false,
      mod && mod.mount ? ['adj', ['side', 'reverse', 'rotate', 'slide-', 'slide+', 'stand', 'face', 'tilt-', 'tilt+'].map(a => adjustState(mod, a).ok), !!mod.mount.orient, mod.mount.orient ? mod.mount.orient.edge : '', !!mod.mount.flip] : 0,
      st.msg
    ]);
    if (!force && sig === panelSig) return;
    panelSig = sig;
    while (root.firstChild) root.removeChild(root.firstChild);

    const head = el('div', 'bench-head');
    head.appendChild(el('div', 'bench-title', mod ? displayName(mod.id) : '組立台'));
    head.appendChild(el('div', 'bench-sub', mod ? statusOf(mod) : '先從清單選一個模組'));
    root.appendChild(head);
    root.appendChild(liveBox);   // B6：即時干涉狀態＋全行程測試（持久節點，面板重建時只是搬回來）

    if (st.preview) {
      const box = el('div', 'bench-preview');
      box.appendChild(el('div', 'bench-preview-text', '預覽中（半透明）。可以先調整位置，滿意再接上。'));
      const row = el('div', 'bench-row');
      const ok = bigBtn('✔ 接上', () => commit(), 'primary'); ok.id = 'benchCommitBtn';
      const no = bigBtn('✖ 取消', () => cancelPreview(), 'danger'); no.id = 'benchCancelBtn';
      row.appendChild(ok); row.appendChild(no);
      box.appendChild(row);
      root.appendChild(box);
    }

    if (mod && !mod.mount) {
      const sec = el('div', 'bench-section');
      sec.appendChild(el('div', 'bench-label', '接到哪裡'));
      if (!mod.base) {
        sec.appendChild(el('div', 'bench-note', '這個模組沒有基準點（base），不能安裝。'));
      } else {
        sec.appendChild(el('div', 'bench-note', '點 3D 裡發亮的接口，或按下面的按鈕；也可以把左邊的卡片拖到接口上。'));
        const makePortBtn = m => {
          const b = el('button', 'bench-btn bench-port' + (m.suggested ? ' suggested' : '') + (m.compatible ? '' : ' incompatible'));
          b.type = 'button';
          b.dataset.port = m.portId;
          b.dataset.module = m.module;
          b.appendChild(el('span', 'bench-port-name', `${m.suggested ? '★ ' : ''}${displayName(m.module)}・${m.name}`));
          b.appendChild(el('small', 'bench-port-kind', m.compatible ? (m.kind === 'bolt' ? '═ 同平面對鎖' : '⟂ 直角安裝') : (m.reason || '不能接')));
          if (!m.compatible) b.setAttribute('aria-disabled', 'true');
          b.addEventListener('click', () => pickPort(m.key));
          return b;
        };
        const list = el('div', 'bench-ports');
        const star = shown.filter(m => m.suggested && m.compatible), rest = shown.filter(m => !(m.suggested && m.compatible));
        star.forEach(m => list.appendChild(makePortBtn(m)));
        if (rest.length) {
          // 建議的接口放最上面；其餘收進摺疊區（沒有建議的接口時直接展開），面板才不會一長串
          const det = document.createElement('details');
          det.className = 'bench-more';
          det.open = !star.length || st.moreOpen || st.showAll;
          det.addEventListener('toggle', () => { if (star.length) st.moreOpen = det.open; });
          det.appendChild(el('summary', 'bench-more-sum', `其他接口（${rest.length}）`));
          const inner = el('div', 'bench-ports');
          rest.forEach(m => inner.appendChild(makePortBtn(m)));
          det.appendChild(inner);
          list.appendChild(det);
        }
        if (!shown.length) list.appendChild(el('div', 'bench-note', '找不到可以接的接口（其他模組可能還沒放進來）。'));
        sec.appendChild(list);
        const lab = el('label', 'bench-check');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.id = 'benchShowAll'; cb.checked = st.showAll;
        cb.addEventListener('change', () => { st.showAll = cb.checked; syncUI(true); drawMarkers(); });
        lab.appendChild(cb); lab.appendChild(el('span', null, '顯示全部接口'));
        sec.appendChild(lab);
      }
      root.appendChild(sec);
    }

    if (mod && mod.mount) {
      const sec = el('div', 'bench-section');
      sec.appendChild(el('div', 'bench-label', '調整'));
      const grid = el('div', 'bench-grid');
      const standing = !!(mod.mount.orient && mod.mount.orient.edge === 'child');   // D3
      const defs = [
        ['angle', '⟂/═ 直角↔同平面'], ['rotate', standing ? '↻ 換站立邊' : '↻ 轉 90°'], ['reverse', '⟲ 掉頭'], ['side', '⇅ 換邊'],
        ['stand', standing ? '⤒ 壓在邊上' : '⤒ 立在面上'], ['face', '⇵ 換面'],
        ['slide-', '◀ 5mm'], ['slide+', '5mm ▶'], ['tilt-', '◣ 傾斜 −15°'], ['tilt+', '傾斜 +15° ◢'], ['flip', '翻面'], ['unmount', '拆下'], ['edit', '✏️ 編輯此模組']
      ];
      defs.forEach(([action, label]) => {
        const state = adjustState(mod, action);
        const b = bigBtn(label, () => adjust(action), action === 'unmount' ? 'danger' : '');
        b.dataset.benchAction = action;
        if (!state.ok) { b.setAttribute('aria-disabled', 'true'); b.title = state.reason || ''; b.classList.add('is-disabled'); }
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      root.appendChild(sec);
    }

    // B7：有模組裝在它上面時，可以把整組存成組合積木（進模組庫，下次整組插入）。
    if (mod && hasChildren(mod)) {
      const sec = el('div', 'bench-section');
      const b = bigBtn('💾 存成組合積木', () => {
        const t = saveComposite(mod.id);
        if (t) say(`已存成組合積木「${t.name}」`, { toast: false });
      });
      b.id = 'benchSaveComposite';
      sec.appendChild(b);
      const x = bigBtn('⬇ 匯出組合積木', () => { const t = exportComposite(mod.id); if (t) say(`已匯出組合積木「${t.name}」`, { toast: false }); });
      x.id = 'benchExportComposite';
      sec.appendChild(x);
      root.appendChild(sec);
    }

    const msg = el('div', 'bench-msg', st.msg);
    msg.id = 'benchMsg';
    msg.setAttribute('aria-live', 'polite');
    root.appendChild(msg);
    root.appendChild(el('div', 'bench-hint', '播放（▶、M1／M2）照常可用，接口會跟著宿主移動。'));
  }

  function bigBtn(text, onClick, cls) {
    const b = el('button', 'bench-btn' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------------------------------------------------------------- 點 3D 裡的標記
  function distSeg(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }
  function screenDist(marker, x, y) {
    const v = viewer();
    const ps = marker.points.map(p => v.project(p));
    if (ps.some(p => !p)) return Infinity;
    return ps.length === 1 ? Math.hypot(x - ps[0].x, y - ps[0].y) : distSeg(x, y, ps[0], ps[1]);
  }
  // 離 (x,y) 最近、在 radius 內的標記（compatibleOnly：只看相容的）。
  function nearestMarker(x, y, radius, compatibleOnly) {
    let best = null, bestD = radius;
    visibleMarkers().forEach(m => {
      if (compatibleOnly && !m.compatible) return;
      const d = screenDist(m, x, y) - (m.suggested ? 2 : 0);
      if (d <= bestD) { best = m; bestD = d; }
    });
    return best;
  }

  function bindCanvas(v) {
    const canvas = v.canvas;
    if (st.canvasBound === canvas) return;
    st.canvasBound = canvas;
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    canvas.addEventListener('pointerup', e => {
      if (!isBench() || !down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > DRAG_START_PX || drag) return;   // 轉視角、或正在拖卡片
      const mod = st.selected && modOf(st.selected);
      if (!mod || mod.mount || st.preview) return;
      const m = nearestMarker(e.clientX, e.clientY, e.pointerType === 'mouse' ? TAP_PX_MOUSE : TAP_PX_TOUCH, false);
      if (!m) return;
      if (!m.compatible) { say(m.reason || '這個接口不能接'); return; }
      pickPort(m.key);
    });
  }

  // ---------------------------------------------------------------- 拖曳吸附
  function startDrag(e, id, card) {
    if (!isBench() || e.button > 0) return;
    // 觸控只從把手開始（卡片本身要留給橫向捲動）；滑鼠整張卡片都能拖
    if (e.pointerType !== 'mouse' && !(e.target && e.target.closest && e.target.closest('.bench-grip'))) return;
    drag = { id, card, x0: e.clientX, y0: e.clientY, active: false, proxy: null, pointerId: e.pointerId };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragCancel);
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START_PX) return;
      drag.active = true;
      const mod = modOf(drag.id);
      if (mod && mod.mount) say(`「${displayName(mod.id)}」已經裝上了，要先「拆下」才能重新拖到別處`);
      else select(drag.id);
      const proxy = el('div', 'bench-drag-proxy', mod ? `🧩 ${displayName(mod.id)}` : '🧩');
      document.body.appendChild(proxy);
      drag.proxy = proxy;
      document.body.classList.add('bench-dragging');
    }
    e.preventDefault();
    drag.proxy.style.left = `${e.clientX}px`;
    drag.proxy.style.top = `${e.clientY}px`;
    const mod = modOf(drag.id);
    let snap = null;
    if (mod && !mod.mount && !st.preview && viewer()) {
      const m = nearestMarker(e.clientX, e.clientY, SNAP_PX, true);
      snap = m ? m.key : null;
    }
    if (snap !== st.snapId) { st.snapId = snap; drawMarkers(); }
    drag.proxy.classList.toggle('snapping', !!snap);
  }
  function endDrag() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragCancel);
    if (drag && drag.proxy) drag.proxy.remove();
    document.body.classList.remove('bench-dragging');
    const d = drag;
    drag = null;
    return d;
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const snap = st.snapId;
    const d = endDrag();
    if (d.active) {
      d.card.dataset.justDragged = '1';   // 吃掉放開後接著觸發的 click，避免重複選取
      setTimeout(() => { delete d.card.dataset.justDragged; }, 0);
      st.snapId = null;
      if (snap) pickPort(snap);
      else drawMarkers();   // 放在別處：什麼都不做
    }
  }
  function onDragCancel() {
    const d = endDrag();
    if (d && d.active) { st.snapId = null; drawMarkers(); }
  }

  // Esc：取消預覽
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isBench() && st.preview) cancelPreview(); });

  // 手機底部面板的高度 → CSS 變數，讓 3D 畫面與控制列避開它
  const panel = panelEl();
  if (panel && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      const h = isBench() ? panel.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty('--bench-sheet-h', `${Math.round(h)}px`);
      const v = viewer();
      if (v && isBench()) v.resize();
    }).observe(panel);
  }

  function debug() {
    const vis = visibleMarkers();
    const all = computeMarkers();
    return {
      mode: S.mode,
      selected: st.selected,
      markers: vis.length,
      markersAll: all.length,
      markerList: all.map(m => ({ key: m.key, portId: m.portId, module: m.module, compatible: m.compatible })),   // D2：含宿主模組，同名接口分得開
      compatible: all.filter(m => m.compatible).map(m => m.portId),
      suggested: all.filter(m => m.suggested && m.compatible).map(m => m.portId),
      preview: st.preview ? { moduleId: st.preview.moduleId, portId: st.preview.portId, hostId: st.preview.hostId } : null,
      snap: st.snapId,
      showAll: st.showAll,
      msg: st.msg,
      live: { ready: live.ready, hits: live.hits, keys: live.keys, findings: live.findings.length, checks: live.checks, planBuilds: live.planBuilds, ms: live.ms },
      timeline: tl.result ? { ms: tl.ms, summary: tl.summary.map(x => x.text) } : null,
      // 方便測試（C2）：各直角子平面的桿，在螢幕上的中點（用畫該平面子場景的同一個矩陣）。
      planeParts: Object.fromEntries(Object.entries((st.lastScene && st.lastScene.planes) || {}).map(([id, pl]) => {
        const v = viewer();
        return [id, v ? pl.sticks.map(sk => {
          const q = v.project(applyMatrix4(pl.matrix, { x: (sk.a.x + sk.b.x) / 2, y: (sk.a.y + sk.b.y) / 2, z: Number.isFinite(sk.z) ? sk.z : 0 }));
          return q ? { id: sk.id, x: q.x, y: q.y } : null;
        }).filter(Boolean) : []];
      })),
      // 方便測試：某個標記在螢幕上的位置（clientX/Y）。edge 取線段中點。
      // key＝`模組id|接口id`（唯一）；舊的單獨接口 id 也保留（同名時留第一個）。
      screen: (() => {
        const out = {};
        all.forEach(m => {
          const v = viewer();
          const ps = v ? m.points.map(p => v.project(p)) : [];
          const at = !ps.length || ps.some(p => !p) ? null
            : { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
          out[m.key] = at;
          if (!(m.portId in out)) out[m.portId] = at;
        });
        return out;
      })()
    };
  }

  syncModeButtons();
  return {
    autosaveSnapshot: () => st.preview ? JSON.parse(st.preview.preSnap) : null,
    setMode, select, pickPort, commit, cancel: () => cancelPreview(), adjust, syncUI, afterScene, debug,
    liveCheck: () => liveCheck(true), runTimeline, jumpTo,
    setShowAll(on) { st.showAll = !!on; syncUI(true); drawMarkers(); }
  };
}
