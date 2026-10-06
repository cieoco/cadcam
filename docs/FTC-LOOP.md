# FTC 開發 LOOP 與模型分工

規格來源：[SDD-FTC-MODULES.md](SDD-FTC-MODULES.md)。本文件是開發／驗收記錄，不新增產品 UI，也不是背景排程。

## W 六面體組立精靈（2026-10-07，W0–W2 完成概念原型）

- 授權：使用者要求以 LOOP 與省 token 的適合模型規畫並進行工作。規格／後續 W3–W5：[SDD-ASSEMBLY-WIZARD.md](SDD-ASSEMBLY-WIZARD.md)。
- 分工：主模型定 API、產品流程及驗收；一名 `gpt-6-luna` 高推理只新增純幾何與測試兩檔，短交接、不複製歷史；主模型独立審查及製作可操作原型。既有 app／assembly／orthogonal-joint／bracket-holes 修改未覆蓋。
- LOOP W1：144 面配對朝向、1,296 九宮格對齊四角投影、不在原點的外框、非法輸入／溢位／輸入不變；主審發現偽面名稱及溢位風險並交回修正。最終 `node test/face-mate.mjs` 155/155，語法檢查通過。
- LOOP W2：新增獨立 `assembly-wizard-prototype.html`，六面大卡、九宮格、面內偏置、間距、90°、精靈／工作切換、確認與取消。原型使用代理盒與 SVG 等角投影，不讀寫正式作品。
- 真實頁面：手機 390×844，卡片 110×62 px、無橫向溢出；前／後面、靠右、+5 mm、90°、返回、確認→修改→取消保留原值。桌面 1280×800，12 面逐一選取、右上、切模式保留草稿；12.5 mm 精確輸入與 8 mm 間距可確認、-1 mm 間距攔下。修正實際驗收發現的數值輸入未即時更新與接合面標籤重疊；重新驗收通過，browser error logs 空。
- 證據：`output/assembly-wizard/mobile.jpg`、`output/assembly-wizard/desktop.jpg`；未提交／推送。沒有 token 使用量統計或費用節省百分比。
- 下一包 W3：把真實工具架／模組底座外框與實體接口對應，列出可精確安裝與只可預覽接法，再接正式 UI。尚未完成持久化、運動／3D／加工整合；不得把外框貼合當成實體接合完成。
- W2 操作修訂：依使用者要求，承接端可見大面可直接點選，選中面亮藍色並同步六面卡與摘要；精靈選承接面步驟及工作模式啟用，背面仍可由面卡選取。瀏覽器實際點前面，確認上面取消選中、前面卡選中與 fill `#349ee8`；截圖 `output/assembly-wizard/host-face-selected.jpg`，JS 語法檢查通過。
- W2 簡潔與旋轉：精靈隱藏重複說明，承接六面卡收進「其他面」。新增拖曳旋轉觀看、左右 90°、上下翻轉、重設視角，僅變相機、不變接合姿態；面可見性與深度排序隨視角計算，拖曳不誤選面。瀏覽器驗證右轉出現後面可選、翻轉出現下面可選、重設與實際拖曳保留所選下面；語法通過。截圖 `output/assembly-wizard/rotate-view.jpg`。
- W3a（使用者要求繼續）：一名 gpt-6-luna 高推理新增真實接合面描述器與測試，主模型整合到隔離原型。來源為既有 frame／link／plate／rack exporters，限定機構自己的固定底板／工具架／滑台；外框、圓孔、內槽分開保存。主審抓到齒條槽遺漏、內槽混入外框與預設板厚差異並修正，描述器 23/23 通過；真實範例隔離與接合整合測試通過；六面幾何仍 155/155。
- W3a UI：承接與安裝兩端均直接點面變色，選面時分開顯示，進對齊步驟才接合預覽。精靈隱藏兩端六面卡、選面時的長摘要與重複提示；工作模式保留設定。實際瀏覽器選工具架上面→翻視角→夾爪下面→接合預覽成功，error logs 空；截圖 `output/assembly-wizard/real-surfaces.jpg`。
- W3 邊界：這是接合板參考，不是完整機構的六面包圍盒。固定底板尚未合併馬達安裝特徵與新轉接座孔；示例採明確 4 mm 3D 參考厚度，不更動既有加工預設。W3b 的 exact mount 映射、正式作品／存檔／運動／加工整合尚未完成，原型確認仍只存記憶體。不提交或推送。

## M1 模擬補齊＋模組組裝（2026-09-29 規格完成，待施工授權）

規格及驗收唯一來源：[SDD-ASSEMBLY-MODULES.md](SDD-ASSEMBLY-MODULES.md)。本輪不含力學。基準 commit：`78df05f`。

### 模型分工與升級規則

