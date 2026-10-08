# 框架穩定化工作紀錄

依據：[已核准 SDD v0.3](SDD-FRAMEWORK-STABILIZATION-2026-10-09.md)。2026-10-09 使用者確認施工。

## 接手資訊

- 分支：`codex/framework-stabilization`；起點：`1537242`（應用 `2026.10.08.13`）。
- 唯一寫入者：`w1_safety`（Sol high）；主代理 `/root` 交棒後只讀審阅，`endpoint_audit`（Sol high）只讀審閱 D1 保存契約。
- 本機：Windows、Node `v25.2.0`、Python `3.13.5`。CI 的 Node 版本在 W1 固定並驗證。
- 使用者原有未追蹤附件、`Claude outputs/`、截圖及框架檢討文件保留。提交只選本包檔案。
- Astra 僅 low；更高推理強度須另獲確認。主聊天不宣稱自行切換模型。
- 實體手機候選品牌為 OPPO，確切型號／SoC 尚未提供，尚未連線／量測；桌面手機尺寸驗收不代表實機效能通過。W6 必須補足或取得明確範圍調整。

## 工作包

| ID | 狀態 | 本輪結果與下一步 |
| --- | --- | --- |
| W0 | reproducing | 重新登錄並執行測試；核對 D1 端點保存能力與教材缺口 |
| W1 | done | 九項失敗完成分類／修正；Node 22.14.0 全套 143/143；cold HTTP 通過，舊快取混載轉 W2 修復 |
| W2 | done | 120 模組／15 頁同圖生成與 CI check；主頁／iframe 握手拒絕異批確認；Node 22.14.0 全套 144/144 與 HTTP 通過 |
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
- 使用者原始組立附件可用（僅本機）：14 零件、Mod9 四連桿＋Mod7 夾爪、宿主 4 mm／子板 3 mm、90°／三個角碼；原附件不提交。
- 主代理 HTTP 基準（127.0.0.1:8010）已看到練習範例 main／iframe 都為版本13、單一精靈可開，但教材仍指示已不存在的工程入口；教材缺口歸 W5b。

### W1 回交 checkpoint

- 本包本地提交將只選程式／測試／CI／README／已核准 SDD／此紀錄；不選 REVIEW、附件、Claude outputs 或 output 證據。
- 提交後跑同清單，結果留 `output/framework-stabilization/w1-committed-node22/`，其中 commit 欄位為驗證對象；最後 commit 由交棒訊息附上，避免文件自指 commit hash。
- 回交後唯一寫入者恢復 `/root`；下一步 W1 HTTP 補核、W2 載入一致。長期純幾何來源共用與 D1 欄位是後續包，未以本包測試通過宣稱全案完工。
- 本包模型用量沒有可取得的精確 token；一次施工子任務、零再委派、Sol high；測試與工具結果均 file-backed，未虛報 token。

### W1 HTTP 補核／W2 問題重現

- W1 提交 `49dabcd` 後同清單 143/143，`w1-committed-node22/results.json` 記錄該 commit、trackedChanges=false。
- 主代理在 fresh `localhost:8010` 載入組立練習並開組立台通過；原 `127.0.0.1:8010` 一般 reload 卻混用舊 bench 與新 frame-stock，mates ownPorts 遇到 undefined，清單／預覽空白。這是實際載入回歸，不能以 Node 或 fresh origin 通過抵銷；轉入 W2 修復。

### W2 / L–O–O–P：統一載入圖

- 唯一寫入者 `w1_safety`（Sol high），起點 `49dabcd`；主代理只讀 HTTP 審閱，未新增寫入者。mechanism 凍結、作品 schema／solver／發布版本均未改。
- `tools/load-graph.mjs` 追蹤 blocks／blocks3d 與實際依賴、root 教材／版本入口、test 頂層 module HTML，共 120 模組／15 頁。literal static import、re-export、dynamic import（含 options）、原始帶 query alias、queryless、`three` 均由同圖內容 hash 產生；相關 HTML 的入口 src 直接版本化。生成區塊、入口版本與 token 檔先 normalize 再 hash，重複生成穩定，CRLF／LF 不改 token。
- 移除各頁手工 import map，提交生成區塊及 `js/load-graph.js`／`.json`；根目錄與 test 相對路徑適用 Pages 子目錄。src／type 屬性順序不影響入口重寫；程式建立 module script 的 `moduleEntryUrl` 保留其他 query／fragment，只更新 `v`。新增 source／query alias 使過期 check 失敗，CI 先 check 再 suite。
- module import 非 `v` query／fragment 明確拒絕，避免不同 state instance；computed import 也明確拒絕，不把首字串誤當完整 literal。這是目前純靜態圖的限制，README 明列後續 regeneration → check → suite 維護步驟。
- 主頁與 iframe 的 ready／init／confirm 攜带實際 `LOAD_GRAPH_TOKEN`；握手未完成／缺 token／異批時拒絕確認並提示重新整理。iframe URL 的 load 參數只供追溯，不能保證 server 資產不可變，真正判斷採双方載入模組 token。畫面 badge 仍由原 `APP_VERSION` 顯示13。
- 新 `test/load-graph.mjs` 驗缺生成／缺來源／重複區塊／衝突 map／過期圖／新檔／新 query alias，驗 scanner comments／strings／regex／template／computed，驗 src 屬性排序與 query 保留。VM 評估真實 state 與 geometry：不同 queryless／canonical state specifier 共用同一 S，既有 geometry query alias 共用同一 function。真實主頁 receiver 正例可 commit，無握手／異批負例零 commit且草稿未改作品。
- Node 22.14.0 完整 manifest 144/144：`output/framework-stabilization/w2-verified-node22/results.json`（49dabcd＋本包 tracked changes）；actionlint 1.7.7 無診斷。完整 gate 後只移除舊 map 留下的空白尾空格並更新生成 token，功能 JS 未改；提交後再跑 check 與 load-graph 定向，結果留 `w2-committed-node22/`，不把 dirty 全套結果說成 clean commit 全套。
- 主代理 HTTP：原出錯 origin 一般 reload 後組立清單／接合預覽恢復；精靈下一步至選承接面正常，主頁與 iframe 實際圖 token 相同、badge 都13、無新 console error。fresh standalone wizard cold pass，step1 按鈕可用、無 warn／error。完整操作 token `1543946e0a225d0fb953`；空白整理後 `a1d3221aaa84109625f8` 再 reload 抽核同圖且 next enabled。最後只移除另一行舊 map 留下的尾空格，提交 token 為 `ab04050dbe2bab318832`，功能來源相同。
- 回交 checkpoint：本地 scoped commit，不 push／merge／deploy；下一寫入者由主代理交給 endpoint_audit 施工 W3a。後續 source 或選定 HTML 變更先 regenerate，再 check、suite；正式 Linux CI／部署 SHA 與 OPPO 實機效能仍待 W6，不宣稱全案完成。
