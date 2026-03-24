Linkage 閉環機構拓樸工具

> 聚焦於閉環機構拓樸、2D 模擬、零件佈局與 DXF 輸出的機構設計工具

## 試用方式

### 線上試用

- 目前可用：
  - https://cieoco.github.io/cadcam/
- 備註：
  - 線上 demo 若尚未同步更名，路徑仍沿用舊的 `cadcam` URL

### 本機試用

```bash
cd d:\tool\linkage
python -m http.server 8000
```

然後開啟：

- `http://localhost:8000`

### 公開試用站注意事項

- 公開試用站以靜態前端功能為主
- 本機 `remote-sync` / websocket 同步能力屬於開發用途
- 這類功能不應當作公開 demo 的必要流程

[![Live Demo](https://img.shields.io/badge/🚀_線上試用-Live_Demo-success?style=for-the-badge)](https://cieoco.github.io/cadcam/)

> 備註：線上 demo 若尚未同步更名，路徑可能仍沿用舊的 `cadcam` URL。

## 🎯 專案概述

這是一個模組化的閉環機構拓樸工具，專為創客、學生與工程師設計。它聚焦在機構本身，而不再內建製造刀路流程：

1. **入口整合** - `mechanism.html` 已成為主入口；未指定 `type` 時，會先顯示機構 chooser。
2. **參數化設計** - 輸入設計參數，即時 2D 物理模擬。
3. **多連桿精靈** - 透過互動式介面，自由組裝桿件與三角形，或載入經典範本（如夾爪、曲柄滑塊）。
4. **檢核導向** - 內建輸入、拓樸、求解檢核與 diagnostics panel，先看出問題，再修機構。
5. **零件輸出** - 產生零件佈局、DXF 與 `mechanism.json`，供後續 CAD、`arm` 或製造工具接續使用。

## ✨ 主要特色

- 🎨 **即時視覺化** - 2D 動畫模擬，直觀理解機構運動
- 🛠️ **多連桿設計器** - 像樂高一樣組裝連桿，支援自動求解與拖拉編輯
- 📁 **範本系統** - 內建平行四連桿、夾爪、曲柄滑塊等多種範本，並附學習提示
- ⚙️ **參數化設計** - 調整參數立即看到效果
- 📐 **閉環拓樸管理** - 聚焦四連桿、多連桿、平行四邊形等閉環機構
- 🧩 **零件佈局輸出** - 支援 DXF 與零件預覽，方便交由其他製造工具接續
- 🔁 **ARM 交換格式** - 可輸出 `mechanism.json` 給 `arm` 作為閉環機構拓樸中介格式
- 🎯 **工程防呆** - 內建 validation report、sanity summary 與 diagnostics panel
- 🚪 **單一主入口** - `mechanism.html` 負責機構選擇與正式工作頁；`index.html` 僅保留轉址用途

## 🗂️ 專案結構

*(省略部分技術細節，詳見程式碼)*

```
linkage/
├── index.html                  # 極簡轉址頁，會導向 mechanism.html
├── mechanism.html              # 主入口 + 統一的閉環機構模擬頁面
├── js/
│   ├── mechanism-loader.js     # 核心載入器
│   ├── core/validation/        # 輸入 / 拓樸 / 求解檢核
│   ├── ui/diagnostics/         # diagnostics panel
│   ├── ui/wizard.js            # 多連桿設計精靈 (Wizard UI)
│   ├── examples/               # 機構範本 JSON (Gripper, Slider...)
│   ├── fourbar/                # 四連桿模組
│   ├── multilink/              # 多連桿核心模組
│   └── ...
└── ...
```

## 🧱 最新架構說明 (Core/UI 分層)

核心邏輯已抽離成 `js/core/`，UI 只處理 DOM 與事件，透過「Engine Facade」單一入口呼叫核心計算。

- `js/core/mechanism-engine.js`
  - `computeEnginePreview`：求解 + 軌跡 + preview/view state
  - `computeEngineSweep`：掃描分析 (sweep)
  - `computeEngineExport`：DXF 與零件輸出整理
  - `clampEngineParam`：動態參數約束
- `js/core/preview-state.js`：整理求解結果、軌跡資料、訊息、DXF preview
- `js/core/validation/`
  - `health-report.js`：統一檢核結果格式
  - `input-validator.js`：輸入與範本資料檢查
  - `topology-validator.js`：閉環拓樸合理性檢查
  - `solve-validator.js`：求解與解的完整性檢查
- `js/core/view-state.js`：UI 顯示狀態計算 (警告/面板/顯示策略)
- `js/core/sweep-state.js`：掃描結果彙整
- `js/core/export.js`：匯出流程彙整
- `js/core/param-constraints.js`：動態參數限制

UI 端主要留在 `js/ui/controls.js`、`js/ui/wizard.js` 與 `js/ui/diagnostics/panel.js`，負責：
- DOM 更新與事件綁定
- 將輸入組裝成 engine 所需資料，並依回傳狀態渲染
- 將 `validationReport` / `sanitySummary` 顯示為可讀的 diagnostics

此分層降低 UI 與求解器耦合，提升可測試性與可維護性。


## 🔧 支援的機構類型

### ✅ 已實作機構

#### 1. 四連桿機構（Four-Bar）

- **應用**：擺動輸出、軌跡控制
- **特點**：最經典的機構，參數完整。

#### 2. 曲柄滑塊機構（Crank-Slider）

- **應用**：直線往復運動、引擎活塞
- **特點**：旋轉轉直線，行程明確。

#### 3. 齒輪齒條機構（Rack & Pinion）

- **應用**：長行程直線傳動、滑台
- **特點**：精確控制位置。

#### 4. 🦀 多連桿機構 (Multilink Wizard) **(NEW)**



- **應用**：客製化複雜機構 (如夾爪、仿生獸腿、折疊機構)
- **特點**：
  - **互動編輯**：提供「新增二孔桿」、「新增三角桿」等工具。
  - **範本系統**：支援載入 JSON 範本 (如夾爪、模擬滑塊)。
  - **自動求解**：內建 Dyad Solver，自動計算節點位置。

### Triangle Parameter Naming (Multilink)

- gParam: base length (P1-P2)
- r1Param: side length (P1-P3)
- r2Param: side length (P2-P3)
- JSON step keys use g_param / r1_param / r2_param and map 1:1 to the above.

#### 5. ✏️ 桿件繪圖工具 (Bar Drawer) **(NEW)**

- **應用**：純粹的 2D 零件繪製
- **特點**：不涉及運動模擬，專注於繪製連桿外型與孔位，產生 DXF。

## 🚀 快速開始

### 1. 啟動方式

由於專案使用 ES6 模組 (import/export)，**不可直接點擊 HTML 檔案開啟**，必須透過本地伺服器：

**推薦：VS Code Live Server**

1. 安裝 "Live Server" 擴充套件
2. 右鍵點擊 `index.html`
3. 選擇 "Open with Live Server"

**替代方案：Python**

```bash
python -m http.server 8000
```

瀏覽器開啟 `http://localhost:8000`

### 2. 使用流程

1. **進入主入口**：開啟 `mechanism.html`，先在 chooser 選擇機構類型。
2. **進入模擬**：一般機構會直接進工作頁；`multilink` 可選擇直接模擬或進入設計器。
3. **調整參數**：
   - **四連桿/滑塊**：右側面板調整數值。
   - **多連桿**：使用左側 Wizard 新增/刪除桿件，或載入範本與學習卡。
4. **先看檢核**：確認 diagnostics panel 中的 `PASS / WARN / FAIL`、建議與摘要。
5. **驗證與輸出**：確認動畫無誤後，下載 DXF 或將零件資料交由其他 CAD / 製造工具接續。

## 🔁 與其它工具的關係

- `linkage`
  - 管閉環機構拓樸、2D 模擬、連桿配置與 DXF 輸出
- `cad`
  - 管單一零件 CAD 與 `part.json`
- `arm`
  - 管 3D 組裝、URDF 與機械手臂模擬
- `svg2gcode-project`
  - 管製造刀路與 G-code

## 🛠️ 開發指南 (給維護者)

### 如何新增多連桿範本？

1. 在 `js/examples/` 資料夾中建立新的 JSON 檔案 (參考 `gripper.json`)。
2. 確保 JSON 包含 `_wizard_data` 欄位，定義桿件 (Bar/Triangle) 與點位 (Fixed/Floating)。
3. 建議同時加入 `_templateId` 與 `_templateMeta`，讓學習卡可以顯示 `learningGoal / keyParams / commonFailure / nextStep`。
4. 在 `js/examples/index.js` 的 `EXAMPLE_TEMPLATES` 陣列中加入新條目。

*(更多模組擴充細節請參考原始程式碼架構)*

## 📝 版本歷史

### v3.2 - 2026-03-25

- 🧪 **Validation 骨架**：加入 `health-report`、輸入 / 拓樸 / 求解檢核。
- 🩺 **Diagnostics Panel**：工作頁可直接顯示 `PASS / WARN / FAIL` 與修正建議。
- 📘 **範本學習卡**：範本可附帶學習目標、關鍵參數、常見失敗與下一步。
- 🚪 **主入口整合**：`mechanism.html` 成為單一主入口，`index.html` 改為極簡轉址頁。

### v3.1 - 2025-12-28 (Feature Release)

- ✨ **多連桿互動精靈**：支援互動式桿件組裝與編輯。
- 📂 **範本系統**：新增夾爪、模擬滑塊、平行四連桿範本。
- ✏️ **桿件繪圖工具**：獨立的繪圖模式。
- 🎨 **UI 優化**：首頁新增快速入口，全螢幕模式優化。

### v3.0 - 2025-12-26

- ✨ 新增多種機構類型（曲柄滑塊、齒輪齒條）
- 🔧 機構配置系統重構

### v1.0 - 初始版本

- 🎯 四連桿機構基本功能

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！本專案適合教學與 Maker 使用。

## 📄 授權

本專案採用 MIT 授權條款。