- **主模型（Opus）**：寫 SDD、M0 盤點、為每包先寫好失敗中的測試 fixture 或具體驗收指令、審查 diff、跑全套測試、做瀏覽器驗收、記錄證據。
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
| M1b app 接線 | Sonnet（分三刀） | 刀 1：快照帶模組、rebuild 呼叫 rebake、求解呼叫點改走 assembly。刀 2：世界機架排除已安裝模組、節點外觀、每個模組另出機架檔。刀 3：跨模組合併防呆、D3 編輯前回到組裝姿態、新零件歸屬起點模組。 | E-M3 零回歸＋既有全套＋瀏覽器載入所有範例播放無差異。 | 完成（三刀皆本機 commit；刀 3 主模型補觸控路徑守門） |
| M1c 模組操作 UI | Sonnet | 刀 1：純函式 `js/blocks/module-ops.js`（SDD §4.3a）＋測試。刀 2：`js/blocks/module-editor.js`（`createModuleEditor(deps)` 工廠）、零件盤「模組」區、模組面板、`blocks.html` 局部；app.js 只接線。 | 刀 1：E-M6＋`test/module-ops.mjs`。刀 2：SDD §4.3 各項操作的桌機／窄畫面實測。 | 完成 |
| M1d R3 驗收 | 主模型 | 內建模組兩個＋必要修正；本節證據與 SDD 狀態。 | E-M8 全程；證據邊界照 SDD §5。 | 完成（與 M1c 刀 2 一併驗收；手機面板重疊為既有問題，另開任務） |
| D9 拖曳安裝 | Sonnet | `module-ops.js` 三支純函式、新檔 `js/blocks/module-drag.js`（SDD §4.3b）、`app.js` 接線、`blocks.html` import map；測試 `test/module-drag.mjs` 由主模型先寫。 | E-M9 自動＋E-M9b 瀏覽器；既有全套通過。 | 完成（Sonnet 兩輪：第一輪退回兩點） |
| P2 插入模組不重疊 | Sonnet | `module-ops.js` 新增 `insertOffset`；`module-editor.js` 的 `insertTemplate` 插入後平移；import map 升版。測試 `test/module-insert-place.mjs` 由主模型先寫。 | 測試全過＋桌機／手機插入兩個內建模組不重疊。 | 完成（Sonnet 兩輪：第一輪是規格漏算外形） |
| L1 夾爪 MG995＋開合範圍（走通舉升＋夾取 第 1 包） | Sonnet | `motor-tools.js` 純函式 `motorTypeAt`／`servoRange`／`rackDrivenBy`；`schema.js` 保存齒輪伺服；內建夾爪模組 MG995 0～24°。測試 `test/gear-servo.mjs` 由主模型先寫。 | 測試全過＋M2 只在 0～24° 來回、重載保留。 | 完成（Sonnet 兩輪＋主模型修正範圍） |
| L2a TT 驅動齒輪扁軸孔（第 2 包前半） | Sonnet | `exporters.js`：`gearGeometry` 對 TT 驅動輪輸出 `TT_SHAFT_FLAT` 取代中心圓孔；新增 `inspectGearExport`。測試 `test/gear-drive-hole.mjs` 由主模型先寫。 | 測試全過＋svg2gcode 讀得進。 | 完成（Sonnet 一輪） |
| L4 CNC 刀徑／板厚＋匯出警告（第 4 包） | Sonnet | `fabrication-profile.js` 新增 `cnc` 群組（3.175 mm／3 mm，缺席靜默補預設）；新檔 `cnc-check.js`；`exporters.js` 的 `cncPartsForExport`；app 匯出後以 banner 顯示。測試 `test/cnc-check.mjs`、更新 `test/fabrication-profile.mjs` 由主模型寫。 | 測試全過＋實際匯出顯示警告。 | 完成（Sonnet 一輪） |
| L2b 輪轂／舵盤鎖螺絲（第 2 包後半） | Sonnet | `fabrication-profile.js` 新增 `drive` 群組（常見值、缺席靜默補預設）；`exporters.js` 齒輪：TT 驅動輪 `TT_HUB_CENTER`＋2×`TT_HUB_SCREW`（取代 L2a 扁孔），MG995 驅動輪 `MG995_HORN_CENTER`＋N×`MG995_HORN_SCREW`；app 匯出帶 drive、數值仍為預設時提醒實量。 | 測試全過＋匯出 banner。 | 完成（Sonnet 一輪；主模型改提醒條件與 cnc-check 舊期望） |
| L4c 刀徑／輪轂／舵盤設定欄位 | **Haiku** | `settings.js` 的 `setCncSetting`／`setDriveSetting` 與同步；設定面板 9 個欄位；`window.blocks` 暴露。測試 `test/fabrication-ui.mjs` 由主模型先寫。 | 測試全過＋重載保留（有作品時）。 | 完成（Haiku 一輪；照範本複製類工作可交 Haiku） |
| L3a 齒條匯出＋M3 導銷（第 3 包前半） | Sonnet | `exporters.js` 新增 `inspectRackExport` 與齒條 DXF／SVG（RACK_CUT／RACK_SLOT／RACK_HOLE），`frameGeometry` 支援節點孔徑；`model.js` 導銷節點帶 `holeDiameterMm`；`schema.js` 保存 `pinHoleDiameterMm`；升降範例槽寬 3.4、孔 3.2。測試 `test/rack-export.mjs` 由主模型先寫。 | 測試全過＋孔位與 solver 誤差 0。 | 完成（Sonnet 一輪；主模型修正外形長度的錯誤假設） |
| L3b 模組螺絲對鎖（第 3 包後半） | Sonnet | 輸出端 `bolts`（schema 保存、插入改名）；升降齒條加 `LiftOutputB`；夾爪新增專用安裝點 `GripMount`（取代伺服軸心當基準）；`moduleFrameExports` 帶出組裝姿態的螺絲座標，`moduleFrameNodes` 把底板基準孔換成兩個 `MOUNT_BOLT` Ø3.2。測試 `test/module-bolts.mjs` 由主模型先寫。 | 測試全過＋實際匯出夾爪底板有兩顆 MOUNT_BOLT、齒條 3 孔。 | 完成（Sonnet 一輪；主模型更新 L3a 舊期望） |
| L5-0 關節改 M3 預設 | **Haiku** | 加工預設連接孔／機架孔 3.2；夾爪齒輪輸出孔 3.2；CNC 檢查提醒「只比刀大一點的孔在 svg2gcode 設鑽孔」。主模型補上匯出端 `normalizeExportSettings` 的預設（原本仍是畫面用的 12.96）。 | 新作品匯出所有關節孔 3.2。 | 完成（Haiku 一輪；主模型修正規格漏列的匯出預設） |
| L5a 實體疊層與關節（build plan） | Sonnet | 新檔 `build-plan.js`：群組起始層（裝在宿主構件層＋1）、群組內用 `computeBodyLayers`、齒條同小齒輪層；以點 id 彙整關節（guide-pin／mount-bolt／motor-shaft／pivot）、跨層總厚 spanMm。測試 `test/build-plan.mjs` 由主模型先寫。 | 測試全過：機架 0／小齒輪齒條 1／夾爪底板 2／夾爪齒輪 3／爪臂 4。 | 完成（Sonnet 一輪；主模型修正 GCB 穿三片板的期望） |
| L5b 製作包 | Sonnet | `build-plan.js` 加零件外形尺寸與孔種類、`hardwareList`（螺絲長度＝跨層厚＋防鬆螺帽 4 mm 取標準長）、`buildPackHtml`（板件／五金／逐層組裝步驟／CNC 注意／尚未驗證）；匯出區「製作包」按鈕。測試 `test/build-pack.mjs` 由主模型先寫。 | 測試全過＋實際下載的製作包與手算五金一致。 | 完成（Sonnet 一輪） |
| L5c 干涉檢查 | Sonnet | 新檔 `interference.js`：依各馬達播放範圍取樣，凸多邊形 SAT（穿透 > 0.5 mm），檢查同層互撞、螺絲頭／螺帽凸入鄰層、MG995 機身往後佔 9 層；製作包新增「干涉檢查」段落，匯出 banner 提示件數。測試 `test/interference.mjs` 由主模型先寫。 | 測試全過＋舉升＋夾取找出 5 項真實干涉。 | 完成（Sonnet 一輪；主模型接受機身方向朝遠離舵盤側的修正） |
| L6a 層間隔圈 | Sonnet | 使用者決定「螺絲頭刮鄰層 → 加墊片／隔圈」。`buildPlan` 收 `spacers`，輸出 `gaps`、每片板 `zMm`、每個關節 `spacers` 並把隔圈算進 `spanMm`（螺絲跟著變長）；五金清單列「M3 隔圈」、製作包新增「層間隔圈」段與馬達軸墊高提醒；干涉檢查改用 mm 高度；`resolveSpacers` 依螺絲頭干涉自動加隔圈（先處理螺絲頭，螺帽為後備）。測試 `test/spacers.mjs` 由主模型先寫。 | 28/28＋全套通過；舉升＋夾取自動得到第 0／1、2／3 層間 3 mm 隔圈，螺絲頭干涉歸零。 | 完成（Sonnet 一輪） |
| L6b 齒條長槽限位 | Sonnet＋主模型 | 使用者決定「MG995 機身撞小齒輪／機架 → 限制升降行程」。限位做成實體：齒條長槽一端縮短（`slot.trimStart／trimEnd`），行程公式、匯出、畫面、存檔一起改；`suggestRackStops` 由 0° 往外掃出不干涉區間並換算縮短量；齒條面板新增「限位：依干涉設定／清除」。主模型把訊息改成學生看得懂的「擋負角度那端」。測試 `test/rack-stop.mjs` 由主模型先寫。 | 20/20＋全套通過；瀏覽器：一鍵套用 → 長槽負角度端縮短 56.2 mm、行程 -4.9°～112.3°（117.6 → 61.4 mm）、製作包干涉 0 項、無 console 錯誤。 | 完成（Sonnet 一輪；代價：升降行程約減半） |
| L7 模組翻面安裝 | Sonnet＋主模型 | 使用者改選「MG995 翻面」取代限位。`mount.flip`：已安裝模組的疊層反過來（底板最外層、齒輪與爪臂夾在底板和齒條之間），MG995 機身朝外；模組列「翻面／翻回」按鈕（一筆 undo、存檔保留）。關節新增 `standoffMm`：對鎖螺絲中間沒有板的空層用隔柱撐住，並檢查隔柱是否刮到經過的零件。主模型修正：落在空層裡的隔圈併進隔柱長度、不重複列隔圈。測試 `test/module-flip.mjs` 由主模型先寫。 | 22/22＋全套通過；舉升＋夾取翻面後全行程（±112°）干涉 0 項、不需限位；瀏覽器：翻面按鈕、製作包疊層 0 機架／1 齒條／2 爪臂／3 齒輪／4 夾爪底板、無 console 錯誤。 | 完成（Sonnet 一輪；3D 檢視尚未反映翻面） |
| O0 直角安裝盤點＋POC | 主模型（盤點交 Haiku） | Haiku 列出「假設同平面」的程式位置（assembly／app 繪圖與點選／build-plan／interference／blocks3d）；主模型 POC：四連桿去手腕＋斜撐後工具架在 ±80° 保持水平。 | 盤點清單＋POC 數據 | 完成 |
| O1–O2 資料契約與位姿 | Sonnet | 內建「四連桿升降臂」（去手腕、補 ToolDiag、曲柄 MG995 −60～60°、輸出「工具架」可直角安裝在下緣）；`mount.orient`（type／edge／side／childAxisDeg／joint）存檔往返；`mountOrthogonal`（不搬子模組零件）；solveAssembly 不變換直角子模組並回傳宿主位姿；`orthogonalFrame`／`toWorld3D`／`orthogonalBand`。測試 `test/orthogonal-mount.mjs` 由主模型先寫。 | 39/39＋全套 | 完成（Sonnet 一輪） |
| O3 安裝選單與視圖切換 | Sonnet | 「⟂ 直角安裝到…」選項；主畫面一次畫一個平面（`planeOf`／`compsInPlane`、S.viewPlane）；側影帶（點了進入子模組正視，再點回主視圖）；「編輯此模組（正視）／↩ 回主視圖」。測試 `test/orthogonal-view.mjs`。 | 11/11＋瀏覽器 (a)～(f) | 完成（Sonnet 一輪） |
| O4 轉接座與製作包 | Sonnet＋Haiku→主模型 | O4a：轉接座孔位切進宿主桿與子模組底板（ADAPTER_HOLE）、製作計畫分平面疊層、五金（轉接座 ×1、M3×12 ×4）、「直角組裝」步驟。O4b：L 形轉接座封閉網格＋ASCII STL、「轉接座 STL」下載鈕——Haiku 兩輪未過，主模型接手改用格子法一次通過。 | orthogonal-fab 18/18、adapter-stl 11/11（封閉、方向一致、體積誤差 <0.5%） | 完成 |
| O5 分平面隔圈＋跨平面干涉 | Sonnet | 隔圈以（平面, 層）記錄；直角子模組以側影帶＋法向厚度範圍檢查宿主平面零件（排除鎖住的宿主桿）。主模型修正測試障礙物位置（模組插入會被挪開）。 | 10/10＋全套；舉升臂＋夾爪 −60～60° 干涉 0 | 完成 |
| O6 3D 檢視 | Sonnet | 主平面照舊；每個直角子模組另建子場景，以 4×4 仿射矩陣立在宿主桿上、隨升降移動、夾爪照常開合。 | orthogonal-3d 25/25；3D 截圖確認夾爪水平吊在工具架下 | 完成（初始鏡頭只框主平面） |
| O7 試行收尾 | 主模型＋Haiku | 四連桿放大（臂長 140、工具架 80）以吊得動約 180 mm 的夾爪；主模型發現干涉取樣逐點獨立求解會跳到交叉分支（平行四連桿 40° 以上誤報曲柄撞從動臂），改成沿馬達行程每步 ≤ 5° 連續求解；3D 初始鏡頭改為也框住直角子模組（Haiku 實作，主模型修正缺 z 造成 NaN 全黑）。 | 全套通過；四連桿＋直角夾爪 −60～60° 干涉 0；3D 斜視截圖可見夾爪吊在工具架下 | 完成 |
| B1–B2 組立台接口與連接 | Sonnet | `bench.js`：自動接口（輸出端＝同平面對鎖；每根桿兩條邊＝直角，白話名稱上緣／下緣／左緣／右緣，建議接口加星）、`canConnect` 白話原因、`connect`（任一根桿的邊都能直角安裝，`mount.to.body`）、`benchAdjust`（換邊、掉頭、轉 90°、沿邊 5 mm）、`toggleAngle`（直角↔同平面）。測試 `test/bench-ports.mjs` 由主模型先寫。 | 31/31＋全套 | 完成（Sonnet 一輪） |
| B3–B5 組立台畫面與兩種接法 | Sonnet | 上方「設計／組立」切換；模組卡片清單＋接法面板；3D 接口發亮（建議的較亮、不相容的可顯示並說原因）；點兩下接（卡片→接口→預覽→接上／取消）與拖曳吸附（40 px 內吸附）；一鍵調整按鈕；手機 ≤640 px 改成上方晶片列＋下方抽屜，按鈕 ≥44 px。測試 `test/bench-markers.mjs`。 | 9/9＋桌機與手機瀏覽器腳本 | 完成（Sonnet 一輪） |
| B6 即時干涉 | Sonnet＋主模型 | 目前姿勢（多馬達同時、連續求解）即時檢查、撞到的零件 3D 變紅、狀態列；「全行程測試」時間軸（每 5°，紅綠條，點了跳到該姿勢）。主模型另抓到：伺服角度存檔被夾成 0～360，四連桿 −60° 在復原／存檔後變 0°（行程剩一半），改為可負。測試 `test/bench-interference.mjs`。 | 13/13；全行程 19 ms（瀏覽器） | 完成 |
| B7 組合積木 | Sonnet | `compositeToTemplate`／`instantiateComposite`：宿主＋裝在上面的模組整組存進模組庫（🧩🧩），插入時全部 id、馬達編號、安裝關係一起改名，整組挪開不重疊。主模型修正自己測試檔的拼接錯誤。測試 `test/bench-composite.mjs`。 | 14/14；瀏覽器：存→重新整理→插入兩次＝4 個模組、直角關係保留 | 完成 |
| C1 板件邊與機架邊接口 | Sonnet | 三角板三條邊、未安裝模組的機架板外框直邊都能當直角接口（`to.body+edge`、`to.frame`）；共用 `orthogonalHostEdge` 給位姿、側影、轉接座孔（板件與機架板也切 ADAPTER_HOLE）、製作包、干涉、沿邊滑動。測試 `test/bench-ports2.mjs` 由主模型先寫（主模型修正兩點機架是長條形只有 2 條長邊）。 | 14/14＋全套；瀏覽器：夾爪接到機架右緣，即時干涉正確標出撞到從動臂 | 完成（Sonnet 一輪） |
| C2 直角子平面上的接口 | Sonnet | 宿主本身在直角子平面時也有接口標記（帶 plane），3D 依該平面矩陣畫在正確位置、拖曳吸附也用轉換後的位置；三層直角（底座→四連桿→夾爪）接得上。測試 `test/bench-nested.mjs`。 | 6/6；瀏覽器三層組裝成功 | 完成（Sonnet 一輪） |
| C3 組合積木匯出 JSON | 主模型 | 模組列與組立台面板「⬇ 匯出組合積木」下載 `.blocks-composite.json`，用既有「匯入模組」讀回。小改直接由主模型做。 | bench-composite 16/16 | 完成 |
| D1 同名模組加編號 | Haiku | `moduleLabels`：同名模組顯示成「齒輪夾爪 1／2」，用在組立台卡片、接口按鈕、安裝狀態與模組列。測試 `test/bench-labels.mjs` 由主模型先寫。 | 6/6；D2 瀏覽器檢查確認卡片顯示正確 | 完成（Haiku 一輪） |
| D2 已安裝模組的底板邊接口 | Sonnet | 已安裝（同平面／翻面／直角）模組的 `<id>-frame` 外框邊也是直角接口（底板・上下左右緣），底板跟著宿主動；轉接座孔切進宿主底板且不撐大外框；`benchPickPort` 接受「模組｜接口」。測試 `test/bench-mounted-frame.mjs`。 | 12/12；瀏覽器：第二個夾爪接到第一個夾爪底板，隨升降移動 | 完成（Sonnet 一輪） |
| D3 立在板面上 | Sonnet | `orient.edge 'child'`：子模組底板的一條邊站在宿主板面上、正面貼齊宿主的邊，轉接座在板面內側；按鈕「立在面上／壓在邊上」「換面」「換站立邊」；孔位、製作包文字、3D 一起支援。主模型修正測試（安裝基準點不是孔）。測試 `test/bench-stand.mjs`。 | 21/21 | 完成（Sonnet 一輪） |
| D4 傾斜角度＋兩塊立體干涉 | Sonnet | `orient.tiltDeg`（15° 一格，±60°）繞接合線傾斜；轉接座 STL 依角度產生（兩個封閉殼）、檔名與製作包寫出夾角；跨平面干涉改成「底板」「疊層」兩塊立體分別檢查，站立時不再誤報下層零件。測試 `test/bench-tilt.mjs`。 | 20/20＋既有干涉測試全過 | 完成（Sonnet 一輪；站立時只檢查板面以上的部分） |
| E1 現成金屬角碼 | Sonnet | 使用者在淘寶找到 M3 帶牙角碼（13×9.5×7、厚 1.2、孔心離末端 3.5）。新增接合件種類 `bracket-m3`：每處兩片、長邊貼宿主（孔離轉角 9.5）、短邊貼子模組（孔離轉角 6）、M3×6 直接鎖進螺牙不用螺帽、只有 90° 不能傾斜；組立台可切換「金屬角碼／3D 列印」，新接合預設金屬角碼。測試 `test/bench-bracket.mjs` 由主模型先寫。 | 18/18＋全套；瀏覽器：製作包列出角碼 ×2、M3×6 ×4 | 完成（Sonnet 一輪） |
| F1 角碼成為內建預設接合件 | Sonnet | 角碼規格存進作品的加工設定（`fabrication.joint`：預設種類＋寬／厚／長邊／短邊／孔心離末端，可在設定面板改），孔位、五金名稱、站立寬度檢查都由 `jointSpec` 引用；3D 畫出每處兩片角碼；預設接合件跟著作品存檔。主模型另把別的工作階段在裝置上的提交（6cb2c31）與 E1 合併，之後每包動工前先比對裝置 HEAD。測試 `test/joint-profile.mjs` 由主模型先寫。 | 17/17＋全套；瀏覽器：3D 看得到兩片角碼、改長邊 15 → 清單與孔位跟著變、存檔含 joint | 完成（Sonnet 一輪） |
| G1 畫出模組固定板、角碼貼合 | Sonnet | 使用者指出 3D 裡夾爪沒有「固定桿」可讓角碼鎖。原因：已安裝模組的底板（`<id>-frame`）只存在於切割檔，3D 與模組正視圖都沒畫。新增 `mountedFramePlates`（沿用匯出幾何，含 MG995 開口與孔，跟著姿勢動），3D／2D 畫出固定板；`bracketBoxes` 讓長邊貼宿主板面、短邊貼固定板。測試 `test/module-plates.mjs` 由主模型先寫。 | 12/12＋全套；3D 截圖確認固定板在工具架下、兩片角碼同時貼住工具架與固定板 | 完成（Sonnet 一輪） |
| G2 角碼孔與螺絲 | Sonnet | 使用者指出 3D 的角碼沒有固定孔。`bracketBoxes` 每翼帶螺牙孔（對準木板上的轉接座孔，修正站立與另一側的對位），新增 `bracketScrews`；3D 畫出有孔的角碼、M3×6 螺絲，宿主桿上也挖出轉接座孔。測試 `test/bracket-holes.mjs` 由主模型先寫。 | 19/19＋全套；截圖確認孔與螺絲同心 | 完成（Sonnet 一輪；待辦：3D 桿厚用 4 mm 與板厚 3 mm 不一致、3D 未畫隔圈） |
| H1 設計模式分頁 | Sonnet | 使用者指出設計模式裡舊機構會留在畫面上與新插入的重疊。決定：設計模式一次只顯示一個設計，用分頁切換（每個模組一頁＋「未命名設計」＋「＋ 新設計」），組立模式才全部顯示。新增 `design-focus.js`（分頁、焦點、過濾、新零件歸屬）；繪圖／點選／3D／馬達按鈕都只看焦點分頁；從模組庫插入會開新分頁；匯出與製作包仍是整份作品。測試 `test/design-focus.mjs` 由主模型先寫。 | 15/15＋全套；瀏覽器 a–g（桌機與手機）通過 | 完成（Sonnet 一輪；範例教學卡切分頁後仍留著） |

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

