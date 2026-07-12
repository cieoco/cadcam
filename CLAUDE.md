# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 這是什麼

一個瀏覽器端、零相依的**積木式機構設計工具**（`blocks.html`）：拖放零件（桿 / 結構板 / 齒輪 / 滑軌 / 馬達）直接組閉環連桿機構，含 2D 物理模擬、3D 唯讀預覽、教學範例與 DXF / SVG 輸出。UI 文字以繁體中文為主。

repo 內另有一個**已凍結的舊應用** `mechanism.html`（表單式的 four-bar / slider-crank / multilink wizard 設計器）——2026-07 起棄置：bug 不修、功能不加，檔案保留只為了不讓舊連結 404。除非明確要求，**不要動 mechanism 側的程式碼**（範圍見下方「已凍結」章節）。

本專案是**純 ES6 modules 靜態載入**——沒有 build step、沒有 bundler、沒有 `package.json`、沒有 npm，全部直接在瀏覽器執行。

## 執行與測試

必須透過 HTTP 提供（ES6 `import` 無法在 `file://` 下運作）：

```bash
python -m http.server 8000   # 然後開啟 http://localhost:8000
```

`index.html` 只是導向 `blocks.html` 的極簡轉址頁，後者才是真正的進入點（進入點模組 `js/blocks/app.js`）。

測試在 `test/*.mjs`，每支都是獨立的 Node 腳本（`node test/<name>.mjs`，Node ≥22 免旗標），共用 `test/_harness.mjs` 的 `check` / `report`；跑的是真正的核心（`core/topology.js` 編譯 + `multilink/solver.js` 求解）或以假 DOM 驅動的 blocks 域模組。改動 blocks 邏輯時：先跑相關測試、必要時補一支，再開瀏覽器操作驗證。`test_hull.js`（repo 根目錄）是臨時幾何驗證腳本，不屬於套件。

部署透過 GitHub Pages（`.github/workflows/jekyll-gh-pages.yml`，靜態發佈 repo 根目錄）。線上 demo 路徑仍沿用舊的 `cadcam` URL。

## 架構

### Blocks 積木設計頁（主應用）

`blocks.html`（進入點 `js/blocks/app.js`）：拖放零件（桿 / 結構板 / 齒輪 / 滑軌 / 馬達）直接組機構，求解重用 `js/multilink/solver.js`（`solveTopology` / `sweepTopology`）與 `js/core/topology.js`，不自帶數學。模組分工：`state.js`（跨模組共享可變狀態 `S`）、`model.js`（元件 ↔ topology 轉換）、`render.js`（SVG 繪製基元）、`panels.js`（編輯面板）、`tools.js`（畫桿等工具模式）、`input.js`（指標 / 手勢）、`motion.js`、`dof.js`、`storage.js` + `schema.js`（存檔 / 分享 / snapshot 正規化）、`exporters.js`、`examples.js` + `example-controller.js`（範例選單 / 教學卡）、`gear-editor.js`（齒輪 / 齒條域）、`slider-editor.js`（滑軌域）、`motor-tools.js`（動力來源域）、`plate-editor.js`（三點桿 / 板件域）、`node-editor.js`（節點角色域）——這五個域模組是 `createXxx(deps)` 工廠，app.js 注入回呼後把函式綁回原名；`measurement.js` 是工作範圍 / 夾持量測的純計算。`js/blocks3d/` 是唯讀 3D 預覽（用 `js/vendor/three.module.js`）。`app.js` 剩下 draw 管線 / 播放迴圈 / init 接線等控制器本體——**新功能請放進對應子模組，不要再往 app.js 堆**。

blocks 對 `js/blocks/` 之外的依賴只有：`core/topology.js`、`multilink/solver.js`、`utils/`（cam-profile、gear-geometry）、`share-codec.js`、`blocks3d/` + `vendor/three.module.js`——**這些繼續維護**；其餘 mechanism 側的程式碼都已凍結（見下）。

multilink solver 採 **constructive geometry**：依序走過 `steps`，從已知節點推算每個節點（dyad / 兩圓交點與 line-circle 交點），適用於單自由度機構。三角形參數命名：`gParam` = 底邊（P1-P2）、`r1Param` = P1-P3、`r2Param` = P2-P3；JSON step 的 key `g_param`/`r1_param`/`r2_param` 與上述 1:1 對應。

---

以下三節描述**已凍結的 mechanism.html 舊應用**（`js/ui/`、`js/mechanism-config.js`、`js/mechanism-loader.js`、各機構資料夾的 visualization / parts、`js/examples/` wizard 範本、`js/core/` 中 topology.js 以外的 engine facade）。保留說明只為日後查考；不要在這些檔案上做新開發。

### 已凍結：Core / UI 分層（engine facade）

計算邏輯放在 `js/core/`，是純函式（不碰 DOM）。UI 放在 `js/ui/`，只處理 DOM 與事件。兩者透過單一 **Engine Facade** 溝通：`js/core/mechanism-engine.js`，對外暴露四個進入點：

