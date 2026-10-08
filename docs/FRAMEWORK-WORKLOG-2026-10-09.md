# 框架穩定化工作紀錄

依據：[已核准 SDD v0.3](SDD-FRAMEWORK-STABILIZATION-2026-10-09.md)。2026-10-09 使用者確認施工。

## 接手資訊

- 分支：`codex/framework-stabilization`；起點：`1537242`（應用 `2026.10.08.13`）。
- 唯一寫入者：`w4a_physical`（Sol high）；W4a-1 `a863232` 正式交棒施工 W4a 第二個 LOOP；前 writer 已停止，主代理 `/root` 只讀審閱與 HTTP 驗收。
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
| W3a | done | F1 六面純讀取／保存／重選／真 bar 層高；同圖 check、Node22 全套 146/146、主代理 HTTP 通過 |
| W4a–W5a／G1 | implementing | W4a-1 共用角碼／板孔／螺絲與 BOM Node147/147；干涉、快取及 W5a 交易流程尚待後續 LOOP |
| W3b–W5b | planned | 其餘格式、多接合位置、教材與效能 |
| W6 | planned | 全面驗收、提交推送與發布核對 |

## LOOP 紀錄

### W2 回交 HTTP 補驗（89a19ded）

- 主代理在原 `127.0.0.1:8010` 一般 reload 後補驗最終提交：主頁／iframe token 均 `ab04050dbe2bab318832`，next enabled，modal 已關；並非只驗先前功能相同的來源。

### LOOP W3a-1／端點與重選（done）

- 唯一寫入者 endpoint_audit，Sol high；起點 `89a19ded`，主代理只讀審閱。依 §3.2 與已核准 optional childPart／既有 to.frame 兩項例外，沒有擴大其他存檔格式、版本或 W4 實體範圍。
- 先在 Node 22.14.0 跑新 target：固定桿 C（40 mm）不啟用角碼、offsetU=5，原接合 x=45，改預選後 refresh 變 x=-15，assert 真實失敗。純 reader 保存每筆 host output／child part／面／selection，mates 全部合法資料保留；explicit childPart 優先於相衝突的 legacy 角碼 childPart。
- schema 保存 optional childPart 與六面 to.frame，格式合法的 dangling 端點不清 mount；reader 回傳缺件原因。refresh 與角碼計畫／狀態共用 reader，失敗保留接合紀錄，舊資料相容讀取不靜默補欄位。
- 新建 API 與精靈確認明確保存端點且不依賴角碼；reselect 可用端點優先於當前預選，缺失／歧義端點列候選回到可見選擇，確認前無替換。to.frame 幾何暫明確 unsupported，留 W3b；取消零 commit。3D 固定桿用實際 stick z，舊歧義 child 保留原顯示 anchor 與診斷，沒有當成已解析端點或開孔來源。
- targeted 通過：新 descriptor／receiver、原六面 mount／refresh／288 種 3D、成對開孔 SVG/DXF 與 0/20/40° 貼合對孔。新增回歸涵蓋 JSON/share、改預選／尺寸、F1 內建四桿＋夾爪、雙子同 host、缺件 normalize→refresh→snapshot、schema 負例、legacy 未遷移與 3D 子場景不消失。
- 驗收：generate／check token `49f161c74bc1bd856f0e`，121 modules／15 pages；完整 manifest suite 只跑一次，Node 22.14.0 `146/146 passed`，無失敗／逾時。證據 `output/framework-stabilization/w3a-verified-node22/results.json` 與逐支 log（ignored）。
- HTTP fixture `output/framework-stabilization/w3a-ui/` 提供未接合固定桿、已接合但預選 frame、legacy ambiguous、missing child 四檔。最初誤存 normalized 結果的 fabrication:null，被正式匯入器正確拒絕；已全部改用 toSnapshot 真存檔並重新驗證，未放寬 schema。原附件不提交。
- 主代理 HTTP token `49f161c74bc1bd856f0e` 通過：實際開 mounted-preset-frame → 組立 → 子模組 → 重新選面與尺寸，摘要 C・下面 → H・上面、右邊／偏置5／間距0；接上後按下載，JSON 仍保留預選 frame/left，但 mount.face.childPart=C、translation={45,0,4}、無 brackets。legacy ambiguous 顯示原因，重選可見 frame/C、明確選 C 後摘要正確，取消保留原歧義；missing child 同樣可開候選、取消保留缺失診斷。沒有新 console error。
- 唯讀 HTTP另發現：相同模組 ID 的檔案重載會沿用前一次操作 notice 到重新點選；列 W5a UI 狀態失效修正，不擴本包。私人下載路徑與原附件不記入／提交。
- 回交：scoped 本地提交，未 push／merge／deploy；endpoint_audit 停止寫入，下一唯一寫入者由主代理正式指定。W3a 尚不宣稱 G1 或全框架完成。

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

