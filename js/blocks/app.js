/**
 * blocks / app
 *
 * 「機構積木」頁的控制器（ui 層）：持有狀態與 DOM，負責繪製、指標互動、編輯面板、
 * 播放迴圈與 3D 預覽切換。純邏輯都委派給同目錄的純模組：
 *   - view.js   視圖投影 + 冰棒棍外形
 *   - model.js  S.comps / S.topo 資料操作
 *   - motion.js 播放運動分析
 *
 * 下方「綁定層」把這些純函式綁到本檔狀態（S.comps / S.topo / S.theta…），讓繪製與互動
 * 的大函式本體維持原樣、呼叫端不變。
 */

// 重用既有引擎：角色→步驟編譯 + 求解。求解器一行都不改。
import { compileTopology } from '../core/topology.js';
import { solveTopology, sweepTopology } from '../multilink/solver.js';
// 3D 唯讀預覽（懶載入 THREE，平面路徑完全不受影響）
// computeBodyLayers：2D 疊放順序與 3D z 分層共用同一套，兩邊才一致。
import { buildSceneModel, computeBodyLayers } from '../blocks3d/scene-model.js';
// 純邏輯模組
import * as View from './view.js';
import * as Render from './render.js';   // SVG 繪製基元（純呈現）
import * as Model from './model.js';
import * as Motion from './motion.js';
import * as Store from './storage.js';
import { S } from './state.js';          // 跨模組共享的可變狀態（S.comps / S.theta / S.selected* …）
import { BLOCK_EXAMPLES, getExample } from './examples.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stageSvg');
const { W, H, HULL_R_WORLD, TX, TY } = View;
// 樂高 Technic 孔距 = 8mm；連桿/三點桿孔位長度對齊 8mm，滑軌外形尺寸不套用。
const LEGO_STEP = 8;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);
const roundMm = v => Math.round(Number(v) || 0);

// ---- 狀態 ----
// 跨模組共享的編輯 / 機構 / 選取 / 拖曳 / 工具 / undo 狀態收在 state.js 的 S 物件，
// 以 S.xxx 存取（見該檔說明：ES module 具名匯出唯讀，故用單一物件共享可寫狀態）。
const SERVO_STEP = 15;                 // 伺服角度面板的每步度數
// 以下為 render / 播放迴圈 / 3D 的內部狀態，待各自模組抽出時再搬，暫留本檔。
let raf = null;
let lastSolved = {};           // 上一幀求解成功的點位：給求解器挑「連續」分支 + 死點暫態回退
let prevSolved = {};           // 再上一幀：和 lastSolved 一起外插出「帶動量」的預測種子
let trajectoryCache = null;    // 沿用 multilink sweepTopology 的軌跡資料格式

// ---- 3D 唯讀預覽狀態 ----
let viewer3D = null;           // createViewer() 的實體（首次開啟才懶載入）
let view3DActive = false;      // 3D 覆蓋層是否開著
let lastModelInputs = null;    // 最近一次 draw() 算好的 { links, pts, groundIds }，給 3D 鏡像用

function snapshotStr() {
  return JSON.stringify(Store.toSnapshot(S.comps, S.topo, S.counter));
}
function pushUndo() {
  const s = snapshotStr();
  if (S.undoStack[S.undoStack.length - 1] === s) return; // 沒變就不堆
  S.undoStack.push(s);
  if (S.undoStack.length > 60) S.undoStack.shift();
  updateUndoBtn();
}
function updateUndoBtn() {
  const btn = document.getElementById('btnUndo');
  if (btn) btn.disabled = S.undoStack.length === 0;
}
function undo() {
  if (!S.undoStack.length) return;
  const norm = Store.normalizeSnapshot(JSON.parse(S.undoStack.pop()));
  if (norm) applySnapshot(norm, { recordUndo: false, fit: false });
  updateUndoBtn();
}
function scheduleAutosave() {
  clearTimeout(S.autosaveTimer);
  S.autosaveTimer = setTimeout(() => Store.saveLocal(Store.toSnapshot(S.comps, S.topo, S.counter)), 500);
}

// 套用一份 snapshot 到目前狀態。recordUndo 預設 true（外部開檔/分享要能 undo）。
function applySnapshot(norm, { recordUndo = true, fit = true } = {}) {
  if (recordUndo) pushUndo();
  pause();
  cancelMotorMode();
  S.comps = norm.comps;
  S.topo = { params: norm.params || {}, tracePoint: norm.tracePoint || '' };
  S.counter = Math.max(norm.counter || 0, Store.highestIdNum(S.comps));
  S.theta = 0;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  document.getElementById('thetaVal').textContent = '0';
  rebuild(); draw();
  if (fit) fitView();
}

function populateExamples() {
  const sel = document.getElementById('exampleSelect');
  if (!sel) return;
  BLOCK_EXAMPLES.forEach(example => {
    const opt = document.createElement('option');
    opt.value = example.id;
    opt.textContent = example.title;
    opt.title = example.note || '';
    sel.appendChild(opt);
  });
}

function loadExample(id) {
  const sel = document.getElementById('exampleSelect');
  const example = getExample(id || (sel && sel.value));
  if (!example) return;
  const norm = Store.normalizeSnapshot(example.snapshot);
  if (!norm) {
    transient('⚠️ 範例格式不正確');
    return;
  }
  applySnapshot(norm);
  transient('📘 已載入：' + example.title);
  if (sel) sel.value = '';
}

// ---- 綁定層：把純模組綁到本檔狀態，維持原呼叫端不變 ----
const barHullPath = View.barHullPath;
const roundedTriangleHullPath = View.roundedTriangleHullPath;
const worldFromEvent = (e) => View.worldFromEvent(svg, e);
const extrapolateSeed = Motion.extrapolateSeed;
const norm360 = Motion.norm360;
const PLAY_STEP = Motion.PLAY_STEP;
const planMotion = () => Motion.planMotion(S.compiled, S.topo, S.theta, lastSolved);
const mobilePrompt = () => window.matchMedia('(hover: none), (pointer: coarse), (max-width: 640px)').matches;
const promptText = (desktop, mobile) => mobilePrompt() ? mobile : desktop;
const snapWorld = () => View.snapWorld() * (mobilePrompt() ? 2.35 : 1);
const NODE_TAP_PX = 34;   // 手機點接點的命中半徑（畫面 px，縮放下維持一致手感）

const pointCoords = () => Model.pointCoords(S.comps);
// 接點「畫面上實際位置」：元件座標打底，再用最近一次求解結果覆蓋（與 draw() 的 pts 同源）。
// 吸附 / 命中都該用這個，才會對齊使用者看到的位置——solver 驅動的點（如曲柄動端）尤其重要，
// 它的元件座標會與被驅動後的畫面位置脫節。
const displayCoords = () => {
  const m = pointCoords();
  for (const id in lastSolved) {
    const p = lastSolved[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) m[id] = { x: p.x, y: p.y };
  }
  return m;
};
const isHiddenSliderRailPoint = (id) => S.comps.some(c =>
  c.type === 'slider' && c.m1 && c.m2 && (c.p1?.id === id || c.p2?.id === id));
const isSliderMountPoint = (id) => S.comps.some(c =>
  c.type === 'slider' && (c.m1?.id === id || c.m2?.id === id));
