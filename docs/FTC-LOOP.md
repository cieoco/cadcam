# FTC 開發 LOOP 與模型分工

規格來源：[SDD-FTC-MODULES.md](SDD-FTC-MODULES.md)。本文件是開發／驗收記錄，不新增產品 UI，也不是背景排程。

## M1 模擬補齊＋模組組裝（2026-09-29 規格完成，待施工授權）

規格及驗收唯一來源：[SDD-ASSEMBLY-MODULES.md](SDD-ASSEMBLY-MODULES.md)。本輪不含力學。基準 commit：`78df05f`。

### 模型分工與升級規則

- **主模型**：寫 SDD、M0 盤點、為每包先寫好失敗中的測試 fixture 或具體驗收指令、審查 diff、跑全套測試、做瀏覽器驗收、記錄證據。
- **施工模型（Sonnet）**：只做下表指定的一包，只改列出的檔案；完成後回報修改檔案、測試輸出與未解決問題。交辦內容要附上檔案、函式、輸入／輸出與驗收指令，不能只寫「請完成 M1b」。
- **升級**：同一包施工 → 主模型審查，**連續兩輪未通過**才改由 Opus 直接施工；升級前主模型先把失敗縮小成具體 fixture。不同模型不同時修改同一檔案。
- 每包通過後才進下一包；commit／push 等使用者明確指示。

### LOOP 工作包

| 包 | 施工 | 成果／允許修改範圍 | 驗收閘門 | 狀態 |
| --- | --- | --- | --- | --- |
| S1 依時間播放 | Sonnet | `motion.js` 新增 `advanceByTime`；`app.js` 的 `play()` 改用 rAF 時間戳；新測試 `test/play-timing.mjs`。 | E-S1 自動＋E-S1b 瀏覽器；既有 rock-motion 測試通過。 | 完成（Sonnet 一輪通過） |
| S2 軌跡一次掃 | Sonnet | 只改 `app.js` 的 `getTrajectoryData`；新測試比較新舊算法。 | E-S2。 | 完成（Sonnet 一輪通過） |
| S2b 窄範圍軌跡取樣 | Sonnet | `traceSweeps` 呼叫端依範圍調整步長（見 S2 證據的發現）；新測試。 | 夾爪範例畫得出兩條軌跡、量測卡最小≠最大；E-S2 仍通過。 | 完成（Sonnet 一輪通過） |
| S4 預設軌跡點 | Sonnet | `motion.js` 新增 `fallbackTraceIds`；`getTrajectoryData` 退回預設點時略過 fixed／motor 點；新測試。 | 沒指定軌跡點的範例不再顯示 0 mm 量測卡；有指定的範例不變。 | 完成（Sonnet 一輪通過） |
| S3 漏解警示 | Sonnet | 新純函式（`motion.js` 或新檔）＋ `updateMechanismStatus` 接線；新測試。 | E-S3＋E-S3b。 | 完成（Sonnet 一輪通過） |
| M0 盤點 | 主模型 | 只讀程式、新增 baseline 測試與本節證據；回答 SDD §7 四個開放問題。 | 列出 fixed 點讀取處、座標寫入口、匯出成本；把 L0 POC 轉成 fixture。 | 完成 |
| M1a 組合求解 | Sonnet | 新增 `js/blocks/assembly.js`（純函式）＋ `schema.js` 的 `normalizeModules`／`toSnapshot` 選配輸出；測試 `test/assembly.mjs`、`test/assembly-schema.mjs`（fixture 由主模型先寫）。 | E-M1～E-M5、E-M7。不碰 app.js。 | 完成（Sonnet 一輪通過，主模型審查補兩處邊界） |
| M1b app 接線 | Sonnet（分三刀） | 刀 1：快照帶模組、rebuild 呼叫 rebake、求解呼叫點改走 assembly。刀 2：世界機架排除已安裝模組、節點外觀、每個模組另出機架檔。刀 3：跨模組合併防呆、D3 編輯前回到組裝姿態、新零件歸屬起點模組。 | E-M3 零回歸＋既有全套＋瀏覽器載入所有範例播放無差異。 | 刀 1 完成（本機 commit） |
| M1c 模組操作 UI | Sonnet | 新增 `js/blocks/module-editor.js`（`createModuleEditor(deps)` 工廠）、模組庫資料、`blocks.html` 局部；app.js 只接線。 | E-M6＋SDD §4.3 七項操作的桌機／窄畫面實測。 | 待施工 |
| M1d R3 驗收 | 主模型 | 內建模組兩個＋必要修正；本節證據與 SDD 狀態。 | E-M8 全程；證據邊界照 SDD §5。 | 待施工 |

建議順序：S1 → S2 → S3（暖身、互不相依）→ M0 → M1a → M1b → M1c → M1d。

### S1 證據（2026-09-29）

