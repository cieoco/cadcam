# 交接紀錄 — blocks 架構優化（feat/blocks-arch）

> 給接手的 AI 助手 / 開發者。搭配 `docs/SDD-BLOCKS-ARCHITECTURE.md`（總工作清單）一起看。
> 這份只記「目前做到哪、怎麼做的、下一步怎麼接」。

## 0. 一句話現況

在 `feat/blocks-arch` 分支上，已完成 SDD 的 **Phase 1**（draw build/update 分離）、
**Phase 3 模組切分全部**（render / state / panels / tools / input 五個模組抽出）、
**Phase 2 兩刀**（part-types.js 型別表：點 key + owned-param 走表），
以及 **Phase 4 的軌跡快取鍵**（geomVersion 取代每幀 JSON.stringify）。
**已 rebase 到 `origin/main`（含遠端 3D slider 那筆 84c03b8）並 push。**
Phase 4 痛點 E（軌跡 cache key）已做、痛點 D（範例兩套）已 audit 結論不動。
SDD 重構本身已收斂；**目前主線已轉向新方向**（見下節 0.5）。
（SDD Phase 2 的 draw 繪製分派尚未做，現在正好搭著新機件一起把繪製/求解分派長成登錄表。）

## 0.5 新方向：可擴充「基礎機件」（齒輪已落地）

使用者目標升級為**機構繪製＋模擬系統**，未來會陸續加入大量基礎機件（齒輪、凸輪、齒條、彈簧…），
**每個機件連求解器一起進來**。重構是 MVP，確認可行後開始正式發展「機件外掛」架構：
每加一個機件＝加一個自帶 **{資料結構 + 畫法 + 求解步驟}** 的描述，不改核心（同 `MECHANISMS` registry 精神）。

**齒輪（嚙合對 A）已做完 slice 1a**（commit `fc2184f` + 修正 `55fa74c` 嚙合相位、`54ddb87` 螺栓孔）：
- 新 comp type `gear`：`p1`=中心（fixed/motor）、`p2`=輪緣輸出銷；欄位 `radiusParam`/`teeth`/`mesh`/`phase`。
- 運動學：從動輪角 = −(R_driver/R_driven)·motorTheta（外嚙合反向）。已 Node 驗證 0.75 比正確、isValid。
- **關鍵踩雷**：blocks 實走 `solveBodyJointTopology`（`solver.js:971` 因 `_wizard_data`+`bodyJoint` 委派過去），
  不是主 step-walker。齒輪在那裡用 force-set（與旋轉曲柄同位置）。**schema.js 也要加 normalizeGear**，
  否則 gear comp 載入被當不支援零件略過。
- 繪製：`createGearPath`（既有漸開線工具 `js/utils/gear-geometry.js`）；嚙合相位 δ 用不變量
  qA+qB=(NA·βA+NB·βB)/2π 補到 0.5；輪緣銷畫成螺栓孔（節點繪製略過該 id）。
- 範例：`BLOCK_EXAMPLES` 的「齒輪對：嚙合傳動」。瀏覽器已驗證：嚙合、反向、比例、外觀皆正確。

**為齒條（B）留位**：核心抽象「齒輪有效角 = sign·driverAngle·ratio + phase」；slice 1 輸出端是旋轉銷，
齒條只是換成直線位移（disp=θ·R，照搬 input_linear + `createRackPath`）。

**下一步 slice 1b（進行中）**：放置 UI——齒輪鈕/addGear、選取+改半徑/齒數、宣告嚙合（就近自動相切）、
把連桿接到螺栓孔讓齒輪真的驅動機構。之後 slice 2：把 draw/solver/compile 的型別分派升級成登錄表
（PART_TYPES.draw/compile + STEP_SOLVERS），讓「加機件＝加表項」。詳見 plan 檔
`~/.claude/plans/refactored-sniffing-narwhal.md`。

## 0.6 齒輪安裝模型：定案「方案乙」＋「要馬達才轉」（已在 main 上）