### M1b 刀 2 證據（2026-09-30，世界機架／安裝孔外觀／模組機架匯出；本機 commit、未 push）

- 施工（Sonnet）：`assembly.js` 新增 `splitFrameMounts`、`moduleFrameExports`；`renderNodes` 可收 `mountedBaseIds`，已安裝模組的固定點畫成虛線圓環並附「安裝孔：鎖在宿主模組上」說明；`exportFrameAsSvg／Dxf` 加選填檔名；app 的三個世界機架包裝改吃 `worldFrameComps`，五處世界機架安裝座只過濾 `.free`（`.hosted` 與零件匯出清單不動），匯出時每個已安裝模組以 home 座標另出 `<模組 id>-frame`；import map 升版 `20260930_m1b2`。
- 審查：Sonnet 回報 `test/assembly-frame.mjs` 崩潰，查明是主模型的測試錯誤（先替換 `globalThis.URL` 才用 `new URL` 讀 fixture），修正測試讀取順序後 20/20；實作不需修改。
- 自動：`assembly-frame` 20/20；全套 59 支全過；schema 70/70。
- 瀏覽器（fixture 自存重載）：確認載入 m1b2 版本；GCB 為虛線圓環、LGA 仍為地錨方塊、GCA 仍為馬達樣式。攔截下載（不實際落地）執行 SVG 匯出：7 個檔案含 `frame.svg` 與 `Grip1-frame.svg`，提示「已匯出 5 個零件 + 機架 SVG＋ 1 個模組底座」；世界 `frame.svg` 的圓孔數 6，與原版 `competition-rack-lift` 的 `frame.svg` 相同（夾爪孔已排除）；`Grip1-frame.svg` 5 個圓孔。console error 為 0；測試自存已清除。
- 既有行為（非本刀造成）：齒條不會匯出成零件檔，原版齒條升降範例同樣只匯出 `LiftPinion.svg` 與 `frame.svg`。
- 範圍外（M1 不做）：畫布與 3D 不畫模組底座板，只在匯出時產生；DXF 匯出與 SVG 共用同一段邏輯，本輪只以攔截方式實測 SVG。

