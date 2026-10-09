# 框架穩定化工作紀錄

依據：[已核准 SDD v0.3](SDD-FRAMEWORK-STABILIZATION-2026-10-09.md)。2026-10-09 使用者確認施工。

## 接手資訊

- 分支：`codex/framework-stabilization`；起點：`1537242`（應用 `2026.10.08.13`）。
- 唯一寫入者：`root`；W4b-3 子任務停止後已接回施工，現進行 W6。持續 LOOP，不在工作包邊界等待批准；不再委派。
- 本機：Windows、Node `v25.2.0`、Python `3.13.5`。CI 的 Node 版本在 W1 固定並驗證。
- 使用者原有未追蹤附件、`Claude outputs/`、截圖及框架檢討文件保留。提交只選本包檔案。
- Astra 僅 low；更高推理強度須另獲確認。主聊天不宣稱自行切換模型。
- 實體手機候選品牌為 OPPO，確切型號／SoC 尚未提供，尚未連線／量測；桌面手機尺寸驗收不代表實機效能通過。W6 必須補足或取得明確範圍調整。

## 工作包

| ID | 狀態 | 本輪結果與下一步 |
| --- | --- | --- |
| W0 | baseline recorded | 測試與 D1／D2 基準已記錄；實機資料待 OPPO 使用者提供 |
| W1 | done | 九項失敗完成分類／修正；Node 22.14.0 全套 143/143；cold HTTP 通過，舊快取混載轉 W2 修復 |
| W2 | done | 120 模組／15 頁同圖生成與 CI check；主頁／iframe 握手拒絕異批確認；Node 22.14.0 全套 144/144 與 HTTP 通過 |
| W3a | done | F1 六面純讀取／保存／重選／真 bar 層高；同圖 check、Node22 全套 146/146、主代理 HTTP 通過 |
| W4a–W5a／G1 | done (F1) | W4a共用角碼／材料／單姿態SAT／快取，W5a純候選交易／實際SVG-DXF-製作包trace已貫通；G1內部門檻通過，F1真撞如實保留。其他格式留b階段，完整F3及OPPO實機仍限制W6 |
| W3b | done | planar／orient／face共同唯讀契約，宿主frame／body／output身分分離；Node22 156/156＋F1 HTTP通過，共用實體接入留W4b |
| W4b | done (supported scope) | 金屬角碼同源、F2 齒條材料、F3 串接／雙夾爪、尺寸與馬達方向保存均有回歸；齒條鑽孔不支援仍明示 |
| W5b | done | 舊接法獨立候選、狀態一致、F4 雙孔精靈教材、390×844 操作與實際製作包完成 |
| W6 | in progress | 最新本地 163/163；固定共同效能作品與公開資產量測包完成，Linux CI、OPPO 實機與正式發布尚待 |

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


### LOOP W4a-3／F1 單一有效姿態實際材料干涉（done）

- 唯一writer w4a_physical（Sol high），起點8332960；root只讀review/HTTP。本包純 checker＋正式bench目前姿態／紅色highlight；不做mesh cache、full travel、W4b、候選交易。W4a-2補核：root於舊freeze token切未安裝夾爪設計分頁，自己的frame／雙齒輪顯示亦正常。
- 紅測1e-4 mm材料穿入應fail，尚無checker回not_checked；`output/framework-stabilization/w4a-sat/red.log`。純 checker 以實際 islands／凹形／holes／cutouts 加板厚，使用bundled Three ShapeUtils/Earcut三角化成prisms，世界AABB廣相→全face normals及edge crosses SAT；僅正穿入（1e-7 mm數值分離容許）算碰撞，flush接觸與gap不算。
- 圓孔以inscribed/circumscribed兩组扣除材料，圓螺桿与pan-head輪廓分段使用inner/outer保守邊界；inner仍重疊才fail，只有outer重疊則circular_boundary_uncertain，不給pass。不可三角化／輪廓越界或缺pose逐項not_supported。具名配對shaft要求同holePairId、孔軸、孔徑、螺頭在板外且完整穿過板厚／牙翼；只豁免該具名孔材，不豁免它碰其他板或另一角碼翼。合法bend需同bracket/connection、法向垂直、重疊體積≤width×兩翼厚度乘積且位於翼端；同shaft/head是同顆五金，其餘硬體含自己child板仍檢。
- 補plain mainframe sourceModuleIds，單一owner帶moduleId，防根板誤當不同模組內部件。scene adapter組立scope核預期part IDs，合併child顯示anchor／connection能力diagnostics；被filter掉的child板或歧義端點不得變成『僅五金未查』，設計focus有意略過的非當頁件不報缺席。
- F1原fixture真實穿入照實保留：0／20° GearA_3↔L1 child screw head、GearB_3↔R1 child screw head；40°另有LiftCrank_1↔Mod3-frame。root独立未import checker/Three，以matrix轉置逆投影、winding number、精確circle孔及pan-head線性radius核對：0° witness(196.894803,−14.1,8.25)在GearA與頭內，餘量[1.1,.08823]mm；40°(109.334961,80.290265,6.1)在曲柄與子固定板內，兩材質餘量[.1,.1]mm。已把這些硬編世界witness作獨立回歸，未為綠燈修參數。完整materialParts/reports：`w4a-sat/f1-scene-{0,40}.json`（ignored）。report位置採相交convexprism頂點／edge-plane intersection平均，另記minProjectionOverlapMm，非加工接觸量測。
- bench literal dynamic import checker保持Three懶載入。純pose coordinator在await後再核geometryKey/revision/playing/candidate/solve validity；播放不跑narrow phase，清過期highlight／report，暫停與變更重驗，相機／hover同geometry＋pose沿用report。solveFrame明傳當次sol validity與未解活動點；無效／throw保留舊顯示但not_checked『目前姿態無解；畫面保留上一有效姿態』。原同平面checker/readiness保留，六面fulltravel明示未支援，純preview候選檢查留W5a。
- UI材料結果攜geometryKey/poseRevision、pair IDs/pickKeys、位置、reason、coverage；撞到双方紅標。未建模motor/pins等提供可展開具名清單；清空無穿入但五金缺coverage時中性『板件未發現穿入；部分五金未檢查』，不宣稱全檢通過。
- HTTP抓到正常開檔的加工槽來源差異：frame／Mod3-frame的MG995凸耳槽與r1.6固定孔部分相交，單獨丟給Earcut會有非法重疊void。新純material-voids使用現有unionOutlines建扣除聯集，SAT內外保守邊界與viewer共用；語意hole IDs／用途／配對不動。新增正常normalizeSnapshot＋fabrication mount設定回歸，0/20/40全31材料可準備，原F1真撞維持。完全包含void消去冗餘表示；聯集若形成尚未支援的材料島回not_supported。
- void聯集另用opt-in precision1e-9 mm／sampling1e-9 mm／splitScale1e14，不略過小面積loop；fusion原預設key／sampling／area／splitScale均保留。1e-6 mm²材料島不得被面積簡化消失、1e-6 mm狹縫內正穿入仍fail。viewer無法表示void時保留橙色線框輪廓與具名可見notice／geometryDiagnostic，不靜默漏板；notice和共用材質在dispose釋放。
- 最終source圖generate/check token `453ba8316372f4a741e3`（128 modules／15 pages）；target4/4與完整manifest Node22.14.0 151/151，無fail／timeout。逐支stdout/stderr/exit與manifest SHA、起點8332960＋tracked changes留 `output/framework-stabilization/w4a-sat/{target-precision,full-precision}/results.json`。此前freeze完整亦151/151，後續只因HTTP孔槽及精度／fallback實際修正才重驗。
- 主代理HTTP初freeze8db50：0°兩gear／screw head紅標；播放顯示本姿態材料待檢查且清舊紅標；暫停359°重新兩hit；全行程按鈕明示六面僅單一姿態、全行程未支援。孔槽fix token203563：兩板／角碼可見、原2hits、未檢查項目14僅原motors／pins／grounds，frame及Mod3-frame無unsupported。ignored證據 `w4a-sat/http-{collision-0,playing-pending,void-union}.jpg`。
- 本包只完成F1目前有效姿態材料檢查；真碰撞未修作品尺寸，未宣稱F1可製作或整個W4a／G1完成。W4a-4 viewer mesh復用／桌面與OPPO實機效能、W4b沿邊bridge、W5a純preview候選與確認交易／全流程coverage待後續。root桌面單次checker量測約60–260 ms僅profiling，播放不做narrow phase，未當作phone gate。
- 最終HTTP token453ba8316372f4a741e3：桌面同origin reload→bench→child通過，2處真撞與coverage14不含板件；390×844 wrapper同token、同2碰撞及3角碼固定，面板可讀。ignored證據 `w4a-sat/http-sat-mobile.jpg`。主頁無新增console error；mobile工具logs有兩則無來源MutationObserver observe-not-Node，時間對應frame-locator click的No node found，repo blocks/viewer無MutationObserver，記為wrapper／工具限制，未宣稱完全零log。正式操作正常。scoped commit後writer停止；未push／deploy／改版本，附件及私人路徑不提交。