> 這批在 `feat/blocks-arch` **合併進 main 後**、直接在 `main` 上續做（使用者明確要在 main 往下走）。
> commit `b49e55d feat(blocks): gears mount like links — float on drop, motor to spin`，item A 為其後一筆。

**安裝模型定案＝方案乙（比照桿件）**：齒輪對放下是「浮動未固定」，由使用者把**中心拖去地錨/接點**
或用角色面板「設地錨」才接地；否決了甲（放下即接地即轉）。

- **求解現實（決定了乙可行、且不碰求解器）**：blocks 走 `solveBodyJointTopology`
  （`solver.js:70`，由 `:996` 因 `_wizard_data && bodyJoint!==false` 委派）。齒輪在 `:261-280`
  force-set：**中心是「已知點」**（grounded 才有 `points[center]`、才畫得出來），輪緣銷 = center+r·dir(角)。
  → 「只釘一端、整對擺動」是**欠定**、現有 solver 放不了自由中心；乙 的「**釘兩端**」剛好落在
  現有能力內，零求解器數學改動。
- **編輯期可見**：`solveFrame()`（`app.js:328-330`）用 `pointCoords()`（原始座標）打底再覆蓋解出值，
  所以浮動齒輪/中心節點本來就畫得出來、拖得動——item「可見性」免改。
- **接地靠智慧合併**：`core/topology.js:44-99` 按 id 合併、`fixed` 壓過 `floating`。所以齒輪中心
  拖去跟地錨**共用 id** 就被當 fixed → 產 `ground` step → 接地。齒輪自己那份 `p1.type` 是不是 floating 不影響。

**「要馬達才轉」（與桿件一致）**：

- `solver.js:264-280` 齒輪 force-set **拿掉 `|| '1'` 自動退回預設馬達**：驅動輪中心沒 `physicalMotor`
  ＝靜止接地輪（銷停在放置角 `atan2(p2-p1)`、theta 無效）。有馬達才依 theta 轉（`'1'` 解析為播放角）。
- 馬達可放齒輪中心：`handleMotorOnNode` 新增分支 → `driveGearAt`（`app.js`）。它沿 `mesh` 找到嚙合鏈
  的**根驅動輪**，把該中心 `freezePointAtDisplay`+`setPointType('fixed')`+`physicalMotor='1'`
  （一個動作順手固定樞軸，與 `driveBarAt` 同理）。「拿掉馬達」走既有 `removeMotorAtPoint`（依 id）自動可用。
- **持久化**：`schema.js:35 normalizePoint` 保留點上 `physicalMotor`，故重載/分享/undo 後馬達仍在。
  注意 `normalizeGear` **不**保存 gear 層 `motorType`，所以 driveGearAt 不存它（齒輪一律連續旋轉、無伺服擺動）。

**item A：拖曳維持嚙合**（`input.js` onDragMove 齒輪分支；注入 `pointIsGround`）。中心距 D=Ra+Rb 是死的，故拖中心時：
夥伴**已接地**→本中心繞夥伴中心半徑 D **公轉**（只改方位，之後就地設地錨即可保持咬合）；夥伴**未接地**→
**整對平移**；**單顆**→剛性平移（銷 p2 跟著走，不與齒形分離）。

**仍未做 / 已知坑**：
- 拖去**合併到不在嚙合圓上的地錨**會脫咬：已加**防呆紅環**——`gearMeshOff(c)`（`app.js`）偵測「兩中心都接地但
  中心距≠Ra+Rb（tol 1.5mm）」，繪製時給齒輪紅色虛線環＋tooltip 提示。**只警告、不自動搬錨點**（避免跟使用者較勁）。
  注意：改齒數/模數走 `syncGearMesh()` 會自動 re-tangent，故那條路不會殘留脫咬（但會默默搬動已接地的從動輪錨點）。
