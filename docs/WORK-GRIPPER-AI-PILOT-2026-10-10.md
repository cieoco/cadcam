# 雙齒輪夾爪 AI 操作試點工作紀錄

日期：2026-10-10；來源基準 c318c6c；本地版本 2026.10.10.2，未 commit／push／發布。

W1：新增 gripper-operations.js 與 manifest 測試入口，重用 getExample、normalizeSnapshot、planGripper。請求版本／action／example／欄位／數字範圍明確驗證，來源非 JSON、schema 會改／丟已提供資料、未知頂層或組立作品拒絕。新增 planner 分支穩定 code，不靠中文訊息比對。prepare 不讀全域／DOM，不修改來源。

W2：controller 重算使用共用 prepare；保留既有 input/change 與拖曳取消流程。session 在來源未變且候選仍有效時，透過 app 的 applySnapshot 確認整件作品；一批次一筆 undo，同值零 undo，確認後失效。人工既有 change 可提交無效數字供修正；結構化候選確認僅接受有效設計。兩者有效輸入的 plan 等價，但提交政策不同。

W3：test/gripper-pilot.html 為不列入學生導航的隔離驗收頁，下方是正式 blocks 畫布，未另造 AI 畫布。gripperPilot 模式不讀／寫正式 autosave，也不保存設計焦點。頁面記憶保存／重開使用同一 snapshot，兩姿態圖解由同一 snapshot、compileTopology／solveTopology／createPlateGeometry 產生，標 GearA／GearB 固定軸與 LeftJaw／RightJaw。案例短教學改為 50／10 → 80／10 → 150／40 不可達，每次改一變數。

W4 驗收：

- 最小字串數字負例在入口不存在時先失敗，實作後拒絕；完整新增操作測試 40/40。
- 原 workflow 11 cases、controller 16/16、object PASS、download 8/8 保留。新增操作涵蓋有效/非法/不可達、舊外彎、額外零件、JSON安全、normalization loss、fabrication/trace/motor欄位、組立拒絕、取消、一次undo、過期、重複與保存分享重開。
- 全套 `NODE_OPTIONS=--no-webstorage node tools/test-runner.mjs --output output/gripper-pilot/acceptance`：164/164。Node v25.2.0；load graph a38ae9911d61112dd0f5。首輪無旗標 162/164：fabrication-profile 遭 Node25 global localStorage SecurityError；load-graph 因執行中驗收頁修訂變 stale。使用 Node25 既有支援的 no-webstorage 環境旗標，未修改 runner。
- 隨後僅修手機卡片／播放列排版與圖解標籤；定向七組（operations/controller/workflow/object/download/panel-stacking/load-graph）7/7。最終 graph ec48e9248277aff63d92，140 modules／17 pages，已檢查。
- IAB 實際 HTTP 瀏覽器：create50/10 → 確認 → update80/10 → 確認 → 記憶保存 → 原工具一次undo回50 → 重開回80；150/40 返回 UNREACHABLE、禁確認。下方原工具顯示對應物件及淨距。390×844 手機原入口載入、表單改80、閉合可完成；原任務卡標題／播放列遮擋修正後重新操作。error console 為空。僅尺寸模擬，不是實機驗收。
- 截圖：output/gripper-pilot/desktop-tool.png（最終工具80mm）、mobile.png（最終390px）、desktop.png（隔離候選與雙姿態）、mobile-pilot.png（隔離頁手機排列）。機器報告在 output/gripper-pilot/acceptance/results.json 與 final-targeted/results.json。
- 真實 agent 在本輪經開發工具生成非預設 JSON 並直接呼叫純函式：create65/8 → ok、張開淨距81.000000003；update75保留8 → ok、張開淨距90.999999995，來源候選仍65。此證據與固定 fixture 分開；不是外部 LLM、自然語言產品服務或 MCP 傳輸。

完成界限：僅 gear-gripper 原四零件對稱結構的任務宽度／餘量操作。沒有任意桿長修改、任意機構生成、接觸／摩擦／承載／全行程干涉、硬體行程或加工就緒驗證。模型角不能直接当伺服命令，齒輪與軸固定、板厚、刀具及五金仍需核對。