### LOOP W4a-4／F1 viewer復用與可重跑量測（done）

- 唯一writer w4a_physical（Sol high），起點4baca884；root只讀review／HTTP，無再委派。範圍F1與真正二層F3 provisional，其他機構保留具名重建bridge；不改solver、存檔或W5a交易。條件：普通pose／相機不得建局部材料與硬體、設計／接合／undo／open／cancel須正確失效、retire與dispose一次且不復用已釋放資料、pickKeys／base／red／ghost外觀保持。
- 生產createViewer headless renderer seam使用真bundled Three Geometry，紅測普通20°pose所有Geometry身份更換，`w4a-cache/red.log`。新版整場shape lifetime與局部pose bindings保留材料＋馬達／銷柱／gear輸出銷；真正nested完整world矩陣只套一次。20／40° retained vs fresh對所有mesh的matrixWorld、geometry尺寸／頂點数／總數獨立比較（先updateMatrixWorld true），包含兩顆真motor與pins。退場、重現、材質恢復／ghost優先及相機／dispose回歸。
- App六面child直接消費catalog.extras已算physical，不每幀faceBracketPlan；沿邊仍留W4b bridge。viewer關閉時停止自己的rAF，重新顯示時resume；未增加每幀SAT。
- opt-in `test/performance.html`可視化一鍵入口，隔離`?benchmark=1`工作頁跳過使用者autosave載入／保存；F1原servo範圍−60..60、M2凍0，F3是Base→lift→gripper真二層fixture，正式F3 gate待W4b。每件10s暖機＋60s×3，全部samples/runs保存在專用IndexedDB，invalid中断另存同步emergency紀錄；下載保留所有run及裝置備註／UA／viewport／DPR／source token／coverage與geometry計數，不挑最好一次。
- CPU分solve／2D／pose／3D提交與合計、rAF間隔／>100ms；benchmark單一app rAF呼叫viewer與正常viewer rAF相同renderNow，包含renderer.render發WebGL命令CPU及同timestamp／poseRevision。GPU完成未量、rAF非FPS保證。source切換等真正iframe load＋期望identity/token才ready，abort／page hidden／reload／無效解／缺metrics不得當complete。
- 可重跑baseline工具 `tools/performance-baseline.mjs`在ignored隔離目錄還原153724267f360ac04141c04989b520be09bbc241，僅加同計時／單rAF與存檔隔離；原始與patched source SHA／完整original source、patch summary留measurement-patch.json，未移植新幾何／cache。使用既有localhost HTTP；固定同fixture／device/settings，原版缺加工孔／face五金等差異如實列coverage，不能降完成版細節或宣稱完全同幾何。桌面run與實機OPPO gate待實際量測，尚未宣稱效能達門檻。
- 初次HTTP抓到setMode非同步開3D與set3D(true)的競態：active flag先置true、viewer尚null，量測不能讀stop。共用async resource Promise，所有並行開啟等真正ready、只建一個viewer；已加並發get／resolve回歸，不用sleep。baseline僅為量測啟動加入同pending import等待。source切換／abort若發生於await load期間，停止後不再啟動舊iframe run。
- 修正後source freeze `8ec7949f85e3d443d2e0`，132modules／16pages generate/check；target-ready5/5、full-ready完整manifest153/153 Node22.14.0，無fail／timeout，逐支logs／SHA留 `w4a-cache/{target-ready,full-ready}/results.json`。此前full亦153/153，僅因正式HTTP啟動blocker修正才重驗。root冷啟動HTTP已開始F1 warming/play，六run前景量測期间writer不跑suite或其他CPU重負載；source不變。
- 正式桌面 current token8ec794 六run前景完成：F1 p95合計CPU 4.1／4.3／3.9 ms，rAF 19.2／19.3／19.2 ms（samples3258／3251／3257）；F3 provisional p95 CPU 4.7／4.7／4.9 ms，rAF三次19.4 ms（samples3220／3218／3215）。播放期geometry builds／disposals皆不變：F1 55／0，切二層fixture後111／55。F1 material31／holes55／cutouts2、F3 material32／holes57／cutouts2，均6翼／6螺絲與兩motor。原始全samples在ignored w4a-cache/performance-current.json，精簡current-summary.json；同装置原版正在量測，writer保持source凍結、不跑CPU重負載。這是桌面證據，未視為OPPO手機gate。
- 同裝置原版153724267f360ac04141c04989b520be09bbc241六run亦complete：F1 p95 CPU18.4／18.7／18.6 ms、rAF19.3／36.2／36.3 ms、samples3153／3097／3088；二層provisional CPU19.0／19.1／18.9 ms、rAF36.0／19.7／19.5 ms、samples3110／3115／3120。十二run >100 ms rAF均0；原版播放期builds／disposals持續增加、完成版不變。裝置備註Intel Core i7-14700／RAM約32GB／Windows11 Pro 10.0.26100／Codex IAB，Chrome155 UA、工作iframe1241×504、DPR1、antialias true、pixelRatio1、相同單app-rAF正常renderNow與M1 −60..60／M2凍0；更新率未查、不是OPPO實機。原版補丁hash與source保存在baseline-1537242/measurement-patch.json，未移植新geometry。
- 形狀差異如實保留：原版F1 boards13／boardHoles41／visibleGearBores2／6翼／0螺絲，二層14／43／2／6／0；完成版31／32 materialParts（含五金），總孔55／57、2cutouts、6翼與6螺絲。原版gear僅中心孔、完成版含正式加工孔，計數語意也有差異，故未把百分比稱為完全相同幾何的回歸gate；固定同作品設定桌面CPU數值變小，全部run低於絕對33.3 ms／rAF50 ms門檻。不減細節與播放零重建已驗；OPPO實機與完整F3仍未通過門檻。
- 正式下載合併十二run原始全samples留ignored w4a-cache/performance-combined.json，摘要combined-summary.json；不提交個人下載路徑。量測source token8ec794後僅將#results展示的coverage.geometryCounters.key移除，原始records／JSON／hotpath不變。最後圖46f5571c8cd53c8556ba generate/check、target-summary5/5及perfbrowser syntax通過；完整套件沿用hotpath凍結full-ready153/153，不為摘要顯示重跑全suite或12run。最終正常HTTP抽核已由root完成。