- 馬達一律記在嚙合鏈**根驅動輪**：點到從動輪中心放馬達，馬達也會落到驅動輪（物理輸入端），非 bug。
- 齒輪馬達**無伺服擺動**（TT/MG995 都連續轉）。
- slice 2「draw/solver/compile 型別分派登錄表化」**已起步（slice 2a）**：齒輪繪製抽成
  `drawGearPart(c, pts)` + `PART_DRAW = { gear: … }` 分派表（`app.js`，draw() 內改成
  `S.comps.forEach(c => PART_DRAW[c.type]?.(c, pts))`）。**純抽取、行為位元級不變**（同碼、同呼叫點、同 z 序）。
  登錄表放 app.js（DOM 層）而非純 part-types.js（不碰 DOM 邊界）。**其餘型別（bar / triangle / slider / 馬達）
  逐刀填表，每刀請瀏覽器驗證外觀/互動**。compile（topology.js）與 solve（solveBodyJointTopology 的 force-set）
  的型別分派尚未表化。

## 1. 分支與 commit

分支：`feat/blocks-arch`（已 rebase 疊在 `origin/main` 的 `84c03b8 Add 3D slider rail preview and frame handle` 之上，已 push 並設好 tracking）。

```
acc931c refactor(blocks): route owned-param cleanup through part-types table
54eb38a refactor(blocks): add part-types table, route point-key enumeration through it
f4b170b refactor(blocks): extract pointer/gesture interactions to input.js
3990de7 docs(blocks): update handoff for tools.js + rebase onto origin/main
9ff86f4 refactor(blocks): extract tool-mode interactions to tools.js
e399297 docs(blocks): add handoff record for blocks architecture refactor
425dc01 refactor(blocks): extract editing panels to panels.js
cdae546 refactor(blocks): hoist shared editing state into state.js (S object)
c5c1092 refactor(blocks): extract SVG drawing primitives to render.js
a3892f1 perf(blocks): split draw() into build/update to stop per-frame SVG teardown
84c03b8 Add 3D slider rail preview and frame handle   ← 遠端基底（rebase 時手動併進重構）
```

> rebase 衝突重點（已解）：`84c03b8` 把舊 `drawGround`(地板基線) 改名 `drawGroundBaseline`
> 並新增依賴 app 狀態的新 `drawGround`(機架連接線)＋`drawFrameHandle`＋`S.dragFrame`。
> 純基線基元隨重構搬進 render.js 改名 `drawGroundBaseline`；機架兩函式與 `dragFrame`
> 留 app/state（`S.dragFrame` 已加入 state.js）。

`docs/SDD-BLOCKS-ARCHITECTURE.md` 與本交接檔均已入版控。
（`.claude/` 是未追蹤的本機設定，**不要** commit。）

目前 `js/blocks/` 行數：app.js 1631（原本 ~2500）、tools.js 441、input.js 318、render.js 292、
model.js 180、examples.js 149、view.js 142、panels.js 108、motion.js 70、storage.js 61、state.js 58、
part-types.js 34。

## 2. ⚠️ 驗證狀態（重要，先讀）

**所有改動只經過 `node --check` 語法檢查 + grep / 依賴對照驗證；環境開不了瀏覽器。**
（專案沒有 test runner——驗證一律是人工開 app 操作。）

進度（使用者回報）：
- `perf split → tools.js`（含 render/state/panels）、`input.js`、part-types 兩刀
  皆已**經使用者在瀏覽器實測 OK**。

附帶修了一個既有 bug（非重構造成，與 84c03b8 前邏輯一致）：
- **8d8d216 改長度不同步**：改桿件/三點桿/滑軌長度時只更新元件自己那份共用接點座標副本，
  已連接（共用接點）的會看似沒變、要播放才更新。改用 `updatePointCoordsById`（更新所有副本）。
  **連桿 / 三點桿 / 滑軌三案例使用者皆已在瀏覽器實測 OK。**

驗證方式：`python -m http.server 8000` → 開 `http://localhost:8000/blocks.html`，跑第 6 節的黃金流程。

## 3. 每個 commit 做了什麼 + 用的模式

### d8f8c44 — Phase 1：draw build/update 分離（效能）
播放時原本每幀 `while(svg.firstChild) removeChild` 重建整棵 SVG。改成兩條路徑：
- `draw()`（結構變更走）：建場景，並為三角板/連桿/馬達/節點各註冊一個 `(pts)=>更新幾何`
  的閉包到 `frameUpdaters`；滑軌移進專屬 `sliderLayer`，繪製碼抽成 `drawSliders()`。