### LOOP W4a-1／F1 角碼實體＋板孔＋螺絲/BOM（done）

- 唯一寫入者 w4a_physical，Sol high；起點 `308d3ab`。共用 plain-data 實體核心，F1 消費端與孔 metadata；沿邊配置委派留 W4b，SAT／快取留 W4a 後續 LOOP。
- 新 target `test/face-bracket-physical.mjs` 在 Node22 真實紅燈：3 顆角碼應有 6 支螺絲，實際 0；完整證據 `output/framework-stabilization/w4a-physical/red.log`。
- 純 `bracket-spec.js` 委派現有 fabrication joint.bracket，沿邊 jointSpec 取同一規格；`bracket-physical.js` 依 slot／corner／seamAxis／各翼 runAxis、朝材料外 contactNormal、板厚與 plain local transform 建構兩翼、接觸面、牙孔／板孔配對、螺絲與硬體實例。connection／slot／wing／holePair ID 與 geometryVersion 不持久化；W4b 尚需把沿邊實體建構委派此核心。
- F1 layout 及 reverse 長短翼策略保留；3D／孔／製作包使用同一 physical。板孔 Ø3.2、M3 牙孔 Ø3；螺絲沿板外側穿入，標準長度按每翼實際板厚與角碼厚決定，BOM 數量按實際 slots。製作包按兩端實際螺絲规格敘述，無每處固定兩片的假設。盒體明帶 thicknessAxis，viewer 留旧盒體相容 fallback。
- SVG/DXF 數值／格式相容，link/frame/plate 表示轉換與 frame pose 保留孔配對 ID。精靈 iframe preview／confirm、正式 3D、樹與面板狀態皆傳同加工 joint；HTTP 初驗找到樹漏板厚造成「尚未固定／已確認」矛盾，已補。
- 新純參數 audit 在 `test/fixtures/bracket-physical-audit.mjs`，舊 `_bracket-audit.mjs` 斷言原樣保留。72 組覆蓋2/3角碼、上下板面、反向長短翼、3/4/6 mm＋兩端不同板厚、非預設規格（含 thickness5/width3）、多層獨立 pose 與實際 scene 遞迴；真实 F1 0/20/40° 以板面、盒體區間、孔軸及 BOM 獨立量測。殘差1e-6 mm，加工3位小數0.005 mm；缺孔、錯軸、離板、跨板、翼重疊過量、孔超翼材、錯螺絲與錯BOM均有負例。production plan 貼齊容許收斂具名1e-6，拒絕±0.02 mm間隙／穿入及牙孔超翼材。
- 定向5/5；generate/check `f759f9fbc83768096886`（123 modules／15 pages）。完整 manifest 一次 Node22.14.0 `147/147 passed`，無失敗／逾時；完整 stdout/stderr／exit code／環境與起點SHA保留 `output/framework-stabilization/w4a-physical/full/results.json` 及逐支 log。未更改 APP_VERSION/main，未 push/deploy。
- 正式 toSnapshot UI fixtures：`output/framework-stabilization/w4a-physical/ui-{unmounted,mounted,custom-spec}.blocks.json`，custom 14×10×7／厚1.5。最初 direct concat 兩個独立 realMountExamples 造成 physicalMotor1 重複；僅 output 生成器改用正常 instantiateTemplate 的 usedMotorIds 分配 motor2，保存冻结角0，0/20/40有效；不擴產品 solver。
- 回交：本包 scoped 本地提交後 w4a_physical 停止寫入；主代理接手／指定下一唯一寫入者；W4a 材料SAT／單一姿態干涉與播放快取、W5a 草稿交易／全部流向、W4b 沿邊核心委派仍未完成，不宣稱 W4a 或 G1 完工。模型精確 token 無可取得資料，記實際 Sol high 與一次全suite，不虛報用量。
- 最終 HTTP：主代理確認 token `f759f9fbc83768096886` 主頁／iframe 相同；更正 fixture 顯示 M1/M2 兩組動力就緒，樹與面板均角碼固定／3顆。實際 M1 播放後停在325°（−35°），模型、角碼與真螺絲保持可見。實際下載製作包 default 13×9.5×7／厚1.2 ×3、M3×6 ×6；custom 14×10×7／厚1.5 ×3、M3×6 ×6，各板3支。custom 精靈開啟／取消正常，無新 console 錯誤；截圖 `output/framework-stabilization/w4a-physical/http-mounted.jpg`（不提交）。
- 收尾只補測試側的規格期望：custom／預設尺寸直接由測試輸入獨立列值，audit 不以 production.spec 當規格期望；新 target 再跑1/1及同 token check通過（`independent-spec/`）。生產程式未改，不重跑無變更全suite。

### LOOP W4a-2／F1 材料幾何與姿態（done）