### M1b 刀 3 證據（2026-09-30，編輯守門；本機 commit、未 push）

- 施工（Sonnet，一輪通過）：`assembly.js` 新增 `connectionModule`、`selectionModule`；app 的 `nearestDisplayTo` 略過跨模組候選（沒有模組時與原本逐步相同）；新增 `ensureModuleHome`（宿主鏈馬達不在 home 時先轉回、重畫、提示，這一下不執行原動作）與 `clearOffHomeModuleSelection`（`draw()`、`renderFrame()` 開頭檢查，姿態離開 home 時自動取消已安裝模組的選取，不在 draw 裡呼叫 draw）；齒輪、三點桿、連桿點選與自由拖曳、節點（renderNodes 與 Render.init 共用 `guardedNodeDown`）包上守門，手轉齒輪不包；tools.js 六個新零件建立點先以 `connectionModule` 檢查、跨模組拒絕並提示，同模組時新零件標上 `moduleId`。
- **主模型瀏覽器驗收發現的漏洞並修正**：窄畫面（手機）版面下，input.js 的「接點優先命中」capture 監聽器依座標直接呼叫 `onNodeDown`，繞過守門。改為可注入的 `nodeDownEntry`，app 注入 `guardedNodeDown`（未注入時行為不變）；import map 加 `input.js?v=20260930_m1b3`、app.js 升版 `20260930_m1b3b`。
- 自動：`assembly-edit` 16/16；全套 60 支全過；schema 70/70。
- 瀏覽器（fixture 自存重載，窄畫面版面）：
  - 升降播到 62° 後點夾爪 GCB（一般路徑）與觸控點 LT（capture 路徑）：第一下回到 0°、不選取、提示「已回到組裝姿態，請再點一次進行修改」；第二下才選取。修正前觸控路徑會繞過。
  - GCB 選取中播放：選取自動清除、角色面板收起，播放不中斷。點升降（未安裝模組）的節點 LGA 不觸發回到組裝姿態。
  - 觸控畫桿：GCA→LPC（跨模組）被拒，無新零件並提示「不同模組只能用安裝接口連接」；LPC→LGA（同為 Lift1）成功，新連桿自動標 `moduleId: Lift1`。
  - console error 為 0；測試自存已清除。
