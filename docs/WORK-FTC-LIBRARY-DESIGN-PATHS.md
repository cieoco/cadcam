# FTC 機構庫與兩條設計路徑 — LOOP 工作紀錄

規格：[SDD-FTC-LIBRARY-DESIGN-PATHS.md](SDD-FTC-LIBRARY-DESIGN-PATHS.md)。

## W0 — 2026-10-15 定向盤點與基準

基準：`d771177f7812122830f892bc7c60ffc81906a44d`，產品顯示 `2026.10.14.3`，Node `v25.2.0`。開始時 Git 追蹤檔無變更；既有未追蹤附件、草稿及 output 不納入提交。

使用者授權：規劃 SDD，以 LOOP 與適合模型節省 token，開始工作。主線是 FTC 可操弄機構庫與空白建立 UI；不回到推送器課堂導覽改版。

### 分工與核對

- 主模型：讀現行契約、核對程式、寫 SDD／工作紀錄、跑基準及瀏覽器初勘。
- 一名 `gpt-6-luna` medium：僅讀 examples／controller／module／guide 的相關內容，回報 ID、入口差異與測試建議；沒有寫檔，也未再分派。
- 主核對修正：完整組立與單體／內建模板不可混同；輕量盤點所述 M2 舵機範圍不能套用到 `assemblyLessonSnapshot`，該來源 GearA 未明示舵機設定，瀏覽器顯示 TT。`lesson-sequence.js` 的 0–30° 是本課模擬範圍，不是硬體能力證明。
- 不採用「先新增完整組合插入模板」建議：目前已有 composite 庫能力，尚無證據需要再新增模板。先解決入口語意與真正空白操作卡點。

### 已確認的現況

1. `createExampleController.load` 正規化後套用整份 snapshot；URL 的 `offerExampleFromUrl` 已有替換／保留確認，分享 hash 優先。直接選單與手機列表仍直呼 load，載入與加入應明確區分。
2. `BUILTIN_MODULES` 有 `rack-lift`、`gear-gripper`、`fourbar-lift`；`module-editor` 已有本機庫及匯入入口。範例庫與模組庫不可重建為互不相通的第二套。
3. `competition-flywheel-shooter` 僅原始定義存在，公開 `BLOCK_EXAMPLES` 明確排除；修正先前研究中可能被讀成「已可公開使用」的說法。
4. 單體 `parallel-fourbar`、帶手腕的 competition 例、內建 `fourbar-lift` 與 Lift1 組立不是同一種尺寸／動力配置。共同操作必須明示支援對象。
5. `designGuideStep` 為目前設計的泛用操作提示，並非空白完成升降夾爪的驗收證據。

### 定向測試（實際執行）

先探測 parallel-lift、gripper-operations、lesson-sequence，均通過；其後使用中央 runner 將本輪基準與模組／入口檢查一起留檔。無程式修改後不再重跑。

```powershell
node tools/test-runner.mjs --test test/parallel-lift.mjs --test test/gripper-operations.mjs --test test/lesson-sequence.mjs --test test/module-ops.mjs --test test/module-editor.mjs --test test/example-controller.mjs --test test/design-guide.mjs --test test/example-entry.mjs --output output/ftc-library-loop/w0-baseline
```

結果：8/8 支通過、全部 exit 0。parallel-lift 35/35、gripper-operations 40/40；其他案例數以各 log 為準，不將 8 支誤寫成只有 8 個斷言。結果與 log 存在本機 `output/ftc-library-loop/w0-baseline/`，不加入 Git。

覆蓋既有候選取消／過期拒絕／復原／snapshot 往返、序列取樣、模組與入口；不是全套回歸，不代表已完成新功能。

### 瀏覽器初勘（實際操作）

使用獨立 `http://127.0.0.1:8015`，未碰平常 8000 origin 的自動保存。內嵌瀏覽器，預設桌面視窗與暫時 390×844 視窗；完成後還原視窗。此為 W0 入口與取消流程初勘，未從零重建整個機構。

- 開 `blocks.html?example=assembly-lift-gripper-practice`：先看到「載入會替換目前畫布／保留目前作品」，確認才載入。
- 載入後有「平行四連桿升降臂（5 個零件）」與「齒輪夾爪（4 個零件）」兩分頁。
- 切組立：顯示升降臂為底座、夾爪未安裝，已有「工具架 · 雙孔對鎖」。選擇後有接上／取消及未檢查項目；取消後顯示「已取消，機構回到原位」，夾爪仍未安裝。
- 回設計，按「＋ 新設計」：保留兩原設計，新增零件數 0 的空白設計，新增工具自動展開，可見固定支點／連桿／板件／動力／加入模組。
- 390×844 展開加入模組：AX／DOM 可找到三個內建模組與匯入；截圖顯示模組項目位於新增區捲動內容下方，不得宣稱第一屏已全部看見。頁面 scrollWidth=390，沒有整頁水平溢出；設計分頁自身允許橫向捲動。
- 一次 AX 元素索引過期，重新取得狀態後操作成功；未作產品缺陷判定。

本機證據：`output/ftc-library-loop/desktop-blank.png`、`desktop-blank.txt`、`mobile-modules.png`、`mobile-modules.txt`。證據非新 UI 成果；沒有把此輪標為完整操作、實機手機、輸出或實物驗收。

### W1 已排定的最小工作包

問題：使用者挑機構時需分辨整份替換與模組加入，目前入口分散、直接範例選單沒有 URL 入口同等的替換說明。

下一包：先重用既有入口整理首例用途、主要可調項及載入／加入語意；保留原教學深連結與 ID。針對有作品時從桌面／手機直接選範例的範圍說明、取消、一次復原做實測與最小修正，不先加新的組合模板或大型瀏覽器。

後續 W2：從真正空白畫出兩個設計，量測接孔、固定／動力、改尺寸、指定接口的操作與卡點，逐一改善。W0 不宣稱該路徑已走通。

### 本包交付界限

本包新增規格及工作紀錄，更新索引與上位規格引用；產品程式與作品格式未改。W1–W5 尚未實作，基準已可供下一包施工使用。文件檢查與提交／推送結果在交付時記錄；部署不由 push 成功推論。

交付檢查：四份本包文件的相對 Markdown 連結全部存在；`git diff --check` 通過。Luna 進行一次短規格複核，未發現實質問題，主模型維持唯一寫入者。本包未執行全套測試、未升產品版本；提交僅含兩份新文件、文件索引及 FTC 上位規格引用。提交／推送 SHA 與部署狀態以本次交付回報及 Git 記錄為準。