- `renderFrame()`（**只有 `play()` 迴圈呼叫**）：只重解 + 跑閉包就地改 `d/cx/transform`，不拆 DOM。
- 抽出共用 helper `solveFrame()`（解一幀）、`computeMotorRotDeg()`（馬達朝向）。
- 無效（解不出）的元素改「建好但隱藏 `display:none`」而非「不畫」，像素一致。

### 4834782 — render.js：SVG 繪製基元
10 個純繪製函式（drawGround / drawTTMotor / drawMG995Servo / drawMotorLabel /
drawMountLabel / drawSliderMountHole / drawSliderTrack / drawSliderTravelMarks /
drawSliderBlock / drawPiston）搬到 `render.js`，app 改以 `Render.*` 呼叫。
- render.js 只 import view.js（TX/TY/barHullPath/getScale）。
- 兩個對 app 的依賴用 **`Render.init({ svg, onNodeDown })` 注入**（在 app 的 `init()` 裡呼叫）。

### dda9234 — state.js：共用狀態物件 S（**Phase 3 的關鍵基礎**）
把跨模組共享的可變狀態收進 `state.js` 的單一物件 `S`，全檔以 `S.xxx` 存取（509 處改名）。
- **為什麼用一個物件**：ES module 具名匯出是唯讀 live binding，匯入端不能重新指派
  （`S.comps = …` 可以，`comps = …` 不行）。收進物件後，各模組才能共讀共寫同一份狀態。
- **S 內含**：comps / topo / compiled / counter / theta / selected{Link,Triangle,Node,Slider}Id /
  drag{Id,LinkId,LastWorld} / snapTarget / preDragSnap / triSide / placingMotor / pickBars /
  pendingMotorType / drawing{Link,Triangle} / drawActive / drawStart / drawPreview /
  drawStartNodeId / drawKind / triangleStage / trianglePoints / trianglePreview /
  undoStack / autosaveTimer。
- **仍留在 app.js 的 local 狀態**（render/播放迴圈/3D 內部，待各自模組抽出時再搬）：
  `raf` / `lastSolved` / `prevSolved` / `trajectoryCache` / `viewer3D` / `view3DActive` /
  `lastModelInputs` / `frameUpdaters` / `sliderLayer` / `recountBanner` / `playPlan` / `playDir`。

### 80bdf56 — panels.js：編輯面板呈現
9 個「讀 S + 寫 DOM」的面板函式搬到 `panels.js`：renderLenEditor / setLenButtonTitles /
nodeRoleLabel / renderNodePosition / renderTriValue / updateZliftButtons /
updateServoEditor / updateStrokeEditor / updateRoleEditor。app 端 23 處改 `Panels.*`。
- 跨檔 helper 用 **`Panels.init({ pointCoords, sliderMountInfo, roleLabel, triParamFor,
  hasPoint, motorBarForCenter })` 注入**。
- 滑軌細項面板（綁滑軌幾何/控制器）**暫留 app.js**：setSliderDetailRows /
  renderSliderDetails / renderSliderBaseButton + 幾何 helper（railLength / sliderBodyLength /
  sliderCarrierLength / sliderRailOffset / sliderTravelStart / sliderTravelEnd /
  sliderProjectedDistance / normalizeSliderRange）。