- 最終HTTP token46f5571c8cd53c8556ba：正常tab一般reload保留原F1兩模組／M1 M2／3角碼；bench兩處真碰撞。M1播放清舊red並顯待檢查，暫停25°重新兩hits；重選面iframe同token、3角碼預覽→取消仍25°與原設定，Undo disabled。無新增console error，僅10/08歷史cache訊息；ignored w4a-cache/http-normal.jpg、http-benchmark.jpg。量測頁reload保留十二run且摘要無key；短abort為invalid aborted、warming reload為invalid reload_or_navigation，總14record，沒有誤算complete。
- 回交：本地scoped commit後w4a_physical停止寫入，未push／deploy／改app版本；原untracked附件、Claude outputs、REVIEW及截圖保留。W4a-4限定F1／F3 provisional形狀與硬體cache完成，其他rail/rack/cam/pulley/belt仍明確重建bridge，沿邊幾何W4b、preview交易W5a、完整F3與OPPO實機W6尚未完成；F1實際材料穿入未遮掩。

### LOOP W5a-1／F1 純候選、單圖預覽與一次確認（done）

- 唯一writer w4a_physical（Sol high），起點3fc4a1c；root只讀review／HTTP。限定SDD§3.5／3.7：F1接合候選、完整ValidationReport、同一候選預覽／確認；不接SVG／DXF／buildpack trace、不改solver／存檔格式或全域app交易。W5a-2輸出trace、W5b沿邊withCandidate／putDerived暫換S的舊bridge具名保留；本F1新預覽不經這些交換。
- 紅燈：實際parent receiver收到要求固定但gap1 mm無合法角碼的候選，舊確認會移除invalid brackets而保存。新test/face-candidate.mjs要求零提交，ignored w5a-candidate/red.log。新純face-candidate.js clone完整topo／comps／modules／fabrication，與正式rebuild共用connection-work的normalize→rebake→compile→refresh順序。候選不觸S／undo／storage，invalid角碼不得靜默降成未固定。
- sourceRevision包含尺寸、comps/modules、fabrication/export/joint與接合端點，排除播放theta／相機；poseRevision包含目前active motor完整角度表與決定求解分支的_prevPoints。preview／confirm核source、selection、pose revision，async舊結果不得覆蓋新候選；確認拒絕與畫面不同的姿態／未完成檢查／無效求解／必要材料unsupported。重複確認只提交一次，取消／close／native Esc不產生作品變更、undo或autosave。
- material-scene.js為正式3D與候選共用的純表示入口，正式普通播放仍沿用catalog／viewer cache，不另求解或建加工輪廓。fixed-only選定宿主／安裝桿用相同catalog材料分開呈現；anchor-only模組固定板仍有明確floor／姿態，避免原有效D1／F3接法因漏表示被拒絕。必要板件缺失仍不能確認，未用放寬coverage遮掩。
- 候選material SAT＋既有同平面結果納入ValidationReport；原F1兩處真撞保留。完成檢查的有效位置即使碰撞可存為待調CAD設計，按鈕明示「接上（有干涉）」、預覽紅標雙方名稱與可展開具名coverage，無額外modal，不宣稱固定代表安全。必需材料未驗證與僅motors／pins／grounds未表示的中性提示分開。
- iframe step3使用既有單張SVG場景，以共同局部材料與world pose投影全部輪廓、孔槽、角碼與螺絲頭profile；選面step1／2保留。沒有第二張驗算圖；相機、淡箭頭與角碼點選用相同投影。箭頭由選定home XY surface box轉material局部再轉current world，非局部member AABB猜面。兩島孔洞在同一evenodd cap path扣除，避免孔畫成外部材料島。390 iframe控制列可換行並抑制水平溢出；same-ID作品開啟清舊bench notice。
- bench實際commit structuredClone完整可變work→一筆pushUndo→rebuild({save:false})→把已驗證candidate.points交正式首幀種子→draw→一次autosave。測試走真bench按鈕與receiver、真共用rebuild／solver依賴，核commit後comps/modules/topo與預覽一致、M2 active／M1非零及首幀points一致；正式工作可再編輯，不把frozen候選直接放進S。
- 定向target-fixed6/6與candidate表示回歸通過；新增獨立offsetU／V +1 mm量child世界位移，home宿主45°、動態0／20／40°、真nested90°皆與箭頭一致，殘差1e-6 mm。frozen輸入、required-outline拒絕／文案、fixed HostBar／Child-frame、多島孔洞、來源過期、pose過期、重複confirm、async取消及實際cancel／close／Esc零副作用均驗。
- 首次source freeze c09619a066b684967f1d（136 modules／16 pages）generate／check；Node22.14.0完整manifest154/154，無fail／timeout，逐支stdout／stderr／exit與manifest SHA留ignored output/framework-stabilization/w5a-candidate/full/results.json，target-fixed／target-arrows.log同目錄。HTTP發現invalid fastener時空白預覽與disabled按鈕誤稱碰撞，因實際修正才重驗，未為無變更重跑。
- invalid fastener保留有效placement的材料模型；專用display copy不生成未確認孔／角碼，candidate.work仍保留requested brackets且saveable=false，禁止靜默降級。參數等待檢查時保留上一圖、明示『此圖為上次候選；目前設定待檢查』並清舊red；invalid／pending主鈕停用、僅『接上』，完整材料真撞且可保存時才『接上（有干涉）』。target-invalid-view3/3，最終token868227fc7b1eee379916 generate／check，full-invalid-view154/154 Node22.14.0，無fail／timeout，完整logs同ignored目錄。
- root最終HTTP868227：default0遇L2槽固定失敗仍有無角碼模型／disabled『接上』；+90 gap1待檢保留舊圖、invalid仍可見；auto-fit回gap0有3角碼／2真撞，可保存有干涉設計。正式confirm→一次undo回原狀且Undo disabled，實際下載前後raw完全相同9799bytes。390×844主頁client／scroll390、nested375／375，開啟→+90→confirm→重選gap1尺寸dialog→cancel後正式仍gap0／3角碼／2hits；1280×800 ignored desktop wrapper新開讀手機保存成果亦一致、cancel不改作品。所有頁source token一致，ignored w5a-candidate/http-{invalid-after-fix,mobile,desktop}.jpg。nested CUA有無source MutationObserver工具錯誤，產品無新增console來源錯誤，不宣稱所有工具logs為零。
- root批准scoped本地commit後writer STOP；未push／deploy／改app版本，原附件、Claude outputs、REVIEW與截圖保留。下一W5a-2：SVG／DXF circle輸出trace IDs、buildpack同ValidationReport／單姿態coverage（現warning仍硬寫跨面未驗證）；W5b處理沿邊withCandidate／putDerived bridge。等待明確下一交棒，不宣稱W5a／G1全完工。

### W5a-2 — F1 實際加工檔追蹤與單一姿態製作包

