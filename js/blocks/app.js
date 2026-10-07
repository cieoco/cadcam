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
import { initClassroomBridge } from './classroom-bridge.js';
import { APP_VERSION } from '../version.js?v=20261007_angle';
import { solveTopology } from '../multilink/solver.js';
import { camFollowerState, camRadius } from '../utils/cam-profile.js';
// 3D 唯讀預覽（懶載入 THREE，平面路徑完全不受影響）
// computeBodyLayers：2D 疊放順序與 3D z 分層共用同一套，兩邊才一致。
import { buildSceneModel, computeBodyLayers } from '../blocks3d/scene-model.js';
import { buildOrthogonalChildren, planeInputs, attachModulePlates } from '../blocks3d/orthogonal-3d.js?v=20261007_m5a';   // O6：直角安裝子模組的 3D 位姿
// 純邏輯模組
import * as View from './view.js';
import * as Render from './render.js';   // SVG 繪製基元（純呈現）
import * as Panels from './panels.js';   // 編輯面板呈現（讀 S + 寫 DOM）
import * as Tools from './tools.js';     // 工具模式互動（畫桿 / 畫滑軌 / 畫三點桿 / 連桿升級滑軌）
import * as Input from './input.js?v=20261007_m2b';     // 指標 / 手勢互動（拖曳 + 吸附合併 + pinch 縮放）
import * as Model from './model.js';
import { ownedParamKeys } from './part-types.js';   // 零件型別表：擁有的參數 key
import { unsolvedMovingPoints } from './solve-health.js';   // S3 漏解警示：找出 solver 沒解出的活動接點
import { offerExampleFromUrl } from './example-entry.js?v=20261005_unit2';
import { getTeachingFeedback } from './teaching-feedback.js';
import * as Motion from './motion.js';
import { memberSweepSegments } from './member-sweep.js';
let sweepMemberId = null; // 顯示偏好，不寫入作品格式。
import { compileAssembly, solveAssembly, sweepAssembly, rebakeModules, worldFrameComps, machineFrameComps, machineMounts, splitFrameMounts, moduleFrameExports, moduleFrameNodes, mountedBaseIds as moduleMountedBaseIds, canMergePoints, homeAdjustment, moduleOfPoint, selectionModule, planeOf, compsInPlane, pointIdsInPlane, orthogonalFrame, orthogonalBand, orthogonalHostEdge, hostPlateThickness } from './assembly.js?v=20261007_m5a';
import { machineComps, machineModules } from './assembly-roles.js';   // M5a：製作／匯出只看機器（底座＋裝在它身上的）
import { normalizeModules } from './module-schema.js?v=20261007_singleface';
import { refreshFaceMounts } from './face-mount-refresh.js';
import { designTabs, resolveFocus, compsInFocus, assignNewComps, pointIdsOf, focusInputs, ROOT_TAB } from './design-focus.js';   // H1：設計模式一次只看一個設計（分頁）
import { createDesignTabs } from './design-tabs-ui.js?v=20261005_tabclose';
import { createMateTool } from './mate-tool.js?v=20261007_facecolor';   // M2：設計分頁的「接合面」工具
import { advanceRock } from './rock-motion.js';
import { createMemberEditor } from './member-editor.js';
import { drawMemberDimensions } from './member-dimension-render.js';
import { memberStock, memberHoleDiameter, memberStockWarnings } from './member-stock.js';
import { createJawTipHandle } from './jaw-tip-handle.js';
import { analyzeDof } from './dof.js';
import * as Store from './storage.js?v=20261007_singleface';
import * as Exporters from './exporters.js?v=20261007_9';
import { localToWorld, plateVertices, plateShapeMode, createPlateGeometry } from './plate-geometry.js';
import { S, activateMotor, motorAnglesNow, frozenMotorAngles, usedMotorIds } from './state.js';  // 跨模組共享的可變狀態與多馬達 helper
import { createExampleController } from './example-controller.js?v=20261005_parallel';
import { createGripperController } from './gripper-controller.js?v=20260925_r1b2';
import { createGripperObject } from './gripper-object.js?v=20260925_r1b2';
import { createGearEditor, rackPhaseShift } from './gear-editor.js?v=20261004_fourbar_r1';
import { createSliderEditor } from './slider-editor.js?v=20261005_sliderui';
import { createMotorTools } from './motor-tools.js';
import { createPlateEditor } from './plate-editor.js';
import { createNodeEditor } from './node-editor.js';
import { createModuleEditor } from './module-editor.js?v=20261007_singleface';
import { createModuleDrag } from './module-drag.js';
import { createBench } from './bench-ui.js?v=20261007_singleface';   // B3～B5：組立台畫面（模式切換、3D 接口、預覽、調整）
import { workRangeFromTrace, clampRangeFromTraces, currentPointDistance } from './measurement.js';
import { circleRectCompression } from './intake-contact.js';
import { drawGear as renderGear, drawPulley, drawBelt, drawRack, drawGearManualHandles as renderGearManualHandles } from './transmission-render.js';
import { drawCam as renderCam, drawWorkpiece as renderWorkpiece } from './special-part-render.js';
import { drawPlate as renderPlate } from './plate-render.js';
import { buildMotorMounts as planMotorMounts, computeMotorRotDeg as planMotorRotDeg, motorAssemblyLayerForBody } from './motor-mounts.js';
import { drawFrameGeometry as renderFrameGeometry, drawMotorMountHoles as renderMotorMountHoles, drawModulePlates as renderModulePlates } from './motor-frame-render.js';
import { createModulePlateSource } from './module-plates.js?v=20261007_m5a';   // G1：已安裝模組的固定板（<id>-frame）3D／2D
import { collectSceneIds, prepareRenderScene } from './render-scene.js';
import { buildPreviewModelInputs } from './preview-model-inputs.js';
import { renderLinks, renderNodes } from './mechanism-layer-render.js';
import * as Settings from './settings.js';   // 作品級加工設定 + 舊 localStorage 偏好遷移 + 表單同步
import { normalizeFabricationProfile, FABRICATION_DEFAULTS } from './fabrication-profile.js';
import { cncWarnings } from './cnc-check.js';   // L4：依刀徑檢查匯出特徵
import { orthogonalExportExtras, withAdapterNodes, withWorldAdapterNodes } from './orthogonal-joint.js';   // O4a：直角安裝轉接座孔位
import { adapterMesh, meshToStl } from './adapter-stl.js';   // O4b：3D 列印轉接座 STL
import { buildPlan, buildPackHtml } from './build-plan.js?v=20261007_7';   // L5b：製作包（板件＋五金＋組裝步驟）
import { resolveSpacers, suggestRackStops } from './interference.js';   // L5c／L6：干涉檢查、自動隔圈、齒條長槽限位建議

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
let candidate = null, inCandidate = false, candidateOf = null;   // M4 接合精靈預覽的候選作品（見 setCandidate）
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
let lastFullPts = null;         // 最近一幀的全域求解點（含所有平面；給側影帶與 fitView 用）
let lastModelInputsAll = null;  // O6：所有平面（全域解）的 3D 輸入；只在有直角安裝時才有
let lastModelInputs = null;    // 最近一次 draw() 算好的 { links, pts, groundIds }，給 3D 鏡像用

// 多馬達：存檔一併保留「哪顆在控制、其他凍在幾度」，載回來才不會全部歸零疊在一起。
const motorSnapshotState = () => ({
  activeMotor: S.activeMotor,
  motorAngles: frozenMotorAngles(),
  fabrication: S.fabrication,
  modules: S.modules
});
let gripperController = null;
const undoLessons = new Map();
function snapshotStr() {
  return JSON.stringify(Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()));
}
initClassroomBridge(() => Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()), APP_VERSION);
function pushUndo() {
  const s = snapshotStr();
  if (S.undoStack[S.undoStack.length - 1] === s) return; // 沒變就不堆
  S.undoStack.push(s);
  if (S.undoStack.length > 60) S.undoStack.shift();
  updateUndoBtn(true);
}
function updateUndoBtn(recordLesson = false) {
  // 相同作品可能分別來自自動還原與課程；每次加入紀錄都保存身分，不能只用 snapshot 當唯一 key。
  const latest = S.undoStack[S.undoStack.length - 1];
  if (recordLesson && latest) {
    if (!undoLessons.has(latest)) undoLessons.set(latest, []);
    undoLessons.get(latest).push(exampleController.activeExampleId);
  }
  for (const [key, lessons] of undoLessons) {
    const count = S.undoStack.filter(s => s === key).length;
    if (!count) undoLessons.delete(key);
    else if (lessons.length > count) lessons.splice(0, lessons.length - count);
  }
  ['btnUndo', 'memberUndoBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = S.undoStack.length === 0;
  });
}
function undo() {
  if (!S.undoStack.length) return;
  const saved = S.undoStack.pop();
  const lessonId = undoLessons.get(saved)?.pop() || '';
  const norm = Store.normalizeSnapshot(JSON.parse(saved));
  if (norm) applySnapshot(norm, { recordUndo: false, fit: false, source: 'undo' });
  exampleController.restoreLesson(lessonId);
  updateUndoBtn();
}
function scheduleAutosave() {
  clearTimeout(S.autosaveTimer);
  S.autosaveTimer = setTimeout(() => Store.saveLocal(bench.autosaveSnapshot() || Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState())), 500);
}

// 套用一份 snapshot 到目前狀態。recordUndo 預設 true（外部開檔/分享要能 undo）。
function applySnapshot(norm, { recordUndo = true, fit = true, source = 'external' } = {}) {
  if (recordUndo) pushUndo();
  if (source !== 'undo') { sweepMemberId = null; mateTool.reset(); }
  pause();
  cancelMotorMode();
  Settings.syncFabricationInputs(); // 放棄尚未 change/blur 提交的表單草稿。
  S.comps = norm.comps;
  S.modules = Array.isArray(norm.modules) ? norm.modules : [];
  knownCompIds = null;   // 載入／復原的零件不是「新畫的」，不要歸給焦點模組
  if (source !== 'undo') S.designFocus = source === 'local-autosave' ? savedFocus() : null;   // 開檔／範例／分享 → 第一頁；自動還原 → 回到上次那頁
  S.topo = { params: norm.params || {}, tracePoint: norm.tracePoint || '', tracePoints: norm.tracePoints || [], referencePoint: norm.referencePoint || '' };
  manualTrace = {};
  S.counter = Math.max(norm.counter || 0, Store.highestIdNum(S.comps));
  S.theta = 0;
  // 多馬達：還原「哪顆在控制、其他凍在幾度」；舊檔沒有這兩欄就回到單馬達預設。
  S.activeMotor = String(norm.activeMotor || '1');
  S.motorAngles = { ...(norm.motorAngles || {}) };
  delete S.motorAngles[String(S.activeMotor)];
  const missingFabrication = !norm.fabrication;
  const fabrication = missingFabrication && source === 'local-autosave'
    ? Settings.legacyLocalFabrication()
    : (norm.fabrication || Settings.defaultFabrication());
  const fabricationSource = norm.fabrication
    ? '目前作品隨附的加工設定'
    : source === 'local-autosave'
      ? '舊本機自存：已帶入此瀏覽器的舊加工偏好'
      : '舊作品未附加工設定：已套用 v1 固定預設，請核對孔徑';
  Settings.applyFabricationProfile(fabrication, { source: fabricationSource });
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
  exampleController.snapshotApplied(norm, source);
  gripperController?.sync();
  rebuild(); draw();
  if (gripperController?.isActive() && gripperController.currentPlan().ok) gripperController.moveToOpen();
  if (fit) fitView();
  if (missingFabrication) transient(source === 'local-autosave'
    ? '舊本機自存已帶入本機加工偏好；下次保存會隨作品帶走'
    : '舊作品未附加工設定，已套用固定預設，請核對孔徑');
  else if (norm.warnings?.length) transient('⚠️ ' + norm.warnings[0]);
}