const sliderMountInfo = (id) => {
  const sl = S.comps.find(c => c.type === 'slider' && (c.m1?.id === id || c.m2?.id === id));
  if (!sl) return null;
  return { slider: sl, label: sl.m1?.id === id ? 'M1' : 'M2' };
};
// 以「世界座標 world」為中心，找畫面上最近的接點（排除 exclude），門檻 maxDist。
const nearestDisplayToPoint = (world, exclude = [], maxDist = snapWorld()) => {
  const m = displayCoords();
  let best = null, bestD = maxDist;
  for (const id in m) {
    if (isHiddenSliderRailPoint(id)) continue;
    if (exclude.includes(id)) continue;
    const d = Math.hypot(m[id].x - world.x, m[id].y - world.y);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
};
// 找最接近「某接點目前畫面位置」的另一個接點（拖曳吸附用）。
const nearestDisplayTo = (id, exclude = []) => {
  const m = displayCoords();
  const d = m[id];
  if (!d) return null;
  return nearestDisplayToPoint(d, [id, ...exclude]);
};
// 若 id 是某根「馬達輸入桿」的動端（非馬達中心那頭），回那根桿；否則 null。
const inputCrankMovingEnd = (id) => S.comps.find(c =>
  c.type === 'bar' && c.isInput && c.p1 && c.p2 &&
  ((c.p1.id === id && !c.p1.physicalMotor && c.p2.physicalMotor) ||
   (c.p2.id === id && !c.p2.physicalMotor && c.p1.physicalMotor))) || null;
const updatePointCoordsById = (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y);
const freezePointAtDisplay = (id) => Model.freezePointAtDisplay(S.comps, S.compiled, S.theta, id);
const movePointById = (id, dx, dy) => Model.movePointById(S.comps, id, dx, dy);
const pointIsGround = (id) => Model.pointIsGround(S.comps, id);
const removeMotorAtPoint = (id) => Model.removeMotorAtPoint(S.comps, id);
const removeAnchorsAtPoint = (id) => { S.comps = Model.removeAnchorsAtPoint(S.comps, id); };
const setPointType = (id, type) => Model.setPointType(S.comps, id, type);
const roleLabel = (id) => Model.roleLabel(S.comps, id);
const hasPoint = (id) => Model.hasPoint(S.comps, id);
const mergePoints = (fromId, toId) => { S.comps = Model.mergePoints(S.comps, fromId, toId); };
const recomputeLengths = () => Model.recomputeLengths(S.comps, S.topo);
const fixedLinkFor = (id) => Model.fixedLinkFor(S.comps, id);
const freeLinkForPoint = (id) => Model.freeLinkForPoint(S.comps, id);
const isFreeLink = (c) => Model.isFreeLink(S.comps, c);
const barsAtNode = (nodeId) => Model.barsAtNode(S.comps, nodeId);

// 隱性機架：所有 type:'fixed' 的接點視為同一個固定底座（機架）。
// 不是獨立物件，只是把散落的固定銷當成一組——拖機架把手時整組一起平移。
const FRAME_POINT_KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];
function frameNodeIds() {
  const ids = new Set();
  S.comps.forEach(c => FRAME_POINT_KEYS.forEach(k => {
    if (c[k] && c[k].id && c[k].type === 'fixed') ids.add(c[k].id);
  }));
  return ids;
}
// 機架上各固定銷的座標（固定點不隨求解移動，直接用元件座標）。x 排序方便連線。
function frameNodes() {
  const m = pointCoords();
  return [...frameNodeIds()]
    .map(id => ({ id, ...(m[id] || {}) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
}
// 機架「視覺」用的固定銷：排除滑塊自己的 rail/mount 點（它們已有滑軌與安裝孔外觀，
// 不讓機架連接線再沿軌道疊一條）。注意：移動仍以 frameNodeIds() 為準，滑塊照樣跟著走。
function frameConnectorNodes() {
  return frameNodes().filter(p => !isHiddenSliderRailPoint(p.id) && !isSliderMountPoint(p.id));
}

function syncSliderGeometries() {
  S.comps.filter(c => c.type === 'slider' && c.p1 && c.p2).forEach(c => {
    if (!c.m1 || !c.m2) {
      c.m1 = { id: `${c.id || 'Slider'}m1`, type: 'fixed', x: c.p1.x || 0, y: c.p1.y || 0 };
      c.m2 = { id: `${c.id || 'Slider'}m2`, type: 'fixed', x: c.p2.x || 0, y: c.p2.y || 0 };
    }
    c.m1.type = 'fixed';
    c.m2.type = 'fixed';
    const dx = (c.m2.x || 0) - (c.m1.x || 0);
    const dy = (c.m2.y || 0) - (c.m1.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    const carrierLen = Math.max(railLength(c), roundMm(d));
    const ux = dx / d, uy = dy / d;
    c.m2.x = (c.m1.x || 0) + ux * carrierLen;
    c.m2.y = (c.m1.y || 0) + uy * carrierLen;
    c.carrierLen = carrierLen;
    const maxOffset = Math.max(0, carrierLen - railLength(c));
    c.railOffset = Math.max(0, Math.min(maxOffset, roundMm(c.railOffset || 0)));
    c.p1.x = (c.m1.x || 0) + ux * c.railOffset;
    c.p1.y = (c.m1.y || 0) + uy * c.railOffset;
    c.p2.x = c.p1.x + ux * railLength(c);
    c.p2.y = c.p1.y + uy * railLength(c);
  });
}

function rebuild() {
  syncSliderGeometries();
  S.compiled = compileTopology(S.comps, S.topo, new Set());
  S.topo.params = S.compiled.params; // 沿用補齊後的參數
  lastSolved = {};               // 拓撲變了：丟掉舊解，避免拿到不相干的種子
  prevSolved = {};
  trajectoryCache = null;
  document.getElementById('hint').style.display = S.comps.length ? 'none' : 'block';
  updateRoleEditor();
  scheduleAutosave();            // 任何結構變更都防丟（debounce，播放不觸發）
}

function getTrajectoryData() {
  const tracePoint = S.topo.tracePoint || (S.compiled && S.compiled.tracePoint) || '';
  if (!S.compiled || !tracePoint || !S.comps.length) return null;
  const key = JSON.stringify(Store.toSnapshot(S.comps, S.topo, S.counter));
  if (trajectoryCache && trajectoryCache.key === key) return trajectoryCache.data;
  let data = null;
  try {
    const sweep = sweepTopology({ ...S.compiled, tracePoint }, S.compiled.params || S.topo.params || {}, 0, 360, 5);
    if (sweep && sweep.results) data = sweep;
  } catch (_) {
    data = null;
  }
  trajectoryCache = { key, data };
  return data;
}

function drawTraceTrajectory(trajectoryData) {
  if (!trajectoryData || !Array.isArray(trajectoryData.results)) return;
  const pts = trajectoryData.results.filter(r => r && r.isValid && r.B).map(r => r.B);
  if (pts.length < 2) return;
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('points', pts.map(p => `${TX(p.x)},${TY(p.y)}`).join(' '));
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', '#008060');
  poly.setAttribute('stroke-width', 2.5);
  poly.setAttribute('stroke-opacity', 0.72);
  poly.setAttribute('stroke-linejoin', 'round');
  poly.setAttribute('stroke-linecap', 'round');
  poly.style.pointerEvents = 'none';
  svg.appendChild(poly);
}

// ---- 重建 / 播放兩條路徑共用的狀態與 helper ----
// build/update 分離：draw() 走完整重建並為每個會動的元素註冊一個 (pts)=>更新幾何 的閉包；
// 播放時 renderFrame() 只重解 + 跑這些閉包就地改 d/cx/transform，不拆 DOM（手機才不會每幀重建整棵樹）。
let frameUpdaters = [];        // 重建時填入：每個是 (pts)=>void，只改既有元素的幾何屬性
let sliderLayer = null;        // 滑軌動態層：播放時就地清空重畫（滑軌少，與重建共用同段碼＝零分歧）
let recountBanner = null;      // (pts, sol)=>void：播放時重算死點橫幅（沿用重建時的桿件清單）

// 解這一幀 + 推進位移歷史，回傳合併後的「點 id -> 畫面位置」。draw 與 renderFrame 共用同一套求解語意。
function solveFrame() {
  let sol = null;
  // 帶「外插（上一幀＋速度）」的預測當種子：靠動量挑連續分支，平行四邊形不會翻成交叉。
  const seed = extrapolateSeed(lastSolved, prevSolved);
  try { sol = solveTopology(S.compiled, { thetaDeg: S.theta, _prevPoints: seed }); } catch (_) {}
  const solved = (sol && sol.points) ? sol.points : {};
  // 位移歷史往前推一格：這幀沒解出來的點沿用上一幀的舊值（桿件就不會憑空消失）
  const newLast = { ...lastSolved };
  Object.keys(solved).forEach(id => {
    if (Number.isFinite(solved[id].x) && Number.isFinite(solved[id].y)) newLast[id] = solved[id];
  });
  prevSolved = lastSolved;
  lastSolved = newLast;
  // 合併位置：先用元件座標打底（未被解出的靜態點才畫得出來、拖得動），再用 lastSolved 覆蓋。
  const pts = pointCoords();
  Object.keys(lastSolved).forEach(id => { if (Number.isFinite(lastSolved[id].x)) pts[id] = lastSolved[id]; });
  return { pts, sol };
}

// 算馬達本體的朝向（度）：對準接在中心、非曲柄的那根桿；沒有就朝滑軌另一固定孔；再沒有才朝最近地錨。
// 從 draw() 抽出，讓播放更新器每幀用新 pts 重算同一個角度（邏輯與原本一字不差）。
function computeMotorRotDeg(id, pts, groundIds) {
  const p = pts[id];
  let tgt = null;
  const crankTips = new Set((S.compiled.steps || [])
    .filter(s => s.type === 'input_crank' && s.center === id)
    .map(s => s.id));
  const others = S.comps.filter(c => c.type === 'bar' && !c.isInput && c.p1 && c.p2 &&
    (c.p1.id === id || c.p2.id === id) &&
    !crankTips.has(c.p1.id === id ? c.p2.id : c.p1.id));
  if (others.length) {
    const b = others[0];
    const o = b.p1.id === id ? b.p2.id : b.p1.id;
    if (pts[o] && Number.isFinite(pts[o].x)) tgt = pts[o];
  }
  if (!tgt) {
    // 馬達裝在滑軌固定孔上：固定框架就是滑軌，朝另一個固定孔（沿軌道方向）。
    const mount = sliderMountInfo(id);
    if (mount) {
      const other = mount.label === 'M1' ? mount.slider.m2 : mount.slider.m1;
      if (other && pts[other.id] && Number.isFinite(pts[other.id].x)) tgt = pts[other.id];
    }
  }
  if (!tgt) {
    // 後備：朝最近的另一個地錨。跳過與馬達重合的點（含滑軌隱藏軌道端，railOffset=0 時會疊在固定孔上）
    // ——否則 atan2 對到零向量會亂轉（±180° 把馬達翻上去）。
    let bd = Infinity;
    groundIds.forEach(gid => {
      if (gid === id || isHiddenSliderRailPoint(gid)) return;
      const gp = pts[gid];
      if (gp && Number.isFinite(gp.x)) { const d = Math.hypot(gp.x - p.x, gp.y - p.y); if (d > 1e-3 && d < bd) { bd = d; tgt = gp; } }
    });
  }
  return tgt ? Math.atan2(-(tgt.x - p.x), -(tgt.y - p.y)) * 180 / Math.PI : 0;
}

function draw() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  frameUpdaters = [];
  sliderLayer = null;
  recountBanner = null;
  drawGround();   // app 層機架連接線（固定銷不足時 fallback 到 Render.drawGroundBaseline）
  if (!S.compiled || !S.comps.length) {
    updateSolveBanner(null, 0);
    drawDrawPreview();   // 空畫布也要顯示正在拉出的第一根連桿
    drawTrianglePreview();
    return;
  }

  const { pts, sol } = solveFrame();

  const groundIds = new Set((S.compiled.steps || []).filter(s => s.type === 'ground').map(s => s.id));
  const motorCenterIds = new Set((S.compiled.steps || []).filter(s => s.type === 'input_crank').map(s => s.center));
  drawTraceTrajectory(getTrajectoryData());

  // 三角板邊：這些 link 由實心三角板代表，2D 不另畫（與 3D scene-model 的 visible 篩法一致）。
  const triangleEdgeKeys = new Set();
  (S.compiled.visualization.polygons || []).forEach(poly => {
    if (!poly.points || poly.points.length !== 3) return;
    const [p1, p2, p3] = poly.points;
    [[p1, p2], [p1, p3], [p2, p3]].forEach(([x, y]) => {
      triangleEdgeKeys.add([x, y].sort().join('|'));
    });
  });
  const validPt = (id) => pts[id] && Number.isFinite(pts[id].x) && Number.isFinite(pts[id].y);
  const triKey = (ids) => [...ids].sort().join('|');

  // 疊放分層：用與 3D 完全相同的剛體集合＋原始順序餵 computeBodyLayers，2D/3D 才會一致。
  // （桿集合與 scene-model 的 visible 一致：可見、兩端有效、不落在三角板邊上。）
  const layerLinks = (S.compiled.visualization.links || []).filter(l =>
    l && !l.hidden && validPt(l.p1) && validPt(l.p2) &&
    !triangleEdgeKeys.has([l.p1, l.p2].sort().join('|')));
  const triComps = S.comps.filter(c => c.type === 'triangle' && c.p1 && c.p2 && c.p3 &&
    validPt(c.p1.id) && validPt(c.p2.id) && validPt(c.p3.id));
  // 手動疊放偏好（zlift）標到 visualization 物件上：2D bodies 與 3D buildSceneModel 都讀同一份
  (S.compiled.visualization.links || []).forEach(l => {
    const c = l.id ? S.comps.find(x => x.id === l.id) : null;
    l._zlift = (c && c.zlift) || 0;
  });
  (S.compiled.visualization.polygons || []).forEach(poly => {
    const k = triKey(poly.points);
    const t = triComps.find(tc => triKey([tc.p1.id, tc.p2.id, tc.p3.id]) === k);
    poly._zlift = (t && t.zlift) || 0;
  });
  const bodyLayers = computeBodyLayers([
    ...layerLinks.map(l => ({ joints: [l.p1, l.p2], lift: l._zlift || 0 })),
    ...triComps.map(t => ({ joints: [t.p1.id, t.p2.id, t.p3.id], lift: t.zlift || 0 })),
  ], groundIds);
  const linkLayer = new Map();      // link 物件 -> 層
  layerLinks.forEach((l, i) => linkLayer.set(l, bodyLayers[i]));
  const triLayerByKey = new Map();  // 三角板三點 key -> 層
  triComps.forEach((t, j) => triLayerByKey.set(triKey([t.p1.id, t.p2.id, t.p3.id]), bodyLayers[layerLinks.length + j]));

  // 依層級建立 <g> 容器，append 順序＝疊放順序（內層在底、外層在上）。
  // 馬達擺在所有桿件底下；節點等在這之後直接接到 svg（疊在最上層）。
  const motorLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(motorLayer);
  const sortedLayers = [...new Set(bodyLayers)].sort((a, b) => a - b);
  const layerGroups = new Map();
  sortedLayers.forEach(L => {
    const g = document.createElementNS(SVG_NS, 'g');
    layerGroups.set(L, g);
    svg.appendChild(g);
  });
  const groupForLayer = (L) => layerGroups.get(L) || motorLayer;

  // 三點桿：用圓角三角板呈現，同時仍保留每條邊/孔位的求解語法。
  S.comps.filter(comp => comp.type === 'triangle' && comp.p1 && comp.p2 && comp.p3).forEach(tri => {
    const ids = [tri.p1.id, tri.p2.id, tri.p3.id];
    const path = document.createElementNS(SVG_NS, 'path');
    const color = tri.color || '#27ae60';
    const isSel = tri.id === S.selectedTriangleId;
    path.setAttribute('fill', color + '33');
    path.setAttribute('stroke', isSel ? '#e67e22' : color);
    path.setAttribute('stroke-width', isSel ? 3.2 : 2.5);
    path.setAttribute('stroke-linejoin', 'round');
    path.style.cursor = 'pointer';
    path.addEventListener('pointerdown', (e) => {
      if (S.drawingLink || S.drawingTriangle) return;
      e.stopPropagation();
      selectTriangle(tri.id);
    });
    // 每幀更新：解出三點就更新外形，三點不全則隱藏（與原本「無效不畫」同效果）
    const applyTri = (P) => {
      const [a, b, c] = ids.map(id => P[id]);
      const ok = [a, b, c].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
      path.style.display = ok ? '' : 'none';
      if (ok) path.setAttribute('d', roundedTriangleHullPath(a, b, c));
    };
    applyTri(pts);
    groupForLayer(triLayerByKey.get(triKey(ids))).appendChild(path);
    frameUpdaters.push(applyTri);
  });

  // 動力來源本體：畫在桿件底下，曲柄轉在它上面。依型號畫 TT馬達或 MG995 伺服。
  // 朝向＝對準接在馬達中心、非曲柄的那根桿（指向它的另一端）；沒有就朝最近的另一個地錨；都沒有才朝下。
  // 注意：馬達記在「節點」上（point.type='motor'），曲柄那根桿的 isInput 通常仍是 false，
  // 光靠 !c.isInput 排不掉曲柄。改用 input_crank 步驟算出曲柄動端，明確把曲柄那根桿排除。
  motorCenterIds.forEach(id => {
    const p = pts[id]; if (!p || !Number.isFinite(p.x)) return;
    const rotDeg = computeMotorRotDeg(id, pts, groundIds);
    const isServo = motorTypeForCenter(id) === 'mg995';
    const body = isServo ? Render.drawMG995Servo(p.x, p.y, rotDeg, motorLayer)
                         : Render.drawTTMotor(p.x, p.y, rotDeg, motorLayer);
    const label = Render.drawMotorLabel(p.x, p.y, isServo ? 'MG995' : 'TT', isServo ? '#2c6fbb' : '#c9971b', motorLayer);
    // 每幀更新：本體只改 transform（位置+朝向）、標籤只改 x/y；縮放在播放時不變故內部尺寸免重算。
    frameUpdaters.push((P) => {
      const q = P[id];
      const ok = q && Number.isFinite(q.x) && Number.isFinite(q.y);
      body.style.display = ok ? '' : 'none';
      label.style.display = ok ? '' : 'none';
      if (!ok) return;
      body.setAttribute('transform', `translate(${TX(q.x)} ${TY(q.y)}) rotate(${computeMotorRotDeg(id, P, groundIds)})`);
      label.setAttribute('x', TX(q.x));
      label.setAttribute('y', TY(q.y) - 16 * View.getScale());
    });
  });

  // 桿件：依層級放進對應的 <g>（內層在底、外層在上）；同層內紅色曲柄最後畫不被蓋住。
  const linksToDraw = [...(S.compiled.visualization.links || [])].sort((a, b) => {
    const ac = a.style === 'crank' ? 1 : 0;
    const bc = b.style === 'crank' ? 1 : 0;
    return ac - bc;
  });
  // 可見桿（排除隱藏與三角板邊）：建一次、無效時隱藏，播放只更新外形——不再每幀重建。
  const eligibleLinks = linksToDraw.filter(l =>
    !l.hidden && !triangleEdgeKeys.has([l.p1, l.p2].sort().join('|')));
  // 死點橫幅的「缺漏可見桿」計數：重建與播放共用同一套判斷（含與原本一致、只看 .x 有限）
  const countMissingLinks = (P) => {
    let m = 0;
    eligibleLinks.forEach(l => {
      const a = P[l.p1], b = P[l.p2];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) m += 1;
    });
    return m;
  };
  eligibleLinks.forEach(l => {
    const isSel = l.id && l.id === S.selectedLinkId;
    const editable = l.id && S.comps.some(c => c.id === l.id && c.type === 'bar' && c.fixedLen);
    const isPickCandidate = S.pickBars && S.pickBars.ids.includes(l.id);
    // 冰棒棍外形：填色扁棍取代原本的圓頭線段
    const stroke = isPickCandidate ? '#f39c12' : (isSel ? '#e67e22' : (l.style === 'crank' ? '#e74c3c' : (l.color || '#3498db')));
    const stick = document.createElementNS(SVG_NS, 'path');
    stick.setAttribute('fill', stroke + '33');   // 淡色填滿，像一塊積木
    stick.setAttribute('stroke', stroke);
    stick.setAttribute('stroke-width', isSel || isPickCandidate ? 2.5 : 2);
    stick.setAttribute('stroke-linejoin', 'round');
    if (isPickCandidate) stick.setAttribute('stroke-dasharray', '10 7');
    if (editable || isPickCandidate) {
      stick.setAttribute('data-link-id', l.id);
      stick.style.cursor = 'pointer';
      stick.addEventListener('pointerdown', (e) => {
        if (S.drawingLink || S.drawingTriangle) return; // 畫圖模式：不攔截，讓 svg 起點處理
        e.stopPropagation();
        if (S.pickBars) { tryPickBar(l.id); return; }
        if (startFreeLinkDrag(e, l.id)) return;
        selectLink(l.id);
      });
    }
    const targetG = groupForLayer(linkLayer.get(l));
    targetG.appendChild(stick);

    // 在兩端冰棒棍頭上鑽孔：與外形同色的細圈，讓它看起來像真的打孔的扁棍。
    // 地錨（方塊）本身就是固定銷，不畫孔。地錨判定屬結構性，播放期間不變。
    const holeR = HULL_R_WORLD * View.getScale() * 0.72;
    const holes = [];
    [l.p1, l.p2].forEach(pid => {
      if (groundIds.has(pid)) return;
      const hole = document.createElementNS(SVG_NS, 'circle');
      hole.setAttribute('r', holeR);
      hole.setAttribute('fill', 'none');
      hole.setAttribute('stroke', stroke);
      hole.setAttribute('stroke-width', 1.5);
      hole.setAttribute('stroke-opacity', 0.7);
      hole.style.pointerEvents = 'none'; // 不擋下面桿身/上面節點的互動
      targetG.appendChild(hole);
      holes.push({ el: hole, pid });
    });
    // 每幀更新：解出兩端就更新棍身外形與孔位，否則整根隱藏（與原本「無效不畫」同效果）
    const applyLink = (P) => {
      const a = P[l.p1], b = P[l.p2];
      const ok = a && b && Number.isFinite(a.x) && Number.isFinite(b.x);
      stick.style.display = ok ? '' : 'none';
      holes.forEach(h => { h.el.style.display = ok ? '' : 'none'; });
      if (!ok) return;
      stick.setAttribute('d', barHullPath(a, b));
      holes.forEach(h => {
        const pt = P[h.pid];
        if (pt && Number.isFinite(pt.x)) { h.el.setAttribute('cx', TX(pt.x)); h.el.setAttribute('cy', TY(pt.y)); }
      });
    };
    applyLink(pts);
    frameUpdaters.push(applyLink);
  });
  updateSolveBanner(sol, countMissingLinks(pts));
  recountBanner = (P, s) => updateSolveBanner(s, countMissingLinks(P));

  // 滑軌：放進專屬動態層。滑軌數量少且結構複雜（軌道/滑塊/活塞/固定孔多件），
  // 播放時就地清空重畫整層、與重建共用 drawSliders（零分歧），代價可忽略。
  sliderLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(sliderLayer);
  drawSliders(pts, sliderLayer);

  // 吸附高亮：拖曳時靠近的接點亮綠圈
  if (S.dragId && S.snapTarget && pts[S.snapTarget] && Number.isFinite(pts[S.snapTarget].x)) {
    const t = pts[S.snapTarget];
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', TX(t.x)); ring.setAttribute('cy', TY(t.y));
    ring.setAttribute('r', mobilePrompt() ? 24 : 14); ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#2ecc71'); ring.setAttribute('stroke-width', mobilePrompt() ? 4 : 3);
    svg.appendChild(ring);
  }

  // 節點（可拖曳；拖近別的接點會吸附合併）
  // 節點型別（rect/circle）、樣式、半徑只由結構性狀態（地錨/馬達/固定孔/S.dragId）決定——
  // 播放期間這些都不變，故建一次、每幀只更新座標。
  const SIZE = 14;   // 地錨方塊邊長
  Object.keys(pts).forEach(id => {
    if (isHiddenSliderRailPoint(id)) return;
    if (isSliderMountPoint(id)) return;
    const p = pts[id];
    const isGround = groundIds.has(id);
    const isMotorCenter = motorCenterIds.has(id);
    const mount = sliderMountInfo(id);
    const isRect = isGround && !isMotorCenter && !mount;
    const node = document.createElementNS(SVG_NS, isRect ? 'rect' : 'circle');
    if (isMotorCenter) {
      // 馬達輸出軸：紅色軸蓋（TT 馬達本體已畫在底下）
      node.setAttribute('r', id === S.dragId ? 8 : 6);
      node.setAttribute('fill', '#e74c3c');
      node.setAttribute('stroke', '#922b21'); node.setAttribute('stroke-width', 2);
    } else if (mount) {
      node.setAttribute('r', id === S.dragId ? 9 : 7);
      node.setAttribute('fill', '#f8fafc');
      node.setAttribute('stroke', id === S.dragId ? '#2ecc71' : '#34495e');
      node.setAttribute('stroke-width', 3);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${mount.label} 固定孔：承載滑軌桿件的端點，可拖曳或吸附到其他接點`;
      node.appendChild(title);
    } else if (isRect) {
      node.setAttribute('width', SIZE); node.setAttribute('height', SIZE);
      node.setAttribute('rx', 3); node.setAttribute('fill', '#34495e');
    } else {
      node.setAttribute('r', id === S.dragId ? 9 : 7); node.setAttribute('fill', '#fff');
      node.setAttribute('stroke', id === S.dragId ? '#2ecc71' : '#34495e');
      node.setAttribute('stroke-width', 3);
    }
    node.setAttribute('data-id', id);
    node.style.cursor = 'grab';
    node.addEventListener('pointerdown', (e) => onNodeDown(e, id));
    svg.appendChild(node);
    // 手機的接點命中放大改由 capture 階段的 pointerdown 統一處理（見下方），
    // 不再每個節點疊一圈透明命中圈。
    // 每幀更新：只改座標，無效（未解出）則隱藏（與原本「無效不畫」同效果）
    const applyNode = (P) => {
      const q = P[id];
      const ok = q && Number.isFinite(q.x);
      node.style.display = ok ? '' : 'none';
      if (!ok) return;
      if (isRect) { node.setAttribute('x', TX(q.x) - SIZE / 2); node.setAttribute('y', TY(q.y) - SIZE / 2); }
      else { node.setAttribute('cx', TX(q.x)); node.setAttribute('cy', TY(q.y)); }
    };
    applyNode(pts);
    frameUpdaters.push(applyNode);
  });

  drawFrameHandle();   // 機架移動把手：畫在節點之上，才點得到、拖得動
  drawDrawPreview();   // 畫桿模式：疊在最上層的拖曳預覽
  drawTrianglePreview(); // 三點桿模式：疊在最上層的三角預覽

  // 把這一幀的姿勢同步給 3D 預覽（開著時才推；平面路徑零負擔）
  // polygons 一併帶上：3D 用它把三點桿畫成實心板，並過濾掉與三角板邊重疊的桿（避免分身）。
  // motorCenterIds：3D 把這些中心畫成沉在機構背面的馬達，輸出軸往上帶動曲柄。
  // motorTypes：每個馬達中心的型號（'tt'/'mg995'），讓 3D 也畫出對應外形。
  const motorTypes = new Map();
  motorCenterIds.forEach(id => motorTypes.set(id, motorTypeForCenter(id)));
  // 滑塊（無動力）幾何餵給 3D：軌道（m1-m2）＋滑塊方塊（p3，沿 p1-p2 軸向）。
  const sliders3d = S.comps
    .filter(c => c.type === 'slider' && !c.isInput && c.p1 && c.p2 && c.p3 && c.m1 && c.m2)
    .map(c => ({ id: c.id, p1: c.p1.id, p2: c.p2.id, m1: c.m1.id, m2: c.m2.id, p3: c.p3.id,
                 baseEnd: c.baseEnd === 'p2' ? 'p2' : 'p1',
                 travelStart: sliderTravelStart(c), travelEnd: sliderTravelEnd(c),
                 carriageLen: sliderBodyLength(c), color: c.color }));
  lastModelInputs = { links: linksToDraw, pts, groundIds, motorCenterIds, motorTypes, polygons: S.compiled.visualization.polygons || [], sliders: sliders3d };
  if (view3DActive) push3D();
}

// 滑軌繪製：畫進指定 parent。重建（draw）與播放（renderFrame）共用同一段碼，確保零分歧。
function drawSliders(pts, parent) {
  S.comps.filter(c => c.type === 'slider' && c.p1 && c.p2 && c.p3).forEach(sl => {
    const a = pts[sl.p1.id], b = pts[sl.p2.id], s = pts[sl.p3.id];
    const ma = sl.m1 && pts[sl.m1.id] ? pts[sl.m1.id] : a;
    const mb = sl.m2 && pts[sl.m2.id] ? pts[sl.m2.id] : b;
    if (![a, b].every(p => p && Number.isFinite(p.x))) return;
    const isSel = sl.id === S.selectedSliderId;
    Render.drawSliderTrack(a, b, isSel, parent, ma, mb);
    if (isSel) Render.drawSliderTravelMarks(a, b, sl.baseEnd === 'p2' ? b : a, sliderTravelStart(sl), sliderTravelEnd(sl), parent);
    if (s && Number.isFinite(s.x)) {
      const dirDeg = Math.atan2(TY(b.y) - TY(a.y), TX(b.x) - TX(a.x)) * 180 / Math.PI;
      if (sl.isInput) Render.drawPiston(a, b, s, sl.baseEnd === 'p2' ? b : a, parent);
      Render.drawSliderBlock(s, dirDeg, sl.isInput, isSel, parent, sliderBodyLength(sl));
      Render.drawMotorLabel(s.x, s.y, sl.isInput ? '活塞' : '滑塊', sl.isInput ? '#1f8f4e' : '#107a63', parent);
    }
    // 透明命中區：點軌道（非接點處）即選取滑軌，叫出屬性列。
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('d', barHullPath(a, b));
    hit.setAttribute('fill', 'transparent');
    hit.style.cursor = 'pointer';
    hit.addEventListener('pointerdown', (e) => {
      if (S.drawingLink || S.drawingTriangle || S.placingMotor || S.pickBars) return;
      e.stopPropagation();
      selectSlider(sl.id);
    });
    parent.appendChild(hit);
    // 固定孔畫在命中區之上，才能被點到（拖曳 / 放馬達）；否則命中區會把點擊吃掉。
    Render.drawSliderMountHole(ma, sl.m1?.id, isSel, 'M1', parent);
    Render.drawSliderMountHole(mb, sl.m2?.id, isSel, 'M2', parent);
    if (isSel) {
      Render.drawMountLabel(ma, 'M1', parent);
      Render.drawMountLabel(mb, 'M2', parent);
    }
  });
}

// 播放快路徑：只重解 + 跑各更新器就地改幾何，不拆 DOM 結構。只有 play() 迴圈會呼叫。
// 結構（零件/選取/縮放/拖曳）在播放期間不變，故安全；任何結構變更都走 draw() 完整重建。
function renderFrame() {
  if (!S.compiled || !S.comps.length || !frameUpdaters.length) { draw(); return; }
  const { pts, sol } = solveFrame();
  frameUpdaters.forEach(fn => fn(pts));
  // 滑軌動態層：就地清空重畫（共用 drawSliders）
  if (sliderLayer) {
    while (sliderLayer.firstChild) sliderLayer.removeChild(sliderLayer.firstChild);
    drawSliders(pts, sliderLayer);
  }
  if (recountBanner) recountBanner(pts, sol);
  // 3D 鏡像：沿用重建時算好的結構，只換這一幀的 pts
  if (view3DActive && lastModelInputs) { lastModelInputs = { ...lastModelInputs, pts }; push3D(); }
}

// 用最近一幀的求解結果建場景模型，推進 3D viewer
function push3D() {
  if (!viewer3D || !lastModelInputs) return;
  const { links, pts, groundIds, motorCenterIds, motorTypes, polygons, sliders } = lastModelInputs;
  const model = buildSceneModel(links, pts, { groundIds, motorCenters: motorCenterIds, motorTypes, hullR: HULL_R_WORLD, polygons, sliders });
  viewer3D.update(model);
}

function refresh3DView() {
  if (!viewer3D || !view3DActive) return;
  viewer3D.resize();
  push3D();
}

// 切換 3D 唯讀預覽：首次開啟才動態載入 THREE viewer。
async function toggle3D() {
  view3DActive = !view3DActive;
  const overlay = document.getElementById('view3d');
  const btn = document.getElementById('btn3d');
  btn.classList.toggle('active', view3DActive);
  if (view3DActive) {
    // 開 3D 時收起 2D 的編輯小面板（避免疊在覆蓋層上）
    deselectLink();
    document.getElementById('roleEditor').style.display = 'none';
    document.getElementById('servoEditor').style.display = 'none';
    document.getElementById('strokeEditor').style.display = 'none';
    overlay.style.display = 'block';
    if (!viewer3D) {
      const { createViewer } = await import('../blocks3d/viewer.js');
      viewer3D = createViewer(overlay);
    }
    refresh3DView();
    requestAnimationFrame(refresh3DView);
    setTimeout(refresh3DView, 120);
    setTimeout(refresh3DView, 360);
  } else {
    overlay.style.display = 'none';
  }
}

// 機架（隱性）：把所有固定銷用淡連接線＋陰影斜線串起來，讀作「同一個固定底座」。
// 畫在最底層（draw() 開頭呼叫）；可拖的機架把手另由 drawFrameHandle 畫在最上層。
// 沒有足夠固定銷時，退回 render.js 的飄浮地面基線（純繪圖基元）。
function drawGround() {
  const nodes = frameConnectorNodes();
  if (nodes.length < 2) { Render.drawGroundBaseline(); return; }
  // 沿 x 排序的固定銷連成機架桿身
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const seg = document.createElementNS(SVG_NS, 'line');
    seg.setAttribute('x1', TX(a.x)); seg.setAttribute('y1', TY(a.y));
    seg.setAttribute('x2', TX(b.x)); seg.setAttribute('y2', TY(b.y));
    seg.setAttribute('stroke', '#c2cad6'); seg.setAttribute('stroke-width', 3);
    seg.setAttribute('stroke-linecap', 'round');
    svg.appendChild(seg);
    // 沿桿身畫短斜線陰影（固定/接地記號），間距 14px
    const x1 = TX(a.x), y1 = TY(a.y), x2 = TX(b.x), y2 = TY(b.y);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const nx = -uy, ny = ux;                 // 桿身法線：陰影往「下方」(法線取 y 為正那側)
    const side = ny >= 0 ? 1 : -1;
    for (let d = 8; d < len; d += 14) {
      const px = x1 + ux * d, py = y1 + uy * d;
      const h = document.createElementNS(SVG_NS, 'line');
      h.setAttribute('x1', px); h.setAttribute('y1', py);
      h.setAttribute('x2', px + (nx - ux) * 8 * side); h.setAttribute('y2', py + (ny - uy) * 8 * side);
      h.setAttribute('stroke', '#dfe4ec'); h.setAttribute('stroke-width', 2);
      svg.appendChild(h);
    }
  }
}

// 機架移動把手：固定銷形心放一顆「🏠 機架」鈕，拖它＝把所有固定銷整組平移。
function drawFrameHandle() {
  const nodes = frameConnectorNodes();
  if (nodes.length < 2) return;
  const cx = nodes.reduce((s, p) => s + p.x, 0) / nodes.length;
  const cy = nodes.reduce((s, p) => s + p.y, 0) / nodes.length;
  const x = TX(cx), y = TY(cy);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${x} ${y})`);
  g.style.cursor = 'move';
  const chip = document.createElementNS(SVG_NS, 'circle');
  chip.setAttribute('r', S.dragFrame ? 13 : 11);
  chip.setAttribute('fill', '#eef1f5');
  chip.setAttribute('stroke', S.dragFrame ? '#2ecc71' : '#9aa5b4');
  chip.setAttribute('stroke-width', 2);
  g.appendChild(chip);
  const icon = document.createElementNS(SVG_NS, 'text');
  icon.setAttribute('text-anchor', 'middle');
  icon.setAttribute('dominant-baseline', 'central');
  icon.setAttribute('font-size', '12');
  icon.textContent = '🏠';
  g.appendChild(icon);
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = '機架：拖曳整組移動所有固定銷';
  g.appendChild(title);
  g.addEventListener('pointerdown', onFrameHandleDown);
  svg.appendChild(g);
}

// ---- SVG 繪製基元已抽到 ./render.js（以 Render.* 呼叫）----

// ---- 零件：放下時自動設好「角色」----
function addAnchor() {
  pushUndo();
  const n = ++S.counter;
  exitDrawLink();
  exitDrawTriangle();
  cancelMotorMode();
  const p = mobilePrompt()
    ? View.worldFromScreen(W * 0.34, H * 0.62)
    : { x: -110, y: 0 };
  S.comps.push({ type: 'anchor', id: 'Anchor' + n, p1: { id: 'A' + n, type: 'fixed', x: p.x, y: p.y } });
  rebuild(); draw();
}

function clearAll() {
  pushUndo();
  pause();
  S.comps = []; S.theta = 0; S.counter = 0;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  exitDrawLink();
  exitDrawTriangle();
  cancelMotorMode();
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('solveBanner').style.display = 'none';
  S.topo = { params: { theta: 0 }, tracePoint: '' };
  document.getElementById('thetaVal').textContent = '0';
  rebuild(); draw();
}

// ---- 播放 ----
let playDir = 1;           // 目前轉動方向
let playPlan = { mode: 'rotate' }; // 'rotate'=整圈轉；{mode:'rock',lo,hi}=在極限間來回擺

function play() {
  if (raf) return;
  document.getElementById('playBtn').classList.add('playing');
  document.getElementById('playBtn').textContent = '⏸';
  playPlan = planMotion();
  // 有限行程輸入（MG995 角度範圍 / 線性致動器行程）：覆寫成在兩端間來回擺。
  const ranged = inputRockRange();
  if (ranged && ranged.hi > ranged.lo) playPlan = { mode: 'rock', lo: ranged.lo, hi: ranged.hi };
  if (playPlan.mode === 'rock' && playDir > 0 && S.theta >= playPlan.hi) playDir = -1;
  if (playPlan.mode === 'rock' && playDir < 0 && S.theta <= playPlan.lo) playDir = 1;
  draw();   // 先完整重建一次以建立場景與更新器，之後每幀走 renderFrame() 只更新幾何（不拆 DOM）
  const step = () => {
    if (playPlan.mode === 'rock') {
      // 搖桿：在 lo..hi 間來回擺，到極限就反向（真實的搖桿物理）
      let next = S.theta + PLAY_STEP * playDir;
      if (next > playPlan.hi) { playDir = -1; next = S.theta + PLAY_STEP * playDir; }
      else if (next < playPlan.lo) { playDir = 1; next = S.theta + PLAY_STEP * playDir; }
      S.theta = next;
    } else {
      // 曲柄／平行四邊形：順向整圈轉
      S.theta = S.theta + PLAY_STEP * playDir;
    }
    document.getElementById('thetaVal').textContent = Math.round(norm360(S.theta));
    renderFrame();
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function pause() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  document.getElementById('playBtn').classList.remove('playing');
  document.getElementById('playBtn').textContent = '▶';
}
function togglePlay() { raf ? pause() : play(); }

function addLink() {
  pushUndo();
  const n = ++S.counter;
  cancelMotorMode();
  const linkCount = S.comps.filter(c => c.type === 'bar' && !c.isInput).length;
  const y = 45 + linkCount * 35; // 多根時錯開，避免一放就重疊
  const half = LINK_DEFAULT_LEN / 2;
  S.comps.push({
    type: 'bar', id: 'Link' + n, color: '#3498db',
    p1: { id: 'P' + n + 'a', type: 'floating', x: -half, y },
    p2: { id: 'P' + n + 'b', type: 'floating', x: half, y },
    lenParam: 'LL' + n, isInput: false, fixedLen: true // 連桿是固定長度的剛性桿
  });
  S.topo.params['LL' + n] = LINK_DEFAULT_LEN;
  rebuild(); draw();
  selectLink('Link' + n); // 放下就選取，方便馬上改長度
}

// ---- 畫桿模式：桌機點工具後移動游標調長度；手機則按住起點、拖到終點放開。----
function startDrawLink() {
  if (S.drawingLink) { exitDrawLink(); draw(); return; } // 再點一次＝取消
  beginDraw('link');
}
// 滑軌：沿用連桿那套拖出線段的互動，只是放開後建的是 slider（軌道+滑塊）而非 bar。
function startDrawRail() {
  if (S.drawingLink) { exitDrawLink(); draw(); return; }
  beginDraw('rail');
}
function beginDraw(kind) {
  pause();
  cancelMotorMode();
  exitDrawTriangle();
  deselectLink();
  S.drawKind = kind;
  S.drawingLink = true;
  svg.style.cursor = 'crosshair';
  if (mobilePrompt()) {
    S.drawActive = false;
    S.drawStart = null;
    S.drawStartNodeId = null;
    S.drawPreview = null;
  } else {
    S.drawActive = true;                       // 進來就活著：滑鼠一移動就更新（不必壓住）
    S.drawStart = View.worldFromScreen(W * 0.18, H * 0.26); // 支點＝畫布左上、靠按鈕右側的空白處
    S.drawStartNodeId = nearestNodeId(S.drawStart);
    S.drawPreview = { x: S.drawStart.x + LINK_DEFAULT_LEN, y: S.drawStart.y }; // 先給一根預設長度
  }
  setBanner(kind === 'rail'
    ? promptText('移動滑鼠拉出滑軌，按右鍵確定', '按住起點拖出滑軌，放開建立')
    : promptText('移動滑鼠改長度，按右鍵確定', '按住起點拖到終點，放開建立連桿'));
  draw();
}
function exitDrawLink() {
  S.drawingLink = false;
  S.drawActive = false;
  S.drawStart = null;
  S.drawPreview = null;
  S.drawStartNodeId = null;
  S.drawKind = 'link';
  svg.style.cursor = '';
  clearBanner();
}
// 找最靠近某世界座標的既有接點 id（吸附用），exclude 內的略過
// 命中用「畫面實際位置」(displayCoords) 比對，才點得到 solver 驅動而位置已移動的接點。
function nearestNodeId(world, exclude = [], maxDist = snapWorld()) {
  return nearestDisplayToPoint(world, exclude, maxDist);
}
// 從起點 start 拖到 cur 時，算出實際終點：靠近既有接點就吸附相接。
// 連桿長度對齊 8mm 孔距；滑軌/滑塊本體屬於外形尺寸，不套孔距限制。
function resolveDrawEnd(start, cur, startNodeId, snapToHoles = true) {
  const endNodeId = nearestNodeId(cur, startNodeId ? [startNodeId] : []);
  if (endNodeId) {
    const p = pointCoords()[endNodeId];
    return { pos: { x: p.x, y: p.y }, len: Math.round(Math.hypot(p.x - start.x, p.y - start.y)), nodeId: endNodeId };
  }
  const dx = cur.x - start.x, dy = cur.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) return { pos: { x: start.x + LINK_DEFAULT_LEN, y: start.y }, len: LINK_DEFAULT_LEN, nodeId: null };
  const len = snapToHoles ? snapLego(dist) : Math.max(1, roundMm(dist));
  const k = len / (dist || 1);
  return { pos: { x: start.x + dx * k, y: start.y + dy * k }, len, nodeId: null };
}
function linkLenLabel(len, nodeId = null) {
  const holes = (Math.abs(len % LEGO_STEP) < 0.01) ? ` / ${Math.round(len / LEGO_STEP) + 1}孔` : '';
  return len + 'mm' + holes + (nodeId ? ' 🔗' : '');
}
function drawDrawPreview() {
  if (!S.drawingLink || !S.drawActive || !S.drawStart || !S.drawPreview) return;
  const isRail = S.drawKind === 'rail';
  const res = resolveDrawEnd(S.drawStart, S.drawPreview, S.drawStartNodeId, !isRail);
  const accent = isRail ? '#16a085' : '#3498db';
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', barHullPath(S.drawStart, res.pos));
  path.setAttribute('fill', accent + '22');
  path.setAttribute('stroke', accent);
  path.setAttribute('stroke-width', 2);
  path.setAttribute('stroke-dasharray', '8 6');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  const labelText = isRail ? ('滑軌 ' + res.len + 'mm') : linkLenLabel(res.len, res.nodeId);
  const isMobileLabel = mobilePrompt();
  const fontSize = isMobileLabel ? 22 : 13;
  const labelPadX = isMobileLabel ? 10 : 0;
  const labelPadY = isMobileLabel ? 6 : 0;
  const labelX = (TX(S.drawStart.x) + TX(res.pos.x)) / 2;
  const labelY = (TY(S.drawStart.y) + TY(res.pos.y)) / 2 - (isMobileLabel ? 18 : 10);
  if (isMobileLabel) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    const approxW = labelText.length * fontSize * 0.58 + labelPadX * 2;
    const approxH = fontSize + labelPadY * 2;
    bg.setAttribute('x', labelX - approxW / 2);
    bg.setAttribute('y', labelY - fontSize + 1 - labelPadY);
    bg.setAttribute('width', approxW);
    bg.setAttribute('height', approxH);
    bg.setAttribute('rx', 12);
    bg.setAttribute('ry', 12);
    bg.setAttribute('fill', '#ffffff');
    bg.setAttribute('fill-opacity', '0.92');
    bg.setAttribute('stroke', '#bcd3f0');
    bg.setAttribute('stroke-width', 1.5);
    svg.appendChild(bg);
  }
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', labelX);
  label.setAttribute('y', labelY);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-size', fontSize);
  label.setAttribute('font-weight', '700');
  label.setAttribute('fill', '#2c5282');
  label.setAttribute('paint-order', 'stroke');
  label.setAttribute('stroke', '#ffffff');
  label.setAttribute('stroke-width', isMobileLabel ? 3 : 0);
  label.textContent = labelText;
  svg.appendChild(label);
}

function startDrawTriangle() {
  if (S.drawingTriangle) { exitDrawTriangle(); draw(); return; }
  pause();
  cancelMotorMode();
  exitDrawLink();
  deselectLink();
  S.drawingTriangle = true;
  S.triangleStage = 'base';
  const a = View.worldFromScreen(W * 0.18, H * 0.26);
  const b = { x: a.x + 64, y: a.y };
  const first = resolveTrianglePointAt(a);
  S.trianglePoints = [first];
  S.trianglePreview = b;
  svg.style.cursor = 'crosshair';
  setBanner(promptText(
    '三點桿：先移動調第一段，按右鍵確定（8mm 倍數）',
    '三點桿：先拖曳調第一段，放開確定（8mm 倍數）'
  ));
  draw();
}
function exitDrawTriangle() {
  S.drawingTriangle = false;
  S.triangleStage = 'base';
  S.trianglePoints = [];
  S.trianglePreview = null;
  if (!S.drawingLink) svg.style.cursor = '';
  if (!S.drawingLink) clearBanner();
}
function resolveTrianglePointAt(world, exclude = []) {
  const used = exclude.filter(Boolean);
  const nodeId = nearestNodeId(world, used);
  if (nodeId) {
    const p = pointCoords()[nodeId];
    return { nodeId, pos: { x: p.x, y: p.y } };
  }
  return { nodeId: null, pos: { x: world.x, y: world.y } };
}
function resolveTrianglePoint(world) {
  return resolveTrianglePointAt(world, S.trianglePoints.map(p => p.nodeId));
}
function resolveTriangleBaseEnd(cur) {
  const start = S.trianglePoints[0];
  if (!start) return null;
  const endNodeId = nearestNodeId(cur, start.nodeId ? [start.nodeId] : []);
  if (endNodeId) {
    const p = pointCoords()[endNodeId];
    const d = Math.hypot(p.x - start.pos.x, p.y - start.pos.y);
    const L = legoLength(d);
    if (Math.abs(d - L) < 0.75) return { nodeId: endNodeId, pos: { x: p.x, y: p.y }, len: L };
  }
  const dx = cur.x - start.pos.x, dy = cur.y - start.pos.y;
  const dist = Math.hypot(dx, dy);
  const len = dist < 6 ? 64 : legoLength(dist);
  const k = len / (dist || 1);
  return { nodeId: null, pos: { x: start.pos.x + dx * k, y: start.pos.y + dy * k }, len };
}
function legoLength(v) {
  return snapLego(v);
}
function resolveTriangleThirdPoint(cur) {
  if (S.trianglePoints.length < 2) return null;
  const a = S.trianglePoints[0].pos;
  const b = S.trianglePoints[1].pos;
  const exclude = S.trianglePoints.map(p => p.nodeId).filter(Boolean);
  const nodeId = nearestNodeId(cur, exclude);
  if (nodeId) {
    const p = pointCoords()[nodeId];
    const d1 = Math.hypot(p.x - a.x, p.y - a.y);
    const d2 = Math.hypot(p.x - b.x, p.y - b.y);
    if (Math.abs(d1 - legoLength(d1)) < 0.75 && Math.abs(d2 - legoLength(d2)) < 0.75) {
      return { nodeId, pos: { x: p.x, y: p.y }, r1: legoLength(d1), r2: legoLength(d2) };
    }
  }

  const base = Math.hypot(b.x - a.x, b.y - a.y);
  const d1Target = legoLength(Math.hypot(cur.x - a.x, cur.y - a.y));
  const d2Target = legoLength(Math.hypot(cur.x - b.x, cur.y - b.y));
  let best = null, bestScore = Infinity;
  const tryCandidate = (r1, r2) => {
    if (r1 < LEGO_STEP || r2 < LEGO_STEP) return;
    if (r1 + r2 < base || Math.abs(r1 - r2) > base) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-6) return;
    const along = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - along * along;
    if (h2 < -1e-6) return;
    const h = Math.sqrt(Math.max(0, h2));
    const ux = dx / d, uy = dy / d;
    const px = a.x + along * ux, py = a.y + along * uy;
    const nx = -uy, ny = ux;
    [{ x: px + h * nx, y: py + h * ny }, { x: px - h * nx, y: py - h * ny }].forEach(pos => {
      const score = Math.hypot(pos.x - cur.x, pos.y - cur.y);
      if (score < bestScore) { bestScore = score; best = { nodeId: null, pos, r1, r2 }; }
    });
  };
  for (let r1 = Math.max(LEGO_STEP, d1Target - 80); r1 <= d1Target + 80; r1 += LEGO_STEP) {
    for (let r2 = Math.max(LEGO_STEP, d2Target - 80); r2 <= d2Target + 80; r2 += LEGO_STEP) {
      tryCandidate(r1, r2);
    }
  }
  return best;
}
function drawTrianglePreview() {
  if (!S.drawingTriangle) return;
  const pts = S.trianglePoints.map(p => p.pos);
  let floating = null;
  if (S.trianglePreview) {
    floating = S.triangleStage === 'base' ? resolveTriangleBaseEnd(S.trianglePreview) : resolveTriangleThirdPoint(S.trianglePreview);
    if (floating) pts.push(floating.pos);
  }
  if (pts.length >= 2) {
    const path = document.createElementNS(SVG_NS, pts.length >= 3 ? 'polygon' : 'polyline');
    path.setAttribute('points', pts.map(p => `${TX(p.x)},${TY(p.y)}`).join(' '));
    path.setAttribute('fill', pts.length >= 3 ? '#27ae6022' : 'none');
    path.setAttribute('stroke', '#27ae60');
    path.setAttribute('stroke-width', 2);
    path.setAttribute('stroke-dasharray', '8 6');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }
  pts.forEach((p, idx) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', TX(p.x)); c.setAttribute('cy', TY(p.y));
    c.setAttribute('r', 6);
    c.setAttribute('fill', idx < S.trianglePoints.length ? '#27ae60' : '#fff');
    c.setAttribute('stroke', '#117a45');
    c.setAttribute('stroke-width', 2);
    svg.appendChild(c);
  });
  if (floating) {
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', TX(floating.pos.x));
    label.setAttribute('y', TY(floating.pos.y) - 12);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '13');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', '#117a45');
    label.textContent = S.triangleStage === 'base'
      ? `${floating.len}mm`
      : `${floating.r1}/${floating.r2}mm`;
    svg.appendChild(label);
  }
}
function confirmTriangleBase(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (!cur || S.trianglePoints.length !== 1) return;
  const picked = resolveTriangleBaseEnd(cur);
  if (!picked) return;
  S.trianglePoints.push(picked);
  S.triangleStage = 'third';
  const a = S.trianglePoints[0].pos, b = S.trianglePoints[1].pos;
  S.trianglePreview = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.max(40, picked.len * 0.8) };
  setBanner(promptText(
    '三點桿：移動選第三孔，按一下或右鍵確定（距離自動對齊 8mm）',
    '三點桿：拖曳選第三孔，放開確定（距離自動對齊 8mm）'
  ));
  draw();
}
function finishDrawTriangle(e) {
  const cur = worldFromEvent(e) || S.trianglePreview;
  if (S.triangleStage === 'base') { confirmTriangleBase(e); return; }
  if (!cur || S.trianglePoints.length < 2) return;
  const picked = resolveTriangleThirdPoint(cur);
  if (!picked) return;
  pushUndo();
  const n = ++S.counter;
  const suffix = ['a', 'b', 'c'];
  const all = [...S.trianglePoints, picked];
  const pts = all.map((p, i) => ({
    id: p.nodeId || `T${n}${suffix[i]}`,
    type: 'floating',
    x: p.pos.x,
    y: p.pos.y
  }));
  const dist = (a, b) => Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const gParam = 'TG' + n, r1Param = 'TR1_' + n, r2Param = 'TR2_' + n;
  S.comps.push({
    type: 'triangle', id: 'Tri' + n, color: '#27ae60',
    p1: pts[0], p2: pts[1], p3: pts[2],
    gParam, r1Param, r2Param, sign: 1
  });
  S.topo.params[gParam] = dist(pts[0], pts[1]);
  S.topo.params[r1Param] = picked.r1 || dist(pts[0], pts[2]);
  S.topo.params[r2Param] = picked.r2 || dist(pts[1], pts[2]);
  S.selectedNodeId = pts[2].id;
  exitDrawTriangle();
  rebuild(); draw();
}
function finishDrawLink(e) {
  if (!S.drawStart) return;
  const cur = worldFromEvent(e) || S.drawPreview || S.drawStart;
  const res = resolveDrawEnd(S.drawStart, cur, S.drawStartNodeId, S.drawKind !== 'rail');
  if (S.drawKind === 'rail') { finishDrawRail(res); return; }
  pushUndo();
  const n = ++S.counter;
  const lp = 'LL' + n;
  S.comps.push({
    type: 'bar', id: 'Link' + n, color: '#3498db',
    p1: { id: 'P' + n + 'a', type: 'floating', x: S.drawStart.x, y: S.drawStart.y },
    p2: { id: 'P' + n + 'b', type: 'floating', x: res.pos.x, y: res.pos.y },
    lenParam: lp, isInput: false, fixedLen: true
  });
  S.topo.params[lp] = res.len;
  // 端點落在既有接點上就合併相接（這就是「連接」）
  if (S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'P' + n + 'a', S.drawStartNodeId);
  if (res.nodeId && res.nodeId !== S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'P' + n + 'b', res.nodeId);
  exitDrawLink();
  rebuild(); draw();
  selectLink('Link' + n);
}
// 滑軌：軌道兩端釘地（fixed），中點放一個滑塊點（floating），沿軌道滑動。
// 之後用🔵連桿把曲柄端接到滑塊點，compile 會自動把它解成 slider（滑塊曲柄）。
function finishDrawRail(res) {
  pushUndo();
  const n = ++S.counter;
  const a = { x: S.drawStart.x, y: S.drawStart.y };
  const b = { x: res.pos.x, y: res.pos.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const lp = 'SL' + n;
  S.comps.push({
    type: 'slider', id: 'Slider' + n, color: '#16a085', sign: 1,
    p1: { id: 'S' + n + 'a', type: 'fixed', x: a.x, y: a.y },
    p2: { id: 'S' + n + 'b', type: 'fixed', x: b.x, y: b.y },
    p3: { id: 'S' + n + 'c', type: 'floating', x: mid.x, y: mid.y },
    m1: { id: 'S' + n + 'm1', type: 'fixed', x: a.x, y: a.y },
    m2: { id: 'S' + n + 'm2', type: 'fixed', x: b.x, y: b.y },
    lenParam: lp,
    baseEnd: 'p1',
    carriageLen: 32,
    carrierLen: res.len,
    railOffset: 0,
    travelStart: 0,
    travelEnd: res.len
  });
  S.topo.params[lp] = res.len;
  // 軌道端點落在既有接點上就合併（讓滑軌掛到既有結構）
  if (S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'S' + n + 'a', S.drawStartNodeId);
  if (res.nodeId && res.nodeId !== S.drawStartNodeId) S.comps = Model.mergePoints(S.comps, 'S' + n + 'b', res.nodeId);
  exitDrawLink();
  rebuild(); draw();
  setBanner(promptText('用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動', '用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動'));
}
// 連桿就地升級成滑軌：另一條建置路徑——先用連桿把結構接好、錨好，再把要滑動的那根變成滑軌。
// 沿用連桿兩端點的 id 當承載桿件固定孔（m1/m2），原本的連接 / 地錨都靠 id 參照自動保留；
// 軌道（p1/p2）整段貼著承載桿件、滑塊（p3）落在中點，與🟩滑軌工具畫出來的形狀一致。
function convertLinkToSlider() {
  const c = S.comps.find(x => x.id === S.selectedLinkId && x.type === 'bar' && x.fixedLen);
  if (!c) return;
  pushUndo();
  pause();
  const aId = c.p1.id, bId = c.p2.id;
  const a = { x: c.p1.x || 0, y: c.p1.y || 0 };
  const b = { x: c.p2.x || 0, y: c.p2.y || 0 };
  const len = Math.max(1, Math.round(S.topo.params[c.lenParam] || Math.hypot(b.x - a.x, b.y - a.y)));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const n = ++S.counter;
  const lp = 'SL' + n;
  // 移除原連桿：剛性桿約束由固定的承載桿件取代，避免同兩點同時有桿與移動副
  if (c.lenParam) delete S.topo.params[c.lenParam];
  S.comps = S.comps.filter(x => x.id !== c.id);
  S.comps.push({
    type: 'slider', id: 'Slider' + n, color: '#16a085', sign: 1,
    p1: { id: 'S' + n + 'a', type: 'fixed', x: a.x, y: a.y },
    p2: { id: 'S' + n + 'b', type: 'fixed', x: b.x, y: b.y },
    p3: { id: 'S' + n + 'c', type: 'floating', x: mid.x, y: mid.y },
    // 沿用連桿端點 id → 承載桿件固定孔，保留原本接好的連接與地錨
    m1: { id: aId, type: 'fixed', x: a.x, y: a.y },
    m2: { id: bId, type: 'fixed', x: b.x, y: b.y },
    lenParam: lp,
    baseEnd: 'p1',
    carriageLen: 32,
    carrierLen: len,
    railOffset: 0,
    travelStart: 0,
    travelEnd: len
  });
  S.topo.params[lp] = len;
  S.selectedLinkId = null;
  rebuild(); draw();
  selectSlider('Slider' + n);
  setBanner(promptText('連桿已變成滑軌：用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動', '連桿已變成滑軌：用🔵連桿把曲柄端接到滑塊，按 ▶ 看它滑動'));
}

// ---- 馬達：放到接點上，挑一根連桿來驅動 ----
function setBanner(text) {
  const el = document.getElementById('modeBanner');
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}
function clearBanner() { setBanner(''); }
function updateSolveBanner(sol, missingVisibleLinks) {
  const el = document.getElementById('solveBanner');
  if (!el) return;
  const show = missingVisibleLinks > 0 || (sol && sol.isValid === false);
  el.textContent = show ? '這個姿勢到死點了：有些桿件重合，求解器暫時不知道要往哪邊翻' : '';
  el.style.display = show ? 'block' : 'none';
}
function cancelMotorMode() {
  S.placingMotor = false;
  S.pickBars = null;
  svg.style.cursor = '';
  clearBanner();
}
// ---- 動力來源選單：點「動力來源」先選 TT馬達 / MG995，再進入放置模式 ----
function powerMenuEl() { return document.getElementById('powerMenu'); }
function openPowerMenu() {
  const m = powerMenuEl();
  if (m) m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}
function closePowerMenu() {
  const m = powerMenuEl();
  if (m) m.style.display = 'none';
}
function pickMotorType(type) {
  S.pendingMotorType = (type === 'mg995') ? 'mg995' : (type === 'linear') ? 'linear' : 'tt';
  closePowerMenu();
  placeMotor();
}
const motorTypeLabel = (type) => (type === 'mg995') ? 'MG995 🟦' : (type === 'linear') ? '線性致動器 🟢' : 'TT馬達 🔴';
function placeMotor() {
  pause();
  exitDrawLink();
  exitDrawTriangle();
  deselectLink();
  S.placingMotor = true;
  S.pickBars = null;
  svg.style.cursor = 'crosshair';
  const label = motorTypeLabel(S.pendingMotorType);
  setBanner(promptText(
    '點一個接點放上 ' + label,
    '點一下接點放上 ' + label
  ));
  draw();
}
function handleMotorOnNode(nodeId) {
  // 線性致動器：目標是滑塊點（slider 的 p3），讓滑塊改由直線位移驅動（活塞）。
  if (S.pendingMotorType === 'linear') {
    const sl = S.comps.find(c => c.type === 'slider' && c.p3 && c.p3.id === nodeId);
    if (!sl) { setBanner('線性致動器要放在滑塊（🟩 滑軌的方塊）上喔'); return; }
    driveSliderAt(sl.id);
    return;
  }
  const bars = barsAtNode(nodeId);
  if (!bars.length) {
    setBanner('馬達要放在連桿的端點上喔');
    return;
  }
  if (bars.length === 1) {
    driveBarAt(bars[0].id, nodeId);
    return;
  }
  S.placingMotor = false;
  S.pickBars = { nodeId, ids: bars.map(b => b.id) };
  svg.style.cursor = '';
  setBanner(promptText(
    '這個接點有好幾根桿，點一下你要馬達轉的那根',
    '這個接點有好幾根桿，點一下要馬達轉的那根'
  ));
  draw();
}
function tryPickBar(barId) {
  if (!S.pickBars) return;
  if (S.pickBars.ids.includes(barId)) driveBarAt(barId, S.pickBars.nodeId);
  else cancelMotorMode();
}
function driveBarAt(barId, nodeId) {
  const bar = S.comps.find(c => c.id === barId && c.type === 'bar');
  if (!bar) return;
  const key = bar.p1.id === nodeId ? 'p1' : (bar.p2.id === nodeId ? 'p2' : null);
  if (!key) return;
  const otherKey = key === 'p1' ? 'p2' : 'p1';
  if (pointIsGround(bar[otherKey].id)) {
    S.placingMotor = false;
    S.pickBars = null;
    svg.style.cursor = '';
    setBanner('這根連桿另一端已經釘住了，兩端都固定不會動');
    draw();
    return;
  }
  pushUndo();
  freezePointAtDisplay(nodeId);
  // 讓馬達「從現在這個姿勢」開始轉：把曲柄目前的角度記成相位偏移。
  // 否則 input 會把曲柄瞬間轉到絕對角度 0，曲柄端點被甩到別處、整個四連桿當場塌掉。
  const angDeg = Math.atan2(bar.p2.y - bar.p1.y, bar.p2.x - bar.p1.x) * 180 / Math.PI;
  bar.motorType = S.pendingMotorType;
  if (S.pendingMotorType === 'mg995') {
    // 伺服：S.theta 從 0 起算、曲柄停在原姿勢（phaseOffset 吸收絕對角），
    // 角度面板的「起始/結束角」才直覺地對應 thetaVal。
    S.theta = 0;
    bar.phaseOffset = angDeg;
    bar.servoStart = 0;
    bar.servoEnd = 90;
  } else {
    bar.phaseOffset = angDeg - S.theta;
    delete bar.servoStart;
    delete bar.servoEnd;
  }
  bar[key].type = 'fixed';
  bar[key].physicalMotor = '1';
  bar.isInput = true;
  bar.physicalMotor = '1';
  cancelMotorMode();
  // 放完直接選取這顆馬達的接點，MG995 就會跳出角度面板。
  S.selectedNodeId = nodeId;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  rebuild(); draw();
  updateRoleEditor();
}
// 線性致動器：把某根滑軌的滑塊點改成被直線位移驅動（活塞）。S.theta 從 0 起算＝行程位移。
function driveSliderAt(sliderId) {
  const sl = S.comps.find(c => c.id === sliderId && c.type === 'slider');
  if (!sl) return;
  pushUndo();
  S.theta = 0;                 // S.theta 直接當行程位移（getLinearShift valve '1' fallback 到 S.theta）
  sl.isInput = true;
  sl.physicalMotor = '1';
  if (sl.baseEnd !== 'p2') sl.baseEnd = 'p1';
  sl.travelStart = sliderProjectedDistance(sl);
  if (!Number.isFinite(Number(sl.travelEnd)) || Number(sl.travelEnd) <= Number(sl.travelStart)) {
    sl.travelEnd = railLength(sl);
  }
  delete sl.strokeMin;
  delete sl.strokeMax;
  cancelMotorMode();
  S.selectedNodeId = sl.p3.id;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  rebuild(); draw();
  updateRoleEditor();
}

// ---- 動力來源型號查詢 ----
// 找以此接點為馬達中心（physicalMotor 端）的輸入桿。
function motorBarForCenter(id) {
  return S.comps.find(c => c.type === 'bar' && c.isInput && (
    (c.p1 && c.p1.id === id && c.p1.physicalMotor) ||
    (c.p2 && c.p2.id === id && c.p2.physicalMotor)
  )) || null;
}
function motorTypeForCenter(id) {
  const bar = motorBarForCenter(id);
  return (bar && bar.motorType === 'mg995') ? 'mg995' : 'tt';
}
// 目前機構若由「有限行程的輸入」驅動（MG995 伺服角度範圍，或線性致動器的行程），
// 回它來回擺的兩端（S.theta 座標系）；否則 null。play() 用它把整圈轉覆寫成來回擺。
function inputRockRange() {
  const servoBar = S.comps.find(c => c.type === 'bar' && c.isInput && c.motorType === 'mg995');
  if (servoBar) {
    const a = Number(servoBar.servoStart) || 0;
    const b = Number.isFinite(Number(servoBar.servoEnd)) ? Number(servoBar.servoEnd) : 90;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  const slider = S.comps.find(c => c.type === 'slider' && c.isInput);
  if (slider) {
    const stroke = Math.max(0, sliderTravelEnd(slider) - sliderTravelStart(slider));
    return { lo: 0, hi: stroke };
  }
  return null;
}

// ---- 拖曳接點 + 靠近吸附合併（這就是「連接」）----
function startFreeLinkDrag(e, linkId) {
  const c = S.comps.find(x => x.id === linkId && isFreeLink(x));
  if (!c) return false;
  const w = worldFromEvent(e);
  if (!w) return false;
  S.preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  selectLink(linkId);
  S.dragLinkId = linkId;
  S.dragLastWorld = w;
  S.snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
  return true;
}
// 拖機架把手：整組平移所有固定銷。不選取任何節點、不叫屬性列。
function onFrameHandleDown(e) {
  e.preventDefault();
  if (S.drawingLink || S.drawingTriangle || S.placingMotor || S.pickBars) return;
  e.stopPropagation();
  const w = worldFromEvent(e);
  if (!w) return;
  S.preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  S.dragFrame = true;
  S.dragLastWorld = w;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
function onNodeDown(e, id) {
  e.preventDefault();
  if (S.drawingLink || S.drawingTriangle) return; // 畫圖模式：交給 svg 起點處理（會自動吸附到此接點）
  if (S.placingMotor) { e.stopPropagation(); handleMotorOnNode(id); return; }
  if (S.pickBars) return;
  S.preDragSnap = snapshotStr(); // 拖曳前狀態；若真的有變動，drag end 才記入 undo
  pause();
  // 選接點時收掉桿件 / 三點桿 / 滑軌的長度面板，各種屬性列互斥不疊在一起。
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  S.selectedNodeId = id;
  updateRoleEditor();
  S.dragId = id; S.snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
function onDragMove(e) {
  if (S.drawingTriangle) {
    if (activePointers.size >= 2) return;
    const wp = worldFromEvent(e);
    if (wp) { S.trianglePreview = wp; draw(); }
    return;
  }
  if (S.drawingLink) { // 畫桿模式：滑鼠移動（或觸控拖曳）就更新自由端
    if (activePointers.size >= 2) return; // 雙指縮放優先
    if (S.drawActive) { const wp = worldFromEvent(e); if (wp) { S.drawPreview = wp; draw(); } }
    return;
  }
  if (activePointers.size >= 2) return; // 雙指縮放/平移中，不做單指拖曳
  const w = worldFromEvent(e); if (!w) return;
  if (S.dragFrame && S.dragLastWorld) {
    const dx = w.x - S.dragLastWorld.x;
    const dy = w.y - S.dragLastWorld.y;
    frameNodeIds().forEach(id => movePointById(id, dx, dy));
    S.dragLastWorld = w;
    rebuild(); draw();
    return;
  }
  if (S.dragLinkId && S.dragLastWorld) {
    const c = S.comps.find(x => x.id === S.dragLinkId && isFreeLink(x));
    if (!c) return;
    const dx = w.x - S.dragLastWorld.x;
    const dy = w.y - S.dragLastWorld.y;
    movePointById(c.p1.id, dx, dy);
    movePointById(c.p2.id, dx, dy);
    S.dragLastWorld = w;
    rebuild(); draw();
    return;
  }
  if (!S.dragId) return;
  // 馬達輸入桿的動端：solver 會把它釘在 S.theta 對應的姿勢，直接拖會被拉回、移不動。
  // 不跟 solver 較勁——以「指標位置」找最近的接點當吸附目標、放開即連接（綠圈給回饋）。
  const crankBar = inputCrankMovingEnd(S.dragId);
  if (crankBar) {
    S.snapTarget = nearestDisplayToPoint(w, [crankBar.p1.id, crankBar.p2.id]);
    draw();
    return;
  }
  let tx = w.x, ty = w.y;
  // 自由連桿：兩端都未固定、也沒接到別的桿時，拖端點等於整根平移。
  const free = freeLinkForPoint(S.dragId);
  if (free) {
    const p = pointCoords()[S.dragId];
    const dx = w.x - (p?.x || 0);
    const dy = w.y - (p?.y || 0);
    movePointById(free.p1.id, dx, dy);
    movePointById(free.p2.id, dx, dy);
    S.snapTarget = nearestDisplayTo(S.dragId);
    rebuild(); draw();
    return;
  }
  // 固定長度連桿：已有約束時，拖端點繞另一端以固定半徑旋轉（圓規），長度不變
  const fl = fixedLinkFor(S.dragId);
  if (fl) {
    const other = fl.p1.id === S.dragId ? fl.p2 : fl.p1;
    const L = Math.max(1, S.topo.params[fl.lenParam] ||
      Math.hypot((fl.p2.x || 0) - (fl.p1.x || 0), (fl.p2.y || 0) - (fl.p1.y || 0)));
    let dx = w.x - (other.x || 0), dy = w.y - (other.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    tx = (other.x || 0) + dx / d * L;
    ty = (other.y || 0) + dy / d * L;
  }
  updatePointCoordsById(S.dragId, tx, ty);
  recomputeLengths();
  S.snapTarget = nearestDisplayTo(S.dragId);
  rebuild(); draw();
}
function commitDragUndo() {
  if (S.preDragSnap == null) return;
  if (snapshotStr() !== S.preDragSnap) {
    S.undoStack.push(S.preDragSnap);
    if (S.undoStack.length > 60) S.undoStack.shift();
    updateUndoBtn();
  }
  S.preDragSnap = null;
}
function onDragEnd(e) {
  if (S.drawingTriangle) {
    if (e && e.pointerType && e.pointerType !== 'mouse') finishDrawTriangle(e);
    return;
  }
  if (S.drawingLink) { // 觸控/筆：放開＝確定長度（滑鼠改用右鍵確定，見 contextmenu）
    if (e && e.pointerType && e.pointerType !== 'mouse') finishDrawLink(e);
    return;
  }
  if (S.dragFrame) {
    S.dragFrame = false; S.dragLastWorld = null;
    rebuild(); draw();
    commitDragUndo();
    return;
  }
  if (S.dragLinkId) {
    S.dragLinkId = null; S.dragLastWorld = null;
    rebuild(); draw();
    commitDragUndo();
    return;
  }
  if (!S.dragId) { S.preDragSnap = null; return; }
  const did = S.dragId, tgt = S.snapTarget;
  S.dragId = null; S.snapTarget = null;
  if (tgt) mergePoints(did, tgt);
  if (tgt && S.selectedNodeId === did) S.selectedNodeId = tgt;
  recomputeLengths();
  rebuild(); draw();
  commitDragUndo();
}

// ---- 選取連桿 + 改長度 ----
function selectLink(id) {
  cancelMotorMode();
  const c = S.comps.find(x => x.id === id && x.type === 'bar' && x.fixedLen);
  if (!c) return;
  S.selectedLinkId = id;
  S.selectedTriangleId = null;
  S.selectedNodeId = null;
  S.selectedSliderId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🔵 連桿長度';
  setLenButtonTitles('短 8mm（少一孔）', '長 8mm（多一孔）');
  document.getElementById('triSideSelect').style.display = 'none';
  document.getElementById('sliderFlipBtn').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = '';
  setSliderDetailRows(false);
  document.getElementById('zliftRow').style.display = 'flex';
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  renderLenEditor(Math.round(S.topo.params[c.lenParam] || 0));
  updateZliftButtons();
  draw();
}
function selectTriangle(id) {
  cancelMotorMode();
  if (!S.comps.some(x => x.id === id && x.type === 'triangle')) return;
  S.selectedTriangleId = id;
  S.selectedLinkId = null;
  S.selectedNodeId = null;
  S.selectedSliderId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🔺 三點桿';
  setLenButtonTitles('短 8mm（少一孔）', '長 8mm（多一孔）');
  S.triSide = 'g';
  const sel = document.getElementById('triSideSelect');
  sel.value = 'g';
  sel.style.display = '';
  document.getElementById('sliderFlipBtn').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  document.getElementById('zliftRow').style.display = 'flex';
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  renderTriValue();
  updateZliftButtons();
  draw();
}
// 選取滑軌：屬性列顯示軌道長度（可調）＋ 翻面（換滑塊解的那一側）＋ 刪除。
function selectSlider(id) {
  cancelMotorMode();
  const c = S.comps.find(x => x.id === id && x.type === 'slider');
  if (!c) return;
  S.selectedSliderId = id;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedNodeId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🟩 滑軌長度';
  setLenButtonTitles('滑軌短 1mm', '滑軌長 1mm');
  document.getElementById('triSideSelect').style.display = 'none';
  document.getElementById('sliderFlipBtn').style.display = '';
  document.getElementById('sliderBaseBtn').style.display = '';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(true);
  document.getElementById('zliftRow').style.display = 'none';   // 滑軌不做疊放
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  renderLenEditor(railLength(c));
  renderSliderBaseButton(c);
  renderSliderDetails(c);
  draw();
}
function setLenButtonTitles(minusTitle, plusTitle) {
  const minus = document.getElementById('lenMinusBtn');
  const plus = document.getElementById('lenPlusBtn');
  if (minus) minus.title = minusTitle;
  if (plus) plus.title = plusTitle;
}
function setSliderDetailRows(show) {
  const display = show ? 'flex' : 'none';
  const body = document.getElementById('sliderBodyRow');
  const carrier = document.getElementById('sliderCarrierRow');
  const railOffset = document.getElementById('sliderRailOffsetRow');
  const start = document.getElementById('sliderStartRow');
  const end = document.getElementById('sliderEndRow');
  if (body) body.style.display = display;
  if (carrier) carrier.style.display = display;
  if (railOffset) railOffset.style.display = display;
  if (start) start.style.display = display;
  if (end) end.style.display = display;
}
function railLength(c) {
  return Math.round(S.topo.params[c.lenParam] ||
    Math.hypot((c.p2.x || 0) - (c.p1.x || 0), (c.p2.y || 0) - (c.p1.y || 0)));
}
function sliderBodyLength(c) {
  return Math.max(1, roundMm(c.carriageLen || 32));
}
function sliderCarrierLength(c) {
  return Math.max(railLength(c), roundMm(c.carrierLen || railLength(c)));
}
function sliderRailOffset(c) {
  return Math.max(0, Math.min(Math.max(0, sliderCarrierLength(c) - railLength(c)), roundMm(c.railOffset || 0)));
}
function sliderTravelStart(c) {
  return Math.max(0, Math.min(Math.max(0, railLength(c)), roundMm(c.travelStart || 0)));
}
function sliderTravelEnd(c) {
  const L = Math.max(0, railLength(c));
  const fallback = Number.isFinite(Number(c.travelEnd)) ? Number(c.travelEnd) : L;
  return Math.max(sliderTravelStart(c), Math.min(L, roundMm(fallback)));
}
function renderSliderDetails(c) {
  const body = document.getElementById('sliderBodyVal');
  const carrier = document.getElementById('sliderCarrierVal');
  const railOffset = document.getElementById('sliderRailOffsetVal');
  const start = document.getElementById('sliderStartVal');
  const end = document.getElementById('sliderEndVal');
  if (body) body.textContent = sliderBodyLength(c);
  if (carrier) carrier.textContent = sliderCarrierLength(c);
  if (railOffset) railOffset.textContent = sliderRailOffset(c);
  if (start) start.textContent = sliderTravelStart(c);
  if (end) end.textContent = sliderTravelEnd(c);
}
function renderSliderBaseButton(c) {
  const btn = document.getElementById('sliderBaseBtn');
  if (!btn || !c) return;
  btn.textContent = c.baseEnd === 'p2' ? '固定端：B' : '固定端：A';
  btn.classList.toggle('lift-on', Boolean(c.isInput));
}
function nodeRoleLabel(id) {
  const mount = sliderMountInfo(id);
  if (mount) return `${mount.label} 滑軌固定孔`;
  return roleLabel(id);
}
function renderNodePosition(id) {
  const p = pointCoords()[id];
  const x = document.getElementById('nodeXVal');
  const y = document.getElementById('nodeYVal');
  if (x) x.textContent = p ? Math.round(p.x) : '0';
  if (y) y.textContent = p ? Math.round(p.y) : '0';
}
function sliderProjectedDistance(c) {
  if (!c || !c.p1 || !c.p2 || !c.p3) return 0;
  const base = c.baseEnd === 'p2' ? c.p2 : c.p1;
  const other = c.baseEnd === 'p2' ? c.p1 : c.p2;
  const dx = (other.x || 0) - (base.x || 0);
  const dy = (other.y || 0) - (base.y || 0);
  const L = Math.hypot(dx, dy) || 1;
  return Math.max(0, Math.min(L, roundMm((((c.p3.x || 0) - (base.x || 0)) * dx + ((c.p3.y || 0) - (base.y || 0)) * dy) / L)));
}
function normalizeSliderRange(c) {
  const L = railLength(c);
  c.carriageLen = Math.max(1, Math.min(Math.max(1, L), sliderBodyLength(c)));
  c.carrierLen = sliderCarrierLength(c);
  c.railOffset = sliderRailOffset(c);
  c.travelStart = sliderTravelStart(c);
  c.travelEnd = sliderTravelEnd(c);
}
// 改軌道長度：沿軌道方向伸縮，保留本體固定端不動（p3 仍在線上由 solver 接手）。
function changeRailLen(delta) {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  const dx = (c.p2.x || 0) - (c.p1.x || 0), dy = (c.p2.y || 0) - (c.p1.y || 0);
  const d = Math.hypot(dx, dy) || 1;
  const L = Math.max(1, Math.min(sliderCarrierLength(c) - sliderRailOffset(c), roundMm(d + delta)));
  if (c.baseEnd === 'p2') {
    c.p1.x = (c.p2.x || 0) - dx / d * L;
    c.p1.y = (c.p2.y || 0) - dy / d * L;
  } else {
    c.p2.x = (c.p1.x || 0) + dx / d * L;
    c.p2.y = (c.p1.y || 0) + dy / d * L;
  }
  S.topo.params[c.lenParam] = L;
  normalizeSliderRange(c);
  renderLenEditor(L);
  renderSliderDetails(c);
  rebuild(); draw();
}
function changeSliderBodyLen(delta) {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  c.carriageLen = Math.max(1, Math.min(Math.max(1, railLength(c)), sliderBodyLength(c) + delta));
  normalizeSliderRange(c);
  renderSliderDetails(c);
  rebuild(); draw();
}
function changeSliderCarrierLen(delta) {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  const dx = (c.m2.x || 0) - (c.m1.x || 0);
  const dy = (c.m2.y || 0) - (c.m1.y || 0);
  const d = Math.hypot(dx, dy) || 1;
  const L = Math.max(railLength(c), sliderCarrierLength(c) + delta);
  c.m2.x = (c.m1.x || 0) + dx / d * L;
  c.m2.y = (c.m1.y || 0) + dy / d * L;
  c.carrierLen = L;
  normalizeSliderRange(c);
  renderSliderDetails(c);
  rebuild(); draw();
}
function changeSliderRailOffset(delta) {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  c.railOffset = sliderRailOffset(c) + delta;
  normalizeSliderRange(c);
  renderSliderDetails(c);
  rebuild(); draw();
}
function changeSliderTravelStart(delta) {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  c.travelStart = Math.min(sliderTravelEnd(c), Math.max(0, sliderTravelStart(c) + delta));
  normalizeSliderRange(c);
  renderSliderDetails(c);
  rebuild(); draw();
}
function changeSliderTravelEnd(delta) {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  c.travelEnd = Math.max(sliderTravelStart(c), Math.min(railLength(c), sliderTravelEnd(c) + delta));
  normalizeSliderRange(c);
  renderSliderDetails(c);
  rebuild(); draw();
}
function toggleSliderBase() {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  c.baseEnd = c.baseEnd === 'p2' ? 'p1' : 'p2';
  c.travelStart = sliderProjectedDistance(c);
  c.travelEnd = Math.max(c.travelStart, railLength(c));
  normalizeSliderRange(c);
  renderSliderBaseButton(c);
  renderSliderDetails(c);
  rebuild(); draw();
}
// 翻面：切換滑塊解的那一側（slider-crank 組裝在錯邊時用）。
function flipSlider() {
  const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
  if (!c) return;
  pushUndo();
  c.sign = (Number(c.sign) < 0) ? 1 : -1;
  rebuild(); draw();
}

// 三點桿：下拉切換要調的邊（底邊 g / P1–P3 r1 / P2–P3 r2），−/＋ 就調該邊
function triParamFor(c) {
  return S.triSide === 'r1' ? c.r1Param : S.triSide === 'r2' ? c.r2Param : c.gParam;
}
function renderTriValue() {
  const c = S.comps.find(x => x.id === S.selectedTriangleId);
  if (c) renderLenEditor(Math.round(S.topo.params[triParamFor(c)] || 0));
}
function setTriSide(side) {
  S.triSide = (side === 'r1' || side === 'r2') ? side : 'g';
  renderTriValue();
}
function changeTriSide(delta) {
  const c = S.comps.find(x => x.id === S.selectedTriangleId);
  if (!c) return;
  pushUndo();
  const key = triParamFor(c);
  const L = snapLego((S.topo.params[key] || 0) + delta);
  S.topo.params[key] = L;
  reshapeTriangle(c);   // 自由三點桿才看得到；已連接的由 solver 接手
  renderLenEditor(L);
  rebuild(); draw();
}
// 依 g/r1/r2 重擺三點桿：固定 P1 與底邊方向，P2 落在距 P1 為 g 處，P3 取兩圓交點
// 中離目前位置較近的那個（避免翻面）。三角不等式不成立時 P3 不動，交給驗證提示。
function reshapeTriangle(c) {
  const g = S.topo.params[c.gParam], r1 = S.topo.params[c.r1Param], r2 = S.topo.params[c.r2Param];
  if (!(g > 0 && r1 > 0 && r2 > 0)) return;
  const P1 = { x: c.p1.x || 0, y: c.p1.y || 0 };
  const dx = (c.p2.x || 0) - P1.x, dy = (c.p2.y || 0) - P1.y;
  const d = Math.hypot(dx, dy) || 1;
  const P2 = { x: P1.x + dx / d * g, y: P1.y + dy / d * g };
  c.p2.x = P2.x; c.p2.y = P2.y;
  const bx = P2.x - P1.x, by = P2.y - P1.y;
  const base = Math.hypot(bx, by) || 1;
  if (base > r1 + r2 || base < Math.abs(r1 - r2)) return; // 三角不等式不成立
  const a = (r1 * r1 - r2 * r2 + base * base) / (2 * base);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = P1.x + a * (bx / base), my = P1.y + a * (by / base);
  const ox = -by / base * h, oy = bx / base * h;
  const cur = { x: c.p3.x || 0, y: c.p3.y || 0 };
  const cand = [{ x: mx + ox, y: my + oy }, { x: mx - ox, y: my - oy }];
  const pick = cand.reduce((best, p) =>
    Math.hypot(p.x - cur.x, p.y - cur.y) < Math.hypot(best.x - cur.x, best.y - cur.y) ? p : best);
  c.p3.x = pick.x; c.p3.y = pick.y;
}

// 把選取的桿件/三角板相對自動分層往上 / 往下挪一層（2D 疊放與 3D z 分層同步）。
// 一路往回挪到 0 就回到自動。zlift 只改疊放、不動拓撲，所以 draw() 即可、不必 rebuild。
function bringPart(dir) {
  const id = S.selectedLinkId || S.selectedTriangleId;
  if (!id) return;
  const c = S.comps.find(x => x.id === id);
  if (!c) return;
  pushUndo();
  const step = dir === 'up' ? 1 : -1;
  c.zlift = Math.max(-4, Math.min(4, (c.zlift || 0) + step));
  if (!c.zlift) delete c.zlift;
  scheduleAutosave();
  updateZliftButtons();
  draw();
}

// 反映目前選取件的 zlift 狀態到「移到最上/最下」按鈕的高亮
function updateZliftButtons() {
  const id = S.selectedLinkId || S.selectedTriangleId;
  const c = id ? S.comps.find(x => x.id === id) : null;
  const z = c ? (c.zlift || 0) : 0;
  const up = document.getElementById('liftUpBtn');
  const dn = document.getElementById('liftDownBtn');
  if (up) up.classList.toggle('lift-on', z > 0);
  if (dn) dn.classList.toggle('lift-on', z < 0);
}

// 更新長度顯示（用上方的 − / + 以 8mm 為單位調整）
function renderLenEditor(len) {
  const valEl = document.getElementById('lenValue');
  if (valEl) valEl.textContent = len;
}
function deselectLink() {
  if (!S.selectedLinkId && !S.selectedTriangleId && !S.selectedSliderId) return;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  draw();
}
function deleteSelectedPart() {
  const id = S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId;
  if (!id) return;
  const comp = S.comps.find(c => c.id === id);
  if (!comp) return;
  pushUndo();
  pause();
  if ((comp.type === 'bar' || comp.type === 'slider') && comp.lenParam) delete S.topo.params[comp.lenParam];
  if (comp.type === 'triangle') {
    [comp.gParam, comp.r1Param, comp.r2Param].forEach(k => { if (k) delete S.topo.params[k]; });
  }
  S.comps = S.comps.filter(c => c.id !== id);
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  rebuild(); draw();
}
function setLen(v) {
  const c = S.comps.find(x => x.id === S.selectedLinkId);
  if (!c) return;
  pushUndo();
  const L = snapLego(v);     // 對齊 8mm 樂高格
  S.topo.params[c.lenParam] = L;
  // 把 b 端重新擺到半徑 L（自由連桿才看得到；已連接的由 solver 接手）
  const dx = (c.p2.x || 0) - (c.p1.x || 0), dy = (c.p2.y || 0) - (c.p1.y || 0);
  const d = Math.hypot(dx, dy) || 1;
  c.p2.x = (c.p1.x || 0) + dx / d * L;
  c.p2.y = (c.p1.y || 0) + dy / d * L;
  renderLenEditor(L);
  rebuild(); draw();
}
function changeLen(delta) {
  if (S.selectedSliderId) { changeRailLen(Math.sign(delta) || 0); return; }
  if (S.selectedTriangleId) { changeTriSide(delta); return; }
  const c = S.comps.find(x => x.id === S.selectedLinkId);
  if (c) setLen((S.topo.params[c.lenParam] || 0) + delta);
}

// ---- 角色編輯（接點：自由 / 地錨 / 馬達）----
function updateRoleEditor() {
  const editor = document.getElementById('roleEditor');
  if (!editor) return;
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) {
    editor.style.display = 'none';
    updateServoEditor();
    updateStrokeEditor();
    return;
  }
  document.getElementById('roleStatus').textContent = nodeRoleLabel(S.selectedNodeId);
  renderNodePosition(S.selectedNodeId);
  const traceBtn = document.getElementById('traceBtn');
  if (traceBtn) {
    const isTrace = S.topo.tracePoint === S.selectedNodeId;
    traceBtn.textContent = isTrace ? '取消軌跡' : '設軌跡點';
    traceBtn.classList.toggle('trace-on', isTrace);
    traceBtn.title = isTrace ? '停止追蹤這個接點' : '追蹤這個接點走過的路徑';
  }
  editor.style.display = 'flex';
  updateServoEditor();
  updateStrokeEditor();
}
// 選到被線性致動器驅動的滑塊點時，跳出行程面板；其餘情況收起。
function sliderInputForPoint(id) {
  return (id && hasPoint(id))
    ? S.comps.find(c => c.type === 'slider' && c.isInput && c.p3 && c.p3.id === id) || null
    : null;
}
function updateStrokeEditor() {
  const panel = document.getElementById('strokeEditor');
  if (!panel) return;
  panel.style.display = 'none';
}
function changeStroke(which, delta) {
  const sl = sliderInputForPoint(S.selectedNodeId);
  if (!sl) return;
  pushUndo();
  if (which === 'end') {
    sl.travelEnd = Math.max(sliderTravelStart(sl), Math.min(railLength(sl), sliderTravelEnd(sl) + delta));
  } else {
    sl.travelStart = Math.min(sliderTravelEnd(sl), Math.max(0, sliderTravelStart(sl) + delta));
  }
  normalizeSliderRange(sl);
  updateStrokeEditor();
  rebuild(); draw();
}
// 選到 MG995 伺服的接點時，跳出起始/結束角面板；其餘情況收起。
function updateServoEditor() {
  const panel = document.getElementById('servoEditor');
  if (!panel) return;
  const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? motorBarForCenter(S.selectedNodeId) : null;
  if (!bar || bar.motorType !== 'mg995') {
    panel.style.display = 'none';
    return;
  }
  const sv = document.getElementById('servoStartVal');
  const ev = document.getElementById('servoEndVal');
  if (sv) sv.textContent = Math.round(Number(bar.servoStart) || 0);
  if (ev) ev.textContent = Math.round(Number.isFinite(Number(bar.servoEnd)) ? Number(bar.servoEnd) : 90);
  panel.style.display = 'flex';
}
function changeServoAngle(which, delta) {
  const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? motorBarForCenter(S.selectedNodeId) : null;
  if (!bar || bar.motorType !== 'mg995') return;
  pushUndo();
  const field = (which === 'end') ? 'servoEnd' : 'servoStart';
  const cur = Number(bar[field]);
  const base = Number.isFinite(cur) ? cur : (field === 'servoEnd' ? 90 : 0);
  bar[field] = Math.max(0, Math.min(360, Math.round(base + delta)));
  updateServoEditor();
  scheduleAutosave();
}
function setNodeRole(type) {
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
  if (sliderMountInfo(S.selectedNodeId) && type !== 'fixed') {
    setBanner('滑軌固定孔需要維持固定；可用 X/Y 或拖曳調整位置');
    return;
  }
  pushUndo();
  pause();
  if (type === 'floating') removeMotorAtPoint(S.selectedNodeId);
  if (type === 'fixed') removeMotorAtPoint(S.selectedNodeId);
  if (type === 'fixed') freezePointAtDisplay(S.selectedNodeId);
  setPointType(S.selectedNodeId, type);
  if (type === 'floating') removeAnchorsAtPoint(S.selectedNodeId);
  rebuild(); draw();
}
function changeNodePos(axis, delta) {
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
  const p = pointCoords()[S.selectedNodeId];
  if (!p) return;
  pushUndo();
  const x = axis === 'x' ? p.x + delta : p.x;
  const y = axis === 'y' ? p.y + delta : p.y;
  updatePointCoordsById(S.selectedNodeId, x, y);
  rebuild(); draw();
  updateRoleEditor();
}
function removeNodeMotor() {
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
  pushUndo();
  pause();
  removeMotorAtPoint(S.selectedNodeId);
  // 線性致動器：把驅動該滑塊的設定一併拿掉，滑塊回到被動（可由連桿推動）。
  const sl = sliderInputForPoint(S.selectedNodeId);
  if (sl) { delete sl.isInput; delete sl.physicalMotor; delete sl.strokeMin; delete sl.strokeMax; }
  rebuild(); draw();
  updateRoleEditor();
}
function toggleTracePoint() {
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
  pushUndo();
  pause();
  S.topo.tracePoint = S.topo.tracePoint === S.selectedNodeId ? '' : S.selectedNodeId;
  trajectoryCache = null;
  updateRoleEditor();
  draw();
}

svg.addEventListener('pointermove', onDragMove);
svg.addEventListener('pointerup', onDragEnd);
svg.addEventListener('pointercancel', onDragEnd);
// 點空白處（背景/地面線，未 stopPropagation）取消選取
svg.addEventListener('pointerdown', () => {
  if (S.drawingLink || S.drawingTriangle) return; // 畫圖模式：交給工具處理
  if (S.placingMotor || S.pickBars) { cancelMotorMode(); draw(); return; }
  if (S.dragId || S.dragLinkId) return;
  S.selectedNodeId = null;
  updateRoleEditor();
  if (!S.dragId) deselectLink();
});

// ---- 縮放 / 平移手勢 ----
// 雙指：pinch 縮放 + 兩指中心平移；滑鼠滾輪：以游標為錨縮放。單指維持原本的拖曳。
const activePointers = new Map();   // pointerId -> { x, y }（client 座標）
let pinchState = null;              // { dist, cx, cy }

function abortSingleDrag() {
  // 第二指落下時，放棄正在進行的單指拖曳，避免與縮放打架
  S.dragId = null; S.dragLinkId = null; S.dragLastWorld = null; S.snapTarget = null;
}

svg.addEventListener('pointerdown', (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    abortSingleDrag();
    const [p, q] = [...activePointers.values()];
    pinchState = { dist: Math.hypot(q.x - p.x, q.y - p.y), cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 };
    draw();
  }
});
svg.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2 && pinchState) {
    const [p, q] = [...activePointers.values()];
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
    View.zoomAt(svg, cx, cy, dist / (pinchState.dist || dist));
    View.panByClient(svg, cx - pinchState.cx, cy - pinchState.cy);
    pinchState = { dist, cx, cy };
    draw();
  }
});
function endPointer(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchState = null;
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

// 手機：接點優先命中（capture 階段先攔）。
// 觸控目標常比手指小，落點容易偏到接點旁邊的桿身，結果只跳出長度面板、
// 點不到那個接點去接地錨。這裡在事件還沒走到桿身/三角板的 handler 之前先判斷：
// 落點若靠近某個接點（用畫面 px 當門檻，縮放下手感一致），就直接接手那個接點，
// 並擋住桿身的 pointerdown，避免它把選取搶去顯示長度。
svg.addEventListener('pointerdown', (e) => {
  if (!mobilePrompt()) return;
  if (e.pointerType === 'mouse') return;
  if (S.drawingLink || S.drawingTriangle || S.pickBars) return; // 這些模式各自有起點處理
  if (activePointers.size >= 1) return;                    // 第二指：交給縮放手勢
  const w = worldFromEvent(e); if (!w) return;
  const ctm = svg.getScreenCTM();
  const pxToWorld = ctm && ctm.a ? 1 / (ctm.a * View.getScale()) : 1 / View.getScale();
  const id = nearestNodeId(w, [], NODE_TAP_PX * pxToWorld);
  if (!id) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); // 維持縮放偵測的指標帳本
  e.stopPropagation();   // 攔住桿身/三角板的 pointerdown，避免被搶去選長度
  onNodeDown(e, id);
}, true);

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  View.zoomAt(svg, e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  draw();
}, { passive: false });

