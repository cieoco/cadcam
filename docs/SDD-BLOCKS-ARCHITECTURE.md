# SDD — 機構積木（blocks）架構優化工作清單

> 聚焦設計文件。只涵蓋 `blocks.html` / `js/blocks/` 這條線的**內部架構整理**，
> **不是**整個軟體的 SDD，也**不改任何使用者可見行為**。
> 求解器、機構登錄、匯出、既有 mechanism 工具一律不動。
>
> **更新（已超出本 SDD 範圍）**：本 SDD 的重構是 MVP，已大致收斂。專案目標已升級為
> **機構繪製＋模擬系統**，開始加入「基礎機件」（齒輪已落地、後續凸輪/齒條/彈簧），
> **這會擴充求解器**（原「不動求解器」紅線僅限重構期）。新方向與齒輪做法見
> `docs/HANDOFF-BLOCKS-ARCH.md` §0.5 與 plan 檔 `~/.claude/plans/refactored-sniffing-narwhal.md`。
> 其中 §4 Phase 2 的 draw 繪製分派，現在會搭著新機件一起長成「型別登錄表」。

## 1. 背景與動機

`blocks.html` 的未來目標：成為**各類機構的模擬器**，在電腦與手機上都能流暢操作，
且功能會持續長大（更多零件種類、更多機構、更多互動）。

問題在於：現在 `js/blocks/app.js` 已是 **2427 行 / 107KB 的單檔巨石**，
把「狀態 / 繪製 / 輸入 / 工具模式 / 面板 UI / 3D / 檔案」全部混在一起。
規模還小，所以**現在動成本最低**；等功能變大再拆會非常痛。

設計北極星：**趁還沒變大，先把邊界畫好，讓「加一種新零件 / 新機構」是加一筆設定，而不是全檔搜 `c.type ===`。**

## 2. 現況盤點（先肯定做對的，再列要改的）

### 2.1 已經做對的 — 不要動

- **solver 有重用**：`app.js` 直接用 `compileTopology` + `multilink/solver.js` 的
  `solveTopology` / `sweepTopology`，沒有重寫求解數學。各類機構本質都是 multilink topology。
- **跨裝置輸入做得不錯**：統一 Pointer Events（不分 mouse/touch）、`setPointerCapture`、
  雙指 pinch 縮放（`activePointers`）、`touch-action:none`、`100dvh`、`env(safe-area-inset)`、
  `(pointer: coarse)` 命中放大。**這塊不在本次整理範圍。**
- **資料是純 JSON**：元件 `comps` 是 plain object，undo / 存檔 / 分享連結全靠這點。

### 2.2 會痛的（本 SDD 要處理的）

| # | 問題 | 證據 | 影響 |
|---|---|---|---|
| A | 播放時每幀重建整棵 SVG | `draw()` 開頭 `while (svg.firstChild) svg.removeChild(...)`，`play()` 的 rAF 每幀呼叫 `draw()` | 手機掉幀/發燙/耗電，隨零件數線性惡化 |
| B | app.js 巨石，六種職責混在一起 | `app.js` 2427 行 | 改一處易牽動全檔，難協作、難測試 |
| C | `c.type ===` 分流散落各處 | model.js 與 app.js 多處 switch | 加新零件要全檔搜，易漏改 |
| D | 範例可能養兩套 | `js/blocks/examples.js` vs `js/examples/` | 機構變多後格式分裂 |
| E | sweep 快取 key 每幀 stringify | `getTrajectoryData()` 用 `JSON.stringify(snapshot)` 當 key | 零件多時字串化本身變慢 |

## 3. 設計決策（為什麼這樣分）

### 3.1 不要把元件物件化成 class 實例（紅線）

`undo`（`snapshotStr` 用 `JSON.stringify` / `JSON.parse`）、`saveFile`、`share`（塞進 URL）、
範例載入，全部依賴元件是 plain JSON。改成 `new Bar(...)` 後 `JSON.parse` 不會還原成實例，
方法消失，得自己寫 `toJSON`/`fromJSON` 並在每條反序列化路徑補 rehydration——成本高、收益低。

**判準**：有狀態+生命週期 → class；純資料 → plain object；純運算 → 函式；**多型分流 → 查表**。

### 3.2 真正的「物件化」= 零件型別描述表

痛點 C 的解法不是 class，而是一張**零件型別表**，把每種零件的行為按型別歸位。
這正是專案既有的模式（`js/mechanism-config.js` 的 `MECHANISMS[id]` 宣告
`solverModule / renderFn / partsFn`），只是搬進 blocks：

```js
// js/blocks/part-types.js（新檔）
export const PART_TYPES = {
  bar:      { pointKeys: ['p1','p2'],      buildNode, updateNode, length, ... },
  triangle: { pointKeys: ['p1','p2','p3'], buildNode, updateNode, ... },
  slider:   { pointKeys: ['m1','m2'],      buildNode, updateNode, ... },
  anchor:   { pointKeys: ['p1'],           buildNode, updateNode },
};
```

- 資料仍是純 JSON（序列化不受影響）。
- `draw()` / model.js 改成查表 `PART_TYPES[c.type].xxx(...)`，分流集中一處。
- 加新零件 = 加一筆表項 + 一個繪製/長度函式，不必全檔搜 `c.type`。

### 3.3 模組邊界（app.js 拆成什麼）

維持 CLAUDE.md 的「core 純函式 / ui 純 DOM」精神。blocks 是自由建構器，
**不硬套 `mechanism-engine.js` Facade**（它沒有 partSpecs/sweep 那套需求），
但 UI 內部該有的分層要補齊：

