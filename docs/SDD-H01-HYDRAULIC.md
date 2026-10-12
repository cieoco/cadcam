# H01：兩端鉸接針筒與單臂抬升

功能先在本機實作與驗收，後續依使用者授權提交及推送。不以動畫順暢表示加工、干涉或承重通過。

## 擴充入口與資料契約

- `js/core/syringe.js`：獨立 `syringe`，不是改名的固定滑軌。A／B 各保存 `{componentId,u,v}`，u 沿宿主第 1→2 孔，v 為左法線，單位 mm。宿主為 anchor、bar 或 triangle（包含既有多邊形板的 triangle 資料形式）；桿件中段接點以兩個固定距離附著宿主。
- `compileTopology` 把針筒編成暫時的固定距離約束，交由既有 bodyJoint 求解。這些派生桿／點不寫入作品。`AB=Lmin+s`，不指定手臂角度、不修改原桿長。A／B 都可以在活動宿主上。
- `spec`：name、capacityMl、outerDiameter、bodyLength、rodDiameter、lmin、stroke、calibrated；`extension` 是 s，Lmax 只由 lmin+stroke 計算。外形值為示範（10mL、外徑16、筒長70、推桿寬6、Lmin95、S40），不是廠商規格。
- 接点和規格保持小數 mm，不套8mm格線。spec、refs、extension、branch 由 schema 正規化，隨既有 snapshot／JSON／分享保存。接受的活動接點座標也保存為求解種子，以重開後維持同一裝配分支。
- `syringe-operations.js` 是無 DOM 的候選、行程、採樣與量測入口，UI 共用。可傳入既有旋轉驅動的凍結角度；沒有另一套 AI 求解器或 MCP 服務。
- 規格修改先留在對話框候選中；確認採正常 undo／rebuild／save，取消不改作品。既有產品只有 undo，沒有新建 redo 系統。

## 操作

1. 本機 HTTP 開啟 `blocks.html`，範例 → 實戰：升降與直線運動 → H01。
2. 上方短列用 s 滑桿觀察 AB、臂角、C 座標；播放以 **8 mm/s** 往返，依時間計算，不依幀率。既有旋轉方向／角度欄不混入液壓輸入。
3. 「針筒設定」更改臂長、A／B 宿主及局部孔位。H01 的 A 位於機架 HA→O，u=0 在 HA，u=80 在 O；B 的 u 從 O 沿臂向 C 量。
4. 只改 B=60、80、100 mm。點「掃描候選全行程」，再確認或取消。不可達輸入會拒絕；滑桿回到實際接受的 s。
5. 「針筒規格與實測校正」「加工設定」為收合區。尺寸一改就取消已校正勾選，必須重新確認實測；勾選本身不代表工程驗證通過。
6. 修改前後分別存檔／改名。分享用同一 snapshot。刪除針筒在設定中，可復原；刪掉宿主會得到無效接點診斷，重新指定 A／B 後再解。
7. 要自己新增：先建立機架與活動臂，再「新增 → 動力來源 → 10cc液壓針筒」，點 A、B，確認參數。可取消選點。點桿件使用中心線位置，板件使用輪廓內的局部位置。

## H01 教學與三組對照

O=(0,0)，A=(0,-80)，OC=180，Lmin=95，S=40。正角逆時針，畫面 y 向上。

| B 距 O | s=0 臂角 | s=40 臂角 | s=40 C 座標 mm |
|---|---:|---:|---|
|60 mm|-5.829°|58.956°|(92.826,154.219)|
|80 mm|-17.153°|25.077°|(163.034,76.289)|
|100 mm|-27.448°|6.550°|(178.825,20.531)|

三組只改 B，均以0.5mm、含端點的81點採樣驗證。這是離散幾何採樣，並非連續干涉或受力證明。任務：推動並找行程 → 預測及比較孔位 → 保存前後版本，記錄改變／預測／觀察與實物差異。教學任務放在設定中的收合區，畫布僅保留必要讀值。

## 求解邊界

- 使用既有 **0.001 mm** 距離容差；三組採樣的最大 AB 殘差 **0.0000013691103788460168 mm**，低於本輪0.1mm目標。
- 帶入上一有效姿勢作求解種子，並拒絕 B 宿主第1孔相對 AB 的有向側別翻轉。保存接受姿勢，以供重開選同一分支。
- 拒絕無解、超行程、無效宿主、同一剛體兩端、未解完的接點。H01 近奇異檢查以 B 宿主第1孔到作用線AB小於0.5mm為界；不是任意多關節機構的完整 Jacobian 奇異分析。
- 播放前全行程採樣；不通過不播放。手動可探索有效段，失敗仍保留原 s 與姿勢。
- 軌跡不套旋轉 theta 掃描；本輪顯示 C 當前座標。水量耦合、壓力、摩擦、氣泡、漏水、承載及全行程實體干涉均未驗證。