- 修改：`motion.js` 新增 `PLAY_SPEED_DEG_PER_SEC`／`MAX_FRAME_DT_MS`／`NOMINAL_FRAME_DT_MS`／`playStepDeg`／`advanceByTime`；`app.js` 的 `play()` 以 rAF 時間戳計 dt；`blocks.html` import map 加 `motion.js?v=20260929_s1`、app.js 升版。`PLAY_STEP=2` 保留給 `walkBranch` 探路。
- 審查：主模型寫的 `test/play-timing.mjs` 有一條期望值錯誤（500 ms 未套 100 ms 上限），Sonnet 回報而未擅改測試；主模型修正測試，實作不變。
- 自動：`play-timing` 17/17；全套 51 支 `test/*.mjs` 全過；`test_blocks_schema.mjs` 70/70。
- 瀏覽器（本機 HTTP，四連桿範例）：確認載入 `motion.js?v=20260929_s1`。預覽面板當時隱藏、rAF 不觸發，因此改以頁面內替換 `requestAnimationFrame` 手動推進真實 `play()`：60Hz 與 144Hz 各 1 秒皆前進 122°（120°/s＋第一幀名目 2°；舊版 144Hz 會是 290°），卡頓 400 ms 只前進 14°（2°＋上限 12°）。console error 為 0。
- 未驗證：實際高更新率螢幕的肉眼觀感、窄畫面播放（E-S1b 以模擬時間戳代替）。

### S2 證據（2026-09-29）

- 修改：`motion.js` 新增 `traceSweeps`（一次 `sweepTopology`，再按 id 取 `points[id]`）；`app.js` 的 `getTrajectoryData` 改呼叫它並移除不再使用的 `sweepTopology` import；import map 升版 `20260929_s2`。
- 自動：`test/trace-sweep.mjs` 34/34（16 個範例、55 條軌跡、0°–360° 每 5°，新舊逐點相同）；全套 52 支全過；schema 70/70。
- 瀏覽器：載入 `app.js`／`motion.js?v=20260929_s2`；切比雪夫、Jansen 各畫出 73 點軌跡，工作範圍卡 128／68 mm；console error 為 0。
- **發現（既有問題，非 S2 造成）**：雙齒輪夾爪的任務擺動範圍為 12.42°–16.21°（僅 3.8°），軌跡以 5° 取樣只得到 1 個點，因此畫不出軌跡線，量測卡顯示「兩點距離 150–150 mm」。舊寫法同範圍同步長，結果相同。列為 S2b。

### S3 證據（2026-09-29）

- 修改：新增 `js/blocks/solve-health.js`（`unsolvedMovingPoints`，排除 workpiece、任一處 fixed 即視為固定）；`app.js` 的 `updateMechanismStatus` 在「解不出動作」之後加 warn 分支；app.js 升版 `20260929_s3`。
- 自動：主模型先以臨時實作驗證測試前提（23/23），再交 Sonnet 施工；`test/solve-health.mjs` 23/23（16 個範例 × 4 角度不誤報、L0 錯誤接法列出 GCB／GPB／RT、fixed 優先、NaN、去重）；全套 53 支全過；schema 70/70。
- 瀏覽器（S3）：把 L0 錯誤接法寫入預覽環境自存後重載，狀態列為 warn「有 3 個接點沒有被帶動（停在原位）」，tooltip 列出 GCB、GPB、RT；四連桿、夾爪、進料（含 workpiece）、雙馬達升降臂、皮帶輪皆為 ready。測試自存已清除；console error 為 0。

### S2b 證據（2026-09-29）

- 修改：`motion.js` 新增 `TRACE_STEP_DEG`／`TRACE_MIN_SAMPLES`／`traceSweepRange`（寬範圍維持每 5°；不足 25 個取樣時改用 span/24，end 加 step×1e-6 以取到末端）；`getTrajectoryData` 改用它；import map 與 app.js 升版 `20260929_s2b`。
- 審查：主模型寫測試時原假設「爪尖距離變化＝淨開口差 20 mm」，臨時實作驗證得 13.03 mm（淨開口以內彎爪板接觸處估算，不是爪尖），先修正測試再派工。Sonnet 回報的「app.js 版本字串不符」是誤讀 git diff 的 HEAD 側，工作區實際為預期值。
- 自動：`trace-range` 24/24、`trace-sweep` 34/34（整圈結果不變）、`play-timing` 17/17、`solve-health` 23/23；全套 54 支全過；schema 70/70。
- 瀏覽器：雙齒輪夾爪由「0 條軌跡、兩點距離 150–150 mm」變為兩條各 25 點軌跡、「兩點距離 137–150 mm」；Jansen 仍為 73 點、工作範圍 68 mm。
- **發現（既有問題，未處理）**：`competition-fourbar-lift` 範例沒有指定軌跡點，app 退回 compile 預設的 `O1`（固定樞軸），因此工作範圍卡顯示「0 mm」。舊算法相同結果。可在範例補 `tracePoints` 或讓預設軌跡點略過固定點，待使用者決定。→ 已由 S4 處理。

### S4 證據（2026-09-29）

