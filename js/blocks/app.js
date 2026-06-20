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
import { solveTopology } from '../multilink/solver.js';
// 3D 唯讀預覽（懶載入 THREE，平面路徑完全不受影響）
import { buildSceneModel } from '../blocks3d/scene-model.js';
// 純邏輯模組
import * as View from './view.js';
import * as Model from './model.js';
import * as Motion from './motion.js';
import * as Store from './storage.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stageSvg');
const { W, H, HULL_R_WORLD, TX, TY } = View;
// 樂高 Technic 孔距 = 8mm，桿長（兩端孔中心距）= (孔數 - 1) × 8。長度一律對齊 8mm。
const LEGO_STEP = 8;
const LINK_DEFAULT_LEN = 88;   // 連桿預設長度（12 孔，對齊 8mm）
const LEGO_HOLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const legoLen = h => (h - 1) * LEGO_STEP;
const snapLego = v => Math.max(LEGO_STEP, Math.round((Number(v) || 0) / LEGO_STEP) * LEGO_STEP);

// ---- 狀態 ----
let comps = [];                       // wizard 風格的組件（角色就藏在 type 裡）
let topo = { params: { theta: 0 }, tracePoint: '' };
let compiled = null;
let theta = 0, raf = null, counter = 0;
let dragId = null, dragLinkId = null, dragLastWorld = null, snapTarget = null, selectedLinkId = null, selectedNodeId = null;
let placingMotor = false, pickBars = null;
// 畫桿模式（像 Word 畫表格：點工具後在畫面拖曳拉出連桿）
let drawingLink = false, drawActive = false, drawStart = null, drawPreview = null, drawStartNodeId = null;
let lastSolved = {};           // 上一幀求解成功的點位：給求解器挑「連續」分支 + 死點暫態回退
let prevSolved = {};           // 再上一幀：和 lastSolved 一起外插出「帶動量」的預測種子

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
  topo = { params: norm.params || {}, tracePoint: '' };
  counter = Math.max(norm.counter || 0, Store.highestIdNum(comps));
  theta = 0;
  selectedLinkId = null;
  selectedNodeId = null;
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('thetaVal').textContent = '0';
  rebuild(); draw();
  if (fit) fitView();
}

// ---- 綁定層：把純模組綁到本檔狀態，維持原呼叫端不變 ----
const barHullPath = View.barHullPath;
const worldFromEvent = (e) => View.worldFromEvent(svg, e);
const extrapolateSeed = Motion.extrapolateSeed;
const norm360 = Motion.norm360;
const PLAY_STEP = Motion.PLAY_STEP;
const planMotion = () => Motion.planMotion(compiled, topo, theta, lastSolved);

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
const findNearest = (id) => Model.findNearest(comps, id, View.snapWorld());
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
  document.getElementById('hint').style.display = comps.length ? 'none' : 'block';
  updateRoleEditor();
  scheduleAutosave();            // 任何結構變更都防丟（debounce，播放不觸發）
}

function draw() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  drawGround();
  if (!compiled || !comps.length) {
    updateSolveBanner(null, 0);
    drawDrawPreview();   // 空畫布也要顯示正在拉出的第一根連桿
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

  // 桿件：紅色曲柄最後畫，避免和藍色桿重疊時被蓋住。
  let missingVisibleLinks = 0;
  const linksToDraw = [...(compiled.visualization.links || [])].sort((a, b) => {
    const ac = a.style === 'crank' ? 1 : 0;
    const bc = b.style === 'crank' ? 1 : 0;
    return ac - bc;
  });
  linksToDraw.forEach(l => {
    const a = pts[l.p1], b = pts[l.p2];
    if (l.hidden) return;
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
        if (drawingLink) return; // 畫桿模式：不攔截，讓 svg 起點處理（可從桿上開始畫並吸附）
        e.stopPropagation();
        if (pickBars) { tryPickBar(l.id); return; }
        if (startFreeLinkDrag(e, l.id)) return;
        selectLink(l.id);
      });
    }
    svg.appendChild(stick);

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
      svg.appendChild(hole);
    });
  });
  updateSolveBanner(sol, missingVisibleLinks);

  // 吸附高亮：拖曳時靠近的接點亮綠圈
  if (dragId && snapTarget && pts[snapTarget] && Number.isFinite(pts[snapTarget].x)) {
    const t = pts[snapTarget];
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', TX(t.x)); ring.setAttribute('cy', TY(t.y));
    ring.setAttribute('r', 14); ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#2ecc71'); ring.setAttribute('stroke-width', 3);
    svg.appendChild(ring);
  }

  // 節點（可拖曳；拖近別的接點會吸附合併）
  Object.keys(pts).forEach(id => {
    const p = pts[id];
    if (!Number.isFinite(p.x)) return;
    const isGround = groundIds.has(id);
    const isMotorCenter = motorCenterIds.has(id);
    const node = document.createElementNS(SVG_NS, isGround ? 'rect' : 'circle');
    if (isGround) {
      const size = isMotorCenter ? 18 : 14;
      node.setAttribute('x', TX(p.x) - size / 2); node.setAttribute('y', TY(p.y) - size / 2);
      node.setAttribute('width', size); node.setAttribute('height', size);
      node.setAttribute('rx', 3); node.setAttribute('fill', '#34495e');
      if (isMotorCenter) node.setAttribute('fill', '#e74c3c');
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
  });

  drawDrawPreview();   // 畫桿模式：疊在最上層的拖曳預覽

  // 把這一幀的姿勢同步給 3D 預覽（開著時才推；平面路徑零負擔）
  lastModelInputs = { links: linksToDraw, pts, groundIds };
  if (view3DActive) push3D();
}

