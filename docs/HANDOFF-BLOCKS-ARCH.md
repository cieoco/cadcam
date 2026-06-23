# 交接紀錄 — blocks 架構優化（feat/blocks-arch）

> 給接手的 AI 助手 / 開發者。搭配 `docs/SDD-BLOCKS-ARCHITECTURE.md`（總工作清單）一起看。
> 這份只記「目前做到哪、怎麼做的、下一步怎麼接」。

## 0. 一句話現況

在 `feat/blocks-arch` 分支上，已完成 SDD 的 **Phase 1**（draw build/update 分離）與
**Phase 3 的前半 + tools.js**（render.js / state.js / panels.js / tools.js 四個模組抽出）。
**已 rebase 到 `origin/main`（含遠端 3D slider 那筆 84c03b8）並 push。** 剩 `input.js` 一個模組未抽。

## 1. 分支與 commit

分支：`feat/blocks-arch`（已 rebase 疊在 `origin/main` 的 `84c03b8 Add 3D slider rail preview and frame handle` 之上，已 push 並設好 tracking）。

```
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

目前 `js/blocks/` 行數：app.js 1898（原本 ~2500）、tools.js 441、render.js 292、model.js 181、
examples.js 149、view.js 142、panels.js 108、motion.js 70、storage.js 61、state.js 58。

## 2. ⚠️ 驗證狀態（重要，先讀）

**所有改動只經過 `node --check` 語法檢查 + grep 比對驗證，沒有實機跑過瀏覽器。**
（執行環境無法開瀏覽器；專案也沒有 test runner——驗證一律是人工開 app 操作。）

使用者在中斷前回了「都 OK」，但**不確定那是否為瀏覽器實測結果**。
接手者請把「在瀏覽器驗證 commit `d8f8c44..80bdf56` 無回歸」當成**尚未完成、且應優先做**的事，
尤其在再往下疊 `input.js`（互動邏輯最複雜）之前。

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

## 4. 既定模式（接手請沿用）

1. **一個模組一個 commit**，每步 `node --check` + grep 驗證後再進下一步。
2. **依賴注入**：被抽出的模組 `import { S }` 直接共享狀態；其餘跨檔 helper 用
   `Module.init({...})` 注入（render.js / panels.js 已示範）。模組內以 module-level
   `let` 宣告 + init 內解構賦值，**函式本體一字不改**地照搬。
3. **函式本體照搬、零行為改變**。任何外觀/互動差異都視為回歸 bug。
4. 改名/搬移用小 Python 腳本做 word-boundary 取代，並注意：屬性存取（`x.comps`）、
   spread（`...comps`）、物件鍵（`theta:`）的安全處理（dda9234 的腳本可參考做法）。

## 5. 下一步：input.js（tools.js 已完成）

### 5a. tools.js（畫桿 / 畫三角 / 畫軌道模式）— ✅ 已完成（commit 9ff86f4）
做法見上面第 3 節的 9ff86f4 條目。**僅 node --check + grep 驗證，未在瀏覽器實測。**

### 5b. input.js（指標/拖曳/吸附合併/pinch）— **下一步、最複雜、最謹慎**
擬搬：`startFreeLinkDrag` `onNodeDown` `onDragMove` `commitDragUndo` `onDragEnd`
`abortSingleDrag` `endPointer` + 檔尾的 `svg.addEventListener(...)` 那批與 `activePointers`
（pinch 縮放 + capture 階段命中放大）。
- **交叉依賴提醒**：`render.js` 的 `drawSliderMountHole` 目前注入 `onNodeDown`。
  `onNodeDown` 一旦搬進 input.js，記得把 `Render.init({ svg, onNodeDown: Input.onNodeDown })`
  的來源改掉（順序：先 import Input，再 init Render）。
- 這塊讀寫 S.drag*/snapTarget 最密集，且和 draw 的吸附高亮、節點命中綁很緊。
  **務必抽完立刻在瀏覽器測拖曳/吸附/合併/雙指縮放**。

### 5c.（SDD 其餘）Phase 2 part-types 型別表、Phase 4 收尾
見 SDD。Phase 2 可在 tools/input 之後做，把散落的 `c.type ===` 收斂成查表。

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