- 決策：只做通用修正，不在 `competition-fourbar-lift` 預設軌跡點——該範例教學卡的「試試看」本來就要學生「把前端接點設為工作點量升降高度」，預設好會拿掉這個練習。
- 盤點：沒指定軌跡點的範例共 9 個（四連桿、平行四連桿、滑塊曲柄、齒輪對、減速齒輪、齒條齒輪、皮帶輪、兩個競賽升降），compile 預設點全是 fixed 或 motor 點，修正前都會畫不動的點並顯示「工作範圍 0 mm」。主模型寫測試時誤記為 8 個，以臨時實作驗證時抓到並修正。
- 修改：`motion.js` 新增 `fallbackTraceIds`（找不到、或任一處為 fixed／motor 就回傳空陣列）；`getTrajectoryData` 改用它；import map 與 app.js 升版 `20260929_s4`。
- 自動：`test/trace-fallback.mjs` 20/20；全套 55 支全過；schema 70/70。
- 瀏覽器：四連桿、齒輪對、兩個競賽升降不再畫軌跡、量測卡隱藏；Jansen（68 mm）、夾爪（137–150 mm）不變。把升降臂設 `tracePoints: ['C']` 寫入預覽自存後重載，工具端軌跡 73 點、「工作範圍 96 mm」。測試自存已清除；console error 為 0。
- **發現（既有問題，未處理）**：縮放儀是手動拖曳範例（無馬達、F=2），軌跡掃描沒有輸入可掃，量測卡顯示「兩點距離 96–96 mm」。狀態列「還太鬆」在 `78df05f` 已存在。手動機構的量測卡應隱藏或改為拖曳時即時量測，待另議。

### M0 盤點證據（2026-09-29，主模型，只讀）

- 基準：`726554c`；55 支 `test/*.mjs` 全過、schema 70/70。
- 新增 fixture：`test/fixtures/assembly/lift-gripper.json`（齒條升降 Lift1＋齒輪夾爪 Grip1，夾爪馬達改 2 號、底座 GCA 平移到滑台輸出端 `LiftOutput`、不共用點 id；`mount.ref = (30, 0, 90°)`、`home = {1: 0}`；不帶夾爪任務 marker）。以參考算法（各模組獨立解＋`T = pose_now ∘ ref⁻¹`）驗證：M1 ∈ {−40, 0, 60} 時 GCA 相對 `LiftOutput` 偏移為 0、兩齒輪中心距 60.000000；爪尖距只隨 M2 變（189.822 → 87.367）。
- 座標寫入入口（SDD §7-1）：`updatePointCoordsById` 24 處／9 檔、`movePointById` 10、`mergePoints` 6、`pointCoords` 40、`worldFromEvent` 21 → 超過門檻，維持 D3「回到組裝姿態再編輯」。
- fixed 點讀取（§7-3）：109 處／16 檔。`S.compiled` 只有 app.js 讀（22 處）。整體編譯 fixture 可正常求解（home 姿態 valid）；`analyzeDof` 整體 F=2＝升降 1＋夾爪 1。→ SDD §4.2 改為雙軌：繪製沿用整體 `S.compiled`，求解另走 `S.assembly`；只需換 4 個求解呼叫點、排除 3 個世界機架入口與節點外觀。`groundIds` 被馬達朝向與 3D 疊層當作「最近機架點」使用，不可排除。
- 匯出（§7-2）：`exportFrameAsSvg／Dxf` 直接吃 `frameNodes` 陣列，另出 `<模組名>-frame` 成本低。
- **兩個會踩雷的發現**：(1) 齒輪既有欄位 `module` 是模數，模組歸屬改名 `comp.moduleId`；現行 schema 會把 `moduleId` 全部丟掉，M1a 要補。(2) share-codec 只以字元黑名單 `< > " ' `` ` 把關（無欄位白名單，`modules` 可通過），但模組名稱含引號會讓整份分享被拒，正規化需過濾。
- 已知風險（不在 M1 處理）：`buildMotorMounts` 的朝向用靜態座標，宿主會旋轉時模組上的馬達外觀朝向可能停在 home；R3 齒條只平移不受影響。
- SDD 已同步修訂：§3.1 欄位名、§3.3 名稱過濾與 moduleId 保留、§4.2 雙軌整合、§7 四題答案。

### M1a 證據（2026-09-30）

