# Linkage 未來發展規畫

## 定位

`linkage` 的長期定位，不應只是「多種機構 solver 的集合」，而應該是面向學生、初學者與原型設計者的平面機構設計平台。它的核心任務是把「機構構念理解」、「參數改動」、「2D 試動」、「設計檢核」、「零件輸出」與「下游串接」整理成一條連續工作流。

這個方向可借鏡 `MotionGen` 一類產品的產品思路，但不以複製對方功能為目標，而是結合本專案既有的 `cad -> linkage -> arm -> svg2gcode-project` 工具鏈優勢，建立更適合教學、設計迭代與後續製造的前端平台。

## 核心設計原則

1. 以任務為入口，不以參數表為入口。
2. 以概念理解與改動迭代為優先，不要求使用者從零建模開始。
3. 以檢核可解釋、可修正為原則，不只回傳成功或失敗。
4. 以模組化機構框架為基礎，讓新機構加入時遵守同一組 contract。
5. 以正式交換格式串接 `cad`、`arm` 與製造流程，避免工具之間資料斷裂。

## 發展步驟

### Phase 1：產品收斂

目標：把現有能力整理成一致的使用流程。

- 強化首頁任務導向入口：
  - 擺動
  - 直線往復
  - 夾持
  - 平移保持
  - 步行腿
  - 軌跡生成
- 每個入口綁定 2 到 5 個經典機構範本。
- 建立範本說明卡：
  - 這個機構在學什麼
  - 哪個參數最值得改
  - 常見失敗原因
- 把 `mechanism.html` 的操作分成：
  - 學習模式
  - 工程模式

### Phase 2：檢核引擎

目標：建立正式的設計檢核與教學提示系統。

- 將現有零散的輸入檢查、求解狀態、拓樸檢查收斂到 `validation/` 層。
- 定義統一檢核回傳格式：

```js
{
  status: "pass" | "warn" | "fail",
  code: "TOPOLOGY_DISCONNECTED",
  title: "拓樸未連通",
  message: "目前機構仍有孤立桿件，無法形成有效閉環。",
  suggestion: "請確認該桿件是否連接到既有 joint，或改用範本重新開始。",
  severity: 2,
  targets: ["bar_3", "J4"]
}
```

- 建立檢核面板：
  - 幾何可行性
  - 拓樸完整性
  - 運動連續性
  - 死點風險
  - 干涉風險
  - 製造可落地性
  - `cad` / `arm` 串接完整度

### Phase 3：分析層

目標：讓使用者不只看到「會動」，也能理解「怎麼動」與「為什麼不好」。

- 加入正式分析模組：
  - 軌跡分析
  - 行程分析
  - 傳動角分析
  - 死點分析
  - 干涉分析
  - sweep ranking
- 每個分析結果都應可回傳：
  - 指標值
  - 視覺化標記
  - 教學說明

### Phase 4：Synthesis Lite

目標：逐步接近「目標運動導向」設計，而不是只做 forward simulation。

- 指定追蹤點路徑
- 路徑區段強調 / 去強調
- 參數 sweep + 候選排序
- 候選機構比較視圖
- 保留之後接 AI 搜尋或更進階 synthesis 的擴充點

### Phase 5：下游串接

目標：讓 `linkage` 成為工作流中的中樞站，而不是孤立頁面。

- 將零件需求正式轉交 `cad`
- 將拓樸與 joint hints 正式轉交 `arm`
- 將 2D 零件輪廓交給 `svg2gcode-project`
- 在 UI 中明確顯示下一步去向

### Phase 6：虛實整合與 AI

目標：在架構穩定後擴充硬體同步與 AI 協作。

- 將現有 motor sync / remote sync 功能收斂成正式 adapter
- 提供 WebSocket / API bridge
- 讓 AI 可讀取：
  - 機構 schema
  - 檢核報告
  - 分析指標
  - 匯出 bundle

## 檢核機制規格

### 1. 輸入檢核

- 參數是否缺漏
- 長度是否為正值
- joint / point 是否重複命名
- driver 是否指定正確
- 元件關聯是否完整

### 2. 拓樸檢核

- 圖是否連通
- 自由度是否合理
- 閉環是否可閉合
- 固定點是否足夠
- driver 與運動副型態是否一致

### 3. 求解檢核

- 是否存在可行解
- 是否發生翻面跳解
- 是否接近死點
- sweep 過程是否連續
- 是否存在數值不穩定區段

### 4. 工程檢核

- 是否能生成零件
- 是否能生成 `mechanism.json`
- 是否可對應到 `cad` 所需零件資訊
- 是否可對應到 `arm` 所需 joint / marker 資訊
- 輸出 SVG / DXF 是否閉合

### 5. 教學檢核

- 錯誤訊息是否可讀
- 是否有具體修正建議
- 是否指出最值得調整的參數
- 是否能用初學者語言解釋問題

