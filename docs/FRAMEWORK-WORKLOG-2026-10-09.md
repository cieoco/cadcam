# 框架穩定化工作紀錄

依據：[已核准 SDD v0.3](SDD-FRAMEWORK-STABILIZATION-2026-10-09.md)。2026-10-09 使用者確認施工。

## 接手資訊

- 分支：`codex/framework-stabilization`；起點：`1537242`（應用 `2026.10.08.13`）。
- 唯一寫入者：`w1_safety`（Sol high）；主代理 `/root` 交棒後只讀審阅，`endpoint_audit`（Sol high）只讀審閱 D1 保存契約。
- 本機：Windows、Node `v25.2.0`、Python `3.13.5`。CI 的 Node 版本在 W1 固定並驗證。
- 使用者原有未追蹤附件、`Claude outputs/`、截圖及框架檢討文件保留。提交只選本包檔案。
- Astra 僅 low；更高推理強度須另獲確認。主聊天不宣稱自行切換模型。
- 實體手機尚未連線／量測；桌面手機尺寸驗收不代表實機效能通過。W6 必須補足或取得明確範圍調整。

## 工作包

| ID | 狀態 | 本輪結果與下一步 |
| --- | --- | --- |
| W0 | reproducing | 重新登錄並執行測試；核對 D1 端點保存能力與教材缺口 |
| W1 | verifying | 九項失敗完成分類／修正；Node 22.14.0 全套 143/143；HTTP 瀏覽器驗收由主代理補核 |
| W2 | planned | 統一載入版本與 check |
| W3a–W5a／G1 | planned | F1 端點、實體、干涉、預覽、保存與輸出貫通 |
| W3b–W5b | planned | 其餘格式、多接合位置、教材與效能 |
| W6 | planned | 全面驗收、提交推送與發布核對 |

## LOOP 紀錄

### W0 / L–O：建立基準

- 沒有 tracked 程式變更；從 main 建立施工分支，沒有修改使用者附件。
- 原檢討的測試數字只作線索，實際結果另存 `output/framework-stabilization/baseline/`。
- 測試入口只登錄 `test` 頂層非 `_` 的 `.mjs` 與根目錄獨立腳本；helpers／fixtures 不獨立執行。
- 下一步：記錄真實失敗、分清產品回歸與測試環境問題，再交付最小修正。

### W0 / P：Node 基準結果

- 指令：逐一 `node --no-experimental-webstorage <入口>`，每支 90 秒逾時，Node v25.2.0，起點 1537242。
- 139 支 `test/*.mjs` 入口，加根目錄 schema／分享／hull 共 142；133 通過、9 失敗。
- 失敗：assembly-schema、bench-mounted-frame、bench-persistence-cache、bracket-holes、mate-connect、mates-view、rack-stop、solve-health、trace-fallback。
- 證據：`output/framework-stabilization/baseline/manifest.json`、`results.json` 與逐支 log。資料只在本機，不自動接受成正確基準。
- 初步分類：圓角外框小段造成接邊錯誤；假 DOM 缺節點；範例新增與求解器已變更造成舊測試前提失效；rack-stop 需進一步重現材料干涉。

### W1 交棒

- 起點 1537242；未提交的本計畫檔案只有 SDD 與此工作紀錄。
- 寫入者 w1_safety；範圍為測試入口／CI 與九項失敗的最小修正，不變更持久化格式。
- 回交條件：完整已登錄 suite 通過、失敗可阻擋部署、修正原因與指令寫入本紀錄；不得修改使用者原附件或自動接受 baseline。

### W1 / L–O–O–P：安全網與基準失敗處置