- **M1b 收尾回歸發現的快取問題並修正**：全範例回歸時 console 出現 `rebuild` 讀 `S.modules.length` 為 undefined。查明刀 1 修改了 `state.js`（新增 `modules: []`）卻沒有進 import map，瀏覽器沿用快取的舊版 state.js；有自存的作品因 `applySnapshot` 會補上 `S.modules` 而沒發作，**第一次開頁、沒有自存的使用者會在初始化時出錯**。補上 `"./js/blocks/state.js": "…?v=20260930_m1b1"`，並核對 M1 期間改過的所有 js（`app.js` 由 script src 升版；`module-schema.js`、`solve-health.js` 為新檔），皆已有版本。新分頁、無自存重載：state.js 載入新版、console error 為 0。全 17 個範例播放回歸：`S.modules` 皆為 0、`S.assembly` 皆為 null，可播放者 20 幀前進 42°（夾爪任務範圍內 4°），縮放儀（手動）與空白挑戰不播放，與改動前一致。
- 未能在瀏覽器驗證：拖曳吸附的跨模組防呆。fixture 內沒有可自由拖動的浮動點（爪尖受爪板剛體約束、地錨有位置鎖），對照組無法成立；該路徑由 `canMergePoints` 的 node 測試與 `nearestDisplayTo` 的 diff 審查涵蓋。三點桿／多邊形板的跨模組拒絕也只有 diff 審查，未在瀏覽器操作。

