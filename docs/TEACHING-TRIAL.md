# 零基礎手機教學試用

入口：`blocks.html` 的「開始第一課」。教材：`teaching.html`，可用瀏覽器列印教案與學生工作紙。

本次實作以快速試錯、數位樂高為目標：四連桿七步入門、19 個範例的預測／量測／解釋、可收起的任務、角色標籤、復原及重設課程、求解問題的下一步提示。手機直向使用可橫滑零件盤；低高度橫向使用側邊面板。教學進度不寫入作品格式，重開一般作品會清除當前課程身分。

## 驗證

- 新增四連桿驗證：`test/fourbar-lesson.mjs` 與 `test/fourbar-measurement.mjs` 通過。擺幅是取樣估計，局部可達或死點案例不提供誤導數值。
- Node：`test_blocks_schema.mjs`、`test/example-controller.mjs`、`test/teaching-feedback.mjs`、`test/slider-crank.mjs`、`test/gear-pair.mjs`、`test/parallel-fourbar.mjs`、`test/solve-health.mjs`、`test/render-pipeline.mjs`、`test/panel-stacking.mjs`、`test/gear-editor.mjs`、`test/input-gestures.mjs`、`test/direct-link-assembly.mjs` 通過。
- HTTP 瀏覽器：桌面、390 × 844 與 844 × 390 版面；第一課各步驟、播放／暫停、BD 80 → 88 mm 的擺幅比較（52° → 48°）、三種四連桿切換、創意挑戰與歸納收尾；另已驗證先前尺寸修改與重設復原、固定孔解鎖拖曳後復原保留課程、收起編輯面板、角色顯示均操作驗證。
- 瀏覽器錯誤日誌未見 JavaScript error。
- 截圖：`output/teaching-review/phone-landscape.png`。

## 上課前仍應確認

- 自動化瀏覽器等待下載事件逾時，沒有完成下載後重開的端到端驗收；請在學生實際手機瀏覽器確認 JSON 保存及重新開啟。
- 響應式尺寸驗收不等同於實體手機觸控、校園網路或 40 人同時連線測試。
- 教材含 2–3 分鐘錄影口播稿，沒有錄製影片；沒有新增離線快取或 ZIP 啟動包。
- 本次修改保留工作區既有未提交的設計／組立變更，未推送或部署到 GitHub Pages。


## 2026-10-05 四階段課程迭代

- 已新增看懂範例、接好半成品、獨立考驗、變化應用四階段；教案更新為兩節各 50 分鐘。
- 每階段作品及量測紀錄保留於本頁記憶體；可回到課前作品、繼續課程及找回重設前作品。重新整理或關閉前必須下載，不宣稱跨工作階段保存。
- 半成品從已求解的標準範例移除浮桿；使用既有畫桿與吸附功能補接。只在引導練習顯示 C/D 提示，考驗隱藏角色標籤。
- 課程零件盤優先顯示固定支點與連桿，「更多零件」展開全部；離開課程恢復一般零件盤。
- 新測試 `test/fourbar-course.mjs` 驗證真實 Tools 畫桿補接、新桿件 ID、假接點拒絕、整圈求解及草稿隔離；`test/teaching-course-ui.mjs` 驗證 DOM 控制器的切換、重設找回、退出與復原。
- 本輪通過上述新測試及 direct-link-assembly、input-gestures、example-controller、fourbar-lesson、fourbar-measurement、teaching-feedback、test_blocks_schema；語法與 diff 檢查通過。
- **本輪尚未完成瀏覽器畫面驗收**：Windows Computer Use 因无法可靠辨識瀏覽器網址而停止。本文件前段與截圖為上一輪七步版本的驗收，不能視為此次四階段流程的畫面證據。需補驗四階段手機橫直向操作、切換保留作品及下載重開。
- 未推送或部署，未修改求解器或作品格式。