function normalizeIncomingSnapshot(raw) {
  const fabrication = normalizeFabricationProfile(raw?.fabrication);
  if (!fabrication.ok) return { norm: null, error: fabrication.message };
  const norm = Store.normalizeSnapshot(raw);
  return norm ? { norm, error: '' } : { norm: null, error: '作品資料格式不正確' };
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
const PLAY_SPEED_DEG_PER_SEC = Motion.PLAY_SPEED_DEG_PER_SEC;
const NOMINAL_FRAME_DT_MS = Motion.NOMINAL_FRAME_DT_MS;
const playStepDeg = Motion.playStepDeg;
const advanceByTime = Motion.advanceByTime;
const planMotion = () => Motion.planMotion(S.compiled, S.topo, S.theta, lastSolved,
  { active: String(S.activeMotor), frozen: frozenMotorAngles() },
  S.assembly ? p => solveAssembly(S.assembly, p) : undefined);
const mobilePrompt = () => window.matchMedia('(hover: none), (pointer: coarse), (max-width: 700px), (max-width: 1099px) and (max-height: 500px)').matches;
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
  return filterToView(m);   // 吸附／命中只看目前平面的點（O3）
};
// ---- 視圖平面（O3、SDD-ORTHOGONAL-MOUNT §4.3）：一次只畫一個平面，solve 與播放仍是全域 ----
const ORTHO_STACK_MM = 15;            // 側影帶的疊層高度（先固定 15 mm）
const HOST_BAND_MM = 3;               // 子視圖裡宿主側影帶的厚度
const hasOrthogonalModules = () => S.modules.some(m => m.mount && (m.mount.orient || m.mount.face));
// ---- 設計模式的焦點分頁（H1）：設計模式一次只畫／只編一個設計，組立模式才全部顯示 ----
const inDesign = () => S.mode === 'design';
const focusOpts = () => ({ keepRoot: S.designFocus === ROOT_TAB });   // 剛按「新設計」時，空的「未命名設計」分頁要留著
const focusModule = () => inDesign() ? (S.modules.find(m => m.id === S.designFocus) || null) : null;
const FOCUS_KEY = 'cadcam.blocks.designFocus';   // 只記在這個瀏覽器：重新整理後回到同一頁（不進作品檔）
function saveFocus() { try { localStorage.setItem(FOCUS_KEY, String(S.designFocus)); } catch (_) {} }
function savedFocus() { try { return localStorage.getItem(FOCUS_KEY); } catch (_) { return null; } }
// 上一次 rebuild 時的零件 id 集合：用來認出「這次新畫的零件」。載入／復原／清空時設 null，避免把還原的零件誤判成新零件。
let knownCompIds = null;
// 焦點是模組時，新畫（沒有 moduleId）的零件歸到那個模組。就地改原零件物件，保留各處持有的參照。
function adoptNewComps() {
  const ids = new Set(S.comps.map(c => c.id));
  if (knownCompIds && inDesign() && S.designFocus !== ROOT_TAB && S.modules.some(m => m.id === S.designFocus)) {
    const next = assignNewComps(S.comps, knownCompIds, S.designFocus);
    if (next !== S.comps) next.forEach((c, i) => { if (c !== S.comps[i]) S.comps[i].moduleId = c.moduleId; });
  }
  knownCompIds = ids;
}
// 目前畫面要處理的零件：設計模式＝焦點分頁；組立模式＝目前平面（O3）。沒有模組／直角安裝時原樣回 S.comps（零行為改變）。
function viewComps() {
  if (inDesign() && S.modules.length) return compsInFocus(S.comps, S.modules, S.designFocus);
  return hasOrthogonalModules() ? compsInPlane(S.comps, S.modules, S.viewPlane) : S.comps;
}
// 目前畫面用到的點 id；沒有模組／直角安裝時回 null（代表全部）。
function viewPointIds() {
  if (inDesign() && S.modules.length) return pointIdsOf(viewComps());
  return hasOrthogonalModules() ? pointIdsInPlane(S.comps, S.modules, S.viewPlane) : null;
}
// 畫面用的機架固定銷：設計模式只算焦點分頁自己的（已安裝模組的底座由 drawModulePlates 畫）。
function viewFrameNodes() {
  return inDesign() && S.modules.length ? Model.frameConnectorNodes(worldFrameComps(viewComps(), S.modules)) : frameConnectorNodes();
}
// 馬達安裝孔位只留畫面上的馬達。
function viewMounts(list) {
  const ids = inDesign() && S.modules.length ? viewPointIds() : null;
  return ids ? list.filter(m => ids.has(m.pointId)) : list;
}
// 焦點分頁擁有的馬達編號（設計模式只列這些）；組立模式／沒有模組＝全部。
function designMotorIds() {
  const all = usedMotorIds();
  if (!(inDesign() && S.modules.length)) return all;
  const own = new Set();
  viewComps().forEach(c => [c, c.p1, c.p2, c.p3].forEach(o => {
    const v = o && (o.physicalMotor || o.physical_motor);
    if (v) own.add(String(v));
  }));
  return own;
}
function filterToView(map, ids = viewPointIds()) {
  if (!ids) return map;
  const out = {};
  for (const id in map) if (ids.has(id)) out[id] = map[id];
  return out;
}
// 設計模式：焦點要是現有的分頁，並把 S.viewPlane 對齊焦點模組所在的平面（直角子模組在自己的平面正視）。
// 組立模式：模組已不存在或不再是直角安裝 → 回主視圖。
function validateViewPlane() {
  if (inDesign()) {
    S.designFocus = resolveFocus(S.comps, S.modules, S.designFocus, focusOpts());
    const mod = focusModule();
    S.viewPlane = mod ? planeOf(S.comps, S.modules, mod.id) : null;
    return;
  }
  if (S.viewPlane && planeOf(S.comps, S.modules, S.viewPlane) !== S.viewPlane) S.viewPlane = null;
}
function clearSelectionAndEditors() {
  S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedNodeId = null;
  deselectGear();
  closeMobileEditPanel();
  ['lenEditor', 'roleEditor', 'servoEditor', 'strokeEditor'].forEach(id2 => { const el = document.getElementById(id2); if (el) el.style.display = 'none'; });
  const baseBtn = document.getElementById('sliderBaseBtn'); if (baseBtn) baseBtn.style.display = 'none';
  const railBtn = document.getElementById('linkToRailBtn'); if (railBtn) railBtn.style.display = 'none';
  setSliderDetailRows(false);
}
// 切換設計分頁：收掉畫圖工具、取消選取、馬達改成這頁的、置中。keepSelection＝保留現有選取（插入模組後選到新零件）。
function setDesignFocus(id, { fit = true, keepSelection = false } = {}) {
  S.designFocus = id;
  saveFocus();
  if (!inDesign()) return;
  pause();
  Tools.exitDrawLink(); Tools.exitDrawTriangle(); Tools.exitDrawPolygon();
  cancelMotorMode();
  validateViewPlane();
  if (!keepSelection) clearSelectionAndEditors();
  reconcileMotorState();
  const thetaEl = document.getElementById('thetaVal');
  if (thetaEl) thetaEl.textContent = Math.round(norm360(S.theta));
  if (fit) fitView(); else draw();
}
// 預先指定焦點（插入模組時：資料還沒 rebuild，先不畫）；真正的繪製由呼叫端接著做。
function presetDesignFocus(id) {
  if (!inDesign()) return;
  S.designFocus = id;
  saveFocus();
}
// 「＋ 新設計」：沒有根零件就直接給一張空白畫布；已有根零件要先存成模組。
function newDesign() {
  const hasRootParts = compsInFocus(S.comps, S.modules, ROOT_TAB).length > 0;
  setDesignFocus(ROOT_TAB);   // 先切換（會收掉畫圖工具與橫幅），再顯示提示
  if (hasRootParts) transient('先把『未命名設計』存成模組（選取零件 → 🧩 存成模組），再開新設計');
}
function deleteDesign(id) {
  const tab = designTabs(S.comps, S.modules, focusOpts()).find(t => t.id === id);
  if (!tab) return;
  const mod = S.modules.find(m => m.id === id);
  if (mod?.mount || S.modules.some(m => m.mount?.to?.module === id)) {
    window.alert('這組設計已有組立連接。請先到組立台拆下它與相連模組，再刪除；其他設計不會被連帶刪除。');
    return;
  }
  if (!window.confirm(`刪除「${tab.label}」及其 ${tab.count} 個零件？其他設計會保留，可按復原還原。`)) return;
  pause(); pushUndo();
  const removed = new Set(compsInFocus(S.comps, S.modules, id));
  const remaining = S.comps.filter(c => !removed.has(c));
  const retainedParams = new Set(remaining.flatMap(c => ownedParamKeys(c)));
  removed.forEach(c => ownedParamKeys(c).forEach(k => { if (!retainedParams.has(k)) delete S.topo.params[k]; }));
  S.comps = remaining;
  S.modules = S.modules.filter(m => m.id !== id);
  const points = pointIdsOf(remaining);
  S.topo.tracePoints = (S.topo.tracePoints || []).filter(p => points.has(p));
  if (!points.has(S.topo.tracePoint)) S.topo.tracePoint = '';
  if (!points.has(S.topo.referencePoint)) S.topo.referencePoint = '';
  knownCompIds = new Set(remaining.map(c => c.id));
  S.designFocus = resolveFocus(S.comps, S.modules, S.designFocus);
  clearSelectionAndEditors();
  rebuild(); setDesignFocus(S.designFocus);
}
// M2：接合面工具。啟動時舞台只接受點目標與平移／縮放（見 mate-tool.js）；換分頁、切模式、開始畫圖、載入／清空都會關掉。
const mateTool = createMateTool({
  scheduleAutosave,
  svg, module: focusModule, points: () => lastFullPts, pushUndo, rebuild, draw, transient, pause,
  clearSelection: clearSelectionAndEditors, fit: () => fitForMate(),
  busy: () => !!(S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars || S.dragShape)
});
function fitForMate() {   // 置中時多留箭頭的位置：箭頭是固定畫面大小，邊界換成世界 mm 要隨縮放重算幾次
  const b = currentBounds();
  if (!b) { fitView(); return; }
  let pad = 0;
  for (let i = 0; i < 3; i++) {
    View.fit({ minX: b.minX - 24 - pad, maxX: b.maxX + 24 + pad, minY: b.minY - 24 - pad, maxY: b.maxY + 24 + pad });
    pad = (mateTool.reach() + 6) / (View.getScale() * (svg.getScreenCTM()?.a || 1));
  }
  draw();
}
const designTabsUi = createDesignTabs({
  el: () => document.getElementById('designTabs'),
  tabs: () => designTabs(S.comps, S.modules, focusOpts()),
  focus: () => S.designFocus,
  active: inDesign,
  onFocus: id => setDesignFocus(id),
  onDelete: deleteDesign,
  onNew: newDesign
});
function setViewPlane(id) {
  if (inDesign()) {
    // 設計模式沒有「平面」切換，只有分頁：進入某直角模組的平面＝聚焦那個模組；回主視圖＝聚焦它的宿主。
    const mod = focusModule();
    const host = mod && mod.mount && (mod.mount.orient || mod.mount.face) ? mod.mount.to.module : null;
    setDesignFocus(id || host || S.designFocus);
    return;
  }
  const next = id || null;
  S.viewPlane = next;
  validateViewPlane();
  // 選取的零件若不在新平面就取消選取，避免面板指著看不到的零件。
  const selMod = selectionModule(S.comps, { linkId: S.selectedLinkId, triangleId: S.selectedTriangleId, sliderId: S.selectedSliderId, gearId: S.selectedGearId, nodeId: S.selectedNodeId });
  const hasSel = S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId || S.selectedGearId || S.selectedNodeId;
  if (hasSel && planeOf(S.comps, S.modules, selMod) !== S.viewPlane) clearSelectionAndEditors();
  draw();
  fitView();
}
// 目前視圖要畫的側影帶。compute(P) 以點表 P 重算多邊形（播放每幀更新用）；無法算出回 null。
function viewBands(pts) {
  const bands = [];
  if (!pts || !hasOrthogonalModules() || inDesign()) return bands;   // 設計模式只畫焦點分頁，不畫側影帶
  S.modules.forEach(M => {
    const orient = M.mount && M.mount.orient;
    if (!orient) return;
    const hostId = M.mount.to.module;
    if (planeOf(S.comps, S.modules, hostId) === S.viewPlane) {
      // 主視圖（或宿主所在平面）：子模組投影成一條帶。
      const compute = P => orthogonalBand(S.comps, S.modules, M.id, P, ORTHO_STACK_MM, S.topo.params, { asm: S.assembly, joint: jointSettingsNow() });
      const polygon = compute(pts);
      if (polygon) bands.push({ kind: 'child', id: M.id, label: `${M.name}（側影）`, polygon, compute, target: M.id });
    } else if (S.viewPlane === M.id) {
      // 子視圖：宿主在子平面裡畫成側影帶，點它回宿主平面。
      const host = S.modules.find(m => m.id === hostId);
      // C1：宿主邊可以是桿、三角板的邊或機架板的邊
      const hostEdge = orthogonalHostEdge(S.comps, S.modules, M.mount, pts, S.topo.params, { asm: S.assembly, joint: jointSettingsNow() });
      if (!hostEdge) return;
      const output = host && (host.outputs || []).find(o => o.id === M.mount.to.output);
      const edgeName = output ? output.name : (hostEdge.compId || '機架');
      const off = Number.isFinite(orient.offsetMm) ? orient.offsetMm : 0;   // 子模組沿邊滑動後，邊中點在 s = -off
      const standing = orient.edge === 'child';   // D3：子模組立在宿主板面上：宿主的板身在站立邊線下方（t∈[-板厚, 0]）
      const t0 = orient.side === -1 ? 0 : -HOST_BAND_MM, t1 = orient.side === -1 ? HOST_BAND_MM : 0;
      const compute = P => {
        const f = orthogonalFrame(S.comps, S.modules, M.id, P, S.topo.params, { asm: S.assembly, joint: jointSettingsNow() });
        const he = orthogonalHostEdge(S.comps, S.modules, M.mount, P, S.topo.params, { asm: S.assembly, joint: jointSettingsNow() });
        if (!f || !he) return null;
        const half = Math.hypot(he.b.x - he.a.x, he.b.y - he.a.y) / 2;
        const at = (sv, tv) => ({ x: f.base.x + sv * f.e.x + tv * f.f.x, y: f.base.y + sv * f.e.y + tv * f.f.y });
        if (standing) {
          const sgn = (f.d.x * he.d.x + f.d.y * he.d.y) >= 0 ? 1 : -1;   // face -1 時子模組的 e 與宿主邊方向相反
          const c = -off * sgn, T = hostPlateThickness(S.comps, he);
          return [at(c - half, -T), at(c + half, -T), at(c + half, 0), at(c - half, 0)];
        }
        return [at(-off - half, t0), at(-off + half, t0), at(-off + half, t1), at(-off - half, t1)];
      };
      const polygon = compute(pts);
      if (polygon) bands.push({ kind: 'host', id: M.id, label: `${host.name}・${edgeName}（側影）`, polygon, compute, target: planeOf(S.comps, S.modules, hostId) });
    }
  });
  return bands;
}
function drawBands(pts) {
  const bands = viewBands(pts);
  if (!bands.length) return;
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('data-ortho-layer', '1');
  const defs = document.createElementNS(SVG_NS, 'defs');
  const pat = document.createElementNS(SVG_NS, 'pattern');
  pat.setAttribute('id', 'orthoHatch'); pat.setAttribute('width', 7); pat.setAttribute('height', 7);
  pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('patternTransform', 'rotate(45)');
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', 7); bg.setAttribute('height', 7); bg.setAttribute('fill', '#8e44ad'); bg.setAttribute('fill-opacity', 0.1);
  const ln = document.createElementNS(SVG_NS, 'line');
  ln.setAttribute('x1', 0); ln.setAttribute('y1', 0); ln.setAttribute('x2', 0); ln.setAttribute('y2', 7);
  ln.setAttribute('stroke', '#8e44ad'); ln.setAttribute('stroke-opacity', 0.55); ln.setAttribute('stroke-width', 2);
  pat.appendChild(bg); pat.appendChild(ln); defs.appendChild(pat); layer.appendChild(defs);
  bands.forEach(band => {
    const g = document.createElementNS(SVG_NS, 'g');
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute(band.kind === 'child' ? 'data-ortho-band' : 'data-ortho-host-band', band.id);
    poly.setAttribute('fill', 'url(#orthoHatch)'); poly.setAttribute('stroke', '#8e44ad');
    poly.setAttribute('stroke-width', 1.8); poly.setAttribute('stroke-dasharray', '6 4');
    poly.style.cursor = 'pointer';
    // 加寬的透明命中區（畫在可見多邊形之下）：薄帶也點得到。
    const hit = document.createElementNS(SVG_NS, 'polygon');
    hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', 14); hit.setAttribute('stroke-linejoin', 'round');
    hit.style.cursor = 'pointer'; hit.style.pointerEvents = 'all';
    [hit, poly].forEach(el => {
      el.addEventListener('pointerdown', e => e.stopPropagation());   // 不要被當成點背景而取消選取
      el.addEventListener('click', e => { e.stopPropagation(); setViewPlane(band.target); });
    });
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = band.kind === 'child' ? `${band.label}：點一下進入此模組的平面（正視）` : `${band.label}：點一下回到宿主平面`;
    poly.appendChild(title);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', 12); text.setAttribute('font-weight', 700);
    text.setAttribute('fill', '#6c3483'); text.setAttribute('stroke', '#fff'); text.setAttribute('stroke-width', 3);
    text.setAttribute('paint-order', 'stroke'); text.style.pointerEvents = 'none';
    text.textContent = band.label;
    g.appendChild(hit); g.appendChild(poly); g.appendChild(text); layer.appendChild(g);
    const update = P => {
      const polygon = band.compute(P);
      g.style.display = polygon ? '' : 'none';
      if (!polygon) return;
      const ptsAttr = polygon.map(q => `${TX(q.x)},${TY(q.y)}`).join(' ');
      poly.setAttribute('points', ptsAttr); hit.setAttribute('points', ptsAttr);
      const cx = polygon.reduce((a, q) => a + q.x, 0) / polygon.length;
      // 標籤放在帶子下緣之外（畫面座標），不遮住斜線。
      text.setAttribute('x', TX(cx)); text.setAttribute('y', Math.max(...polygon.map(q => TY(q.y))) + 15);
    };
    update(pts); frameUpdaters.push(update);
  });
  svg.appendChild(layer);
}
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
// 有模組時候選逐一比對：跨模組（D2）的候選要略過，不能只檢查最終挑到的那個。
const nearestDisplayTo = (id, exclude = []) => {
  const m = displayCoords();
  const d = m[id];
  if (!d) return null;
  const maxDist = snapWorld();
  const excludeSet = [id, ...exclude];
  let best = null, bestD = maxDist;
  for (const cid in m) {
    if (isHiddenSliderRailPoint(cid)) continue;
    if (excludeSet.includes(cid)) continue;
    if (S.modules.length && !canMergePoints(S.comps, id, cid)) continue;
    const dist = Math.hypot(m[cid].x - d.x, m[cid].y - d.y);
    if (dist < bestD) { bestD = dist; best = cid; }
  }
  return best;
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
const { gearById, gearMeshChain, gearMeshOff, syncGearMeshAnchoredAt, selectGear, deselectGear, startGearManualRotate,
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
        motorBarForCenter, motorTypeForCenter, inputRockRange: baseInputRockRange, configureMotorMount, setMotorWorldMount, setMotorOrientation, toggleMotorReverse } = motorTools;
gripperController = createGripperController({
  getComps: () => S.comps,
  getParams: () => S.topo.params,
  rebuild,
  draw,
  pause,
  pushUndo,
  fitView,
  isEditing: () => Boolean(view3DActive || S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId || S.selectedGearId || S.selectedNodeId),
  setPose: (theta, motor) => {
    if (String(S.activeMotor) !== String(motor)) activateMotor(motor, theta);
    else S.theta = theta;
    S.topo.params.theta = theta;
    document.getElementById('thetaVal').textContent = Math.round(norm360(theta));
    draw();
  },
  getSnapshot: () => Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()),
  notify: transient
});
const inputRockRange = () => gripperController?.isActive()
  ? gripperController.range()
  : baseInputRockRange();
