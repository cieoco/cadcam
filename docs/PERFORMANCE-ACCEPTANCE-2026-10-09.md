# 手機效能驗收

2026-10-10 使用者決定本輪不做手機效能量測，改以操作功能完整性為重點；本文件保留供日後選用，不再是本輪發布條件。沒有宣稱 OPPO 實測通過。

依 SDD §4.5，實體 OPPO 的量測仍待執行。桌面測試、390×844 操作驗收不能替代此項。

## 手機操作

1. 手機與開發電腦連同一網路，開啟提供的 `test/performance.html` 網址。
2. 在裝置備註填寫完整型號、RAM、Android／ColorOS 版本、瀏覽器版本及螢幕更新率；SoC 若不確定可先留待核對。viewport、DPR 與 user agent 隨紀錄保存。
3. 保持頁面在前景，不錄影、不切換分頁。選「完成版」，按「一鍵執行 F1＋F3 各3次」，約7分鐘。
4. 選「原版1537242」，再執行一次，約7分鐘。兩版使用完全相同的作品 JSON，尺寸、馬達設定與作品指紋一致。
5. 按「下載全部紀錄」，將 JSON 交回本次施工聊天。中途切換頁面或中止會留下 invalid 紀錄，請保留，不只挑最快結果。若手機明顯發熱或其他程式干擾，附註當時情況。

量測不讀寫原本的作品自動存檔；紀錄存在量測頁專用 IndexedDB。不要在測試中操作內嵌設計器。

## 驗收與比較

- 每次暖機10秒後採樣60秒；F1、F3各3次，原版與完成版均執行。
- p95 CPU 合計不超過33.3ms，rAF間隔 p95 不超過50ms；列出大於100ms的停頓。
- 原版已達標時，完成版 p95 增加不得超過 `max(原值×10%, 1ms)`。
- 播放期間局部材料與五金不得反覆重建。需比對每次樣本開始與結束的計數，不能把載入前累計值當作播放重建。
- 原版部分齒輪孔與角碼呈現較少；報告必須列出各版 coverage 差異。不可把 CPU／rAF 當成 GPU 時間或 FPS 保證。

## 開發端重建

在 repository 根目錄依序執行，使用 Node22.14.0；Windows 本機 runtime 位於 `output/framework-stabilization/runtime/node.exe`。

```text
node tools/performance-baseline.mjs
node tools/performance-fixtures.mjs
node tools/load-graph.mjs --check
node tools/performance-phone.mjs
```

最後命令列印可供 HTTP 的專用目錄。只提供該目錄，不將整個 workspace 或基準 archive 開放至區域網路；以電腦的 LAN IP 綁定 HTTP server，手機使用相同 IP 與 port。不要自動修改防火牆。

正式 main／Pages 發布仍待實機 gate；施工分支的 CI 不代表手機效能已驗收。