- `computeEnginePreview` — solve + trajectory + preview/view state（主要的 render 路徑）
- `computeEngineSweep` — 對驅動角度做 sweep / 掃描分析
- `computeEngineExport` — 把 DXF / 零件檔案組成 `ExportBundle`
- `clampEngineParam` — 動態參數約束的 clamp

Facade 組合了各 state builder：`preview-state.js`、`view-state.js`、`sweep-state.js`、`export.js`、`param-constraints.js`。它們的輸入 / 輸出形狀記錄在 `CORE-SCHEMA.md`——**修改任何 state 形狀前先讀它**，因為 `js/ui/controls.js` 依賴這些 contract。驗證邏輯在 `js/core/validation/` 底下（`health-report.js` 產生統一的 `PASS/WARN/FAIL` 格式，供 `js/ui/diagnostics/panel.js` 使用）。

編輯時請維持這條邊界：不要在 `js/core/` 呼叫 DOM API，也不要把求解數學放進 `js/ui/`。跨機構共用的 SVG 繪製工具放 `js/render-utils/`（如 `trajectory-markers.js`）——機構的 `visualization.js` 不應 import `js/ui/` 底下的檔案。

### 已凍結：機構登錄與動態載入

`js/mechanism-config.js` 是中央登錄表。每個機構是一筆 `MECHANISMS[id]`，宣告它的 UI（`parameters`、`partSpecs`、`simNotes`）**以及**模組路徑與 function 名稱：

```
solverModule / solveFn        例如 './fourbar/solver.js' + 'solveFourBar'
visualizationModule / renderFn
partsModule / partsFn
```

`js/mechanism-loader.js` 讀取 `?type=` 參數、查出對應條目、動態 `import()` 那三個模組（帶 cache-busting query string），並掛到 `window.mechanismModules = { solver, visualization, parts, config }`。參數表單的 HTML 由 `parameters`/`partSpecs` 陣列生成——新增一個滑桿就是新增一筆陣列條目。

**新增機構的步驟：** 在 `MECHANISMS` 加一筆條目，建立 `js/<name>/{solver,visualization,parts}.js` 並 export 對應的 function，若要出現在首頁則再加進 `mechanism-loader.js` 的 `ENTRY_CHOOSER_ITEMS`。完整模式（單自由度的 constructive-geometry solver，如 `js/jansen/`）見 `.agent/workflows/how_to_add_complex_mechanism.md`。

每個機構各自獨立一個資料夾（`js/fourbar/`、`js/slider-crank/`、`js/rack-pinion/`、`js/parallelogram/`、`js/multilink/`、`js/jansen/`、`js/bardrawer/`），都遵循相同的 `solver` / `visualization` / `parts` 三件組。

### 已凍結：Multilink wizard

multilink 機構是使用者自訂的通用 topology，topology 可用兩種方式編輯並保持同步：視覺化 **Wizard**（`js/ui/wizard.js`，`MechanismWizard`）與原始 JSON 的 `<textarea id="topology">`。`mechanism-loader.js` 直接在 SVG 上接好繪圖 / pan / zoom / snap 互動。範本放在 `js/examples/`（`_wizard_data` 欄位的 JSON），在 `js/examples/index.js`（`EXAMPLE_TEMPLATES`）註冊。**注意：`js/multilink/solver.js` 本身不凍結**——它是 blocks 的求解核心（見上）。

### Remote sync（僅開發用的 digital twin）

`js/remote-sync.js`（`RemoteSync`）是一個 WebSocket **client**，連到 `ws://127.0.0.1:8765` 的 PyQt master，並用即時的馬達遙測（`motor_feedback` / `control_event` JSON 訊息）驅動模擬的 `theta`。詳見 `SOFTWARE_DESIGN_DOCUMENT.md`。這是開發 / 硬體功能——**不屬於**公開的靜態 demo，不應視為必要流程。

## 慣例（出自 `.agent/rules.md`）

- **禁止順便修改。** 不要重構、重新命名或重排與當前任務無關的程式碼，改動範圍要最小化。
- **大範圍 bug 修復前先確認。** 若修復需要大範圍邏輯變動，先說明計畫；主動提醒可能的跨模組副作用。
- **保留現有風格與註解**（包含既有的中英文註解）——不要為了簡潔而刪除。

## 參考文件

- `docs/HANDOFF-BLOCKS-ARCH.md` — blocks 頁架構與已知坑的交接文件
- `README.md` — 功能總覽（中文）
- （凍結側）`CORE-SCHEMA.md` — 舊 engine 輸入 / 輸出形狀；`docs/mechanism-schema.md` — 匯出給 `arm` 的 `mechanism.json` 交換格式（僅 mechanism.html 有此匯出）；`.agent/workflows/how_to_add_complex_mechanism.md` — 舊的新增機構流程
