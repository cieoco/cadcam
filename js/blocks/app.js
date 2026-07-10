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
import { createGearPath, createRackPath } from '../utils/gear-geometry.js';   // 齒輪漸開線齒廓 / 齒條齒形（rack-pinion 也用）
import { camFollowerState, camRadius } from '../utils/cam-profile.js';
// 3D 唯讀預覽（懶載入 THREE，平面路徑完全不受影響）
// computeBodyLayers：2D 疊放順序與 3D z 分層共用同一套，兩邊才一致。
import { buildSceneModel, computeBodyLayers } from '../blocks3d/scene-model.js';
// 純邏輯模組
import * as View from './view.js';
import * as Render from './render.js';   // SVG 繪製基元（純呈現）
import * as Panels from './panels.js';   // 編輯面板呈現（讀 S + 寫 DOM）
import * as Tools from './tools.js';     // 工具模式互動（畫桿 / 畫滑軌 / 畫三點桿 / 連桿升級滑軌）
import * as Input from './input.js';     // 指標 / 手勢互動（拖曳 + 吸附合併 + pinch 縮放）
import * as Model from './model.js';
import { ownedParamKeys } from './part-types.js';   // 零件型別表：擁有的參數 key
import * as Motion from './motion.js';
import { analyzeDof } from './dof.js';
import * as Store from './storage.js';
import * as Exporters from './exporters.js';
import { MAX_PLATE_POINTS, worldToLocal, localToWorld, defaultPlateVertices, plateVertices } from './plate-geometry.js';
import { S } from './state.js';          // 跨模組共享的可變狀態（S.comps / S.theta / S.selected* …）
import { BLOCK_EXAMPLES, getExample } from './examples.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stageSvg');
const { W, H, HULL_R_WORLD, TX, TY } = View;
// 樂高 Technic 孔距 = 8mm；連桿/三點桿孔位長度對齊 8mm，滑軌外形尺寸不套用。
const LEGO_STEP = Model.LEGO_FRAME_STEP;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
const GEAR_MODULE = 6;         // 齒輪模數（mm）：所有齒輪共用，節圓半徑 R=teeth·module/2，故必定咬合
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);
const roundMm = v => Math.round(Number(v) || 0);
const EXPORT_SETTINGS_KEY = 'cadcam.blocks.exportSettings';
const TT_MOUNT_SETTINGS_KEY = 'cadcam.blocks.ttMountSettings.v7';
const TT_MOUNT_DEFAULTS = {
  shaftDiameterMm: 6,
  screwDiameterMm: 3,
  screwOffsetXMm: -20.6,
  screwSpacingMm: 17.3,
  locatorDiameterMm: 4,
  locatorOffsetXMm: -11.18,
  locatorOffsetYMm: 0
};

// ---- 狀態 ----
// 跨模組共享的編輯 / 機構 / 選取 / 拖曳 / 工具 / undo 狀態收在 state.js 的 S 物件，
// 以 S.xxx 存取（見該檔說明：ES module 具名匯出唯讀，故用單一物件共享可寫狀態）。
const SERVO_STEP = 15;                 // 伺服角度面板的每步度數
// 以下為 render / 播放迴圈 / 3D 的內部狀態，待各自模組抽出時再搬，暫留本檔。
let raf = null;
let lastSolved = {};           // 上一幀求解成功的點位：給求解器挑「連續」分支 + 死點暫態回退
let prevSolved = {};           // 再上一幀：和 lastSolved 一起外插出「帶動量」的預測種子
let trajectoryCache = null;    // 沿用 multilink sweepTopology 的軌跡資料格式
let geomVersion = 0;           // 結構版本號：任何會改動軌跡的事（rebuild / 切換軌跡點）就 +1，
                               // 當 trajectoryCache 的快取鍵——比每幀 JSON.stringify 整份快照便宜。
let manualTrace = {};          // 手動拖曳軌跡：{ pointId: [{x,y}, ...] }，給無馬達範例使用。
let liveClampPointIds = null;  // 雙點量測時的兩個夾持端；播放每幀更新它們的目前開口。

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
  S.topo = { params: norm.params || {}, tracePoint: norm.tracePoint || '', tracePoints: norm.tracePoints || [] };
  manualTrace = {};
  S.counter = Math.max(norm.counter || 0, Store.highestIdNum(S.comps));
  S.theta = 0;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  deselectGear();
  closeMobileEditPanel();
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
  const mobileList = document.getElementById('mobileExampleList');
  BLOCK_EXAMPLES.forEach(example => {
    if (sel) {
      const opt = document.createElement('option');
      opt.value = example.id;
      opt.textContent = example.title;
      opt.title = example.note || '';
      sel.appendChild(opt);
    }
    if (mobileList) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mobile-example-btn';
      btn.textContent = example.title;
      btn.title = example.note || '';
      btn.addEventListener('click', () => loadExample(example.id));
      mobileList.appendChild(btn);
    }
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
  closeMobileOpenMenu();
  if (mobilePrompt()) setMobilePanel('build');
}

// ---- 綁定層：把純模組綁到本檔狀態，維持原呼叫端不變 ----
const barHullPath = View.barHullPath;
const roundedTriangleHullPath = View.roundedTriangleHullPath;
const jawPlatePath = View.jawPlatePath;
const platePath = View.platePath;
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
const isHiddenSliderRailPoint = (id) => Model.isHiddenSliderRailPoint(S.comps, id);
const isSliderMountPoint = (id) => Model.isSliderMountPoint(S.comps, id);
const sliderMountInfo = (id) => Model.sliderMountInfo(S.comps, id);
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
const snapFrameCoord = (v) => Model.snapFrameCoord(v, LEGO_STEP);
const snapFramePoint = (p) => S.lockFrameHoles ? { x: snapFrameCoord(p.x), y: snapFrameCoord(p.y) } : p;
const snapFrameNodesToGrid = () => {
  if (!S.lockFrameHoles) return;
  frameNodeIds().forEach(id => {
    const p = pointCoords()[id];
    if (p) updatePointCoordsById(id, snapFrameCoord(p.x), snapFrameCoord(p.y));
  });
};
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
const freeTriangleForPoint = (id) => Model.freeTriangleForPoint(S.comps, id);
const pinnedTriangleForPoint = (id) => Model.pinnedTriangleForPoint(S.comps, id);
const lockedTriangleVertex = (id) => Model.lockedTriangleVertex(S.comps, id);
const solvePinnedConstraints = (id, target) => Model.solvePinnedConstraints(S.comps, S.topo, id, target);
const isFreeLink = (c) => Model.isFreeLink(S.comps, c);
const barsAtNode = (nodeId) => Model.barsAtNode(S.comps, nodeId);
const pointUseCount = (id) => Model.pointUseCount(S.comps, id);

// 隱性機架：所有 grounded 接點（fixed / motor / linear）視為同一個固定底座（機架）。
// 不是獨立物件，只是把散落的固定銷當成一組——拖機架把手時整組一起平移。
// 點 key 的掃描集中在 model.js（依 part-types 表），app 只負責把結果畫出來。
function frameNodeIds() { return Model.frameNodeIds(S.comps); }
// 機架上各固定銷的座標（固定點不隨求解移動，直接用元件座標）。x 排序方便連線。
function frameNodes() { return Model.frameNodes(S.comps); }
// 機架「視覺」用的固定銷：排除滑塊自己的 rail 端點（p1/p2），保留 mount 點（m1/m2）。
// m1/m2 是真正鎖在機架上的孔；急回/滑塊範例需要把它們和曲柄軸畫成同一塊底座。
// 注意：移動仍以 frameNodeIds() 為準，滑塊照樣跟著走。
function frameConnectorNodes() { return Model.frameConnectorNodes(S.comps); }

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
  geomVersion++;                 // 結構/參數變了：讓軌跡快取失效（getTrajectoryData 重算）
  document.getElementById('hint').style.display = S.comps.length ? 'none' : 'block';
  Panels.updateRoleEditor();
  scheduleAutosave();            // 任何結構變更都防丟（debounce，播放不觸發）
}

