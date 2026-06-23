# 交接紀錄 — blocks 架構優化（feat/blocks-arch）

> 給接手的 AI 助手 / 開發者。搭配 `docs/SDD-BLOCKS-ARCHITECTURE.md`（總工作清單）一起看。
> 這份只記「目前做到哪、怎麼做的、下一步怎麼接」。

## 0. 一句話現況

在 `feat/blocks-arch` 分支上，已完成 SDD 的 **Phase 1**（draw build/update 分離）、
**Phase 3 模組切分全部**（render.js / state.js / panels.js / tools.js / input.js 五個模組抽出），
以及 **Phase 2 第一刀**（part-types.js 型別表 + 點 key 走表）。
**已 rebase 到 `origin/main`（含遠端 3D slider 那筆 84c03b8）並 push。**
剩 SDD **Phase 2 其餘**（draw / 長度 / 角色等 `c.type` 分流逐步掛進表）與 **Phase 4**（收尾）。

## 1. 分支與 commit

分支：`feat/blocks-arch`（已 rebase 疊在 `origin/main` 的 `84c03b8 Add 3D slider rail preview and frame handle` 之上，已 push 並設好 tracking）。

```
54eb38a refactor(blocks): add part-types table, route point-key enumeration through it
f4b170b refactor(blocks): extract pointer/gesture interactions to input.js
3990de7 docs(blocks): update handoff for tools.js + rebase onto origin/main
9ff86f4 refactor(blocks): extract tool-mode interactions to tools.js
e399297 docs(blocks): add handoff record for blocks architecture refactor
425dc01 refactor(blocks): extract editing panels to panels.js
cdae546 refactor(blocks): hoist shared editing state into state.js (S object)
c5c1092 refactor(blocks): extract SVG drawing primitives to render.js
a3892f1 perf(blocks): split draw() into build/update to stop per-frame SVG teardown
84c03b8 Add 3D slider rail preview and frame handle   ← 遠端基底（rebase 時手動併進重構）
```

> rebase 衝突重點（已解）：`84c03b8` 把舊 `drawGround`(地板基線) 改名 `drawGroundBaseline`
> 並新增依賴 app 狀態的新 `drawGround`(機架連接線)＋`drawFrameHandle`＋`S.dragFrame`。
> 純基線基元隨重構搬進 render.js 改名 `drawGroundBaseline`；機架兩函式與 `dragFrame`
> 留 app/state（`S.dragFrame` 已加入 state.js）。

`docs/SDD-BLOCKS-ARCHITECTURE.md` 與本交接檔均已入版控。
（`.claude/` 是未追蹤的本機設定，**不要** commit。）

目前 `js/blocks/` 行數：app.js 1631（原本 ~2500）、tools.js 441、input.js 318、render.js 292、
model.js 180、examples.js 149、view.js 142、panels.js 108、motion.js 70、storage.js 61、state.js 58、
part-types.js 34。

## 2. ⚠️ 驗證狀態（重要，先讀）

**所有改動只經過 `node --check` 語法檢查 + grep / 依賴對照驗證；環境開不了瀏覽器。**
（專案沒有 test runner——驗證一律是人工開 app 操作。）

進度（使用者回報）：
- `perf split → tools.js`（含 render/state/panels）已**經使用者在瀏覽器實測 OK**。
- **`input.js`（f4b170b）尚未瀏覽器實測** —— 互動邏輯最密集的一塊，**請優先實機驗證**：
  拖曳節點 / 吸附綠圈 + 放開合併 / 自由連桿整根平移 / 固定連桿圓規旋轉 /
  機架🏠把手整組平移 / 雙指 pinch 縮放＋平移 / 滾輪縮放 / 手機點接點優先命中 /
  畫桿・三點桿模式（觸控放開確定、滑鼠右鍵確定）。

驗證方式：`python -m http.server 8000` → 開 `http://localhost:8000/blocks.html`，跑第 6 節的黃金流程。

## 3. 每個 commit 做了什麼 + 用的模式

### d8f8c44 — Phase 1：draw build/update 分離（效能）
播放時原本每幀 `while(svg.firstChild) removeChild` 重建整棵 SVG。改成兩條路徑：
- `draw()`（結構變更走）：建場景，並為三角板/連桿/馬達/節點各註冊一個 `(pts)=>更新幾何`
  的閉包到 `frameUpdaters`；滑軌移進專屬 `sliderLayer`，繪製碼抽成 `drawSliders()`。