// 畫桿模式：按下時把自由端跳到觸/點位置（觸控才需要；滑鼠靠 hover 已跟隨），並捕捉指標。
svg.addEventListener('pointerdown', (e) => {
  if (!S.drawingLink) return;
  if (activePointers.size >= 2) return; // 雙指縮放優先
  const w = worldFromEvent(e); if (!w) return;
  e.preventDefault();
  if (e.pointerType !== 'mouse' || mobilePrompt()) {
    S.drawStart = w;
    S.drawStartNodeId = nearestNodeId(S.drawStart);
    S.drawPreview = w;
    S.drawActive = true;
  } else {
    S.drawPreview = w;
  }
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
});
svg.addEventListener('pointerdown', (e) => {
  if (!S.drawingTriangle) return;
  if (activePointers.size >= 2) return;
  const w = worldFromEvent(e); if (!w) return;
  e.preventDefault();
  if (S.triangleStage === 'third' && e.pointerType === 'mouse') {
    S.trianglePreview = w;
    finishDrawTriangle(e);
    return;
  }
  S.trianglePreview = w;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
});
// 滑鼠右鍵＝確定長度 / 三點桿
svg.addEventListener('contextmenu', (e) => {
  if (!S.drawingLink && !S.drawingTriangle) return;
  e.preventDefault();
  if (S.drawingTriangle) finishDrawTriangle(e);
  else finishDrawLink(e);
});

