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
import { localToWorld, plateVertices, plateShapeMode, createPlateGeometry } from './plate-geometry.js';
import { S, activateMotor, motorAnglesNow, frozenMotorAngles, usedMotorIds } from './state.js';  // 跨模組共享的可變狀態與多馬達 helper
import { createExampleController } from './example-controller.js';
import { createGearEditor, rackPhaseShift } from './gear-editor.js';
import { createSliderEditor } from './slider-editor.js';
import { createMotorTools } from './motor-tools.js';
import { createPlateEditor } from './plate-editor.js';
import { createNodeEditor } from './node-editor.js';
import { workRangeFromTrace, clampRangeFromTraces, currentPointDistance } from './measurement.js';
import { circleRectCompression } from './intake-contact.js';
import { drawGear as renderGear, drawPulley, drawBelt, drawRack, drawGearManualHandles as renderGearManualHandles } from './transmission-render.js';
import { drawCam as renderCam, drawWorkpiece as renderWorkpiece } from './special-part-render.js';
import { drawPlate as renderPlate } from './plate-render.js';
import { buildMotorMounts as planMotorMounts, computeMotorRotDeg as planMotorRotDeg, motorAssemblyLayerForBody } from './motor-mounts.js';
import { drawFrameGeometry as renderFrameGeometry, drawMotorMountHoles as renderMotorMountHoles } from './motor-frame-render.js';
import { collectSceneIds, prepareRenderScene } from './render-scene.js';
import { buildPreviewModelInputs } from './preview-model-inputs.js';
import { renderLinks, renderNodes } from './mechanism-layer-render.js';
import * as Settings from './settings.js';   // 匯出 / TT / MG995 安裝設定（localStorage 持久化 + 表單同步）

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stageSvg');
const { W, H, HULL_R_WORLD, TX, TY } = View;
// 樂高 Technic 孔距 = 8mm；連桿/三點桿孔位長度對齊 8mm，滑軌外形尺寸不套用。
const LEGO_STEP = Model.LEGO_FRAME_STEP;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
// GEAR_MODULE（齒輪模數）已隨齒輪 / 齒條域移到 ./gear-editor.js
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);
const roundMm = v => Math.round(Number(v) || 0);
// 匯出 / TT / MG995 安裝設定的常數與函式已抽到 ./settings.js（以 Settings.* 呼叫）

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
// unlockedGroundPointId（固定點位置鎖）已隨節點角色域移到 ./node-editor.js

// ---- 3D 唯讀預覽狀態 ----
let viewer3D = null;           // createViewer() 的實體（首次開啟才懶載入）
let view3DActive = false;      // 3D 覆蓋層是否開著
let lastModelInputs = null;    // 最近一次 draw() 算好的 { links, pts, groundIds }，給 3D 鏡像用

// 多馬達：存檔一併保留「哪顆在控制、其他凍在幾度」，載回來才不會全部歸零疊在一起。
const motorSnapshotState = () => ({ activeMotor: S.activeMotor, motorAngles: frozenMotorAngles() });
function snapshotStr() {
  return JSON.stringify(Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()));
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
  S.autosaveTimer = setTimeout(() => Store.saveLocal(Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState())), 500);
}

// 套用一份 snapshot 到目前狀態。recordUndo 預設 true（外部開檔/分享要能 undo）。
function applySnapshot(norm, { recordUndo = true, fit = true } = {}) {
  if (recordUndo) pushUndo();
  pause();
  cancelMotorMode();
  S.comps = norm.comps;
  S.topo = { params: norm.params || {}, tracePoint: norm.tracePoint || '', tracePoints: norm.tracePoints || [], referencePoint: norm.referencePoint || '' };
  manualTrace = {};
  S.counter = Math.max(norm.counter || 0, Store.highestIdNum(S.comps));
  S.theta = 0;
  // 多馬達：還原「哪顆在控制、其他凍在幾度」；舊檔沒有這兩欄就回到單馬達預設。
  S.activeMotor = String(norm.activeMotor || '1');
  S.motorAngles = { ...(norm.motorAngles || {}) };
  delete S.motorAngles[String(S.activeMotor)];
  playDir = Number(S.topo.params.motorDirection) === -1 ? -1 : 1;
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
  updateMotorDirectionButton();
  rebuild(); draw();
  if (fit) fitView();
}

const exampleController = createExampleController({
  applySnapshot, notify: transient, closeMobileMenu: closeMobileOpenMenu,
  isMobile: () => mobilePrompt(), showBuildPanel: () => setMobilePanel('build')
});
const populateExamples = () => exampleController.populate();
const loadExample = id => exampleController.load(id);

// ---- 綁定層：把純模組綁到本檔狀態，維持原呼叫端不變 ----
const barHullPath = View.barHullPath;
const roundedTriangleHullPath = View.roundedTriangleHullPath;
const jawPlatePath = View.jawPlatePath;
const platePath = View.platePath;
const worldFromEvent = (e) => View.worldFromEvent(svg, e);
const extrapolateSeed = Motion.extrapolateSeed;
const norm360 = Motion.norm360;
const PLAY_STEP = Motion.PLAY_STEP;
const planMotion = () => Motion.planMotion(S.compiled, S.topo, S.theta, lastSolved,
  { active: String(S.activeMotor), frozen: frozenMotorAngles() });
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
function rotateInputCrankToPoint(bar, target) {
  if (!bar || !target) return false;
  const centerPoint = bar.p1.physicalMotor ? bar.p1 : bar.p2;
  // 騎乘馬達的軸心跟著機構動：用「畫面上解出的位置」當圓心，元件座標會脫節。
  const center = displayCoords()[centerPoint.id] || pointCoords()[centerPoint.id] || centerPoint;
  if (!center || Math.hypot(target.x-center.x,target.y-center.y) < 1e-6) return false;
  // 拖哪根輸入桿就把控制權切給那顆馬達（其他馬達凍結在原角度），符合「摸哪根動哪根」直覺。
  const motorId = String(bar.physicalMotor || bar.physical_motor || '1');
  if (String(S.activeMotor) !== motorId) {
    activateMotor(motorId, Number(S.motorAngles[motorId]) || 0);
    updateMotorSwitcher();
  }
  // solver 的曲柄角＝機架桿方位角+θ+phaseOffset（p1→p2 方位角），反推 θ 要扣掉相位與
  // 機架桿方位角（世界機架馬達的機架方位角為 0），拖曳才會貼著游標。
  let carrierAng = 0;
  if (bar.motorCarrier) {
    const carrier = S.comps.find(k => k.type === 'bar' && k.id === bar.motorCarrier);
    if (carrier && carrier.p1 && carrier.p2) {
      const m = displayCoords();
      const q1 = m[carrier.p1.id], q2 = m[carrier.p2.id];
      if (q1 && q2) carrierAng = Math.atan2(q2.y - q1.y, q2.x - q1.x) * 180 / Math.PI;
    }
  }
  S.theta = Math.atan2(target.y-center.y,target.x-center.x) * 180 / Math.PI - carrierAng - (Number(bar.phaseOffset) || 0);
  S.topo.params.theta = S.theta;
  const thetaEl=document.getElementById('thetaVal'); if(thetaEl)thetaEl.textContent=Math.round(norm360(S.theta));
  return true;
}
const updatePointCoordsById = (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y);
const freezePointAtDisplay = (id) => Model.freezePointAtDisplay(S.comps, S.compiled, S.theta, id, motorAnglesNow());
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
const pointIsRackHole = id => S.comps.some(c => c.type === 'rack' && Array.isArray(c.holes) && c.holes.some(h => h.id === id));
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

