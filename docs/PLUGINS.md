# 外掛（plugin）

外掛是「要用才載入」的功能：入口在「新增 → 外掛」（電腦與手機同一處，沒有開關），程式放在自己的資料夾，打開時才下載，不佔啟動載入量。目前只有「卡榫盒子」。

## 組成

1. 登記：`js/plugins/registry.js` 的 `PLUGINS` 新增一筆 `{id, name, hint, icon, load}`。`load` 只能是 `() => import('./<id>/index.js')`。
2. 資料夾：`js/plugins/<id>/`，入口 `index.js` 匯出 app 要呼叫的函式（卡榫盒子是 `openBoxMaker`）。介面、生成、匯出等程式都放這裡。
3. 指令：`js/blocks/ui-commands.js` 的指令加 `plugin: true`、`group: 'add'`，名稱、圖示、說明取自登記。「外掛」區由 `command-ui.js` 依指令清單填入 `[data-plugin-list]`，電腦與手機共用。
4. 懶載入：app 在使用者點入口時才 `await PLUGINS.find(...).load()`。啟動路徑（`js/blocks/app.js` 的靜態 import）不可直接 import 外掛資料夾裡除保存契約以外的檔案；`test/startup-size.mjs` 會檢查。

## 保存資料契約

作品存檔不能因為外掛沒載入而打不開。規則：

- 外掛產生的資料（例如盒體面板）要能在不開外掛介面的情況下讀取、顯示 3D、匯出 SVG／DXF／製作包。
- 讀寫與尺寸計算所需的最小程式放在外掛資料夾裡名稱含 `contract` 的檔案（卡榫盒子是 `box-maker/box-contract.js`），由啟動程式靜態 import；它要保持小，只做正規化與幾何尺寸，不放預設值表、文字或介面。
- 新資料欄位用版本需求標記（例如 `box-panel-v1`、`tab-nut-sets-v1`）；舊版程式遇到不認得的需求要明確拒絕，不靜默忽略。
- 改契約時舊存檔必須逐字相同地讀、匯出（見 `test/box-maker.mjs`、`test/box-panels-joints.mjs`）。

## 新增外掛的檢查

登記一筆、建資料夾與 `index.js`、指令加 `plugin: true`、執行 `node tools/load-graph.mjs`，再跑 `node test/plugin-box.mjs`（同一型式的檢查）、`node test/startup-size.mjs` 與 `node tools/ui-commands-browser.mjs`。