const gripperObject = createGripperObject({
  svg, project: p => ({ x: TX(p.x), y: TY(p.y) }), worldFromEvent,
  getReference: () => gripperController.reference(), getComps: () => S.comps,
  isEditing: () => Boolean(S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId || S.selectedGearId || S.selectedNodeId || S.drawingLink || S.drawingTriangle || S.drawingPolygon),
  previewWidth: value => gripperController.previewWidth(value), commitWidth: value => gripperController.commitWidth(value),
  cancelPreview: () => gripperController.cancelPreview(), pause
});

// ---- 三點桿 / 板件域：邏輯抽到 ./plate-editor.js（Panels / plate-geometry 由該模組自行 import）----
const plateEditor = createPlateEditor({
  svg, pushUndo, pause, rebuild, draw, cancelMotorMode, deselectGear, openMobileEditPanel,
  setSliderDetailRows, setBanner, snapLego, worldFromEvent, pointCoords, updatePointCoordsById
});
const { selectTriangle, startShapeDrag, deleteShapeVertex, updatePlateShapeControls,
        setTriangleShapeMode, addTriangleOutlinePoint,
        triParamFor, setTriSide, changeTriSide } = plateEditor;
const memberEditor = createMemberEditor({
  pause, pushUndo, rebuild, draw, reshapeTriangle: plateEditor.reshapeTriangle,
  updatePointCoordsById, notify: transient, holeDiameter: comp => memberHoleDiameter(comp, Settings.exportSettings())
});
const jawTipHandle = createJawTipHandle({ svg, project: p => ({ x: TX(p.x), y: TY(p.y) }), worldFromEvent,
  editor: memberEditor, getParams: () => S.topo.params });
// ---- 模組拖曳安裝（D9）：邏輯在 ./module-drag.js；points() 取 draw()／renderFrame() 最近一次的求解點 ----
let lastFramePts = null;
const moduleDrag = createModuleDrag({
  svg, project: p => ({ x: TX(p.x), y: TY(p.y) }), worldFromEvent,
  // getScale() 是「svg user units / 世界 mm」；螢幕 px 再乘 CTM 才換得回世界長度。
  snapRadiusWorld: () => (mobilePrompt() ? 36 : 28) / (View.getScale() * (svg.getScreenCTM?.()?.a || 1)),
  pause, pushUndo, rebuild, draw, notify: transient,
  currentModuleId: () => selectionModule(S.comps, { linkId: S.selectedLinkId, triangleId: S.selectedTriangleId, sliderId: S.selectedSliderId, gearId: S.selectedGearId, nodeId: S.selectedNodeId }),
  points: () => lastFramePts,
  motorState: () => ({ activeMotor: String(S.activeMotor), theta: S.theta, motorAngles: S.motorAngles })
});