// ---- 齒輪 / 齒條域：邏輯抽到 ./gear-editor.js，這裡注入 app 能力並把常用函式綁回原名 ----
const gearEditor = createGearEditor({
  pushUndo, pause, rebuild, draw, renderFrame, transient, scheduleAutosave,
  cancelMotorMode: (...a) => cancelMotorMode(...a),   // 延遲取用：motorTools 在下方才建立
  exitDrawTools: () => { Tools.exitDrawLink(); Tools.exitDrawTriangle(); Tools.exitDrawPolygon(); },
  openMobileEditPanel, closeMobileEditPanel,
  hideEditorPanels: () => {
    document.getElementById('lenEditor').style.display = 'none';
    document.getElementById('roleEditor').style.display = 'none';
    document.getElementById('servoEditor').style.display = 'none';
    document.getElementById('strokeEditor').style.display = 'none';
  },
  snapshotStr, updateUndoBtn, recordManualTrace,
  worldFromEvent, mobilePrompt, pointCoords, updatePointCoordsById, pointIsGround
});
const { gearById, gearMeshChain, gearMeshOff, selectGear, deselectGear, startGearManualRotate,
        rackBodyHeight, rackPinionThetaRange, deleteGearChain,
        addGearPair, addRackPinion, toggleRackOrientation,
        changeGearModule, changeGearTeeth, changeGearPinRadius, changeGearPinHoleDiameter,
        changeRackLength, changeRackBodyHeight, changeRackSlotLength, changeRackSlotWidth } = gearEditor;

// ---- 滑軌域：邏輯抽到 ./slider-editor.js，同樣注入 app 能力並綁回原名 ----
const sliderEditor = createSliderEditor({
  pushUndo, rebuild, draw,
  cancelMotorMode: (...a) => cancelMotorMode(...a),   // 延遲取用：motorTools 在下方才建立
  deselectGear, openMobileEditPanel,
  updatePointCoordsById, roundMm,
  renderLenEditor: Panels.renderLenEditor, setLenButtonTitles: Panels.setLenButtonTitles,
  updatePlateShapeControls: (comp) => updatePlateShapeControls(comp)
});
const { syncSliderGeometries, selectSlider, setSliderDetailRows,
        railLength, sliderBodyLength, sliderTravelStart, sliderTravelEnd,
        sliderProjectedDistance, normalizeSliderRange, changeRailLen,
        changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset,
        changeSliderTravelStart, changeSliderTravelEnd, toggleSliderBase, flipSlider } = sliderEditor;

// ---- 動力來源域：邏輯抽到 ./motor-tools.js（放置 / 指派輸入 / 型號查詢 / 有限行程）----
const motorTools = createMotorTools({
  svg, pushUndo, pause, rebuild, draw, setBanner, clearBanner, promptText,
  exitDrawTools: () => { Tools.exitDrawLink(); Tools.exitDrawTriangle(); Tools.exitDrawPolygon(); },
  deselectLink, openMobileEditPanel, updateRoleEditor: Panels.updateRoleEditor,
  barsAtNode, pointIsGround, pointUseCount, freezePointAtDisplay, setPointType,
  gearById, gearMeshChain, selectGear, rackPinionThetaRange,
  sliderProjectedDistance, railLength, sliderTravelStart, sliderTravelEnd
});
const { cancelMotorMode, placeMotor, handleMotorOnNode, tryPickBar,
        driveBarAt, driveSliderAt, driveGearAt,
        motorBarForCenter, motorTypeForCenter, inputRockRange, configureMotorMount, setMotorWorldMount, setMotorOrientation, toggleMotorReverse } = motorTools;

// ---- 三點桿 / 板件域：邏輯抽到 ./plate-editor.js（Panels / plate-geometry 由該模組自行 import）----
const plateEditor = createPlateEditor({
  svg, pushUndo, pause, rebuild, draw, cancelMotorMode, deselectGear, openMobileEditPanel,
  setSliderDetailRows, setBanner, snapLego, worldFromEvent, pointCoords, updatePointCoordsById
});
const { selectTriangle, startShapeDrag, deleteShapeVertex, updatePlateShapeControls,
        setTriangleShapeMode, addTriangleOutlinePoint,
        triParamFor, setTriSide, changeTriSide } = plateEditor;

// ---- 節點角色域：邏輯抽到 ./node-editor.js（Panels 由該模組自行 import）----
const nodeEditor = createNodeEditor({
  pushUndo, pause, rebuild, draw, setBanner, transient, scheduleAutosave,
  hasPoint, pointCoords, pointIsGround, updatePointCoordsById, snapFramePoint,
  sliderMountInfo, removeMotorAtPoint, removeAnchorsAtPoint, setPointType, freezePointAtDisplay,
  pointRefs: (id) => Model.pointRefs(S.comps, id),
  motorBarForCenter, sliderTravelStart, sliderTravelEnd, railLength, normalizeSliderRange,
  traceIds: () => traceIds(),
  invalidateTrajectory: () => { manualTrace = {}; trajectoryCache = null; geomVersion++; }
});
const { changeStroke, changeServoAngle,
        setNodeRole, changeNodePos, removeNodeMotor, splitNode,
        toggleTracePoint, toggleMeasurementReference,
        toggleGroundPositionLock, isGroundPositionUnlocked, relockGroundPosition } = nodeEditor;

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