### M1c 刀 1 證據（2026-09-30，模組操作純函式）

- 規格修訂：新增 D8（安裝改為模組面板選單，拖曳吸附列後續）與 SDD §4.3a API；「相連」與「重新命名」共用自有 token／參照 token 規則——齒條升降範例 5 件彼此不共用接點，靠 `pinion`、`framePins`、`mountLocatorPoint` 參照相連（主模型先以 node 盤點確認）。
- 施工（Sonnet，一輪通過）：新增 `module-ops.js`（相連群組、建立模組、推論／新增輸出端、安裝、拆下、解散、模板匯出／正規化、插入實例、內建模組、模組庫序列化）；`assembly.js` 的 `transformComp`、`module-schema.js` 的 `sanitizeName` 改為 export 共用。Sonnet 自行抓到一個 bug：馬達編號掛在接點物件上（`p1.physicalMotor`），只看零件頂層會讓 home 變成 {}。
- 主模型審查修正：模板的 params 原本只取 part-types 的 `paramProps`，會漏掉桿件孔 `distParam`、皮帶輪 `pinRadiusParam` 等欄位，模組存檔後這些參數會遺失；改為依 SDD 用參照 token 與 params key 取交集，並補測試。移除因此不再使用的 import。
- 自動：`module-ops` 64/64（含同一模板插兩次 id／param／馬達不衝突、在升降 0° 與 30° 時安裝 I1 皆成立、拆下後停在世界位置、迴圈與解散拒絕條件）；全套 61 支全過；schema 70/70。
- app 尚未載入 module-ops.js（刀 2 接線），推上線不影響網站行為。

### M1c 刀 2 ＋ M1d 證據（2026-09-30，模組介面與 R3 情境 E-M8）