- 規格修訂（開工前）：輸出端位姿改為「位置取安裝孔 `at`、方向取構件」，孔移位時模組跟著移（SDD §3.2）；rebake 旋轉時一併旋轉世界方向角度欄位（SDD §4.1）；API 定稿（`compileAssembly／solveAssembly／sweepAssembly／outputPose／rebakeModules／canMergePoints`、`module-schema.js` 的 `normalizeModules`）。fixture 的 `mount.ref` 隨之改為 `(45, 88, 90)`。
- 主模型先寫 `test/assembly.mjs`（E-M1／M2／M3／M5／M7）與 `test/assembly-schema.mjs`（E-M4），並驗證前提：齒條 176→200 時 `LiftOutput` +12 y；旋轉臂 `phaseOffset` 改 30° 時臂端在 (103.923, 60)；夾爪範例 LT／RT 存檔座標與解差 0.1087 mm（範例原有取整），I1 測試對爪尖改驗「誤差不變」。
- 施工（Sonnet）：新增 `assembly.js`、`module-schema.js`；`schema.js` 在 comps 迴圈單點補回 `moduleId`（順帶讓「不支援的零件」分支 `return`，避免 moduleId 貼到上一個零件）、`normalizeSnapshot` 呼叫 `normalizeModules`、`toSnapshot` 非空才輸出 `modules`。一輪全過。
- 主模型審查修正兩處邊界並各補測試：(1) rebake 的角度差未換算到 (−180, 180]，180° 與 −180° 會被當成轉一圈、齒輪相位 −360；(2) 安裝迴圈偵測在「P 裝在迴圈上但不在迴圈內」時會誤拆 P，改為只在繞回自己時才拆。
- 自動：`assembly` 38/38（含所有範例 modules 為 undefined／[] 時 solve／sweep 與原本逐位元組相同）、`assembly-schema` 33/33；全套 57 支全過；schema 70/70。
- 瀏覽器：import map 的 `schema.js` 升版 `20260930_m1a`，確認載入新版與 `module-schema.js`；五個範例狀態正常；把 fixture 寫入預覽自存後重載，F=2、「2 組動力已就緒」，console error 為 0，測試自存已清除。
- 已知限制（M1b 處理）：app 存檔尚未傳入 `modules`，含模組的作品再存檔會掉模組資訊；目前沒有任何介面能建立模組，不影響使用者資料。→ M1b 刀 1 已處理。

### M1b 刀 1 證據（2026-09-30，求解接線；本機 commit、未 push）

- 施工（Sonnet，一輪通過）：`assembly.js` 新增 `moduleOfPoint／homePoseFor／homeAdjustment／worldFrameComps／mountedBaseIds`；`motion.js` 的 `planMotion`、`traceSweeps` 可注入求解函式（預設不變）；`state.js` 加 `S.modules／S.assembly`；`app.js` 的 `motorSnapshotState` 帶 `modules`、`applySnapshot` 還原、`rebuild` 先 `normalizeModules`（只取 modules）再 rebake（就地寫回零件物件）、`solveFrame／getTrajectoryData／planMotion` 改走 assembly；import map 升版 `20260930_m1b1`。
- 主模型審查修正：(1) 沒有模組時 `rebuild` 仍多編譯一次全部零件（拖曳每步都 rebuild）→ 改為沒有模組時 `S.assembly = null`，走原本的 `S.compiled`，行為與成本與改動前完全相同；(2) `homeAdjustment` 未處理 0°／360° 環繞，補上並加測試。
- 自動：`assembly-app` 21/21、`assembly` 38/38、`assembly-schema` 33/33、`trace-sweep` 34/34、`trace-range` 24/24；全套 58 支全過；schema 70/70。
- 瀏覽器（fixture 寫入預覽自存後重載，M1 控制）：以替換 `requestAnimationFrame` 手動推進真實 `play()` 到 62°，滑台 `LiftRack` 與夾爪 GCA、GCB、LT 皆上移 76.97 px；GCA、LiftRack 圓心與 `solveAssembly` 投影誤差 0。爪尖 LT 起初比對有約 4 px 差，追查為比對基準錯誤：schema 載入時把三點桿邊長 `LJ_edge` 121.8 取整為 122（原版範例同樣如此，既有行為），改用 app 實際參數後誤差 0。量測卡顯示兩條軌跡；自存帶 `modules`（2 個）與 9 個 `moduleId`；切到四連桿範例時 `S.assembly` 為 null；復原回組合作品後模組與 units 恢復。console error 為 0；測試自存已清除。
- 未驗證：窄畫面實際觀感（預覽面板為窄版且隱藏，截圖不可辨識細節）；世界機架、節點外觀、匯出、編輯守門留待刀 2、刀 3。

## R1e 加工設定隨作品保存（2026-09-25 功能完成，2026-09-26 下載落地驗證通過／完成）

規格及驗收唯一來源：[SDD-RIGID-MEMBERS.md](SDD-RIGID-MEMBERS.md) 的 R1e 與交接提醒 H1–H6。本節只安排施工與收集證據，不重複定義資料欄位。基準 commit：`4d2b5a6`，已推送 `origin/main`。

### 狀態與施工界線

- 規格先以 `13b5ff9` commit／push；其後依使用者授權啟動 LOOP。L1 純資料模組由 gpt-6-luna 高推理有界施工，主模型完成 schema、生命週期、UI 交易、測試與實際瀏覽器驗收。功能變更尚未另行 commit／push。
- 目標是現有孔徑／TT 扁孔／TT 與 MG995 安裝設定的完整作品保存與重現；不是新增通用機械接口庫、材料選型或製造認證。
- 沿用既有分工：主模型處理資料邊界、遷移、整合與瀏覽器驗收；取得施工授權後，較便宜的施工模型才按下列有界工作包實作。不要只交付「請完成 R1e」讓施工模型自行擴張範圍。
- 所有包先檢查 H1 孔位／外形、H2 同源／相容、H3 取消／復原、H4 原入口、H5 自動＋UI＋快取、H6 證據邊界。涉及不適用項時寫理由，不能默認跳過。

### LOOP 工作包與驗收閘門