// syncSliderGeometries（滑軌幾何同步）已隨滑軌域移到 ./slider-editor.js

function rebuild() {
  syncSliderGeometries();
  S.compiled = compileTopology(S.comps, S.topo, new Set());
  S.topo.params = S.compiled.params; // 沿用補齊後的參數
  lastSolved = {};               // 拓撲變了：丟掉舊解，避免拿到不相干的種子
  prevSolved = {};
  geomVersion++;                 // 結構/參數變了：讓軌跡快取失效（getTrajectoryData 重算）
  reconcileMotorState();         // 馬達被刪 / 改指派後：清掉殘留凍結角、控制權交回存在的馬達
  document.getElementById('hint').style.display = S.comps.length ? 'none' : 'block';
  Panels.updateRoleEditor();
  scheduleAutosave();            // 任何結構變更都防丟（debounce，播放不觸發）
}

// 多馬達狀態與零件實況對齊：凍結表只留還存在的馬達；active 不存在時交棒給編號最小的那顆；
// 非控制中的馬達若沒有凍結角就補 0——否則 solver 會 fallback 到全域 θ，凍結的馬達跟著轉。
function reconcileMotorState() {
  const used = usedMotorIds();
  Object.keys(S.motorAngles).forEach(k => { if (!used.has(k)) delete S.motorAngles[k]; });
  if (used.size && !used.has(String(S.activeMotor))) {
    const next = [...used].sort((a, b) => Number(a) - Number(b))[0];
    activateMotor(next, Number(S.motorAngles[next]) || 0);
  }
  used.forEach(id => {
    if (id !== String(S.activeMotor) && S.motorAngles[id] === undefined) S.motorAngles[id] = 0;
  });
  updateMotorSwitcher();
}

// 控制列的馬達切換 chips：≥2 顆馬達才顯示；點一下把控制權交給那顆（其他凍結在原角度）。
function updateMotorSwitcher() {
  const box = document.getElementById('motorSwitch');
  if (!box) return;
  const ids = [...usedMotorIds()].sort((a, b) => Number(a) - Number(b));
  if (ids.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = '';
  ids.forEach(id => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'motor-chip' + (String(S.activeMotor) === id ? ' active' : '');
    b.textContent = 'M' + id;
    b.title = String(S.activeMotor) === id ? `馬達 ${id}（控制中）` : `切換控制馬達 ${id}`;
    b.onclick = () => switchActiveMotor(id);
    box.appendChild(b);
  });
}
function switchActiveMotor(id) {
  if (String(S.activeMotor) === String(id)) return;
  pause();                                   // 換手先停播，避免播放迴圈直接推進新馬達
  activateMotor(id, Number(S.motorAngles[id]) || 0);
  const thetaEl = document.getElementById('thetaVal');
  if (thetaEl) thetaEl.textContent = Math.round(norm360(S.theta));
  updateMotorSwitcher();
  draw();                                    // 各馬達角度值不變，姿勢不動，只換控制權與軌跡掃描對象
}