- `renderFrame()`（**只有 `play()` 迴圈呼叫**）：只重解 + 跑閉包就地改 `d/cx/transform`，不拆 DOM。
- 抽出共用 helper `solveFrame()`（解一幀）、`computeMotorRotDeg()`（馬達朝向）。
- 無效（解不出）的元素改「建好但隱藏 `display:none`」而非「不畫」，像素一致。

### 4834782 — render.js：SVG 繪製基元
10 個純繪製函式（drawGround / drawTTMotor / drawMG995Servo / drawMotorLabel /
drawMountLabel / drawSliderMountHole / drawSliderTrack / drawSliderTravelMarks /
drawSliderBlock / drawPiston）搬到 `render.js`，app 改以 `Render.*` 呼叫。
- render.js 只 import view.js（TX/TY/barHullPath/getScale）。
- 兩個對 app 的依賴用 **`Render.init({ svg, onNodeDown })` 注入**（在 app 的 `init()` 裡呼叫）。

### dda9234 — state.js：共用狀態物件 S（**Phase 3 的關鍵基礎**）
把跨模組共享的可變狀態收進 `state.js` 的單一物件 `S`，全檔以 `S.xxx` 存取（509 處改名）。
- **為什麼用一個物件**：ES module 具名匯出是唯讀 live binding，匯入端不能重新指派
  （`S.comps = …` 可以，`comps = …` 不行）。收進物件後，各模組才能共讀共寫同一份狀態。
- **S 內含**：comps / topo / compiled / counter / theta / selected{Link,Triangle,Node,Slider}Id /
  drag{Id,LinkId,LastWorld} / snapTarget / preDragSnap / triSide / placingMotor / pickBars /
  pendingMotorType / drawing{Link,Triangle} / drawActive / drawStart / drawPreview /
  drawStartNodeId / drawKind / triangleStage / trianglePoints / trianglePreview /
  undoStack / autosaveTimer。
- **仍留在 app.js 的 local 狀態**（render/播放迴圈/3D 內部，待各自模組抽出時再搬）：
  `raf` / `lastSolved` / `prevSolved` / `trajectoryCache` / `viewer3D` / `view3DActive` /
  `lastModelInputs` / `frameUpdaters` / `sliderLayer` / `recountBanner` / `playPlan` / `playDir`。

### 80bdf56 — panels.js：編輯面板呈現
9 個「讀 S + 寫 DOM」的面板函式搬到 `panels.js`：renderLenEditor / setLenButtonTitles /
nodeRoleLabel / renderNodePosition / renderTriValue / updateZliftButtons /
updateServoEditor / updateStrokeEditor / updateRoleEditor。app 端 23 處改 `Panels.*`。
- 跨檔 helper 用 **`Panels.init({ pointCoords, sliderMountInfo, roleLabel, triParamFor,
  hasPoint, motorBarForCenter })` 注入**。
- 滑軌細項面板（綁滑軌幾何/控制器）**暫留 app.js**：setSliderDetailRows /
  renderSliderDetails / renderSliderBaseButton + 幾何 helper（railLength / sliderBodyLength /
  sliderCarrierLength / sliderRailOffset / sliderTravelStart / sliderTravelEnd /
  sliderProjectedDistance / normalizeSliderRange）。

### 9ff86f4 — tools.js：工具模式互動（Phase 3 後半 / 5a）
21 個「工具模式」函式搬到 `tools.js`：startDrawLink / startDrawRail / beginDraw / exitDrawLink /
nearestNodeId / resolveDrawEnd / linkLenLabel / drawDrawPreview / startDrawTriangle /
exitDrawTriangle / resolveTrianglePointAt / resolveTrianglePoint / resolveTriangleBaseEnd /
legoLength / resolveTriangleThirdPoint / drawTrianglePreview / confirmTriangleBase /
finishDrawTriangle / finishDrawLink / finishDrawRail / convertLinkToSlider。
- import 純模組：`{ S }`、`* as View`（W/H/TX/TY/barHullPath/worldFromScreen）、`* as Model`（mergePoints）。
- 重宣告純常數（與 app.js 同值）：SVG_NS / LEGO_STEP / LINK_DEFAULT_LEN / snapLego / roundMm。
- **`Tools.init({...})` 注入** 17 項 app 動作 / 查詢：svg / draw / rebuild / pushUndo / pause /
  cancelMotorMode / deselectLink / selectLink / selectSlider / setBanner / clearBanner /
  worldFromEvent / pointCoords / nearestDisplayToPoint / snapWorld / mobilePrompt / promptText。