- 起點 `2f799fdf685eafbe8b62ae2b7a23bbebffc4e6ec`；唯一writer `w4a_physical`（Sol high），root只讀review／HTTP。LOOP條件：actual public SVG／DXF解析先紅→最小共同identity／source adapter→獨立座標／軸／spec驗算→graph generate／check→完整manifest一次→root實際下載批准→scoped commit STOP；無schema／solver／app版本／push／deploy變更。
- 紅證據 ignored `output/framework-stabilization/w5a-export/red.log`：原public module-frame SVG circle没有holePairID。共同 `identifiedHoles` 保留已有ID／fallback規則，catalog與SVG data attributes、DXF CIRCLE的999單行 `HOLE_TRACE` JSON共用；frame／link／plate／gear／fusion／hosted bar皆經原serializer，原三位小數與格式保留。外部ID引號／XML符號／換行以安全attrs／JSON保持值；不新增持久化欄位。
- 製作包每一角碼／翼列出板件、板孔、牙孔、holePairID、螺絲ID／規格／長度／geometryVersion；逐件資料另在非可見manufacturingTrace JSON。可見文字僅角度／結果／雙方名稱／具名coverage，長sourceRevision／geometryKey不灌入文字。既有同平面finding與跨面finding分列；螺桿和頭分別具名，真撞不改成安全結論。
- 正式downloadBuildPack的F1路徑停播→clone作品與完整active motor姿態／分支seed→共用faceCandidateModel與validateFaceCandidate重驗→guard source／pose／play／報告geometry revision→才下載。拒絕連按、過期及無效解；不讀旧UI report、不更改作品／undo／autosave。有效但有真撞的CAD仍可出包，報告明示單一有效姿態／全行程未支援；缺report或revision不符為not_checked。
- 實際輸出對照抓到既有差異：candidate把馬達方向Map當加工mount陣列，且app primary inputs漏nested child IDs。最小抽出原motorFrameExportMounts公式（保留carrier/world與pointId註解）供正式／candidate共同使用 fabrication.ttMount／mg995Mount；F1 homeMounts取all inputs，檔案共用catalog home points／mounts，避免非零triangle加工姿態再旋轉。buildPlan同傳scene.mounts，無預設mount回退。沒有另寫輪廓或孔心算法。
- target-ready 5/5 Node22.14.0；`face-export-trace` parse真正public下載Blob和HTML：default／custom角碼、custom MG995／TT槽孔、尺寸變動＋normalizeSnapshot保存重開、0／20／40／M2非零與真nested、fusion；板孔逆world與盒體孔軸獨立比對，未round軸／螺絲残差1e-6、既有加工round容許0.005mm。6翼／6螺絲逐列對BOM、Ø3.2板孔／Ø3牙孔；F1原2／3真撞維持。缺requested孔／invalid geometry整批停止，XML／DXF換行惡意ID、缺／舊report、同平面only fail與async source／pose／play／duplicate負例確實拒絕。相關舊geometry測試對新增partId另驗歸屬，原座標斷言保留。
- Bridge：非F1製作包／其他格式仍原入口；沿邊withCandidate／putDerived全域S交換與共同實體接入具名留W5b／W4b，W6前移除兩套幾何。完整F3 gate與OPPO實機留W6；本包不宣稱全行程、全五金或跨格式完成，G1的F1結論見下。
- 生產source freeze `d8c73563ba5d7827a167`，138modules／16pages generate／check通過；完整manifest一次結果153/155（full/results.json）。兩項只因serialized trace／新狀態文案而失敗：face-mount-3d改驗『固定孔尚未確認』＋『沒有目前有效姿態報告』＋not_checked；servo-crank-holes改解析DXF group8實際圖層4孔，不把trace JSON重複字串算成孔。修後target-compat 2/2，原target-ready 5/5，未更改生產source。root明確同意保留full及補驗證據，不重跑無source變更155支；W6同commit最終整合驗收仍待。
- ignored UI fixtures `w5a-export/ui-{default,custom}.blocks.json` 均經正式toSnapshot／normalizeSnapshot、M1=20°／M2=0；custom含尺寸修改、14×10×7/th1.5角碼與自訂MG995耳孔／槽。golden實際SVG／DXF／HTML亦在同目錄；私有附件／下載路徑不提交。已交root頂層正式blocks頁HTTP actual download，待批准，尚未commit。
- 初次HTTP凍結d8c735抓到app 2D drawMotorMountHoles.rotationForCenter仍用已抽走的motorMountPatternRotDegForCenter名稱，正常開檔拋ReferenceError。已補回app相容wrapper委派共用pure pattern函式，export mounts亦委派同函式，沒有再算一套公式；新增實際app wrapper／consumer binding及carrier／world兩例回歸，原source缺symbol會先紅。target-http-fix 7/7，最終source token `c78095578e2177e77ae3` 138/16 generate／check通過；HTTP重驗已開檔／3D正常、實際下載首件SVG／DXF與完整HTML，root同意此生產修正後再跑full-final。IAB多檔只落首件為工具限制，Node public全檔bytes保留；不在本包新加zip或改下載流程。UI fixture保存20°，正式open既有流程會回0°，非零HTTP由正式play／pause驗，不混稱fixtures載入就是20°。
- full-final完整155/155 Node22.14.0，無fail／timeout，逐支logs／manifest hash留同ignored目錄。root c780 HTTP：default實際製作包3角碼／6翼／6螺絲M3×6、2hits／14具名未查；首SVG／DXF bytes與golden精確相同。custom實際播放停M1 11.464°／M2=0，首SVG／DXF bytes精確等custom golden、pack.physical整段亦相同、報告記11.464°／2hits；重選面iframe同token、3角碼／2hits，取消仍gap0與3角碼。證據 `w5a-export/http-{default,custom}-*`、http-physical-trace.jpg、http-custom-preview.jpg；使用者下載路徑不提交。IAB多檔僅首檔落地，沒有permission提示，故全批bytes由Node真正public download Blob解析驗，無聲稱IAB已逐件落地。
- HTTP收尾只修CNC孔用途顯示 `layer || purpose || HOLE`，不改geometry／孔／report計算；target-text 3/3（actual export、cnc-check、build-pack），final source `f101d282add26a9313b8` 138/16 generate／check通過。依root指示不重跑文字修正後的155支。root最終實際下載http-final-pack.html核LeftJaw_3（HOLE）、無（undefined）且trace保留；批准scoped本地commit後writer STOP，無push／deploy／bump。

### G1 — F1 第一條完整流程集中結論

| SDD §7 條件 | 證據／結論 |
| --- | --- |
| 未接升降臂＋夾爪→90°貼齊／角碼孔／真單姿態結果 | W5a-1 HTTP868227從未接F1操作，default0失敗仍可觀察，+90 auto-fit回gap0／3角碼／2真撞；W4a-1獨立貼板／孔軸／螺絲audit、W4a-3純SAT與root獨立point-in-material witness，coverage逐項具名。真撞保留，不把有效固定寫成安全。 |
| 取消零副作用／確認一次undo／重開／尺寸與非零姿態 | W5a-1實際bench receiver/rebuild/save:false／首解seed回歸；HTTP前後undo的實際JSON bytes完全相同9799，390×844／1280×800操作確認。W5a-2尺寸變更＋normalizeSnapshot重開、0/20/40與M2非零／nested解析；正式custom 11.464°取消仍原接合。 |
| 3D→SVG／DXF／製作包同記錄、孔位／輪廓／五金獨立核對 | W4a-2 inspector局部geometry＋world pose／多outline／孔槽，W4a-1 physical IDs／螺絲；W5a-2 actual public全件Blob解析和逆world孔／軸/spec、6翼逐列pair IDs、default/custom首檔HTTP精確bytes與physical JSON相同。CNC依同snapshot加工特徵。 |
| 手機尺寸／桌面／回歸／F1效能快取 | W5a-1手機390主client/scroll390、nested375/375，桌面1280×800；W4a-4同桌面12runs量測與geometry build/dispose播放不變，F1完成版p95CPU3.9–4.3ms且細節增加，原版差異如實記；本包完整155/155＋文字定向3/3，root最終HTTP通過。 |