### 9ff86f4 — tools.js：工具模式互動（Phase 3 後半 / 5a）
21 個「工具模式」函式搬到 `tools.js`：startDrawLink / startDrawRail / beginDraw / exitDrawLink /
nearestNodeId / resolveDrawEnd / linkLenLabel / drawDrawPreview / startDrawTriangle /
exitDrawTriangle / resolveTrianglePointAt / resolveTrianglePoint / resolveTriangleBaseEnd /
legoLength / resolveTriangleThirdPoint / drawTrianglePreview / confirmTriangleBase /
finishDrawTriangle / finishDrawLink / finishDrawRail / convertLinkToSlider。
- import 純模組：`{ S }`、`* as View`（W/H/TX/TY/barHullPath/worldFromScreen）、`* as Model`（mergePoints）。
- 重宣告純常數（與 app.js 同值）：SVG_NS / LEGO_STEP / LINK_DEFAULT_LEN / snapLego / roundMm。
- **`Tools.init({...})` 注入** 17 項 app 動作 / 查詢：svg / draw / rebuild / pushUndo / pause /
  cancelMotorMode / deselectLink / selectLink / selectSlider / setBanner / clearBanner /
  worldFromEvent / pointCoords / nearestDisplayToPoint / snapWorld / mobilePrompt / promptText。
- app 端外部呼叫改 `Tools.*`（exitDraw* / drawDrawPreview / drawTrianglePreview / finishDraw* /
  nearestNodeId）；`window.blocks` 的 startDraw* 與 convertLinkToSlider 改指 `Tools.*`，HTML onclick 不動。
- export 只開外部會用到的 11 個；其餘（beginDraw / resolve* / legoLength / linkLenLabel /
  confirmTriangleBase / finishDrawRail）維持模組內部不 export。

### f4b170b — input.js：指標 / 手勢互動（Phase 3 模組切分收尾 / 5b）
搬移 8 個函式：startFreeLinkDrag / onFrameHandleDown / onNodeDown / onDragMove /
commitDragUndo / onDragEnd / abortSingleDrag / endPointer，加上 module 狀態 `activePointers`
/ `pinchState`，以及原 app.js 檔尾那批 `svg.addEventListener`（背景取消選取 / pinch 雙指縮放平移 /
滾輪縮放 / 手機 capture 階段接點優先命中 / 畫桿・三點桿起點 / 右鍵確定）。
- **事件監聽改在 `Input.init()` 內掛載**（取代原本 module 頂層的側效果）；時序仍在第一次 draw
  之前（app.init() 內呼叫），行為不變。listener 掛載順序原封不動。
- import 純模組 `{ S }` / `* as View`，並呼叫 `* as Tools`（畫圖收尾 / 命中 nearestNodeId）、
  `* as Panels`（updateRoleEditor）。`NODE_TAP_PX` 重宣告（與 app.js 同值）。
- **`Input.init({...})` 注入 25 項** app 動作 / 查詢：svg / draw / rebuild / pause /
  cancelMotorMode / deselectLink / selectLink / worldFromEvent / pointCoords / mobilePrompt /
  snapshotStr / updateUndoBtn / nearestDisplayTo / nearestDisplayToPoint / movePointById /
  updatePointCoordsById / recomputeLengths / mergePoints / isFreeLink / freeLinkForPoint /
  fixedLinkFor / inputCrankMovingEnd / handleMotorOnNode / setSliderDetailRows / frameNodeIds。
- **交叉依賴（已處理）**：`onNodeDown` 搬走後，app 端 node pointerdown 改 `Input.onNodeDown`、
  free-link 拖曳改 `Input.startFreeLinkDrag`、機架把手改 `Input.onFrameHandleDown`，
  且 `Render.init({ svg, onNodeDown: Input.onNodeDown })`（滑軌固定孔互動的來源）。
- onFrameHandleDown 是 84c03b8 新增、doc 原清單未列，但同屬拖曳起點、共用 drag 生命週期，
  一併搬入並 export。export 面：startFreeLinkDrag / onFrameHandleDown / onNodeDown / init。

### 54eb38a — part-types.js：零件型別表（Phase 2 第一刀 / 痛點 C）
新增 `js/blocks/part-types.js`，宣告 `PART_TYPES`（bar / triangle / slider / anchor 各自的
`pointKeys`）＋ `ALL_POINT_KEYS`（聯集）＋ `pointKeysFor(c)`（已知型別走表、未知型別回聯集後備）。
- 把原本散落兩處的扁平點 key 清單收斂到表：model.js 刪 `const POINT_KEYS`、6 處改 `pointKeysFor(c)`；
  app.js `frameNodeIds` 刪 `FRAME_POINT_KEYS`、改 `pointKeysFor(c)`。