- app 端外部呼叫改 `Tools.*`（exitDraw* / drawDrawPreview / drawTrianglePreview / finishDraw* /
  nearestNodeId）；`window.blocks` 的 startDraw* 與 convertLinkToSlider 改指 `Tools.*`，HTML onclick 不動。
- export 只開外部會用到的 11 個；其餘（beginDraw / resolve* / legoLength / linkLenLabel /
  confirmTriangleBase / finishDrawRail）維持模組內部不 export。

### f4b170b — input.js：指標 / 手勢互動（Phase 3 模組切分收尾 / 5b）
搬移 8 個函式：startFreeLinkDrag / onFrameHandleDown / onNodeDown / onDragMove /
commitDragUndo / onDragEnd / abortSingleDrag / endPointer，加上 module 狀態 `activePointers`
/ `pinchState`，以及原 app.js 檔尾那批 `svg.addEventListener`（背景取消選取 / pinch 雙指縮放平移 /
滾輪縮放 / 手機 capture 階段接點優先命中 / 畫桿・三點桿起點 / 右鍵確定）。
- **事件監聽改在 `Input.init()` 內掛載**（取代原本 module 頂層的側效果）；時序仍在第一次 draw
  之前（app.init() 內呼叫），行為不變。listener 掛載順序原封不動。
- import 純模組 `{ S }` / `* as View`，並呼叫 `* as Tools`（畫圖收尾 / 命中 nearestNodeId）、
  `* as Panels`（updateRoleEditor）。`NODE_TAP_PX` 重宣告（與 app.js 同值）。
- **`Input.init({...})` 注入 25 項** app 動作 / 查詢：svg / draw / rebuild / pause /
  cancelMotorMode / deselectLink / selectLink / worldFromEvent / pointCoords / mobilePrompt /
  snapshotStr / updateUndoBtn / nearestDisplayTo / nearestDisplayToPoint / movePointById /
  updatePointCoordsById / recomputeLengths / mergePoints / isFreeLink / freeLinkForPoint /
  fixedLinkFor / inputCrankMovingEnd / handleMotorOnNode / setSliderDetailRows / frameNodeIds。
- **交叉依賴（已處理）**：`onNodeDown` 搬走後，app 端 node pointerdown 改 `Input.onNodeDown`、
  free-link 拖曳改 `Input.startFreeLinkDrag`、機架把手改 `Input.onFrameHandleDown`，
  且 `Render.init({ svg, onNodeDown: Input.onNodeDown })`（滑軌固定孔互動的來源）。
- onFrameHandleDown 是 84c03b8 新增、doc 原清單未列，但同屬拖曳起點、共用 drag 生命週期，
  一併搬入並 export。export 面：startFreeLinkDrag / onFrameHandleDown / onNodeDown / init。

### 54eb38a — part-types.js：零件型別表（Phase 2 第一刀 / 痛點 C）
新增 `js/blocks/part-types.js`，宣告 `PART_TYPES`（bar / triangle / slider / anchor 各自的
`pointKeys`）＋ `ALL_POINT_KEYS`（聯集）＋ `pointKeysFor(c)`（已知型別走表、未知型別回聯集後備）。
- 把原本散落兩處的扁平點 key 清單收斂到表：model.js 刪 `const POINT_KEYS`、6 處改 `pointKeysFor(c)`；
  app.js `frameNodeIds` 刪 `FRAME_POINT_KEYS`、改 `pointKeysFor(c)`。
- **行為等價**：各迴圈本就 `if (c[k] && c[k].id …)` 守門，型別 pointKeys 與實際建立 key 一致
  （已對 examples.js / 各建立點核對；anchor=p1 / bar=p1,p2 / triangle=p1,p2,p3 / slider=全部）。
- **區分兩種 type**：元件型別 `c.type`（本表 key）vs 接點角色 `point.type`（fixed/floating/motor/
  linear/ground，非本表）。後者那批 `=== 'fixed'` 之類**不是**型別表要收的東西。
- 後續可漸進把更多 `c.type` 分流掛進表項（draw 的 build/update 分派、長度、預設角色…），
  但 draw 分派較大且和 render/play 綁緊，要小心、分刀做、逐刀瀏覽器驗證。