- 唯一寫入者：`w1_safety`，Sol high；分支 `codex/framework-stabilization`，起點 `1537242`。未委派其他寫入者；主代理與 endpoint_audit 保持唯讀。
- **產品回歸（四支）**：bench-mounted-frame、bracket-holes、mate-connect、mates-view 共用的圓角矩形外框，把每段弧線取樣當成安裝邊。`sizeFrameOutline` 直接提供切線端點間的材料直邊；export outline 保留原精度，接口只列真直邊。保留原線段索引 `6/13/20/27`，不重新編號；選邊與換站立邊排除圓角。bracket-holes 的舊 `edge:frame:0` 本身是弧線，正例改從正式接口挑合法直邊，所有孔軸／貼合斷言保留。
- **測試前提（assembly-schema）**：新增組立範例後「所有範例沒有模組」已不成立。舊檔無模組行為照驗，新組立範例各自加保存往返斷言，不排除有效範例。
- **測試环境與前提（bench-persistence-cache）**：精靈已不讀工程模式 localStorage 偏好，null 假 DOM 因此進入精靈清單。測試明確呼叫仍保留的工程控制器切換 handler，維持快取／預覽保存／取消／確認的原斷言；此支不當成學生精靈 UI 驗收。
- **測試前提（solve-health）**：目前 solver 已直接拒絕錯誤合點造成 LeftJaw 不能保持 121.8 mm 孔距。斷言改驗真實拒絕原因，同時保留歷史部分結果的 GCB／GPB／RT 漏解檢查。未改求解演算法。
- **測試前提（trace-fallback）**：取消歷史固定九範例計數；逐一驗全部現有未指定軌跡範例，另確認覆蓋非空且完整。
- **測試 fixture（rack-stop）**：目前整片矩形機架在原 176 mm 齒條的零姿態已撞 MG995 機身；`suggestRackStops` 正確不建議用行程限制修復零姿態。保留原組裝為負例；正例加長實體齒條 30 mm（tip 孔移高 15 mm），用正式接口重裝，保留原限位、上限、導銷、無干涉及純函式斷言。未放寬材料碰撞，也未把夾爪任意移離接點。
- **回歸與相容性**：增加材料直線端點驗證、旋轉外框、四個舊 childEdge 保存與非零姿態、舊 host edge 6/13 保存及材料端點驗證；mates normal/order 保留原側。圓角索引或外法線失效時拒絕新接合；舊紀錄仍保留，solver 回報 `host-invalid`，不猜另一面。
- **Runner**：`node tools/test-runner.mjs`；`test/manifest.json` 明列 143 支入口（原 142＋runner-contract），三個 imported helpers 明列理由。每支獨立 Node 程序、90 秒逾時、失敗非零退出；manifest 漏項／重複／不明 selector 均拒絕。結果含 Git commit、tracked dirty 狀態、Node、平台、旗標、manifest hash 與逐支 file log。限定忽略本計畫證據與 runner 輸出，未忽略全部使用者 output。
- **CI**：PR／所有分支 push／manual 均跑同清單；Node 固定 `22.14.0`（本機另下載確切 runtime 驗證，未新增 npm）。build 必須 `needs: test`，deploy 必須 `needs: [test, build]`；兩者限 main push／manual main，checkout 固定相同 `github.sha`。runner-contract 實際執行失敗、crash、timeout 腳本，驗證不能得到全通過結果。未 push／merge／deploy；雲端 workflow 執行仍待 W6。
- **證據**：Node 22.14.0 `output/framework-stabilization/w1-verified-node22/results.json` 全套 143/143；補強保存參照後的兩支 2/2 於 `w1-saved-reference-final/`，無效舊接法 1/1 於 `w1-invalid-legacy/`。本機 Node 25.2.0 runner-contract 1/1；unknown selector 非零退出。actionlint `1.7.7` 檢查 workflow，exit 0、無診斷。原始完整 logs 留在 ignored output，不提交。
- **剩餘門檻**：主代理補 HTTP UI 核對；Node 通過不宣稱瀏覽器已通過。W2 處理載入 URL／cache 版本，W6 再驗正式 Linux CI 與部署 commit 一致。實機手機效能仍未驗收。

### D1 契約決策／W0 其他證據（主代理傳入）

- 使用者已批准後續 W3 加可選 `mount.face.childPart`，保留 `blocks v1`；舊資料端點歧義時保留姿態並提示重選，不從目前 faceParts 猜 child 零件。
- 使用者已批准六面宿主底板沿用既有 `mount.to.frame` 形狀。兩項由主代理在 W3 施工；W1 未修改 schema 或持久化契約。
- 原附件 `C:/Users/user/Downloads/blocks (13).json` 可用：14 零件、Mod9 四連桿＋Mod7 夾爪、宿主 4 mm／子板 3 mm、90°／三個角碼；原附件不提交。
- 主代理 HTTP 基準（127.0.0.1:8010）已看到練習範例 main／iframe 都為版本13、單一精靈可開，但教材仍指示已不存在的工程入口；教材缺口歸 W5b。

### W1 回交 checkpoint

- 本包本地提交將只選程式／測試／CI／README／已核准 SDD／此紀錄；不選 REVIEW、附件、Claude outputs 或 output 證據。
- 提交後跑同清單，結果留 `output/framework-stabilization/w1-committed-node22/`，其中 commit 欄位為驗證對象；最後 commit 由交棒訊息附上，避免文件自指 commit hash。
- 回交後唯一寫入者恢復 `/root`；下一步 W1 HTTP 補核、W2 載入一致。長期純幾何來源共用與 D1 欄位是後續包，未以本包測試通過宣稱全案完工。
- 本包模型用量沒有可取得的精確 token；一次施工子任務、零再委派、Sol high；測試與工具結果均 file-backed，未虛報 token。