| 工作包 | 成果／允許修改範圍 | 驗收及進入下一包的條件 | 狀態 |
| --- | --- | --- | --- |
| L0 現況與基準 | 主模型盤點 `state.js`、`schema.js`、`storage.js`、`settings.js`、app 的全部 snapshot／載入入口、幾何 consumer 與分享安全閘；只新增相關 baseline tests 及本節證據。 | 凍結三組 loader 生效後的 version 1 預設、舊作品 fixtures、元件孔徑覆寫規則；47 支與 schema 基準重新確認。不得先改預設。 | 完成 |
| L1 純資料契約 | 有界施工：新增純加工設定模組與獨立測試；主模型接入 schema。候選檔案 `js/blocks/fabrication-profile.js`、`schema.js`、`test/fabrication-profile.mjs`（名稱於開工交接時確認）。 | E1 通過：白名單、版本、缺省、嚴格輸入、跨欄位計畫、不污染原資料。規格之外的遷移決策交回主模型。 | 完成 |
| L2 保存與載入閉環 | 主模型整合 `state.js`、`settings.js`、`storage.js`、`app.js` 必要接線與相關 tests；需要時局部調整 example／gripper controller 的 snapshot 注入。 | E2、E3、E6 的載入原子性通過。JSON、自存、分享、復原、範例及記錄都帶同份設定；不更改 share-codec 安全限制、不留下兩份可變設定。 | 完成 |
| L3 原設定入口與交易 | 有界施工：`settings.js`、`blocks.html`、必要 app callback 與設定控制器 tests；沿用現有控制項。 | E4 通過；先驗證桌面／窄畫面草稿、Escape、Enter＋blur、一次復原，再接下一包。沒有新增常駐面板或全域偏好設定頁。 | 完成 |
| L4 幾何與出口核對 | 主模型先列失配 fixture，再指定施工模型修改具體 consumer；範圍限 `member-stock.js`、`exporters.js`、2D render／3D scene 的必要修正、製作記錄與 tests。 | E5、E6 通過；孔心／求解不變、元件覆寫保留、留料不相容能修回。不得順便重構 solver、Frozen mechanism 或更改硬體尺寸標準。 | 完成（沿用既有 consumer，無需改 solver／幾何模組） |
| L5 獨立驗收與交接 | 主模型檢查 diff、全套 tests、HTTP 實際頁面、實際檔案；完成本節證據與 SDD 狀態。程式只修前面驗收發現的具體問題。 | E7、E8 與 H1–H6 全過才完成；下載落地未確認就保留未驗收標記，不沿用歷史成功紀錄。 | 完成（2026-09-26 補驗 E7 下載落地） |

每包流程：指定檔案與預期輸入／輸出 → 施工及自測 → 主模型獨立檢查 → 具體失敗案例修正 → 通過才進下一包。不同模型不要同時修改同一檔案；兩輪未通過則先縮小問題並由主模型診斷，不繼續堆介面。

### 必須帶給施工者的提醒

- `settings.js` 目前每次輸入即寫本機偏好，不能直接沿用為作品交易；需要草稿／提交界線與完整 undo snapshot。
- `schema.js` 必須保持純函式；「本機舊自存」與「外部舊檔」的不同處理要由入口提供來源，不能偷讀 localStorage 判斷。
- 存檔、分享、autosave、undo、gripper record 與範例切換都要盤點，漏任一入口會出現同一作品不同孔徑。非法載入不能清掉或覆寫當前可用作品。
- R1d 的元件 `stock` 和個別接口欄位不得被新加工 profile 改成重複來源；機架樑寬只屬機架。舊檔未攜帶的歷史偏好無法憑空恢復，提示不能聲稱完全重現原加工輸出。
- 開啟新版本後要核對 import map，保持 state／view 單例；驗收時先觀察現有作品，避免和使用者同時操作。測試造成的作品修改需復原，若下載或切換需保留備份，先確認恢復路徑。
- 不把保存成功、SVG/DXF 生成或 3D 可見當作實物可裝配、無碰撞或能可靠夾持的證據。

### 證據紀錄模板（施工後填寫）

- 工作包／基準 commit／修改檔案：待填。
- H1–H6 檢查結果及理由：待填。
- E1–E8 對應指令、fixture、通過／失敗數與失敗修正：待填。
- 實際 UI：視窗尺寸、作品來源、修改前後數值、一次復原／取消／重載結果、錯誤紀錄：待填。
- 跨環境：來源與接收環境的不同偏好、載入後有效設定、偏好未被改寫的證據：待填。
- 檔案：JSON／SVG／DXF／製作記錄的實際路徑與內容核對；未落地者的原因：待填。
- 測試作品恢復情形、未驗證項、是否獲得 Git 提交／推送授權：待填。

### 本輪實際證據