// 目前機構的世界外接框（給 fit 用）
function currentBounds() {
  const pts = lastModelInputs && lastModelInputs.pts;
  if (!pts) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  Object.values(pts).forEach(p => {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      any = true;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  });
  return any ? { minX, maxX, minY, maxY } : null;
}
function fitView() {
  const b = currentBounds();
  if (b) View.fit(b); else View.resetView();
  draw();
}

window.addEventListener('resize', refresh3DView);
window.addEventListener('orientationchange', () => {
  setTimeout(refresh3DView, 120);
  setTimeout(refresh3DView, 360);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) setTimeout(refresh3DView, 80);
});

// ---- 課堂閉環：存檔 / 開啟 / 分享 ----
function transient(msg) {
  setBanner(msg);
  setTimeout(() => { if (document.getElementById('modeBanner').textContent === msg) clearBanner(); }, 1600);
}
function saveFile() {
  Store.downloadJson(Store.toSnapshot(S.comps, S.topo, S.counter), 'blocks.json');
}
function openFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const norm = Store.normalizeSnapshot(JSON.parse(r.result));
        if (!norm) { transient('⚠️ 檔案格式不正確'); return; }
        applySnapshot(norm);
        transient('📂 已開啟');
      } catch (e) { transient('⚠️ 讀取失敗：' + (e.message || e)); }
    };
    r.readAsText(f);
  };
  inp.click();
}
async function share() {
  let url;
  try {
    url = Store.buildShareUrl(Store.toSnapshot(S.comps, S.topo, S.counter));
  } catch (e) {
    transient('⚠️ ' + (e.message || '無法產生連結'));
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    transient('🔗 連結已複製，貼給別人就能打開');
  } catch (_) {
    window.prompt('複製這條連結分享：', url);
  }
}

