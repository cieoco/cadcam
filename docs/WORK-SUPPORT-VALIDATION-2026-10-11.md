# 固定／動力支撐驗收

- 範圍與契約：見 SDD-SUPPORT-VALIDATION.md。沒有改寫求解器、作品格式或現有板件幾何。
- 查證翻斗原本就有 Support 與 motorMount.frameBody；修正的是驗證與呈現缺口，不宣稱原本完全沒有機架。
- 新增 support-validation 純函式，由行程驗證、翻斗組立驗證及 UI 共用。ok 表示未檢出宣告矛盾，physicalVerified 始終 false；warnings 不阻止理想模擬，明確 error 會阻止教學任務候選。
- 新增 14 個定向斷言全部通過；全套 Node v25.2.0 / --no-webstorage 為 174/174 通過（output/support-validation/full/results.json）。版本更新及載入圖重生後，另跑 load-graph 測試及 git diff --check 通過。
- Chrome 實際載入單軸翻斗：標頭「可模擬｜實體固定待驗證」；組立可展開查看 Drive/Support 及理想支點診斷。390×844 無水平溢出，展開內容可讀取；已恢復原視窗尺寸，console 無 error。
- 截圖 API 逾時，沒有像素截圖證据；以上瀏覽器驗收以实际操作與 AX/DOM 觀察為準。
- 版本 2026.10.11.1；本輪未 commit、push 或部署。

尚未建立完整剛性支撐鏈證明、實體螺絲鎖固驗證、另一側軸承與負載計算。此輪不把這些未覆蓋項目當成通過，也沒有擅自增加未核對的硬體尺寸。