- 修改：新增版本化 `fabrication` 純模組與三支測試，接入 `state`／`schema`／`settings`／`app`／example controller 及中央 import map；既有加工設定只多一行來源提示，沒有新面板。
- 自動驗收：50 支獨立測試全過；`test_blocks_schema.mjs` 70/70；語法及 `git diff --check` 通過（只見 Windows 換行提示）。完整、局部、未知、非法、跨欄位、一次交易、Escape、舊偏好遷移、保存／分享／製作記錄皆有 fixture。
- 實際 UI：窄畫面將連接孔 12.96→6 mm、Escape 取消 9 mm 草稿、重載仍為 6 mm，另做一次 12.96→6→單次復原回 12.96；分享資料解碼確認三組 profile，分享網址重載後以作品 6 mm 覆蓋接收端本機值。桌面 1280×800 顯示同一設定與來源提示，console error／warning 為空。
- 恢復：移除測試 hash，將孔徑改回 12.96 mm，等待自存後重載確認；視窗 override 已 reset。實際 JSON 下載事件逾時且 Downloads 無新檔，因此 JSON／SVG／DXF 落地仍待後續環境驗證；沒有硬體、配合、公差或加工認證。

### E7 補驗（2026-09-26，下載落地）

- 背景：上次驗收時內嵌預覽瀏覽器的下載事件逾時、檢查當下 Downloads 無新檔，E7 標為未驗證。本次重新排查，發現原因不是程式問題：內嵌瀏覽器下載會先落地成隨機檔名的 `.tmp`（瀏覽器自己的暫存→正式檔名改名尚未完成），等一段時間後才會自動改回正式檔名；用一支跟本專案完全無關的最小 `<a download>` 測試也重現同樣行為，確認與 [exporters.js](../js/blocks/exporters.js) 的 `downloadText` 無關。
- 正式驗證改用使用者真實 Chrome（Claude in Chrome 擴充功能）：載入 `gear-gripper` 範例，點「匯出」→ SVG 逐一匯出，Downloads 資料夾內即時出現 `GearA.svg`、`GearB.svg`、`LeftJaw.svg`、`RightJaw.svg`、`frame.svg`，檔名與內容皆正常；`LeftJaw.svg` 內容含「材料與尺寸：未指定・板寬 18 mm・厚度 4 mm」註記，幾何座標與範例一致。
- 結論：E7「實際取得新的 JSON／SVG／DXF、製作記錄檔案並核對內容」對 SVG 子項已通過；下載機制本身在兩種瀏覽器環境下最終都會產生正確檔名的檔案，先前「未落地」是檢查時機過早所致，不是功能缺陷。測試期間產生的暫存與正式檔名測試檔（內嵌瀏覽器 6 個、真實 Chrome 7 個）已於驗證後清除，不殘留於使用者 Downloads。R1e 依此視為完成；碰撞、材料強度、加工與硬體驗證仍不包含在內。

本次文件交接已完成；R1e 已收尾。下一個可執行工作待新一輪 L0 盤點，需後續施工授權。其他待辦（通用鏡像／自由外形、碰撞／夾持力、硬體與實物）仍留作後續獨立規格，不併入 R1e。

## R1d 直接拖爪端與實體資料（2026-09-25，已完成）