G1內部F1門檻已貫通，可接續W3b→W4b→W5b；這不是發布或全格式驗收。OPPO型號／SoC／RAM／OS／瀏覽器／刷新率仍待提供，未連線量測；390尺寸不代替實體手機，W6受SDD§4.5限制。F3目前效能fixture是provisional真二層，完整多接合位置gate待b階段；舊沿邊全域S交換與重複實體bridge須於W4b/W5b移除。最終同commit完整整合／發布驗收留W6，未push／deploy／改版本。

### W3b — 三種來源的共同唯讀接合契約

- 起點 `e4f37aec38f70ab72f642fc44f82f9c7a58e3992`，唯一writer `w4a_physical`（Sol high），root只讀review／HTTP。LOOP：合法planar來源先紅→最小reader／身分consumer修正→frozen與v1往返／多接合隔離→graph generate／check→完整manifest一次→review批准後scoped commit STOP。沒有新增schema、改solver、沿邊實體公式或教材UI。
- 紅證據 `output/framework-stabilization/w3b-read/red.log`：既有reader拒絕合法已存planar base/output。新版分開讀planar定位點、orient子底板／邊與face端點；兩端模組／零件／輸出或frame／face／edge及cloned source保存，ref／home／flip／方向／fastener不由目前預選推導。缺失或歧義保持原參照及姿態，不猜另一桿。planar base只有原fixed／motor定位點身分，partId保持null。
- 宿主frame／body／output身分明確分離；點池與module-schema一致使用pointKeysFor＋命名holes，output.at必屬指定body；points body保留兩個方向點，不能冒充接合板。既有orthogonalHostBody／Edge使用共同唯讀身分guard，不能借用別模組同ID的桿；所有原沿邊數學保持。part-pose按geometry capability傳遞缺能力診斷，已解析frame身分不等於已支持實體。
- placement／endpoints與共用refresh／drilling／geometry分開：合法planar／orient保留既有定位流程，共同實體與重算具名W4b bridge；face host-frame可讀v1身分但共用重算／孔仍待W4b。package只作metadata，不在使用者提示露施工代號。F1既有output-host六面能力與純候選／實際輸出保持。
- target-final Node22.14.0 7/7：三來源完整frozen輸入零mutation與v1 JSON往返；合法命名加工孔／points輸出及錯body at、missing／duplicate／kind／edge／floating-base負例；Base←四桿lift←齒輪夾爪讀planar＋orient；同工具架兩筆端點在mates.receive排序／attach normal／faceParts預選／模組排序與尺寸修改後不重綁。實際unmount一筆後另一descriptor及既有orthogonalExportExtras仍用孔完全相同，mates多筆往返保留。F3本包只驗讀取及既有孔隔離，完整新共用geometry gate留W4b，未宣稱已完成。
- source freeze `8c73f04ee6812d2a21e9`，138 modules／16 pages generate與check通過；完整manifest一次Node22.14.0 156/156，無fail／timeout。全部證據與逐支logs留ignored `w3b-read`，使用者附件／REVIEW／Claude outputs／截圖不提交。W4b接共同沿邊實體／hostframe與多接合consumer；W5b接舊withCandidate／putDerived交易bridge及教材，OPPO／完整發布gate仍留W6。
- root唯讀review與HTTP同token一般reload通過：custom F1仍3角碼／2真撞，重選面iframe同token及可用『接上（有干涉）』，取消保持gap0。無新版console error（只有先前d8c已修舊紀錄）；ignored `w3b-read/http-f1-regression.jpg`。root在full156/156後批准scoped本地commit，writer提交後STOP；沒有push／deploy／bump，後續待正式交棒。

### W4b-1 — 沿邊金屬角碼委派共同實體

- 起點 `40bd0d52fb806555bf4e732dc8ad741337b1e5b2`；唯一writer `w4a_physical`（Sol high），root只讀review／HTTP。LOOP：缺physical／混合板厚螺絲紅測→最小沿邊配置adapter→獨立stock-plane／孔軸／BOM及真輸出量測→定向→generate／check→HTTP→完整manifest一次→批准後scoped commit STOP。printed沿用専屬幾何；host-frame新六面／F3新UI／沿邊preview交易與教材不在本包，不改schema／solver演算法／版本。
- 紅證據 ignored `w4b-orient/red.log`：沿邊adapterLayout沒有physical。新版配置保留沿邊／站立、方向／面與槽位策略，實際角碼／牙孔／板孔／螺頭／螺桿交同一buildBracketInstance；移除bracketLegs及沿邊複製SCREW_LENGTHS。低階adapterChildHoles仍為moduleFrameEdges的純配置入口，直接委派核心、不呼叫完整frame／layout，沒有以空孔打斷有效遞迴。
- adapterLayout／extras攜帶兩筆physical與穩定connection／slot／wing／holePair IDs；加工孔投影／metadata、PartGeometry、BOM與HTML逐件trace共同消費。正式3D取catalog.extras已算physical，僅home→current host plane→nested完整矩陣與宿主底面z各轉換一次；盒體明帶thicknessAxis與接觸法線，兩翼短長不以最小尺寸猜。各翼按自己的真板厚選M3長度，6/3 mm板為8/6，不以最大板厚全套8；printed螺帽／傾斜規則保留。
- 獨立量測從正式scene的stock material pose／板厚與實際加工孔建期望平面，不用production.ok當期望；沿邊／站立、上下／反面、3/4/6 mm、default/custom 14×10×7/th1.5、0/20/40共72例。真二層遞迴0/20/40及frameStock6／全域3在父／孫兩接合均驗surface flush、翼bend重疊上限／不穿另一板、孔軸、螺頭板外與逐翼BOM。transform tolerance1e-6、三位加工孔0.005；缺孔／錯軸／.02離板／錯spec／錯BOM負例確實失敗。新增純參數auditPhysical，舊audit呼叫／a–e斷言保持並可傳params／points／joint；舊盒體假定尺寸軸改用實際軸投影，混板厚『所有螺絲同長』改逐翼材料要求，未放寬貼板／轉角／對孔。
- frame宿主厚度原一律fallback stockMm，現沿既有frameStock來源傳給edge／hostPlateThickness；子底板也取真frameStock。此為沿邊既有frame接法的板厚修正，未新增六面host-frame幾何。合法直角metal descriptor宣告drilling／geometry可計算但refresh仍false；printed／tilt／缺端點保留能力診斷，可計算不代表已驗通過。
- public SVG／DXF真正download Blob全部bytes解析與HTML manufacturingTrace：custom、nested、different frameStock，在0/20/40逐pair ID／位置／Ø及實際stock／盒孔逆向量測一致。既有face guard保留，新增已支持形狀的orient-only guarded輸出；invalid requested牙孔規格／金屬tilt明確拒絕files與pack。extras診斷傳至共同catalog／scene；printed材料representation具名not_supported，不默默當材料已查。F1真2/3撞、無解與stale/play語意定向保持。
- target Node22.14.0 13/13、fixture收尾1/1；原bracket-holes46/46、mate-connect123/123，含material與F1actual export回歸。證據及正常toSnapshot UI fixtures在ignored `output/framework-stabilization/w4b-orient/`：ui-default（3mm/default規格）、ui-custom（站立下面、host6／child frame4／global3、自訂規格）、ui-invalid-metal-tilt。source freeze／HTTP與full結果待回交；不提交私人路徑／原附件，W4b-2接續host-frame新六面／完整多接合幾何，W5b仍處理沿邊withCandidate／putDerived與教材。
- 初次HTTP `3bbc4090d8b0f24e7991`抓到測試fixture誤標：測試直接改原bar.stock=6，st共享引用且18mm寬不足以站立（至少19），benchAdjust站立／換面回false而測試漏assert，變體仍為沿邊。已撤掉原bar mutation、明確assert每筆ok／edge child／face±1；6mm/custom站立採合法24mm寬專用fixture，不改原F1產品參數或真撞。修後 `target-standing` 13/13，真正站立72矩陣及nested／different frameStock／actual file parse均通過；physical trace的宿主板孔local亦交核心plateToLocal，與serialized局部孔0.005mm一致。
- 初次正常沿邊HTTP仍有有效證據：custom實停−17.008°（UI343°），實際pack single_pose fail、2角碼、host6／child4、兩M3×8＋兩M3×6；SVG／DXF首件LiftCrank_1各6circle／6trace，ignored http-custom-pack.html與http-custom-LiftCrank_1.*。IAB多檔仍只落首件，全public Blob由Node parse，無宣稱瀏覽器全件落檔。側欄仍用舊沿邊檢查而顯『目前姿勢沒有干涉』，與pack新材料報告不同；此既有consumer接入缺口具名留W5b，不宣稱所有沿邊UI干涉已一致。
- 最終source freeze `cac6c7c3345d5c3266b7`，138 modules／16 pages generate／check通過；root HTTP正常開新custom確為『立在下面』，實際播放停theta57.644°，下載pack的trace2角碼、板厚6／4、螺絲8／6／8／6與single_pose fail保留真撞，ignored http-standing-pack.html／http-standing.jpg。invalid-metal-tilt可正常開，製作包及SVG明確阻擋並提示金屬角碼只支援直角，http-invalid.jpg；無新版產品console error（只有歷史d8c）。完整manifest唯一一次Node22.14.0 157/157，無fail／timeout，results與逐支logs在w4b-orient/full；來源保持cac6，未重跑無變更suite。root已批准scoped本地commit，writer提交後STOP，保留全部原untracked附件／REVIEW／Claude outputs／截圖；未push／deploy／bump，不宣稱整個W4b或F3 gate完成。