- 設計修訂：模組操作做成一列 `#moduleEditor`（`div.module-row`），`sync()` 時搬進目前顯示中的檢查器面板（長度／齒輪／節點面板）底部——手機上所有檢查器面板都是同一個底部抽屜，另開面板必然重疊。零件盤新增「模組」區（內建在前、我的模組在後、最後「📥 匯入模組」）。
- 施工（Sonnet，一輪通過）：新增 `module-editor.js`（`createModuleEditor(deps)`：`library／insertBuiltin／insertLocal／panelState／saveAsModule／rename／mountTo／unmount／setOutput／dissolve／saveToLibrary／exportTemplate／importLibraryText／removeFromLibrary／sync`）；`draw()` 呼叫 `moduleEditor.sync()`；本機模組庫存於 `localStorage['cadcam.blocks.moduleLibrary']`；模組庫操作不改作品、不記 undo；模組名一律以 `textContent／value` 顯示。import map 升版 `20260930_m1c2`。
- 自動：`module-editor` 34/34；全套 62 支全過；schema 70/70。
- 瀏覽器 E-M8（1280×800，從清空的畫布開始）：
  - 零件盤點「齒條升降」「齒輪夾爪」：9 件、2 模組、馬達自動為 1、2；夾爪齒輪被選取，模組列出現在齒輪面板底部，「安裝到…」列出「齒條升降・滑台」。
  - 選「齒條升降・滑台」安裝：`mount.ref = (45, 88, 90°)`、`home = {1: 0}`，夾爪底座與滑台孔畫面座標完全重合；模組列改為「裝在 齒條升降・滑台／拆下」。
  - 播放 M1 到 90°：滑台孔上移 56.6 px，底座全程與孔重合；離開組裝姿態時選取自動清除。切 M2 播放：爪尖距 228→96 px，滑台位移 0（M1 凍結 90°）。
  - 重載（自存）：兩模組與安裝關係保留，再播 M1 底座仍貼孔。分享連結（約 5 KB）：先清空自存再開連結，9 件與安裝關係完整還原。
  - 3D 預覽開關無錯；「拆下」→未安裝；「存到我的模組庫」→零件盤出現「齒輪夾爪・我的模組 ×」；「匯出模組」（攔截下載）檔名 `齒輪夾爪.blocks-module.json`；從我的模組庫插入 +4 件、馬達自動為 3；「解散模組」後零件回到根。
  - 窄畫面 375×812：觸控點模組的馬達軸心，模組列正確放入節點面板（底部抽屜）。
  - console error 全程為 0；測試用自存與本機模組庫已清除、視窗尺寸已還原。
- **發現（既有問題，未處理，已開獨立任務）**：手機版點地錨或馬達軸心時，節點面板與機架面板同時打開，機架面板蓋住節點面板下半部（無模組的四連桿範例同樣重現）。選到模組固定點時模組列因此被遮住；選齒輪、桿件、板件時不受影響。
- 未涵蓋：拖曳吸附安裝（D8 列後續）；E-M8 中「升起時點夾爪改爪端長度」已在 M1b 刀 3 以節點與觸控路徑驗證，本輪未再以爪端把手操作。

### P1 機架面板收進節點面板（2026-09-30，M1d 發現的既有問題）

- 根因（主模型盤點）：`#roleEditor` 與 `#frameEditor` 是相鄰的兩個獨立 `inspector-panel`。手機版全部固定在同一個底部抽屜位置；桌機 ≥1100px 兩者都靠右上（top 16／172 px），所以點機架點或馬達軸心時一定疊在一起。重現：四連桿範例點 A／B，390×844、360×640、1280×800 三種尺寸都重疊（例：390×844 重疊 374×227 px）。
- 修法：沿用 M1c 模組列的做法。`panels.js` 新增 `placeFrameEditor(frameEl, roleEl)`：節點面板顯示時，把機架面板收進去當最後一段（模組列仍在最底），並標記 `data-embedded="true"`；節點面板關閉時放回原位，恢復獨立面板。`blocks.html` 用 `#frameEditor[data-embedded="true"]` 把定位還原成一般段落；import map 新增 `panels.js?v=20260930_p1`，app.js 升版。
- 施工：主模型先寫 `test/panel-stacking.mjs`（修正前 0/1 失敗），交 Sonnet 施工，一輪通過。Sonnet 在放回原位的分支多加了 `roleEl.parentNode` 防呆，因為 `node-editor.mjs` 的假 DOM 沒有父元素；主模型審查後接受。
- 自動：`panel-stacking` 14/14；全套 64 支全過；schema 70/70。
- 瀏覽器（無頭 Chromium，手機尺寸開觸控模擬）：三種尺寸逐一點四連桿的四個接點，重疊皆為 0，console error 為 0。手機上機架段落在底部抽屜內，往下捲即可操作；桌機排成單欄。實際按「軸距 ＋」：100 → 108 mm。
- 未涵蓋：真實手機硬體；只開機架（沒有選接點）時仍是原本的獨立面板，行為不變。


### D9 拖曳安裝證據（2026-09-30）

- 盤點（主模型）：模組 `base` 是固定點或馬達點，預設有位置鎖；拖曳接點只移動單點，跨模組合併有 `canMergePoints` 防呆。因此不改接點拖曳，改用獨立把手（同 R1d 爪端把手的 capture 模式），規格見 SDD D9／§4.3b。
- 主模型先寫 `test/module-drag.mjs`（修正前 0/2 失敗）。
- Sonnet 第一輪：28/28 通過。審查接受三處偏離：`View.getScale()` 是 svg 單位／mm，吸附半徑要再乘 CTM；`renderFrame()` 也更新求解點；把手外觀。退回兩點：把手蓋住 base 節點，模組被選取時點不到節點；`finish()` 先釋放 capture 才清 `drag`，若 `lostpointercapture` 同步觸發會把結果還原。
- Sonnet 第二輪：把手移到 base 右上 (+24,−24) px 並畫虛連線；先清 `drag` 再釋放 capture。
- 自動：`module-drag` 28/28；全套 65 支全過；schema 70/70。
- 瀏覽器（無頭 Chromium）：
  - 1280×800：點 base 節點可選到節點，節點面板開啟；拖把手到滑台出現吸附環，放開即安裝，base 與 at 螢幕座標相同，一筆 undo，復原回到未安裝；拖到空白處只搬位置。
  - 主模型補驗：用真的 M1 與播放鍵跑到 103°，滑台上移 65 px，夾爪 base 在 DOM 上與滑台孔重合（誤差 < 0.01 px）。
  - 390×844 觸控（CDP touch 事件）：拖把手安裝成功，出現「已安裝到 齒條升降・滑台」提示。
  - console error 全程為 0。