// ---- 節點角色域：邏輯抽到 ./node-editor.js（Panels 由該模組自行 import）----
const nodeEditor = createNodeEditor({
  pushUndo, pause, rebuild, draw, setBanner, transient, scheduleAutosave,
  hasPoint, pointCoords, pointIsGround, updatePointCoordsById, snapFramePoint, syncGearMeshAnchoredAt,
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

// ---- 模組域：邏輯抽到 ./module-editor.js（模組庫 + 模組面板，M1c 刀 2）----
const moduleEditor = createModuleEditor({
  pushUndo, rebuild, draw, transient,
  downloadJson: (obj, name) => Store.downloadJson(obj, name),
  viewCenter: () => View.worldFromScreen(W * 0.5, H * 0.5),
  loadLibraryText: () => { try { return localStorage.getItem('cadcam.blocks.moduleLibrary'); } catch (_) { return null; } },
  saveLibraryText: text => { try { localStorage.setItem('cadcam.blocks.moduleLibrary', text); } catch (_) {} },
  select: (...a) => selectModuleTarget(...a),   // 延遲取用：selectLink 在後面才定義
  setViewPlane: id => setViewPlane(id),
  focusModule: id => presetDesignFocus(id),   // H1：插入模組後設計模式切到新模組的分頁
  fitToFocus: () => { validateViewPlane(); reconcileMotorState(); fitView(); }   // 新焦點的馬達清單也要跟著換
});
// ---- 組立台（SDD-ASSEMBLY-BENCH B3～B5）：邏輯在 ./bench-ui.js；這裡只提供狀態與 3D 的接線 ----
// 取消預覽時還原到接上前的快照；undoLen 之後（預覽與預覽中的調整）累積的復原紀錄一併丟掉。
function restoreBenchSnapshot(snap, undoLen) {
  const theta = S.theta;
  const norm = Store.normalizeSnapshot(JSON.parse(snap));
  if (norm) applySnapshot(norm, { recordUndo: false, fit: false, source: 'undo' });
  if (Number.isFinite(undoLen)) S.undoStack.length = Math.min(S.undoStack.length, undoLen);
  updateUndoBtn();
  S.theta = theta; S.topo.params.theta = theta;   // 取消預覽不該把姿勢歸零
  draw();
}
// ---- M4 接合精靈的預覽：候選的零件／模組不寫進 S（不進復原、不存檔），只在重畫與干涉檢查的當下暫時換進去 ----
const derivedNow = () => ({ comps: S.comps, modules: S.modules, compiled: S.compiled, assembly: S.assembly, params: S.topo.params });
const putDerived = d => { S.comps = d.comps; S.modules = d.modules; S.compiled = d.compiled; S.assembly = d.assembly; S.topo.params = d.params; };
// 設定候選；回傳整理過（正規化、剛體重算，與 rebuild 同順序）的 { comps, modules }。null＝取消預覽。
function setCandidate(c) {
  lastSolved = {}; prevSolved = {}; geomVersion++;
  if (!c) { candidate = null; return null; }
  const comps = structuredClone(c.comps);   // 複製：rebake 會就地改零件，不能動到真的作品
  let modules = structuredClone(c.modules);
  const nm = normalizeModules(modules, comps);
  if (nm.ok) modules = nm.modules;
  const rb = rebakeModules(comps, modules, S.topo.params);
  if (rb.changed) { rb.comps.forEach((x, i) => Object.assign(comps[i], x)); modules = rb.modules; }
  const compiled = compileTopology(comps, S.topo, new Set());
  candidateOf = { comps: S.comps, modules: S.modules };   // 預覽是從哪份真作品算出來的
  candidate = { comps, modules, compiled, assembly: modules.length ? compileAssembly(comps, modules, S.topo) : null, params: { ...compiled.params, theta: S.topo.params.theta } };
  return { comps, modules };
}
function withCandidate(fn) {
  if (!candidate || inCandidate) return fn();
  if (S.comps !== candidateOf.comps || S.modules !== candidateOf.modules) {   // 預覽期間真作品被復原／讀檔／刪除換掉了：預覽作廢
    candidate = null; lastSolved = {}; prevSolved = {}; geomVersion++;
    const r = fn(); bench.syncUI(true); return r;
  }
  const real = derivedNow(), theta = real.params.theta;
  putDerived(candidate); S.topo.params.theta = theta; inCandidate = true;
  try { return fn(); }
  finally { candidate = derivedNow(); real.params.theta = S.topo.params.theta; inCandidate = false; putDerived(real); }
}
async function set3D(on) { if (view3DActive !== !!on) await toggle3D(); }
const bench = createBench({
  deleteDesign, pause, setCandidate, withCandidate, inCandidate: () => inCandidate,
  pushUndo, rebuild, draw, transient, setViewPlane: id => setViewPlane(id),
  saveComposite: id => moduleEditor.saveCompositeToLibrary(id),   // B7
  exportComposite: id => moduleEditor.exportComposite(id),
  motorState: () => ({ activeMotor: String(S.activeMotor), theta: S.theta, motorAngles: S.motorAngles }),
  snapshotStr, restoreSnapshot: restoreBenchSnapshot, scheduleAutosave,
  getViewer: () => viewer3D, is3DActive: () => view3DActive, set3D, push3D: () => push3D(),
  // H1：組立 → 設計：焦點換成組立台選的模組（沒有就維持原本的分頁）。
  enterDesign: changed => { validateViewPlane(); reconcileMotorState(); saveFocus(); if (changed) fitView(); else draw(); },
  enterBench: () => { mateTool.reset(); reconcileMotorState(); },   // 組立台要恢復所有模組的馬達控制；接合面工具只在設計模式
  // B6：即時干涉用——目前作品的檢查參數（含各馬達行程），以及全行程時間軸點擊後把全部馬達設到指定角度。
  interferenceArgs: () => {
    const settings = { ...Settings.exportSettings(), drive: S.fabrication?.drive || FABRICATION_DEFAULTS.drive };
    return {
      comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: settings,
      cnc: S.fabrication?.cnc || FABRICATION_DEFAULTS.cnc, mounts: homeMountsNow(), ranges: currentMotorRanges(),
      joint: jointSettingsNow()   // F1：角碼規格
    };
  },
  setMotorAngles: angles => {
    pause();
    Object.keys(angles).forEach(id => {
      if (String(id) === String(S.activeMotor)) S.theta = angles[id]; else S.motorAngles[String(id)] = angles[id];
    });
    S.topo.params.theta = S.theta;
    const tv = document.getElementById('thetaVal');
    if (tv) tv.textContent = Math.round(norm360(S.theta));
    draw();
  }
});
// 依零件 type 把新插入模組的第一個零件選起來，沿用各域既有的 selectXxx。
function selectModuleTarget(comp) {
  if (comp.type === 'bar') selectLink(comp.id);
  else if (comp.type === 'triangle') selectTriangle(comp.id);
  else if (comp.type === 'gear') selectGear(comp.id);
  else if (comp.type === 'slider') selectSlider(comp.id);
}

// 隱性機架：所有 grounded 接點（fixed / motor / linear）視為同一個固定底座（機架）。
// 不是獨立物件，只是把散落的固定銷當成一組——拖機架把手時整組一起平移。
// 點 key 的掃描集中在 model.js（依 part-types 表），app 只負責把結果畫出來。
// 世界機架排除已安裝模組零件（SDD-ASSEMBLY-MODULES §4.2）：否則拖機架會把裝在宿主上的模組底座一起搬走。
function frameNodeIds() { return Model.frameNodeIds(worldFrameComps(inDesign() && S.modules.length ? viewComps() : S.comps, S.modules)); }   // 設計模式只動焦點分頁自己的固定銷
// 機架上各固定銷的座標（固定點不隨求解移動，直接用元件座標）。x 排序方便連線。
function frameNodes() { return Model.frameNodes(worldFrameComps(S.comps, S.modules)); }
// 機架「視覺」用的固定銷：排除滑塊自己的 rail 端點（p1/p2），保留 mount 點（m1/m2）。
// m1/m2 是真正鎖在機架上的孔；急回/滑塊範例需要把它們和曲柄軸畫成同一塊底座。
// 注意：移動仍以 frameNodeIds() 為準，滑塊照樣跟著走。
function frameConnectorNodes() { return Model.frameConnectorNodes(machineFrameComps(S.comps, S.modules)); }   // M5a：未安裝的機構不撐大機架板（設計分頁看自己的另走 viewFrameNodes）

// syncSliderGeometries（滑軌幾何同步）已隨滑軌域移到 ./slider-editor.js

function rebuild() {
  syncSliderGeometries();
  adoptNewComps();               // H1：焦點是模組時，新畫的零件歸到那個模組
  // 模組正規化：清掉零件已被刪光的模組、失效的輸出與安裝（只取 modules，comps 仍用 S.comps 原參照）。
  if (S.modules.length) {
    const nm = normalizeModules(S.modules, S.comps);
    if (nm.ok) S.modules = nm.modules;
  }
  // rebake：宿主位姿變了就把子模組座標剛體平移／旋轉，維持 I1（就地寫回，保留零件物件參照）。
  if (S.modules.length) {
    const rb = rebakeModules(S.comps, S.modules, S.topo.params);
    if (rb.changed) {
      rb.comps.forEach((c, i) => Object.assign(S.comps[i], c));
      S.modules = rb.modules;
    }
  }
  S.compiled = compileTopology(S.comps, S.topo, new Set());
  if (S.modules.some(m => m.mount?.face)) {
    const refreshed = refreshFaceMounts(S.comps, S.modules, S.topo.params, { exportSettings: Settings.exportSettings(), stockMm: Number(S.fabrication?.cnc?.stockThicknessMm) || FABRICATION_DEFAULTS.cnc.stockThicknessMm });
    S.modules = refreshed.modules;
    if (refreshed.warnings.length) transient(refreshed.warnings[0]);
  }
  S.topo.params = S.compiled.params; // 沿用補齊後的參數
  // 雙軌：求解改讀這份，繪製仍讀 S.compiled；沒有模組時維持 null，求解走原本的 S.compiled（不重複編譯）。
  S.assembly = S.modules.length ? compileAssembly(S.comps, S.modules, S.topo) : null;
  lastSolved = {};               // 拓撲變了：丟掉舊解，避免拿到不相干的種子
  prevSolved = {};
  geomVersion++;                 // 結構/參數變了：讓軌跡快取失效（getTrajectoryData 重算）
  validateViewPlane();           // 先確定載入／刪除後的設計分頁，馬達控制才不會沿用隱藏模組。
  reconcileMotorState();         // 馬達被刪 / 改指派後：清掉殘留凍結角、控制權交回存在的馬達
  gripperController?.recompute();
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
  // H1：設計模式只提供焦點分頁自己的馬達；控制中的不在其中就換成這頁的第一顆。
  const own = designMotorIds();
  if (own.size && !own.has(String(S.activeMotor))) {
    const first = [...own].sort((a, b) => Number(a) - Number(b))[0];
    activateMotor(first, Number(S.motorAngles[first]) || 0);
  }
  updateMotorSwitcher();
}

// 控制列的馬達切換 chips：≥2 顆馬達才顯示；點一下把控制權交給那顆（其他凍結在原角度）。
function updateMotorSwitcher() {
  const box = document.getElementById('motorSwitch');
  if (!box) return;
  const ids = [...designMotorIds()].sort((a, b) => Number(a) - Number(b));
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
  let ids = traceIds();
  // S4：預設點是固定／馬達軸心就不畫，避免「工作範圍 0 mm」的假量測。
  if (!ids.length && S.compiled) ids.push(...Motion.fallbackTraceIds(S.comps, S.compiled.tracePoint));
  const planeIds = viewPointIds();
  if (planeIds) ids = ids.filter(id => planeIds.has(id));   // 只畫目前平面的追蹤點
  const normalIds = new Set(ids);
  const swept = viewComps().find(c => c.id === sweepMemberId && ['bar', 'triangle'].includes(c.type));
  if (swept && !ids.length) ids.push(swept.p1.id);
  if (!S.compiled || !ids.length || !S.comps.length) return null;
  // 快取鍵＝結構版本號 geomVersion，取代每幀 JSON.stringify 整份快照（零件多時字串化本身會變慢）。
  // 軌跡只取決於 S.compiled 與 traceIds，兩者都只在 rebuild / 切換軌跡點變動、那兩處都會 +1，
  // 故版本號是完整且正確的失效訊號。多馬達後軌跡還取決於「掃哪顆馬達＋其他馬達凍在哪」，一併入鍵。
  const motorKey = String(S.activeMotor) + '|' + JSON.stringify(S.motorAngles) + '|' + (inDesign() ? 'f:' + S.designFocus : (S.viewPlane || '')) + '|' + ids.join(',') + '|' + [...normalIds].join(',');
  if (trajectoryCache && trajectoryCache.version === geomVersion && trajectoryCache.motorKey === motorKey) return trajectoryCache.data;
  // 伺服與線性致動器只在自己的有限行程內運動；量測不應誤把不存在的整圈算進去。
  const range = inputRockRange();
  const thetaStart = range ? range.lo : 0;
  const thetaEnd = range ? range.hi : 360;
  // S2：軌跡點共用同一份 compiled，只 sweep 一次（traceSweeps 內部處理），不再逐點各掃一次。
  const params = { ...(S.compiled.params || S.topo.params || {}), motorAngles: frozenMotorAngles(), sweepMotor: String(S.activeMotor) };
  let data;
  try {
    // S2b：範圍太窄（如夾爪 3.8°）時 5° 取不到足夠取樣點，改用 traceSweepRange 算出的步長。
    const { start, end, step } = Motion.traceSweepRange(thetaStart, thetaEnd);
    data = S.assembly
      ? Motion.traceSweeps(S.compiled, params, ids, start, end, step, (c, p, s, e, st) => sweepAssembly(S.assembly, p, s, e, st))
      : Motion.traceSweeps(S.compiled, params, ids, start, end, step);
  } catch (_) {
    data = [];
  }
  data.forEach(trace => { trace.sweepOnly = !normalIds.has(trace.id); });
  trajectoryCache = { version: geomVersion, motorKey, data };
  return data.length ? data : null;
}

function drawMemberSweep(data) {
  const member = viewComps().find(c => c.id === sweepMemberId && ['bar', 'triangle'].includes(c.type));
  if (!member) return;
  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.memberSweep = member.id;
  group.style.pointerEvents = 'none';
  group.setAttribute('stroke', member.color || '#3498db');
  group.setAttribute('stroke-opacity', '0.14');
  group.setAttribute('stroke-width', '3');
  memberSweepSegments(data?.[0]?.results, member.p1.id, (member.type === 'triangle' ? member.p3 : member.p2).id).forEach(({ a, b }) => {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', TX(a.x)); line.setAttribute('y1', TY(a.y));
    line.setAttribute('x2', TX(b.x)); line.setAttribute('y2', TY(b.y));
    group.appendChild(line);
  });
  svg.appendChild(group);
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
  const planeIds = viewPointIds();
  const ids = traceIds().filter(id => !planeIds || planeIds.has(id));
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
  const frameParams = { thetaDeg: S.theta, motorAngles: motorAnglesNow(), _prevPoints: seed };
  try { sol = S.assembly ? solveAssembly(S.assembly, frameParams) : solveTopology(S.compiled, frameParams); } catch (_) {}
  const solved = (sol && sol.isValid !== false && sol.points) ? sol.points : {};
  // 無效解整幀不採用，避免新舊接點混合而拉伸剛性零件；保留上一姿態。
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
  const mobility = S.comps.length ? analyzeDof(S.comps) : null;
  if (S.comps.length) {
    title = mobility.mobilityOverride
      ? `組裝自由度：F = ${mobility.dof}（一般公式 ${mobility.formulaDof}；平行冗餘約束已校正）`
      : `理論自由度：F = ${mobility.dof}（剛體 ${mobility.bodies}、低副 ${mobility.lowerPairs}、高副 ${mobility.higherPairs}）`;
    const unsolvedIds = sol !== null ? unsolvedMovingPoints(S.comps, sol) : [];   // S3 漏解警示：只算一次
    if (gripperController?.isActive() && !gripperController.currentPlan().ok) {
      state = 'error';
      text = '夾爪任務待修正，請查看任務卡';
      title = gripperController.currentPlan().message;
    } else if (gearMeshHasWarning()) {
      state = 'error';
      text = '齒輪沒有咬合，請調整位置';
    } else if (sol?.isValid === false) {
      state = 'error';
      text = '目前角度無解，可先復原最後一次修改';
    } else if (mobility.dof < 0) {
      state = 'error';
      text = '接點限制太多，機構可能卡住';
    } else if (mobility.dof === 0) {
      state = 'static';
      text = '目前是固定結構，沒有活動接點';
    } else if (!hasDriveSource()) {
      state = 'warn';
      text = mobility.dof === 1 ? '可以活動了：把動力來源放到轉軸' : '還太鬆：固定接點，或把孔接起來';
    } else if (S.compiled && sol === null && (S.compiled.steps || []).length) {
      state = 'error';
      text = '目前解不出動作，請檢查接點';
    } else if (unsolvedIds.length) {
      // S3 漏解警示：solver 回報有效，但有些會動的接點沒被解出來，停在原位卻沒提示。
      state = 'warn';
      text = `有 ${unsolvedIds.length} 個接點沒有被帶動（停在原位）`;
      title = `${title}\n沒有被帶動的接點：${unsolvedIds.join('、')}`;
    } else if (mobility.dof === 1) {
      state = 'ready';
      text = '可以播放了';
    } else if (mobility.inputs >= mobility.dof) {
      // 多自由度但每個自由度都有馬達管：一次控制一顆、其他凍結，動作仍完全可預測。
      state = 'ready';
      text = `${mobility.inputs} 組動力已就緒，可以播放`;
    } else {
      state = 'warn';
      text = '還有未控制的活動部分，請補連接或動力';
    }
  }
  el.dataset.state = state;
  el.textContent = text;
  el.title = title;
  const feedback = getTeachingFeedback({ comps: S.comps, sol, compiled: S.compiled,
    hasDrive: hasDriveSource(), gearWarning: gearMeshHasWarning(), dof: mobility });
  if (['error', 'warn', 'static'].includes(state)) el.title += '\n' + feedback.message;
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
    onSelect: id => { if (ensureModuleHome(compModuleId(id))) return; selectGear(id); }, onRotate: startGearManualRotate
  });
  if (update) frameUpdaters.push(update);
}
function drawGearManualHandles(pts) {
  renderGearManualHandles({
    gears: viewComps().filter(c => c.type === 'gear'), points: pts, svg,
    scale: View.getScale(), project: p => ({ x: TX(p.x), y: TY(p.y) }),
    selectedGearId: S.selectedGearId, onRotate: startGearManualRotate,
    registerUpdate: update => frameUpdaters.push(update)
  });
}
// 三點桿：用圓角三角板呈現，同時仍保留每條邊/孔位的求解語法。phase 'layered'：畫進
// draw() 依 zlift 算好的疊放層（透過 ctx.groupForLayer/triLayerByKey/triKey 取得對應 <g>）。
// 函式體照搬自原 draw() 內聯三角板迴圈、零行為改變（內部解構改名 a,b,d 以免遮蔽參數 c）。
function drawTrianglePart(c, pts, ctx) {
  c = memberEditor.displayComp(c);
  const hostedPlateMounts = ctx.hostedMounts ? ctx.hostedMounts.get(c.id) : null;
  const plateExtras = (hostedPlateMounts && hostedPlateMounts.length)
    ? Exporters.plateMountExtras(hostedPlateMounts) : null;
  renderPlate({
    component: c, points: pts, ctx, svg, scale: View.getScale(),
    project: p => ({ x: TX(p.x), y: TY(p.y) }), selectedId: S.selectedTriangleId,
    interactionBlocked: () => Boolean(S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars),
    onSelect: id => { if (ensureModuleHome(compModuleId(id))) return; selectTriangle(id); }, shapeMode: plateShapeMode, plateExtras,
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

function draw() { return withCandidate(drawNow); }   // M4：接合精靈預覽中，重畫看的是候選的作品
function drawNow() {
  mateTool.sync();   // M2：換分頁／模式或開始畫圖時關掉接合面工具，並更新按鈕
  syncModulePlates();   // G1：作品內容變了才讓固定板 home 幾何作廢（θ 不算內容）
  validateViewPlane();
  designTabsUi.render();   // H1：設計分頁列
  document.getElementById('hint').style.display = viewComps().length ? 'none' : 'block';   // 焦點分頁是空的也要提示
  const planeHint = document.getElementById('viewPlaneHint');
  if (planeHint) {
    const viewMod = S.viewPlane ? S.modules.find(m => m.id === S.viewPlane) : null;
    planeHint.textContent = viewMod ? `正在編輯「${viewMod.name}」的平面（正視）` : '';
    planeHint.style.display = viewMod ? 'block' : 'none';
  }
  clearOffHomeModuleSelection();
  memberEditor.sync();
  const sweepControl = document.getElementById('memberSweepControl');
  const sweepSelected = viewComps().find(c => (c.id === S.selectedLinkId && c.type === 'bar') || (c.id === S.selectedTriangleId && c.type === 'triangle'));
  sweepControl.hidden = !sweepSelected;
  document.getElementById('memberSweepLabel').textContent = sweepSelected?.type === 'triangle' ? '顯示掃動範圍（第 1–3 孔）' : '顯示掃動範圍';
  sweepControl.title = sweepSelected?.type === 'triangle' ? '顯示第 1 孔到第 3 孔的掃動範圍（雨刷範例為 B–E）；不是實體刷片面積。' : '顯示桿件兩端的掃動範圍；不是實體刷片面積。';
  document.getElementById('memberSweepToggle').checked = !!sweepSelected && sweepMemberId === sweepSelected.id;
  if (sweepMemberId && !S.comps.some(c => c.id === sweepMemberId && ['bar', 'triangle'].includes(c.type))) sweepMemberId = null;
  moduleEditor.sync();
  bench.syncUI();   // 組立台：模組清單與接法面板（非組立模式時直接略過）
  gripperController?.syncVisibility();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  drawFrameGrid();
  frameUpdaters = [];
  sliderLayer = null;
  recountBanner = null;
  if (!S.compiled || !S.comps.length) {
    // 機構已清空：作廢上一機構的模型快照。否則 drawGround() → motorFrameExportMounts()
    // 的預設參數會撿到舊 lastModelInputs 裡已刪馬達的安裝座，畫出一塊幽靈機架板。
    lastModelInputs = null;
    lastFullPts = null;
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

  const { pts: allPts, sol } = solveFrame();
  lastFullPts = allPts;
  // 目前平面：只畫這個平面的零件與點；solve／播放仍是全域（O3、O-D3）。
  const vComps = viewComps();
  const vIds = viewPointIds();
  const pts = filterToView(allPts, vIds);
  lastFramePts = pts;
  updateMechanismStatus(sol);
  const vis0 = S.compiled.visualization || { links: [], polygons: [] };
  const viewCompiled = !vIds ? S.compiled : {
    ...S.compiled,
    visualization: {
      ...vis0,
      links: (vis0.links || []).filter(l => vIds.has(l.p1) && vIds.has(l.p2)),
      polygons: (vis0.polygons || []).filter(pg => (pg.points || []).every(id => vIds.has(id)))
    }
  };

  // 全域（所有平面）的馬達中心：安裝座與匯出／3D 輸入維持全域，只有「畫什麼」依平面過濾。
  const sceneIdsAll = collectSceneIds({ compiled: S.compiled, comps: S.comps, motorPointIds: Model.motorPointIds(S.comps) });
  const allModelMotorIds = sceneIdsAll.modelMotorCenterIds;
  const sceneIds = collectSceneIds({ compiled: viewCompiled, comps: vComps, motorPointIds: Model.motorPointIds(vComps) });
  if (vIds) {
    sceneIds.motorCenterIds = new Set([...sceneIds.motorCenterIds].filter(id => vIds.has(id)));
    sceneIds.modelMotorCenterIds = new Set([...sceneIds.modelMotorCenterIds].filter(id => vIds.has(id)));
  }
  const { groundIds, motorCenterIds, modelMotorCenterIds, camCenterIds } = sceneIds;
  const motorMounts = buildMotorMounts(allModelMotorIds, groundIds);
  // 地基：用「當前」pts＋mount 算共用 frameGeometry（放馬達即變形），畫在最底層。
  // 已宣告宿主機架桿的 mount 不進地基——特徵切在宿主桿身上，2D 桿身照合併外形畫（見連桿迴圈）。
  const mountSplit2d = Exporters.splitMountsByHost(S.comps,
    motorFrameExportMounts({ pts: allPts, motorCenterIds: allModelMotorIds, motorMounts }));
  const frameGeometry2d = S.viewPlane ? null : Exporters.inspectFrameExport(
    viewFrameNodes(), Settings.exportSettings(), viewMounts(viewWorldMounts(mountSplit2d.free)));
  drawGround(frameGeometry2d);
  // G1：已安裝模組的固定板：主視圖畫同平面（plane null）的，「編輯這個模組」平面視圖畫該平面的；在所有零件之下，播放時跟著模組動。
  if (S.modules.some(m => m && m.mount)) {
    const platesNow = P => modulePlates.at(P, () => motorFrameExportMounts({ pts: pointCoords(), motorCenterIds: allModelMotorIds, motorMounts })).filter(pl => (pl.plane || null) === (S.viewPlane || null) && (!inDesign() || pl.moduleId === S.designFocus));   // 設計模式只畫焦點模組自己的底板
    renderModulePlates({ plates: platesNow(allPts), svg, project: p => ({ x: TX(p.x), y: TY(p.y) }), getPlates: platesNow, registerUpdate: fn => frameUpdaters.push(fn) });
  }
  const renderScene = prepareRenderScene({
    compiled: viewCompiled, comps: vComps, points: pts, frameGeometry: frameGeometry2d, sceneIds,
    computeBodyLayers, motorAssemblyLayerForBody, motorMounts
  });
  const { isGroundBar, triangleEdgeKeys, triangleKey: triKey, bodyLayers, linkLayer, triangleLayerByKey: triLayerByKey } = renderScene;
  drawMotorMountHoles(motorCenterIds, motorMounts, pts);
  const trajectoryData = getTrajectoryData();
  const visibleTraces = trajectoryData?.filter(trace => !trace.sweepOnly);
  drawMemberSweep(trajectoryData);
  drawTraceTrajectory(visibleTraces);
  drawWorkRange(visibleTraces, pts);
  drawManualTrace();

  // 馬達本體是固定在機架背後的動力源，必須先建立在機件 underlay 之下；
  // 否則 2D 會看起來像馬達蓋在齒輪/齒條最前面。
  const motorLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(motorLayer);

  // 零件繪製分派（slice 2 登錄表化）— 'underlay' 機件畫在連桿之下（z 序與原本一致）。
  [...vComps.filter(c => c.type === 'belt'), ...vComps.filter(c => c.type !== 'belt')]
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
  vComps.forEach(c => { const e = PART_DRAW[c.type]; if (e && e.phase === 'layered') e.draw(c, pts, triCtx); });

  // 動力來源本體：畫在桿件底下，曲柄轉在它上面。依型號畫 TT馬達或 MG995 伺服。
  // 朝向＝對準接在馬達中心、非曲柄的那根桿（指向它的另一端）；沒有就朝最近的另一個地錨；都沒有才朝下。
  // 注意：馬達記在「節點」上（point.type='motor'），曲柄那根桿的 isInput 通常仍是 false，
  // 光靠 !c.isInput 排不掉曲柄。改用 input_crank 步驟算出曲柄動端，明確把曲柄那根桿排除。
  // 多馬達：標籤加編號（M1/M2…），控制中的那顆用醒目色，一眼看出現在在動誰。
  const multiMotor = designMotorIds().size > 1;
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
    links: viewCompiled.visualization.links || [], comps: S.comps, points: pts, triangleEdgeKeys, isGroundBar,
    selectedLinkId: S.selectedLinkId, pickBars: S.pickBars,
    interactionBlocked: () => Boolean(S.drawingLink || S.drawingTriangle || S.drawingPolygon),
    onTryPick: tryPickBar,
    onFreeDrag: (e, linkId) => {
      if (ensureModuleHome(compModuleId(linkId))) { e?.preventDefault?.(); e?.stopPropagation?.(); return true; }
      return Input.startFreeLinkDrag(e, linkId);
    },
    onSelect: id => { if (ensureModuleHome(compModuleId(id))) return; selectLink(id); },
    groupForLayer, linkLayer, groundIds, hullRadius: HULL_R_WORLD, scale: View.getScale(),
    barHullPath, project: p => ({ x: TX(p.x), y: TY(p.y) }), hostedMounts: mountSplit2d.hosted,
    holeRadius: Settings.exportSettings().holeDiameterMm / 2,
    inspectHostedFrame: (nodes, mounts, comp) => Exporters.inspectFrameExport(nodes, { ...Settings.exportSettings(), barWidthMm: memberStock(comp).widthMm }, mounts),
    registerUpdate: update => frameUpdaters.push(update)
  });
  updateSolveBanner(sol, countMissingLinks(pts));
  recountBanner = (P, s) => updateSolveBanner(s, countMissingLinks(P));

  // 側影帶（直角安裝的子模組／子視圖裡的宿主）：用全域解 allPts 算，畫在零件之上、節點之下。
  drawBands(allPts);

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
  const gearPinIds = new Set(vComps.filter(c => c.type === 'gear' && c.p2).map(c => c.p2.id));
  const pulleyPinIds = new Set(vComps.filter(c => c.type === 'pulley' && c.p2).map(c => c.p2.id));
  const camFollowerIds = new Set(vComps.filter(c => c.type === 'cam' && c.p2).map(c => c.p2.id));
  const workpieceIds = new Set(vComps.filter(c=>c.type==='workpiece'&&c.p1).map(c=>c.p1.id));
  const hiddenPointIds = new Set(Object.keys(pts).filter(id => isHiddenSliderRailPoint(id) || isSliderMountPoint(id)));
  renderNodes({
    points: pts, svg, groundIds, motorCenterIds, camCenterIds, hiddenPointIds,
    gearPinIds, pulleyPinIds, camFollowerIds, workpieceIds, dragId: S.dragId,
    sliderMountInfo, project: p => ({ x: TX(p.x), y: TY(p.y) }),
    onPointerDown: guardedNodeDown, registerUpdate: update => frameUpdaters.push(update),
    mountedBaseIds: moduleMountedBaseIds(S.comps, S.modules)
  });

  drawGearManualHandles(pts);
  drawFrameHandle();   // 機架移動把手：畫在節點之上，才點得到、拖得動
  const updateMemberDimensions = drawMemberDimensions({
    svg, comp: memberEditor.displayComp(memberEditor.selected()), points: pts, params: S.topo.params,
    selected: S.selectedTriangleId ? S.triSide : 'g', project: p => ({ x: TX(p.x), y: TY(p.y) }),
    onSelect: memberEditor.selectDimension
  });
  if (updateMemberDimensions) frameUpdaters.push(updateMemberDimensions);
  const updateJawTip = jawTipHandle.draw(pts);
  if (updateJawTip) frameUpdaters.push(updateJawTip);
  const updateModuleHandle = moduleDrag.draw(pts);
  if (updateModuleHandle) frameUpdaters.push(updateModuleHandle);
  const updateGripperObject = gripperObject.draw(pts);
  if (updateGripperObject) frameUpdaters.push(updateGripperObject);
  const updateMates = mateTool.render();   // M2：接合面（工具開著＝可點；平常＝淡淡的已標記號）
  if (updateMates) frameUpdaters.push(updateMates);
  Tools.drawDrawPreview();   // 畫桿模式：疊在最上層的拖曳預覽
  Tools.drawTrianglePreview(); // 三點桿模式：疊在最上層的三角預覽
  Tools.drawPolygonPreview();  // 多邊形板模式：疊在最上層的預覽

  // 把這一幀的姿勢同步給 3D 預覽（開著時才推；平面路徑零負擔）
  // polygons 一併帶上：3D 用它把三點桿畫成實心板，並過濾掉與三角板邊重疊的桿（避免分身）。
  // motorCenterIds：3D 把這些中心畫成沉在機構背面的馬達，輸出軸往上帶動曲柄。
  // motorTypes：每個馬達中心的型號（'tt'/'mg995'），讓 3D 也畫出對應外形。
  const motorTypes = new Map();
  allModelMotorIds.forEach(id => motorTypes.set(id, motorTypeForCenter(id)));
  lastModelInputs = buildPreviewModelInputs({
    comps: S.comps, params: S.topo.params, theta: S.theta,
    links: vIds ? [...(S.compiled.visualization.links || [])].sort((a, b) => (a.style === 'crank' ? 1 : 0) - (b.style === 'crank' ? 1 : 0)) : linksToDraw,
    points: allPts, groundIds, motorCenterIds: allModelMotorIds, motorTypes, motorMounts,
    polygons: S.compiled.visualization.polygons || [], sliderTravelStart, sliderTravelEnd,
    sliderBodyLength, rackBodyHeight, rackPhaseShift, pulleyRadius, pulleyPinRadius
  });
  // O6：有直角安裝時另備一份「全平面」輸入（3D 預覽依平面各建場景、再把子平面立起來）。
  lastModelInputsAll = !(hasOrthogonalModules() || (inDesign() && vIds)) ? null : buildPreviewModelInputs({   // 設計模式的 3D 也要全域輸入，再依焦點過濾
    comps: S.comps, params: S.topo.params, theta: S.theta,
    links: [...(S.compiled.visualization.links || [])].sort((a, b) => (a.style === 'crank' ? 1 : 0) - (b.style === 'crank' ? 1 : 0)),
    points: allPts, groundIds: sceneIdsAll.groundIds, motorCenterIds: allModelMotorIds, motorTypes, motorMounts,
    polygons: S.compiled.visualization.polygons || [], sliderTravelStart, sliderTravelEnd,
    sliderBodyLength, rackBodyHeight, rackPhaseShift, pulleyRadius, pulleyPinRadius
  });
  if (view3DActive) push3D();
}

// 8 mm LEGO-hole reference grid. It is deliberately a visual aid only; the
// actual snap remains in snapFramePoint() so all fixed-point editing paths use
// the same constraint.
function drawFrameGrid() {
  if (!S.lockFrameHoles) return;
  const step = LEGO_STEP * View.getScale();
  if (!Number.isFinite(step) || step < 3) return;
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const x0 = mod(TX(0), step), y0 = mod(TY(0), step);
  const dots = document.createElementNS(SVG_NS, 'g');
  dots.setAttribute('aria-label', '8mm reference grid');
  dots.style.pointerEvents = 'none';
  const radius = Math.max(0.7, Math.min(1.4, step * 0.09));
  for (let x = x0; x <= W; x += step) {
    for (let y = y0; y <= H; y += step) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', x.toFixed(2)); dot.setAttribute('cy', y.toFixed(2));
      dot.setAttribute('r', radius.toFixed(2)); dot.setAttribute('fill', '#9fb1c5'); dot.setAttribute('fill-opacity', '0.28');
      dots.appendChild(dot);
    }
  }
  svg.appendChild(dots);
}

// 滑軌繪製：畫進指定 parent。重建（draw）與播放（renderFrame）共用同一段碼，確保零分歧。
function drawSliders(pts, parent) {
  viewComps().filter(c => c.type === 'slider' && c.p1 && c.p2 && c.p3).forEach(sl => {
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
function renderFrame(...a) { return withCandidate(() => renderFrameNow(...a)); }
function renderFrameNow() {
  if (clearOffHomeModuleSelection()) { draw(); return; }
  if (!S.compiled || !S.comps.length || !frameUpdaters.length) { draw(); return; }
  const { pts: allPts, sol } = solveFrame();
  lastFullPts = allPts;
  const pts = filterToView(allPts);
  lastFramePts = pts;
  updateLiveClampDistance(pts);
  frameUpdaters.forEach(fn => fn(allPts));   // 更新器只碰自己的點 id；側影帶要用全域解
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
    if (lastModelInputsAll) {
      const camsAll = (lastModelInputsAll.cams || []).map(c => ({ ...c, thetaDeg: S.theta }));
      lastModelInputsAll = { ...lastModelInputsAll, pts: allPts, cams: camsAll };
    }
    push3D();
  }
}

// 用最近一幀的求解結果建場景模型，推進 3D viewer
function push3D() { return withCandidate(push3DNow); }
function push3DNow() {
  if (!viewer3D || !lastModelInputs) return;
  // 有直角安裝時，主平面場景只用主平面的輸入；其餘平面由 buildOrthogonalChildren 另建並立起來。
  // H1：設計模式的 3D 只畫焦點分頁（直角子模組在自己的平面平放，不立起來）；組立模式照舊畫全部。
  const designView = inDesign() && S.modules.length && lastModelInputsAll;
  const allPlanes = !designView && hasOrthogonalModules() && lastModelInputsAll ? lastModelInputsAll : null;
  const planesApi = designView ? focusInputs(lastModelInputsAll, viewComps()) : allPlanes ? planeInputs(allPlanes, S.comps, S.modules, null) : lastModelInputs;
  const { links, pts, groundIds, motorCenterIds, motorTypes, motorMounts, polygons, sliders, gears, racks, cams, pulleys, belts } = planesApi;
  const mountSplit3d=Exporters.splitMountsByHost(S.comps,motorFrameExportMounts());
  const frameGeometry=designView && S.viewPlane ? null : Exporters.inspectFrameExport(designView ? viewFrameNodes() : frameConnectorNodes(),Settings.exportSettings(),designView ? viewMounts(viewWorldMounts(mountSplit3d.free)) : viewWorldMounts(mountSplit3d.free));
  // 三點桿板形：3D 直接沿用 2D/DXF 共用的 createPlateGeometry 外形（含 shapeMode——
  // 包絡板/多邊形板/折線桿——與 vertices 順序），孔位與加工輸出一致，三視圖不分歧。
  // 以孔序字串為鍵，供 scene-model 對應到各片板；找不到原 comp 的純視覺 polygon 退回夾爪近似。
  // 幾何表以 id 為鍵，各平面的場景共用；有直角安裝時用全平面的點／板，子平面的桿與板才有外形。
  const geomPts = allPlanes ? allPlanes.pts : pts;
  const geomPolygons = allPlanes ? allPlanes.polygons : polygons;
  const plateGeometries={};
  const barGeometries={};
  const memberStocks={};
  // G2：直角安裝的轉接座宿主孔（ADAPTER_HOLE）也要鑽在 3D 的宿主桿上，和匯出的桿件孔一致。
  const adapterBarHoles = allPlanes ? (orthoExtrasNow().linkHoles || {}) : {};
  S.comps.filter(c => c.type === 'bar').forEach(bar => {
    const barId = bar.id, mounts = mountSplit3d.hosted.get(barId);
    if (!bar || !geomPts[bar.p1.id] || !geomPts[bar.p2.id]) return;
    const a = geomPts[bar.p1.id], b = geomPts[bar.p2.id];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const geometry = mounts?.length ? Exporters.hostedBarGeometry(bar, geomPts, Settings.exportSettings(), mounts, adapterBarHoles[barId] || [])
      : Exporters.inspectLinkExport(bar, len, Settings.exportSettings(), adapterBarHoles[barId] || []);
    memberStocks[barId] = memberStock(bar);
    if (!geometry?.outlines?.length) return;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const world = point => ({ x: a.x + point.x * ux - point.y * uy, y: a.y + point.x * uy + point.y * ux });
    barGeometries[barId] = {
      outline: geometry.outlines[0].map(world),
      holes: geometry.holes.map(hole => ({ ...world(hole), r: hole.r })),
      cutouts: (geometry.cutouts || []).map(cutout => ({ ...cutout, points: cutout.points.map(world) }))
    };
  });
  (geomPolygons||[]).forEach(poly=>{
    const world=poly.points.map(id=>geomPts[id]).filter(p=>p&&Number.isFinite(p.x));
    if(world.length<3) return;
    const key=poly.points.join(',');
    const comp=S.comps.find(c=>c.type==='triangle'&&c.p1&&c.p2&&c.p3&&[c.p1.id,c.p2.id,c.p3.id].join(',')===key)
      || (poly.shape==='jaw' ? {shape:'jaw',jawTurnSign:poly.jawTurnSign} : null);
    if(!comp) return;
    // 靜態結構板承載的馬達穿板特徵一併切進 3D 板身（同 2D/DXF）。
    const hostedPlateMounts=comp.id?mountSplit3d.hosted.get(comp.id):null;
    const extras=(hostedPlateMounts&&hostedPlateMounts.length)?Exporters.plateMountExtras(hostedPlateMounts):null;
    memberStocks[key] = memberStock(comp);
    const g=createPlateGeometry(comp,world,{radius:HULL_R_WORLD,holeRadius:Settings.exportSettings().holeDiameterMm/2,...(extras||{})});
    if(g.outlines.length) plateGeometries[key]={outline:g.outlines[0],holes:g.holes,cutouts:g.cutouts||[]};
  });
  const baseOpts = { hullR: HULL_R_WORLD, plateGeometries, barGeometries, memberStocks };
  // G1：已安裝模組的固定板（目前位姿）；主平面的放進主場景，直角子平面的由 buildOrthogonalChildren 放進各自的子場景。
  const plates = modulePlates.at(designView ? lastModelInputsAll.pts : geomPts, homeMountsNow).filter(pl => !designView || pl.moduleId === S.designFocus);
  const model = buildSceneModel(links, pts, {
    ...baseOpts, groundIds, motorCenters: motorCenterIds, motorTypes, motorMounts,
    polygons, sliders, gears, racks, cams, pulleys, belts, frameGeometry
  });
  attachModulePlates(model, S.comps, plates, designView ? (S.viewPlane || null) : null);
  if (allPlanes) {
    // 直角安裝的子模組：在自己的平面建場景（沒有世界機架），再以 4x4 立起來掛在宿主工具上。
    model.orthogonal = buildOrthogonalChildren({
      comps: S.comps, modules: S.modules, inputs: allPlanes, mainModel: model, asm: S.assembly, params: S.topo.params, plates, plan: modulePlates.plan(),
      joint: jointSettingsNow(), stockMm: Number(S.fabrication?.cnc?.stockThicknessMm) > 0 ? Number(S.fabrication.cnc.stockThicknessMm) : FABRICATION_DEFAULTS.cnc.stockThicknessMm,
      buildModel: inp => buildSceneModel(inp.links, inp.pts, {
        ...baseOpts, groundIds: inp.groundIds, motorCenters: inp.motorCenterIds, motorTypes: inp.motorTypes,
        motorMounts: inp.motorMounts, polygons: inp.polygons, sliders: inp.sliders, gears: inp.gears,
        racks: inp.racks, cams: inp.cams, pulleys: inp.pulleys, belts: inp.belts, frameGeometry: null
      })
    });
    // F1：每個直角角碼接合的實體方塊（已在主場景座標），viewer 畫成金屬灰的薄板。
    const boxes = model.orthogonal.flatMap(child => child.brackets || []);
    if (boxes.length) model.brackets = boxes;
    // G2：鎖角碼的 M3 螺絲（主場景座標）。
    const screws = model.orthogonal.flatMap(child => child.screws || []);
    if (screws.length) model.screws = screws;
  }
  viewer3D.update(model);
  bench.afterScene({ pts: planesApi.pts, ptsAll: allPlanes ? allPlanes.pts : planesApi.pts, model });   // 組立台：接口標記跟著這一幀的宿主位置
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

// Mobile editors use the canvas layout instead of covering the mechanism.
for (const panel of document.querySelectorAll('.inspector-panel')) {
  const done = document.createElement('button');
  done.type = 'button'; done.className = 'mobile-editor-done'; done.textContent = '完成／收合';
  done.addEventListener('click', () => setMobilePanel('view'));
  panel.prepend(done);
  if (panel.id === 'lenEditor') {
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'mobile-editor-more'; more.textContent = '更多設定';
    more.addEventListener('click', () => {
      const expanded = panel.dataset.mobileMore !== 'true';
      panel.dataset.mobileMore = String(expanded);
      more.textContent = expanded ? '收起設定' : '更多設定';
      more.setAttribute('aria-expanded', String(expanded));
    });
    more.setAttribute('aria-expanded', 'false'); panel.append(more);
  }

}

function setMobilePanel(panel) {
  const next = ['build', 'edit', 'view', 'project'].includes(panel) ? panel : 'build';
  document.body.dataset.mobilePanel = next;
  if (next !== 'edit') closeMobileEditPanel();
  if (next !== 'project') closeMobileOpenMenu();
  syncMobilePanelTabs(next);
  // Switching panels preserves manual pan/zoom; the visible fit button resets it.
}

function openMobileEditPanel() {
  if (!mobilePrompt()) return;
  pause();
  document.body.dataset.mobileEditor = 'active';
  setMobilePanel('edit');
}

function closeMobileEditPanel() {
  delete document.body.dataset.mobileEditor;
  const editor = document.getElementById('lenEditor');
  delete editor.dataset.mobileMore;
  const more = editor.querySelector('.mobile-editor-more');
  if (more) { more.textContent = '更多設定'; more.setAttribute('aria-expanded', 'false'); }
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
      const { createViewer } = await import('../blocks3d/viewer.js?v=20261007_m4b');
      viewer3D = createViewer(overlay);
    }
    refresh3DView();
    requestAnimationFrame(refresh3DView);
    setTimeout(refresh3DView, 120);
    setTimeout(refresh3DView, 360);
  } else {
    overlay.style.display = 'none';
  }
  gripperController.syncVisibility();
}

// 機架（隱性）：把所有固定銷用淡連接線＋陰影斜線串起來，讀作「同一個固定底座」。
// 畫在最底層（draw() 開頭呼叫）；可拖的機架把手另由 drawFrameHandle 畫在最上層。
// 沒有足夠固定銷時，退回 render.js 的飄浮地面基線（純繪圖基元）。
function drawGround(frameGeometry) {
  if (S.viewPlane) return;   // 子平面沒有世界機架
  if (focusModule()?.mount) return;   // 已安裝模組的底座由 drawModulePlates 畫，沒有世界機架
  const nodes = viewFrameNodes();
  const fg = frameGeometry || Exporters.inspectFrameExport(nodes, Settings.exportSettings(),
    viewMounts(viewWorldMounts(Exporters.splitMountsByHost(S.comps, motorFrameExportMounts()).free)));
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
  if (S.lockFrameHoles) {
    pushUndo();
    snapFrameNodesToGrid();
    rebuild();
  }
  syncFrameOptionButtons();
  Panels.updateFrameEditor();
  draw();
}

function changeFrameGround(kind, delta) {
  const points = pointCoords();
  const nodes = [...frameNodeIds()].map(id => ({ id, ...points[id] })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (nodes.length < 2) return;
  const base = nodes[0], target = nodes[1];
  const dx = target.x - base.x, dy = target.y - base.y;
  let length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
  if (kind === 'length') length += Number(delta || 0);
  else if (kind === 'angle') angle += Number(delta || 0) * Math.PI / 180;
  else return;
  if (length < LEGO_STEP) { transient('機架軸距至少保留 8 mm'); return; }
  pushUndo();
  const next = { x: base.x + Math.cos(angle) * length, y: base.y + Math.sin(angle) * length };
  const snapped = snapFramePoint(next);
  updatePointCoordsById(target.id, snapped.x, snapped.y);
  rebuild();
  Panels.updateFrameEditor();
  draw();
}

// 機架移動把手：固定銷形心放一顆「🏠 機架」鈕，拖它＝把所有固定銷整組平移。
function drawFrameHandle() {
  if (S.viewPlane) return;
  const nodes = viewFrameNodes();
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
  mateTool.reset();
  S.comps = []; S.theta = 0; S.counter = 0;
  knownCompIds = null; S.designFocus = ROOT_TAB;
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
  Settings.applyFabricationProfile(Settings.legacyLocalFabrication(), { source: '新作品：已帶入此瀏覽器的舊加工偏好' });
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
  if (!S.comps.length) { transient('先放一個零件，再開始組裝'); return; }
  if (gripperController?.isActive() && !gripperController.currentPlan().ok) {
    transient(gripperController.currentPlan().message || '夾爪任務目前無法播放，請先修正尺寸或機構。');
    return;
  }
  if (!hasDriveSource()) { transient('先把動力來源放到轉軸，才能播放'); return; }
  document.getElementById('playBtn').classList.add('playing');
  document.getElementById('playBtn').textContent = '⏸';
  playPlan = planMotion();
  // 有限行程輸入（MG995 角度範圍 / 線性致動器行程）：覆寫成在兩端間來回擺。
  const ranged = inputRockRange();
  if (ranged && Number.isFinite(ranged.lo) && Number.isFinite(ranged.hi) && ranged.hi >= ranged.lo) {
    playPlan = { mode: 'rock', lo: ranged.lo, hi: ranged.hi };
    S.theta = Math.max(playPlan.lo, Math.min(playPlan.hi, S.theta));
  }
  if (playPlan.mode === 'rock' && playDir > 0 && S.theta >= playPlan.hi) playDir = -1;
  if (playPlan.mode === 'rock' && playDir < 0 && S.theta <= playPlan.lo) playDir = 1;
  draw();   // 先完整重建一次以建立場景與更新器，之後每幀走 renderFrame() 只更新幾何（不拆 DOM）
  let lastTs = null;
  const step = (ts) => {
    const dt = lastTs == null ? NOMINAL_FRAME_DT_MS : ts - lastTs; // 第一幀用名目幀長，按下播放立即有反應
    lastTs = ts;
    if (playPlan.mode === 'rock') {
      // 搖桿：在 lo..hi 間來回擺，到極限就反向（真實的搖桿物理）
      const next = advanceRock(S.theta, playDir, playStepDeg(dt), playPlan.lo, playPlan.hi);
      S.theta = next.theta; playDir = next.direction;
    } else {
      // 曲柄／平行四邊形：順向整圈轉
      S.theta = advanceByTime(S.theta, dt, PLAY_SPEED_DEG_PER_SEC, playDir);
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
function togglePlay() {
  raf ? pause() : play();
}

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
  el.textContent = show ? (sol?.errorReason
    ? `${sol.errorReason}；已保留原姿態，請檢查桿長與固定接點。`
    : '目前姿勢無法求解，已保留原姿態；請檢查桿長與接點。') : '';
  el.style.display = show ? 'block' : 'none';
}
// cancelMotorMode 已隨動力來源域移到 ./motor-tools.js
// ---- 動力來源選單：點「動力來源」先選 TT馬達 / MG995，再進入放置模式 ----
function linkMenuEl() { return document.getElementById('linkMenu'); }
function openLinkMenu() {
  const power = powerMenuEl();
  if (power) power.style.display = 'none';
  closeLinkMenu();
  Tools.startDrawLink();
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
  S.triSide = 'g';
  S.frameEditorOpen = false;
  S.selectedTriangleId = null;
  S.selectedNodeId = null;
  S.selectedSliderId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('frameEditor').style.display = 'none';
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


// 這個零件目前所屬的模組 id（沒標記＝根）。
function compModuleId(id) { return S.comps.find(c => c.id === id)?.moduleId || null; }

// D3：要動已安裝模組的零件前，若宿主鏈馬達不在組裝姿態（home）就先轉回去、重畫、提示，
// 這一下不執行原本動作（回傳 true 給呼叫端擋下）。
function ensureModuleHome(moduleId) {
  if (!moduleId || !S.modules.length) return false;
  const adj = homeAdjustment(S.modules, moduleId, { activeMotor: String(S.activeMotor), theta: S.theta, motorAngles: S.motorAngles });
  if (!adj) return false;
  pause();
  S.theta = adj.theta;
  S.motorAngles = adj.motorAngles;
  document.getElementById('thetaVal').textContent = Math.round(norm360(S.theta));
  draw();
  transient('已回到組裝姿態，請再點一次進行修改');
  return true;
}

// D3：姿態離開 home 時，若目前選取的是已安裝模組的零件／節點，自動取消選取
// （避免播放中還顯示著把手、再拖曳寫錯座標）。
function clearOffHomeModuleSelection() {
  if (!S.modules.length) return false;
  const mod = selectionModule(S.comps, { linkId: S.selectedLinkId, triangleId: S.selectedTriangleId, sliderId: S.selectedSliderId, gearId: S.selectedGearId, nodeId: S.selectedNodeId });
  if (!mod) return false;
  if (!homeAdjustment(S.modules, mod, { activeMotor: String(S.activeMotor), theta: S.theta, motorAngles: S.motorAngles })) return false;
  S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedNodeId = null;
  deselectGear();
  closeMobileEditPanel();
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  return true;
}

// D3 守門包住 Input.onNodeDown：按到已安裝模組的節點時，先回組裝姿態，這一下不下拉。
// renderNodes 與 Render.init 共用同一個包裝，行為才一致。
function guardedNodeDown(e, id) {
  if (ensureModuleHome(moduleOfPoint(S.comps, id))) { e?.preventDefault?.(); e?.stopPropagation?.(); return; }
  Input.onNodeDown(e, id);
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
  memberEditor.change(delta);
}

// 節點角色域（角色 / X・Y 微調 / 拆馬達 / 分離 / 軌跡點 / 量測基準 / 位置鎖 / 伺服・行程面板）
// 已移到 ./node-editor.js

// ---- 指標 / 手勢事件監聽（拖曳 + pinch 縮放 + 畫圖模式起點）已抽到 ./input.js（init 內掛載）----

// 目前機構的世界外接框（給 fit 用）
function currentBounds() {
  const allPts = lastFullPts || (lastModelInputs && lastModelInputs.pts);
  if (!allPts) return null;
  const pts = filterToView(allPts);   // 只取目前平面的點
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, any = false;
  // 側影帶也納入範圍，進入／離開視圖時才看得到它。
  viewBands(allPts).forEach(b => b.polygon.forEach(p => {
    any = true;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }));
  Object.values(pts).forEach(p => {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      any = true;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  });
  const plan = gripperController?.isActive() ? gripperController.currentPlan() : null;
  const object = gripperController?.reference();
  if (object) {
    minX = Math.min(minX, object.center.x - object.width / 2 - 15);
    maxX = Math.max(maxX, object.center.x + object.width / 2 + 15);
    minY = Math.min(minY, object.center.y - object.width / 2 - 40);
    maxY = Math.max(maxY, object.center.y + object.width / 2);
  }
  if (plan?.ok) [plan.open, plan.closed].forEach(pose => {
    if (!pose?.center || !Number.isFinite(pose.center.x) || !Number.isFinite(pose.center.y)) return;
    const halfWidth = Math.abs(pose.gap) / 2 + 2 * plan.radius;
    const halfHeight = plan.radius;
    any = true;
    minX = Math.min(minX, pose.center.x - halfWidth); maxX = Math.max(maxX, pose.center.x + halfWidth);
    minY = Math.min(minY, pose.center.y - halfHeight); maxY = Math.max(maxY, pose.center.y + halfHeight);
  });
  // 齒輪接點只有軸心與輸出孔，不能代表輪廓；納入齒頂圓，避免初載／置中裁掉齒輪。
  viewComps().filter(c => c.type === 'gear').forEach(c => {
    const p = c.p1 && pts[c.p1.id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const teeth = Math.max(6, Math.round(Number(c.teeth) || 12));
    const radius = Number(S.topo.params[c.radiusParam]) || 40;
    const outerRadius = radius + 2 * radius / teeth;
    minX = Math.min(minX, p.x - outerRadius); maxX = Math.max(maxX, p.x + outerRadius);
    minY = Math.min(minY, p.y - outerRadius); maxY = Math.max(maxY, p.y + outerRadius);
  });
  return any ? { minX, maxX, minY, maxY } : null;
}
function fitView() {
  const b = currentBounds();
  // 接點外仍有馬達外殼與零件端圓；手機窄畫面也要留得住這些部分。
  if (b) View.fit({ minX: b.minX - 24, maxX: b.maxX + 24, minY: b.minY - 24, maxY: b.maxY + 24 }); else View.resetView();
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
// O4a：直角安裝轉接座的孔位（桿件孔＋子模組底板節點）；板厚用 CNC 設定的板材厚度。
// M5a：整台機器（底座＋裝在它身上的）；還沒接上的機構不進匯出、製作包與機架板。
const machineNow = () => ({ comps: machineComps(S.comps, S.modules), modules: machineModules(S.modules) });
const exportWorldMounts = free => machineMounts(splitFrameMounts(free, S.comps, S.modules).world, S.comps, S.modules);
// 畫面用：設計模式看焦點分頁自己的（不過濾）；組立模式只算機器的。
const viewWorldMounts = free => { const w = splitFrameMounts(free, S.comps, S.modules).world; return inDesign() && S.modules.length ? w : machineMounts(w, S.comps, S.modules); };
function orthoExtrasNow(machine = false) {
  const stockMm = Number(S.fabrication?.cnc?.stockThicknessMm) > 0 ? Number(S.fabrication.cnc.stockThicknessMm) : FABRICATION_DEFAULTS.cnc.stockThicknessMm;
  const M = machine ? machineNow() : { comps: S.comps, modules: S.modules };
  return orthogonalExportExtras(M.comps, M.modules, S.topo.params, { stockMm, joint: jointSettingsNow() });
}
// F1：作品目前的直角接合件設定（預設接合件種類與角碼規格）。
function jointSettingsNow() { return S.fabrication?.joint || FABRICATION_DEFAULTS.joint; }
// G1：作品內容的結構鍵（零件＋模組＋參數（不含 θ）＋加工／匯出設定）；沒有已安裝模組時不算。
function syncModulePlates() {
  if (!S.modules.some(m => m && m.mount)) { modulePlates.sync(''); return; }
  const { theta, ...params } = S.topo.params || {};
  modulePlates.sync(JSON.stringify([S.comps, S.modules, params, S.fabrication, Settings.exportSettings()]));
}
// G1：已安裝模組固定板的快取來源（home 幾何只在 draw() 重建時重算，播放每幀只做剛體變換）。
const modulePlates = createModulePlateSource(() => {
  const stockMm = Number(S.fabrication?.cnc?.stockThicknessMm) > 0 ? Number(S.fabrication.cnc.stockThicknessMm) : FABRICATION_DEFAULTS.cnc.stockThicknessMm;
  const exportSettings = Settings.exportSettings();
  return {
    comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings, joint: jointSettingsNow(), stockMm,
    planArgs: { comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings, cnc: S.fabrication?.cnc || FABRICATION_DEFAULTS.cnc, extras: orthoExtrasNow(), joint: jointSettingsNow() }
  };
});
// O4b：下載每個直角安裝的 3D 列印轉接座 STL（L 形，孔位與木板上的 ADAPTER_HOLE 對應）。
function downloadAdapterStl() {
  const all = (orthoExtrasNow().adapters || []);
  if (!all.length) { transient('沒有直角安裝，不需要轉接座'); return; }
  const adapters = all.filter(a => a.kind !== 'bracket-m3');   // E1：金屬角碼是現成零件，不用列印
  if (!adapters.length) { transient('金屬角碼不需要列印'); return; }
  adapters.forEach(a => {
    const name = `adapter-${a.moduleId}${a.tiltDeg ? `-tilt${a.tiltDeg}` : ''}`;   // D4：傾斜的轉接座檔名帶角度
    const stl = meshToStl(adapterMesh({ lengthMm: a.lengthMm, wallMm: a.wallMm, flangeMm: a.flangeMm, holeDiameterMm: a.holeDiameterMm, holesPerFlange: a.holesPerFlange, tiltDeg: a.tiltDeg }), name);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([stl], { type: 'model/stl' }));
    link.download = `${name}.stl`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  transient(`已下載 ${adapters.length} 個轉接座 STL`);
}
function saveFile() {
  Store.downloadJson(Store.toSnapshot(S.comps, S.topo, S.counter, motorSnapshotState()), 'blocks.json');
}
// L4：機架（世界／模組）的孔與開口轉成 cnc-check 的零件形狀；無機架幾何回 null。
function cncFramePart(name, nodes, settings, mounts) {
  const g = Exporters.inspectFrameExport(nodes, settings, mounts);
  return g ? { name, holes: g.holes || [], cutouts: g.cutouts || [] } : null;
}
// 匯出後依刀徑顯示警告（前 3 條＋「…等 N 項」）；沒有警告就不動 banner。
// 收集 CNC 警告文字（刀徑檢查＋輪轂／舵盤孔位預設值提醒）；匯出提示與製作包共用。
function cncWarningList(parts) {
  const list = cncWarnings(parts.filter(Boolean), S.fabrication?.cnc || FABRICATION_DEFAULTS.cnc);
  // 輪轂／舵盤孔位若沒有作品明確設定，用的是常見預設值：提醒實量。
  // 作品的 drive 數值若都還是常見預設值（使用者沒實量改過），提醒一次；S.fabrication 載入後一定完整，不能用「有沒有 drive」判斷。
  const driveIsDefault = Object.entries(FABRICATION_DEFAULTS.drive).every(([k, v]) => (S.fabrication?.drive?.[k] ?? v) === v);
  if (driveIsDefault && parts.some(p => p && (p.holes || []).some(h => /^(TT_HUB_|MG995_HORN_)/.test(h.layer || '')))) {
    list.unshift('TT 輪轂／MG995 舵盤孔位用的是常見預設值，請實量後修改');
  }
  return list;
}
// L5c：依各馬達實際播放範圍取樣檢查干涉；馬達範圍＝暫時把 activeMotor 設成該顆呼叫 inputRockRange()，連續轉（沒範圍）用 [-180, 180]。
function currentMotorRanges() {
  const keep = S.activeMotor;
  const ranges = {};
  try {
    [...usedMotorIds()].sort((a, b) => Number(a) - Number(b)).forEach(id => {
      S.activeMotor = id;
      const r = inputRockRange();
      ranges[id] = r && Number.isFinite(r.lo) && Number.isFinite(r.hi) ? { lo: r.lo, hi: r.hi } : { lo: -180, hi: 180 };
    });
  } finally { S.activeMotor = keep; }
  return ranges;
}
const homeMountsNow = () => lastModelInputs ? motorFrameExportMounts({ ...lastModelInputs, pts: pointCoords() }) : undefined;
// L6：疊層＋自動隔圈＋剩下的干涉；製作包與橫幅共用。失敗時回 { plan, interference: [], ranges }（plan 可能為 null）。
function resolvedBuild(settings, mounts) {
  const cnc = S.fabrication?.cnc || FABRICATION_DEFAULTS.cnc;
  const ranges = currentMotorRanges();
  const args = { comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: settings, cnc, mounts, extras: orthoExtrasNow(), joint: jointSettingsNow() };
  try {
    return { ...resolveSpacers({ ...args, ranges }), ranges };
  } catch (e) {
    return { plan: buildPlan(args), interference: [], spacers: [], ranges };
  }
}
// L6b：目前作品各齒條的長槽限位建議（依干涉檢查）。
function currentRackStopSuggestions(settings, mounts, build = resolvedBuild(settings, mounts)) {
  try {
    return suggestRackStops({ comps: S.comps, modules: S.modules, params: S.topo.params, plan: build.plan, ranges: build.ranges, exportSettings: settings, mounts });
  } catch (e) { return []; }
}
// 套用建議：把各齒條長槽的縮短量寫進 slot.trimStart／trimEnd（>0 才寫，0 則移除）。
function applyRackStops() {
  const settings = { ...Settings.exportSettings(), drive: S.fabrication?.drive || FABRICATION_DEFAULTS.drive };
  const sug = currentRackStopSuggestions(settings, homeMountsNow());
  if (!sug.length) { transient('目前沒有需要限位的齒條'); return; }
  pushUndo(); pause();
  sug.forEach(s => {
    const rack = S.comps.find(c => c.type === 'rack' && c.id === s.rackId);
    if (!rack || !rack.slot || typeof rack.slot !== 'object') return;
    if (s.trimStart > 0) rack.slot.trimStart = s.trimStart; else delete rack.slot.trimStart;
    if (s.trimEnd > 0) rack.slot.trimEnd = s.trimEnd; else delete rack.slot.trimEnd;
  });
  rebuild(); draw(); gearEditor.updateGearEditor(); scheduleAutosave();
  transient(sug.map(s => s.message).join(' '));
}
function showCncWarnings(parts, settings) {
  const list = cncWarningList(parts);
  let found = [];
  try { found = resolvedBuild(settings, homeMountsNow()).interference; } catch (e) { found = []; }
  if (found.length) list.unshift(`干涉 ${found.length} 項，詳見製作包`);
  if (!list.length) return;
  setBanner(`⚠ CNC：${list.slice(0, 3).join('；')}${list.length > 3 ? `；…等 ${list.length} 項` : ''}`);
}
let videoExportLoading = false;
async function exportVideo() {
  if (videoExportLoading) return;
  if (S.mode !== 'design' || view3DActive) { transient('請先切回 2D 設計畫面，再匯出動畫'); return; }
  if (!S.comps.length || !hasDriveSource()) { transient('請先建立有動力的機構，再匯出動畫'); return; }
  if (gripperController?.isActive() && !gripperController.currentPlan().ok) { transient('請先修正夾爪任務，再匯出動畫'); return; }
  videoExportLoading = true;
  try {
    const { exportAnimation } = await import('./video-export.js');
    await exportAnimation({ svg, begin: () => {
      const theta = S.theta, direction = playDir, wasPlaying = !!raf;
      const savedLast = lastSolved, savedPrev = prevSolved;
      pause();
      const range = inputRockRange();
      const plan = range || planMotion();
      let directionNow = direction;
      draw();
      return {
        frame(dt) {
          if (range || plan.mode === 'rock') {
            const next = advanceRock(S.theta, directionNow, playStepDeg(dt), plan.lo, plan.hi);
            S.theta = next.theta; directionNow = next.direction;
          } else S.theta = advanceByTime(S.theta, dt, PLAY_SPEED_DEG_PER_SEC, directionNow);
          renderFrame();
        },
        restore() { S.theta = theta; playDir = direction; lastSolved = savedLast; prevSolved = savedPrev; draw(); if (wasPlaying) play(); }
      };
    }});
  } catch (e) { transient('無法載入影片工具：' + e.message); }
  finally { videoExportLoading = false; }
}

function exportLinksSvg() {
  const settings = { ...Settings.exportSettings(), drive: S.fabrication?.drive || FABRICATION_DEFAULTS.drive }, nodes = frameConnectorNodes(), mounts = machineMounts(motorFrameExportMounts(), S.comps, S.modules), M = machineNow();
  const stockWarnings = memberStockWarnings(M.comps, settings);
  if (stockWarnings.length) { transient(`尚未匯出：${stockWarnings[0]}`); return; }
  // 有宿主機架桿的 mount 隨該桿匯出（特徵切進桿身）；剩下的才進 frame.svg；已安裝模組另出各自的機架檔。
  const freeMounts = exportWorldMounts(Exporters.splitMountsByHost(M.comps, mounts).free);
  const extras = orthoExtrasNow(true);
  const cutNodes = withWorldAdapterNodes(nodes, extras);   // C1：機架板邊上的轉接座宿主孔
  const count = Exporters.exportLinksAsSvg(M.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings, mounts, extras);
  const frameCount = Exporters.exportFrameAsSvg(cutNodes, settings, freeMounts);
  const warnings = Exporters.frameExportWarnings(cutNodes, settings, freeMounts);
  const cncParts = [...Exporters.cncPartsForExport(M.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings, mounts, extras), cncFramePart('frame', cutNodes, settings, freeMounts)];
  // 已安裝模組另出一份機架檔（SDD-ASSEMBLY-MODULES §4.2）；座標用 home 姿態重算安裝座。
  let moduleFrameCount = 0;
  moduleFrameExports(M.comps, M.modules, S.topo.params).forEach(entry => {
    const modNodes = withAdapterNodes(entry.moduleId, moduleFrameNodes(entry, Model.frameConnectorNodes(entry.comps)), extras);
    const homeMounts = motorFrameExportMounts({ ...(lastModelInputs || {}), pts: pointCoords() });
    const modFree = splitFrameMounts(Exporters.splitMountsByHost(M.comps, homeMounts).free, M.comps, M.modules).byModule[entry.moduleId] || [];
    const n = Exporters.exportFrameAsSvg(modNodes, settings, modFree, entry.fileBase);
    moduleFrameCount += n;
    if (n) {
      warnings.push(...Exporters.frameExportWarnings(modNodes, settings, modFree));
      cncParts.push(cncFramePart(entry.fileBase, modNodes, settings, modFree));
    }
  });
  transient(count || frameCount || moduleFrameCount ? `已匯出 ${count} 個零件 + ${frameCount ? '機架' : '無機架'} SVG${moduleFrameCount ? `＋ ${moduleFrameCount} 個模組底座` : ''}${warnings.length ? `；⚠ ${warnings[0]}` : ''}` : '沒有可匯出的零件或機架');
  showCncWarnings(cncParts, settings);
}
function exportLinksDxf() {
  const settings = { ...Settings.exportSettings(), drive: S.fabrication?.drive || FABRICATION_DEFAULTS.drive }, nodes = frameConnectorNodes(), mounts = machineMounts(motorFrameExportMounts(), S.comps, S.modules), M = machineNow();
  const stockWarnings = memberStockWarnings(M.comps, settings);
  if (stockWarnings.length) { transient(`尚未匯出：${stockWarnings[0]}`); return; }
  const freeMounts = exportWorldMounts(Exporters.splitMountsByHost(M.comps, mounts).free);
  const extras = orthoExtrasNow(true);
  const cutNodes = withWorldAdapterNodes(nodes, extras);   // C1：機架板邊上的轉接座宿主孔
  const count = Exporters.exportLinksAsDxf(M.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings, mounts, extras);
  const frameCount = Exporters.exportFrameAsDxf(cutNodes, settings, freeMounts);
  const warnings = Exporters.frameExportWarnings(cutNodes, settings, freeMounts);
  const cncParts = [...Exporters.cncPartsForExport(M.comps, lastModelInputs && lastModelInputs.pts, S.topo.params, settings, mounts, extras), cncFramePart('frame', cutNodes, settings, freeMounts)];
  // 已安裝模組另出一份機架檔（SDD-ASSEMBLY-MODULES §4.2）；座標用 home 姿態重算安裝座。
  let moduleFrameCount = 0;
  moduleFrameExports(M.comps, M.modules, S.topo.params).forEach(entry => {
    const modNodes = withAdapterNodes(entry.moduleId, moduleFrameNodes(entry, Model.frameConnectorNodes(entry.comps)), extras);
    const homeMounts = motorFrameExportMounts({ ...(lastModelInputs || {}), pts: pointCoords() });
    const modFree = splitFrameMounts(Exporters.splitMountsByHost(M.comps, homeMounts).free, M.comps, M.modules).byModule[entry.moduleId] || [];
    const n = Exporters.exportFrameAsDxf(modNodes, settings, modFree, entry.fileBase);
    moduleFrameCount += n;
    if (n) {
      warnings.push(...Exporters.frameExportWarnings(modNodes, settings, modFree));
      cncParts.push(cncFramePart(entry.fileBase, modNodes, settings, modFree));
    }
  });
  transient(count || frameCount || moduleFrameCount ? `已匯出 ${count} 個零件 + ${frameCount ? '機架' : '無機架'} DXF${moduleFrameCount ? `＋ ${moduleFrameCount} 個模組底座` : ''}${warnings.length ? `；⚠ ${warnings[0]}` : ''}` : '沒有可匯出的零件或機架');
  showCncWarnings(cncParts, settings);
}
// 製作包用：與匯出相同的零件與機架幾何，只收集 CNC 檢查用的孔與開口（不下載檔案）。
function collectCncPartsAndFrameWarnings(settings) {
  const nodes = frameConnectorNodes(), mounts = machineMounts(motorFrameExportMounts(), S.comps, S.modules), M = machineNow();
  const pts = lastModelInputs && lastModelInputs.pts, extras = orthoExtrasNow(true);
  const cutNodes = withWorldAdapterNodes(nodes, extras);   // C1：機架板邊上的轉接座宿主孔
  const freeMounts = exportWorldMounts(Exporters.splitMountsByHost(M.comps, mounts).free);
  const frameWarnings = Exporters.frameExportWarnings(cutNodes, settings, freeMounts);
  const cncParts = [...Exporters.cncPartsForExport(M.comps, pts, S.topo.params, settings, mounts, extras), cncFramePart('frame', cutNodes, settings, freeMounts)];
  moduleFrameExports(M.comps, M.modules, S.topo.params).forEach(entry => {
    const modNodes = withAdapterNodes(entry.moduleId, moduleFrameNodes(entry, Model.frameConnectorNodes(entry.comps)), extras);
    const homeMounts = motorFrameExportMounts({ ...(lastModelInputs || {}), pts: pointCoords() });
    const modFree = splitFrameMounts(Exporters.splitMountsByHost(M.comps, homeMounts).free, M.comps, M.modules).byModule[entry.moduleId] || [];
    frameWarnings.push(...Exporters.frameExportWarnings(modNodes, settings, modFree));
    cncParts.push(cncFramePart(entry.fileBase, modNodes, settings, modFree));
  });
  return { cncParts, frameWarnings };
}
// L5b：下載「製作包」HTML（板件清單＋五金清單＋組裝步驟，可列印）。
function downloadBuildPack() {
  const settings = { ...Settings.exportSettings(), drive: S.fabrication?.drive || FABRICATION_DEFAULTS.drive };
  const stockWarnings = memberStockWarnings(machineNow().comps, settings);
  if (stockWarnings.length) { transient(`尚未產生製作包：${stockWarnings[0]}`); return; }
  const cnc = S.fabrication?.cnc || FABRICATION_DEFAULTS.cnc;
  const homeMounts = homeMountsNow();
  const build = resolvedBuild(settings, homeMounts);
  const { plan, interference } = build;
  if (!plan.parts.length) { transient('沒有可匯出的零件或機架'); return; }
  const suggestions = currentRackStopSuggestions(settings, homeMounts, build);
  const { cncParts, frameWarnings } = collectCncPartsAndFrameWarnings(settings);
  const warnings = [...frameWarnings, ...cncWarningList(cncParts)];
  // 目前沒有作品名稱欄位：有模組就用模組名稱串起來，否則「機構作品」。
  const title = (S.modules || []).map(m => m && m.name).filter(Boolean).join('＋') || '機構作品';
  const html = buildPackHtml(plan, { title, cnc, warnings, interference, suggestions, modules: S.modules });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, '_')}-製作包.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  transient(`已產生製作包（${plan.parts.length} 片板件）`);
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
        const incoming = normalizeIncomingSnapshot(JSON.parse(r.result));
        const norm = incoming.norm;
        if (!norm) { transient('⚠️ ' + incoming.error); return; }
        applySnapshot(norm, { source: 'external' });
        // applySnapshot 已清除舊教學卡，或依任務 marker 恢復夾爪；不再覆寫其狀態。
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
  Render.init({ svg, onNodeDown: guardedNodeDown });   // 注入繪製基元的外部依賴（預設 parent + 固定孔互動）
  Panels.init({ pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount, pointIsGround, isGroundPositionUnlocked });
  Tools.init({ svg, draw, rebuild, pushUndo, pause, cancelMotorMode, deselectLink, selectLink, selectTriangle, selectSlider,
               setBanner, clearBanner, worldFromEvent, pointCoords, nearestDisplayToPoint, snapWorld,
               mobilePrompt, promptText, displayPointCoords: displayCoords, notify: transient });
  Input.init({ svg, draw, rebuild, pause, cancelMotorMode, deselectLink, selectLink,
               worldFromEvent, pointCoords, mobilePrompt,
               snapshotStr, updateUndoBtn, nearestDisplayTo, nearestDisplayToPoint,
               movePointById, updatePointCoordsById, recomputeLengths, mergePoints,
               isFreeLink, freeLinkForPoint, freeTriangleForPoint, pinnedTriangleForPoint, lockedTriangleVertex, fixedLinkFor, inputCrankMovingEnd,
               handleMotorOnNode, setSliderDetailRows, frameNodeIds, pointIsGround, recordManualTrace, solvePinnedConstraints,
               nodeDownEntry: guardedNodeDown,
               snapFramePoint, snapFrameNodesToGrid, openMobileEditPanel, closeMobileEditPanel, openFrameEditor: () => { S.frameEditorOpen = true; Panels.updateFrameEditor(); }, transient,
               isGroundPositionUnlocked, relockGroundPosition, rotateInputCrankToPoint, pointIsRackHole });
  Settings.init({ draw: () => { if (S.modules.some(m => m.mount?.face)) rebuild(); draw(); }, pushUndo, pause, scheduleAutosave, notify: transient });
  Settings.loadExportSettings();
  Settings.loadTtMountSettings();
  Settings.loadMg995MountSettings();
  document.getElementById('memberSweepToggle').onchange = event => {
    sweepMemberId = event.target.checked ? (S.selectedLinkId || S.selectedTriangleId) : null;
    draw();
  };
  populateExamples();
  let loaded = false;
  try {
    const hashObj = Store.readShareFromHash();
    if (hashObj) {
      const incoming = normalizeIncomingSnapshot(hashObj);
      if (!incoming.norm) throw new Error(incoming.error);
      applySnapshot(incoming.norm, { recordUndo: false, source: 'share' }); loaded = true;
    }
  } catch (e) {
    console.warn('share link load failed:', e);
    transient('⚠️ 分享連結讀取失敗');
  }
  if (!loaded) {
    const local = Store.normalizeSnapshot(Store.loadLocal());
    if (local && local.comps.length) { applySnapshot(local, { recordUndo: false, source: 'local-autosave' }); loaded = true; }
  }
  if (!loaded) { rebuild(); draw(); }
  setMobilePanel('build');
  updateUndoBtn();
  syncFrameOptionButtons();
  offerExampleFromUrl({ loadExample, notify: transient });
}

window.blocks = { exportVideo, setViewPlane, setDesignFocus: id => setDesignFocus(id), newDesign, designTabs: () => designTabs(S.comps, S.modules, focusOpts()), setMode: bench.setMode, benchSelect: bench.select, benchPickPort: bench.pickPort, benchCommit: bench.commit, benchCancel: bench.cancel, benchAdjust: bench.adjust, benchShowAll: bench.setShowAll, benchDebug: bench.debug, mateWizardDebug: bench.mateWizardDebug, benchLiveCheck: bench.liveCheck, benchTimeline: bench.runTimeline, benchJump: bench.jumpTo, placeMotor, openPowerMenu, pickMotorType, openLinkMenu, pickLinkTool, setMobilePanel, openMobileOpenMenu, openMobileFile, changeServoAngle, changeStroke, flipSlider, toggleSliderBase, convertLinkToSlider: Tools.convertLinkToSlider, changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset, changeSliderTravelStart, changeSliderTravelEnd, changeNodePos, addAnchor, addGearPair, addRackPinion, toggleRackOrientation, changeGearModule, changeGearTeeth, changeGearPinRadius, changeGearPinHoleDiameter, changeRackLength, changeRackBodyHeight, changeRackSlotLength, changeRackSlotWidth, applyRackStops, clearRackStops: gearEditor.clearRackStops, addLink, startDrawLink: Tools.startDrawLink, startDrawRail: Tools.startDrawRail, startDrawPolygon: Tools.startDrawPolygon, startDrawTriangle: () => Tools.startDrawTriangle('triangle'), startDrawJaw: () => Tools.startDrawTriangle('jaw'), clearAll, confirmClearAll, togglePlay, toggleMotorDirection, setLen, changeLen, setTriSide, setTriangleShapeMode, addTriangleOutlinePoint, selectLink, setNodeRole, removeNodeMotor, splitNode, toggleTracePoint, toggleMeasurementReference, toggleGroundPositionLock, toggleFrameLock, configureMotorMount, setMotorWorldMount, setMotorOrientation, toggleMotorReverse, deleteSelectedPart, bringPart, toggle3D, fitView, undo, saveFile, setExportSetting: Settings.setExportSetting, setTtMountSetting: Settings.setTtMountSetting, setMg995MountSetting: Settings.setMg995MountSetting, setCncSetting: Settings.setCncSetting, setDriveSetting: Settings.setDriveSetting, setJointSetting: Settings.setJointSetting, exportLinksSvg, exportLinksDxf, downloadBuildPack, downloadAdapterStl, openFile, share, loadExample };
window.blocks.changeFrameGround = changeFrameGround;
// H1 除錯／測試：設計模式目前看得到的零件與點（畫面實際畫的那一份）。
window.blocks.designDebug = () => ({
  mode: S.mode, focus: S.designFocus, viewPlane: S.viewPlane,
  comps: viewComps().map(c => c.id),
  points: Object.keys(lastFramePts || {}),
  hidden: S.comps.filter(c => !viewComps().includes(c)).map(c => c.id),
  motors: [...designMotorIds()]
});
Object.assign(window.blocks, {
  mateTool: on => mateTool.set(!!on), mateDebug: () => mateTool.debug(),
  setTriSide: memberEditor.selectDimension,
  setMemberDimension: memberEditor.setValue,
  setMemberMirror: memberEditor.setMirror,
  setMemberMaterial: memberEditor.setMaterial
});
init();