### W4b-2 — 六面宿主底板與 F3 多接合

- 起點 `33ceaeec29e91bd1a96e3a32cd10877fb62bc0c0`，唯一writer `w4a_physical`（Sol high），root只讀review／HTTP。LOOP：合法saved frame能力先紅→真直邊ref／表面／求解／候選／刷新／physical／正式3D與輸出入口→獨立板面／孔軸／逐翼BOM＋公開serialized trace→graph generate／check→HTTP→完整manifest一次→批准scoped本地commit後STOP。沒有新持久欄位、solver演算法、工程模式、版本或發布。
- 紅證據 `output/framework-stabilization/w4b-frame/red.log`：合法 `to.frame.edge=6` 可讀但geometry／drilling／refresh均false。現在根底板（測例沒有任何output）和已face／orient／planar安裝的底板用原有效直邊6／13／20／27作真rigid-pose reference；弧段／失效邊不改編號、不借另一零件。位置保存在既有v1 face transform與childPart，host-frame求解／3D只組合一次parent世界矩陣。
- UI仍只有一個底板入口，六面在圖上選；edge是內部位姿基準，不是新增工程選項。新接合用第一條有效穩定直邊，重選保留saved edge；實體邊缺失要求重新選取。原設計預選仍作新接合預設，但不覆蓋已存端點。取消與確認沿用W5a純候選交易。
- 共用surface查找沿to.frame或output精確解析；face mount clone完整comps／modules／params求參考解，refresh保持原端點，shared bracket physical／catalog／PartPose／SVG-DXF／pack仍同來源。根板canonical partName是 `frame`，已裝板仍 `Module-frame`，不引用不存在的根模組frame檔；public輸出先讀requested descriptor，防正規化丟失invalid mount後誤輸出成功。
- `test/face-host-frame.mjs` 的5真配置：Base←arm←claw、已face／orient／planar板再接夾爪、同ToolBrace兩爪，各於20／40有效姿態（M2=10／第三軸15）。fixture connect／adjust逐次assert.ok與實際mount；世界板面／孔軸／頭外側／逐翼螺絲BOM用獨立audit，frame鏈另手算一個parent plate pose＋saved R/T，抓共同錯乘矩陣。root frameStock6／child4／加工全域4；frozen無mutation、4個stable edge、refresh兩次冪等、設計預選／排序不改端點、改根板尺寸、改共用承接桿厚度、拆一爪保留另一接合／孔、v1重開均有回歸。厚度改變令一爪孔碰既有孔時明示失敗／停止該鑽孔，保留另一爪；不為驗收放寬。
- nested root-frame及mounted-frame真public SVG／DXF全Blob逐孔ID／pair與world孔逆投影（0.005mm加工容許）解析；pack JSON與逐件parts必須對應實際plan檔，來源／姿態report正確。同F1的既有兩處真撞保留，沒有以有效固定宣稱無干涉。
- **保存尺寸另包缺口**：原normal builtin fourbar-lift→planar→frame合法接合，schema `normalizeBar` 的8mm吸附會將140→144、diag107.629→104，rebake的宿主板home旋轉約3.82°，home XY AABB所選側面不再是材料直邊。最小負例仍保留：`builtin-planar-snap-negative.json` 記before／after params與fastener_invalid，重開後固定孔／pack拒絕，不能假通過。專用planar正例先正規化48／64／80幾何，再assert保存前後params完整一致；此正例不代表原builtin roundtrip已修。尺寸吸附／朝向處置須全案完成前獨立包解決，不在此包改schema策略。
- Bridge：F2齒條精確材料／教材／沿邊preview交易及正式沿邊側欄舊plane狀態與真材料結果整合仍留W5b；W4b-1已記HTTP側欄與pack結果不一致。全行程、完整五金與OPPO實機不在此包宣稱完成。ignored正常UI fixtures `ui-root-{unmounted,mounted}.blocks.json`、`ui-installed-{unmounted,mounted}.blocks.json`、`ui-two-claws.blocks.json` 供root正常開檔／選面／拆接，不依console或私人附件。

- Source freeze `735895a216ff6107f489`，138modules／16pages generate／check通過。target-suite 7/7；擴大target-ready 12/13，唯一失敗為舊reselect測試硬把host index0當H（新frame預選入口現在可見），已改為依H身分找修復選項並驗底板一個入口；source不變，target-reselect 3/3、最終frame獨立target通過。HTTP交root後full待一次執行，尚未commit。