// 用最近一幀的求解結果建場景模型，推進 3D viewer
function push3D() {
  if (!viewer3D || !lastModelInputs) return;
  const { links, pts, groundIds } = lastModelInputs;
  const model = buildSceneModel(links, pts, { groundIds, hullR: HULL_R_WORLD });
  viewer3D.update(model);
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
    viewer3D.resize();
    push3D();
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

// ---- 零件：放下時自動設好「角色」----
function addAnchor() {
  pushUndo();
  const n = ++counter;
  exitDrawLink();
  cancelMotorMode();
  comps.push({ type: 'anchor', id: 'Anchor' + n, p1: { id: 'A' + n, type: 'fixed', x: -110, y: 0 } });
  rebuild(); draw();
}

function clearAll() {
  pushUndo();
  pause();
  comps = []; theta = 0; counter = 0;
  selectedLinkId = null;
  selectedNodeId = null;
  exitDrawLink();
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

// ---- 畫桿模式：點「連桿」→ 立刻出現一根連桿，游標控制其中一端 ----
// 滑鼠：移動就改長度，按右鍵確定。手機：拖曳後放開確定。支點固定在畫面中央。
function startDrawLink() {
  if (drawingLink) { exitDrawLink(); draw(); return; } // 再點一次＝取消
  pause();
  cancelMotorMode();
  deselectLink();
  drawingLink = true;
  drawActive = true;                       // 進來就活著：滑鼠一移動就更新（不必壓住）
  drawStart = View.centerWorld();          // 固定支點＝畫面中央
  drawStartNodeId = nearestNodeId(drawStart);
  drawPreview = { x: drawStart.x + LINK_DEFAULT_LEN, y: drawStart.y }; // 先給一根預設長度
  svg.style.cursor = 'crosshair';
  setBanner('移動滑鼠改長度，按右鍵確定（手機：拖曳後放開）');
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
function nearestNodeId(world, exclude = []) {
  const m = pointCoords();
  let best = null, bestD = View.snapWorld();
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
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', (TX(drawStart.x) + TX(res.pos.x)) / 2);
  label.setAttribute('y', (TY(drawStart.y) + TY(res.pos.y)) / 2 - 10);
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('font-size', '13');
  label.setAttribute('font-weight', '700');
  label.setAttribute('fill', '#2c5282');
  label.textContent = res.len + 'mm' + (res.nodeId ? ' 🔗' : '');
  svg.appendChild(label);
}
function finishDrawLink(e) {
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
  deselectLink();
  placingMotor = true;
  pickBars = null;
  svg.style.cursor = 'crosshair';
  setBanner('點一個接點放上馬達 🔴');
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
  setBanner('這個接點有好幾根桿，點一下你要馬達轉的那根');
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
  if (drawingLink) return; // 畫桿模式：交給 svg 的畫桿起點處理（會自動吸附到此接點）
  if (placingMotor) { e.stopPropagation(); handleMotorOnNode(id); return; }
  if (pickBars) return;
  preDragSnap = snapshotStr(); // 拖曳前狀態；若真的有變動，drag end 才記入 undo
  pause();
  selectedNodeId = id;
  updateRoleEditor();
  dragId = id; snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
function onDragMove(e) {
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
  document.getElementById('lenEditor').style.display = 'flex';
  renderLenEditor(Math.round(topo.params[c.lenParam] || 0));
  draw();
}

// 點選連桿時跳出的長度選項：以 8mm（樂高孔距）為間距，目前長度高亮。
function renderLenEditor(len) {
  const valEl = document.getElementById('lenValue');
  if (valEl) valEl.textContent = len;
  const wrap = document.getElementById('lenChips');
  if (!wrap) return;
  wrap.innerHTML = '';
  LEGO_HOLES.forEach(h => {
    const L = legoLen(h);
    const chip = document.createElement('button');
    chip.className = 'len-chip' + (L === len ? ' active' : '');
    chip.textContent = L;
    chip.title = h + ' 孔 / ' + L + 'mm';
    chip.addEventListener('click', () => setLen(L));
    wrap.appendChild(chip);
  });
}
function deselectLink() {
  if (!selectedLinkId) return;
  selectedLinkId = null;
  document.getElementById('lenEditor').style.display = 'none';
  draw();
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

svg.addEventListener('pointermove', onDragMove);
svg.addEventListener('pointerup', onDragEnd);
svg.addEventListener('pointercancel', onDragEnd);
// 點空白處（背景/地面線，未 stopPropagation）取消選取
svg.addEventListener('pointerdown', () => {
  if (drawingLink) return; // 畫桿模式：交給畫桿起點處理
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
  drawPreview = w;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
});
// 滑鼠右鍵＝確定長度
svg.addEventListener('contextmenu', (e) => {
  if (!drawingLink) return;
  e.preventDefault();
  finishDrawLink(e);
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

window.addEventListener('resize', () => { if (viewer3D && view3DActive) viewer3D.resize(); });

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

window.blocks = { placeMotor, addAnchor, addLink, startDrawLink, clearAll, togglePlay, setLen, changeLen, selectLink, setNodeRole, removeNodeMotor, toggle3D, fitView, undo, saveFile, openFile, share };
init();
