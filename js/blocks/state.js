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
  theta: 0,                                        // 目前驅動角度（播放迴圈與編輯都會改）

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
  showFrameHoles: true,                            // 顯示 8mm LEGO 孔陣列
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