- root正式HTTP `735895` scoped acceptance通過：正常installed-unmounted→Mod4接Mod3底板edge6、front／childbottom／+90／auto-fit gap0／3角碼，21處真撞誠實可存；一次undo回未裝，Mod3 record完全不變、尺寸params一致（confirm新增theta0，undo移除，不是尺寸修改）。`http-installed-frame-{connected,undone}.blocks.json`與截圖留ignored。raw fixture與連接後檔的140→144／diag107.629→104及ref3.82255°差異，READ-ONLY已證等於open normalize＋正式prepareConnectionWork結果，不是本次confirm改另一接合（`http-open-diff.log`）。
- root Base←arm←claw重選：Base top／child back／+90／3角碼，取消正常；實際下載 `http-root-frame-pack.html` 兩接合各3實例，真single_pose fail／3碰撞，canonical parts／wing partIds是frame→Mod1-frame與ToolBrace_1→Mod3-frame，沒有Base-frame幽靈檔。`http-root-frame-reselect.jpg`。two-claws normalopen→拆Mod4→undo，HTTP三筆JSON逐項deepStrictEqual前／undo完全相同，拆下後Mod3 record完整保留（`http-verification.log`亦獨立重核）。本包不把IAB首件多檔下載限制說成全件落地；全件serialized SVG／DXF仍由Node真正public Blob解析。
- HTTP通過後root已批准完整manifest通過即scoped本地commit；source持續凍結，完整158支正在唯一一次Node22執行，沒有重跑已過的全套。

- root製作包頁實際打開補核：frame.dxf厚6、Mod1-frame4、Mod3-frame4，6角碼、9支M3×6＋3支M3×8，逐翼連到真實檔名；`http-two-claws-restored.jpg`。735895無新增產品console error，僅已修d8c735歷史紀錄。
- 最終完整manifest唯一一次 **158/158通過，Node22.14.0**，無fail／timeout，逐支logs／manifest hash留 `output/framework-stabilization/w4b-frame/full/`；最終graph check同 `735895a216ff6107f489`／138modules／16pages通過。已獲root批准scoped本地提交，writer提交後STOP；不push／deploy／改版本，保留全部使用者原untracked。下一包須正式派發保存尺寸精度／原builtin planar→frame roundtrip修正，不把這個負例列成已解；F2材料、教材交易、W5b側欄／沿邊preview bridge與OPPO實機仍後續。

### W4b-3／3b — 保存尺寸精度與缺省馬達方向

- 起點 `f75e6e411cc576c701e2fd08e23f470b4c620ed1`，唯一writer `w4a_physical`（Sol high）。LOOP：原builtin planar→frame紅例→schema長度最小修正→獨立尺寸／pose／孔槽／實際serialized輸出→必要定向→graph generate／check→正常UI重開HTTP→唯一一次full→root批准scoped提交。保留v1、原builtin參數與求解算法，沒有版本或部署。
- `w4b-dimensions/red.log` 首先證實公開normalizeSnapshot把有效140改144；同函式將三點桿diag107.6289923765897取整／0.1化，爪邊121.8變122。現在bar／triangle的正有限明確長度原精度保留（包括小於8的合法既有資料）；缺失／非法值以有效端點距離修復，重合／無法量測才用8mm並給尺寸警告。沒有放寬其他shape或改schema原有stock／角色／ID安全限制。
- 建立吸附仍留tools真互動：兩個自由點29mm經finishPolygonDraw建立32mm桿，一次undo；member-editor既有一位小數提交及8–2000mm限制不改。schema原29→32測試改為還原29，吸附另以真tools入口驗證。舊W4b-2原builtin negative已轉正回歸，歷史吸附證據不改寫為當時已通過。
- 擴充回歸曾揭露另一個真UI存檔差異：createModuleEditor.insertBuiltin('fourbar-lift')→正式prepareConnectionWork沒有motorMount；normalize卻新增horizontal，使MG995槽由x−31.2轉為+31.2。root因此批准有限W4b-3b修復，`red-motor.log`先紅。現在缺motorMount保持缺省；已有center／reversed但缺orientation也不補新方向，由原buildMotorMounts共用fallback解析，不在schema複製方向算法、不新增auto枚舉／持久欄位。明確horizontal／vertical／follow-frame／reversed、motorCarrier與共點M2 source均回歸。
- `test/snapshot-dimensions.mjs` 真raw F1、原builtin planar-hostframe、F3 root-frame在0／20／40（M2=10、第三軸15）驗證：frozen不mutation、normalize冪等、實際storage Blob／local／分享與app undo函式的還原路徑、獨立各剛體邊長對原參數、raw與reopen求解點／local材料／世界pose／全部孔槽一致1e-6mm。真正public SVG／DXF全Blob逐bytes相同，paired板孔另從世界角碼孔逆投影到serialized圈0.005mm，沒有用明確mount替換原source掩蓋馬達差異。3b修後legacy-motor-orientation.json保留真入口before／after，孔槽相同。
- 範圍仍限bar／triangle長度及這個缺省方向保存相容性；slider／rack／gear等其他尺寸量化沒有順便改。F1原材料真撞誠實保留；F2材料、W5b教材／沿邊preview全域S交易與舊側欄plane狀態bridge、fulltravel與OPPO實機仍後續。正常UI raw／reopened三組fixtures及精確LJ／RJ參數清單在ignored `w4b-dimensions/`，不提交私人路徑／附件。
- 定向14/14通過（Node22.14.0，target-final逐支log）。首輪target13/14僅新增測試把缺省共點來源也假定Second，但原planner同樣選First；已分成明確center共點與合法缺省單來源，獨立原／normalize planner比對，無產品算法改動。最終source freeze與HTTP／full結果待收尾，未commit。
- 最終source `536f71a07f4306263285`，138modules／16pages generate/check通過。子任務於source freeze後遇使用量限制停止；root確認其已errored，接回唯一writer進行HTTP／full／收尾，未改用其他帳號或提高模型設定。
- root正式HTTP：正常開ui-builtin-planar-frame-raw→另存→正常開實際下載檔→再次另存，兩次作品JSON deepStrictEqual；所有bar／triangle尺寸等於原source，arm140、diag107.6289923765897、jaw121.8，implicit motorMount仍未被補成horizontal。實際製作包成功產生；重選保留Mod3底板back／childbottom／90°／offset10／gap0與2角碼，15處真撞誠實顯示，取消後不變。證據http-{saved,reopened}.blocks.json、http-reopened-pack.html、http-reopened-preview.jpg；無本版產品console error，舊d8c紀錄未誤當新錯誤。
- root唯一一次full：158/159，唯一失敗example-controller仍假定原30mm範例會被吸附32；已將該斷言改為原30mm保存。無產品source改動，target-compat 2/2（example-controller、snapshot-dimensions）與graph check通過，不為測試預期更正重跑全部。完整證據在w4b-dimensions/full與target-compat；W6仍須發布同commit全套。
- root批准本包scoped本地提交。未push／deploy／改app版本，未包含私人附件或其他原untracked。下一步W4b-F2齒條能力與W5b單一精靈／沿邊候選交易／干涉狀態／教材；OPPO實機仍待，整案不宣稱完成。手機效能需固定共同比較snapshot，避免本包新舊normalize差異令基準作品尺寸不同，已記ignored w5b-baseline/w6-notes.txt。