## 4. 既定模式（接手請沿用）

1. **一個模組一個 commit**，每步 `node --check` + grep 驗證後再進下一步。
2. **依賴注入**：被抽出的模組 `import { S }` 直接共享狀態；其餘跨檔 helper 用
   `Module.init({...})` 注入（render.js / panels.js 已示範）。模組內以 module-level
   `let` 宣告 + init 內解構賦值，**函式本體一字不改**地照搬。
3. **函式本體照搬、零行為改變**。任何外觀/互動差異都視為回歸 bug。
4. 改名/搬移用小 Python 腳本做 word-boundary 取代，並注意：屬性存取（`x.comps`）、
   spread（`...comps`）、物件鍵（`theta:`）的安全處理（dda9234 的腳本可參考做法）。

## 5. 下一步：Phase 2 / Phase 4（模組切分已全部完成）

### 5a. tools.js — ✅ 已完成（9ff86f4，已瀏覽器實測 OK）
### 5b. input.js — ✅ 已完成（f4b170b，**尚未瀏覽器實測，請優先驗證**，見第 2 節清單）

### 5c. SDD Phase 2：part-types 型別查表
- 第一刀（點 key 走表）✅ 已完成（54eb38a，見第 3 節）。
- **其餘（下一步）**：把更多 `c.type === 'bar'/'triangle'/'slider'/'anchor'` 分流逐步收進表——
  candidate：model.js 的 `recomputeLengths`/`fixedLinkFor` 等 bar 專屬判斷、draw 的繪製分派
  （build/update 閉包，較大且綁 render/play，**分刀做、逐刀瀏覽器驗證**）、預設角色 / 長度語意。
  挑無行為變更、可獨立驗證的小刀優先。app.js 目前 `.type ===` 仍約 36 處（含不少是 point.type）。

### 5d.（收尾）SDD Phase 4
最後收尾項（痛點 D/E）：`getTrajectoryData()` 的 cache key 從 `JSON.stringify` 改結構版本號
（dirty flag / counter）；評估 `examples.js` 與 `js/examples/` 是否共用註冊機制（先 audit 再決定）。
其餘 render/播放迴圈/3D 內部狀態的歸屬、文件對齊等，見 SDD。

> 提醒：再往下做任何一步之前，**先把 input.js 在瀏覽器實測過**（第 2 節清單），
> 避免把後續整理疊在未驗證的互動層上。

## 6. 黃金驗證流程（每個模組抽完都跑一遍）

`python -m http.server 8000` → `http://localhost:8000/blocks.html`：
1. 載入每個範例（📘 範例下拉）→ ▶ 播放 → 暫停。
2. 拖曳節點；拖近另一接點看**吸附綠圈 + 放開合併**。
3. 選連桿改長度（−/＋）、選三點桿切邊（底/邊1/邊2）改長度、選滑軌。
4. 選接點 → 角色面板（變自由/設地錨/拿掉馬達）、**設軌跡點**看軌跡線、X/Y 微調。
5. 動力來源：TT馬達整圈轉；MG995 → **伺服角度面板**來回擺；線性致動器（放滑塊上）→ **行程面板**。
6. 疊放上移/下移、🗑刪除、↩復原、💾存檔/📂開啟、🔗分享連結貼到新分頁還原、3D 預覽開著播放。
7. **手機/窄視窗**：零件盤在底部、播放順暢（Phase 1 的重點）。

## 7. 紅線（務必遵守）

- **不改求解器**：`js/multilink/solver.js`、`js/core/topology.js` 數學一行不動。
- **元件 comps 維持 plain JSON**：不可改成 class 實例（undo/存檔/分享靠它）。
- **零相依、純前端、ES6 module 靜態載入**，無 build step、無 npm。
- 維持 `window.blocks` 對外進入點不動（HTML inline onclick 依賴它）。
- 遵守 `.agent/rules.md`：禁止順便修改、改動範圍最小化、保留既有中英文註解與風格。

## 8. 快速健檢指令

```bash
# 語法檢查全部 blocks 模組
cd js/blocks && for f in *.js; do node --check "$f" || echo "$f FAIL"; done

# 抽模組後：確認 app.js 沒有殘留「該搬走卻沒加前綴」的裸呼叫（範例）
grep -nP "(?<![\\w.])(onNodeDown|onDragMove|startDrawLink)\\b" js/blocks/app.js | grep -vP "(Input|Tools)\\."
```