function getTrajectoryData() {
  // 拖曳中不掃軌跡：每次移動 rebuild() 都讓快取失效，整段 sweepTopology（每個追蹤點 72 步）
  // 會把拖曳拖到掉幀。拖曳中軌跡本來就持續失真，乾脆不畫；放開時 drag end 走完整
  // rebuild+draw，軌跡即恢復。（shapeDrag 只改造形孔、不動 geomVersion，走快取即可不必跳過。）
  if (S.dragId || S.dragFrame || S.dragLinkId) return null;
  const ids = traceIds();
  if (!ids.length && S.compiled && S.compiled.tracePoint) ids.push(S.compiled.tracePoint);
  if (!S.compiled || !ids.length || !S.comps.length) return null;
  // 快取鍵＝結構版本號 geomVersion，取代每幀 JSON.stringify 整份快照（零件多時字串化本身會變慢）。
  // 軌跡只取決於 S.compiled 與 traceIds，兩者都只在 rebuild / 切換軌跡點變動、那兩處都會 +1，
  // 故版本號是完整且正確的失效訊號。多馬達後軌跡還取決於「掃哪顆馬達＋其他馬達凍在哪」，一併入鍵。
  const motorKey = String(S.activeMotor) + '|' + JSON.stringify(S.motorAngles);
  if (trajectoryCache && trajectoryCache.version === geomVersion && trajectoryCache.motorKey === motorKey) return trajectoryCache.data;
  // 伺服與線性致動器只在自己的有限行程內運動；量測不應誤把不存在的整圈算進去。
  const range = inputRockRange();
  const thetaStart = range ? range.lo : 0;
  const thetaEnd = range ? range.hi : 360;
  const data = ids.map(id => {
    try {
      const sweep = sweepTopology({ ...S.compiled, tracePoint: id },
        { ...(S.compiled.params || S.topo.params || {}), motorAngles: frozenMotorAngles(), sweepMotor: String(S.activeMotor) },
        thetaStart, thetaEnd, 5);
      return (sweep && sweep.results) ? { id, results: sweep.results } : null;
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
  trajectoryCache = { version: geomVersion, motorKey, data };
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

// 工作範圍 / 兩點夾持的純計算（workRangeFromTrace / clampRangeFromTraces /
// currentPointDistance）已抽到 ./measurement.js；這裡只留量測卡與量測線的呈現。

function updateWorkRangeCard(measurement) {
  const card = document.getElementById('workRangeCard');
  if (!card) return;
  card.style.display = measurement ? 'flex' : 'none';
  if (!measurement) return;
  const value = document.getElementById('workRangeValue');
  const detail = document.getElementById('workRangeDetail');
  if (measurement.kind === 'clamp') {
    value.textContent = `兩點距離 ${roundMm(measurement.min.distance)}–${roundMm(measurement.max.distance)} mm`;
    detail.textContent = Number.isFinite(measurement.currentDistance)
      ? `目前距離 ${roundMm(measurement.currentDistance)} mm`
      : `最小距離 ${roundMm(measurement.min.distance)} mm · 最大距離 ${roundMm(measurement.max.distance)} mm`;
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
  // 只有夾持器才把雙追蹤點解讀成兩個夾爪端點；升降臂等機構的雙點
  // 可能只是用來觀察姿態，不能顯示成「可夾尺寸」。
  const reference = S.topo.referencePoint && currentPoints?.[S.topo.referencePoint];
  if (reference && traces.length === 1) {
    const range = workRangeFromTrace(traces[0]);
    const samples = (traces[0].results || []).filter(r => r?.isValid && r.B).map(r => r.B.y - reference.y);
    const current = currentPoints?.[traces[0].id];
    if (range && samples.length) {
      const value=document.getElementById('workRangeValue'), detail=document.getElementById('workRangeDetail'), card=document.getElementById('workRangeCard');
      card.style.display='flex'; value.textContent=`對基準高度 ${roundMm(Math.min(...samples))}–${roundMm(Math.max(...samples))} mm`;
      const dx=current ? current.x-reference.x : 0, dy=current ? current.y-reference.y : 0;
      detail.textContent=`目前高度 ${roundMm(dy)} mm · 水平偏移 ${roundMm(dx)} mm · 距離 ${roundMm(Math.hypot(dx,dy))} mm`;
      if (current) drawMeasurementLine(reference,current);
      return;
    }
  }
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
  if (detail) detail.textContent = `目前距離 ${roundMm(distance)} mm`;
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
  try { sol = solveTopology(S.compiled, { thetaDeg: S.theta, motorAngles: motorAnglesNow(), _prevPoints: seed }); } catch (_) {}
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
    title = mobility.mobilityOverride
      ? `組裝自由度：F = ${mobility.dof}（一般公式 ${mobility.formulaDof}；平行冗餘約束已校正）`
      : `理論自由度：F = ${mobility.dof}（剛體 ${mobility.bodies}、低副 ${mobility.lowerPairs}、高副 ${mobility.higherPairs}）`;
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
    } else if (mobility.inputs >= mobility.dof) {
      // 多自由度但每個自由度都有馬達管：一次控制一顆、其他凍結，動作仍完全可預測。
      state = 'ready';
      text = `DOF ${mobility.dof} · ${mobility.inputs} 組動力可完整控制`;
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
  return planMotorRotDeg({
    id, points: pts, groundIds, comps: S.comps, compiledSteps: S.compiled?.steps || [],
    sliderMountInfo, isHiddenSliderRailPoint
  });
}

// 馬達固定邏輯：輸出軸鎖在軸心；機身方向只看靜態裝配參考，不看播放後的 solved moving point。
// 這份 mount 同時供 2D/3D 使用，避免 3D 動畫時馬達跟著齒條/從動件轉。
function buildMotorMounts(motorIds, groundIds) {
  return planMotorMounts({
    motorIds, groundIds, staticPoints: pointCoords(), comps: S.comps,
    compiledSteps: S.compiled?.steps || [], sliderMountInfo,
    isHiddenSliderRailPoint, motorTypeForCenter
  });
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
  const update = renderGear({
    component: c, points: pts, svg, scale: View.getScale(),
    project: p => ({ x: TX(p.x), y: TY(p.y) }), params: S.topo.params,
    gearById, selected: c.id === S.selectedGearId, meshOff: gearMeshOff(c),
    interactionBlocked: () => Boolean(S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars),
    onSelect: selectGear, onRotate: startGearManualRotate
  });
  if (update) frameUpdaters.push(update);
}
function drawGearManualHandles(pts) {
  renderGearManualHandles({
    gears: S.comps.filter(c => c.type === 'gear'), points: pts, svg,
    scale: View.getScale(), project: p => ({ x: TX(p.x), y: TY(p.y) }),
    selectedGearId: S.selectedGearId, onRotate: startGearManualRotate,
    registerUpdate: update => frameUpdaters.push(update)
  });
}
// 三點桿：用圓角三角板呈現，同時仍保留每條邊/孔位的求解語法。phase 'layered'：畫進
// draw() 依 zlift 算好的疊放層（透過 ctx.groupForLayer/triLayerByKey/triKey 取得對應 <g>）。
// 函式體照搬自原 draw() 內聯三角板迴圈、零行為改變（內部解構改名 a,b,d 以免遮蔽參數 c）。
function drawTrianglePart(c, pts, ctx) {
  const hostedPlateMounts = ctx.hostedMounts ? ctx.hostedMounts.get(c.id) : null;
  const plateExtras = (hostedPlateMounts && hostedPlateMounts.length)
    ? Exporters.plateMountExtras(hostedPlateMounts) : null;
  renderPlate({
    component: c, points: pts, ctx, svg, scale: View.getScale(),
    project: p => ({ x: TX(p.x), y: TY(p.y) }), selectedId: S.selectedTriangleId,
    interactionBlocked: () => Boolean(S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars),
    onSelect: selectTriangle, shapeMode: plateShapeMode, plateExtras,
    platePath, roundedPath: roundedTriangleHullPath, vertices: plateVertices, localToWorld,
    onShapeDrag: startShapeDrag, onDeleteShapeVertex: deleteShapeVertex,
    registerUpdate: update => frameUpdaters.push(update)
  });
}
// 造形點的局部座標系＝解出的 p1、p2（與 plate-geometry 一致）。
// 造形點拖曳（plateBasisFor / startShapeDrag / shapeDrag* / deleteShapeVertex）已移到 ./plate-editor.js

// 齒條（rack-and-pinion）：與小齒輪嚙合的直線齒桿，沿 axisDeg 平移。齒形由 createRackPath 產，
// 每幀只更新平移（齒桿是剛體，p1 為其上一個材料點，整條跟著 p1 移動）。
function drawRackPart(c, pts) {
  const update = drawRack({ component: c, points: pts, comps: S.comps, svg, scale: View.getScale(), project: p => ({ x: TX(p.x), y: TY(p.y) }), params: { ...S.topo.params, selectedGearId: S.selectedGearId }, bodyHeightFor: rackBodyHeight, phaseShiftFor: rackPhaseShift, onSelectGear: selectGear });
  if (update) frameUpdaters.push(update);
}


function drawWorkpiecePart(c,pts){
  renderWorkpiece({ component: c, points: pts, comps: S.comps, svg, scale: View.getScale(), project: p => ({ x: TX(p.x), y: TY(p.y) }), pulleyRadius, circleRectCompression });
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
  const update = drawPulley({ component: c, points: pts, svg, scale: View.getScale(), project: p => ({ x: TX(p.x), y: TY(p.y) }), radius: pulleyRadius, pinRadius: pulleyPinRadius });
  if (update) frameUpdaters.push(update);
}

// 開口皮帶：畫成「兩段外公切線 + 兩段包覆圓弧」的完整路徑；傳動數學由 solver 處理。
function drawBeltPart(c, pts) {
  const update = drawBelt({ component: c, points: pts, comps: S.comps, theta: () => S.theta, svg, scale: View.getScale(), project: p => ({ x: TX(p.x), y: TY(p.y) }), radius: pulleyRadius });
  if (update) frameUpdaters.push(update);
}

// 凸輪從動件：p1 為凸輪軸心，p2 為沿 axisDeg 直動的從動點；滾子中心由凸輪相切幾何推出。
function drawCamPart(c, pts) {
  const update = renderCam({
    component: c, points: pts, svg, scale: View.getScale(),
    project: p => ({ x: TX(p.x), y: TY(p.y) }), params: S.topo.params,
    theta: () => S.theta, camRadius, camFollowerState
  });
  if (update) frameUpdaters.push(update);
}

// 登錄表：phase 決定繪製時機——'underlay'＝連桿之下（gear/rack 等機件）、'layered'＝畫進 zlift 疊放層（三點桿）。
const PART_DRAW = {
  gear:     { phase: 'underlay', draw: drawGearPart },
  rack:     { phase: 'underlay', draw: drawRackPart },
  cam:      { phase: 'underlay', draw: drawCamPart },
  pulley:   { phase: 'underlay', draw: drawPulleyPart },
  workpiece:{ phase: 'underlay', draw: drawWorkpiecePart },
  belt:     { phase: 'underlay', draw: drawBeltPart },
  triangle: { phase: 'layered',  draw: drawTrianglePart },
};

function draw() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  frameUpdaters = [];
  sliderLayer = null;
  recountBanner = null;
  if (!S.compiled || !S.comps.length) {
    // 機構已清空：作廢上一機構的模型快照。否則 drawGround() → motorFrameExportMounts()
    // 的預設參數會撿到舊 lastModelInputs 裡已刪馬達的安裝座，畫出一塊幽靈機架板。
    lastModelInputs = null;
    drawGround();   // 空畫布：固定銷不足 → fallback 到地面基線
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

  const sceneIds = collectSceneIds({ compiled: S.compiled, comps: S.comps, motorPointIds: Model.motorPointIds(S.comps) });
  const { groundIds, motorCenterIds, modelMotorCenterIds, camCenterIds } = sceneIds;
  const motorMounts = buildMotorMounts(modelMotorCenterIds, groundIds);
  // 地基：用「當前」pts＋mount 算共用 frameGeometry（放馬達即變形），畫在最底層。
  // 已宣告宿主機架桿的 mount 不進地基——特徵切在宿主桿身上，2D 桿身照合併外形畫（見連桿迴圈）。
  const mountSplit2d = Exporters.splitMountsByHost(S.comps,
    motorFrameExportMounts({ pts, motorCenterIds: modelMotorCenterIds, motorMounts }));
  const frameGeometry2d = Exporters.inspectFrameExport(
    frameConnectorNodes(), Settings.exportSettings(), mountSplit2d.free);
  drawGround(frameGeometry2d);
  const renderScene = prepareRenderScene({
    compiled: S.compiled, comps: S.comps, points: pts, frameGeometry: frameGeometry2d, sceneIds,
    computeBodyLayers, motorAssemblyLayerForBody, motorMounts
  });
  const { isGroundBar, triangleEdgeKeys, triangleKey: triKey, bodyLayers, linkLayer, triangleLayerByKey: triLayerByKey } = renderScene;
  drawMotorMountHoles(motorCenterIds, motorMounts, pts);
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
  // hostedMounts：靜態結構板承載的馬達安裝特徵（穿板槽/耳孔），板身直接開槽。
  const triCtx = { groupForLayer, triLayerByKey, triKey, hostedMounts: mountSplit2d.hosted };
  S.comps.forEach(c => { const e = PART_DRAW[c.type]; if (e && e.phase === 'layered') e.draw(c, pts, triCtx); });

  // 動力來源本體：畫在桿件底下，曲柄轉在它上面。依型號畫 TT馬達或 MG995 伺服。
  // 朝向＝對準接在馬達中心、非曲柄的那根桿（指向它的另一端）；沒有就朝最近的另一個地錨；都沒有才朝下。
  // 注意：馬達記在「節點」上（point.type='motor'），曲柄那根桿的 isInput 通常仍是 false，
  // 光靠 !c.isInput 排不掉曲柄。改用 input_crank 步驟算出曲柄動端，明確把曲柄那根桿排除。
  // 多馬達：標籤加編號（M1/M2…），控制中的那顆用醒目色，一眼看出現在在動誰。
  const multiMotor = usedMotorIds().size > 1;
  const motorIdForCenter = (nodeId) => {
    for (const c of S.comps) {
      for (const k of ['p1', 'p2', 'p3']) {
        const pt = c[k];
        if (pt && pt.id === nodeId && (pt.physicalMotor || pt.physical_motor)) return String(pt.physicalMotor || pt.physical_motor);
      }
    }
    return '';
  };
  motorCenterIds.forEach(id => {
    const p = pts[id]; if (!p || !Number.isFinite(p.x)) return;
    // 機架桿馬達：殼鎖在 motorCarrier 那根桿上，本體朝向跟著機架桿逐幀旋轉；
    // 世界機架馬達維持既有的一次性朝向（mount / computeMotorRotDeg）。
    const inputBarHere = S.comps.find(c => c.type === 'bar' && c.isInput && c.p1 && c.p2 &&
      ((c.p1.id === id && c.p1.physicalMotor) || (c.p2.id === id && c.p2.physicalMotor)));
    const carrierBar = inputBarHere && inputBarHere.motorCarrier && !['horizontal', 'vertical'].includes(motorMounts.get(id)?.orientation)
      ? S.comps.find(k => k.type === 'bar' && k.id === inputBarHere.motorCarrier) : null;
    const mount = motorMounts.get(id);
    const staticRotDeg = mount ? mount.rotDeg : computeMotorRotDeg(id, pts, groundIds);
    const rotFor = (P) => {
      if (!carrierBar || !carrierBar.p1 || !carrierBar.p2) return staticRotDeg;
      const farId = carrierBar.p1.id === id ? carrierBar.p2.id : carrierBar.p1.id;
      const ctr = P[id], far = P[farId];
      if (!ctr || !far || !Number.isFinite(far.x)) return staticRotDeg;
      return Math.atan2(-(far.x - ctr.x), -(far.y - ctr.y)) * 180 / Math.PI + (mount?.reversed ? 180 : 0);  // 同 computeMotorRotDeg 慣例
    };
    const rotDeg0 = rotFor(pts);
    const isServo = motorTypeForCenter(id) === 'mg995';
    const body = isServo ? Render.drawMG995Servo(p.x, p.y, rotDeg0, motorLayer)
                         : Render.drawTTMotor(p.x, p.y, rotDeg0, motorLayer);
    const mId = motorIdForCenter(id);
    const isActive = mId && String(S.activeMotor) === mId;
    const labelText = (isServo ? 'MG995' : 'TT') + (multiMotor && mId ? `·M${mId}` : '');
    const labelColor = multiMotor
      ? (isActive ? '#d35400' : '#95a5a6')
      : (isServo ? '#2c6fbb' : '#c9971b');
    const label = Render.drawMotorLabel(p.x, p.y, labelText, labelColor, motorLayer);
    // 每幀更新：本體只改 transform（位置+朝向）、標籤只改 x/y；縮放在播放時不變故內部尺寸免重算。
    const updateMotor = (P) => {
      const q = P[id];
      const ok = q && Number.isFinite(q.x) && Number.isFinite(q.y);
      body.style.display = ok ? '' : 'none';
      label.style.display = ok ? '' : 'none';
      if (!ok) return;
      body.setAttribute('transform', `translate(${TX(q.x)} ${TY(q.y)}) rotate(${rotFor(P)})`);
      label.setAttribute('x', TX(q.x));
      label.setAttribute('y', TY(q.y) - 16 * View.getScale());
    };
    // 凸輪軸心固定在機架上；馬達只需畫一次，避免加入一般曲柄的逐幀更新鏈。
    if (!camCenterIds.has(id)) frameUpdaters.push(updateMotor);
  });

  // 桿件：依層級放進對應的 <g>（內層在底、外層在上）；同層內紅色曲柄最後畫不被蓋住。
  const { linksToDraw, countMissing: countMissingLinks } = renderLinks({
    links: S.compiled.visualization.links || [], comps: S.comps, points: pts, triangleEdgeKeys, isGroundBar,
    selectedLinkId: S.selectedLinkId, pickBars: S.pickBars,
    interactionBlocked: () => Boolean(S.drawingLink || S.drawingTriangle || S.drawingPolygon),
    onTryPick: tryPickBar, onFreeDrag: Input.startFreeLinkDrag, onSelect: selectLink,
    groupForLayer, linkLayer, groundIds, hullRadius: HULL_R_WORLD, scale: View.getScale(),
    barHullPath, project: p => ({ x: TX(p.x), y: TY(p.y) }), hostedMounts: mountSplit2d.hosted,
    inspectHostedFrame: (nodes, mounts) => Exporters.inspectFrameExport(nodes, Settings.exportSettings(), mounts),
    registerUpdate: update => frameUpdaters.push(update)
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
  // 齒輪輪緣銷不畫成通用浮動節點——改由齒輪自己畫成「螺栓孔」（見上面齒輪繪製）。
  const gearPinIds = new Set(S.comps.filter(c => c.type === 'gear' && c.p2).map(c => c.p2.id));
  const pulleyPinIds = new Set(S.comps.filter(c => c.type === 'pulley' && c.p2).map(c => c.p2.id));
  const camFollowerIds = new Set(S.comps.filter(c => c.type === 'cam' && c.p2).map(c => c.p2.id));
  const workpieceIds = new Set(S.comps.filter(c=>c.type==='workpiece'&&c.p1).map(c=>c.p1.id));
  const hiddenPointIds = new Set(Object.keys(pts).filter(id => isHiddenSliderRailPoint(id) || isSliderMountPoint(id)));
  renderNodes({
    points: pts, svg, groundIds, motorCenterIds, camCenterIds, hiddenPointIds,
    gearPinIds, pulleyPinIds, camFollowerIds, workpieceIds, dragId: S.dragId,
    sliderMountInfo, project: p => ({ x: TX(p.x), y: TY(p.y) }),
    onPointerDown: Input.onNodeDown, registerUpdate: update => frameUpdaters.push(update)
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
  lastModelInputs = buildPreviewModelInputs({
    comps: S.comps, params: S.topo.params, theta: S.theta, links: linksToDraw, points: pts,
    groundIds, motorCenterIds: modelMotorCenterIds, motorTypes, motorMounts,
    polygons: S.compiled.visualization.polygons || [], sliderTravelStart, sliderTravelEnd,
    sliderBodyLength, rackBodyHeight, rackPhaseShift, pulleyRadius, pulleyPinRadius
  });
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
  const mountSplit3d=Exporters.splitMountsByHost(S.comps,motorFrameExportMounts());
  const frameGeometry=Exporters.inspectFrameExport(frameConnectorNodes(),Settings.exportSettings(),mountSplit3d.free);
  // 三點桿板形：3D 直接沿用 2D/DXF 共用的 createPlateGeometry 外形（含 shapeMode——
  // 包絡板/多邊形板/折線桿——與 vertices 順序），孔位與加工輸出一致，三視圖不分歧。
  // 以孔序字串為鍵，供 scene-model 對應到各片板；找不到原 comp 的純視覺 polygon 退回夾爪近似。
  const plateGeometries={};
  const barGeometries={};
  mountSplit3d.hosted.forEach((mounts, barId) => {
    const bar = S.comps.find(comp => comp.type === 'bar' && comp.id === barId);
    if (!bar || !pts[bar.p1.id] || !pts[bar.p2.id]) return;
    const geometry = Exporters.hostedBarGeometry(bar, pts, Settings.exportSettings(), mounts);
    if (!geometry?.outlines?.length) return;
    const a = pts[bar.p1.id], b = pts[bar.p2.id];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const world = point => ({ x: a.x + point.x * ux - point.y * uy, y: a.y + point.x * uy + point.y * ux });
    barGeometries[barId] = {
      outline: geometry.outlines[0].map(world),
      holes: geometry.holes.map(hole => ({ ...world(hole), r: hole.r })),
      cutouts: (geometry.cutouts || []).map(cutout => ({ ...cutout, points: cutout.points.map(world) }))
    };
  });
  (polygons||[]).forEach(poly=>{
    const world=poly.points.map(id=>pts[id]).filter(p=>p&&Number.isFinite(p.x));
    if(world.length<3) return;
    const key=poly.points.join(',');
    const comp=S.comps.find(c=>c.type==='triangle'&&c.p1&&c.p2&&c.p3&&[c.p1.id,c.p2.id,c.p3.id].join(',')===key)
      || (poly.shape==='jaw' ? {shape:'jaw',jawTurnSign:poly.jawTurnSign} : null);
    if(!comp) return;
    // 靜態結構板承載的馬達穿板特徵一併切進 3D 板身（同 2D/DXF）。
    const hostedPlateMounts=comp.id?mountSplit3d.hosted.get(comp.id):null;
    const extras=(hostedPlateMounts&&hostedPlateMounts.length)?Exporters.plateMountExtras(hostedPlateMounts):null;
    const g=createPlateGeometry(comp,world,{radius:HULL_R_WORLD,...(extras||{})});
    if(g.outlines.length) plateGeometries[key]={outline:g.outlines[0],holes:g.holes,cutouts:g.cutouts||[]};
  });
  const model = buildSceneModel(links, pts, {
    groundIds, motorCenters: motorCenterIds, motorTypes, motorMounts, hullR: HULL_R_WORLD,
    polygons, sliders, gears, racks, cams, pulleys, belts, frameGeometry, plateGeometries, barGeometries
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
function drawGround(frameGeometry) {
  const nodes = frameConnectorNodes();
  const fg = frameGeometry || Exporters.inspectFrameExport(nodes, Settings.exportSettings(),
    Exporters.splitMountsByHost(S.comps, motorFrameExportMounts()).free);
  renderFrameGeometry({ nodes, frameGeometry: fg, svg, project: p => ({ x: TX(p.x), y: TY(p.y) }), drawBaseline: () => Render.drawGroundBaseline() });
}

function drawMotorMountHoles(motorIds, motorMounts, pts) {
  renderMotorMountHoles({
    motorIds, motorMounts, points: pts, svg, scale: View.getScale(),
    project: p => ({ x: TX(p.x), y: TY(p.y) }), motorTypeForCenter,
    rotationForCenter: motorMountPatternRotDegForCenter,
    ttSettings: Settings.ttMountSettings(), mg995Settings: Settings.mg995MountSettings(),
    mg995SlotOutline: Exporters.mg995SlotOutline,
    registerUpdate: update => frameUpdaters.push(update)
  });
}

function syncFrameOptionButtons() {
  const lockButtons = [document.getElementById('btnFrameLock'), document.getElementById('mobileBtnFrameLock')].filter(Boolean);
  lockButtons.forEach(lock => {
    lock.classList.toggle('active', Boolean(S.lockFrameHoles));
    lock.title = S.lockFrameHoles ? '取消固定孔 8mm 吸附' : '拖曳固定孔與機架時吸附到 8mm LEGO 孔距';
  });
}

function toggleFrameLock() {
  S.lockFrameHoles = !S.lockFrameHoles;
  syncFrameOptionButtons();
  draw();
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

function clearAll() {
  pushUndo();
  pause();
  S.comps = []; S.theta = 0; S.counter = 0;
  S.activeMotor = '1'; S.motorAngles = {};
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
  S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
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

function updateMotorDirectionButton() {
  const btn = document.getElementById('btnMotorDirection');
  if (!btn) return;
  btn.textContent = playDir > 0 ? '↻ 順時針' : '↺ 逆時針';
  btn.classList.toggle('active', playDir < 0);
  btn.title = playDir > 0 ? '目前順時針；點擊改為逆時針' : '目前逆時針；點擊改為順時針';
}
function toggleMotorDirection() {
  playDir *= -1;
  S.topo.params.motorDirection = playDir;
  updateMotorDirectionButton();
  scheduleAutosave();
  transient(playDir > 0 ? '↻ 馬達改為順時針' : '↺ 馬達改為逆時針');
}

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
// cancelMotorMode 已隨動力來源域移到 ./motor-tools.js
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
// 動力來源域（placeMotor / handleMotorOnNode / driveBarAt / driveSliderAt / driveGearAt /
// motorBarForCenter / motorTypeForCenter / inputRockRange）已移到 ./motor-tools.js

// rackPinionThetaRange（有限齒條的 theta 範圍）已隨齒輪 / 齒條域移到 ./gear-editor.js

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
// 三點桿 / 板件域（selectTriangle / 外形模式 / 造形點 / g・r1・r2 邊長）已移到 ./plate-editor.js
// 滑軌域（selectSlider / 尺寸與行程調整 / 固定端切換 / 翻面）已移到 ./slider-editor.js

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

// 節點角色域（角色 / X・Y 微調 / 拆馬達 / 分離 / 軌跡點 / 量測基準 / 位置鎖 / 伺服・行程面板）
// 已移到 ./node-editor.js

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
function motorMountPatternRotDegForCenter(id, pts, mount = null) {
  // drawTTMotor / drawMG995Servo's local long axis is +Y, while mount/CAD coordinates use +X as the motor long axis.
  const inputBar = S.comps.find(comp => comp.type === 'bar' && comp.isInput && comp.p1 && comp.p2 &&
    ((comp.p1.id === id && comp.p1.physicalMotor) || (comp.p2.id === id && comp.p2.physicalMotor)));
  const carrier = inputBar?.motorCarrier && S.comps.find(comp => comp.type === 'bar' && comp.id === inputBar.motorCarrier);
  const center = pts?.[id];
  const farId = carrier?.p1?.id === id ? carrier.p2.id : carrier?.p2?.id === id ? carrier.p1.id : null;
  const far = farId && pts?.[farId];
  // A riding motor's holes rotate with its carrier; a world-frame motor keeps
  // the mount orientation planned at draw time.
  const visualRotDeg = center && far && Number.isFinite(far.x)
    ? Math.atan2(-(far.x - center.x), -(far.y - center.y)) * 180 / Math.PI
    : (mount ? mount.rotDeg : computeMotorRotDeg(id, pts || {}, new Set()));
  return visualRotDeg - 90;
}
// 機架板上所有動力來源的加工孔位：TT＝軸孔＋螺絲孔＋定位孔、MG995＝穿板槽＋耳孔。
function motorFrameExportMounts(inputs = lastModelInputs || {}) {
  const pts = inputs.pts || {};
  const motorIds = inputs.motorCenterIds || new Set();
  const motorTypes = inputs.motorTypes || new Map();
  const motorMounts = inputs.motorMounts || new Map();
  const ttSettings = Settings.ttMountSettings();
  const mg995Settings = Settings.mg995MountSettings();
  const mounts = [];
  motorIds.forEach(id => {
    const type = motorTypes.get(id) || motorTypeForCenter(id);
    const center = pts[id];
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
    const mount = motorMounts.get(id);
    mounts.push({
      kind: type === 'mg995' ? 'mg995' : 'tt',
      pointId: id,   // 供 splitMountsByHost 對應 bar.motorMountPoint（宿主機架桿）
      frameBody: mount?.frameBody,
      center,
      rotDeg: motorMountPatternRotDegForCenter(id, pts, mount),
      settings: type === 'mg995' ? mg995Settings : ttSettings
    });
  });
  return mounts;
}
function saveFile() {
  Store.downloadJson(Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()), 'blocks.json');
}
function exportLinksSvg() {
  const settings = Settings.exportSettings(), nodes = frameConnectorNodes(), mounts = motorFrameExportMounts();
  // 有宿主機架桿的 mount 隨該桿匯出（特徵切進桿身）；剩下的才進 frame.svg。
  const freeMounts = Exporters.splitMountsByHost(S.comps, mounts).free;
  const count = Exporters.exportLinksAsSvg(S.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings, mounts);
  const frameCount = Exporters.exportFrameAsSvg(nodes, settings, freeMounts);
  const warnings = Exporters.frameExportWarnings(nodes, settings, freeMounts);
  transient(count || frameCount ? `已匯出 ${count} 個零件 + ${frameCount ? '機架' : '無機架'} SVG${warnings.length ? `；⚠ ${warnings[0]}` : ''}` : '沒有可匯出的零件或機架');
}
function exportLinksDxf() {
  const settings = Settings.exportSettings(), nodes = frameConnectorNodes(), mounts = motorFrameExportMounts();
  const freeMounts = Exporters.splitMountsByHost(S.comps, mounts).free;
  const count = Exporters.exportLinksAsDxf(S.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings, mounts);
  const frameCount = Exporters.exportFrameAsDxf(nodes, settings, freeMounts);
  const warnings = Exporters.frameExportWarnings(nodes, settings, freeMounts);
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
    url = Store.buildShareUrl(Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()));
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
  Panels.init({ pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount, pointIsGround, isGroundPositionUnlocked });
  Tools.init({ svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle, selectSlider,
               setBanner, clearBanner, worldFromEvent, pointCoords, nearestDisplayToPoint, snapWorld,
               mobilePrompt, promptText });
  Input.init({ svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink,
               worldFromEvent, pointCoords, mobilePrompt,
               snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
               movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
               isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
               handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround, recordManualTrace, solvePinnedConstraints,
               snapFramePoint, snapFrameNodesToGrid, openMobileEditPanel, closeMobileEditPanel,
               isGroundPositionUnlocked, relockGroundPosition, rotateInputCrankToPoint, pointIsRackHole });
  Settings.init({ draw });
  Settings.loadExportSettings();
  Settings.loadTtMountSettings();
  Settings.loadMg995MountSettings();
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

window.blocks = { placeMotor, openPowerMenu, pickMotorType, openLinkMenu, pickLinkTool, setMobilePanel, openMobileOpenMenu, openMobileFile, changeServoAngle, changeStroke, flipSlider, toggleSliderBase, convertLinkToSlider: Tools.convertLinkToSlider, changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset, changeSliderTravelStart, changeSliderTravelEnd, changeNodePos, addAnchor, addGearPair, addRackPinion, toggleRackOrientation, changeGearModule, changeGearTeeth, changeGearPinRadius, changeGearPinHoleDiameter, changeRackLength, changeRackBodyHeight, changeRackSlotLength, changeRackSlotWidth, addLink, startDrawLink: Tools.startDrawLink, startDrawRail: Tools.startDrawRail, startDrawPolygon: Tools.startDrawPolygon, startDrawTriangle: () => Tools.startDrawTriangle('triangle'), startDrawJaw: () => Tools.startDrawTriangle('jaw'), clearAll, confirmClearAll, togglePlay, toggleMotorDirection, setLen, changeLen, setTriSide, setTriangleShapeMode, addTriangleOutlinePoint, selectLink, setNodeRole, removeNodeMotor, splitNode, toggleTracePoint, toggleMeasurementReference, toggleGroundPositionLock, toggleFrameLock, configureMotorMount, setMotorWorldMount, setMotorOrientation, toggleMotorReverse, deleteSelectedPart, bringPart, toggle3D, fitView, undo, saveFile, setExportSetting: Settings.setExportSetting, setTtMountSetting: Settings.setTtMountSetting, setMg995MountSetting: Settings.setMg995MountSetting, exportLinksSvg, exportLinksDxf, openFile, share, loadExample };
init();