### W4b-F2 — 齒條共用材料（施工中）
- root 唯一 writer，依原 SDD LOOP 續作。齒條使用加工來源的輪廓、孔槽、板厚，跟隨實際求解姿態；3D 不再重複繪製舊齒條實體。六面定位可用，齒條角碼開孔仍明示未支援並阻擋不適用輸出。
- 新增 rack-face-candidate 驗證，納入 manifest；viewer-reuse 加入齒條播放時保留幾何、與全新場景矩陣／尺寸／數量相同的檢查。Node22 定向 6/6 通過，證據 w4b-rack/target。
- Load graph 43881e1a55e18f2efdc2（138 modules／16 pages）。HTTP 正常開啟 mounted fixture，側欄正確呈現「已定位，尚未固定」及齒條角碼未支援原因，無 console error。尚待未接作品完整操作、畫面與下載驗收；未 commit／push，不能視為 F2 完工。
- 本輪完整 160/160 通過（Node22.14.0），graph check 同 43881e1a55e18f2efdc2。HTTP 從未接 fixture 依序選滑台／底板、上面／下面、置中 gap0→接上→播放／暫停→實際製作包下載成功；畫面及實際下載保存在 w4b-rack/http-mounted.jpg、http-pack.html。播放即清除舊材料結果。尚未支援齒條角碼鑽孔，沒有假稱固定。
- 瀏覽器另發現未支援角碼時仍出現配置按鈕與成功後引導文字，列入下一 W5b 狀態一致性包；本包材料能力完成，F2 最終適用流程仍須 W5b。下一步沿邊與六面共用干涉提示、未支援種類及固定能力提示，不改 solver 或存檔格式。

### W5b-1 — 接合能力與即時檢查一致性（done）
- 起點 fa352b0，root 唯一 writer。先以 production bench 加入真沿邊金屬角碼負例，確認舊 gate 不啟動材料檢查；另證 rails 未建模被誤稱為五金。修正 gate 同時接受 face／orient，既有 pose revision 與 source key 繼續防止播放／同 ID 修改重用舊結果；未支援材料不混稱五金。
- 齒條已知不支援鑽孔時 status.configurable=false，隱藏無法完成的配置角碼按鈕；確認後訊息改引導讀固定能力說明，不假稱可鑽孔。其他可調整位置的角碼入口保留。
- 定向 6/6 通過（bench-material-interference、live-interference-status、material-pose-status、rack-face-candidate、face-bracket-holes、bench-interference），330771d9c8d38b5901c5 graph generate/check 通過。HTTP 正常重開齒條配置入口已移除；正常開沿邊 custom 作品側欄顯示 10 處真材料碰撞，取代舊 plane-only 綠燈，無 console error；http-orient.jpg 留 w5b-status。
- 原包全套已 160/160，本包只有相關狀態／提示變更做定向，最終 W6 仍需同 commit 全套。下一輪接舊候選預覽不交換 S、單一精靈教材；未發布。

### W5b-2 — 舊接法獨立候選與同平面檢查（done）
- 起點 4790598，root 唯一 writer。刪除 app withCandidate／putDerived 全域交換；mate-candidate 只持有複製作品、獨立 scene、source／pose revision 及非同步材料結果。正式 2D、求解快取與存檔不讀候選。取消丟棄候選；過期／未完成檢查不能確認，take 只成功一次，確認仍走原一筆 undo。
- 新增 mate-candidate 真材料測試：frozen source、face 與沿邊候選、pending／cancel／late result／pose／same-ID 參數變更。定向 6/6 與初次完整 161/161 通過。HTTP 找到舊 syncUI 因為假定 S 已交換而提前返回，已刪除該判斷。
- HTTP 從未接齒條作品直接點滑台標記，正常呈現預覽／接上／取消。實際 blocks29（預覽中保存）＝30（取消後）＝32（確認一次undo），31才包含正式接合；undo 後按鈕 disabled，沒有多筆復原。下載檔保留本機、不加入 repo。
- 整合另發現 planar 預覽含材料、正式只有平面檢查。擴大材料 gate 至所有 mount，支援的 planar 製作包也走共用 export，預覽加計平面 findings。首次 planar 測試用了不存在的 port:'tool'，修為實際 bolt:output ID，非產品變更。後續定向 5/5 通過。HTTP 同姿態預覽／接上皆 5 處碰撞；http-confirmed.jpg，無 console error。
- 最終 graph ffe06fc3ba11e657cc7d（139 modules／16 pages）；完整 161/161 是 planar gate 補修前，補修後採相關定向，發布前仍須完整驗收。瀏覽器一度連續逾時，重設控制連線再正常 reload 後恢復，未把逾時算通過。下一項 F4 單一精靈教材與有效雙孔；未 push／發布。

### W5b-3 — F4 雙孔精靈與教材（done）
- 起點 3f1eeaa，root 唯一 writer。教材工具架 Link3 使用既有 bar.holes／distParam、output.bolts：ToolBolt1／2 位於24／48mm，不占旋轉端點。共同 extras 生成宿主真孔，底板沿用 moduleFrameExports 同 ID／直徑；MOUNT_BOLT 圖層保留。重疊或出界孔阻擋輸出，不新增存檔欄位。
- 單一精靈提供可點的大「雙孔對鎖」選項，保留六面接合入口；教材與範例提示取消工程模式依賴，歷史說明加現行規格，區分定位、固定與材料檢查。缺 fabrication 的舊教材作品使用既有預設，避免候選 catalog null 例外。
- 新 assembly-lesson-wizard 驗證真兩孔、兩板 Ø3.2、0／20／40世界孔軸一致1e-6、v1往返、碰孔／出界拒絕。定向6/6。完整161/162，唯一 orient-bracket-physical 發現上包擴充 planar export 遺漏 face+printed 必須仍走受檢出口；已恢復 face 優先 guard，定向最終5/5。graph 5b9fe6370057e26d5649，139modules／16pages。
- HTTP 從下拉教材練習→組立→雙孔對鎖→預覽→接上→M1播放；390×844拆下／預覽／取消／再接上全部可操作，clientWidth=scrollWidth=390。http-desktop.jpg、http-phone.jpg、實際下載 http-pack.html 留 w5b-lesson。播放標記待檢查，未假稱五金全驗證。
- 手機驗收另修拆下後未檢查清單殘留：coverage可見性不再只跟 rows hash 更新；afterScene 即使沒有mount也清掉過期材料狀態。最終發布完整回歸留 W6。下一步同條件效能 fixtures、OPPO量測入口及發布收尾；未push／部署。

### W6-1 — 同條件效能入口與整合回歸
- root 持續唯一 writer。新舊 schema 的尺寸正規化不同，量測改使用基準版先正規化的固定 F1／F3 JSON；產生器驗證兩版 comps／modules／params 完全一致，每筆樣本帶 fixture SHA256。正式產品尺寸保存修正沒有回退。
- 新 performance-fixtures 納入 manifest；Node22 定向 3/3、最新完整 **163/163** 通過，證據 `w6-phone/full/results.json`。此輪 commit 尚含工作中差異，最後發布仍以同 commit CI 為準。graph **61ff8d9759071311a34a**（138 modules／16 pages）check 通過。
- LAN HTTP 的 UUID 改以 getRandomValues 相容，不依賴 secure-context randomUUID。量測使用隔離工作頁，全部完成與 invalid 紀錄保留，不載入使用者 autosave。
- performance-phone 只複製公開程式、樣式、量測 fixtures 與基準程式到專用目錄，未暴露 workspace／原始 archive。HTTP 實查 bundle 與 fixture 200；docs、.git/config、私人附件路徑均 404；未變更防火牆。
- 已請使用者用同網路 OPPO 開量測頁並提供型號；桌面量測正在驗證入口，不能當作 OPPO 通過。正式版本仍 2026.10.08.13，未發布。
- 最終能力盤點：planar 定位仍使用既有 base/output 解算器，材料／雙孔已共用；descriptor 的 legacy bridge 表示未提供共用接件實體驗證，不等同整個 planar 教材失效。非金屬轉接件、同平面固定螺絲、馬達／銷與全行程材料驗證不宣稱已建模；齒條角碼開孔仍不可用。金屬沿邊與六面角碼已共用實體，沒有第二份角碼核心。