// ---- 啟動：分享連結優先，其次 localStorage 自動還原，否則空白 ----
function init() {
  Render.init({ svg, onNodeDown });   // 注入繪製基元的外部依賴（預設 parent + 固定孔互動）
  populateExamples();
  let loaded = false;
  try {
    const hashObj = Store.readShareFromHash();
    if (hashObj) {
      const norm = Store.normalizeSnapshot(hashObj);
      if (norm) { applySnapshot(norm, { recordUndo: false }); loaded = true; }
    }
  } catch (e) {
    console.warn('share link load failed:', e);
    transient('⚠️ 分享連結讀取失敗');
  }
  if (!loaded) {
    const local = Store.normalizeSnapshot(Store.loadLocal());
    if (local && local.comps.length) { applySnapshot(local, { recordUndo: false }); loaded = true; }
  }
  if (!loaded) { rebuild(); draw(); }
  updateUndoBtn();
}

window.blocks = { placeMotor, openPowerMenu, pickMotorType, changeServoAngle, changeStroke, flipSlider, toggleSliderBase, convertLinkToSlider, changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset, changeSliderTravelStart, changeSliderTravelEnd, changeNodePos, addAnchor, addLink, startDrawLink, startDrawRail, startDrawTriangle, clearAll, togglePlay, setLen, changeLen, setTriSide, selectLink, setNodeRole, removeNodeMotor, toggleTracePoint, deleteSelectedPart, bringPart, toggle3D, fitView, undo, saveFile, openFile, share, loadExample };
init();