function getTrajectoryData() {
  const ids = traceIds();
  if (!ids.length && S.compiled && S.compiled.tracePoint) ids.push(S.compiled.tracePoint);
  if (!S.compiled || !ids.length || !S.comps.length) return null;
  // 快取鍵＝結構版本號 geomVersion，取代每幀 JSON.stringify 整份快照（零件多時字串化本身會變慢）。
  // 軌跡只取決於 S.compiled 與 traceIds，兩者都只在 rebuild / 切換軌跡點變動、那兩處都會 +1，
  // 故版本號是完整且正確的失效訊號。
  if (trajectoryCache && trajectoryCache.version === geomVersion) return trajectoryCache.data;
  // 伺服與線性致動器只在自己的有限行程內運動；量測不應誤把不存在的整圈算進去。
  const range = inputRockRange();
  const thetaStart = range ? range.lo : 0;
  const thetaEnd = range ? range.hi : 360;
  const data = ids.map(id => {
    try {
      const sweep = sweepTopology({ ...S.compiled, tracePoint: id }, S.compiled.params || S.topo.params || {}, thetaStart, thetaEnd, 5);
      return (sweep && sweep.results) ? { id, results: sweep.results } : null;
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
  trajectoryCache = { version: geomVersion, data };
  return data.length ? data : null;
}

function drawTraceTrajectory(trajectoryData) {
  const traces = Array.isArray(trajectoryData)
    ? trajectoryData
    : (trajectoryData && Array.isArray(trajectoryData.results) ? [{ id: '', results: trajectoryData.results }] : []);
  traces.forEach((trace, index) => {
    const pts = trace.results.filter(r => r && r.isValid && r.B).map(r => r.B);
    if (pts.length < 2) return;
    const poly = document.createElementNS(SVG_NS, 'polyline');
    poly.setAttribute('points', pts.map(p => `${TX(p.x)},${TY(p.y)}`).join(' '));
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', traceColor(index));
    poly.setAttribute('stroke-width', 2.5);
    poly.setAttribute('stroke-opacity', 0.72);
    poly.setAttribute('stroke-linejoin', 'round');
    poly.setAttribute('stroke-linecap', 'round');
    poly.style.pointerEvents = 'none';
    svg.appendChild(poly);
  });
}

// 工作範圍＝工作點在一個完整有效運動範圍內，任兩個位置的最大直線距離。
// 這比軌跡總長更接近「末端實際能伸到多遠」，也讓圓弧、擺動與直線推拉能用同一個數字比較。
function workRangeFromTrace(trace) {
  const pts = (trace?.results || []).filter(r => r && r.isValid && r.B &&
    Number.isFinite(r.B.x) && Number.isFinite(r.B.y)).map(r => r.B);
  if (pts.length < 2) return null;
  let a = pts[0], b = pts[1], maxDistance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (d > maxDistance) { maxDistance = d; a = pts[i]; b = pts[j]; }
    }
  }
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return {
    a, b,
    distance: maxDistance,
    spanX: Math.max(...xs) - Math.min(...xs),
    spanY: Math.max(...ys) - Math.min(...ys)
  };
}

function clampRangeFromTraces(firstTrace, secondTrace) {
  const aResults = firstTrace?.results || [];
  const bResults = secondTrace?.results || [];
  let min = null, max = null;
  const count = Math.min(aResults.length, bResults.length);
  for (let i = 0; i < count; i++) {
    const a = aResults[i], b = bResults[i];
    if (!a?.isValid || !b?.isValid || !a.B || !b.B ||
        !Number.isFinite(a.B.x) || !Number.isFinite(a.B.y) ||
        !Number.isFinite(b.B.x) || !Number.isFinite(b.B.y)) continue;
    const distance = Math.hypot(a.B.x - b.B.x, a.B.y - b.B.y);
    const sample = { a: a.B, b: b.B, distance };
    if (!min || distance < min.distance) min = sample;
    if (!max || distance > max.distance) max = sample;
  }
  return min && max ? { min, max } : null;
}

function currentPointDistance(points, pointIds) {
  if (!points || !pointIds || pointIds.length !== 2) return null;
  const a = points[pointIds[0]], b = points[pointIds[1]];
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updateWorkRangeCard(measurement) {
  const card = document.getElementById('workRangeCard');
  if (!card) return;
  card.style.display = measurement ? 'flex' : 'none';
  if (!measurement) return;
  const value = document.getElementById('workRangeValue');
  const detail = document.getElementById('workRangeDetail');
  if (measurement.kind === 'clamp') {
    value.textContent = `可夾尺寸 ${roundMm(measurement.min.distance)}–${roundMm(measurement.max.distance)} mm`;
    detail.textContent = Number.isFinite(measurement.currentDistance)
      ? `目前開口 ${roundMm(measurement.currentDistance)} mm`
      : `最小開口 ${roundMm(measurement.min.distance)} mm · 最大開口 ${roundMm(measurement.max.distance)} mm`;
    return;
  }
  value.textContent = `工作範圍 ${roundMm(measurement.distance)} mm`;
  detail.textContent = `左右 ${roundMm(measurement.spanX)} mm · 上下 ${roundMm(measurement.spanY)} mm`;
}

function drawMeasurementLine(a, b, { dash = '6 5', opacity = '0.78' } = {}) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.style.pointerEvents = 'none';
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', TX(a.x)); line.setAttribute('y1', TY(a.y));
  line.setAttribute('x2', TX(b.x)); line.setAttribute('y2', TY(b.y));
  line.setAttribute('stroke', '#117a45'); line.setAttribute('stroke-width', 1.5);
  line.setAttribute('stroke-dasharray', dash); line.setAttribute('stroke-opacity', opacity);
  group.appendChild(line);
  [a, b].forEach(p => {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', TX(p.x)); dot.setAttribute('cy', TY(p.y));
    dot.setAttribute('r', 5); dot.setAttribute('fill', '#fff');
    dot.setAttribute('stroke', '#117a45'); dot.setAttribute('stroke-width', 2);
    group.appendChild(dot);
  });
  svg.appendChild(group);
}

function drawWorkRange(trajectoryData, currentPoints) {
  liveClampPointIds = null;
  const traces = Array.isArray(trajectoryData) ? trajectoryData : (trajectoryData ? [trajectoryData] : []);
  if (traces.length >= 2) {
    const clamp = clampRangeFromTraces(traces[0], traces[1]);
    const pointIds = [traces[0].id, traces[1].id];
    liveClampPointIds = clamp ? pointIds : null;
    updateWorkRangeCard(clamp ? { kind: 'clamp', ...clamp, currentDistance: currentPointDistance(currentPoints, pointIds) } : null);
    if (!clamp) return;
    drawMeasurementLine(clamp.max.a, clamp.max.b);
    // 最小開口也標出來，讓使用者看得到可夾尺寸的兩個極限。
    drawMeasurementLine(clamp.min.a, clamp.min.b, { dash: '2 5', opacity: '0.5' });
    return;
  }
  const range = workRangeFromTrace(traces[0]);
  updateWorkRangeCard(range);
  if (range) drawMeasurementLine(range.a, range.b);
}

function updateLiveClampDistance(points) {
  const distance = currentPointDistance(points, liveClampPointIds);
  if (!Number.isFinite(distance)) return;
  const detail = document.getElementById('workRangeDetail');
  if (detail) detail.textContent = `目前開口 ${roundMm(distance)} mm`;
}

function traceIds() {
  return Array.from(new Set([
    ...(S.topo.tracePoints || []),
    ...(S.topo.tracePoint ? [S.topo.tracePoint] : [])
  ]));
}

function traceColor(index) {
  return ['#008060', '#8e44ad', '#d35400', '#2c6fbb', '#c0392b', '#16a085'][index % 6];
}

function recordManualTrace() {
  const ids = traceIds();
  if (!ids.length || !S.compiled || !S.comps.length) return;
  const { pts } = solveFrame();
  ids.forEach(id => {
    const p = pts[id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const arr = manualTrace[id] || (manualTrace[id] = []);
    const last = arr[arr.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1) {
      arr.push({ x: p.x, y: p.y });
      if (arr.length > 400) arr.shift();
    }
  });
}

function drawManualTrace() {
  const ids = traceIds();
  ids.forEach((id, index) => {
    const pts = manualTrace[id] || [];
    if (pts.length < 2) return;
    const poly = document.createElementNS(SVG_NS, 'polyline');
    poly.setAttribute('points', pts.map(p => `${TX(p.x)},${TY(p.y)}`).join(' '));
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', traceColor(index));
    poly.setAttribute('stroke-width', 2.5);
    poly.setAttribute('stroke-opacity', 0.72);
    poly.setAttribute('stroke-linejoin', 'round');
    poly.setAttribute('stroke-linecap', 'round');
    poly.style.pointerEvents = 'none';
    svg.appendChild(poly);
  });
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

function hasDriveSource() {
  return S.comps.some(c => c && c.isInput) || Model.motorPointIds(S.comps).size > 0;
}

function gearMeshHasWarning() {
  return S.comps.some(c => c && c.type === 'gear' && gearMeshOff(c));
}

function updateMechanismStatus(sol = null) {
  const el = document.getElementById('mechanismStatus');
  if (!el) return;
  let state = 'idle';
  let text = '尚未建立機構';
  let title = '';
  if (S.comps.length) {
    const mobility = analyzeDof(S.comps);
    title = `理論自由度：F = ${mobility.dof}（剛體 ${mobility.bodies}、低副 ${mobility.lowerPairs}、高副 ${mobility.higherPairs}）`;
    if (gearMeshHasWarning()) {
      state = 'error';
      text = `DOF ${mobility.dof} · 齒輪未嚙合`;
    } else if (mobility.dof < 0) {
      state = 'error';
      text = `DOF ${mobility.dof} · 約束過多，可能卡住`;
    } else if (mobility.dof === 0) {
      state = 'static';
      text = 'DOF 0 · 固定結構，不能動';
    } else if (!hasDriveSource()) {
      state = 'warn';
      text = mobility.dof === 1 ? 'DOF 1 · 可運動，請加動力' : `DOF ${mobility.dof} · 太鬆，請固定或連接`;
    } else if (S.compiled && sol === null && (S.compiled.steps || []).length) {
      state = 'error';
      text = `DOF ${mobility.dof} · 機構可能卡住`;
    } else if (mobility.dof === 1) {
      state = 'ready';
      text = 'DOF 1 · 可運動';
    } else {
      state = 'warn';
      text = `DOF ${mobility.dof} · 太鬆，無法預測軌跡`;
    }
  }
  el.dataset.state = state;
  el.textContent = text;
  el.title = title;
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

function motorRotDegFromDir(dir) {
  return dir ? Math.atan2(-dir.x, -dir.y) * 180 / Math.PI : 0;
}

function normalizedDir(from, to, fallback = { x: 0, y: -1 }) {
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(to.x)) return fallback;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { x: dx / d, y: dy / d } : fallback;
}

function oppositeTarget(origin, p) {
  return (origin && p && Number.isFinite(origin.x) && Number.isFinite(p.x))
    ? { x: origin.x * 2 - p.x, y: origin.y * 2 - p.y }
    : null;
}

function motorAssemblyLayerForBody(bodyId, motorMounts) {
  if (!bodyId || !motorMounts) return null;
  let found = null;
  motorMounts.forEach(mount => {
    if (found !== null || !mount) return;
    const hasFrame = !!mount.frameBody;
    if (hasFrame && bodyId === mount.frameBody) found = 0;
    else if (bodyId === mount.outputBody) found = hasFrame ? 1 : 0;
  });
  return found;
}

// 馬達固定邏輯：輸出軸鎖在軸心；機身方向只看靜態裝配參考，不看播放後的 solved moving point。
// 這份 mount 同時供 2D/3D 使用，避免 3D 動畫時馬達跟著齒條/從動件轉。
function buildMotorMounts(motorIds, groundIds) {
  const staticPts = pointCoords();
  const mounts = new Map();
  const add = (id, target, reason, assembly = {}) => {
    const center = staticPts[id];
    const dir = normalizedDir(center, target);
    mounts.set(id, { dir, rotDeg: motorRotDegFromDir(dir), reason, ...assembly });
  };
  motorIds.forEach(id => {
    const center = staticPts[id];
    if (!center) return;

    const crankTips = new Set((S.compiled.steps || [])
      .filter(s => s.type === 'input_crank' && s.center === id)
      .map(s => s.id));
    const outputBar = S.comps.find(c => c.type === 'bar' && c.p1 && c.p2 &&
      (c.p1.id === id || c.p2.id === id) &&
      (c.isInput || crankTips.has(c.p1.id === id ? c.p2.id : c.p1.id)));
    const frameBar = S.comps.find(c => c.type === 'bar' && !c.isInput && c.p1 && c.p2 &&
      (c.p1.id === id || c.p2.id === id) &&
      !crankTips.has(c.p1.id === id ? c.p2.id : c.p1.id) &&
      groundIds.has(c.p1.id) && groundIds.has(c.p2.id));
    const barAssembly = outputBar
      ? {
          outputBody: outputBar.id,
          frameBody: frameBar ? frameBar.id : null,
          order: frameBar ? ['motor', 'frameBody', 'outputBody'] : ['motor', 'outputBody'],
        }
      : {};

    const gear = S.comps.find(c => c.type === 'gear' && c.p1?.id === id);
    if (gear) {
      const meshed = gear.mesh
        ? S.comps.find(c => c.type === 'gear' && c.id === gear.mesh)
        : S.comps.find(c => c.type === 'gear' && c.mesh === gear.id);
      if (meshed?.p1 && staticPts[meshed.p1.id]) {
        add(id, oppositeTarget(center, staticPts[meshed.p1.id]), 'gear-mesh', { outputBody: gear.id, order: ['motor', 'outputBody'] });
        return;
      }
      const rack = S.comps.find(c => c.type === 'rack' && c.pinion === gear.id);
      if (rack?.p1 && staticPts[rack.p1.id]) {
        add(id, oppositeTarget(center, staticPts[rack.p1.id]), 'rack-pinion', { outputBody: gear.id, order: ['motor', 'outputBody'] });
        return;
      }
    }

    const pulley = S.comps.find(c => c.type === 'pulley' && c.p1?.id === id);
    if (pulley) {
      const belt = S.comps.find(c => c.type === 'belt' && (c.driver === pulley.id || c.driven === pulley.id));
      const otherId = belt && (belt.driver === pulley.id ? belt.driven : belt.driver);
      const other = otherId && S.comps.find(c => c.type === 'pulley' && c.id === otherId);
      if (other?.p1 && staticPts[other.p1.id]) {
        add(id, oppositeTarget(center, staticPts[other.p1.id]), 'pulley-belt', { outputBody: pulley.id, order: ['motor', 'outputBody'] });
        return;
      }
    }

    const cam = S.comps.find(c => c.type === 'cam' && c.p1?.id === id);
    if (cam?.p2 && staticPts[cam.p2.id]) {
      add(id, oppositeTarget(center, staticPts[cam.p2.id]), 'cam-follower', { outputBody: cam.id, order: ['motor', 'outputBody'] });
      return;
    }

    if (frameBar) {
      const oid = frameBar.p1.id === id ? frameBar.p2.id : frameBar.p1.id;
      add(id, staticPts[oid], 'frame-bar', barAssembly);
      return;
    }
    if (outputBar) {
      const oid = outputBar.p1.id === id ? outputBar.p2.id : outputBar.p1.id;
      add(id, oppositeTarget(center, staticPts[oid]), 'output-crank', barAssembly);
      return;
    }

    const mount = sliderMountInfo(id);
    if (mount) {
      const other = mount.label === 'M1' ? mount.slider.m2 : mount.slider.m1;
      if (other && staticPts[other.id]) {
        add(id, staticPts[other.id], 'slider-mount', barAssembly);
        return;
      }
    }

    let best = null, bd = Infinity;
    groundIds.forEach(gid => {
      if (gid === id || isHiddenSliderRailPoint(gid)) return;
      const gp = staticPts[gid];
      if (!gp) return;
      const d = Math.hypot(gp.x - center.x, gp.y - center.y);
      if (d > 1e-3 && d < bd) { bd = d; best = gp; }
    });
    add(id, best || { x: center.x, y: center.y - 1 }, 'nearest-ground', barAssembly);
  });
  return mounts;
}

// ---- 零件繪製分派表（slice 2：登錄表化）----
// PART_DRAW[type] = { phase, draw }：把 draw() 內依 `c.type===` 的繪製分流逐步收進表，達成「加機件＝加表項」。
//   phase 決定繪製時機：'underlay'＝畫在連桿之下（gear 等機件，draw(c, pts)）；
//                       'layered' ＝畫進 zlift 疊放層（三點桿，draw(c, pts, ctx) 用 ctx 取對應 <g>）。
// 放在 app.js（DOM 層）而非純資料的 part-types.js——後者不碰 DOM（CLAUDE.md 的 core/UI 邊界）。
// 各函式體照搬自原 draw() 內聯區塊、零行為改變：直接用 app 模組級的
// svg / TX / TY / frameUpdaters / pointCoords / selectGear / selectTriangle / gearMeshOff 等。
// 目前有 gear / triangle；bar / slider / 馬達之後逐刀填表（每刀瀏覽器驗證）。
function drawGearPart(c, pts) {
  // 齒輪：在連桿下層畫齒形多邊形（漸開線齒廓由 createGearPath 產），每幀只更新旋轉。
  // 轉角＝輸出銷(p2)相對中心(p1)的角度;嚙合對的驅動/從動會自然反向轉。
  if (!c.p1 || !c.p2) return;
  const teeth = Math.max(6, Math.round(Number(c.teeth) || 12));
  const R = Number(S.topo.params[c.radiusParam]) || 40;        // 節圓半徑（世界 mm）
  const localPts = createGearPath({ teeth, module: (2 * R) / teeth });
  const sc = View.getScale();
  const polyStr = localPts.map(p => `${(p.x * sc).toFixed(2)},${(-p.y * sc).toFixed(2)}`).join(' ');
  const meshDeg = gearMeshPhaseDeg(c, pts);
  const isSelGear = c.id === S.selectedGearId;
  const meshOff = gearMeshOff(c);   // 兩中心都接地但沒對好咬合距離 → 紅色虛線環提示
  const g = document.createElementNS(SVG_NS, 'g');
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', polyStr);
  poly.setAttribute('fill', (c.color || '#b0772e') + (isSelGear ? '55' : '33'));
  poly.setAttribute('stroke', meshOff ? '#e74c3c' : (isSelGear ? '#e67e22' : (c.color || '#b0772e')));
  poly.setAttribute('stroke-width', Math.max(1, (isSelGear ? 2.4 : 1.4) * sc));
  poly.setAttribute('stroke-linejoin', 'round');
  if (meshOff) {
    poly.setAttribute('stroke-dasharray', `${(4 * sc).toFixed(1)},${(3 * sc).toFixed(1)}`);
    const t = document.createElementNS(SVG_NS, 'title');
    t.textContent = '這對齒輪的兩個軸心都已固定，但中心距不等於 Ra+Rb，沒對好咬合——把其中一個中心拖到嚙合圓上再固定';
    poly.appendChild(t);
  }
  poly.style.cursor = 'pointer';
  poly.addEventListener('pointerdown', (e) => {
    if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) return;
    e.stopPropagation();   // 點齒輪本體＝選齒輪（不觸發背景取消選取）
    selectGear(c.id);
  });
  g.appendChild(poly);
  svg.appendChild(g);
  // 輪緣螺栓孔（＝輸出銷 p2，連桿接這裡）：畫成齒輪上的安裝孔，跟著銷走。
  // 直接放在銷的世界位置（不進旋轉的 g），所以不受齒形嚙合相位 meshDeg 影響、正落在 p2 上。
  const bolt = document.createElementNS(SVG_NS, 'circle');
  const pinHoleR = Math.max(1, Number(c.pinHoleDiameter) || 5) / 2;
  bolt.setAttribute('r', Math.max(2.5, pinHoleR * sc));
  bolt.setAttribute('fill', '#ffffff');
  bolt.setAttribute('stroke', c.color || '#b0772e');
  bolt.setAttribute('stroke-width', Math.max(1.5, 2 * sc));
  bolt.style.cursor = 'grab';
  bolt.addEventListener('pointerdown', (e) => startGearManualRotate(e, c.id));
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = '拖曳旋轉齒輪輸出孔';
  bolt.appendChild(title);
  svg.appendChild(bolt);
  const applyGear = (P) => {
    const ctr = P[c.p1.id], pin = P[c.p2.id];
    const ok = ctr && pin && Number.isFinite(ctr.x) && Number.isFinite(pin.x);
    g.style.display = ok ? '' : 'none';
    bolt.style.display = ok ? '' : 'none';
    if (!ok) return;
    const deg = Math.atan2(pin.y - ctr.y, pin.x - ctr.x) * 180 / Math.PI;
    g.setAttribute('transform', `translate(${TX(ctr.x)} ${TY(ctr.y)}) rotate(${-(deg + meshDeg)})`);
    bolt.setAttribute('cx', TX(pin.x)); bolt.setAttribute('cy', TY(pin.y));
  };
  applyGear(pts);
  frameUpdaters.push(applyGear);
}
function gearMeshPhaseDeg(c, pts, memo = new Map()) {
  if (!c || !c.mesh) return 0;
  if (memo.has(c.id)) return memo.get(c.id);
  const drv = gearById(c.mesh);
  if (!drv || !drv.p1 || !drv.p2 || !c.p1 || !c.p2) return 0;
  const CA = pts[drv.p1.id] || drv.p1;
  const CB = pts[c.p1.id] || c.p1;
  const PA = pts[drv.p2.id] || drv.p2;
  const PB = pts[c.p2.id] || c.p2;
  if (![CA, CB, PA, PB].every(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))) return 0;
  const NA = Math.max(6, Math.round(Number(drv.teeth) || 12));
  const NB = Math.max(6, Math.round(Number(c.teeth) || 12));
  const betaA = Math.atan2(CB.y - CA.y, CB.x - CA.x);
  const betaB = Math.atan2(CA.y - CB.y, CA.x - CB.x);
  const angleA = Math.atan2(PA.y - CA.y, PA.x - CA.x);
  const angleB = Math.atan2(PB.y - CB.y, PB.x - CB.x);
  const meshA = gearMeshPhaseDeg(drv, pts, memo) * Math.PI / 180;
  let q = (NA * (betaA + angleA + meshA) + NB * (betaB + angleB)) / (2 * Math.PI);
  q -= Math.floor(q);
  const phase = (0.5 - q) * (360 / NB);
  memo.set(c.id, phase);
  return phase;
}
function drawGearManualHandles(pts) {
  S.comps.filter(c => c.type === 'gear' && c.p1 && c.p2).forEach(c => {
    const sc = View.getScale();
    const pinHoleR = Math.max(1, Number(c.pinHoleDiameter) || 5) / 2;
    const g = document.createElementNS(SVG_NS, 'g');
    g.style.cursor = 'grab';

    const hit = document.createElementNS(SVG_NS, 'circle');
    hit.setAttribute('r', Math.max(13, pinHoleR * sc + 7));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('stroke', 'none');
    hit.addEventListener('pointerdown', (e) => startGearManualRotate(e, c.id));

    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('r', Math.max(3.2, pinHoleR * sc));
    ring.setAttribute('fill', '#ffffff');
    ring.setAttribute('stroke', c.id === S.selectedGearId ? '#e67e22' : (c.color || '#b0772e'));
    ring.setAttribute('stroke-width', Math.max(1.8, 2.2 * sc));
    ring.style.pointerEvents = 'none';

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = '拖曳旋轉齒輪輸出孔';
    g.appendChild(title);
    g.appendChild(hit);
    g.appendChild(ring);
    svg.appendChild(g);

    const applyHandle = (P) => {
      const pin = P[c.p2.id];
      const ok = pin && Number.isFinite(pin.x) && Number.isFinite(pin.y);
      g.style.display = ok ? '' : 'none';
      if (!ok) return;
      g.setAttribute('transform', `translate(${TX(pin.x)} ${TY(pin.y)})`);
    };
    applyHandle(pts);
    frameUpdaters.push(applyHandle);
  });
}
// 三點桿：用圓角三角板呈現，同時仍保留每條邊/孔位的求解語法。phase 'layered'：畫進
// draw() 依 zlift 算好的疊放層（透過 ctx.groupForLayer/triLayerByKey/triKey 取得對應 <g>）。
// 函式體照搬自原 draw() 內聯三角板迴圈、零行為改變（內部解構改名 a,b,d 以免遮蔽參數 c）。
function drawTrianglePart(c, pts, ctx) {
  if (!c.p1 || !c.p2 || !c.p3) return;
  const ids = [c.p1.id, c.p2.id, c.p3.id];
  const path = document.createElementNS(SVG_NS, 'path');
  const color = c.color || '#27ae60';
  const isSel = c.id === S.selectedTriangleId;
  path.setAttribute('fill', color + '33');
  path.setAttribute('stroke', isSel ? '#e67e22' : color);
  path.setAttribute('stroke-width', isSel ? 3.2 : 2.5);
  path.setAttribute('stroke-linejoin', 'round');
  path.style.cursor = 'pointer';
  path.addEventListener('pointerdown', (e) => {
    if (S.drawingLink || S.drawingTriangle || S.drawingPolygon) return;
    e.stopPropagation();
    selectTriangle(c.id);
  });
  // 每幀更新：解出三點就更新外形，三點不全則隱藏（與原本「無效不畫」同效果）
  const applyTri = (P) => {
    const [a, b, d] = ids.map(id => P[id]);
    const ok = [a, b, d].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    path.style.display = ok ? '' : 'none';
    if (ok) {
      path.setAttribute('d', platePath(c, [a, b, d]) || roundedTriangleHullPath(a, b, d));
    }
  };
  if (c.shape === 'jaw') {
    path.setAttribute('fill', (c.color || '#ff7043') + '26');
    path.setAttribute('stroke-linejoin', 'round');
  }
  applyTri(pts);
  ctx.groupForLayer(ctx.triLayerByKey.get(ctx.triKey(ids))).appendChild(path);
  frameUpdaters.push(applyTri);
  if (isSel) drawPlateShapeHandles(c, ids, pts);   // 選取此板：造形點顯示可編輯握把
}
// 造形點編輯握把：選取板件時，每個造形點畫成握把。點＝切換是否鑽孔（DXF），拖＝移動，右鍵＝刪除。
// 實心橘＝會鑽孔；空心＝只描外形不鑽孔。握把每幀跟著解出的板子移動。
function drawPlateShapeHandles(comp, ids, pts) {
  plateVertices(comp).forEach((vt, vi) => {
    if (vt.solve) return;
    const handle = document.createElementNS(SVG_NS, 'circle');
    handle.setAttribute('r', 6);
    handle.setAttribute('stroke', '#e67e22');
    handle.setAttribute('stroke-width', 2);
    handle.style.cursor = 'move';
    const tip = document.createElementNS(SVG_NS, 'title');
    tip.textContent = '造形點：點一下切換是否鑽孔、拖曳移動、右鍵刪除';
    handle.appendChild(tip);
    const applyHandle = (P) => {
      const a = P[ids[0]], b = P[ids[1]];
      const w = (a && b) ? localToWorld([a, b], vt) : null;
      const ok = w && Number.isFinite(w.x) && Number.isFinite(w.y);
      handle.style.display = ok ? '' : 'none';
      if (ok) { handle.setAttribute('cx', TX(w.x)); handle.setAttribute('cy', TY(w.y)); }
      handle.setAttribute('fill', vt.hole === true ? '#e67e22' : '#fff');
    };
    handle.addEventListener('pointerdown', (e) => {
      if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) return;
      e.stopPropagation();
      startShapeDrag(e, comp.id, vi);
    });
    handle.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      deleteShapeVertex(comp.id, vi);
    });
    applyHandle(pts);
    svg.appendChild(handle);
    frameUpdaters.push(applyHandle);
  });
}
// 造形點的局部座標系＝解出的 p1、p2（與 plate-geometry 一致）。
function plateBasisFor(comp) {
  const P = pointCoords();
  const a = comp.p1 && P[comp.p1.id];
  const b = comp.p2 && P[comp.p2.id];
  if (a && b && Number.isFinite(a.x) && Number.isFinite(b.x)) return [a, b];
  if (comp.p1 && comp.p2) return [{ x: comp.p1.x, y: comp.p1.y }, { x: comp.p2.x, y: comp.p2.y }];
  return null;
}
function startShapeDrag(e, compId, vi) {
  const comp = S.comps.find(x => x.id === compId && x.type === 'triangle');
  if (!comp) return;
  pause();
  S.dragShape = { compId, vi, moved: false, startX: e.clientX, startY: e.clientY };
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  const onMove = (ev) => shapeDragMove(ev);
  const onUp = (ev) => {
    svg.removeEventListener('pointermove', onMove);
    svg.removeEventListener('pointerup', onUp);
    svg.removeEventListener('pointercancel', onUp);
    shapeDragEnd(ev);
  };
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
}
function shapeDragMove(e) {
  const ds = S.dragShape;
  if (!ds) return;
  if (!ds.moved) {
    if (Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY) < 4) return; // 抖動門檻：分辨點擊 vs 拖曳
    ds.moved = true;
    const c0 = S.comps.find(x => x.id === ds.compId && x.type === 'triangle');
    if (c0) { ensurePlateVertices(c0); pushUndo(); }
  }
  const comp = S.comps.find(x => x.id === ds.compId && x.type === 'triangle');
  if (!comp) return;
  const basis = plateBasisFor(comp);
  const w = worldFromEvent(e);
  if (!basis || !w) return;
  const local = worldToLocal(basis, w);
  if (!local) return;
  const vt = comp.vertices && comp.vertices[ds.vi];
  if (!vt || vt.solve) return;
  vt.u = Number(local.u.toFixed(1));
  vt.v = Number(local.v.toFixed(1));
  draw();
}
function shapeDragEnd() {
  const ds = S.dragShape;
  S.dragShape = null;
  if (!ds) return;
  const comp = S.comps.find(x => x.id === ds.compId && x.type === 'triangle');
  if (!comp) return;
  if (!ds.moved) {                                   // 純點擊＝切換是否鑽孔
    ensurePlateVertices(comp);
    const vt = comp.vertices[ds.vi];
    if (vt && !vt.solve) {
      pushUndo();
      if (vt.hole === true) delete vt.hole; else vt.hole = true;
    }
  }
  rebuild(); draw();
}
function deleteShapeVertex(compId, vi) {
  const comp = S.comps.find(x => x.id === compId && x.type === 'triangle');
  if (!comp) return;
  ensurePlateVertices(comp);
  const vt = comp.vertices[vi];
  if (!vt || vt.solve) return;
  pushUndo();
  comp.vertices.splice(vi, 1);
  rebuild(); draw();
}