## 加工資料

`syringe-manufacturing.js` 重用既有 link／plate 幾何及 SVG／DXF 序列化。A／B 派生孔位由同一 refs 轉換，孔徑引用 `fabrication.export`；座板幾何同時供畫面虛線輪廓和輸出。新 `fabrication.syringeMount` 保存間隙、留邊、外夾縱向孔距；座板厚度引用 cnc.stockThicknessMm，活動臂與機架厚度沿用各自 stock（未設定時為既有4mm預設）。不重複建立另一份孔徑／板厚來源。

H01 輸出機架側條2片、活動臂1片、筒身托架側板2片、推桿轉接側板2片；每種輪廓一份SVG／DXF，數量與厚度另標。製作包亦內嵌可下載檔與孔心／孔徑表。檔案為1:1mm，DXF INSUNITS=4。針筒、水管、角碼、軸件、墊片、夾具列購買件，沒有把針筒外形當板材切割。

座板是**外夾式概念孔位圖**，托架繞A、外夾推桿尾端的轉接件繞B；不可鑽穿盛水筒身。底座、角碼孔位、雙側支架間距與外夾件尚待實測；這輪沒有聲稱已有完整可施工裝配。輸出帶警告，即使勾選針筒已校正，也不會自動變成「加工就緒」。

液壓輸出目前針對**目前設計的同平面** anchor／bar／triangle／syringe，遇跨模組或合成板等尚未涵蓋特徵會拒絕，避免靜默省略。3D沿用現有板件預覽，新針筒、托架與附加孔未完整呈現，顯示常駐限制提示；組立3D液壓播放、液壓MP4未支援。

## 實物加工前需量測

- 品牌／型號、筒身外徑與可夾持區長度、筒身總長、法蘭／接口外形。
- 推桿杆身寬與尾端法蘭尺寸、外夾轉接件形狀與孔位。
- 實際托架裝好後的最短A–B孔距、使用行程（避開觸底與拔出）、兩端轉軸中心到夾持面的偏移。
- 板厚、軸／螺絲孔徑、配合間隙、束帶或夾具螺絲孔距、角碼孔距、雙側支架淨距與隔圈。
- 先空載慢推全行程查碰撞，接水路排氣，再逐步做實物載重測試；不要由幾何力臂推算未量測的承重。

## 驗收與修改檔

實際結果：全套 Node **182／182** 通過；液壓定向測試 **12／12** 情境通過；實際瀏覽器整合 **20／20** 通過，最後一輪無 console error。另以390×844驗收手機孔位修改、行程端點、控制列與畫布，並操作桌面3D切換確認限制提示。`node tools/load-graph.mjs --check` 與 `git diff --check` 通過。

執行方式（PowerShell）：

```powershell
$env:NODE_OPTIONS='--no-webstorage'
node tools/test-runner.mjs --output output/hydraulic-acceptance
node tools/test-runner.mjs --output output/hydraulic-directed --test test/syringe.mjs --test test/fabrication-profile.mjs
```

瀏覽器開啟 `http://localhost:8000/test/hydraulic-ui.html`，按「執行液壓 UI 驗收」。它用隔離的 gripperPilot 工作階段，不覆蓋使用者自動存檔；尚未測試實體手機硬體／真實針筒。

- 新增：`js/core/syringe.js`；`js/blocks/hydraulic-example.js`、`syringe-operations.js`、`syringe-ui.js`、`syringe-manufacturing.js`。
- 擴充：`core/topology.js`、`multilink/solver.js`（僅含新類型才走擴充）；`blocks/part-types.js`、`schema.js`、`fabrication-profile.js`、`exporters.js`、`examples.js`、`app.js`、`blocks.html`。
- 測試：`test/syringe.mjs` 12組情境（多點掃描、反向、失敗不變更、活動A、偏置板件B、mm精度、時間播放、保存分享、輸出一致性）；`test/hydraulic-ui.html`／`hydraulic-ui-browser.js` 在真實頁面執行20項UI驗收；`test/manifest.json` 登錄新測試，`fabrication-profile.mjs` 更新新欄位預期。
- 同步 README；`tools/load-graph.mjs` 生成載入token與19頁importmap（其餘教學頁只更換生成載入映射）。
- 瀏覽器驗收包含390×844手機、桌面、3D切換提示。UI存檔重開走正式snapshot／正規化；下載SVG/DXF/HTML由實際匯出入口取得，測試頁攔截下載以驗內容。
- 證據：`output/hydraulic-ui/results.txt`、`desktop.jpg`、`mobile.jpg`；Node結果在 `output/hydraulic-acceptance/results.json`，末次定向測試在 `output/hydraulic-directed/results.json`。Node25預設webstorage會讓既有測試的globalThis.localStorage檢查拋SecurityError；驗收執行時設 `NODE_OPTIONS=--no-webstorage`，不改產品功能來繞過。
