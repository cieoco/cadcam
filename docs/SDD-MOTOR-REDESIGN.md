# SDD — 機構積木「馬達」重設計（交接給實作 agent）

> 這是給接手實作的 agent 的待辦設計規格。對象檔案只有 **`blocks.html`**。
> 在分支 **`feat/role-first-blocks`** 上做。**求解器、`js/core/topology.js`、其它檔案一律不改。**
> 背景與整體願景見 [docs/SDD-KID-BLOCKS.md]。

## 1. 現況（baseline = commit f50ed0a）

`blocks.html` 是「角色優先」的小孩端機構環境，重用既有引擎
（`compileTopology` + `solveTopology`），自帶一個 SVG 畫布、零件盤、播放鍵。
目前零件盤有三塊：

- 📌 **地錨**（`addAnchor`）：放一個 `type:'fixed'` 的點 → 編成 `ground`。
- 🔴↻ **馬達曲柄**（`addMotorCrank`）：放一根 bar，p1 是 `type:'motor'`（自動接地）、
  `isInput:true` → 編成 `ground + input_crank`。**← 本次要拿掉。**
- 🔵 **連桿**（`addLink`）：固定長度剛性桿（`fixedLen:true`），可選取改長度、
  拖端點時像圓規繞另一端旋轉、靠近別的接點會吸附合併（`mergePoints`）。

已具備的互動：拖節點（`onNodeDown`/`onDragMove`/`onDragEnd`）、吸附合併、
連桿選取改長度（`selectLink`/`setLen`/`changeLen`/`deselectLink`）、播放迴圈。

## 2. 要做的改變（一句話）

**拿掉「馬達曲柄」這個綁定零件。改成：結構件只有「連桿」；「馬達」是一個獨立角色，
放到某個接點上，去驅動接在該點上的某一根連桿。**

機構學理由：曲柄本來就只是「一根被馬達帶動的連桿」。拆開後，「曲柄要不要有長度」
也自動解決了——曲柄就是連桿，沿用連桿那套固定長度＋長度編輯，**不需要任何特例**。

## 3. 引擎對應（關鍵，務必照這個做）

要「只驅動一根桿」，**不要**用點 type `'motor'` 去標記節點。原因：`compileTopology`
把 `fixed/motor/linear` 都編成 `ground`，而且 crank 推斷會讓**所有**端點落在該節點的桿
都變成 `input_crank`（見 topology.js 對 `p.type==='motor'` 的判斷）。多根共節點時會「全部被驅動」，無法只挑一根。

**正確做法**：把被選中那根桿、位於馬達節點的那個端點 `type` 設為 `'fixed'`（接地基座），
並把該桿 `isInput = true`。這樣：
- 樞紐點 `fixed` → `ground`；
- 該桿 `isInput` → `input_crank`（center 取那個 fixed 端，len_param = 桿長）；
- 同節點的其它桿不是 `isInput`、端點非 motor → 維持被動（dyad）。

無論合併順序如何都只驅動這一根。（曲柄長度即該連桿的 `fixedLen` 長度，編輯沿用現有面板。）

可選：把該端點 `physicalMotor = '1'`。

## 4. 互動流程規格

### 4.1 放置馬達
- 零件盤「🔴 馬達」改成呼叫 `placeMotor()`（不是立刻 add）。
- `placeMotor()`：進入「放置馬達」模式（`placingMotor = true`），游標改 crosshair，
  顯示橫幅「點一個接點放上馬達 🔴」，並先 `deselectLink()`。
- 在此模式點一個**節點**（`onNodeDown` 要先攔截）→ `handleMotorOnNode(nodeId)`：
  - 該節點上的 bar 數 = `comps.filter(c=>c.type==='bar' && (c.p1.id===nodeId||c.p2.id===nodeId))`
  - **0 根** → 橫幅提示「馬達要放在連桿的端點上喔」，停留在放置模式（或取消，擇一即可）。
  - **1 根** → 直接 `driveBarAt(bar.id, nodeId)`。
  - **≥2 根** → 進入「挑桿」模式：`pickBars = { nodeId, ids:[...] }`、`placingMotor=false`、
    橫幅「這個接點有好幾根桿，點一下你要馬達轉的那根」、候選桿高亮（橘色虛線粗線）。