// 齒條（rack-and-pinion）：與小齒輪嚙合的直線齒桿，沿 axisDeg 平移。齒形由 createRackPath 產，
// 每幀只更新平移（齒桿是剛體，p1 為其上一個材料點，整條跟著 p1 移動）。
function drawRackPart(c, pts) {
  if (!c.p1) return;
  const pinion = c.pinion ? S.comps.find(g => g.type === 'gear' && g.id === c.pinion) : null;
  const teeth = pinion ? Math.max(6, Math.round(Number(pinion.teeth) || 12)) : 12;
  const R = pinion ? (Number(S.topo.params[pinion.radiusParam]) || 40) : 40;   // 小齒輪節圓半徑（世界 mm）
  const module = (2 * R) / teeth;                                              // 模數對齊小齒輪，齒距才一致
  const L = Number(S.topo.params[c.lenParam]) || 160;
  const localPts = createRackPath({ length: L, height: module * 2.5, module });
  const sc = View.getScale();
  const axisDeg = Number(c.axisDeg) || 0;
  const phShift = rackPhaseShift(c, pinion, { length: L, module, teeth, axisDeg });
  const polyStr = localPts.map(p => `${((p.x + phShift) * sc).toFixed(2)},${(-p.y * sc).toFixed(2)}`).join(' ');
  const g = document.createElementNS(SVG_NS, 'g');
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', polyStr);
  poly.setAttribute('fill', (c.color || '#16a085') + '33');
  poly.setAttribute('stroke-width', Math.max(1, 1.4 * sc));
  poly.setAttribute('stroke-linejoin', 'round');
  g.appendChild(poly);
  svg.appendChild(g);
  // 齒桿本體：原點在參考點 p1（位於節線上），沿 axisDeg 旋轉；齒朝 +y 指向小齒輪。
  const applyRack = (P) => {
    const ref = P[c.p1.id];
    const ok = ref && Number.isFinite(ref.x) && Number.isFinite(ref.y);
    g.style.display = ok ? '' : 'none';
    if (!ok) return;
    // tangency 護欄：小齒輪中心到節線（過 ref、方向 axisDeg）的垂距 ≠ R → 紅色虛線提示沒對好咬合。
    let meshOff = false;
    if (pinion && pinion.p1) {
      const ctr = P[pinion.p1.id] || pinion.p1;
      if (ctr && Number.isFinite(ctr.x)) {
        const ar = axisDeg * Math.PI / 180;
        const nx = -Math.sin(ar), ny = Math.cos(ar);   // 節線法向
        const d = Math.abs((ctr.x - ref.x) * nx + (ctr.y - ref.y) * ny);
        meshOff = Math.abs(d - R) > Math.max(1, R * 0.08);
      }
    }
    poly.setAttribute('stroke', meshOff ? '#e74c3c' : (c.color || '#16a085'));
    poly.setAttribute('stroke-dasharray', meshOff ? `${(4 * sc).toFixed(1)},${(3 * sc).toFixed(1)}` : '');
    g.setAttribute('transform', `translate(${TX(ref.x)} ${TY(ref.y)}) rotate(${-axisDeg})`);
  };
  applyRack(pts);
  frameUpdaters.push(applyRack);
}

// 齒相位對齊（純滾動只需在 θ=0 對一次，之後 rolling 自動保持咬合）：
// 算出讓「小齒輪齒頂落進齒條齒隙」所需的齒條齒形局部平移（沿桿軸）。
// 2D 和 3D 都必須用同一個 θ=0 放置姿態，不能用播放後的 solved points 重算，否則會雙重位移而錯齒。
function rackPhaseShift(rack, pinion, { length, module, teeth, axisDeg }) {
  if (!rack || !rack.p1 || !pinion || !pinion.p1 || !pinion.p2) return 0;
  const a = (Number(axisDeg) || 0) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const ctr0 = pinion.p1, pin0 = pinion.p2, ref0 = rack.p1;
  const phi0 = Math.atan2(pin0.y - ctr0.y, pin0.x - ctr0.x);
  const t0 = (ctr0.x - ref0.x) * ux + (ctr0.y - ref0.y) * uy;
  const Ctx = ref0.x + ux * t0, Cty = ref0.y + uy * t0;
  const angC = Math.atan2(Cty - ctr0.y, Ctx - ctr0.x);
  const toothAng = (2 * Math.PI) / teeth;
  const pitch = Math.PI * module;
  const ppFrac = ((angC - phi0) / toothAng) % 1;
  const crownPhase = t0 - pitch * (0.5 + ppFrac);
  const startX0 = -length / 2 - pitch;
  let sh = (crownPhase - startX0) % pitch;
  if (sh < 0) sh += pitch;
  return sh;
}

function pulleyRadius(c, fallback = 32) {
  return Number(S.topo.params[c.radiusParam]) || fallback;
}

function pulleyPinRadius(c, pitchR) {
  return c.pinRadiusParam
    ? (Number(S.topo.params[c.pinRadiusParam]) || Math.round(pitchR * 0.65))
    : (Number.isFinite(Number(c.pinRadius)) ? Number(c.pinRadius) : pitchR * 0.65);
}

// 皮帶輪：p1 為中心，p2 為輪緣輸出孔；旋轉角由 solver 反映在 p2 位置。
function drawPulleyPart(c, pts) {
  if (!c.p1 || !c.p2) return;
  const R = pulleyRadius(c);
  const pinR = pulleyPinRadius(c, R);
  const sc = View.getScale();
  const color = c.color || '#d35400';
  const g = document.createElementNS(SVG_NS, 'g');

  const outer = document.createElementNS(SVG_NS, 'circle');
  outer.setAttribute('r', Math.max(1, R * sc));
  outer.setAttribute('fill', color + '26');
  outer.setAttribute('stroke', color);
  outer.setAttribute('stroke-width', Math.max(1.8, 2.4 * sc));
  g.appendChild(outer);

  const groove = document.createElementNS(SVG_NS, 'circle');
  groove.setAttribute('r', Math.max(1, (R - 3) * sc));
  groove.setAttribute('fill', 'none');
  groove.setAttribute('stroke', '#7f4a17');
  groove.setAttribute('stroke-width', Math.max(0.9, 1.2 * sc));
  groove.setAttribute('opacity', '0.55');
  g.appendChild(groove);

  const spoke = document.createElementNS(SVG_NS, 'line');
  spoke.setAttribute('x1', '0');
  spoke.setAttribute('y1', '0');
  spoke.setAttribute('x2', (pinR * sc).toFixed(2));
  spoke.setAttribute('y2', '0');
  spoke.setAttribute('stroke', color);
  spoke.setAttribute('stroke-width', Math.max(1.2, 1.8 * sc));
  spoke.setAttribute('stroke-linecap', 'round');
  g.appendChild(spoke);

  const hub = document.createElementNS(SVG_NS, 'circle');
  hub.setAttribute('r', Math.max(3, 4 * sc));
  hub.setAttribute('fill', '#ffffff');
  hub.setAttribute('stroke', color);
  hub.setAttribute('stroke-width', Math.max(1.4, 1.8 * sc));
  g.appendChild(hub);
  svg.appendChild(g);

  const bolt = document.createElementNS(SVG_NS, 'circle');
  bolt.setAttribute('r', Math.max(2.5, 3.6 * sc));
  bolt.setAttribute('fill', '#ffffff');
  bolt.setAttribute('stroke', color);
  bolt.setAttribute('stroke-width', Math.max(1.3, 1.8 * sc));
  bolt.style.pointerEvents = 'none';
  svg.appendChild(bolt);

  const applyPulley = (P) => {
    const ctr = P[c.p1.id], pin = P[c.p2.id];
    const ok = ctr && pin && Number.isFinite(ctr.x) && Number.isFinite(pin.x);
    g.style.display = ok ? '' : 'none';
    bolt.style.display = ok ? '' : 'none';
    if (!ok) return;
    const deg = Math.atan2(pin.y - ctr.y, pin.x - ctr.x) * 180 / Math.PI;
    g.setAttribute('transform', `translate(${TX(ctr.x)} ${TY(ctr.y)}) rotate(${-deg})`);
    bolt.setAttribute('cx', TX(pin.x));
    bolt.setAttribute('cy', TY(pin.y));
  };
  applyPulley(pts);
  frameUpdaters.push(applyPulley);
}