- 唯一寫入者 w4a_physical，Sol high；起點 `a863232`。純局部 PartGeometry catalog、PartPose 與正式3D加工幾何；不改存檔／solver，不實作SAT／viewer mesh快取。
- 新紅燈 `test/material-geometry.mjs`：3D缺實際齒輪輸出孔；另用23°中心線／15,19齒獨立齒距及剛體旋轉驗齒相，證據 `output/framework-stabilization/w4a-material/`。

- 共用 `part-geometry.js` 由既有 fabrication inspectors 建立穩定局部輪廓（全部 islands）、孔用途／pairID／cutouts／板厚／sourceIds／geometryVersion。clone 全輸入，無模組 compileTopology 的既有原地修改亦不污染呼叫者；形狀 catalog key 包含 params（除 theta）、comps/modules/fabrication/export/spec、frame scope 與 home mounts，播放保留相同形狀物件。未增存檔欄位。
- `part-pose.js` 在正式 app.push3DNow 接入 frame、mounted-frame、bar、triangle、gear/fusion、F1 bracket wings 與 screw shaft/head；全部 materialParts 攜带 stable partId/moduleId/pickKey、geometry 與 world4x4。sticks.z為底面、frame.z為背面；巢狀 child.matrix 已完整世界矩陣，只套一次。孔 metadata 保留，bracket 孔由 actual box.hole.center 投影局部 axes，不重算 holeEnd。沿邊角碼仍是具名 legacy bridge，W4b 才委派共同核心。
- 齒相獨立條件 `NA(βA−θA−φA)+NB(βB−θB−φB)≡π` 與剛體旋轉紅測證明舊 beta+angle 式錯誤；共享 transmission phase 改採減角，2D／3D／gear exporter 同源，不改 solver。加工齒形以 seed機械角＋phase 轉一次；輸出／舵盤孔只沿機械角。fusion 不再二次旋轉齒形。3D 消費 export 的8段齒形與所有實際孔，移除 F1 每幀重新加工輪廓／round 的路徑。
- Viewer 僅把共同 material 輪廓擠出與 world pose 表示；保留原 pan-head lathe profile／槽形外觀（共享 solid profile）。多outline／holes／cutouts 使用同一幾何；未支持的 rails/carriages/racks/cams/pulleys/belts/motors/pins/grounds 逐項 geometryDiagnostics，缺 material／pose 明確診斷，不當成材料檢查成功。main frame moduleId=null 為 global固定板，SAT package 依 source owners 增補需要的歸屬；本包沒有實作材料SAT。
- 新 committed 純 fixture `test/fixtures/f1-assembly-fixture.mjs` 依正常 instantiateTemplate usedMotorIds 分配1/2。target 覆蓋 frozen inputs（有／無modules）、key尺寸／厚度／theta／重開／取消、未裝／已裝各設計frame加工來源、0/20/40 F1實際世界板孔、牙孔、gear輸出／horn孔、fusion板孔與真正二層遞迴nested。逆變換殘差1e-6 mm、加工孔0.005 mm，unsupported負例。既有 fusion／gear定向維持。
- generate/check token `7ff40db17bfe09c6a5ac`（125 modules／15 pages）；完整 manifest 一次 Node22.14.0 `148/148 passed`，無失败／逾時。起點a863232＋tracked changes、逐支stdout/stderr/exit code、實際manifest SHA留 `output/framework-stabilization/w4a-material/full/results.json`。收尾只恢復manifest既有順序，內容仍148支，未重跑無變更全suite。
- HTTP fixtures 沿用 `output/framework-stabilization/w4a-physical/ui-{unmounted,mounted,custom-spec}.blocks.json`；ignored手機CSS wrapper `output/framework-stabilization/mobile-check.html` 內嵌390×844真正blocks頁，供主代理HTTP操作。OPPO實機尚未量測，不宣稱效能通過。
- 下一包 W4a-3：使用目前 materialParts actual outlines/holes/cutouts 建材料AABB→triangular prism SAT、合法配對與coverage/UI；W4a-4 才做viewer mesh復用／播放效能量測。W4b 沿邊 bridge、W5a交易與完整UIcoverage仍未完成，不宣稱W4a或G1完工。未push/deploy/version；scoped commit後停止寫入。

- 主代理最終HTTP token `7ff40db17bfe09c6a5ac`：custom mounted正式3D可見齒輪／輸出孔／舵機／角碼，轉相機後M1播放暫停35°仍跟板；tree/panel皆3角碼確認。切夾爪設計頁再3D只顯示自己的frame／雙齒輪，未誤帶根固定板。390×844 wrapper實際走組立→選夾爪→重選面→preview→取消，iframe同token、3角碼標記，無新console error。證據 `output/framework-stabilization/w4a-physical/http-materials-35.jpg`／`http-materials-mobile.jpg`（不提交）。nested手機底部水平scroll列W5a UI檢查，未擴本包。完成scoped commit後唯一writer停止，主代理指定下一LOOP。
