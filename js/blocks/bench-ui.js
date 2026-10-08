import { faceBracketStatus } from './face-bracket-extras.js';
import { checkLiveInterference, liveInterferenceStatus } from './live-interference-status.js';
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
import { openFaceWizard } from './face-wizard-ui.js?v=20261007_singleface';
import * as Bench from './bench.js?v=20261007_m5a';
import { createMateWizard } from './mate-wizard-ui.js?v=20261008_brackets';
import { moduleFrameEdges } from './assembly.js?v=20261007_m5a';
import * as Settings from './settings.js';
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';
import { resolveSpacers, findInterference, interferenceTimeline, hitPartNames } from './interference.js';
import { setMountFlip } from './module-ops.js?v=20261007_m5a';
import { mateAdjust, mateDetach } from './mate-connect.js?v=20261007_8_final';   // M5a：滑動不能擠到鄰居；拆下時帶著底下整串
import { pointKeysFor } from './part-types.js';
import { hitLabels, relabelText } from './part-labels.js';   // M6：干涉訊息用「哪個機構的什麼」，不露零件內部名稱
import { applyMatrix4, moduleFrameZ } from '../blocks3d/orthogonal-3d.js?v=20261007_m5a';

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
  const exportComposite = deps.exportComposite || (() => null);   // 組合積木匯出 JSON
  const inCand = deps.withCandidate || (fn => fn());   // M4：接合精靈預覽中，干涉檢查看的是候選作品（見 app.js withCandidate）
  const isCand = deps.inCandidate || (() => false);
  let wiz = null;   // M4：接合精靈（mate-wizard-ui.js）；非進階模式時由它畫清單、面板與 3D 承接面標記
  const wizardOn = () => !!wiz && !wiz.advanced();   // B7：存成組合積木（由 app.js 接到模組編輯器的模組庫）

  const st = { faceStep: null, moreOpen: false, selected: null, preview: null, showAll: false, snapId: null, msg: '', lastScene: null, wasIn3D: false, tilted: false, canvasBound: null };
  let listSig = '', panelSig = '';
  const cards = new Map();   // moduleId -> 卡片 DOM（就地更新，不重建，拖曳中的卡片才不會被換掉）
  let drag = null;
  let labels = new Map();    // moduleId -> 顯示標籤（同名模組加編號）

  const listEl = () => document.getElementById('benchList');
  const panelEl = () => document.getElementById('benchPanel');
  const viewer = () => getViewer();
  const modOf = id => S.modules.find(m => m && m.id === id) || null;
  const isBench = () => S.mode === 'bench';
  const defaultJointKind = () => (S.fabrication?.joint || FABRICATION_DEFAULTS.joint).defaultKind;   // F1：作品的預設直角接合件
  const hasChildren = mod => S.modules.some(m => m && m.mount && m.mount.to && m.mount.to.module === mod.id);
  const displayName = id => labels.get(id) || id;
  const labelOpts = { displayName: id => labels.get(id) || null };   // 同名機構用編號後的名字

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
    if (mod.mount.face) return `六面接合 · ${hostName}${faceBracketStatus(S.comps,S.modules,S.topo.params,mod,{exportSettings:Settings.exportSettings()}).fixed ? '（角碼固定）' : '（已定位，尚未固定）'}`;
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
    const tilt = (o && o.tiltDeg ? ` 傾斜 ${o.tiltDeg}°` : '') + (o ? (o.joint && o.joint.kind === 'bracket-m3' ? '・角碼' : '・列印') : '');   // D4；E1：接合件
    if (o && o.edge === 'child') return `⟂ 立在 ${hostName}・${outName}（${o.face === -1 ? '下面' : '上面'}）${mod.mount.flip ? '（翻面）' : ''}${tilt}`;   // D3
    return `${o ? '⟂ 直角裝在' : '裝在'} ${hostName}・${outName}${mod.mount.flip ? '（翻面）' : ''}${tilt}`;
  }


  // ---------------------------------------------------------------- B6：即時干涉與全行程測試
  // live：目前姿勢的檢查結果；plan：疊層＋隔圈的快取（只在作品內容變了才重算）；tl：全行程時間軸結果。
  const live = { plan: null, planKey: '', args: null, sig: '', findings: [], hits: [], labels: [], msg: '', keys: [], at: 0, timer: null, checks: 0, planBuilds: 0, ms: 0, ready: false, error: false };
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
    live.plan = null; live.error = false;
    live.planBuilds++;
    try {
      const args = interferenceArgs();
      const { plan } = resolveSpacers(args);
      live.plan = plan; live.args = args;
    } catch (e) { live.plan = null; live.args = null; live.error = true; }
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
      // G1：同平面安裝的模組固定板（畫在它所在平面的場景）；世界機架板仍是 'frame'。
      if (part.kind === 'frame') { keys.add(fmod ? `${part.plane ? part.plane + '/' : ''}modframe:${fmod.id}` : 'frame'); return; }
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

  function currentLiveStatus() {
    return liveInterferenceStatus({ hasFace: S.modules.some(m => m?.mount?.face), ready: live.ready, hasParts: !!live.plan?.parts?.length, error: live.error, n: live.findings.length, labels: live.labels });
  }
  function renderLiveStatus() { renderLiveBox(); if (wiz) wiz.syncLive(); }
  function renderLiveBox() {
    if (!liveBox) return;
    const box = liveBox.querySelector('#benchLive');
    if (!box) return;
    const status = currentLiveStatus();
    if (status.state !== 'hit') { box.dataset.state = status.state; box.textContent = status.message; return; }
    box.dataset.state = 'hit';
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el('div', 'bench-live-main', `✖ 撞到：${nameList(live.labels)}（共 ${live.findings.length} 項）`));
    box.appendChild(el('div', 'bench-live-msg', live.msg));
  }

  function applyHighlight() {
    const v = viewer();
    if (v && v.setHighlight) v.setHighlight(isBench() ? live.keys : []);
  }

  // 檢查目前姿勢。force：忽略節流與「沒變」判斷。
  function runLive(force = false) { return inCand(() => runLiveNow(force)); }
  function runLiveNow(force) {
    if (!isBench()) return;
    live.timer = null;
    const st0 = ensurePlan();
    const pose = currentPose();
    const sig = JSON.stringify(pose);
    if (!force && sig === live.sig && live.ready) { updateCursors(); return; }
    const t0 = performance.now();
    const result = st0.plan && st0.args ? checkLiveInterference(() => findInterference({ ...st0.args, plan: st0.plan, pose })) : { findings: [], ready: false, error: live.error };
    const findings = result.findings;
    live.ms = performance.now() - t0;
    live.sig = sig; live.at = performance.now(); live.checks++; live.ready = result.ready; live.error = result.error;
    live.findings = findings;
    live.hits = hitPartNames(findings);
    live.labels = hitLabels(live.hits, S.comps, S.modules, labelOpts); live.msg = findings.length ? relabelText(findings[0].message, findings[0].parts, S.comps, S.modules, labelOpts) : '';
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
    live.sig = ''; live.findings = []; live.hits = []; live.labels = []; live.msg = ''; live.keys = []; live.ready = false; live.error = false;
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
  function runTimeline() { return inCand(runTimelineNow); }
  function runTimelineNow() {
    if (!isBench()) return null;
    if (S.modules.some(m => m?.mount?.face)) { say('六面接合的跨面干涉尚未驗證'); return null; }
    const st0 = ensurePlan();
    if (!st0.plan) { say('目前沒有可檢查的零件'); return null; }
    const args = interferenceArgs();
    const t0 = performance.now();
    let result;
    try { result = interferenceTimeline({ ...args, plan: st0.plan, ranges: args.ranges, stepDeg: TL_STEP_DEG }); } catch (e) { clearTimeline(); say('全行程干涉檢查失敗，請重新檢查；目前無法判定'); return null; }
    tl.ms = performance.now() - t0;
    tl.result = result; tl.ranges = args.ranges;
    tl.summary = [];
    Object.keys(result.motors).forEach(id => {
      runsOf(result.motors[id]).forEach(r => {
        const names = hitLabels(r.names, S.comps, S.modules, labelOpts);
        tl.summary.push({ motor: id, from: r.from, to: r.to, names,
          text: `${motorLabel(id)} 在 ${r.from === r.to ? fmtDeg(r.from) : `${fmtDeg(r.from)}～${fmtDeg(r.to)}`} 會撞到 ${nameList(names, 5)}` });
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
    if (!isBench()) return [];
    if (wizardOn()) return wiz.markers();   // 精靈：只亮可接的承接面
    if (st.preview) return [];
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
    if (st.faceStep === 'child') {
      v.setMarkers(childFaceEdges().map((edge, i) => ({ kind: 'edge', points: edge.points, tone: 'suggested', label: `底板邊 ${i + 1}` })));
      return;
    }
    const list = visibleMarkers().map(m => {
      const tone = toneOf(m);
      return {
        kind: m.kind, points: m.points, tone,
        label: (tone === 'snap' || tone === 'suggested') ? m.name : '',
        labelPx: m.labelPx, labelDir: m.labelDir   // 精靈的承接面標籤：固定螢幕大小，上下錯開
      };
    });
    v.setMarkers(list);
  }
  function ghostSpec() { return st.preview ? ghostFor(modOf(st.preview.moduleId), S.comps) : null; }
  function ghostFor(mod, comps) {
    if (!mod || !mod.mount) return null;
    if (mod.mount.orient) return { prefix: mod.id };
    const ids = new Set([mod.id]);   // G1：模組固定板的 pickKey＝modframe:<模組 id>
    comps.filter(c => c.moduleId === mod.id).forEach(c => {
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
    st.faceStep = null;
    viewer()?.highlightSurface?.(null);
    if (mode === 'bench') {
      S.mode = 'bench';
      document.body.dataset.mode = 'bench';
      deps.enterBench?.();
      syncModeButtons();
      if (S.viewPlane) setViewPlane(null);
      wiz.onEnter();   // M4：精靈模式、只有一個機構有地方可接 → 自動選它
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
      wiz.fit();   // M4：精靈把相機拉到剛好框住全部機構
    } else {
      cancelPreview({ silent: true });
      wiz.cancel({ silent: true });
      const v = viewer();
      if (v) { v.releaseFit && v.releaseFit(); v.setMarkers([]); v.setPreviewGhost(null); v.setPickEnabled(true); }
      const prevFocus = S.designFocus;
      if (st.selected && modOf(st.selected)) S.designFocus = st.selected;   // H1：設計模式聚焦組立台選的模組，沒選就維持原本的分頁
      S.mode = 'design';
      resetLive(); clearTimeline();
      delete document.body.dataset.mode;
      st.snapId = null;
      syncModeButtons();
      if (!st.wasIn3D) await set3D(false);
      if (deps.enterDesign) deps.enterDesign(prevFocus !== S.designFocus);
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
    if (wiz.previewOf() && next !== wiz.previewOf()) wiz.cancel();
    if (next !== st.selected) { st.faceStep = null; viewer()?.highlightSurface?.(null); }
    st.selected = next;
    st.snapId = null;
    const mod = next && modOf(next);
    if (mod && !wizardOn()) {
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
    if (wizardOn()) return wiz.pickKey(portId);
    const childId = st.selected;
    if (!childId) { say('請先在清單選一個要安裝的模組'); return false; }
    if (st.preview) cancelPreview({ silent: true });
    const mod = modOf(childId);
    if (mod && mod.mount) { say(`「${displayName(mod.id)}」已經裝在別處，要先按「拆下」`); return false; }
    const all = computeMarkers();
    const marker = all.find(m => m.key === portId) || all.find(m => m.portId === portId && m.compatible) || all.find(m => m.portId === portId);
    if (!marker) { say('找不到這個接口'); return false; }
    if (!marker.compatible) { say(marker.reason || '這個接口不能接'); return false; }
    const r = Bench.connect(S.comps, S.modules, childId, { module: marker.module, port: marker.portId }, S.topo.params, motorState(), { joint: defaultJointKind() });   // F1：用作品的預設接合件（fabrication.joint.defaultKind）
    if (!r.ok) { say(r.reason || '接不上'); return false; }
    const preSnap = snapshotStr();
    const undoLen = S.undoStack.length;
    pushUndo();
    S.comps = r.comps; S.modules = r.modules;
    st.faceStep = null;
    st.preview = { moduleId: childId, portId: marker.portId, hostId: marker.module, preSnap, undoLen };
    st.snapId = null;
    applyGhost();
    rebuild(); draw();
    say(`預覽：「${displayName(mod.id)}」接到 ${displayName(marker.module)}・${marker.name}。可以先調整，滿意再按「✔ 接上」。`);
    syncUI(true);
    return true;
  }
  function commit() {
    if (st.faceStep === 'child') { say('請先點選子模組底板的接觸邊面，或取消選面'); return false; }
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
    st.faceStep = null;
    viewer()?.highlightSurface?.(null);
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
    if (mod.mount.face && action !== 'unmount') { say('六面接合請拆下後重新選面與尺寸'); return false; }
    if (action === 'unmount' && st.preview) { cancelPreview(); return true; }
    let r;
    if (action === 'angle') r = Bench.toggleAngle(S.comps, S.modules, id, S.topo.params, motorState(), { joint: defaultJointKind() });
    else if (action === 'flip') {
      r = setMountFlip(S.comps, S.modules, id, !mod.mount.flip);
      if (!r.ok) r = { ...r, reason: opsReason(r.reason) };
    } else if (action === 'unmount') {
      r = mateDetach(S.comps, S.modules, id, S.topo.params, motorState());
    } else r = mateAdjust(S.comps, S.modules, id, action, S.topo.params, { joint: S.fabrication?.joint });
    if (!r.ok) { say(r.reason || '這個動作現在不能用'); return false; }
    pushUndo();
    S.comps = r.comps; S.modules = r.modules;
    if (action === 'joint:printed' || action === 'joint:bracket-m3') Settings.setJointDefaultKind(action.slice(6));   // F1：記住使用者的選擇，存成作品的預設，之後新接的也用它（隨作品保存）
    applyGhost();
    rebuild(); draw();
    const after = modOf(id);
    const o = after && after.mount && after.mount.orient;
    let msg;
    if (action === 'slide+' || action === 'slide-') msg = `已沿邊滑動，位置 ${o && o.offsetMm ? (o.offsetMm > 0 ? '+' : '') + o.offsetMm : 0} mm`;
    else if (action.startsWith('align-')) msg = '已對齊接合座，可繼續沿邊微調';
    else if (action === 'joint:printed' || action === 'joint:bracket-m3') msg = action === 'joint:printed' ? '已改用 3D 列印轉接座（可以傾斜，要下載 STL 列印）' : '已改用 M3 金屬角碼（只有 90°，不用列印）';
    else if (action === 'tilt+' || action === 'tilt-') msg = o && o.tiltDeg ? `已傾斜 ${o.tiltDeg}°（兩翼夾角 ${90 + o.tiltDeg}°）` : '已回到直角（傾斜 0°）';
    else if (action === 'angle') msg = after && after.mount && after.mount.orient ? '已改成直角安裝（⟂）' : '已改成同平面安裝（═）';
    else if (action === 'flip') msg = after && after.mount && after.mount.flip ? '已翻面' : '已翻回';
    else if (action === 'unmount') msg = `已拆下「${displayName(mod.id)}」，回到原位${r.moved ? `（裝在它身上的 ${r.moved} 個一起回到未安裝）` : ''}`;
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
    if (st.preview && !commit()) return;
    await setMode('design');
    if (mod && mod.mount && mod.mount.orient) setViewPlane(id);
  }

  // 不實際套用，只問「這個調整現在能不能做」，給按鈕決定要不要灰掉。
  function adjustState(mod, action) {
    if (!mod || !mod.mount) return { ok: false, reason: '還沒安裝，請先接到宿主上' };
    if (mod.mount.face && action !== 'unmount' && action !== 'edit') return { ok: false, reason: '六面接合請拆下後重新選面與尺寸' };
    if (action === 'angle' || action === 'flip' || action === 'unmount' || action === 'edit') return { ok: true };
    const r = mateAdjust(S.comps, S.modules, mod.id, action, S.topo.params, { joint: S.fabrication?.joint });
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
    if (isCand()) { liveCheck(); return; }   // 預覽中的重畫（S 暫時換成候選）：只更新干涉，不重畫面板
    // 預覽中的模組若被復原／讀檔弄掉了，就丟掉預覽狀態
    if (st.preview) { const pm = modOf(st.preview.moduleId); if (!pm || !pm.mount) { st.preview = null; st.faceStep = null; viewer()?.highlightSurface?.(null); applyGhost(); } }
    if (st.selected && !modOf(st.selected)) { st.selected = null; st.faceStep = null; viewer()?.highlightSurface?.(null); }
    labels = Bench.moduleLabels(S.modules);
    if (wizardOn()) wiz.render(force);
    else { renderList(); renderPanel(force); wiz.ensureToggle(panelEl()); }
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
    const close = el('button', 'bench-card-close', '×');
    close.type = 'button';
    close.title = `刪除「${displayName(id)}」整組設計`;
    close.setAttribute('aria-label', close.title);
    close.addEventListener('pointerdown', e => e.stopPropagation());
    close.addEventListener('keydown', e => e.stopPropagation());
    close.addEventListener('click', e => {
      e.stopPropagation();
      if (st.preview) cancelPreview({ silent: true });
      deps.deleteDesign?.(id);
    });
    card.appendChild(close);
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
      mod && mod.mount ? ['adj', ['side', 'reverse', 'rotate', 'slide-', 'slide+', 'stand', 'face', 'tilt-', 'tilt+'].map(a => adjustState(mod, a).ok), mod.mount.orient && mod.mount.orient.joint ? mod.mount.orient.joint.kind : '', !!mod.mount.orient, mod.mount.orient ? mod.mount.orient.edge : '', !!mod.mount.flip] : 0,
      st.msg, st.faceStep
    ]);
    if (!force && sig === panelSig) return;
    panelSig = sig;
    while (root.firstChild) root.removeChild(root.firstChild);

    const head = el('div', 'bench-head');
    head.appendChild(el('div', 'bench-title', mod ? displayName(mod.id) : '組立台'));
    head.appendChild(el('div', 'bench-sub', mod ? statusOf(mod) : '先從清單選一個模組'));
    root.appendChild(head);
    if (st.faceStep) {
      root.appendChild(el('div', 'bench-preview-text', st.faceStep === 'host' ? '點選另一模組的板件正面或背面。' : '再點子模組底板上發亮的接觸邊面；可旋轉視角。'));
      root.appendChild(bigBtn('取消選面', () => { st.faceStep = null; viewer()?.highlightSurface?.(null); if (st.preview) cancelPreview(); syncUI(true); }));
    }
    root.appendChild(liveBox);   // B6：即時干涉狀態＋全行程測試（持久節點，面板重建時只是搬回來）
    if (mod?.mount?.face) {
      const selection = mod.mount.face.selection;
      root.appendChild(el('div', 'bench-note', `間距 ${selection.gap} mm · 偏移 ${selection.offsetU} / ${selection.offsetV} mm`));
      root.appendChild(bigBtn('拆下重新選面', () => adjust('unmount')));
      root.appendChild(bigBtn('編輯機構', () => adjust('edit')));
      root.appendChild(el('div', 'bench-note', '已定位，尚未固定。請配置角碼並確認固定孔。'));
      return;
    }

    if (st.faceStep === 'child') {
      root.appendChild(el('div', 'bench-note', '點選發亮的底板邊線，決定哪個邊面接觸宿主。選好後才進入位置微調。'));
      return;
    }

    if (mod && !mod.mount) {
      const sec = el('div', 'bench-section');
      sec.appendChild(el('div', 'bench-label', '① 選相接的邊／面'));
      const wizardButton = bigBtn('六面體精靈', () => openDefaultFaceWizard(mod));
      wizardButton.id = 'benchFaceWizard'; sec.appendChild(wizardButton);
      sec.appendChild(bigBtn('點選 3D 接合面', () => beginFacePick()));
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
      const standing = !!(mod.mount.orient && mod.mount.orient.edge === 'child');
      const addActions = (parent, defs) => {
        const grid = el('div', 'bench-grid');
        defs.forEach(([action, label]) => {
          const state = adjustState(mod, action);
          const b = bigBtn(label, () => adjust(action), action === 'unmount' ? 'danger' : '');
          b.dataset.benchAction = action;
          if (!state.ok) { b.disabled = true; b.title = state.reason || ''; b.classList.add('is-disabled'); }
          grid.appendChild(b);
        });
        parent.appendChild(grid);
      };
      sec.appendChild(el('div', 'bench-label', '① 確認相接的邊／面'));
      if (st.preview) sec.appendChild(bigBtn('重新點選接合面', () => beginFacePick()));
      sec.appendChild(el('div', 'bench-note', `接到「${displayName(mod.mount.to.module)}」；${mod.mount.orient ? (standing ? '立在板面上' : '接在邊上') : '同平面對鎖'}。`));
      addActions(sec, [['stand', standing ? '改接在邊上' : '改立在板面上'], ['face', '換到另一面']]);
      const more = document.createElement('details');
      more.appendChild(el('summary', 'bench-more-sum', '接合方向與其他調整'));
      addActions(more, [['angle', '直角 ↔ 同平面'], ['rotate', standing ? '換站立邊' : '轉 90°'], ['reverse', '掉頭'], ['side', '換邊'], ['flip', '翻面']]);
      sec.appendChild(more);
      sec.appendChild(el('div', 'bench-label', '② 對齊與微調位置'));
      if (mod.mount.orient) {
        sec.appendChild(el('div', 'bench-note', '沿接合邊移動；對齊的是接合座範圍，不是整個模組外形。'));
        addActions(sec, [['align-start', '靠起點'], ['align-center', '置中'], ['align-end', '靠終點'], ['slide-', '往起點 5 mm'], ['slide+', '往終點 5 mm']]);
      } else sec.appendChild(el('div', 'bench-note', '同平面對鎖以接點定位，不能沿邊滑動。'));
      sec.appendChild(el('div', 'bench-label', '③ 選固定件並接上'));
      // E1：直角安裝的接合件（金屬角碼｜3D 列印），放在定位之後選擇。
      if (mod.mount.orient) {
        const cur = mod.mount.orient.joint?.kind === 'bracket-m3' ? 'bracket-m3' : 'printed';
        const seg = el('div', 'bench-seg');
        seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '接合件');
        [['bracket-m3', '🔩 金屬角碼'], ['printed', '🖨 3D 列印']].forEach(([kind, label]) => {
          const b = bigBtn(label, () => adjust(`joint:${kind}`), 'bench-seg-btn' + (cur === kind ? ' is-on' : ''));
          b.dataset.benchAction = `joint:${kind}`;
          b.setAttribute('aria-pressed', String(cur === kind));
          seg.appendChild(b);
        });
        sec.appendChild(seg);
        if (cur === 'printed') addActions(sec, [['tilt-', '傾斜 −15°'], ['tilt+', '傾斜 +15°']]);
      } else sec.appendChild(el('div', 'bench-note', '同平面接點對鎖，不使用直角角碼。'));
      root.appendChild(sec);
    if (st.preview) {
      const box = el('div', 'bench-preview');
      box.appendChild(el('div', 'bench-preview-text', '預覽中。確認位置與固定件後，再按接上。'));
      const row = el('div', 'bench-row');
      const ok = bigBtn('✔ 接上', () => commit(), 'primary'); ok.id = 'benchCommitBtn';
      const no = bigBtn('✖ 取消', () => cancelPreview(), 'danger'); no.id = 'benchCancelBtn';
      row.appendChild(ok); row.appendChild(no);
      box.appendChild(row);
      root.appendChild(box);
    }

      const maintenance = document.createElement('details');
      maintenance.appendChild(el('summary', 'bench-more-sum', '拆下與編輯'));
      addActions(maintenance, [['unmount', st.preview ? '重新選接合位置' : '拆下'], ['edit', '編輯此模組']]);
      root.appendChild(maintenance);
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

  function childFaceEdges() {
    const pl = st.lastScene?.planes?.[st.selected];
    if (!pl) return [];
    return moduleFrameEdges(S.comps, S.modules, st.selected, S.topo.params, { noOwnHoles: true }).map(edge => ({
      ...edge, points: [edge.a, edge.b].map(p => applyMatrix4(pl.matrix, { x: p.x, y: p.y, z: 0 }))
    }));
  }
  function chooseChildEdge(index) {
    if (!adjust(`child-edge:${index}`)) return;
    st.faceStep = null;
    viewer()?.highlightSurface?.(null);
    say('兩個接合面已選好，接著置中或微調位置。');
    syncUI(true); drawMarkers();
  }
  function beginFacePick() {
    deps.pause?.();
    if (st.preview) cancelPreview({ silent: true });
    st.faceStep = 'host';
    say('請點選宿主板件的正面或背面；旋轉視角可選背面。');
    syncUI(true);
  }
  function pickAssemblyFace(hit) {
    if (!hit) { say('這裡不是可接合的板面，請點桿件或底板。'); return; }
    const slash = hit.key.lastIndexOf('/');
    const plane = slash < 0 ? null : hit.key.slice(0, slash);
    const raw = hit.key.slice(slash + 1);
    if (st.faceStep === 'child') {
      if (plane !== st.selected || !['frame', `modframe:${st.selected}`].includes(raw)) {
        say('請點半透明子模組的底板窄邊面，不是活動桿件。'); return;
      }
      const edges = moduleFrameEdges(S.comps, S.modules, st.selected, S.topo.params, { noOwnHoles: true });
      let best = -1, distance = Infinity;
      edges.forEach((edge, i) => {
        const d = distSeg(hit.point.x, hit.point.y, edge.a, edge.b);
        if (d < distance) { best = i; distance = d; }
      });
      if (best < 0 || distance > 12) { say('請靠近底板外框點選，指定要接觸的邊面。'); return; }
      chooseChildEdge(best);
      return;
    }
    if (Math.abs(hit.normal.z) < 0.9) { say('先點宿主寬的板面；子模組接觸邊面在下一步選。'); return; }
    const candidates = computeMarkers().filter(m => m.compatible && m.kind === 'edge' && (m.plane || null) === plane
      && (raw.startsWith('stick:') ? m.portId.startsWith(`edge:${raw.slice(6)}:`)
        : raw === 'frame' ? m.portId.startsWith('edge:frame:')
        : raw.startsWith('modframe:') && m.module === raw.slice(9) && m.portId.startsWith('edge:frame:')));
    const p = viewer().project(hit.world);
    candidates.sort((a, b) => screenDist(a, p.x, p.y) - screenDist(b, p.x, p.y));
    const marker = candidates[0];
    if (!marker) { say('這個板面沒有可用的接合位置，請選其他板件。'); return; }
    if (!pickPort(marker.key)) return;
    if (!adjust('stand')) { cancelPreview({ silent: true }); st.faceStep = 'host'; say('此板面空間不足，請選其他板面。'); syncUI(true); return; }
    if (hit.normal.z < 0) adjust('face');
    st.faceStep = 'child';
    drawMarkers();
    say('宿主板面已選好，再點半透明子模組底板靠近接觸邊的位置。');
    syncUI(true);
  }

  function bindCanvas(v) {
    const canvas = v.canvas;
    if (st.canvasBound === canvas) return;
    st.canvasBound = canvas;
    let down = null;
    canvas.addEventListener('pointermove', e => {
      if (isBench() && st.faceStep && !down) v.highlightSurface?.(v.pickSurface?.(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    canvas.addEventListener('pointerup', e => {
      if (!isBench() || !down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > DRAG_START_PX || drag) return;   // 轉視角、或正在拖卡片
      if (st.faceStep === 'child') {
        const edges = childFaceEdges();
        const choices = edges.map((edge, index) => ({ index, d: screenDist(edge, e.clientX, e.clientY) })).sort((a, b) => a.d - b.d);
        if (choices[0]?.d <= (e.pointerType === 'mouse' ? 16 : 28)) { chooseChildEdge(choices[0].index); return; }
      }
      if (st.faceStep) { const hit = v.pickSurface?.(e.clientX, e.clientY); v.highlightSurface?.(hit); pickAssemblyFace(hit); return; }
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isBench()) { if (st.preview) cancelPreview(); else wiz.cancel(); } });

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

  // 精靈要用到的內部（接上／取消都走這裡，不另寫一套）
  // 預設精靈與進階面板共用同一條六面選面流程，確認前不改作品。
  function openDefaultFaceWizard(mod, reselect = false, startAtPlacement = false) {
    if (st.preview) cancelPreview({ silent: true });
    const signature = JSON.stringify([S.comps, S.modules, S.topo.params]);
    const modules = reselect ? S.modules.map(m => m.id === mod.id ? { ...m, mount: null } : m) : S.modules;
    openFaceWizard({ comps: S.comps, modules, params: S.topo.params, childId: mod.id, wizard: true,
      initialMount: reselect ? mod.mount : null, startAtPlacement,
      exportSettings: Settings.exportSettings(), stockMm: Number(S.fabrication?.cnc?.stockThicknessMm) || FABRICATION_DEFAULTS.cnc.stockThicknessMm,
      isCurrent: () => signature === JSON.stringify([S.comps, S.modules, S.topo.params]), say,
      commit: result => { pushUndo(); S.comps = result.comps; S.modules = result.modules; rebuild(); draw(); deps.scheduleAutosave?.(); say(result.modules.find(m => m.id === mod.id)?.mount?.face?.selection?.brackets ? '已接上，角碼固定孔已生成。' : '已定位，尚未固定。請按「配置角碼」檢查並確認孔位。'); syncUI(true); }
    });
  }
  wiz = createMateWizard({
    el, bigBtn, st, deps, openFaces: openDefaultFaceWizard, modOf, displayName, statusOf, say, select, syncUI, drawMarkers, computeMarkers, viewer, listEl, panelEl, liveBox, liveCheck,
    liveCount: () => live.ready ? live.findings.length : 0,
    liveInfo: () => ({ ...currentLiveStatus(), ready: live.ready && !!live.plan && (live.plan.parts || []).length > 0, n: live.findings.length, hits: live.hits, labels: live.labels }), motorState, adjust, adjustState, editModule, ghostFor,
    clearGhost: () => viewer()?.setPreviewGhost(null), setGhost: spec => viewer()?.setPreviewGhost(spec), isBench,
    cancelAdvancedPreview: () => cancelPreview({ silent: true }),
    // 接上：一筆復原。comps／modules 是已整理好的候選，換成真的作品後照 adjust 的流程重建。
    commit(comps, modules, msg) {
      deps.setCandidate(null); viewer()?.setPreviewGhost(null);
      pushUndo(); S.comps = comps; S.modules = modules;
      rebuild(); draw(); say(msg, { toast: false }); syncUI(true); drawMarkers();
    },
    // 已接好的機構換接法（一筆復原）。
    apply(r, msg) {
      pushUndo(); S.comps = r.comps; S.modules = r.modules;
      rebuild(); draw(); say(msg, { toast: false }); syncUI(true); drawMarkers();
    }
  });
  syncModeButtons();
  return {
    mateWizardDebug: () => wiz.debug(),
    autosaveSnapshot: () => st.preview ? JSON.parse(st.preview.preSnap) : null,
    setMode, select, pickPort, commit, cancel: () => cancelPreview(), adjust, syncUI, afterScene, debug,
    liveCheck: () => liveCheck(true), runTimeline, jumpTo,
    setShowAll(on) { st.showAll = !!on; syncUI(true); drawMarkers(); }
  };
}