function openBeltTangents(c1, r1, c2, r2) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d <= Math.abs(r1 - r2) || d < 1e-6) return [];
  const ux = dx / d, uy = dy / d;
  const nx = -uy, ny = ux;
  const h = (r1 - r2) / d;
  const k = Math.sqrt(Math.max(0, 1 - h * h));
  return [-1, 1].map(sign => {
    const vx = h * ux + sign * k * nx;
    const vy = h * uy + sign * k * ny;
    return {
      a: { x: c1.x + vx * r1, y: c1.y + vy * r1 },
      b: { x: c2.x + vx * r2, y: c2.y + vy * r2 }
    };
  });
}

function beltArcPoints(center, radius, from, to, awayFrom, steps = 22) {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  let ccw = a1 - a0;
  while (ccw < 0) ccw += Math.PI * 2;
  const cw = ccw - Math.PI * 2;
  const choose = (delta) => {
    const mid = a0 + delta / 2;
    const midPt = { x: center.x + Math.cos(mid) * radius, y: center.y + Math.sin(mid) * radius };
    return Math.hypot(midPt.x - awayFrom.x, midPt.y - awayFrom.y);
  };
  const delta = choose(ccw) >= choose(cw) ? ccw : cw;
  const n = Math.max(4, Math.round(Math.abs(delta) / (Math.PI * 2) * steps));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + delta * (i / n);
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

function openBeltPath(c1, r1, c2, r2) {
  const t = openBeltTangents(c1, r1, c2, r2);
  if (t.length < 2) return '';
  const pts = [
    t[0].a,
    t[0].b,
    ...beltArcPoints(c2, r2, t[0].b, t[1].b, c1),
    t[1].a,
    ...beltArcPoints(c1, r1, t[1].a, t[0].a, c2)
  ];
  return pts.map((p, i) => `${i ? 'L' : 'M'} ${TX(p.x).toFixed(2)} ${TY(p.y).toFixed(2)}`).join(' ') + ' Z';
}

// 開口皮帶：畫成「兩段外公切線 + 兩段包覆圓弧」的完整路徑；傳動數學由 solver 處理。
function drawBeltPart(c, pts) {
  const driver = c.driver ? S.comps.find(p => p.type === 'pulley' && p.id === c.driver) : null;
  const driven = c.driven ? S.comps.find(p => p.type === 'pulley' && p.id === c.driven) : null;
  if (!driver?.p1 || !driven?.p1) return;
  const color = c.color || '#2c3e50';
  const sc = View.getScale();
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', Math.max(2.8, 4.4 * sc));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', '0.82');
  path.style.pointerEvents = 'none';
  svg.appendChild(path);
  const motion = document.createElementNS(SVG_NS, 'path');
  motion.setAttribute('fill', 'none');
  motion.setAttribute('stroke', '#f8fafc');
  motion.setAttribute('stroke-width', Math.max(0.8, 1.2 * sc));
  motion.setAttribute('stroke-linecap', 'round');
  motion.setAttribute('stroke-linejoin', 'round');
  motion.setAttribute('stroke-dasharray', `${(5 * sc).toFixed(1)},${(13 * sc).toFixed(1)}`);
  motion.setAttribute('opacity', '0.62');
  motion.style.pointerEvents = 'none';
  svg.appendChild(motion);
  const applyBelt = (P) => {
    const a = P[driver.p1.id], b = P[driven.p1.id];
    const ok = a && b && Number.isFinite(a.x) && Number.isFinite(b.x);
    path.style.display = ok ? '' : 'none';
    motion.style.display = ok ? '' : 'none';
    if (!ok) return;
    const d = openBeltPath(a, pulleyRadius(driver), b, pulleyRadius(driven));
    path.style.display = d ? '' : 'none';
    motion.style.display = d ? '' : 'none';
    if (!d) return;
    path.setAttribute('d', d);
    motion.setAttribute('d', d);
    const driverR = pulleyRadius(driver);
    const beltTravelPx = driverR * (Number(S.theta) || 0) * Math.PI / 180 * sc;
    motion.setAttribute('stroke-dashoffset', (-beltTravelPx).toFixed(2));
  };
  applyBelt(pts);
  frameUpdaters.push(applyBelt);
}

// 凸輪從動件：p1 為凸輪軸心，p2 為沿 axisDeg 直動的從動點；滾子中心由凸輪相切幾何推出。
function drawCamPart(c, pts) {
  if (!c.p1 || !c.p2) return;
  const baseRadius = Number(S.topo.params[c.baseRadiusParam]) || 24;
  const lift = Number(S.topo.params[c.liftParam]) || 24;
  const rollerRadiusWorld = Math.max(0, Number(c.rollerRadius) || 6);
  const sc = View.getScale();
  const color = c.color || '#9b59b6';
  const profilePts = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    const r = camRadius({ profile: c.profile, baseRadius, lift, angleRad: a });
    profilePts.push(`${(Math.cos(a) * r * sc).toFixed(2)},${(-Math.sin(a) * r * sc).toFixed(2)}`);
  }
  const axisDeg = Number(c.axisDeg) || 90;
  const axisRad = axisDeg * Math.PI / 180;
  const ux = Math.cos(axisRad), uy = Math.sin(axisRad);
  const g = document.createElementNS(SVG_NS, 'g');
  const outlineHalo = document.createElementNS(SVG_NS, 'polygon');
  outlineHalo.setAttribute('points', profilePts.join(' '));
  outlineHalo.setAttribute('fill', 'none');
  outlineHalo.setAttribute('stroke', '#ffffff');
  outlineHalo.setAttribute('stroke-width', Math.max(2.5, 4.5 * sc));
  outlineHalo.setAttribute('stroke-linejoin', 'round');
  outlineHalo.setAttribute('opacity', '0.8');
  g.appendChild(outlineHalo);
  const body = document.createElementNS(SVG_NS, 'polygon');
  body.setAttribute('points', profilePts.join(' '));
  body.setAttribute('fill', color + '55');
  body.setAttribute('stroke', '#8e44ad');
  body.setAttribute('stroke-width', Math.max(1.8, 2.6 * sc));
  body.setAttribute('stroke-linejoin', 'round');
  g.appendChild(body);
  const hub = document.createElementNS(SVG_NS, 'circle');
  hub.setAttribute('r', Math.max(3, 4 * sc));
  hub.setAttribute('fill', '#ffffff');
  hub.setAttribute('stroke', color);
  hub.setAttribute('stroke-width', Math.max(1.4, 1.8 * sc));
  g.appendChild(hub);
  svg.appendChild(g);

  const guide = document.createElementNS(SVG_NS, 'line');
  guide.setAttribute('stroke', '#8a96a3');
  guide.setAttribute('stroke-width', Math.max(1.2, 1.8 * sc));
  guide.setAttribute('stroke-linecap', 'round');
  guide.setAttribute('stroke-dasharray', `${(5 * sc).toFixed(1)},${(4 * sc).toFixed(1)}`);
  guide.style.pointerEvents = 'none';
  svg.appendChild(guide);
  const follower = document.createElementNS(SVG_NS, 'rect');
  follower.setAttribute('width', Math.max(12, 16 * sc));
  follower.setAttribute('height', Math.max(8, 10 * sc));
  follower.setAttribute('rx', Math.max(2, 2.5 * sc));
  follower.setAttribute('fill', '#f8fafc');
  follower.setAttribute('stroke', '#34495e');
  follower.setAttribute('stroke-width', Math.max(1.5, 2 * sc));
  follower.style.pointerEvents = 'none';
  svg.appendChild(follower);
  const roller = document.createElementNS(SVG_NS, 'circle');
  roller.setAttribute('r', Math.max(3, rollerRadiusWorld * sc));
  roller.setAttribute('fill', '#ffffff');
  roller.setAttribute('stroke', '#34495e');
  roller.setAttribute('stroke-width', Math.max(1.2, 1.6 * sc));
  roller.style.pointerEvents = 'none';
  svg.appendChild(roller);
  const contact = document.createElementNS(SVG_NS, 'line');
  contact.setAttribute('stroke', '#2c3e50');
  contact.setAttribute('stroke-width', Math.max(1.2, 1.5 * sc));
  contact.setAttribute('stroke-linecap', 'round');
  contact.style.pointerEvents = 'none';
  svg.appendChild(contact);

  const applyCam = (P) => {
    const ctr = P[c.p1.id], out = P[c.p2.id];
    const ok = ctr && out && Number.isFinite(ctr.x) && Number.isFinite(out.x);
    g.style.display = ok ? '' : 'none';
    guide.style.display = ok ? '' : 'none';
    follower.style.display = ok ? '' : 'none';
    roller.style.display = ok ? '' : 'none';
    contact.style.display = ok ? '' : 'none';
    if (!ok) return;
    const thetaDeg = (Number(S.theta) || 0) + (Number(c.phase) || 0);
    g.setAttribute('transform', `translate(${TX(ctr.x)} ${TY(ctr.y)}) rotate(${-thetaDeg})`);
    const state = camFollowerState({
      profile: c.profile,
      baseRadius,
      lift,
      thetaRad: thetaDeg * Math.PI / 180,
      axisRad,
      rollerRadius: rollerRadiusWorld
    });
    const support = { x: ctr.x + state.support.x, y: ctr.y + state.support.y };
    const railBack = baseRadius + lift + 18;
    const railFront = Math.max(8, baseRadius * 0.35);
    guide.setAttribute('x1', TX(ctr.x + ux * railFront));
    guide.setAttribute('y1', TY(ctr.y + uy * railFront));
    guide.setAttribute('x2', TX(ctr.x + ux * railBack));
    guide.setAttribute('y2', TY(ctr.y + uy * railBack));
    const fw = Number(follower.getAttribute('width')) || 16;
    const fh = Number(follower.getAttribute('height')) || 10;
    const blockGap = 12;
    const bx = out.x + ux * blockGap;
    const by = out.y + uy * blockGap;
    follower.setAttribute('x', TX(bx) - fw / 2);
    follower.setAttribute('y', TY(by) - fh / 2);
    follower.setAttribute('transform', `rotate(${-axisDeg} ${TX(bx)} ${TY(by)})`);
    roller.setAttribute('cx', TX(out.x));
    roller.setAttribute('cy', TY(out.y));
    contact.setAttribute('x1', TX(support.x));
    contact.setAttribute('y1', TY(support.y));
    contact.setAttribute('x2', TX(out.x));
    contact.setAttribute('y2', TY(out.y));
  };
  applyCam(pts);
  frameUpdaters.push(applyCam);
}

// 登錄表：phase 決定繪製時機——'underlay'＝連桿之下（gear/rack 等機件）、'layered'＝畫進 zlift 疊放層（三點桿）。
const PART_DRAW = {
  gear:     { phase: 'underlay', draw: drawGearPart },
  rack:     { phase: 'underlay', draw: drawRackPart },
  cam:      { phase: 'underlay', draw: drawCamPart },
  pulley:   { phase: 'underlay', draw: drawPulleyPart },
  belt:     { phase: 'underlay', draw: drawBeltPart },
  triangle: { phase: 'layered',  draw: drawTrianglePart },
};

