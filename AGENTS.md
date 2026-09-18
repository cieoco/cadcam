# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 這是什麼

一個瀏覽器端的**機構積木**設計工具，主入口是 `blocks.html`，支援連桿、滑軌、齒輪等機件的 2D 運動模擬、唯讀 3D 預覽與 SVG／DXF 零件輸出。作品存檔為 `blocks.json`。UI 文字以繁體中文為主。舊版 `mechanism.html` 的閉環連桿設計器與 `mechanism.json` ARM 交換流程保留供查考，已凍結（不修 bug、不加功能）。

本專案是**純 ES6 modules 靜態載入**——沒有 build step、沒有 bundler、沒有 `package.json`、不需 npm 安裝，全部直接在瀏覽器執行。3D 使用 `js/vendor/` 內附的 Three.js，並非完全沒有第三方程式。

## 執行與測試

必須透過 HTTP 提供（ES6 `import` 無法在 `file://` 下運作）：

```bash
python -m http.server 8000   # 然後開啟 http://localhost:8000
```

`index.html` 是導向 `blocks.html` 的極簡轉址頁。舊版 `mechanism.html` 沒有 `?type=` 參數時顯示機構 chooser；帶 `?type=fourbar`（等）時載入舊機構工作頁。`?mode=wizard` 與 `?template=<id>` 也是舊版 multilink 設計器的參數，不是 blocks 的入口。

沒有 npm test runner，但已有 `test/*.mjs` Node 驗收腳本，共用 `test/_harness.mjs`；Node 22 以上可直接執行，例如 `node test/slider-crank.mjs`。`node test_blocks_schema.mjs` 驗證 blocks 範例與作品正規化。`test_hull.js` 是獨立幾何腳本。UI 改動仍須透過 HTTP 在瀏覽器實際操作；Node 通過不能替代瀏覽器驗收。

部署透過 GitHub Pages（`.github/workflows/jekyll-gh-pages.yml`，靜態發佈 repo 根目錄）。線上 demo 路徑仍沿用舊的 `cadcam` URL。

## 架構

### Blocks 主線（目前工作入口）

- `js/blocks/app.js` 為 UI 控制器，透過 `core/topology.js` 的 `compileTopology` 與 `multilink/solver.js` 的 `solveTopology`／`sweepTopology` 編譯及求解；並非經由舊 Engine Facade。
- `js/blocks/state.js` 保存共用狀態；`input.js`／`tools.js` 處理指標與繪圖，`panels.js` 與各 `*-editor.js` 處理編輯，render 相關模組負責呈現。
- `js/blocks/examples.js` 與 `example-controller.js` 管理 blocks 範例與教學卡。
- `js/blocks/schema.js` 定義作品正規化與 snapshot；`storage.js` 處理自動存檔、JSON 開啟／下載與分享；`exporters.js` 負責現有 SVG／DXF 輸出。
- `js/blocks3d/scene-model.js` 與 `viewer.js` 負責唯讀 3D；Three.js 懶載入。
- 修改 blocks state／作品形狀前先讀 `state.js`、`schema.js`、`storage.js`；涉及核心或 ARM 交換格式時另讀對應 schema。保持純邏輯與 DOM 分離，不在 core 加入 DOM 操作。

以下章節記錄凍結的舊版架構；共用求解器仍被 blocks 使用，修改時需檢查兩者影響。

### 舊版 Core / UI 分層（Engine Facade）

計算邏輯放在 `js/core/`，是純函式（不碰 DOM）。UI 放在 `js/ui/`，只處理 DOM 與事件。兩者透過單一 **Engine Facade** 溝通：`js/core/mechanism-engine.js`，對外暴露四個進入點：

- `computeEnginePreview` — solve + trajectory + preview/view state（主要的 render 路徑）
- `computeEngineSweep` — 對驅動角度做 sweep / 掃描分析
- `computeEngineExport` — 把 DXF / 零件檔案組成 `ExportBundle`
- `clampEngineParam` — 動態參數約束的 clamp

Facade 組合了各 state builder：`preview-state.js`、`view-state.js`、`sweep-state.js`、`export.js`、`param-constraints.js`。它們的輸入 / 輸出形狀記錄在 `CORE-SCHEMA.md`——**修改任何 state 形狀前先讀它**，因為 `js/ui/controls.js` 依賴這些 contract。驗證邏輯在 `js/core/validation/` 底下（`health-report.js` 產生統一的 `PASS/WARN/FAIL` 格式，供 `js/ui/diagnostics/panel.js` 使用）。