- **行為等價**：各迴圈本就 `if (c[k] && c[k].id …)` 守門，型別 pointKeys 與實際建立 key 一致
  （已對 examples.js / 各建立點核對；anchor=p1 / bar=p1,p2 / triangle=p1,p2,p3 / slider=全部）。
- **區分兩種 type**：元件型別 `c.type`（本表 key）vs 接點角色 `point.type`（fixed/floating/motor/
  linear/ground，非本表）。後者那批 `=== 'fixed'` 之類**不是**型別表要收的東西。
- 後續可漸進把更多 `c.type` 分流掛進表項（draw 的 build/update 分派、長度、預設角色…），
  但 draw 分派較大且和 render/play 綁緊，要小心、分刀做、逐刀瀏覽器驗證。

### acc931c — part-types 第二刀：owned-param 清理走表
型別表每筆加 `paramProps`（元件上存著 topo.params key 的欄位名）＋ `ownedParamKeys(c)`
（取出實際 key 字串）。bar/slider=['lenParam']、triangle=['gParam','r1Param','r2Param']、anchor=[]。
- app.js `deleteSelectedPart` 移除兩條硬寫型別分支；tools.js `convertLinkToSlider` 的
  `delete …[c.lenParam]` 也改走 `ownedParamKeys`。至此 owned-param 清理無硬寫型別分支。
- 已核對：comp 上唯一存 topo.params key 的欄位就是 lenParam / gParam / r1Param / r2Param，故等價。

### 475baf4 — Phase 4 痛點 E：軌跡快取鍵改結構版本號
`getTrajectoryData()` 原本每次（含每個播放幀）`JSON.stringify(toSnapshot(...))` 當快取鍵，
零件多時字串化本身是負擔。改成整數版本號 `geomVersion`：rebuild() 與 toggleTracePoint() 各 +1，
比對時只是 `=== `。正確性論證：軌跡只取決於 `S.compiled` 與 `tracePoint`，前者只在 rebuild 變
（所有幾何/拓撲/參數編輯，含 applySnapshot 的 undo/載入/分享，都 funnel 過 rebuild），
後者只在 toggleTracePoint 變——兩處都 +1，故版本號是完整正確的失效訊號。
（附帶修正：zlift/伺服角等不影響軌跡 locus 的改動，舊 stringify 會誤觸重算，現在正確地略過。）

## 4. 既定模式（接手請沿用）

1. **一個模組一個 commit**，每步 `node --check` + grep 驗證後再進下一步。
2. **依賴注入**：被抽出的模組 `import { S }` 直接共享狀態；其餘跨檔 helper 用
   `Module.init({...})` 注入（render.js / panels.js 已示範）。模組內以 module-level
   `let` 宣告 + init 內解構賦值，**函式本體一字不改**地照搬。
3. **函式本體照搬、零行為改變**。任何外觀/互動差異都視為回歸 bug。
4. 改名/搬移用小 Python 腳本做 word-boundary 取代，並注意：屬性存取（`x.comps`）、
   spread（`...comps`）、物件鍵（`theta:`）的安全處理（dda9234 的腳本可參考做法）。

## 5. 下一步：Phase 2 / Phase 4（模組切分已全部完成）

### 5a. tools.js — ✅ 已完成（9ff86f4，已瀏覽器實測 OK）
### 5b. input.js — ✅ 已完成（f4b170b，**尚未瀏覽器實測，請優先驗證**，見第 2 節清單）

### 5c. SDD Phase 2：part-types 型別查表
- 第一刀（點 key 走表）✅ 已完成（54eb38a）。
- 第二刀（owned-param 清理走表）✅ 已完成（acc931c）。見第 3 節。
- **其餘（下一步）**：把更多 `c.type` 分流逐步收進表。下一個 candidate 是 **draw 的繪製分派**
  （`draw()` 內依 type filter 再各自畫：triangle / slider / bar / 馬達；build/update 兩條路徑），
  這是痛點 C 最大塊但**也最risky**——和 render.js build/update 與 play 迴圈綁緊，
  **務必分小刀、每刀瀏覽器驗證四種零件外觀/互動**。其餘 `.type ===` 多是「挑某型別來做事」的
  filter/find（非多型分派），不必硬塞進表。注意分清元件型別 `c.type` vs 接點角色 `point.type`。

