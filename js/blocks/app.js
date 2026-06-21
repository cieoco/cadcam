/**
 * blocks / app
 *
 * 「機構積木」頁的控制器（ui 層）：持有狀態與 DOM，負責繪製、指標互動、編輯面板、
 * 播放迴圈與 3D 預覽切換。純邏輯都委派給同目錄的純模組：
 *   - view.js   視圖投影 + 冰棒棍外形
 *   - model.js  comps / topo 資料操作
 *   - motion.js 播放運動分析
 *
 * 下方「綁定層」把這些純函式綁到本檔狀態（comps / topo / theta…），讓繪製與互動
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
import * as Model from './model.js';
import * as Motion from './motion.js';
import * as Store from './storage.js';
import { BLOCK_EXAMPLES, getExample } from './examples.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stageSvg');
const { W, H, HULL_R_WORLD, TX, TY } = View;
// 樂高 Technic 孔距 = 8mm，桿長（兩端孔中心距）= (孔數 - 1) × 8。長度一律對齊 8mm。
const LEGO_STEP = 8;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);

// ---- 狀態 ----
let comps = [];                       // wizard 風格的組件（角色就藏在 type 裡）
let topo = { params: { theta: 0 }, tracePoint: '' };
let compiled = null;
let theta = 0, raf = null, counter = 0;
let dragId = null, dragLinkId = null, dragLastWorld = null, snapTarget = null, selectedLinkId = null, selectedTriangleId = null, selectedNodeId = null;
let triSide = 'g';                    // 三點桿目前在調哪一條邊：'g' 底邊 / 'r1' P1–P3 / 'r2' P2–P3
let placingMotor = false, pickBars = null;
// 畫桿模式（像 Word 畫表格：點工具後在畫面拖曳拉出連桿）
let drawingLink = false, drawActive = false, drawStart = null, drawPreview = null, drawStartNodeId = null;
let drawingTriangle = false, triangleStage = 'base', trianglePoints = [], trianglePreview = null;
let lastSolved = {};           // 上一幀求解成功的點位：給求解器挑「連續」分支 + 死點暫態回退
let prevSolved = {};           // 再上一幀：和 lastSolved 一起外插出「帶動量」的預測種子
let trajectoryCache = null;    // 沿用 multilink sweepTopology 的軌跡資料格式

// ---- 3D 唯讀預覽狀態 ----
let viewer3D = null;           // createViewer() 的實體（首次開啟才懶載入）
let view3DActive = false;      // 3D 覆蓋層是否開著
let lastModelInputs = null;    // 最近一次 draw() 算好的 { links, pts, groundIds }，給 3D 鏡像用

// ---- 課堂閉環：復原 / 自動存檔 ----
const undoStack = [];          // 每筆是一份 snapshot 字串（變更前的狀態）
let preDragSnap = null;        // 拖曳前的狀態：整段拖曳合併成一筆 undo
let autosaveTimer = null;

function snapshotStr() {
  return JSON.stringify(Store.toSnapshot(comps, topo, counter));
}
function pushUndo() {
  const s = snapshotStr();
  if (undoStack[undoStack.length - 1] === s) return; // 沒變就不堆
  undoStack.push(s);
  if (undoStack.length > 60) undoStack.shift();
  updateUndoBtn();
}
function updateUndoBtn() {
  const btn = document.getElementById('btnUndo');
  if (btn) btn.disabled = undoStack.length === 0;
}
function undo() {
  if (!undoStack.length) return;
  const norm = Store.normalizeSnapshot(JSON.parse(undoStack.pop()));
  if (norm) applySnapshot(norm, { recordUndo: false, fit: false });
  updateUndoBtn();
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => Store.saveLocal(Store.toSnapshot(comps, topo, counter)), 500);
}

// 套用一份 snapshot 到目前狀態。recordUndo 預設 true（外部開檔/分享要能 undo）。
function applySnapshot(norm, { recordUndo = true, fit = true } = {}) {
  if (recordUndo) pushUndo();
  pause();
  cancelMotorMode();
  comps = norm.comps;
  topo = { params: norm.params || {}, tracePoint: norm.tracePoint || '' };
  counter = Math.max(norm.counter || 0, Store.highestIdNum(comps));
  theta = 0;
  selectedLinkId = null;
  selectedTriangleId = null;
  selectedNodeId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
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
const planMotion = () => Motion.planMotion(compiled, topo, theta, lastSolved);
const mobilePrompt = () => window.matchMedia('(hover: none), (pointer: coarse), (max-width: 640px)').matches;
const promptText = (desktop, mobile) => mobilePrompt() ? mobile : desktop;
const snapWorld = () => View.snapWorld() * (mobilePrompt() ? 2.35 : 1);
const NODE_TAP_PX = 34;   // 手機點接點的命中半徑（畫面 px，縮放下維持一致手感）

const pointCoords = () => Model.pointCoords(comps);
const updatePointCoordsById = (id, x, y) => Model.updatePointCoordsById(comps, id, x, y);
const freezePointAtDisplay = (id) => Model.freezePointAtDisplay(comps, compiled, theta, id);
const movePointById = (id, dx, dy) => Model.movePointById(comps, id, dx, dy);
const pointIsGround = (id) => Model.pointIsGround(comps, id);
const removeMotorAtPoint = (id) => Model.removeMotorAtPoint(comps, id);
const removeAnchorsAtPoint = (id) => { comps = Model.removeAnchorsAtPoint(comps, id); };
const setPointType = (id, type) => Model.setPointType(comps, id, type);
const roleLabel = (id) => Model.roleLabel(comps, id);
const hasPoint = (id) => Model.hasPoint(comps, id);
const findNearest = (id) => Model.findNearest(comps, id, snapWorld());
const mergePoints = (fromId, toId) => { comps = Model.mergePoints(comps, fromId, toId); };
const recomputeLengths = () => Model.recomputeLengths(comps, topo);
const fixedLinkFor = (id) => Model.fixedLinkFor(comps, id);
const freeLinkForPoint = (id) => Model.freeLinkForPoint(comps, id);
const isFreeLink = (c) => Model.isFreeLink(comps, c);
const barsAtNode = (nodeId) => Model.barsAtNode(comps, nodeId);

function rebuild() {
  compiled = compileTopology(comps, topo, new Set());
  topo.params = compiled.params; // 沿用補齊後的參數
  lastSolved = {};               // 拓撲變了：丟掉舊解，避免拿到不相干的種子
  prevSolved = {};
  trajectoryCache = null;
  document.getElementById('hint').style.display = comps.length ? 'none' : 'block';
  updateRoleEditor();
  scheduleAutosave();            // 任何結構變更都防丟（debounce，播放不觸發）
}

function getTrajectoryData() {
  const tracePoint = topo.tracePoint || (compiled && compiled.tracePoint) || '';
  if (!compiled || !tracePoint || !comps.length) return null;
  const key = JSON.stringify(Store.toSnapshot(comps, topo, counter));
  if (trajectoryCache && trajectoryCache.key === key) return trajectoryCache.data;
  let data = null;
  try {
    const sweep = sweepTopology({ ...compiled, tracePoint }, compiled.params || topo.params || {}, 0, 360, 5);
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

function draw() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  drawGround();
  if (!compiled || !comps.length) {
    updateSolveBanner(null, 0);
    drawDrawPreview();   // 空畫布也要顯示正在拉出的第一根連桿
    drawTrianglePreview();
    return;
  }

  let sol = null;
  // 帶「外插（上一幀＋速度）」的預測當種子：靠動量挑連續分支，平行四邊形不會翻成交叉。
  const seed = extrapolateSeed(lastSolved, prevSolved);
  try { sol = solveTopology(compiled, { thetaDeg: theta, _prevPoints: seed }); } catch (_) {}
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

  const groundIds = new Set((compiled.steps || []).filter(s => s.type === 'ground').map(s => s.id));
  const motorCenterIds = new Set((compiled.steps || []).filter(s => s.type === 'input_crank').map(s => s.center));
  drawTraceTrajectory(getTrajectoryData());

  // 三角板邊：這些 link 由實心三角板代表，2D 不另畫（與 3D scene-model 的 visible 篩法一致）。
  const triangleEdgeKeys = new Set();
  (compiled.visualization.polygons || []).forEach(poly => {
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
  const layerLinks = (compiled.visualization.links || []).filter(l =>
    l && !l.hidden && validPt(l.p1) && validPt(l.p2) &&
    !triangleEdgeKeys.has([l.p1, l.p2].sort().join('|')));
  const triComps = comps.filter(c => c.type === 'triangle' && c.p1 && c.p2 && c.p3 &&
    validPt(c.p1.id) && validPt(c.p2.id) && validPt(c.p3.id));
  // 手動疊放偏好（zlift）標到 visualization 物件上：2D bodies 與 3D buildSceneModel 都讀同一份
  (compiled.visualization.links || []).forEach(l => {
    const c = l.id ? comps.find(x => x.id === l.id) : null;
    l._zlift = (c && c.zlift) || 0;
  });
  (compiled.visualization.polygons || []).forEach(poly => {
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
  comps.filter(comp => comp.type === 'triangle' && comp.p1 && comp.p2 && comp.p3).forEach(tri => {
    const ids = [tri.p1.id, tri.p2.id, tri.p3.id];
    const [a, b, c] = ids.map(id => pts[id]);
    if (![a, b, c].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return;
    const path = document.createElementNS(SVG_NS, 'path');
    const color = tri.color || '#27ae60';
    const isSel = tri.id === selectedTriangleId;
    path.setAttribute('d', roundedTriangleHullPath(a, b, c));
    path.setAttribute('fill', color + '33');
    path.setAttribute('stroke', isSel ? '#e67e22' : color);
    path.setAttribute('stroke-width', isSel ? 3.2 : 2.5);
    path.setAttribute('stroke-linejoin', 'round');
    path.style.cursor = 'pointer';
    path.addEventListener('pointerdown', (e) => {
      if (drawingLink || drawingTriangle) return;
      e.stopPropagation();
      selectTriangle(tri.id);
    });
    groupForLayer(triLayerByKey.get(triKey(ids))).appendChild(path);
  });

  // TT 馬達本體：畫在桿件底下，曲柄轉在它上面。
  // 朝向＝對準接在馬達中心、非曲柄的那根桿（指向它的另一端）；沒有就朝最近的另一個地錨；都沒有才朝下。
  motorCenterIds.forEach(id => {
    const p = pts[id]; if (!p || !Number.isFinite(p.x)) return;
    let tgt = null;
    const others = comps.filter(c => c.type === 'bar' && !c.isInput && c.p1 && c.p2 && (c.p1.id === id || c.p2.id === id));
    if (others.length) {
      const b = others[0];
      const o = b.p1.id === id ? b.p2.id : b.p1.id;
      if (pts[o] && Number.isFinite(pts[o].x)) tgt = pts[o];
    }
    if (!tgt) {
      let bd = Infinity;
      groundIds.forEach(gid => {
        if (gid === id) return;
        const gp = pts[gid];
        if (gp && Number.isFinite(gp.x)) { const d = Math.hypot(gp.x - p.x, gp.y - p.y); if (d < bd) { bd = d; tgt = gp; } }
      });
    }
    const rotDeg = tgt ? Math.atan2(-(tgt.x - p.x), -(tgt.y - p.y)) * 180 / Math.PI : 0;
    drawTTMotor(p.x, p.y, rotDeg, motorLayer);
  });

  // 桿件：依層級放進對應的 <g>（內層在底、外層在上）；同層內紅色曲柄最後畫不被蓋住。
  let missingVisibleLinks = 0;
  const linksToDraw = [...(compiled.visualization.links || [])].sort((a, b) => {
    const ac = a.style === 'crank' ? 1 : 0;
    const bc = b.style === 'crank' ? 1 : 0;
    return ac - bc;
  });
  linksToDraw.forEach(l => {
    const a = pts[l.p1], b = pts[l.p2];
    if (l.hidden) return;
    if (triangleEdgeKeys.has([l.p1, l.p2].sort().join('|'))) return;
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) {
      missingVisibleLinks += 1;
      return;
    }
    const isSel = l.id && l.id === selectedLinkId;
    const editable = l.id && comps.some(c => c.id === l.id && c.type === 'bar' && c.fixedLen);
    const isPickCandidate = pickBars && pickBars.ids.includes(l.id);
    // 冰棒棍外形：填色扁棍取代原本的圓頭線段
    const stroke = isPickCandidate ? '#f39c12' : (isSel ? '#e67e22' : (l.style === 'crank' ? '#e74c3c' : (l.color || '#3498db')));
    const stick = document.createElementNS(SVG_NS, 'path');
    stick.setAttribute('d', barHullPath(a, b));
    stick.setAttribute('fill', stroke + '33');   // 淡色填滿，像一塊積木
    stick.setAttribute('stroke', stroke);
    stick.setAttribute('stroke-width', isSel || isPickCandidate ? 2.5 : 2);
    stick.setAttribute('stroke-linejoin', 'round');
    if (isPickCandidate) stick.setAttribute('stroke-dasharray', '10 7');
    if (editable || isPickCandidate) {
      stick.setAttribute('data-link-id', l.id);
      stick.style.cursor = 'pointer';
      stick.addEventListener('pointerdown', (e) => {
        if (drawingLink || drawingTriangle) return; // 畫圖模式：不攔截，讓 svg 起點處理
        e.stopPropagation();
        if (pickBars) { tryPickBar(l.id); return; }
        if (startFreeLinkDrag(e, l.id)) return;
        selectLink(l.id);
      });
    }
    const targetG = groupForLayer(linkLayer.get(l));
    targetG.appendChild(stick);

    // 在兩端冰棒棍頭上鑽孔：與外形同色的細圈，讓它看起來像真的打孔的扁棍。
    // 地錨（方塊）本身就是固定銷，不畫孔。
    const holeR = HULL_R_WORLD * View.getScale() * 0.72;
    [[a, l.p1], [b, l.p2]].forEach(([pt, pid]) => {
      if (groundIds.has(pid)) return;
      const hole = document.createElementNS(SVG_NS, 'circle');
      hole.setAttribute('cx', TX(pt.x)); hole.setAttribute('cy', TY(pt.y));
      hole.setAttribute('r', holeR);
      hole.setAttribute('fill', 'none');
      hole.setAttribute('stroke', stroke);
      hole.setAttribute('stroke-width', 1.5);
      hole.setAttribute('stroke-opacity', 0.7);
      hole.style.pointerEvents = 'none'; // 不擋下面桿身/上面節點的互動
      targetG.appendChild(hole);
    });
  });
  updateSolveBanner(sol, missingVisibleLinks);

  // 吸附高亮：拖曳時靠近的接點亮綠圈
  if (dragId && snapTarget && pts[snapTarget] && Number.isFinite(pts[snapTarget].x)) {
    const t = pts[snapTarget];
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', TX(t.x)); ring.setAttribute('cy', TY(t.y));
    ring.setAttribute('r', mobilePrompt() ? 24 : 14); ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#2ecc71'); ring.setAttribute('stroke-width', mobilePrompt() ? 4 : 3);
    svg.appendChild(ring);
  }

  // 節點（可拖曳；拖近別的接點會吸附合併）
  Object.keys(pts).forEach(id => {
    const p = pts[id];
    if (!Number.isFinite(p.x)) return;
    const isGround = groundIds.has(id);
    const isMotorCenter = motorCenterIds.has(id);
    const node = document.createElementNS(SVG_NS, (isGround && !isMotorCenter) ? 'rect' : 'circle');
    if (isMotorCenter) {
      // 馬達輸出軸：紅色軸蓋（TT 馬達本體已畫在底下）
      node.setAttribute('cx', TX(p.x)); node.setAttribute('cy', TY(p.y));
      node.setAttribute('r', id === dragId ? 8 : 6);
      node.setAttribute('fill', '#e74c3c');
      node.setAttribute('stroke', '#922b21'); node.setAttribute('stroke-width', 2);
    } else if (isGround) {
      const size = 14;
      node.setAttribute('x', TX(p.x) - size / 2); node.setAttribute('y', TY(p.y) - size / 2);
      node.setAttribute('width', size); node.setAttribute('height', size);
      node.setAttribute('rx', 3); node.setAttribute('fill', '#34495e');
    } else {
      node.setAttribute('cx', TX(p.x)); node.setAttribute('cy', TY(p.y));
      node.setAttribute('r', id === dragId ? 9 : 7); node.setAttribute('fill', '#fff');
      node.setAttribute('stroke', id === dragId ? '#2ecc71' : '#34495e');
      node.setAttribute('stroke-width', 3);
    }
    node.setAttribute('data-id', id);
    node.style.cursor = 'grab';
    node.addEventListener('pointerdown', (e) => onNodeDown(e, id));
    svg.appendChild(node);
    // 手機的接點命中放大改由 capture 階段的 pointerdown 統一處理（見下方），
    // 不再每個節點疊一圈透明命中圈。
  });

  drawDrawPreview();   // 畫桿模式：疊在最上層的拖曳預覽
  drawTrianglePreview(); // 三點桿模式：疊在最上層的三角預覽

  // 把這一幀的姿勢同步給 3D 預覽（開著時才推；平面路徑零負擔）
  // polygons 一併帶上：3D 用它把三點桿畫成實心板，並過濾掉與三角板邊重疊的桿（避免分身）。
  // motorCenterIds：3D 把這些中心畫成沉在機構背面的馬達，輸出軸往上帶動曲柄。
  lastModelInputs = { links: linksToDraw, pts, groundIds, motorCenterIds, polygons: compiled.visualization.polygons || [] };
  if (view3DActive) push3D();
}

// 用最近一幀的求解結果建場景模型，推進 3D viewer
function push3D() {
  if (!viewer3D || !lastModelInputs) return;
  const { links, pts, groundIds, motorCenterIds, polygons } = lastModelInputs;
  const model = buildSceneModel(links, pts, { groundIds, motorCenters: motorCenterIds, hullR: HULL_R_WORLD, polygons });
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

// 地面基線（機架的視覺暗示）
function drawGround() {
  const y = TY(0);
  const base = document.createElementNS(SVG_NS, 'line');
  base.setAttribute('x1', 0); base.setAttribute('y1', y);
  base.setAttribute('x2', W); base.setAttribute('y2', y);
  base.setAttribute('stroke', '#cfd6e0'); base.setAttribute('stroke-width', 2);
  svg.appendChild(base);
  for (let x = 20; x < W; x += 26) {
    const h = document.createElementNS(SVG_NS, 'line');
    h.setAttribute('x1', x); h.setAttribute('y1', y);
    h.setAttribute('x2', x - 10); h.setAttribute('y2', y + 10);
    h.setAttribute('stroke', '#dfe4ec'); h.setAttribute('stroke-width', 2);
    svg.appendChild(h);
  }
}

// 在馬達中心畫一顆 TT 減速馬達（黃色齒輪箱 + 側視方形馬達罐 + 輸出軸）。
// 畫在桿件底下當固定基座；尺寸用真實比例（mm）並隨縮放縮放。
// rotDeg＝整顆繞輸出軸旋轉的角度（0＝朝畫面下方）；本體沿局部 +Y 方向延伸。
function drawTTMotor(cx, cy, rotDeg = 0, parent = svg) {
  const s = View.getScale();
  const jx = TX(cx), jy = TY(cy);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${jx} ${jy}) rotate(${rotDeg})`);
  g.style.pointerEvents = 'none';
  const add = (el, attrs) => {
    const e = document.createElementNS(SVG_NS, el);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    g.appendChild(e);
    return e;
  };
  const sw = (v) => Math.max(1, v * s);
  // TT 馬達側視比例：齒輪箱 37×22.5、輸出軸距頂端 11、馬達罐約 20.5 高、22 長。
  const Wb = 22.5 * s, Lb = 37 * s, ax = 11 * s, Hc = 20.5 * s, Lc = 22 * s, r = 4 * s;
  const top = -ax;                             // 局部座標：軸在原點，齒輪箱頂端在 -ax
  // DC 馬達罐側視：靠齒輪箱端是平的，末端才收圓角。
  const canW = Hc, canTop = top + Lb - r, canEnd = canTop + Lc, canR = 5 * s;
  add('path', {
    d: [
      `M ${-canW / 2} ${canTop}`,
      `L ${canW / 2} ${canTop}`,
      `L ${canW / 2} ${canEnd - canR}`,
      `Q ${canW / 2} ${canEnd} ${canW / 2 - canR} ${canEnd}`,
      `L ${-canW / 2 + canR} ${canEnd}`,
      `Q ${-canW / 2} ${canEnd} ${-canW / 2} ${canEnd - canR}`,
      'Z'
    ].join(' '),
    fill: '#5f6b75', stroke: '#3a434b', 'stroke-width': sw(1)
  });
  // 齒輪箱（黃色圓角矩形）
  add('rect', { x: -Wb / 2, y: top, width: Wb, height: Lb, rx: r, ry: r, fill: '#f7c948', stroke: '#c9971b', 'stroke-width': sw(1.4) });
  // 齒輪箱上的固定孔裝飾
  add('circle', { cx: 0, cy: top + Lb * 0.66, r: 2.4 * s, fill: 'none', stroke: '#c9971b', 'stroke-width': sw(1) });
  parent.appendChild(g);
}

// ---- 零件：放下時自動設好「角色」----
function addAnchor() {
  pushUndo();
  const n = ++counter;
  exitDrawLink();
  exitDrawTriangle();
  cancelMotorMode();
  const p = mobilePrompt()
    ? View.worldFromScreen(W * 0.34, H * 0.62)
    : { x: -110, y: 0 };
  comps.push({ type: 'anchor', id: 'Anchor' + n, p1: { id: 'A' + n, type: 'fixed', x: p.x, y: p.y } });
  rebuild(); draw();
}

function clearAll() {
  pushUndo();
  pause();
  comps = []; theta = 0; counter = 0;
  selectedLinkId = null;
  selectedTriangleId = null;
  selectedNodeId = null;
  exitDrawLink();
  exitDrawTriangle();
  cancelMotorMode();
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('solveBanner').style.display = 'none';
  topo = { params: { theta: 0 }, tracePoint: '' };
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
  if (playPlan.mode === 'rock' && playDir > 0 && theta >= playPlan.hi) playDir = -1;
  if (playPlan.mode === 'rock' && playDir < 0 && theta <= playPlan.lo) playDir = 1;
  const step = () => {
    if (playPlan.mode === 'rock') {
      // 搖桿：在 lo..hi 間來回擺，到極限就反向（真實的搖桿物理）
      let next = theta + PLAY_STEP * playDir;
      if (next > playPlan.hi) { playDir = -1; next = theta + PLAY_STEP * playDir; }
      else if (next < playPlan.lo) { playDir = 1; next = theta + PLAY_STEP * playDir; }
      theta = next;
    } else {
      // 曲柄／平行四邊形：順向整圈轉
      theta = theta + PLAY_STEP * playDir;
    }
    document.getElementById('thetaVal').textContent = Math.round(norm360(theta));
    draw();
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
  const n = ++counter;
  cancelMotorMode();
  const linkCount = comps.filter(c => c.type === 'bar' && !c.isInput).length;
  const y = 45 + linkCount * 35; // 多根時錯開，避免一放就重疊
  const half = LINK_DEFAULT_LEN / 2;
  comps.push({
    type: 'bar', id: 'Link' + n, color: '#3498db',
    p1: { id: 'P' + n + 'a', type: 'floating', x: -half, y },
    p2: { id: 'P' + n + 'b', type: 'floating', x: half, y },
    lenParam: 'LL' + n, isInput: false, fixedLen: true // 連桿是固定長度的剛性桿
  });
  topo.params['LL' + n] = LINK_DEFAULT_LEN;
  rebuild(); draw();
  selectLink('Link' + n); // 放下就選取，方便馬上改長度
}

// ---- 畫桿模式：桌機點工具後移動游標調長度；手機則按住起點、拖到終點放開。----
function startDrawLink() {
  if (drawingLink) { exitDrawLink(); draw(); return; } // 再點一次＝取消
  pause();
  cancelMotorMode();
  exitDrawTriangle();
  deselectLink();
  drawingLink = true;
  svg.style.cursor = 'crosshair';
  if (mobilePrompt()) {
    drawActive = false;
    drawStart = null;
    drawStartNodeId = null;
    drawPreview = null;
  } else {
    drawActive = true;                       // 進來就活著：滑鼠一移動就更新（不必壓住）
    drawStart = View.worldFromScreen(W * 0.18, H * 0.26); // 支點＝畫布左上、靠連桿按鈕右側的空白處
    drawStartNodeId = nearestNodeId(drawStart);
    drawPreview = { x: drawStart.x + LINK_DEFAULT_LEN, y: drawStart.y }; // 先給一根預設長度
  }
  setBanner(promptText(
    '移動滑鼠改長度，按右鍵確定',
    '按住起點拖到終點，放開建立連桿'
  ));
  draw();
}
function exitDrawLink() {
  drawingLink = false;
  drawActive = false;
  drawStart = null;
  drawPreview = null;
  drawStartNodeId = null;
  svg.style.cursor = '';
  clearBanner();
}
// 找最靠近某世界座標的既有接點 id（吸附用），exclude 內的略過
function nearestNodeId(world, exclude = [], maxDist = snapWorld()) {
  const m = pointCoords();
  let best = null, bestD = maxDist;
  for (const id in m) {
    if (exclude.includes(id)) continue;
    const d = Math.hypot(m[id].x - world.x, m[id].y - world.y);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
// 從起點 start 拖到 cur 時，算出實際終點：靠近既有接點就吸附相接（長度＝實距），
// 否則長度對齊 8mm；拖得太短＝當作點一下，給預設長度。
function resolveDrawEnd(start, cur, startNodeId) {
  const endNodeId = nearestNodeId(cur, startNodeId ? [startNodeId] : []);
  if (endNodeId) {
    const p = pointCoords()[endNodeId];
    return { pos: { x: p.x, y: p.y }, len: Math.round(Math.hypot(p.x - start.x, p.y - start.y)), nodeId: endNodeId };
  }
  const dx = cur.x - start.x, dy = cur.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) return { pos: { x: start.x + LINK_DEFAULT_LEN, y: start.y }, len: LINK_DEFAULT_LEN, nodeId: null };
  const len = snapLego(dist);
  const k = len / (dist || 1);
  return { pos: { x: start.x + dx * k, y: start.y + dy * k }, len, nodeId: null };
}
function linkLenLabel(len, nodeId = null) {
  const holes = (Math.abs(len % LEGO_STEP) < 0.01) ? ` / ${Math.round(len / LEGO_STEP) + 1}孔` : '';
  return len + 'mm' + holes + (nodeId ? ' 🔗' : '');
}
function drawDrawPreview() {
  if (!drawingLink || !drawActive || !drawStart || !drawPreview) return;
  const res = resolveDrawEnd(drawStart, drawPreview, drawStartNodeId);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', barHullPath(drawStart, res.pos));
  path.setAttribute('fill', '#3498db22');
  path.setAttribute('stroke', '#3498db');
  path.setAttribute('stroke-width', 2);
  path.setAttribute('stroke-dasharray', '8 6');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  const labelText = linkLenLabel(res.len, res.nodeId);
  const isMobileLabel = mobilePrompt();
  const fontSize = isMobileLabel ? 22 : 13;
  const labelPadX = isMobileLabel ? 10 : 0;
  const labelPadY = isMobileLabel ? 6 : 0;
  const labelX = (TX(drawStart.x) + TX(res.pos.x)) / 2;
  const labelY = (TY(drawStart.y) + TY(res.pos.y)) / 2 - (isMobileLabel ? 18 : 10);
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
  if (drawingTriangle) { exitDrawTriangle(); draw(); return; }
  pause();
  cancelMotorMode();
  exitDrawLink();
  deselectLink();
  drawingTriangle = true;
  triangleStage = 'base';
  const a = View.worldFromScreen(W * 0.18, H * 0.26);
  const b = { x: a.x + 64, y: a.y };
  const first = resolveTrianglePointAt(a);
  trianglePoints = [first];
  trianglePreview = b;
  svg.style.cursor = 'crosshair';
  setBanner(promptText(
    '三點桿：先移動調第一段，按右鍵確定（8mm 倍數）',
    '三點桿：先拖曳調第一段，放開確定（8mm 倍數）'
  ));
  draw();
}
function exitDrawTriangle() {
  drawingTriangle = false;
  triangleStage = 'base';
  trianglePoints = [];
  trianglePreview = null;
  if (!drawingLink) svg.style.cursor = '';
  if (!drawingLink) clearBanner();
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
  return resolveTrianglePointAt(world, trianglePoints.map(p => p.nodeId));
}
function resolveTriangleBaseEnd(cur) {
  const start = trianglePoints[0];
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
  if (trianglePoints.length < 2) return null;
  const a = trianglePoints[0].pos;
  const b = trianglePoints[1].pos;
  const exclude = trianglePoints.map(p => p.nodeId).filter(Boolean);
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
  if (!drawingTriangle) return;
  const pts = trianglePoints.map(p => p.pos);
  let floating = null;
  if (trianglePreview) {
    floating = triangleStage === 'base' ? resolveTriangleBaseEnd(trianglePreview) : resolveTriangleThirdPoint(trianglePreview);
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
    c.setAttribute('fill', idx < trianglePoints.length ? '#27ae60' : '#fff');
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
    label.textContent = triangleStage === 'base'
      ? `${floating.len}mm`
      : `${floating.r1}/${floating.r2}mm`;
    svg.appendChild(label);
  }
}
function confirmTriangleBase(e) {
  const cur = worldFromEvent(e) || trianglePreview;
  if (!cur || trianglePoints.length !== 1) return;
  const picked = resolveTriangleBaseEnd(cur);
  if (!picked) return;
  trianglePoints.push(picked);
  triangleStage = 'third';
  const a = trianglePoints[0].pos, b = trianglePoints[1].pos;
  trianglePreview = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.max(40, picked.len * 0.8) };
  setBanner(promptText(
    '三點桿：移動選第三孔，按一下或右鍵確定（距離自動對齊 8mm）',
    '三點桿：拖曳選第三孔，放開確定（距離自動對齊 8mm）'
  ));
  draw();
}
function finishDrawTriangle(e) {
  const cur = worldFromEvent(e) || trianglePreview;
  if (triangleStage === 'base') { confirmTriangleBase(e); return; }
  if (!cur || trianglePoints.length < 2) return;
  const picked = resolveTriangleThirdPoint(cur);
  if (!picked) return;
  pushUndo();
  const n = ++counter;
  const suffix = ['a', 'b', 'c'];
  const all = [...trianglePoints, picked];
  const pts = all.map((p, i) => ({
    id: p.nodeId || `T${n}${suffix[i]}`,
    type: 'floating',
    x: p.pos.x,
    y: p.pos.y
  }));
  const dist = (a, b) => Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  const gParam = 'TG' + n, r1Param = 'TR1_' + n, r2Param = 'TR2_' + n;
  comps.push({
    type: 'triangle', id: 'Tri' + n, color: '#27ae60',
    p1: pts[0], p2: pts[1], p3: pts[2],
    gParam, r1Param, r2Param, sign: 1
  });
  topo.params[gParam] = dist(pts[0], pts[1]);
  topo.params[r1Param] = picked.r1 || dist(pts[0], pts[2]);
  topo.params[r2Param] = picked.r2 || dist(pts[1], pts[2]);
  selectedNodeId = pts[2].id;
  exitDrawTriangle();
  rebuild(); draw();
}
function finishDrawLink(e) {
  if (!drawStart) return;
  const cur = worldFromEvent(e) || drawPreview || drawStart;
  const res = resolveDrawEnd(drawStart, cur, drawStartNodeId);
  pushUndo();
  const n = ++counter;
  const lp = 'LL' + n;
  comps.push({
    type: 'bar', id: 'Link' + n, color: '#3498db',
    p1: { id: 'P' + n + 'a', type: 'floating', x: drawStart.x, y: drawStart.y },
    p2: { id: 'P' + n + 'b', type: 'floating', x: res.pos.x, y: res.pos.y },
    lenParam: lp, isInput: false, fixedLen: true
  });
  topo.params[lp] = res.len;
  // 端點落在既有接點上就合併相接（這就是「連接」）
  if (drawStartNodeId) comps = Model.mergePoints(comps, 'P' + n + 'a', drawStartNodeId);
  if (res.nodeId && res.nodeId !== drawStartNodeId) comps = Model.mergePoints(comps, 'P' + n + 'b', res.nodeId);
  exitDrawLink();
  rebuild(); draw();
  selectLink('Link' + n);
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
  placingMotor = false;
  pickBars = null;
  svg.style.cursor = '';
  clearBanner();
}
function placeMotor() {
  pause();
  exitDrawLink();
  exitDrawTriangle();
  deselectLink();
  placingMotor = true;
  pickBars = null;
  svg.style.cursor = 'crosshair';
  setBanner(promptText(
    '點一個接點放上馬達 🔴',
    '點一下接點放上馬達 🔴'
  ));
  draw();
}
function handleMotorOnNode(nodeId) {
  const bars = barsAtNode(nodeId);
  if (!bars.length) {
    setBanner('馬達要放在連桿的端點上喔');
    return;
  }
  if (bars.length === 1) {
    driveBarAt(bars[0].id, nodeId);
    return;
  }
  placingMotor = false;
  pickBars = { nodeId, ids: bars.map(b => b.id) };
  svg.style.cursor = '';
  setBanner(promptText(
    '這個接點有好幾根桿，點一下你要馬達轉的那根',
    '這個接點有好幾根桿，點一下要馬達轉的那根'
  ));
  draw();
}
function tryPickBar(barId) {
  if (!pickBars) return;
  if (pickBars.ids.includes(barId)) driveBarAt(barId, pickBars.nodeId);
  else cancelMotorMode();
}
function driveBarAt(barId, nodeId) {
  const bar = comps.find(c => c.id === barId && c.type === 'bar');
  if (!bar) return;
  const key = bar.p1.id === nodeId ? 'p1' : (bar.p2.id === nodeId ? 'p2' : null);
  if (!key) return;
  const otherKey = key === 'p1' ? 'p2' : 'p1';
  if (pointIsGround(bar[otherKey].id)) {
    placingMotor = false;
    pickBars = null;
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
  bar.phaseOffset = angDeg - theta;
  bar[key].type = 'fixed';
  bar[key].physicalMotor = '1';
  bar.isInput = true;
  bar.physicalMotor = '1';
  cancelMotorMode();
  rebuild(); draw();
}

// ---- 拖曳接點 + 靠近吸附合併（這就是「連接」）----
function startFreeLinkDrag(e, linkId) {
  const c = comps.find(x => x.id === linkId && isFreeLink(x));
  if (!c) return false;
  const w = worldFromEvent(e);
  if (!w) return false;
  preDragSnap = snapshotStr(); // 整段拖曳合併成一筆 undo
  pause();
  selectLink(linkId);
  dragLinkId = linkId;
  dragLastWorld = w;
  snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
  return true;
}
function onNodeDown(e, id) {
  e.preventDefault();
  if (drawingLink || drawingTriangle) return; // 畫圖模式：交給 svg 起點處理（會自動吸附到此接點）
  if (placingMotor) { e.stopPropagation(); handleMotorOnNode(id); return; }
  if (pickBars) return;
  preDragSnap = snapshotStr(); // 拖曳前狀態；若真的有變動，drag end 才記入 undo
  pause();
  // 選接點時收掉桿件 / 三點桿的長度面板，兩種屬性列互斥不疊在一起。
  selectedLinkId = null;
  selectedTriangleId = null;
  document.getElementById('lenEditor').style.display = 'none';
  selectedNodeId = id;
  updateRoleEditor();
  dragId = id; snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
function onDragMove(e) {
  if (drawingTriangle) {
    if (activePointers.size >= 2) return;
    const wp = worldFromEvent(e);
    if (wp) { trianglePreview = wp; draw(); }
    return;
  }
  if (drawingLink) { // 畫桿模式：滑鼠移動（或觸控拖曳）就更新自由端
    if (activePointers.size >= 2) return; // 雙指縮放優先
    if (drawActive) { const wp = worldFromEvent(e); if (wp) { drawPreview = wp; draw(); } }
    return;
  }
  if (activePointers.size >= 2) return; // 雙指縮放/平移中，不做單指拖曳
  const w = worldFromEvent(e); if (!w) return;
  if (dragLinkId && dragLastWorld) {
    const c = comps.find(x => x.id === dragLinkId && isFreeLink(x));
    if (!c) return;
    const dx = w.x - dragLastWorld.x;
    const dy = w.y - dragLastWorld.y;
    movePointById(c.p1.id, dx, dy);
    movePointById(c.p2.id, dx, dy);
    dragLastWorld = w;
    rebuild(); draw();
    return;
  }
  if (!dragId) return;
  let tx = w.x, ty = w.y;
  // 自由連桿：兩端都未固定、也沒接到別的桿時，拖端點等於整根平移。
  const free = freeLinkForPoint(dragId);
  if (free) {
    const p = pointCoords()[dragId];
    const dx = w.x - (p?.x || 0);
    const dy = w.y - (p?.y || 0);
    movePointById(free.p1.id, dx, dy);
    movePointById(free.p2.id, dx, dy);
    snapTarget = findNearest(dragId);
    rebuild(); draw();
    return;
  }
  // 固定長度連桿：已有約束時，拖端點繞另一端以固定半徑旋轉（圓規），長度不變
  const fl = fixedLinkFor(dragId);
  if (fl) {
    const other = fl.p1.id === dragId ? fl.p2 : fl.p1;
    const L = Math.max(1, topo.params[fl.lenParam] ||
      Math.hypot((fl.p2.x || 0) - (fl.p1.x || 0), (fl.p2.y || 0) - (fl.p1.y || 0)));
    let dx = w.x - (other.x || 0), dy = w.y - (other.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    tx = (other.x || 0) + dx / d * L;
    ty = (other.y || 0) + dy / d * L;
  }
  updatePointCoordsById(dragId, tx, ty);
  recomputeLengths();
  snapTarget = findNearest(dragId);
  rebuild(); draw();
}
function commitDragUndo() {
  if (preDragSnap == null) return;
  if (snapshotStr() !== preDragSnap) {
    undoStack.push(preDragSnap);
    if (undoStack.length > 60) undoStack.shift();
    updateUndoBtn();
  }
  preDragSnap = null;
}
function onDragEnd(e) {
  if (drawingTriangle) {
    if (e && e.pointerType && e.pointerType !== 'mouse') finishDrawTriangle(e);
    return;
  }
  if (drawingLink) { // 觸控/筆：放開＝確定長度（滑鼠改用右鍵確定，見 contextmenu）
    if (e && e.pointerType && e.pointerType !== 'mouse') finishDrawLink(e);
    return;
  }
  if (dragLinkId) {
    dragLinkId = null; dragLastWorld = null;
    rebuild(); draw();
    commitDragUndo();
    return;
  }
  if (!dragId) { preDragSnap = null; return; }
  const did = dragId, tgt = snapTarget;
  dragId = null; snapTarget = null;
  if (tgt) mergePoints(did, tgt);
  if (tgt && selectedNodeId === did) selectedNodeId = tgt;
  recomputeLengths();
  rebuild(); draw();
  commitDragUndo();
}

// ---- 選取連桿 + 改長度 ----
function selectLink(id) {
  cancelMotorMode();
  const c = comps.find(x => x.id === id && x.type === 'bar' && x.fixedLen);
  if (!c) return;
  selectedLinkId = id;
  selectedTriangleId = null;
  selectedNodeId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🔵 連桿長度';
  document.getElementById('triSideSelect').style.display = 'none';
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  renderLenEditor(Math.round(topo.params[c.lenParam] || 0));
  updateZliftButtons();
  draw();
}
function selectTriangle(id) {
  cancelMotorMode();
  if (!comps.some(x => x.id === id && x.type === 'triangle')) return;
  selectedTriangleId = id;
  selectedLinkId = null;
  selectedNodeId = null;
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('lenTitle').textContent = '🔺 三點桿';
  triSide = 'g';
  const sel = document.getElementById('triSideSelect');
  sel.value = 'g';
  sel.style.display = '';
  document.getElementById('lenControls').style.display = 'flex';
  document.getElementById('lenEditor').style.display = 'flex';
  renderTriValue();
  updateZliftButtons();
  draw();
}

// 三點桿：下拉切換要調的邊（底邊 g / P1–P3 r1 / P2–P3 r2），−/＋ 就調該邊
function triParamFor(c) {
  return triSide === 'r1' ? c.r1Param : triSide === 'r2' ? c.r2Param : c.gParam;
}
function renderTriValue() {
  const c = comps.find(x => x.id === selectedTriangleId);
  if (c) renderLenEditor(Math.round(topo.params[triParamFor(c)] || 0));
}
function setTriSide(side) {
  triSide = (side === 'r1' || side === 'r2') ? side : 'g';
  renderTriValue();
}
function changeTriSide(delta) {
  const c = comps.find(x => x.id === selectedTriangleId);
  if (!c) return;
  pushUndo();
  const key = triParamFor(c);
  const L = snapLego((topo.params[key] || 0) + delta);
  topo.params[key] = L;
  reshapeTriangle(c);   // 自由三點桿才看得到；已連接的由 solver 接手
  renderLenEditor(L);
  rebuild(); draw();
}
// 依 g/r1/r2 重擺三點桿：固定 P1 與底邊方向，P2 落在距 P1 為 g 處，P3 取兩圓交點
// 中離目前位置較近的那個（避免翻面）。三角不等式不成立時 P3 不動，交給驗證提示。
function reshapeTriangle(c) {
  const g = topo.params[c.gParam], r1 = topo.params[c.r1Param], r2 = topo.params[c.r2Param];
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
  const id = selectedLinkId || selectedTriangleId;
  if (!id) return;
  const c = comps.find(x => x.id === id);
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
  const id = selectedLinkId || selectedTriangleId;
  const c = id ? comps.find(x => x.id === id) : null;
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
  if (!selectedLinkId && !selectedTriangleId) return;
  selectedLinkId = null;
  selectedTriangleId = null;
  document.getElementById('lenEditor').style.display = 'none';
  draw();
}
function deleteSelectedPart() {
  const id = selectedLinkId || selectedTriangleId;
  if (!id) return;
  const comp = comps.find(c => c.id === id);
  if (!comp) return;
  pushUndo();
  pause();
  if (comp.type === 'bar' && comp.lenParam) delete topo.params[comp.lenParam];
  if (comp.type === 'triangle') {
    [comp.gParam, comp.r1Param, comp.r2Param].forEach(k => { if (k) delete topo.params[k]; });
  }
  comps = comps.filter(c => c.id !== id);
  selectedLinkId = null;
  selectedTriangleId = null;
  selectedNodeId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  rebuild(); draw();
}
function setLen(v) {
  const c = comps.find(x => x.id === selectedLinkId);
  if (!c) return;
  pushUndo();
  const L = snapLego(v);     // 對齊 8mm 樂高格
  topo.params[c.lenParam] = L;
  // 把 b 端重新擺到半徑 L（自由連桿才看得到；已連接的由 solver 接手）
  const dx = (c.p2.x || 0) - (c.p1.x || 0), dy = (c.p2.y || 0) - (c.p1.y || 0);
  const d = Math.hypot(dx, dy) || 1;
  c.p2.x = (c.p1.x || 0) + dx / d * L;
  c.p2.y = (c.p1.y || 0) + dy / d * L;
  renderLenEditor(L);
  rebuild(); draw();
}
function changeLen(delta) {
  if (selectedTriangleId) { changeTriSide(delta); return; }
  const c = comps.find(x => x.id === selectedLinkId);
  if (c) setLen((topo.params[c.lenParam] || 0) + delta);
}

// ---- 角色編輯（接點：自由 / 地錨 / 馬達）----
function updateRoleEditor() {
  const editor = document.getElementById('roleEditor');
  if (!editor) return;
  if (!selectedNodeId || !hasPoint(selectedNodeId)) {
    editor.style.display = 'none';
    return;
  }
  document.getElementById('roleStatus').textContent = roleLabel(selectedNodeId);
  const traceBtn = document.getElementById('traceBtn');
  if (traceBtn) {
    const isTrace = topo.tracePoint === selectedNodeId;
    traceBtn.textContent = isTrace ? '取消軌跡' : '設軌跡點';
    traceBtn.classList.toggle('trace-on', isTrace);
    traceBtn.title = isTrace ? '停止追蹤這個接點' : '追蹤這個接點走過的路徑';
  }
  editor.style.display = 'flex';
}
function setNodeRole(type) {
  if (!selectedNodeId || !hasPoint(selectedNodeId)) return;
  pushUndo();
  pause();
  if (type === 'floating') removeMotorAtPoint(selectedNodeId);
  if (type === 'fixed') removeMotorAtPoint(selectedNodeId);
  if (type === 'fixed') freezePointAtDisplay(selectedNodeId);
  setPointType(selectedNodeId, type);
  if (type === 'floating') removeAnchorsAtPoint(selectedNodeId);
  rebuild(); draw();
}
function removeNodeMotor() {
  if (!selectedNodeId || !hasPoint(selectedNodeId)) return;
  pushUndo();
  pause();
  removeMotorAtPoint(selectedNodeId);
  rebuild(); draw();
}
function toggleTracePoint() {
  if (!selectedNodeId || !hasPoint(selectedNodeId)) return;
  pushUndo();
  pause();
  topo.tracePoint = topo.tracePoint === selectedNodeId ? '' : selectedNodeId;
  trajectoryCache = null;
  updateRoleEditor();
  draw();
}

svg.addEventListener('pointermove', onDragMove);
svg.addEventListener('pointerup', onDragEnd);
svg.addEventListener('pointercancel', onDragEnd);
// 點空白處（背景/地面線，未 stopPropagation）取消選取
svg.addEventListener('pointerdown', () => {
  if (drawingLink || drawingTriangle) return; // 畫圖模式：交給工具處理
  if (placingMotor || pickBars) { cancelMotorMode(); draw(); return; }
  if (dragId || dragLinkId) return;
  selectedNodeId = null;
  updateRoleEditor();
  if (!dragId) deselectLink();
});

// ---- 縮放 / 平移手勢 ----
// 雙指：pinch 縮放 + 兩指中心平移；滑鼠滾輪：以游標為錨縮放。單指維持原本的拖曳。
const activePointers = new Map();   // pointerId -> { x, y }（client 座標）
let pinchState = null;              // { dist, cx, cy }

function abortSingleDrag() {
  // 第二指落下時，放棄正在進行的單指拖曳，避免與縮放打架
  dragId = null; dragLinkId = null; dragLastWorld = null; snapTarget = null;
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
  if (drawingLink || drawingTriangle || pickBars) return; // 這些模式各自有起點處理
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
  if (!drawingLink) return;
  if (activePointers.size >= 2) return; // 雙指縮放優先
  const w = worldFromEvent(e); if (!w) return;
  e.preventDefault();
  if (e.pointerType !== 'mouse' || mobilePrompt()) {
    drawStart = w;
    drawStartNodeId = nearestNodeId(drawStart);
    drawPreview = w;
    drawActive = true;
  } else {
    drawPreview = w;
  }
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
});
svg.addEventListener('pointerdown', (e) => {
  if (!drawingTriangle) return;
  if (activePointers.size >= 2) return;
  const w = worldFromEvent(e); if (!w) return;
  e.preventDefault();
  if (triangleStage === 'third' && e.pointerType === 'mouse') {
    trianglePreview = w;
    finishDrawTriangle(e);
    return;
  }
  trianglePreview = w;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
});
// 滑鼠右鍵＝確定長度 / 三點桿
svg.addEventListener('contextmenu', (e) => {
  if (!drawingLink && !drawingTriangle) return;
  e.preventDefault();
  if (drawingTriangle) finishDrawTriangle(e);
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
  Store.downloadJson(Store.toSnapshot(comps, topo, counter), 'blocks.json');
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
    url = Store.buildShareUrl(Store.toSnapshot(comps, topo, counter));
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

window.blocks = { placeMotor, addAnchor, addLink, startDrawLink, startDrawTriangle, clearAll, togglePlay, setLen, changeLen, setTriSide, selectLink, setNodeRole, removeNodeMotor, toggleTracePoint, deleteSelectedPart, bringPart, toggle3D, fitView, undo, saveFile, openFile, share, loadExample };
init();