- 規格：SDD-RIGID-MEMBERS.md 的 R1d。主模型負責設計、整合、審查與實際頁面驗收；沿用 GPT-6 Luna 高推理處理有界的 stock 純資料、匯出與手勢驗收腳本，未更改全域模型或啟動背景排程。
- LOOP 1：選夾爪即可拖 T 把手，沿原方向改 8–160 mm；不移動孔或改彎角。預覽獨立於 snapshot，放開一次復原；Escape、pointercancel、lostpointercapture 取消；方向鍵 ±1 mm，沿用左右同步。
- LOOP 2：直桿／折線桿／結構板／夾爪統一 stock（板寬、板厚、材料），存在元件本身。板寬驅動輪廓及夾爪淨距，板厚驅動 3D 厚度、層距與銷長；JSON／分享／SVG／DXF／製作記錄讀同一份資料。材料只作註記。
- LOOP 3 審查修正：機架樑寬與零件孔徑解耦，避免調機架時縮掉 TT 接口；匯出前攔下板寬不足孔徑加 0.5 mm 的作品。窄畫面復原入口被遮住，因此在既有零件設定列補上復原。3D 初始取景加入外輪廓與爪端，任務卡在 3D 讓位。
- 自動驗收：47 支 test/*.mjs（不含 _harness）通過，另 test_blocks_schema.mjs 70/70。新增 stock、匯出、跨存檔／分享／淨距／3D 整合與手勢測試；member-editor 12/12、jaw-tip-handle 7/7。取消手勢與 snapshot 不污染由假 DOM 事件加真 editor／schema 驗證；不能稱為實際觸控硬體測試。
- 實際瀏覽器驗收（508×738）：拖左爪 T，62.1→89.2 mm，切右爪確認同值；孔距 18／107／122 mm 不變，一次復原回到同姿態淨距 80 mm。板寬 18→24 mm 後淨距 80→74 mm；板厚 6 mm、夾板標籤在右爪亦一致。3D 可見模型；修正取景後重載確認整支爪端完整且無任務卡遮擋。方向鍵 62.1→63.1 mm，再用零件列復原成功。瀏覽器 error logs 為空。
- 驗收修改已用復原還原，頁面留在原作品的 2D。保存／分享還原、SVG／DXF 內容與材料註記由自動測試驗證；本輪未宣稱實際加工或重新驗證下載落地。驗收時尚未提交；其後依使用者要求以 `4d2b5a6` commit 並 push 至 `origin/main`。
- 邊界：無 stock 的舊件仍以原畫布 18 mm／3D 4 mm 顯示，不自動寫回；以前另設的全域匯出桿寬現在只用於自動機架。馬達孔槽可能讓承載桿局部擴寬。未完成齒輪／滑軌等類型材料選型、全類型自由外形與通用鏡像、完整碰撞／夾持力／硬體與實物驗證。

## R1c 統一桿件（2026-09-25，歷史記錄）

- 本輪規格：[SDD-RIGID-MEMBERS.md](SDD-RIGID-MEMBERS.md)。先統一剛性零件的孔距／外形語意，不推倒 UI；直接拖爪端、全類型板寬及材料一致性列為後續，沒有宣稱已完成。
- 主模型負責 SDD、共用尺寸計畫／編輯器、畫布尺寸、幾何與存檔整合；GPT-6 Luna 高推理處理有界的有限往返 helper 及 3 支獨立回歸測試。沒有更動帳戶模型或啟動背景排程。
- LOOP 1：直桿／板件共用 A–B、A–C、B–C 尺寸與精確輸入；±8 mm 不再先取整。非合法三角或超界先拒絕整筆修改。夾爪 B–C 是跨距，A–B 與 A–C 才是實體段；由齒輪決定的孔距鎖定並指引去齒輪修改。
- LOOP 2：爪端 C–T 用 jawTipLength 存於元件；幾何中心線、2D、3D、加工輪廓及任務淨距共用。原有對稱任務可同步左右且只記一筆復原；一般零件不猜配對。旧檔無欄位時沿用原外形。尚未生效的夾爪自由外形控制收起，普通板件保留。
- 審查發現及修正：Luna 控制器測試抓到切到直桿時殘留 tip 選取；瀏覽器發現快取混用舊模組；已分別重設選取及集中 import map 版本。有限行程改用反射旅行距離，涵蓋端點起播／一步跨越多次邊界。
- 測試：43 支獨立腳本通過；member-dimensions 10/10、member-editor 9/9、rock-motion 8/8；後續補強 gripper-workflow 11 個案例含 40／70／90 mm 爪端實際 solver 開口核對、保存還原及非對稱拒絕。語法與 diff 檢查通過（僅 Windows 換行提示）。
- 實際頁面驗收：窄畫面點 C–T 尺寸線選取爪端；約 62.1 → 70 mm，右夾爪也顯示 70 mm，孔距仍為 18／107／122 mm。離開選取時同姿態淨距更新為 72.5 mm。從閉合端播放可見淨距 71.8 mm，停止後一次復原；再次選取確認 C–T 回到 62.1 mm。沒有新增主頁／常駐側欄，瀏覽器錯誤紀錄為空。
- 驗收時使用者也在操作，曾先暫停接管；取得使用者允許後才繼續 UI 驗證，測試尺寸已復原。程式未 commit／push／發布。
- 未完成：直接拖爪端、全類型外形自由編輯、板寬／孔徑／材料完整統一、碰撞／夾持力／硬體與實物驗證；先前下載落地問題亦未於本輪重驗。下一轮按本 SDD 擴充，不疊加新的操作面板。

## 每輪必須符合的產品原則

最高原則是「教學與應用兼具的快速原型＋數位樂高」。測試通過是必要條件，但不是產品成果的全部。

每個工作包需寫明本輪改善哪一項，並在驗收時提供實際操作證據：

1. 快速原型：使用者從任務到第一次看見有效變化，需要哪些動作？本輪是否減少不必要的輸入或切換？
2. 教學：使用者能否看懂一個具體的輸入／結果關係，自己改一次並比較或復原？只顯示計算數字不算完成因果教學。
3. 數位樂高：作品能否繼續修改、拆解或重用？涉及模組組合時，接口與不相容條件是否明確？
4. 應用：資料能否保存及重現？哪些只做了幾何驗證、哪些仍待硬體或實物驗證？
5. 介面：是否保留足夠操作畫布？能否沿用既有操作，而不增加常駐面板或多層入口？

不要求每輪實作全部能力；未涵蓋者明列為後續工作。若一個方案只讓模型自動算完，卻無法理解、改造或銜接製作，就交回設計審查，不能直接宣布達成最高原則。

## 每輪流程

主模型定義一個可操作成果、允許修改檔案、禁止事項與驗收案例 → 較便宜的施工模型修改及自測 → 主模型獨立查 diff、測試及實際操作 → 不通過則交付具體失敗案例修正 → 通過才記錄證據並選下一個小步驟。

- 主模型負責 SDD、機械／資料架構、取捨、風險與最終驗收，不讓施工模型自行改需求或自行宣告產品完成。
- 施工優先用 gpt-6-luna，單次只派一個有界工作包，精簡交接、不複製整段歷史。模型不可用時先報告，不默默改用更昂貴模型。
- 同一問題兩輪未修好，先由主模型診斷或縮小工作包；重大架構／產品取捨才詢問使用者。
- 不更改帳戶／全域模型設定。多模型不保證總成本更低；控制任務大小、返工與重複掃描比增加代理數量重要。
- 每輪只報實際完成的驗證；自動測試通過不能代替 UI、加工或實物驗證。
- LOOP 延續目前任務的授權；不自行發布、購買硬體、改外部服務或無限啟動背景工作。

## 施工交接格式

目的 / 本輪對最高原則的具體貢獻 / SDD 驗收編號 / 允許檔案 / 已有接口 / 禁止事項 / 必跑測試 / 回報修改、操作證據、未通過項。不要要求施工模型重新設計產品。

## 本輪狀態（2026-09-25）

- R0 直接連桿操作：已完成拖放／點兩下、孔位吸附及工具切換；已有測試與瀏覽器四連桿操作驗證。見 SDD-DIRECT-ASSEMBLY.md。
- R1 純計算：node test/gripper-workflow.mjs 的 8 組案例通過，涵蓋 5 組尺寸各 101 點獨立細掃描、失敗案例、非預設馬達 ID、分享還原與製作記錄內嵌資料。
- 審查修正：求解點 p3 是夾爪折彎處，不是實際末端。改用 plate-geometry.js 的 jawCenterline 末端；預設淨距 50–70 mm 對應約 50.45–54.24°，測試同步針對真實板形末端驗證。
- R1 工作流程 UI：gpt-6-luna 已施工；主模型審查及修正尺寸編輯復原、播放暫停、快取版本、手機讓位與畫布留白。沒有新增操作頁或側欄。
- 最終自動驗證：38 支 test/*.mjs（排除 _harness.mjs）全數通過；後續補強的 gripper-controller 10/10 通過。app 語法與 git diff --check 通過（僅 Windows 換行提醒）。
- 瀏覽器驗收：預設載入、張開／閉合、50→80 mm 鍵盤輸入與一次復原、151 mm 錯誤提示及播放阻擋、2 mm 單側餘量的窄範圍播放、自動保存後重新載入均已操作。390×844 畫面任務卡讓位及畫布留白已檢查，視窗尺寸已還原。
- 下載實證：gripper-build-record.md 已由按鈕下載，檢查實際檔案含 50 / 10 mm、50.45 / 54.24°、零件清單及未驗證項。瀏覽器下載事件等待未回傳，但檔案確實存在且內容正確。
- 本輪交付是幾何任務原型，不是製造完成。爪臂在部分姿態的投影交叉需要下一輪確認實際疊層與物件干涉；不能據此宣稱碰撞安全或可靠夾持。
- R2 / R3：未施工；不能把 R1 當成已完成 FTC 製造流程。
- 後續實際示範發現：中等寬度視窗仍有任務卡遮擋齒輪；80 mm 物件的張開／閉合與播放可操作，但這次下載尚未確認產生新版檔案。R1 的介面與下載驗收重新列為待收斂，不能沿用先前通過結論。
- 使用者確認最高原則：教學與應用兼具。已寫入 SDD 與本 LOOP 驗收；畫布物件及直接尺寸操作仍是待設計／施工項，本次僅更新規格，沒有新增 UI。

## R1b 修正結果（2026-09-25）

- 主模型處理新版相向內彎爪端、畫布物件／手勢、計算與整合驗收；gpt-6-luna 處理有界的卡片排版及下載 helper。保留原有四個可編輯零件，沒有新增頁面或面板。
- 新版夾爪最大預估開口約 128 mm；10–150 mm 是輸入範圍，不保證任何尺寸都可達。不可達時保留物件尺寸參考及把手，可以拖回；舊外彎作品不被修改，提供明確新版範例提示。
- 畫布方形物件固定在閉合爪尖中心，不參與物理／加工。左右把手直接改尺寸、方向鍵微調；預覽不修改 snapshot，放開只提交一筆復原，取消回到已保存尺寸。播放更新淨距文字，不移動參考物件。
- 畫面驗證：在當時可見的窄視窗中，拖曳 50→79 mm，右把手方向鍵調到 80 mm，再閉合；可見淨距 80.0 mm，張開需求公式 80 + 2×10 =100 mm。卡片、物件及機構分開排列；字幕與把手以螢幕尺寸維持可讀／可點。
- 40 支獨立測試腳本通過；後續補強通過 planner 9 組、controller 16/16、download 8/8、object 手勢及固定物件測試。涵蓋舊作品不變、預覽／提交／取消、不可達可修回、原生下載連結的 UTF-8 內容與內嵌 snapshot 一致。
- 下載生命週期改善並改為直接連結，檔名含寬度與时间；程式及 DOM 確認本次為 80 mm 的新記錄。內嵌瀏覽器實際檔案落地仍未確認（檢查使用者 Downloads 尚只有舊 50 mm 檔案），此項仍待驗證，不能宣稱已修好。
- 後段畫面切到齒輪編輯，保留當下選取，沒有為驗收而覆蓋目前編輯。未發布或提交 Git。下一步先確認實際下載／保存與窄螢幕的操作回饋，再處理板件疊層和實物接口；目前不是碰撞安全或製造就緒的認證。
