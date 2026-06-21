# SDD — 機構積木「滑軌／滑塊」與「線性動力源（活塞）」

> 給接手實作的 agent 的設計規格。對象檔案：**`blocks.html`、`js/blocks/app.js`、`js/blocks/schema.js`**。
> **求解器 `js/multilink/solver.js` 與 compile 層 `js/core/topology.js` 一律不改**——兩者已支援，本案是純
> UI／渲染／存檔層工作。背景與整體願景見 [docs/SDD-KID-BLOCKS.md]、[docs/SDD-MOTOR-REDESIGN.md]。

## 1. 現況（baseline）

`blocks.html`（機構積木）只有轉動副：📌地錨、🔵連桿、🔺三點桿、⚡動力來源（TT馬達 / MG995 伺服）。
底層用多連桿引擎（`compileTopology` + `solveTopology`）。缺「移動副」——無法搭滑塊曲柄／活塞往復。

## 2. 目標（一句話）

新增**移動副**：原子「🟩 滑軌」積木（軌道＋滑塊），並把**線性致動器（活塞）**併入「動力來源」選單，
成為第三種動力。完成後 blocks 能搭出滑塊曲柄等「轉動＋移動」機構。

設計決策（已確認）：① 滑塊＝原子滑軌積木，學生自己搭；② 活塞併入動力來源選單；③ 先做 2D，3D 延後。

## 3. 引擎對應（關鍵，照這個接）

引擎已支援，**直接重用、不改**：

- 被動滑塊步驟 `solver.js:1179`：`slider` = 軌道直線 ∩ 驅動桿圓（line-circle 交點）。
- 線性致動器步驟 `solver.js:1117`：`input_linear`，沿 `ux/uy` 推移。
- 位移來源 `getLinearShift()` `solver.js:204-230`：**`valve_id='1'` 會 fallback 到 `theta`**，
  所以現有 play 迴圈（驅動 `theta`）就能讓活塞動，不必新增驅動變數。
- compile 已支援：被動滑塊 `topology.js:329-348`；由 `slider.isInput` 產生 input_linear `topology.js:262-293`。

## 4. 資料模型（新增 comp 型別 `slider`）

沿用 `js/examples/slider-track.json` 的 `_wizard_data` 形狀：

```
{ type:'slider', id:'Slider<n>', color:'#16a085', sign:1,
  p1:{id, type:'fixed',    x,y},   // 軌道端 A（釘地）
  p2:{id, type:'fixed',    x,y},   // 軌道端 B（釘地）
  p3:{id, type:'floating', x,y},   // 滑塊點（沿軌道滑動）
  lenParam:'SL<n>',                // 保留（被動時驅動桿長由 compile 自動找）
  isInput:true, physicalMotor:'1', // —— 活塞模式才有 ——
  strokeMin:0, strokeMax:64 }      // 行程兩端（mm，與 theta 同座標系）
```

- 被動滑塊：p1/p2 釘地當軌道，p3 由「接到 p3 的連桿（驅動桿）」推著沿軌道走（compile 自動找驅動桿）。
- 活塞：`isInput=true` → compile 改發 `input_linear`，p3 直接被 valve 的位移推動。

## 5. 變更清單

### A. 存檔／分享 — `js/blocks/schema.js`
新增 `normalizeSlider()` 並在 `normalizeSnapshot` 分派（`schema.js:133-136`）註冊 `raw.type==='slider'`。
**不加就會在存檔/載入/分享被丟掉**。保留 p1/p2（強制 `fixed`）、p3（`floating`）、`lenParam`、`sign`、
`color`；輸入模式再保留 `isInput`、`physicalMotor`、`strokeMin/Max`。share-codec（字元白名單）不需改。

### B. 滑軌繪製 — `js/blocks/app.js`
仿 `startDrawLink`/`finishDrawLink`/`drawDrawPreview`（`app.js:723/1018/782`）新增
`startDrawRail`/`finishDrawRail`/`drawRailPreview`，重用 `resolveDrawEnd` 吸附＋lego 對齊。
`finishDrawRail` 建 slider comp（p1=起點 fixed、p2=終點 fixed、p3=中點 floating），端點落在既有接點上
就 `mergePoints`。匯出 `startDrawRail` 到 `window.blocks`。

### C. 2D 渲染 — `js/blocks/app.js`（`draw()`）
`drawSliderTrack(a,b)`（雙線滑槽＋兩端擋塊，灰色系）、`drawSliderBlock(p,dir)`（沿軌道方向圓角方塊）、
活塞模式 `drawPiston(...)`（缸體＋伸桿＋「活塞」標籤，重用 `drawMotorLabel`）。draw 迴圈掃 `comps` 出 slider。

### D. 線性動力源 — 併入動力來源選單
`blocks.html` `#powerMenu` 加第三顆「🟢 線性致動器」→ `pickMotorType('linear')`。`app.js` 放置時目標是
滑塊點 p3：`driveSliderAt(sliderId)` 設 `isInput/physicalMotor/theta=0/strokeMin=0/strokeMax=64`，放完選取
跳行程面板。

### E. 播放 — `js/blocks/app.js`（`play()`）
把 `inputServoRange()` 一般化成 `inputRockRange()`（MG995 回 servoStart/End、輸入滑塊回 strokeMin/Max，
皆回 `{lo,hi}`）。`play()` 偵測到就覆寫 `playPlan={mode:'rock',lo,hi}`，rock 邏輯原封重用。

### F. 行程面板 — `blocks.html` + `app.js`
仿 `#servoEditor`/`updateServoEditor`/`changeServoAngle` 新增 `#strokeEditor`（起點/終點 mm，step 8mm）。
選到「被線性致動器驅動的滑塊點」時顯示，`updateRoleEditor` 一併切換（比照 servo 互斥）。

### 不改動
`js/multilink/solver.js`、`js/core/topology.js`、`js/blocks3d/*`（3D 本輪不動）。

## 6. 逐步施工

- **階段 1｜滑軌（被動滑塊）**：A + B + C（軌道/滑塊）+ 「🟩 滑軌」積木。驗：馬達曲柄→連桿→滑塊往復。
- **階段 2｜線性致動器（活塞）**：D + E + F + C 的活塞外形。驗：活塞直線推拉驅動連桿；存檔/分享 round-trip。
- **階段 3（未來）**：滑塊/活塞 3D 實體；`point_on_link` 耦合曲線點（需另接 compile）。

## 7. 驗證（本機 `python -m http.server 8000` → `blocks.html`）

1. 點「🟩 滑軌」拖出軌道（兩端自動釘地），中間出現滑塊方塊。
2. 地錨+連桿+動力來源做曲柄；🔵連桿把曲柄端接到滑塊點；▶ → 滑塊沿軌道往復、死點 banner 正常。
3. 動力來源 →「線性致動器」→ 點滑塊點 → 缸體+活塞外形與行程面板；調行程，▶ → 滑塊在行程內直線來回。
4. 存檔/開啟、分享貼回 → slider（含 isInput/行程）正確還原。
5. 回歸：四連桿、三點桿、MG995/TT 不受影響；手機可拖、面板不疊。
