# 平行四連桿升降任務工作紀錄

日期2026-10-10；基準67e5ebf；本地版本2026.10.10.4，未commit／push／發布。依 [增量SDD](SDD-PARALLEL-LIFT-PILOT.md) 完成。

重用原parallel-fourbar五件、單M1，沒有新增重複範例，沒有修改competition雙馬達。任務同步LL1/LL2（32–120mm），保存parallelWorkflow／parallelStartHeight／parallelEndHeight於既有params，blocks v1不變。CD保持垂直但沿弧平移，不宣稱純垂直升降或水平托盤。C相對A高度在0–80°教學分支由原solver量測後二分求角，沒有另一套幾何solver。0–80°是本任務分支，不是機構極限。

抽出task-operation-support，重用JSON安全／來源正規化損失檢查／一次候選session；gripper exports相容。parallel prepare僅三輸入，未知／字串／非有限尺寸拒絕；不等長EQUAL_ARMS_REQUIRED，僅明確armLengthMm操作才同步修正。來源A/B重複固定參照、CD72、零相位、單M1、固定尺寸與五件角色須維持；公開planner非法comps/主孔/LL3明拒。候選確認重驗，取消零副作用、過期保留新作品、整批一筆undo、同值零undo。

validateMotionRange只最小增加可信sampleChecks callback：每樣本檢查CD垂直90°±0.1°與右側非交叉分支，並沿用有限解、主孔尺寸、疑似跳動、端點高度驗證。預設步距／上限／容差與未驗證清單保留；不把callback或放寬policy開放給JSON/MCP。

UI現有範例載入即啟用精簡任務卡，常態三欄與起/終；改值只顯候選摘要（未確認幾何不顯在正式畫布），draft才顯確認/取消。預覽不動正式snapshot／pose；draft期間禁起終、播放與MP4。確認透過app既有完整apply/undo/save路徑，姿態使用activateMotor M1；播放於驗證range往返，不走整圈。只在幾何／任務改變重算，播放theta重用cache。切換夾爪／平行／普通與跨例undo清理共享卡片。原teaching-fourbar可見段已補48→64、終45、不可達120→修正與破壞等長診斷，沿用原教學連結。

新增隔離test/parallel-lift-pilot.html嵌入正式blocks工具沿用gripperPilot隔離模式；JSON候選→確認→本頁記憶保存／重開，不讀寫正式autosave。固定fixture與真實agent工具循環分開。

驗收證據：

- 首個未知欄位負例在入口尚缺時失敗。parallel-lift35/35、parallel-lift-controller13/13；含兩臂同步、32/48/64/120尺寸、下降/同高、等長破壞→明確修正、不可達→重驗、JSON／分享重開、來源不變、取消/同值/過期/一次undo、逐樣本姿態診斷，以及controller快取/卡片互換。
- 相關9組先通過；必要全套 `NODE_OPTIONS=--no-webstorage node tools/test-runner.mjs --output output/parallel-lift/acceptance` 167/167，Node25.2.0／Windows。全套後依主審補直接play()/MP4守門、固定參照／fixedLen防護及activateMotor；最後定向8/8。原gripper、motion与example回歸保留。
- 最終load graph0d9af793ab43daf07821，146 modules／18 pages，check通過。機器報告output/parallel-lift/acceptance/results.json、targeted/results.json、final-targeted/results.json。
- Chrome HTTP：JSON建立48、起10終35→71samples；人工臂64候選確認→終120不可達禁確認→45修正確認→記憶保存→一次undo回64/35→重開64/45。新JSON候選後改載gear，確認返回STALE_SOURCE且保留新夾爪。gear→parallel→普通→undo回parallel，卡片顯示正確。
- 390×844手機：48→64確認、终120錯誤→取消→45確認→終點走通；最終草稿播放按鈕未playing且提示先確認／取消；MP4入口同樣拒絕，未錄影。card不壓stage：草稿card112–384px、stage392px起；確認後card112–348、stage356px起；tabs48–91px。常態確認取消display:none。
- error console為空。證據output/parallel-lift/desktop-dom.json與mobile-layout.json。Chrome單次新截圖仍Page.captureScreenshot CDP5000ms timeout，保留工具限制，不沿用前輪圖片冒充。本輪有實際UI互動及DOM/layout證據，未有新截圖，視覺截圖核對受工具限制。
- 主代理真實agent開發工具請求：create64、起20終80→UNREACHABLE_HEIGHT且noCandidate；改終50→通過，18.209956864011474→51.37516712711658°，68samples，LL1=LL2=64。不是固定fixture，不是MCP或自然語言產品服務。

完成界限：特定原五件平行四連桿教學配置，非任意升降臂生成；不支援自由拓撲、任意固定點或雙馬達。採樣不證明樣本間連續、完整干涉、接觸、承載、硬體或加工就緒。CD垂直保持不等於水平托盤，沿弧移動不等於純垂直運動。