| 新模組 | 職責 | 從 app.js 搬出的內容 |
|---|---|---|
| `blocks/state.js` | 狀態 + undo + autosave | `comps/topo/theta/...`、`snapshotStr`、`pushUndo`、`scheduleAutosave`、`applySnapshot` |
| `blocks/render.js` | SVG 繪製（**build/update 分離**） | `draw` 的繪製基元：`drawGround`/`drawTTMotor`/`drawMG995Servo`/`drawSlider*`/`drawPiston`… |
| `blocks/input.js` | 指標 / 拖曳 / pinch | `onNodeDown`/`onDragMove`/`onDragEnd`/`endPointer`/`activePointers` |
| `blocks/tools.js` | 畫桿/三角/軌道的「模式」 | `startDraw*`/`drawDrawPreview`/`finishDraw*`/`convertLinkToSlider` |
| `blocks/panels.js` | 各編輯面板 | `renderLenEditor`/`updateRoleEditor`/`updateServoEditor`/`updateStrokeEditor`/`renderSliderDetails` |
| `blocks/part-types.js` | 零件型別表（§3.2） | 取代散落的 `c.type ===` |

`app.js` 收斂成**組裝/協調層**（wiring）：建立狀態、把 render/input/tools/panels 接起來。

### 3.4 暫不做（YAGNI）

- **Viewport 物件化**：`view.js` 的 `scale/ox/oy` 是模組單例。只要永遠單一畫布就沒問題。
  除非之後要「並排比較兩個機構」或「主畫面＋縮圖」才包成 `Viewport`。**現在不做。**

## 4. 工作清單（依優先序，每項可獨立驗證）

> 原則：每一刀都是**純重構，零行為改變**。每刀完成後在瀏覽器手動驗證舊功能無回歸再進下一刀。

### Phase 0 — 安全網（先做）
- [ ] 記錄一組「黃金操作流程」當回歸基準：載入每個範例 → 播放 → 拖曳節點 → 改長度 →
      存檔/開啟 → 分享連結還原 → 3D 預覽。每刀後重跑這串。

### Phase 1 — 效能（手機體感最大，先做）  ← 痛點 A
- [ ] 把 `draw()` 拆成 **`buildScene()`（結構變更時呼叫）** 與
      **`updateScene()`（每幀只更新 `cx/cy`/`d`/`transform`）**。
- [ ] `play()` 的 rAF 改呼叫 `updateScene()`，不再每幀拆 DOM。
- [ ] 加/刪零件、載入範例等「結構變更」才呼叫 `buildScene()`。
- [ ] 驗證：手機播放複雜機構不掉幀；桌機行為不變。

### Phase 2 — 零件型別表  ← 痛點 C
- [ ] 建 `js/blocks/part-types.js`，先涵蓋現有 `bar/triangle/slider/anchor`。
- [ ] 把 model.js / draw 裡的 `c.type ===` 分流逐步改成查表。
- [ ] 繪製函式（Phase 1 拆出的 build/update）掛進表項。
- [ ] 驗證：四種零件外觀/互動皆無變化。

### Phase 3 — 拆 app.js  ← 痛點 B
- [ ] 抽出 `render.js`（繪製基元）。
- [ ] 抽出 `input.js`（指標/拖曳/pinch）。
- [ ] 抽出 `tools.js`（畫圖模式）。
- [ ] 抽出 `panels.js`（面板）。
- [ ] 抽出 `state.js`（狀態/undo/autosave）。
- [ ] `app.js` 只剩 wiring。每抽一支都跑黃金流程。

### Phase 4 — 收尾清理  ← 痛點 D / E
- [ ] 評估 `blocks/examples.js` 與 `js/examples/` 是否該共用註冊機制（**先 audit 再決定，可能不動**）。
- [ ] `getTrajectoryData()` 的 cache key 從 `JSON.stringify` 改為結構版本號（dirty flag / `counter`）。

## 5. 不碰 / 不破壞（紅線）

- **不改求解器**：`js/multilink/solver.js`、`js/core/topology.js` 的數學一行不動。
- **不改使用者可見行為**：本 SDD 全程是純重構；任何外觀/互動差異都視為回歸 bug。
- **元件維持 plain JSON**：不得改成 class 實例（保護 undo/存檔/分享/範例）。
- **維持零相依、純前端、ES6 module 靜態載入**，無 build step、無 npm。
- 在 `feat/blocks-arch` 分支開發，逐 Phase 確認無回歸再合併 `main`。
- 遵守 `.agent/rules.md`：**禁止順便修改**，改動範圍最小化，保留既有中英文註解與風格。

## 6. 驗證方式

沒有 test runner。以**瀏覽器手動驗證**為準（`python -m http.server 8000` →
`http://localhost:8000/blocks.html`），每個 Phase 跑 Phase 0 的黃金流程。
幾何若需臨時驗證可用 `node test_hull.js` 風格的獨立腳本，但不納入必要流程。

## 7. 開放問題

- Phase 1 的 build/update：節點 id → DOM 元素的對應表放哪？（`state.js` 或 `render.js` 內部 Map？）
- `part-types.js` 的表項要不要連「序列化欄位白名單」也一起宣告，順便統一 storage 的正規化？
- Phase 4 範例共用：blocks 的 `_wizard_data` 與 `js/examples/` 的範本格式差異多大，值不值得統一？
- 拆檔後 `window.blocks.*`（HTML inline `onclick` 的進入點）維持原樣，還是趁機改 `addEventListener` 綁定？（影響 `blocks.html` 是否要動，傾向**本期維持 `window.blocks` 不動**以縮小範圍。）
