/**
 * blocks / state
 *
 * 共用可變狀態的單一真相來源（single source of truth）。
 *
 * 為什麼是「一個物件」而不是一堆 `export let`：ES module 的具名匯出是**唯讀**的
 * live binding，匯入端不能重新指派（`S.comps = ...` 可以，`comps = ...` 不行）。
 * 把狀態收進一個物件 `S`，各 UI 模組（app / 之後的 panels / tools / input）
 * 就能共讀共寫同一份狀態，彼此不必互相 import。
 *
 * 這裡只放「編輯 / 機構 / 選取 / 拖曳 / 工具模式 / undo」這類跨模組共享的狀態。
 * 純 render / 播放迴圈 / 3D 的內部狀態仍留在 app.js，待各自模組抽出時再一起搬。
 */

export const S = {
  // ---- 機構資料 ----
  comps: [],                                       // wizard 風格的組件（角色就藏在 type 裡）
  topo: { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' },
  compiled: null,
  counter: 0,
  theta: 0,                                        // 「目前控制中馬達」的驅動角度（播放迴圈與編輯都會改）
  activeMotor: '1',                                // S.theta 對應的馬達編號；切換時把舊角度凍進 motorAngles
  motorAngles: {},                                 // 非控制中馬達的凍結角度（度），key = physicalMotor 編號

  // ---- 選取 ----
  selectedLinkId: null,
  selectedTriangleId: null,
  selectedNodeId: null,
  selectedSliderId: null,
  selectedGearId: null,

  // ---- 拖曳 ----
  dragId: null,
  dragLinkId: null,
  dragFrame: false,                                // 拖曳「機架」把手：所有固定銷整組平移
  dragLastWorld: null,
  snapTarget: null,
  preDragSnap: null,                               // 拖曳前的狀態：整段拖曳合併成一筆 undo

  // ---- 機架 / LEGO 視覺 ----
  lockFrameHoles: false,                           // 拖曳固定孔/機架時吸附到 8mm pitch

  // ---- 工具 / 放置模式 ----
  triSide: 'g',                                    // 三點桿目前在調哪一條邊：'g' 底邊 / 'r1' / 'r2'
  placingMotor: false,
  pickBars: null,
  pendingMotorType: 'tt',                          // 下一次放置的動力來源型號：'tt' / 'mg995'

  // ---- 畫桿 / 畫三角模式 ----
  drawingLink: false,
  drawActive: false,
  drawStart: null,
  drawPreview: null,
  drawStartNodeId: null,
  drawKind: 'link',                                // 拖出線段時要建什麼：'link' 連桿 / 'rail' 滑軌
  drawingTriangle: false,
  triangleShape: 'triangle',                         // 'triangle' 三點桿 / 'jaw' 夾爪板
  triangleStage: 'first',                            // 'first' 放第一點 / 'base' 底邊 / 'third' 第三點
  trianglePoints: [],
  trianglePreview: null,
  // 板件：逐點畫孔、右鍵收尾。前 3 孔＝機構求解孔，第 4 孔起＝造形孔（順序決定角色）
  drawingPolygon: false,
  polygonPoints: [],                                 // [{ nodeId, pos:{x,y} }] 依畫的順序
  polygonPreview: null,
  dragShape: null,                                   // 造形點拖曳中：{ compId, vi, moved, startX, startY }

  // ---- 課堂閉環：復原 / 自動存檔 ----
  undoStack: [],                                   // 每筆是一份 snapshot 字串（變更前的狀態）
  autosaveTimer: null,
};

// 已被任何動力來源（桿 / 齒輪 / 滑軌）占用的馬達編號。
export function usedMotorIds() {
  const ids = new Set();
  S.comps.forEach(c => {
    [c, c.p1, c.p2, c.p3].forEach(o => {
      const v = o && (o.physicalMotor || o.physical_motor);
      if (v) ids.add(String(v));
    });
  });
  return ids;
}
export function nextMotorId() {
  const used = usedMotorIds();
  let n = 1;
  while (used.has(String(n))) n += 1;
  return String(n);
}

// 切換「目前控制中」的馬達：舊馬達的角度凍結進 S.motorAngles，新馬達接手 S.theta。
// startTheta 省略時保留現值。放在這裡（而非 motor-tools）因為齒輪域 / 輸入域也要切換控制權。
export function activateMotor(motorId, startTheta) {
  const id = String(motorId);
  if (String(S.activeMotor) !== id) S.motorAngles[String(S.activeMotor)] = S.theta;
  delete S.motorAngles[id];
  S.activeMotor = id;
  if (startTheta !== undefined) S.theta = startTheta;
  if (S.topo && S.topo.params) S.topo.params.theta = S.theta;
}

// 目前所有馬達的角度（active 用 S.theta、其餘用凍結值）——餵給 solveTopology 的 motorAngles。
export function motorAnglesNow() {
  return { ...S.motorAngles, [String(S.activeMotor)]: S.theta };
}

// 掃描 / 播放規劃用：只含「非 active」馬達的凍結角，active 的角度由掃描逐步帶入。
export function frozenMotorAngles() {
  const m = { ...S.motorAngles };
  delete m[String(S.activeMotor)];
  return m;
}