function draw() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  frameUpdaters = [];
  sliderLayer = null;
  recountBanner = null;
  drawGround();   // app 層機架連接線（固定銷不足時 fallback 到 Render.drawGroundBaseline）
  if (!S.compiled || !S.comps.length) {
    liveClampPointIds = null;
    updateWorkRangeCard(null);
    updateMechanismStatus(null);
    updateSolveBanner(null, 0);
    Tools.drawDrawPreview();   // 空畫布也要顯示正在拉出的第一根連桿
    Tools.drawTrianglePreview();
    Tools.drawPolygonPreview();
    return;
  }

  const { pts, sol } = solveFrame();
  updateMechanismStatus(sol);

  const groundIds = new Set((S.compiled.steps || []).filter(s => s.type === 'ground').map(s => s.id));
  const motorCenterIds = new Set((S.compiled.steps || []).filter(s => s.type === 'input_crank').map(s => s.center));
  const camCenterIds = new Set(S.comps.filter(c => c.type === 'cam' && c.p1).map(c => c.p1.id));
  Model.motorPointIds(S.comps).forEach(id => { if (!camCenterIds.has(id)) motorCenterIds.add(id); });
  const modelMotorCenterIds = new Set(motorCenterIds);
  Model.motorPointIds(S.comps).forEach(id => modelMotorCenterIds.add(id));
  const motorMounts = buildMotorMounts(modelMotorCenterIds, groundIds);
  drawTtMotorMountHoles(motorCenterIds, motorMounts, pts);
  const trajectoryData = getTrajectoryData();
  drawTraceTrajectory(trajectoryData);
  drawWorkRange(trajectoryData, pts);
  drawManualTrace();

  // 馬達本體是固定在機架背後的動力源，必須先建立在機件 underlay 之下；
  // 否則 2D 會看起來像馬達蓋在齒輪/齒條最前面。
  const motorLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(motorLayer);

  // 零件繪製分派（slice 2 登錄表化）— 'underlay' 機件畫在連桿之下（z 序與原本一致）。
  [...S.comps.filter(c => c.type === 'belt'), ...S.comps.filter(c => c.type !== 'belt')]
    .forEach(c => { const e = PART_DRAW[c.type]; if (e && e.phase === 'underlay') e.draw(c, pts); });

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
    ...layerLinks.map(l => ({
      joints: [l.p1, l.p2],
      lift: l._zlift || 0,
      motorDriven: l.style === 'crank' && (motorCenterIds.has(l.p1) || motorCenterIds.has(l.p2)),
      assemblyLayer: motorAssemblyLayerForBody(l.id, motorMounts),
    })),
    ...triComps.map(t => ({ joints: [t.p1.id, t.p2.id, t.p3.id], lift: t.zlift || 0 })),
  ], groundIds);
  const linkLayer = new Map();      // link 物件 -> 層
  layerLinks.forEach((l, i) => linkLayer.set(l, bodyLayers[i]));
  const triLayerByKey = new Map();  // 三角板三點 key -> 層
  triComps.forEach((t, j) => triLayerByKey.set(triKey([t.p1.id, t.p2.id, t.p3.id]), bodyLayers[layerLinks.length + j]));

  // 依層級建立 <g> 容器，append 順序＝疊放順序（內層在底、外層在上）。
  // motorLayer 已經在 underlay 機件之前建立；節點等在這之後直接接到 svg（疊在最上層）。
  const sortedLayers = [...new Set(bodyLayers)].sort((a, b) => a - b);
  const layerGroups = new Map();
  sortedLayers.forEach(L => {
    const g = document.createElementNS(SVG_NS, 'g');
    layerGroups.set(L, g);
    svg.appendChild(g);
  });
  const groupForLayer = (L) => layerGroups.get(L) || motorLayer;

  // 三點桿繪製分派（slice 2 登錄表化）— 'layered' 畫進對應 zlift 疊放層（ctx 帶層查詢 helper）。
  const triCtx = { groupForLayer, triLayerByKey, triKey };
  S.comps.forEach(c => { const e = PART_DRAW[c.type]; if (e && e.phase === 'layered') e.draw(c, pts, triCtx); });

  // 動力來源本體：畫在桿件底下，曲柄轉在它上面。依型號畫 TT馬達或 MG995 伺服。
  // 朝向＝對準接在馬達中心、非曲柄的那根桿（指向它的另一端）；沒有就朝最近的另一個地錨；都沒有才朝下。
  // 注意：馬達記在「節點」上（point.type='motor'），曲柄那根桿的 isInput 通常仍是 false，
  // 光靠 !c.isInput 排不掉曲柄。改用 input_crank 步驟算出曲柄動端，明確把曲柄那根桿排除。
  motorCenterIds.forEach(id => {
    const p = pts[id]; if (!p || !Number.isFinite(p.x)) return;
    const mount = motorMounts.get(id);
    const rotDeg = mount ? mount.rotDeg : computeMotorRotDeg(id, pts, groundIds);
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
      body.setAttribute('transform', `translate(${TX(q.x)} ${TY(q.y)}) rotate(${rotDeg})`);
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
        if (S.drawingLink || S.drawingTriangle || S.drawingPolygon) return; // 畫圖模式：不攔截，讓 svg 起點處理
        e.stopPropagation();
        if (S.pickBars) { tryPickBar(l.id); return; }
        if (Input.startFreeLinkDrag(e, l.id)) return;
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
  // 齒輪輪緣銷不畫成通用浮動節點——改由齒輪自己畫成「螺栓孔」（見上面齒輪繪製）。
  const gearPinIds = new Set(S.comps.filter(c => c.type === 'gear' && c.p2).map(c => c.p2.id));
  const pulleyPinIds = new Set(S.comps.filter(c => c.type === 'pulley' && c.p2).map(c => c.p2.id));
  const camFollowerIds = new Set(S.comps.filter(c => c.type === 'cam' && c.p2).map(c => c.p2.id));
  Object.keys(pts).forEach(id => {
    if (isHiddenSliderRailPoint(id)) return;
    if (isSliderMountPoint(id)) return;
    if (gearPinIds.has(id)) return;
    if (pulleyPinIds.has(id)) return;
    if (camFollowerIds.has(id)) return;
    const p = pts[id];
    const isGround = groundIds.has(id);
    const isMotorCenter = motorCenterIds.has(id);
    const isCamCenter = camCenterIds.has(id);
    const mount = sliderMountInfo(id);
    const isRect = isGround && !isMotorCenter && !isCamCenter && !mount;
    const node = document.createElementNS(SVG_NS, isRect ? 'rect' : 'circle');
    if (isCamCenter) {
      node.setAttribute('r', id === S.dragId ? 7 : 5);
      node.setAttribute('fill', '#ffffff');
      node.setAttribute('stroke', '#9b59b6');
      node.setAttribute('stroke-width', 2.4);
    } else if (isMotorCenter) {
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
    node.addEventListener('pointerdown', (e) => Input.onNodeDown(e, id));
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

  drawGearManualHandles(pts);
  drawFrameHandle();   // 機架移動把手：畫在節點之上，才點得到、拖得動
  Tools.drawDrawPreview();   // 畫桿模式：疊在最上層的拖曳預覽
  Tools.drawTrianglePreview(); // 三點桿模式：疊在最上層的三角預覽
  Tools.drawPolygonPreview();  // 多邊形板模式：疊在最上層的預覽

  // 把這一幀的姿勢同步給 3D 預覽（開著時才推；平面路徑零負擔）
  // polygons 一併帶上：3D 用它把三點桿畫成實心板，並過濾掉與三角板邊重疊的桿（避免分身）。
  // motorCenterIds：3D 把這些中心畫成沉在機構背面的馬達，輸出軸往上帶動曲柄。
  // motorTypes：每個馬達中心的型號（'tt'/'mg995'），讓 3D 也畫出對應外形。
  const motorTypes = new Map();
  modelMotorCenterIds.forEach(id => motorTypes.set(id, motorTypeForCenter(id)));
  // 滑塊（無動力）幾何餵給 3D：軌道（m1-m2）＋滑塊方塊（p3，沿 p1-p2 軸向）。
  const sliders3d = S.comps
    .filter(c => c.type === 'slider' && !c.isInput && c.p1 && c.p2 && c.p3 && c.m1 && c.m2)
    .map(c => ({ id: c.id, p1: c.p1.id, p2: c.p2.id, m1: c.m1.id, m2: c.m2.id, p3: c.p3.id,
                 baseEnd: c.baseEnd === 'p2' ? 'p2' : 'p1',
                 travelStart: sliderTravelStart(c), travelEnd: sliderTravelEnd(c),
                 carriageLen: sliderBodyLength(c), color: c.color }));
  const gears3d = S.comps
    .filter(c => c.type === 'gear' && c.p1 && c.p2)
    .map(c => ({
      id: c.id,
      center: c.p1.id,
      pin: c.p2.id,
      radius: Number(S.topo.params[c.radiusParam]) || 40,
      teeth: c.teeth,
      module: c.module,
      mesh: c.mesh,
      color: c.color,
      pinHoleDiameter: Number(c.pinHoleDiameter) || 5,
    }));
  const racks3d = S.comps
    .filter(c => c.type === 'rack' && c.p1)
    .map(c => {
      const pinion = c.pinion ? S.comps.find(g => g.type === 'gear' && g.id === c.pinion) : null;
      const teeth = pinion ? Math.max(6, Math.round(Number(pinion.teeth) || 12)) : 12;
      const R = pinion ? (Number(S.topo.params[pinion.radiusParam]) || 40) : 40;
      const module = (2 * R) / teeth;
      const length = Number(S.topo.params[c.lenParam]) || 160;
      const axisDeg = Number(c.axisDeg) || 0;
      return {
        id: c.id,
        ref: c.p1.id,
        pinion: c.pinion,
        length,
        axisDeg,
        phaseShift: rackPhaseShift(c, pinion, { length, module, teeth, axisDeg }),
        color: c.color,
      };
    });
  const cams3d = S.comps
    .filter(c => c.type === 'cam' && c.p1 && c.p2)
    .map(c => ({
      id: c.id,
      center: c.p1.id,
      follower: c.p2.id,
      baseRadius: Number(S.topo.params[c.baseRadiusParam]) || 24,
      lift: Number(S.topo.params[c.liftParam]) || 24,
      axisDeg: c.axisDeg,
      profile: c.profile,
      phase: c.phase,
      rollerRadius: c.rollerRadius,
      thetaDeg: S.theta,
      color: c.color,
    }));
  const pulleys3d = S.comps
    .filter(c => c.type === 'pulley' && c.p1 && c.p2)
    .map(c => {
      const radius = pulleyRadius(c);
      return {
        id: c.id,
        center: c.p1.id,
        pin: c.p2.id,
        radius,
        pinRadius: pulleyPinRadius(c, radius),
        color: c.color,
      };
    });
  const belts3d = S.comps
    .filter(c => c.type === 'belt')
    .map(c => ({ id: c.id, driver: c.driver, driven: c.driven, color: c.color }));
  lastModelInputs = {
    links: linksToDraw, pts, groundIds, motorCenterIds: modelMotorCenterIds, motorTypes, motorMounts,
    polygons: S.compiled.visualization.polygons || [],
    sliders: sliders3d, gears: gears3d, racks: racks3d, cams: cams3d, pulleys: pulleys3d, belts: belts3d
  };
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
      if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) return;
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
  updateLiveClampDistance(pts);
  frameUpdaters.forEach(fn => fn(pts));
  // 滑軌動態層：就地清空重畫（共用 drawSliders）
  if (sliderLayer) {
    while (sliderLayer.firstChild) sliderLayer.removeChild(sliderLayer.firstChild);
    drawSliders(pts, sliderLayer);
  }
  if (recountBanner) recountBanner(pts, sol);
  updateMechanismStatus(sol);
  // 3D 鏡像：沿用重建時算好的結構，只換這一幀的 pts
  if (view3DActive && lastModelInputs) {
    const cams = (lastModelInputs.cams || []).map(c => ({ ...c, thetaDeg: S.theta }));
    lastModelInputs = { ...lastModelInputs, pts, cams };
    push3D();
  }
}

// 用最近一幀的求解結果建場景模型，推進 3D viewer
function push3D() {
  if (!viewer3D || !lastModelInputs) return;
  const { links, pts, groundIds, motorCenterIds, motorTypes, motorMounts, polygons, sliders, gears, racks, cams, pulleys, belts } = lastModelInputs;
  const model = buildSceneModel(links, pts, {
    groundIds, motorCenters: motorCenterIds, motorTypes, motorMounts, hullR: HULL_R_WORLD,
    polygons, sliders, gears, racks, cams, pulleys, belts
  });
  viewer3D.update(model);
}

function refresh3DView() {
  if (!viewer3D || !view3DActive) return;
  viewer3D.resize();
  push3D();
}

function syncMobilePanelTabs(active = document.body.dataset.mobilePanel || 'build') {
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === active);
  });
}

function setMobilePanel(panel) {
  const next = ['build', 'edit', 'view', 'project'].includes(panel) ? panel : 'build';
  document.body.dataset.mobilePanel = next;
  if (next !== 'edit') closeMobileEditPanel();
  if (next !== 'project') closeMobileOpenMenu();
  syncMobilePanelTabs(next);
}

function openMobileEditPanel() {
  if (!mobilePrompt()) return;
  document.body.dataset.mobileEditor = 'active';
  setMobilePanel('edit');
}

function closeMobileEditPanel() {
  delete document.body.dataset.mobileEditor;
}

function mobileOpenMenuEl() { return document.getElementById('mobileOpenMenu'); }
function openMobileOpenMenu() {
  const m = mobileOpenMenuEl();
  if (!m) return;
  m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}
function closeMobileOpenMenu() {
  const m = mobileOpenMenuEl();
  if (m) m.style.display = 'none';
}
function openMobileFile() {
  closeMobileOpenMenu();
  openFile();
}

// 切換 3D 唯讀預覽：首次開啟才動態載入 THREE viewer。
async function toggle3D() {
  view3DActive = !view3DActive;
  const overlay = document.getElementById('view3d');
  const btn = document.getElementById('btn3d');
  const mobileBtn = document.getElementById('mobileBtn3d');
  btn.classList.toggle('active', view3DActive);
  if (mobileBtn) mobileBtn.classList.toggle('active', view3DActive);
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

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const hull = (pts) => {
    const sorted = [...pts].sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const lower = [];
    sorted.forEach(p => {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    });
    const upper = [];
    [...sorted].reverse().forEach(p => {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    });
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  };
  const lineDistance = (p, a, b) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / d;
  };
  const maxLineDist = nodes.length <= 2 ? 0 : Math.max(...nodes.map(p => lineDistance(p, nodes[0], nodes[nodes.length - 1])));
  const isBarLike = nodes.length === 2 || maxLineDist < 6;
  const framePathNodes = isBarLike ? [...nodes].sort((a, b) => (a.x - b.x) || (a.y - b.y)) : hull(nodes);

  if (!isBarLike && framePathNodes.length >= 3) {
    const cx = framePathNodes.reduce((s, p) => s + p.x, 0) / framePathNodes.length;
    const cy = framePathNodes.reduce((s, p) => s + p.y, 0) / framePathNodes.length;
    const pad = 18;
    const expanded = framePathNodes.map(p => {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + dx / d * pad, y: p.y + dy / d * pad };
    });
    const plate = document.createElementNS(SVG_NS, 'polygon');
    plate.setAttribute('points', expanded.map(p => `${TX(p.x)},${TY(p.y)}`).join(' '));
    plate.setAttribute('fill', '#eef2f7');
    plate.setAttribute('fill-opacity', '0.82');
    plate.setAttribute('stroke', '#c2cad6');
    plate.setAttribute('stroke-width', 2.5);
    plate.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(plate);

    for (let i = 0; i < expanded.length; i++) {
      const a = expanded[i], b = expanded[(i + 1) % expanded.length];
      drawFrameHatches(a, b);
    }
    drawFramePlateHoles(expanded, nodes);
    return;
  }

  // 二點或近似共線的固定銷：畫成一根多孔機架桿身。
  for (let i = 0; i < framePathNodes.length - 1; i++) {
    const a = framePathNodes[i], b = framePathNodes[i + 1];
    const seg = document.createElementNS(SVG_NS, 'line');
    seg.setAttribute('x1', TX(a.x)); seg.setAttribute('y1', TY(a.y));
    seg.setAttribute('x2', TX(b.x)); seg.setAttribute('y2', TY(b.y));
    seg.setAttribute('stroke', '#c2cad6'); seg.setAttribute('stroke-width', 3);
    seg.setAttribute('stroke-linecap', 'round');
    svg.appendChild(seg);
    drawFrameHatches(a, b);
    drawFrameBarHoles(a, b, nodes);
  }
}