### 4.2 挑要驅動的桿（≥2 根時）
- 在 `pickBars` 模式，點候選桿的線 → `driveBarAt(barId, pickBars.nodeId)`。
- 點非候選 / 背景 / 節點 → 取消挑桿模式（`cancelMotorMode()`）。

### 4.3 driveBarAt(barId, nodeId)
- 找到該 bar；`key = bar.p1.id===nodeId ? 'p1' : 'p2'`。
- `bar[key].type = 'fixed'`；`bar[key].physicalMotor = '1'`；`bar.isInput = true`。
- `cancelMotorMode()`；`rebuild(); draw()`。

### 4.4 取消
- `cancelMotorMode()`：`placingMotor=false; pickBars=null;` 清游標、隱藏橫幅。
- 點畫布背景（既有的 svg `pointerdown` 取消選取處）順便取消馬達模式。
- `clearAll()` 也要清掉 `placingMotor/pickBars/橫幅`。

## 5. 視覺
- **馬達樞紐節點**：紅色（`#e74c3c`）、略大的方塊。判定來源：
  `compiled.steps` 中 `type==='input_crank'` 的 `center` 集合。
- **被驅動的桿**：已有 `style:'crank'` → 畫紅色（現成）。
- **挑桿模式候選桿**：橘色虛線粗線（`stroke-dasharray`）。
- **模式橫幅**：畫布頂部置中的深色 pill；新增 `#modeBanner` 元素 + `.mode-banner` 樣式，
  `setBanner(text)` / `clearBanner()`。

## 6. onNodeDown 調整（避免和拖曳/取消衝突）
```
function onNodeDown(e, id) {
  e.preventDefault();
  if (placingMotor) { e.stopPropagation(); handleMotorOnNode(id); return; }
  if (pickBars) return;        // 挑桿模式點節點不處理，讓它冒泡去取消
  pause(); dragId = id; snapTarget = null;
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  draw();
}
```
連桿線的 `pointerdown`（在 draw 的 links 迴圈內）要先判斷：
`if (pickBars) { tryPickBar(l.id); return; } selectLink(l.id);`（並 `e.stopPropagation()`）。

## 7. 移除 / 收尾
- 移除零件盤「馬達曲柄」那塊 HTML、移除 `addMotorCrank` 函式、`window.blocks` 拿掉它、
  加入 `placeMotor`（及內部用的 `handleMotorOnNode/driveBarAt/tryPickBar/cancelMotorMode/setBanner/clearBanner`）。
- 連桿零件盤文案副標可改為「桿子，有長度」；空白提示改為
  「放一根🔵連桿 → 把🔴馬達放到它一端 → 按 ▶ 看它動」。
- 順序建議零件盤：地錨、連桿、馬達。

## 8. 驗收標準（請用真實瀏覽器驗，勿只跑單元）
建議用 playwright-core + 系統 Chrome（headless），透過 `python -m http.server` 服務後驗：
1. 放一根連桿 → 對它**一端**放馬達 → 該端變紅方塊、該桿變紅 → 按 ▶ → 桿繞該端轉動
   （取樣端點位置，移動量明顯 > 10px）。
2. 馬達放在**只有一根桿**的端點 → 不跳挑桿、直接驅動。
3. 兩根桿共用一個接點，馬達放上去 → 出現挑桿模式（候選高亮）→ 點其中一根 →
   只有那根被驅動（另一根維持被動）。
4. 連桿仍可選取改長度；被當曲柄的連桿改長度 → 旋轉半徑跟著變。
5. 用「連桿×3 + 兩個固定樞紐 + 馬達」接出 Grashof 四連桿 → 播放時耦合點擺動。
6. 點背景可取消放置/挑桿模式；清空會重置。
7. **無 JS 錯誤（`page.on('pageerror')` 為空）。**

## 9. 紅線
- 不改 `js/multilink/solver.js`、`js/core/topology.js` 等引擎；只動 `blocks.html`。
- 維持零相依、純前端、ES6 module。
- 保留既有連桿/拖曳/吸附/長度編輯行為不退化。

## 10. 之後（不在本次範圍，給接手者背景）
🔺三角板積木、「為什麼不動」的人話提示（偵測卡死/非 Grashof）、軌跡 wow（選點看畫出的線）。
順序與細節見 [docs/SDD-KID-BLOCKS.md] 第 6 節。
