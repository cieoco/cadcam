# SDD — 平行四連桿升降任務增量

日期2026-10-10；基準67e5ebf；不新增範例、不改blocks v1、solver數學或competition雙馬達。

重用parallel-fourbar既有五零件：Anchor1 A(-110,0)、Anchor2 B(-110,72)，Link1 AC=48、Link2 BD=48、Link3 CD=72，單M1。CD保持垂直姿態但沿弧平移，不是純垂直升降或水平托盤。任務取C.y−A.y（D相對B等同）。0–80°是避開90°奇異的教學任務分支，不是機構極限。

輸入armLengthMm32–120mm，同步寫既有LL1/LL2，不保存重複臂長；startHeightMm/endHeightMm0–120mm，保存parallelStartHeight/parallelEndHeight。預設臂48、起高10、終高35；任務參數含parallelWorkflow=1。合法輸入仍可能超過原solver量測的分支可達高度。允許下降或同高。未提供欄位沿用來源／範例；字符串數字、未知欄位與非法來源明拒。來源不同長會EQUAL_ARMS_REQUIRED；只有明確armLengthMm操作才同步修正，不靜默修補。

純parallel-lift-workflow用原compileTopology/solveTopology量測高度，於0–80分支用二分求角，無另造幾何求解。既有validateMotionRange加可信每樣本callback，驗證有限解／主孔剛性／跳動／兩端高度、CD方向90°±0.1°及右側非交叉分支。採樣上限/步距沿既有policy；採樣不證明樣本間連續、干涉、承載或硬體。callback僅可信域adapter提供，不對JSON/MCP開放。

parallel-lift-operations沿用createFromExample/updateTask、operationVersion1，exampleId僅parallel-fourbar，parameters上述三項。小抽task-operation-support共用來源JSON安全/正規化前後核對與單次候選session；保留gripper exports相容。候選預覽不改正式作品；確認前来源未變、重新驗證、一筆完整undo；同值零undo，取消零副作用，過期/已消費拒絕。分享/JSON重開保留LL、任務高度與可重現plan。

UI沿現有範例叫出精簡任務卡，不新增常駐AI面板。常態三欄+起/終；改欄位只預覽，有草稿才顯示確認/取消；確認可修正兩臂等長。卡片沿既有手機避讓畫布規則，切換夾爪↔平行↔普通與跨例undo須驗收，不讓兩controller覆寫共享卡片。純共用規則只於幾何/任務改變重算，播放角cache忽略。

教學：先觀察CD姿態→只把臂48同步改64→同高度求角比較→只改終高度45→試不可達高度→修正重驗；等長破壞會明確诊斷。隔離頁用正式工具不讀寫正式autosave，固定JSON與真正agent工具請求分開記錄。先負例再實作，manifest、相關及必要全套/load graph、桌面390px操作、工作紀錄/版本；不commit/push。

完工：本地2026.10.10.4，純35/35、controller13/13、必要全套167/167、最後定向8/8與載入圖通過；桌面/390px實際UI及DOM排版驗收完成，Chrome新截圖工具逾時如實保留。詳見[工作紀錄](WORK-PARALLEL-LIFT-PILOT-2026-10-10.md)。