function drawFrameHatches(a, b) {
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

function drawFrameHole(x, y, used = false) {
  if (!S.showFrameHoles) return;
  const r = Math.max(1.8, 2.6 * View.getScale());
  const hole = document.createElementNS(SVG_NS, 'circle');
  hole.setAttribute('cx', TX(x));
  hole.setAttribute('cy', TY(y));
  hole.setAttribute('r', used ? r * 1.25 : r);
  hole.setAttribute('fill', used ? '#ffffff' : '#f8fafc');
  hole.setAttribute('stroke', used ? '#8a97a8' : '#cbd5e1');
  hole.setAttribute('stroke-width', used ? 1.8 : 1.2);
  hole.setAttribute('stroke-opacity', used ? 0.95 : 0.72);
  hole.style.pointerEvents = 'none';
  svg.appendChild(hole);
}

function drawTtMotorMountHoles(motorIds, motorMounts, pts) {
  if (!S.showFrameHoles) return;
  const settings = ttMountSettings();
  const s = View.getScale();
  const mountLayer = document.createElementNS(SVG_NS, 'g');
  mountLayer.style.pointerEvents = 'none';
  svg.appendChild(mountLayer);
  const addHole = (group, xMm, yMm, diaMm, attrs = {}) => {
    const hole = document.createElementNS(SVG_NS, 'circle');
    hole.setAttribute('cx', (xMm * s).toFixed(2));
    hole.setAttribute('cy', (-yMm * s).toFixed(2));
    hole.setAttribute('r', Math.max(1.5, diaMm * s / 2).toFixed(2));
    hole.setAttribute('fill', attrs.fill || '#ffffff');
    hole.setAttribute('stroke', attrs.stroke || '#c0392b');
    hole.setAttribute('stroke-width', attrs.strokeWidth || Math.max(1.2, 1.5 * s));
    if (attrs.dash) hole.setAttribute('stroke-dasharray', attrs.dash);
    group.appendChild(hole);
  };
  motorIds.forEach(id => {
    if (motorTypeForCenter(id) !== 'tt') return;
    const p = pts[id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const rotDeg = ttMountPatternRotDegForCenter(id, pts, motorMounts.get(id));
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${TX(p.x)} ${TY(p.y)}) rotate(${rotDeg})`);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = 'TT馬達機架固定孔：輸出軸孔、2 個螺絲孔、定位孔';
    g.appendChild(title);
    addHole(g, 0, 0, settings.shaftDiameterMm, { stroke: '#e74c3c', strokeWidth: Math.max(1.5, 2 * s) });
    addHole(g, settings.screwOffsetXMm, settings.screwSpacingMm / 2, settings.screwDiameterMm, { stroke: '#2c6fbb' });
    addHole(g, settings.screwOffsetXMm, -settings.screwSpacingMm / 2, settings.screwDiameterMm, { stroke: '#2c6fbb' });
    addHole(g, settings.locatorOffsetXMm, settings.locatorOffsetYMm, settings.locatorDiameterMm, {
      stroke: '#117a45',
      dash: `${Math.max(2, 3 * s).toFixed(1)} ${Math.max(1.5, 2 * s).toFixed(1)}`
    });
    mountLayer.appendChild(g);
  });
}

function syncFrameOptionButtons() {
  const holesButtons = [document.getElementById('btnFrameHoles'), document.getElementById('mobileBtnFrameHoles')].filter(Boolean);
  holesButtons.forEach(holes => {
    holes.classList.toggle('active', Boolean(S.showFrameHoles));
    holes.title = S.showFrameHoles ? '隱藏 LEGO 機架孔位' : '顯示 LEGO 機架孔位';
  });
  const lockButtons = [document.getElementById('btnFrameLock'), document.getElementById('mobileBtnFrameLock')].filter(Boolean);
  lockButtons.forEach(lock => {
    lock.classList.toggle('active', Boolean(S.lockFrameHoles));
    lock.title = S.lockFrameHoles ? '取消固定孔 8mm 吸附' : '拖曳固定孔與機架時吸附到 8mm LEGO 孔距';
  });
}

function toggleFrameHoles() {
  S.showFrameHoles = !S.showFrameHoles;
  syncFrameOptionButtons();
  draw();
}

function toggleFrameLock() {
  S.lockFrameHoles = !S.lockFrameHoles;
  syncFrameOptionButtons();
  draw();
}

function drawFrameBarHoles(a, b, usedNodes) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < LEGO_STEP) return;
  const ux = dx / len, uy = dy / len;
  const count = Math.max(1, Math.round(len / LEGO_STEP));
  for (let i = 0; i <= count; i++) {
    const t = count ? i / count : 0;
    const x = a.x + ux * len * t;
    const y = a.y + uy * len * t;
    const used = usedNodes.some(p => Math.hypot(p.x - x, p.y - y) < LEGO_STEP * 0.35);
    drawFrameHole(x, y, used);
  }
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const crosses = ((a.y > p.y) !== (b.y > p.y)) &&
      (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function drawFramePlateHoles(poly, usedNodes) {
  const xs = poly.map(p => p.x);
  const ys = poly.map(p => p.y);
  const minX = Math.ceil(Math.min(...xs) / LEGO_STEP) * LEGO_STEP;
  const maxX = Math.floor(Math.max(...xs) / LEGO_STEP) * LEGO_STEP;
  const minY = Math.ceil(Math.min(...ys) / LEGO_STEP) * LEGO_STEP;
  const maxY = Math.floor(Math.max(...ys) / LEGO_STEP) * LEGO_STEP;
  let drawn = 0;
  for (let x = minX; x <= maxX; x += LEGO_STEP) {
    for (let y = minY; y <= maxY; y += LEGO_STEP) {
      if (drawn > 600) return;
      if (!pointInPoly({ x, y }, poly)) continue;
      const used = usedNodes.some(p => Math.hypot(p.x - x, p.y - y) < LEGO_STEP * 0.35);
      drawFrameHole(x, y, used);
      drawn++;
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
  g.addEventListener('pointerdown', Input.onFrameHandleDown);
  svg.appendChild(g);
}

// ---- SVG 繪製基元已抽到 ./render.js（以 Render.* 呼叫）----

// ---- 零件：放下時自動設好「角色」----
function addAnchor() {
  pushUndo();
  const n = ++S.counter;
  Tools.exitDrawLink();
  Tools.exitDrawTriangle();
  Tools.exitDrawPolygon();
  cancelMotorMode();
  const p = mobilePrompt()
    ? View.worldFromScreen(W * 0.34, H * 0.62)
    : { x: -110, y: 0 };
  S.comps.push({ type: 'anchor', id: 'Anchor' + n, p1: { id: 'A' + n, type: 'fixed', x: p.x, y: p.y } });
  rebuild(); draw();
}

// 齒輪以「成對」為基本單位（圓心距、反向同動都是一對的性質）：放下一個嚙合齒輪對——
// 驅動輪（中心放馬達、一放下就轉）＋ 從動輪（mesh＝驅動輪），擺在相切位置（中心距＝兩節圓
// 半徑和），播放時依齒數比反向轉。兩輪共用模數 module，節圓半徑 R＝teeth·module/2，必定咬合。
function makeGear(n, opts) {
  const { teeth, module, cx, cy, isDriver, meshId, color } = opts;
  const R = teeth * module / 2;
  const pinR = Math.round(R * 0.6);
  const radiusParam = 'GR' + n;
  const pinRadiusParam = 'GPR' + n;
  // 乙：放下即「浮動未固定」——兩個中心都是 floating，比照桿件由使用者把中心拖去地錨/接點才接地。
  // 驅動輪不必顯式給馬達：兩中心接地後，gear step 的 motor 會 fallback 到預設馬達 '1'（＝播放 theta），
  // 按 ▶ 即轉（見 core/topology.js 的 gear 步驟、solver.js 的齒輪 force-set）。
  const center = { id: 'GC' + n, type: 'floating', x: cx, y: cy };
  const gear = {
    type: 'gear', id: 'Gear' + n, color,
    p1: center,
    p2: { id: 'GP' + n, type: 'floating', x: cx + pinR, y: cy },
    radiusParam, pinRadiusParam, pinHoleDiameter: 5, teeth, module, phase: 0
  };
  if (meshId) gear.mesh = meshId;
  S.topo.params[radiusParam] = R;
  S.topo.params[pinRadiusParam] = pinR;
  return gear;
}
function addGearPair() {
  pushUndo();
  Tools.exitDrawLink();
  Tools.exitDrawTriangle();
  Tools.exitDrawPolygon();
  cancelMotorMode();
  const m = GEAR_MODULE;
  const na = 12, nb = 18;                         // 預設 12:18，一放下就看得到轉速比
  const Ra = na * m / 2, Rb = nb * m / 2;
  // 擺在畫布中央偏左，整對沿 x 排開、相切
  const base = mobilePrompt() ? View.worldFromScreen(W * 0.30, H * 0.45) : { x: -70, y: 0 };
  const nA = ++S.counter;
  const driver = makeGear(nA, { teeth: na, module: m, cx: base.x, cy: base.y, isDriver: true, meshId: null, color: '#e74c3c' });
  const nB = ++S.counter;
  const driven = makeGear(nB, { teeth: nb, module: m, cx: base.x + Ra + Rb, cy: base.y, isDriver: false, meshId: driver.id, color: '#2c6fbb' });
  S.comps.push(driver, driven);
  rebuild(); draw();
  selectGear(driven.id);                          // 放下就選從動輪，方便改模數 / 齒數
}

// ---- 齒輪：選取 + 改模數 / 齒數（成對同動）----
function gearById(id) { return S.comps.find(c => c.type === 'gear' && c.id === id) || null; }

// 和某齒輪同一條嚙合鏈的所有齒輪（沿 mesh 連通分量）。模數必須整鏈一致才咬得起來。
function gearMeshChain(start) {
  const all = S.comps.filter(g => g.type === 'gear');
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const g = stack.pop();
    if (!g || seen.has(g.id)) continue;
    seen.add(g.id);
    if (g.mesh) { const drv = all.find(x => x.id === g.mesh); if (drv) stack.push(drv); }
    all.forEach(x => { if (x.mesh === g.id) stack.push(x); });
  }
  return all.filter(g => seen.has(g.id));
}
// 把每顆「從動輪」重擺到和它驅動輪相切（中心距＝兩節圓半徑和），沿目前方向。改模數/齒數後保持嚙合。
function syncGearMesh() {
  S.comps.filter(c => c.type === 'gear' && c.mesh).forEach(c => {
    const drv = gearById(c.mesh);
    if (!drv) return;
    const dc = pointCoords()[drv.p1.id] || drv.p1;
    const cc = pointCoords()[c.p1.id] || c.p1;
    const Rd = Number(S.topo.params[drv.radiusParam]) || 40;
    const Rc = Number(S.topo.params[c.radiusParam]) || 40;
    let dx = (cc.x || 0) - (dc.x || 0), dy = (cc.y || 0) - (dc.y || 0);
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    updatePointCoordsById(c.p1.id, (dc.x || 0) + dx / d * (Rd + Rc), (dc.y || 0) + dy / d * (Rd + Rc));
  });
}
// 嚙合防呆：這顆齒輪與其嚙合夥伴若「都已接地」但中心距 ≠ Ra+Rb（>tol），代表沒對好咬合
// （多半是把中心拖去合併到不在嚙合圓上的地錨）。回 true 讓繪製給紅色虛線環提示，不自動搬動錨點。
function gearMeshOff(c) {
  if (!c || c.type !== 'gear' || !c.p1) return false;
  const partner = S.comps.find(p => p.type === 'gear' && p !== c && (c.mesh === p.id || p.mesh === c.id));
  if (!partner || !partner.p1) return false;
  if (!pointIsGround(c.p1.id) || !pointIsGround(partner.p1.id)) return false;
  const pc = pointCoords();
  const a = pc[c.p1.id], b = pc[partner.p1.id];
  if (!a || !b) return false;
  const D = (Number(S.topo.params[c.radiusParam]) || 40) + (Number(S.topo.params[partner.radiusParam]) || 40);
  return Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - D) > 1.5;
}
function selectGear(id) {
  cancelMotorMode();
  const c = gearById(id);
  if (!c) return;
  openMobileEditPanel();
  S.selectedGearId = id;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  updateGearEditor();
  draw();
}
function updateGearEditor() {
  const panel = document.getElementById('gearEditor');
  if (!panel) return;
  const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
  if (!c) { panel.style.display = 'none'; return; }
  const mod = Number(c.module) || GEAR_MODULE;
  const setText = (elId, v) => { const el = document.getElementById(elId); if (el) el.textContent = v; };
  setText('gearModuleVal', Math.round(mod));
  setText('gearTeethVal', c.teeth);
  setText('gearRadiusVal', Math.round(Number(S.topo.params[c.radiusParam]) || c.teeth * mod / 2));
  setText('gearPinRadiusVal', Math.round(gearPinRadius(c)));
  setText('gearPinHoleVal', Number(c.pinHoleDiameter || 5).toFixed(1).replace(/\.0$/, ''));
  panel.style.display = 'flex';
}
function gearPitchRadius(c) {
  return Number(S.topo.params[c.radiusParam]) || (Number(c.teeth) || 12) * (Number(c.module) || GEAR_MODULE) / 2 || 40;
}
function gearPinRadius(c) {
  const pitchR = gearPitchRadius(c);
  return c.pinRadiusParam
    ? Number(S.topo.params[c.pinRadiusParam]) || Math.round(pitchR * 0.6)
    : Number(c.pinRadius) || Math.round(pitchR * 0.6);
}
function gearDriveState(c, seen = new Set()) {
  if (!c || seen.has(c.id)) return null;
  if (!c.mesh) return { root: c, factor: 1 };
  seen.add(c.id);
  const driver = gearById(c.mesh);
  if (!driver) return null;
  const parent = gearDriveState(driver, seen);
  if (!parent) return null;
  return {
    root: parent.root,
    factor: parent.factor * -(gearPitchRadius(driver) / (gearPitchRadius(c) || 1))
  };
}
function setGearManualAngle(c, angleRad) {
  if (!c || !c.p1 || !c.p2) return;
  const state = gearDriveState(c);
  const rootMotor = state && state.root && state.root.p1 &&
    (state.root.p1.physicalMotor || state.root.p1.physical_motor);
  const phaseRad = (Number(c.phase) || 0) * Math.PI / 180;
  if (rootMotor && state && Math.abs(state.factor) > 1e-9) {
    S.theta = (angleRad - phaseRad) * 180 / Math.PI / state.factor;
    S.topo.params.theta = S.theta;
    const thetaEl = document.getElementById('thetaVal');
    if (thetaEl) thetaEl.textContent = Math.round(norm360(S.theta));
  } else {
    const ctr = pointCoords()[c.p1.id] || c.p1;
    const r = gearPinRadius(c);
    updatePointCoordsById(c.p2.id, (ctr.x || 0) + r * Math.cos(angleRad), (ctr.y || 0) + r * Math.sin(angleRad));
  }
}
function startGearManualRotate(e, gearId) {
  if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) return;
  const c = gearById(gearId);
  if (!c || !c.p1 || !c.p2) return;
  e.preventDefault();
  e.stopPropagation();
  pause();
  selectGear(gearId);
  S.preDragSnap = snapshotStr();
  const move = (ev) => {
    const w = worldFromEvent(ev);
    const ctr = pointCoords()[c.p1.id] || c.p1;
    if (!w || !ctr) return;
    setGearManualAngle(c, Math.atan2(w.y - ctr.y, w.x - ctr.x));
    renderFrame();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (S.preDragSnap != null && snapshotStr() !== S.preDragSnap) {
      S.undoStack.push(S.preDragSnap);
      if (S.undoStack.length > 60) S.undoStack.shift();
      updateUndoBtn();
    }
    S.preDragSnap = null;
    rebuild();
    recordManualTrace();
    draw();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  move(e);
}
function clampGearPinRadius(c) {
  if (!c) return;
  const pitchR = gearPitchRadius(c);
  const next = Math.max(4, Math.min(Math.max(4, pitchR - 4), gearPinRadius(c)));
  if (c.pinRadiusParam) S.topo.params[c.pinRadiusParam] = Math.round(next);
  else c.pinRadius = Math.round(next);
}
function changeGearTeeth(delta) {
  const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
  if (!c) return;
  pushUndo();
  c.teeth = Math.max(6, Math.round((Number(c.teeth) || 12) + delta));
  S.topo.params[c.radiusParam] = c.teeth * (Number(c.module) || GEAR_MODULE) / 2;
  clampGearPinRadius(c);
  syncGearMesh();
  rebuild(); draw();
  updateGearEditor();
}
function changeGearPinRadius(delta) {
  const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
  if (!c) return;
  pushUndo();
  const pitchR = gearPitchRadius(c);
  const next = Math.max(4, Math.min(Math.max(4, pitchR - 4), gearPinRadius(c) + delta));
  if (c.pinRadiusParam) S.topo.params[c.pinRadiusParam] = Math.round(next);
  else c.pinRadius = Math.round(next);
  const ctr = pointCoords()[c.p1.id] || c.p1;
  const pin = pointCoords()[c.p2.id] || c.p2;
  const ang = Math.atan2((pin.y || 0) - (ctr.y || 0), (pin.x || 0) - (ctr.x || 0));
  updatePointCoordsById(c.p2.id, (ctr.x || 0) + next * Math.cos(ang), (ctr.y || 0) + next * Math.sin(ang));
  rebuild(); draw();
  updateGearEditor();
}
function changeGearPinHoleDiameter(delta) {
  const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
  if (!c) return;
  pushUndo();
  c.pinHoleDiameter = Number(Math.max(1, Math.min(30, (Number(c.pinHoleDiameter) || 5) + delta)).toFixed(1));
  rebuild(); draw();
  updateGearEditor();
}
function changeGearModule(delta) {
  const c = S.selectedGearId ? gearById(S.selectedGearId) : null;
  if (!c) return;
  pushUndo();
  // 模數是「整鏈」共用：同時改本輪與和它嚙合的所有齒輪，否則齒大小不一咬不起來。
  const mod = Math.max(1, (Number(c.module) || GEAR_MODULE) + delta);
  gearMeshChain(c).forEach(g => {
    g.module = mod;
    S.topo.params[g.radiusParam] = g.teeth * mod / 2;
    clampGearPinRadius(g);
  });
  syncGearMesh();
  rebuild(); draw();
  updateGearEditor();
}
function deselectGear() {
  S.selectedGearId = null;
  const panel = document.getElementById('gearEditor');
  if (panel) panel.style.display = 'none';
}

function clearAll() {
  pushUndo();
  pause();
  S.comps = []; S.theta = 0; S.counter = 0;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  Tools.exitDrawLink();
  Tools.exitDrawTriangle();
  Tools.exitDrawPolygon();
  cancelMotorMode();
  closeMobileEditPanel();
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('solveBanner').style.display = 'none';
  S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [] };
  manualTrace = {};
  document.getElementById('thetaVal').textContent = '0';
  rebuild(); draw();
}

function confirmClearAll() {
  if (!window.confirm('確定要清空目前全部零件嗎？')) return;
  clearAll();
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

// ---- 工具模式（畫桿 / 畫滑軌 / 畫三點桿 / 連桿升級滑軌）已抽到 ./tools.js（以 Tools.* 呼叫）----

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
function linkMenuEl() { return document.getElementById('linkMenu'); }
function openLinkMenu() {
  const power = powerMenuEl();
  if (power) power.style.display = 'none';
  closeLinkMenu();
  Tools.startDrawPolygon();
}
function closeLinkMenu() {
  const m = linkMenuEl();
  if (m) m.style.display = 'none';
}
function pickLinkTool(type) {
  closeLinkMenu();
  if (type === 'triangle') Tools.startDrawTriangle('triangle');
  else if (type === 'jaw') Tools.startDrawTriangle('jaw');
  else Tools.startDrawLink();
}
function powerMenuEl() { return document.getElementById('powerMenu'); }
function openPowerMenu() {
  closeLinkMenu();
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
  Tools.exitDrawLink();
  Tools.exitDrawTriangle();
  Tools.exitDrawPolygon();
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
  // 齒輪中心：放馬達＝把這條嚙合鏈的驅動輪固定到機架並給動力（沒馬達的齒輪是靜止接地輪）。
  const gearC = S.comps.find(c => c.type === 'gear' && c.p1 && c.p1.id === nodeId);
  if (gearC) { driveGearAt(gearC.id); return; }
  const bars = barsAtNode(nodeId);
  if (!bars.length) {
    setBanner('馬達要放在連桿的端點上，或齒輪中心上喔');
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
  Panels.updateRoleEditor();
  openMobileEditPanel();
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
  Panels.updateRoleEditor();
  openMobileEditPanel();
}
// 在齒輪中心放馬達：把這條嚙合鏈的「根驅動輪」中心固定到機架並給動力。
// 馬達一律記在驅動輪（mesh=null）中心；從動輪角度由它推算（外嚙合反向、按齒比）。
// 沒馬達的齒輪是靜止接地輪——這個動作讓齒輪「會轉」，與桿件放馬達同理（順手把樞軸固定）。
// 註：齒輪目前一律連續旋轉（不分 TT / 伺服），gear 層 motorType 不入 schema 故不保存。
function driveGearAt(gearId) {
  if (S.pendingMotorType === 'linear') {
    setBanner('線性致動器不能驅動齒輪；請改用 TT馬達 / MG995');
    cancelMotorMode();
    return;
  }
  let g = gearById(gearId);
  if (!g || !g.p1) return;
  const seen = new Set();
  while (g.mesh && !seen.has(g.id)) { seen.add(g.id); const d = gearById(g.mesh); if (!d || !d.p1) break; g = d; }
  pushUndo();
  freezePointAtDisplay(g.p1.id);     // 馬達順手把驅動輪中心釘在目前位置（固定在機架），與桿件一致
  setPointType(g.p1.id, 'fixed');
  g.p1.physicalMotor = '1';
  cancelMotorMode();
  selectGear(g.id);
  rebuild(); draw();
  // 嚙合對要兩個中心都接地，整對才會完整解出、固定；提醒把另一個中心也設地錨。
  const ungrounded = gearMeshChain(g).filter(x => x.p1 && !pointIsGround(x.p1.id));
  if (ungrounded.length) setBanner('驅動輪已上馬達並固定；記得把另一個齒輪中心也設為機架點，整對才會轉');
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
  const rackRange = rackPinionThetaRange();
  if (rackRange) return rackRange;
  return null;
}

// 有限齒條不是無限長齒條：接觸點跑到齒條端部之外時，真實機構就會脫離嚙合。
// 播放時把 theta 限在接觸點仍落在齒條齒面內的範圍，讓齒條齒輪範例推到端點前反向。
function rackPinionThetaRange() {
  const racks = S.comps.filter(c => c.type === 'rack' && c.p1?.id && c.pinion);
  if (!racks.length) return null;
  let lo = -Infinity;
  let hi = Infinity;
  let found = false;
  racks.forEach(rack => {
    const pinion = gearById(rack.pinion);
    if (!pinion || !pinion.p1) return;
    const center = pinion.p1;
    const ref = rack.p1;
    const R = Number(S.topo.params[pinion.radiusParam]) || 40;
    const L = Number(S.topo.params[rack.lenParam]) || 160;
    if (!Number.isFinite(R) || R <= 0 || !Number.isFinite(L) || L <= 0) return;
    const axisRad = (Number(rack.axisDeg) || 0) * Math.PI / 180;
    const ux = Math.cos(axisRad);
    const uy = Math.sin(axisRad);
    const contactAtTheta0 = ((Number(center.x) || 0) - (Number(ref.x) || 0)) * ux
      + ((Number(center.y) || 0) - (Number(ref.y) || 0)) * uy;
    const teeth = Math.max(6, Math.round(Number(pinion.teeth) || 12));
    const module = (2 * R) / teeth;
    const pitch = Math.PI * module;
    const usableHalf = Math.max(0, L / 2 - Math.max(pitch, R * 0.15));
    if (usableHalf <= 0) return;
    const sign = rack.sign === -1 ? -1 : 1;
    const a = (contactAtTheta0 - usableHalf) / (sign * R);
    const b = (contactAtTheta0 + usableHalf) / (sign * R);
    const degA = a * 180 / Math.PI;
    const degB = b * 180 / Math.PI;
    lo = Math.max(lo, Math.min(degA, degB));
    hi = Math.min(hi, Math.max(degA, degB));
    found = true;
  });
  if (!found || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { lo, hi };
}

// ---- 拖曳接點 + 靠近吸附合併（這就是「連接」）----
// ---- 節點 / 連桿 / 機架拖曳處理已抽到 ./input.js（以 Input.* 呼叫；事件監聽見其 init）----

// ---- 選取連桿 + 改長度 ----
function selectLink(id) {
  cancelMotorMode();
  deselectGear();
  const c = S.comps.find(x => x.id === id && x.type === 'bar' && x.fixedLen);
  if (!c) return;
  openMobileEditPanel();
  S.selectedLinkId = id;
  S.selectedTriangleId = null;
  S.selectedNodeId = null;
  S.selectedSliderId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🔵 連桿長度';
  Panels.setLenButtonTitles('短 8mm（少一孔）', '長 8mm（多一孔）');
  document.getElementById('triSideSelect').style.display = 'none';
  updatePlateShapeControls(null);
  document.getElementById('sliderFlipBtn').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = '';
  setSliderDetailRows(false);
  document.getElementById('zliftRow').style.display = 'flex';
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  Panels.renderLenEditor(Math.round(S.topo.params[c.lenParam] || 0));
  Panels.updateZliftButtons();
  draw();
}
function selectTriangle(id) {
  cancelMotorMode();
  deselectGear();
  if (!S.comps.some(x => x.id === id && x.type === 'triangle')) return;
  openMobileEditPanel();
  S.selectedTriangleId = id;
  S.selectedLinkId = null;
  S.selectedNodeId = null;
  S.selectedSliderId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  const comp = S.comps.find(x => x.id === id && x.type === 'triangle');
  document.getElementById('lenTitle').textContent = comp && comp.shape === 'jaw' ? '⌒ 夾爪板' : '🔺 三點桿';
  Panels.setLenButtonTitles('短 8mm（少一孔）', '長 8mm（多一孔）');
  S.triSide = 'g';
  const sel = document.getElementById('triSideSelect');
  sel.value = 'g';
  sel.style.display = '';
  updatePlateShapeControls(comp);
  document.getElementById('sliderFlipBtn').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  document.getElementById('zliftRow').style.display = 'flex';
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  Panels.renderTriValue();
  Panels.updateZliftButtons();
  draw();
}
// 三點板外形：前三點仍給求解器，其它點只作加工外形控制。
function updatePlateShapeControls(comp = null) {
  const modeSel = document.getElementById('plateShapeModeSelect');
  const addBtn = document.getElementById('addOutlinePointBtn');
  if (!modeSel || !addBtn) return;
  if (!comp || comp.type !== 'triangle') {
    modeSel.style.display = 'none';
    addBtn.style.display = 'none';
    return;
  }
  const mode = comp.shapeMode || (comp.shape === 'jaw' ? 'polyline' : 'hull');
  modeSel.value = ['hull', 'polygon', 'polyline'].includes(mode) ? mode : 'hull';
  modeSel.style.display = '';
  addBtn.style.display = '';
  addBtn.disabled = plateVertices(comp).length >= MAX_PLATE_POINTS;
}
// 首次編輯造形時，把板件就地轉成有順序的 vertices（相容舊資料；outlinePoints 併入後移除）。
function ensurePlateVertices(comp) {
  if (!Array.isArray(comp.vertices) || !comp.vertices.length) {
    comp.vertices = defaultPlateVertices(comp);
  }
  if (comp.outlinePoints) delete comp.outlinePoints;
  return comp.vertices;
}
function triangleWorldPoints(comp) {
  if (!comp || !comp.p1 || !comp.p2 || !comp.p3) return null;
  const P = pointCoords();
  const read = (p) => {
    const solved = p.id && P[p.id];
    if (solved && Number.isFinite(solved.x) && Number.isFinite(solved.y)) return solved;
    if (Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) return { x: Number(p.x), y: Number(p.y) };
    return null;
  };
  const pts = [read(comp.p1), read(comp.p2), read(comp.p3)];
  return pts.every(Boolean) ? pts : null;
}
function setTriangleShapeMode(mode) {
  const comp = S.comps.find(x => x.id === S.selectedTriangleId && x.type === 'triangle');
  if (!comp) return;
  pushUndo();
  comp.shapeMode = ['hull', 'polygon', 'polyline'].includes(mode) ? mode : 'hull';
  updatePlateShapeControls(comp);
  rebuild(); draw();
}
function addTriangleOutlinePoint() {
  const comp = S.comps.find(x => x.id === S.selectedTriangleId && x.type === 'triangle');
  if (!comp) return;
  if (plateVertices(comp).length >= MAX_PLATE_POINTS) {
    setBanner(`多點桿最多 ${MAX_PLATE_POINTS} 點；其它點只作外形控制。`);
    return;
  }
  const pts = triangleWorldPoints(comp);
  if (!pts) return;
  const [a, , c] = pts;
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const shapeCount = plateVertices(comp).filter(v => !v.solve).length;
  const world = {
    x: c.x + ux * 32 + nx * shapeCount * 12,
    y: c.y + uy * 32 + ny * shapeCount * 12
  };
  const local = worldToLocal(pts, world);
  if (!local) return;
  pushUndo();
  ensurePlateVertices(comp);
  comp.vertices = [...comp.vertices, {
    solve: false,
    u: Number(local.u.toFixed(1)),
    v: Number(local.v.toFixed(1))
  }];
  updatePlateShapeControls(comp);
  rebuild(); draw();
}
// 選取滑軌：屬性列顯示軌道長度（可調）＋ 翻面（換滑塊解的那一側）＋ 刪除。
function selectSlider(id) {
  cancelMotorMode();
  deselectGear();
  const c = S.comps.find(x => x.id === id && x.type === 'slider');
  if (!c) return;
  openMobileEditPanel();
  S.selectedSliderId = id;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedNodeId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🟩 滑軌長度';
  Panels.setLenButtonTitles('滑軌短 1mm', '滑軌長 1mm');
  document.getElementById('triSideSelect').style.display = 'none';
  updatePlateShapeControls(null);
  document.getElementById('sliderFlipBtn').style.display = '';
  document.getElementById('sliderBaseBtn').style.display = '';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(true);
  document.getElementById('zliftRow').style.display = 'none';   // 滑軌不做疊放
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  Panels.renderLenEditor(railLength(c));
  renderSliderBaseButton(c);
  renderSliderDetails(c);
  draw();
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
  // 用 updatePointCoordsById 更新所有共用此接點 id 的副本（見 setLen 說明；軌道端可能被 merge 共用）
  if (c.baseEnd === 'p2') {
    updatePointCoordsById(c.p1.id, (c.p2.x || 0) - dx / d * L, (c.p2.y || 0) - dy / d * L);
  } else {
    updatePointCoordsById(c.p2.id, (c.p1.x || 0) + dx / d * L, (c.p1.y || 0) + dy / d * L);
  }
  S.topo.params[c.lenParam] = L;
  normalizeSliderRange(c);
  Panels.renderLenEditor(L);
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
function setTriSide(side) {
  S.triSide = (side === 'r1' || side === 'r2') ? side : 'g';
  Panels.renderTriValue();
}
function changeTriSide(delta) {
  const c = S.comps.find(x => x.id === S.selectedTriangleId);
  if (!c) return;
  pushUndo();
  const key = triParamFor(c);
  const L = snapLego((S.topo.params[key] || 0) + delta);
  S.topo.params[key] = L;
  reshapeTriangle(c);   // 自由三點桿才看得到；已連接的由 solver 接手
  Panels.renderLenEditor(L);
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
  updatePointCoordsById(c.p2.id, P2.x, P2.y);   // 更新所有共用此接點 id 的副本（見 setLen 說明）
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
  updatePointCoordsById(c.p3.id, pick.x, pick.y);   // 更新所有共用此接點 id 的副本（見 setLen 說明）
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
  Panels.updateZliftButtons();
  draw();
}


function deselectLink() {
  if (!S.selectedLinkId && !S.selectedTriangleId && !S.selectedSliderId && !S.selectedGearId) return;
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  deselectGear();
  closeMobileEditPanel();
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  draw();
}
// 刪除整條嚙合鏈（成對/成列一起刪，避免留下 mesh 指向已刪齒輪的破狀態）。
function deleteGearChain(id) {
  const start = gearById(id);
  if (!start) return;
  pushUndo();
  pause();
  const chain = gearMeshChain(start);
  chain.forEach(g => ownedParamKeys(g).forEach(k => delete S.topo.params[k]));
  const ids = new Set(chain.map(g => g.id));
  S.comps = S.comps.filter(c => !ids.has(c.id));
  deselectGear();
  S.selectedNodeId = null;
  closeMobileEditPanel();
  rebuild(); draw();
}
function deleteSelectedPart() {
  if (S.selectedGearId) { deleteGearChain(S.selectedGearId); return; }
  const id = S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId;
  if (!id) return;
  const comp = S.comps.find(c => c.id === id);
  if (!comp) return;
  pushUndo();
  pause();
  // 刪除前先清掉這個元件佔用的 topo.params（型別表宣告它擁有哪些參數）
  ownedParamKeys(comp).forEach(k => delete S.topo.params[k]);
  S.comps = S.comps.filter(c => c.id !== id);
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  closeMobileEditPanel();
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
  // 把 b 端重新擺到半徑 L。用 updatePointCoordsById 更新「所有」共用此接點 id 的元件副本，
  // 不要只改 c.p2 一份：接點被別的桿共用時，只動本桿副本會讓其他副本留舊值；當這幀重解失敗
  // 退回元件座標時，可能被那份舊副本蓋回去，看起來長度沒同步變（要等播放重解成功才更新）。
  // 自由連桿的 b 端沒被共用，所以原本就看得到——共用（已連接）的才會卡住。
  const dx = (c.p2.x || 0) - (c.p1.x || 0), dy = (c.p2.y || 0) - (c.p1.y || 0);
  const d = Math.hypot(dx, dy) || 1;
  updatePointCoordsById(c.p2.id, (c.p1.x || 0) + dx / d * L, (c.p1.y || 0) + dy / d * L);
  Panels.renderLenEditor(L);
  rebuild(); draw();
}
function changeLen(delta) {
  if (S.selectedSliderId) { changeRailLen(Math.sign(delta) || 0); return; }
  if (S.selectedTriangleId) { changeTriSide(delta); return; }
  const c = S.comps.find(x => x.id === S.selectedLinkId);
  if (c) setLen((S.topo.params[c.lenParam] || 0) + delta);
}

// 選到被線性致動器驅動的滑塊點時，跳出行程面板；其餘情況收起。
function sliderInputForPoint(id) {
  return (id && hasPoint(id))
    ? S.comps.find(c => c.type === 'slider' && c.isInput && c.p3 && c.p3.id === id) || null
    : null;
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
  Panels.updateStrokeEditor();
  rebuild(); draw();
}
function changeServoAngle(which, delta) {
  const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? motorBarForCenter(S.selectedNodeId) : null;
  if (!bar || bar.motorType !== 'mg995') return;
  pushUndo();
  const field = (which === 'end') ? 'servoEnd' : 'servoStart';
  const cur = Number(bar[field]);
  const base = Number.isFinite(cur) ? cur : (field === 'servoEnd' ? 90 : 0);
  bar[field] = Math.max(0, Math.min(360, Math.round(base + delta)));
  Panels.updateServoEditor();
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
  const step = (S.lockFrameHoles && pointIsGround(S.selectedNodeId)) ? Math.sign(delta || 1) * LEGO_STEP : delta;
  const next = { x: axis === 'x' ? p.x + step : p.x, y: axis === 'y' ? p.y + step : p.y };
  const q = pointIsGround(S.selectedNodeId) ? snapFramePoint(next) : next;
  updatePointCoordsById(S.selectedNodeId, q.x, q.y);
  rebuild(); draw();
  Panels.updateRoleEditor();
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
  Panels.updateRoleEditor();
}
// 分離：把鎖在同一點（共用同一 id）的多個端點拆開，各給新 id 並向外稍微散開，方便個別拖曳。
// 保留非桿件（地錨／馬達座）或第一個端點維持原 id，其餘分出去並轉為自由點。
function splitNode() {
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
  const id = S.selectedNodeId;
  const refs = Model.pointRefs(S.comps, id);
  if (refs.length < 2) return;                 // 沒有合併，無從分離
  pushUndo();
  pause();
  const p = pointCoords()[id] || { x: 0, y: 0 };
  const OFFSET = 16;                            // 分出來的端點向外位移量（mm），給視覺回饋也方便點選
  refs.sort((a, b) => (a.comp.type === 'bar' ? 1 : 0) - (b.comp.type === 'bar' ? 1 : 0));
  const detach = refs.slice(1);                 // 第一個（優先地錨/非桿件）留原 id，其餘分出去
  detach.forEach((ref, i) => {
    const ang = (i / detach.length) * Math.PI * 2 + 0.6;
    ref.point.id = 'P' + (++S.counter) + 's';
    ref.point.type = 'floating';
    ref.point.x = (p.x || 0) + Math.cos(ang) * OFFSET;
    ref.point.y = (p.y || 0) + Math.sin(ang) * OFFSET;
  });
  S.selectedNodeId = null;                       // 原合併點已拆，取消選取
  rebuild(); draw();
  Panels.updateRoleEditor();
}
function toggleTracePoint() {
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
  pushUndo();
  pause();
  const ids = traceIds();
  const currentIndex = ids.indexOf(S.selectedNodeId);
  S.topo.tracePoint = '';
  // 第一點量單點範圍；第二點自然切換成夾持距離。第三點則開始新的量測，畫面不會堆滿軌跡。
  if (currentIndex >= 0) ids.splice(currentIndex, 1);
  else if (ids.length >= 2) ids.splice(0, ids.length, S.selectedNodeId);
  else ids.push(S.selectedNodeId);
  S.topo.tracePoints = ids;
  manualTrace = {};
  trajectoryCache = null;
  geomVersion++;                 // 軌跡點換了：讓軌跡快取失效
  Panels.updateRoleEditor();
  draw();
}

// ---- 指標 / 手勢事件監聽（拖曳 + pinch 縮放 + 畫圖模式起點）已抽到 ./input.js（init 內掛載）----

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
function exportSettings() {
  return Exporters.normalizeExportSettings({
    barWidthMm: S.exportBarWidthMm,
    holeDiameterMm: S.exportHoleDiameterMm,
    ttShaftFlatDiameterMm: S.exportTtShaftFlatDiameterMm,
    ttShaftFlatThicknessMm: S.exportTtShaftFlatThicknessMm
  });
}
function normalizeTtMountSettings(settings = {}) {
  const from = { ...TT_MOUNT_DEFAULTS, ...(settings || {}) };
  const clamp = (key, min, max) => {
    const v = Number(from[key]);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : TT_MOUNT_DEFAULTS[key];
  };
  return {
    shaftDiameterMm: Number(clamp('shaftDiameterMm', 0.5, 30).toFixed(2)),
    screwDiameterMm: Number(clamp('screwDiameterMm', 0.5, 20).toFixed(2)),
    screwOffsetXMm: Number(clamp('screwOffsetXMm', -120, 120).toFixed(2)),
    screwSpacingMm: Number(clamp('screwSpacingMm', 0, 80).toFixed(2)),
    locatorDiameterMm: Number(clamp('locatorDiameterMm', 0.5, 20).toFixed(2)),
    locatorOffsetXMm: Number(clamp('locatorOffsetXMm', -120, 120).toFixed(2)),
    locatorOffsetYMm: Number(clamp('locatorOffsetYMm', -80, 80).toFixed(2))
  };
}
function ttMountSettings() {
  return normalizeTtMountSettings({
    shaftDiameterMm: S.ttShaftDiameterMm,
    screwDiameterMm: S.ttScrewDiameterMm,
    screwOffsetXMm: S.ttScrewOffsetXMm,
    screwSpacingMm: S.ttScrewSpacingMm,
    locatorDiameterMm: S.ttLocatorDiameterMm,
    locatorOffsetXMm: S.ttLocatorOffsetXMm,
    locatorOffsetYMm: S.ttLocatorOffsetYMm
  });
}
function syncExportSettingInputs() {
  const settings = exportSettings();
  Object.entries(settings).forEach(([key, value]) => {
    document.querySelectorAll(`[data-export-setting="${key}"]`).forEach(el => { el.value = value; });
  });
}
function syncTtMountSettingInputs() {
  const settings = ttMountSettings();
  Object.entries(settings).forEach(([key, value]) => {
    document.querySelectorAll(`[data-tt-mount-setting="${key}"]`).forEach(el => { el.value = value; });
  });
}
function loadExportSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(EXPORT_SETTINGS_KEY) || 'null'); } catch (_) {}
  const settings = Exporters.normalizeExportSettings(saved || {});
  S.exportBarWidthMm = settings.barWidthMm;
  S.exportHoleDiameterMm = settings.holeDiameterMm;
  S.exportTtShaftFlatDiameterMm = settings.ttShaftFlatDiameterMm;
  S.exportTtShaftFlatThicknessMm = settings.ttShaftFlatThicknessMm;
  syncExportSettingInputs();
}
function loadTtMountSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TT_MOUNT_SETTINGS_KEY) || 'null'); } catch (_) {}
  const settings = normalizeTtMountSettings(saved || {});
  S.ttShaftDiameterMm = settings.shaftDiameterMm;
  S.ttScrewDiameterMm = settings.screwDiameterMm;
  S.ttScrewOffsetXMm = settings.screwOffsetXMm;
  S.ttScrewSpacingMm = settings.screwSpacingMm;
  S.ttLocatorDiameterMm = settings.locatorDiameterMm;
  S.ttLocatorOffsetXMm = settings.locatorOffsetXMm;
  S.ttLocatorOffsetYMm = settings.locatorOffsetYMm;
  syncTtMountSettingInputs();
}
function setExportSetting(key, value) {
  if (key === 'barWidthMm') S.exportBarWidthMm = Number(value);
  if (key === 'holeDiameterMm') S.exportHoleDiameterMm = Number(value);
  if (key === 'ttShaftFlatDiameterMm') S.exportTtShaftFlatDiameterMm = Number(value);
  if (key === 'ttShaftFlatThicknessMm') S.exportTtShaftFlatThicknessMm = Number(value);
  const settings = exportSettings();
  S.exportBarWidthMm = settings.barWidthMm;
  S.exportHoleDiameterMm = settings.holeDiameterMm;
  S.exportTtShaftFlatDiameterMm = settings.ttShaftFlatDiameterMm;
  S.exportTtShaftFlatThicknessMm = settings.ttShaftFlatThicknessMm;
  try { localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  syncExportSettingInputs();
}
function setTtMountSetting(key, value) {
  const map = {
    shaftDiameterMm: 'ttShaftDiameterMm',
    screwDiameterMm: 'ttScrewDiameterMm',
    screwOffsetXMm: 'ttScrewOffsetXMm',
    screwSpacingMm: 'ttScrewSpacingMm',
    locatorDiameterMm: 'ttLocatorDiameterMm',
    locatorOffsetXMm: 'ttLocatorOffsetXMm',
    locatorOffsetYMm: 'ttLocatorOffsetYMm'
  };
  if (map[key]) S[map[key]] = Number(value);
  const settings = ttMountSettings();
  S.ttShaftDiameterMm = settings.shaftDiameterMm;
  S.ttScrewDiameterMm = settings.screwDiameterMm;
  S.ttScrewOffsetXMm = settings.screwOffsetXMm;
  S.ttScrewSpacingMm = settings.screwSpacingMm;
  S.ttLocatorDiameterMm = settings.locatorDiameterMm;
  S.ttLocatorOffsetXMm = settings.locatorOffsetXMm;
  S.ttLocatorOffsetYMm = settings.locatorOffsetYMm;
  try { localStorage.setItem(TT_MOUNT_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  syncTtMountSettingInputs();
  draw();
}
function ttMountPatternRotDegForCenter(id, pts, mount = null) {
  // drawTTMotor's local long axis is +Y, while TT mount/CAD coordinates use +X as the motor long axis.
  const visualRotDeg = mount ? mount.rotDeg : computeMotorRotDeg(id, pts || {}, new Set());
  return visualRotDeg - 90;
}
function ttFrameExportMounts() {
  const inputs = lastModelInputs || {};
  const pts = inputs.pts || {};
  const motorIds = inputs.motorCenterIds || new Set();
  const motorTypes = inputs.motorTypes || new Map();
  const motorMounts = inputs.motorMounts || new Map();
  const settings = ttMountSettings();
  const mounts = [];
  motorIds.forEach(id => {
    if ((motorTypes.get(id) || motorTypeForCenter(id)) !== 'tt') return;
    const center = pts[id];
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
    const mount = motorMounts.get(id);
    mounts.push({
      center,
      rotDeg: ttMountPatternRotDegForCenter(id, pts, mount),
      settings
    });
  });
  return mounts;
}
function saveFile() {
  Store.downloadJson(Store.toSnapshot(S.comps, S.topo, S.counter), 'blocks.json');
}
function exportLinksSvg() {
  const settings = exportSettings(), nodes = frameConnectorNodes(), mounts = ttFrameExportMounts();
  const count = Exporters.exportLinksAsSvg(S.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings);
  const frameCount = Exporters.exportFrameAsSvg(nodes, settings, mounts);
  const warnings = Exporters.frameExportWarnings(nodes, settings, mounts);
  transient(count || frameCount ? `已匯出 ${count} 個零件 + ${frameCount ? '機架' : '無機架'} SVG${warnings.length ? `；⚠ ${warnings[0]}` : ''}` : '沒有可匯出的零件或機架');
}
function exportLinksDxf() {
  const settings = exportSettings(), nodes = frameConnectorNodes(), mounts = ttFrameExportMounts();
  const count = Exporters.exportLinksAsDxf(S.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings);
  const frameCount = Exporters.exportFrameAsDxf(nodes, settings, mounts);
  const warnings = Exporters.frameExportWarnings(nodes, settings, mounts);
  transient(count || frameCount ? `已匯出 ${count} 個零件 + ${frameCount ? '機架' : '無機架'} DXF${warnings.length ? `；⚠ ${warnings[0]}` : ''}` : '沒有可匯出的零件或機架');
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
  Render.init({ svg, onNodeDown: Input.onNodeDown });   // 注入繪製基元的外部依賴（預設 parent + 固定孔互動）
  Panels.init({ pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount });
  Tools.init({ svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle, selectSlider,
               setBanner, clearBanner, worldFromEvent, pointCoords, nearestDisplayToPoint, snapWorld,
               mobilePrompt, promptText });
  Input.init({ svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink,
               worldFromEvent, pointCoords, mobilePrompt,
               snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
               movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
               isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
               handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround, recordManualTrace, solvePinnedConstraints,
               snapFramePoint, snapFrameNodesToGrid, openMobileEditPanel, closeMobileEditPanel });
  loadExportSettings();
  loadTtMountSettings();
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
  setMobilePanel('build');
  updateUndoBtn();
  syncFrameOptionButtons();
}

window.blocks = { placeMotor, openPowerMenu, pickMotorType, openLinkMenu, pickLinkTool, setMobilePanel, openMobileOpenMenu, openMobileFile, changeServoAngle, changeStroke, flipSlider, toggleSliderBase, convertLinkToSlider: Tools.convertLinkToSlider, changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset, changeSliderTravelStart, changeSliderTravelEnd, changeNodePos, addAnchor, addGearPair, changeGearModule, changeGearTeeth, changeGearPinRadius, changeGearPinHoleDiameter, addLink, startDrawLink: Tools.startDrawLink, startDrawRail: Tools.startDrawRail, startDrawPolygon: Tools.startDrawPolygon, startDrawTriangle: () => Tools.startDrawTriangle('triangle'), startDrawJaw: () => Tools.startDrawTriangle('jaw'), clearAll, confirmClearAll, togglePlay, setLen, changeLen, setTriSide, setTriangleShapeMode, addTriangleOutlinePoint, selectLink, setNodeRole, removeNodeMotor, splitNode, toggleTracePoint, toggleFrameHoles, toggleFrameLock, deleteSelectedPart, bringPart, toggle3D, fitView, undo, saveFile, setExportSetting, setTtMountSetting, exportLinksSvg, exportLinksDxf, openFile, share, loadExample };
init();