### 5d.（收尾）SDD Phase 4
- 痛點 E（軌跡 cache key）✅ 已完成（475baf4）：`getTrajectoryData()` 改用結構版本號 `geomVersion`
  （rebuild / toggleTracePoint 各 +1），取代每幀 `JSON.stringify` 整份快照。見第 3 節。
- 痛點 D（範例兩套）✅ 已 audit，**結論：不統一、維持現狀**（程式碼不動）。理由：
  - 兩套互不相交：`BLOCK_EXAMPLES`（→ 只 app.js / blocks.html）vs `EXAMPLE_TEMPLATES`（→ 只 ui/wizard.js /
    multilink wizard）；範例集不重疊、消費者不重疊、無跨工具載入——**沒有實際重複痛點**。
  - 格式需求本質不同：blocks 只需 `comps`（載入即重編譯）；wizard 需整包預編譯 `steps/parts/_templateMeta`
    + lazy JSON。硬統一＝增加跨工具耦合、打破 blocks 自成一格的邊界，換不到實質好處（YAGNI）。
  - 唯一共同子結構是元件陣列（blocks `comps` ≈ wizard `_wizard_data`）；未來若真要單一範例服務兩邊，
    那是接縫處，但**現在不需要動**。（對應 SDD §7 open question #3，視為已回答。）
- **其餘**：render/播放迴圈/3D 內部狀態的歸屬、文件對齊等收尾，見 SDD（無急迫性）。

> 提醒：再往下做任何一步之前，**先把 input.js 在瀏覽器實測過**（第 2 節清單），
> 避免把後續整理疊在未驗證的互動層上。

## 6. 黃金驗證流程（每個模組抽完都跑一遍）

`python -m http.server 8000` → `http://localhost:8000/blocks.html`：
1. 載入每個範例（📘 範例下拉）→ ▶ 播放 → 暫停。
2. 拖曳節點；拖近另一接點看**吸附綠圈 + 放開合併**。
3. 選連桿改長度（−/＋）、選三點桿切邊（底/邊1/邊2）改長度、選滑軌。
4. 選接點 → 角色面板（變自由/設地錨/拿掉馬達）、**設軌跡點**看軌跡線、X/Y 微調。
5. 動力來源：TT馬達整圈轉；MG995 → **伺服角度面板**來回擺；線性致動器（放滑塊上）→ **行程面板**。
6. 疊放上移/下移、🗑刪除、↩復原、💾存檔/📂開啟、🔗分享連結貼到新分頁還原、3D 預覽開著播放。
7. **手機/窄視窗**：零件盤在底部、播放順暢（Phase 1 的重點）。

## 7. 紅線（務必遵守）

- **不改求解器**：`js/multilink/solver.js`、`js/core/topology.js` 數學一行不動。
- **元件 comps 維持 plain JSON**：不可改成 class 實例（undo/存檔/分享靠它）。
- **零相依、純前端、ES6 module 靜態載入**，無 build step、無 npm。
- 維持 `window.blocks` 對外進入點不動（HTML inline onclick 依賴它）。
- 遵守 `.agent/rules.md`：禁止順便修改、改動範圍最小化、保留既有中英文註解與風格。

## 8. 快速健檢指令

```bash
# 語法檢查全部 blocks 模組
cd js/blocks && for f in *.js; do node --check "$f" || echo "$f FAIL"; done

# 抽模組後：確認 app.js 沒有殘留「該搬走卻沒加前綴」的裸呼叫（範例）
grep -nP "(?<![\\w.])(onNodeDown|onDragMove|startDrawLink)\\b" js/blocks/app.js | grep -vP "(Input|Tools)\\."
```