- 已知（既有，未處理）：兩個內建模組都插在畫面中央，底座會重疊；手機命中區較大，點夾爪 base 可能選到升降的 base。可改點夾爪其他零件，或先拖開。
- 未涵蓋：真實手機硬體；複雜作品拖曳時每次 pointermove 都 rebuild 的效能。

### P2 插入模組不重疊證據（2026-09-30）

- 根因：`instantiateTemplate` 把每個新模組的 base 都放在畫面中心，連續插入的模組疊在同一點。
- 修法：`insertOffset(existing, new, margin, params)` 以範圍（接點＋齒輪齒頂圓＋齒條外框）判斷是否重疊；重疊就沿 +x／−x／+y／−y 挪到相距 30 mm，取位移最小者。作品是空的時仍放在中央。
- 第一輪：主模型的規格只算接點，Sonnet 照規格完成、測試全過；瀏覽器實測仍有視覺重疊（齒條升降的接點只在 45×23 mm，齒條實際長約 200 mm）。主模型補規格 v2 與測試（11/16 失敗）。
- 第二輪：Sonnet 納入齒輪（規則同 `currentBounds()`）與齒條（規則同 `drawRack`）的外形，16/16 通過。
- 自動：全套 66 支全過；schema 70/70。
- 瀏覽器：1280×800 與 390×844 觸控，插入「齒條升降」「齒輪夾爪」時夾爪放在右側、不重疊；之後拖曳把手照樣能安裝。console error 為 0。
- 未涵蓋：只避開既有範圍的外接矩形，不保證落在目前畫面內；世界機架板仍會包住兩個模組的固定點（既有行為）。

### L1 夾爪 MG995＋開合範圍證據（2026-10-01，見 PILOT-LIFT-GRIP.md）

- 盤點：MG995 只支援桿件輸入；齒輪驅動一律當 TT。`inputRockRange` 只要 active 馬達帶任何齒輪就套用全部齒條行程 → 組合後夾爪 M2 借用升降行程，兩爪穿越。
- Sonnet 第一輪：三個純函式＋工廠改用；`driveGearAt` 記錄型號；內建夾爪模組 MG995。審查發現 `schema.js` 會濾掉齒輪的 `motorType`／`servo*`，重載後變回 TT（主模型規格漏列）。
- Sonnet 第二輪：`normalizeGear` 只在 mg995 時輸出型號與角度，TT 齒輪輸出不變。
- 主模型接手修正：規格的 0～45° 是拿接點 p3（折彎處）量的，實際爪尖（`jawCenterline` 末端）扣板寬後，0° 淨距約 134 mm、24° 約 9 mm、約 25.7° 相碰。範圍改 0～24°，測試改用實際爪尖淨距。
- 自動：`gear-servo` 30/30；全套 67 支全過；schema 70/70。
- 瀏覽器（1280×800）：標示 `TT·M1`／`MG995·M2`；重載後保留；M2 只在 0～24° 來回，閉合端兩爪不交錯；M1 仍是齒條行程；console error 0。`Mod2-frame.dxf` 出現 `MG995_SLOT`，且落在機架外框內。
- 下一步發現：安裝後左爪平面上掃過齒條與升降齒輪，前後層與鎖附在 L3（模組實體接口）處理。

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

## 六面體接合箭頭追加驗收（2026-10-07）

- 使用者授權將對齊整合至六面體預覽。Luna 完成兩個原型 UI 檔，主模型檢查接合面基底與尺寸取消流程並獨立驗收。
- 手機 390×844：面內四向箭頭、置中、移動／靠邊切換與尺寸按鈕可操作；舊九宮格與文字調整列隱藏。步距 2.5 mm 可將左右 5 改至 7.5；負偏移 -12.5 可輸入。
- 非法間距 -1 被阻擋，取消後仍可確認；Escape 不帶入草稿。靠邊可組合右下角，置中清除偏移；旋轉視角保留選面並重新投影箭頭。確認後修改再取消可回到已確認值。
- 電腦 1280×800 工作模式保留原數值與九宮格；瀏覽器無 console error。face-mate 155/155、UI 語法與 diff 空白檢查通過。
- 手機實證：output/assembly-wizard/face-arrows.jpg。仍為記憶體內原型，不寫入作品；W3b 真實組立轉換尚未完成。

## W3b 第一段：擺放記錄（2026-10-07）

- 新增純函式 face-placement.js，將接合板中心化轉換還原成模組座標，保留選面、對齊、尺寸及 3×3 旋轉／平移；格式 face-placement-preview v1，明示 preview-only。
- 288 種姿態的真實輪廓及孔座標、JSON 往返、輸入隔離通過。未更動 blocks schema、assembly solver 或現有作品。
- 手機 390×844 確認後出現已確認擺放下載入口，相容性計算辨識板厚／間距高度差；console 無錯誤。下載檔案落地未驗證，不宣稱可匯入 blocks。
- W3b mount 精確映射及 W4 正式組立台整合仍待完成。截圖 output/assembly-wizard/placement-record.jpg。

## W4 完成與提交驗收（2026-10-07）

- 正式組立台整合六面體精靈，mount.face 契約分開於舊接法；一次確認／一次復原，取消不改作品，JSON／分享往返通過。
- 主模型完成跨模組整合；有界契約工作由 Luna 施工，獨立審查補齊 flip 防護、尺寸／加工設定刷新、既有宿主接法排除及瀏覽器快取更新。
- 3D 板中心、288 種姿態、孔保留、拆下、移動與加工厚度更新通過；HTTP 正式介面手機／桌面驗收，主入口 console error 空。實證 formal-wizard.jpg／formal-3d.jpg。
- 全測試以 --no-experimental-webstorage 執行；三項既有失敗 assembly-schema／solve-health／trace-fallback 在 HEAD 基線結果相同。未納入本輪前已存在的其他修改。
- 設計組立完成；轉接件、跨面固定孔與跨面干涉未驗證，介面與製作包明示，未宣稱加工完成。