### Sanity Meter 建議欄位

- 幾何可行性
- 拓樸可落地性
- 運動穩定性
- 干涉風險
- 製造可行性
- 下游串接完整度

## 程式框架建議

目標是保留目前 `core/` 架構優點，同時把 validation、analysis、module contract 補齊。

```text
js/
  core/
    engine/
      mechanism-engine.js
      preview-state.js
      sweep-state.js
      export.js
    schema/
      mechanism-schema.js
      part-schema.js
    validation/
      input-validator.js
      topology-validator.js
      solve-validator.js
      export-validator.js
      teaching-validator.js
      health-report.js
    analysis/
      dof.js
      trajectory.js
      transmission-angle.js
      dead-center.js
      interference.js
      manufacturability.js
    synthesis/
      sweep-search.js
      candidate-ranker.js
      path-fit.js
    status/
      solver-status.js

  mechanisms/
    fourbar/
      schema.js
      solver.js
      validator.js
      analysis.js
      parts.js
      visualization.js
    slider-crank/
    parallelogram/
    multilink/
    jansen/

  ui/
    onboarding/
    wizard/
    inspector/
    diagnostics/
    tutorial/
    export/

  adapters/
    to-cad.js
    to-arm.js
    to-dxf.js

  examples/
```

## 機構模組 Contract

每個機構模組都應實作同一組介面，避免 UI 與核心緊耦合。

```js
export const mechanismModule = {
  normalizeInput(rawInput) {},
  validateInput(input) {},
  solve(input) {},
  analyze(solution, input) {},
  buildParts(solution, input) {},
  buildExport(solution, input) {},
  describeForLearner(solution, input) {}
};
```

## 與現有 codebase 的對應

目前可直接延用的基礎：

- Engine facade：
  - `js/core/mechanism-engine.js`
- 求解狀態：
  - `js/core/solver-status.js`
- 核心 preview / view state：
  - `js/core/preview-state.js`
  - `js/core/view-state.js`
- 多連桿設計器：
  - `js/ui/wizard.js`
- 範本資料：
  - `js/examples/*.json`

優先重構位置：

- 將 `solver-status` 類檢查收斂到 `validation/`
- 將 sweep 與 preview 的評估整理成 `health-report`
- 將不同機構 solver 的輸入 / 輸出格式收斂成模組 contract
- 將學習提示從 UI 文案提升成正式資料結構

## 建議優先順序

### 立即進行

1. 建立 `validation/` 層
2. 建立 `health-report` 統一檢核格式
3. 建立經典機構範本卡與教學說明

### 短期

4. 建立分析層
5. 將首頁改成任務導向入口
6. 分離學習模式與工程模式

### 中期

7. 建立 synthesis lite
8. 補強 `linkage -> cad -> arm` 的 adapter
9. 整理 motor sync / remote sync 為正式整合層

### 長期

10. AI 介面
11. 硬體閉環同步
12. 更完整的數位孿生與實驗記錄

## 本月可做的 10 個實作任務

以下任務以「先建立可持續擴充的基礎，再逐步改善產品體驗」為原則排序。

### 1. 建立 `health-report` 資料格式

目標：讓所有檢核、分析、警告都能回傳同一種結構。

- 新增：
  - `js/core/validation/health-report.js`
- 定義：
  - `status`
  - `code`
  - `title`
  - `message`
  - `suggestion`
  - `severity`
  - `targets`
- 讓 `preview-state`、`solver-status`、未來 `analysis` 都能共用。

### 2. 拆出輸入檢核層

目標：把目前散在 UI 與 solver 內的基本檢查收斂。

- 新增：
  - `js/core/validation/input-validator.js`
- 檢查：
  - 缺參數
  - 非法長度
  - 重複 ID
  - driver 指定錯誤
  - joint / point 缺失

### 3. 拆出拓樸檢核層

目標：讓「能不能形成有效機構」有獨立判斷模組。

- 新增：
  - `js/core/validation/topology-validator.js`
- 檢查：
  - 圖是否連通
  - 固定點是否足夠
  - 閉環是否成立
  - 元件關聯是否合理

### 4. 整理 `solver-status` 為正式求解檢核

目標：把目前「未求解摘要」提升成正式 validator 輸出。

- 參考現有：
  - `js/core/solver-status.js`
- 新增：
  - `js/core/validation/solve-validator.js`
- 輸出：
  - 可行 / 警告 / 失敗
  - 未求解原因
  - 建議修正方向

### 5. 在 `mechanism-engine` 串入統一檢核

目標：讓 engine 每次 preview 時都能回傳完整 health report。

- 修改：
  - `js/core/mechanism-engine.js`
  - `js/core/preview-state.js`
- 讓回傳結果包含：
  - `validationReport`
  - `analysisReport`
  - `sanitySummary`

