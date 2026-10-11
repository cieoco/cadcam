# 首次載入瘦身

## 決策

原本 viewer 是動態載入，但材料行程檢查靜態引用 material-interference，繼而載入整份 Three.js。只為三角化而載入渲染引擎不必要。從既有 r160 抽出 Earcut v2.2.4 與 ShapeUtils（20,378 bytes），保留授權與來源，僅將 Vector2.equals 改為普通點座標比較。材料檢查仍同步且完整執行；沒有跳過檢查或將未完成當成通過。

沒有新增套件、build step、求解器或非同步候選流程。完整 Three.js 等開啟 3D 才載入；錄影套件原本即為動態載入，保持不變。

## 大小與瀏覽器證據

tools/startup-size.mjs 沿靜態 import/export 追蹤，排除 import()，統一 LF 後計 UTF-8 原始碼大小。比較 ba9aa85 與工作目錄：2,905,928 → 1,652,671 bytes，減少 43.13%。這不是 gzip 傳輸量；模組數仍為 140。

test/startup.html 在同源 iframe 載入目前作品，將 Resource Timing 與 load 後兩幀時間呈現在頁面，不是嚴格的可互動時間或冷快取基準。

同機 Chrome/local HTTP 單次觀測（相同翻斗作品）：

| 狀態 | load後兩幀 | 資源數 | 觀測 transfer bytes | Three.js | 錄影套件 |
| --- | ---: | ---: | ---: | --- | --- |
| 原版靜態副本 | 2806ms | 141 | 2950917 | 已載入 | 未載入 |
| 新版首次 | 2764ms | 141 | 1723915 | 未載入 | 未載入 |
| 新版按3D後 | — | 144 | 3153300 | 已載入 | 未載入 |

新版按3D後出現預覽操作提示且 console 無 error。以上時間差很小，不能宣稱明顯加速；共享網路、壓縮與手機效能仍需現場測量。原版副本僅建立首次相依檔案，放在 output/startup-optimization/baseline，不納入提交。

## 回歸

- 三角化與原版比較凹形、多孔、方向及重複終點。
- 首次依賴禁止 Three.js/錄影套件，JS 原始碼上限 1.9MB，保留動態入口。
- 全套 176/176 通過（Node v25.2.0 / --no-webstorage）；含材料干涉與托斗行程回歸。結果 output/startup-optimization/full/results.json。
- 版本 2026.10.11.2。本輪未修改共用版本 token／快取策略；後續若調整，需另驗證跨版本模組一致性。

維護注意：升級內附 Three.js 時同步核對 shape-utils.js；不要在基本2D路徑重新直接引用完整引擎。