編輯時請維持這條邊界：不要在 `js/core/` 呼叫 DOM API，也不要把求解數學放進 `js/ui/`。

### 機構登錄與動態載入

`js/mechanism-config.js` 是中央登錄表。每個機構是一筆 `MECHANISMS[id]`，宣告它的 UI（`parameters`、`partSpecs`、`simNotes`）**以及**模組路徑與 function 名稱：

```
solverModule / solveFn        例如 './fourbar/solver.js' + 'solveFourBar'
visualizationModule / renderFn
partsModule / partsFn
```

`js/mechanism-loader.js` 讀取 `?type=` 參數、查出對應條目、動態 `import()` 那三個模組（帶 cache-busting query string），並掛到 `window.mechanismModules = { solver, visualization, parts, config }`。參數表單的 HTML 由 `parameters`/`partSpecs` 陣列生成——新增一個滑桿就是新增一筆陣列條目。

**新增機構的步驟：** 在 `MECHANISMS` 加一筆條目，建立 `js/<name>/{solver,visualization,parts}.js` 並 export 對應的 function，若要出現在首頁則再加進 `mechanism-loader.js` 的 `ENTRY_CHOOSER_ITEMS`。完整模式（單自由度的 constructive-geometry solver，如 `js/jansen/`）見 `.agent/workflows/how_to_add_complex_mechanism.md`。

每個機構各自獨立一個資料夾（`js/fourbar/`、`js/slider-crank/`、`js/rack-pinion/`、`js/parallelogram/`、`js/multilink/`、`js/jansen/`、`js/bardrawer/`），都遵循相同的 `solver` / `visualization` / `parts` 三件組。

### Multilink wizard（最複雜的部分）

multilink 機構是使用者自訂的通用 topology，而非固定連桿。它的 solver（`js/multilink/solver.js`，`solveTopology`）採用 **constructive geometry**：依序走過 `steps`，從已知節點推算每個節點（dyad / 兩圓交點與 line-circle 交點），適用於單自由度機構。

topology 可用兩種方式編輯並保持同步：視覺化 **Wizard**（`js/ui/wizard.js`，`MechanismWizard`）與原始 JSON 的 `<textarea id="topology">`。`mechanism-loader.js` 直接在 SVG 上接好繪圖 / pan / zoom / snap 互動（`setupLinkClickHandler`）——加點、畫桿、拖曳合併節點、等長 / 正交 / 網格鎖點。範本放在 `js/examples/`，是帶有 `_wizard_data` 欄位的 JSON；新範本在 `js/examples/index.js`（`EXAMPLE_TEMPLATES`）註冊。選用的 `_templateMeta` 驅動學習卡（`learningGoal / keyParams / commonFailure / nextStep`）。

multilink 三角形參數命名：`gParam` = 底邊（P1-P2）、`r1Param` = P1-P3、`r2Param` = P2-P3；JSON step 的 key `g_param`/`r1_param`/`r2_param` 與上述 1:1 對應。

### Remote sync（僅開發用的 digital twin）

`js/remote-sync.js`（`RemoteSync`）是一個 WebSocket **client**，連到 `ws://127.0.0.1:8765` 的 PyQt master，並用即時的馬達遙測（`motor_feedback` / `control_event` JSON 訊息）驅動模擬的 `theta`。詳見 `SOFTWARE_DESIGN_DOCUMENT.md`。這是開發 / 硬體功能——**不屬於**公開的靜態 demo，不應視為必要流程。

## 慣例（出自 `.agent/rules.md`）

- **禁止順便修改。** 不要重構、重新命名或重排與當前任務無關的程式碼，改動範圍要最小化。
- **大範圍 bug 修復前先確認。** 若修復需要大範圍邏輯變動，先說明計畫；主動提醒可能的跨模組副作用。
- **保留現有風格與註解**（包含既有的中英文註解）——不要為了簡潔而刪除。

## 參考文件

- `CORE-SCHEMA.md` — engine 輸入 / 輸出形狀（PreviewState、ViewState、SweepState、ExportBundle）
- `docs/mechanism-schema.md` — 匯出給 `arm` 的 `mechanism.json` 交換格式
- `.agent/workflows/how_to_add_complex_mechanism.md` — 新增固定 topology 機構的做法
- `README.md` — 功能總覽與支援的機構類型（中文）