### 6. 新增診斷面板 UI

目標：讓使用者在頁面上直接看到檢核結果，不必只看 log。

- 新增：
  - `js/ui/diagnostics/`
- 在 `mechanism.html` 顯示：
  - 幾何可行性
  - 拓樸完整性
  - 運動穩定性
  - 製造可行性
- 使用顏色分級：
  - `pass`
  - `warn`
  - `fail`

### 7. 為範本加上教學 metadata

目標：讓範本不只是 JSON，而是可教學的學習單元。

- 修改：
  - `js/examples/*.json`
  - `js/examples/index.js`
- 每個範本加入：
  - `learningGoal`
  - `keyParams`
  - `commonFailure`
  - `nextStep`

### 8. 首頁改成更明確的任務導向入口

目標：讓初學者先選目標運動，再進機構頁。

- 修改：
  - `index.html`
  - `js/main.js`
- 強化入口分類：
  - 擺動
  - 直線往復
  - 夾持
  - 平移保持
  - 軌跡生成

### 9. 補一個正式的分析模組最小版

目標：先建立分析層，不必一次做完全部。

- 新增：
  - `js/core/analysis/trajectory.js`
  - `js/core/analysis/dead-center.js`
- 先輸出兩種結果：
  - 追蹤點軌跡摘要
  - 死點風險判斷

### 10. 建立 `linkage -> cad / arm` adapter 草案

目標：先把下游交接資料格式固定下來。

- 新增：
  - `js/adapters/to-cad.js`
  - `js/adapters/to-arm.js`
- 明確整理：
  - 零件需求
  - joint hints
  - trace point
  - generated parts

## 本月完成標準

若本月完成以上 10 項中的前 6 項，`linkage` 就會從「可運作的機構頁面集合」提升為「具備正式檢核能力的機構平台雛形」。

若 7 到 10 項也一併完成，則可進一步形成：

- 初學者更容易上手的任務導向入口
- 可教學的範本系統
- 初步分析層
- 正式的下游串接骨架

## 兩週執行表

這份執行表的原則是：先讓系統知道哪裡錯，再讓使用者看得懂哪裡錯。

### 第 1 週：建立檢核骨架

目標：讓 `linkage` 在 engine 層具備正式檢核能力。

#### Day 1

- 建立 `js/core/validation/health-report.js`
- 定義統一檢核資料格式
- 整理 `status / code / message / suggestion / targets`

#### Day 2

- 建立 `js/core/validation/input-validator.js`
- 先收斂最基本輸入檢查：
  - 缺參數
  - 非法長度
  - 重複 ID
  - driver 指定錯誤

#### Day 3

- 建立 `js/core/validation/topology-validator.js`
- 檢查：
  - 圖是否連通
  - 固定點是否足夠
  - 閉環是否成立
  - 元件關聯是否完整

#### Day 4

- 建立 `js/core/validation/solve-validator.js`
- 將現有 `solver-status` 的資訊正式轉成 validator 輸出
- 補 `warn / fail` 分級

#### Day 5

- 修改 `js/core/mechanism-engine.js`
- 修改 `js/core/preview-state.js`
- 把 validation report 串入 preview 結果
- 產出第一版 `sanitySummary`

### 第 2 週：把檢核變成可見產品

目標：讓檢核不是只有內部資料，而是使用者能理解、能操作的產品功能。

#### Day 6

- 建立 `js/ui/diagnostics/`
- 在 `mechanism.html` 加入 diagnostics panel
- 顯示 `pass / warn / fail`

#### Day 7

- 加入第一版 `sanity meter`
- 顯示：
  - 幾何可行性
  - 拓樸完整性
  - 運動穩定性
  - 製造可行性

#### Day 8

- 修改 `js/examples/*.json`
- 修改 `js/examples/index.js`
- 為每個範本補：
  - `learningGoal`
  - `keyParams`
  - `commonFailure`
  - `nextStep`

#### Day 9

- 在 UI 顯示範本說明卡
- 讓使用者看得懂：
  - 這個機構適合學什麼
  - 先改哪個參數
  - 哪些情況會失敗

#### Day 10

- 小幅調整 `index.html` 與 `js/main.js`
- 把首頁入口改得更偏任務導向
- 保留既有結構，但讓初學者更容易知道該從哪裡開始

## 兩週完成標準

若兩週完成，應至少達成以下結果：

- engine 有正式檢核骨架
- UI 可顯示檢核與警告
- 範本從「可載入 JSON」提升為「可教學範本」
- 首頁開始具備任務導向的產品方向

此時 `linkage` 還不算完整平台，但已足夠作為下一階段分析層與 synthesis lite 的穩定基礎。

## 一句話總結

`linkage` 的未來，不是變成更多頁面的機構展示站，而是成為一個以學習、設計迭代、正式檢核與工作流串接為核心的平面機構平台。
