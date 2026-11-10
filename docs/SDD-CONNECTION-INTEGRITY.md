# SDD — 接合關係的統一查詢與一致性檢查

日期：2026-11-10（Asia/Taipei）
狀態：草案，待使用者核可後依 LOOP 施工。

本文件是[可拆裝、可保存的積木設計](SDD-RAPID-MECHANISM-VALIDATION.md#reversible-assembly)之下的**實作規格**。它服務該節的 P3「共用孔與組立接合」與 P4「提交與錯誤一致」，不另立產品方向。該節的三個檢查時機、零件與連接規則、固定驗收矩陣都繼續適用。依該節約定，本文件**不先建立新的 connections 陣列**，也**不改寫求解器**。

## 1. 問題

2026-11-07～11-10 共 64 個 commit，其中針筒、馬達／軸心、孔位各約 15 個，大量是修補兩個功能之間的衝突（Fix／Restore／Keep／Reject／Preserve）。使用者在同一份作品連續碰到三種狀況，Node 測試全綠卻都沒有抓到：

1. 接好的機構無法改桿長。每個格孔都展開成剛體約束，懸空件補位時把格孔放歪，整份作品被判無解。
2. 改尺寸後，懸空的下游桿被拉長。畫面丟掉欠約束的那一幀，改用存檔座標。
3. 馬達軸心被「解除位置鎖定」拖離座板，但仍沿用座板孔的 id。之後連「解除輸出」都被安裝檢查擋住，無法存檔。

根因相同：**接合沒有正式的表示，也沒有人負責檢查資料一致。**

### 1.1 盤點結果（2026-11-10，af73ecc）

- **接合靠 id 相同。** 每個零件各存一份 `{id,type,x,y}`，id 相同即視為接在一起。112 個檔案直接讀 `.pN.id`。
- **馬達有兩套表示。**
  - 舊表示放在輸出件上：`physicalMotor`（零件與點各一份）、`motorType`、`isInput`、`phaseOffset`、`motorCarrier`、`motorMount{…}`；承載件另有 `motorMountPoint`、`frameSeparate`。
  - 新表示是獨立的 `type:'motor'` 零件。
  - topology 從軸心點讀 `physicalMotor`，solver 則從桿件欄位讀。編譯不讀 `motorCarrier`／`motorMount`。
  - `physical_motor`、`motor_carrier`、`motorMount.hostBody`、`slider.driverId` 有地方讀，卻沒有地方寫。
- **同一個問題有多套答案。**
  - 「是否為自由剛體」有 5 種實作：`model.isFreeBody`、`motor-release.attachedGroup`、`standard-blank.blockifyBars`、齒輪／鏈條手寫清單、`module-ops.connectedRootComps`。
  - 「孔是否使用中」有 5 種：`used-holes.holeUse`、`actuator-plate-holes.usedPoint`、`local-holes.passiveLocalHoles`、`motor-drop` 的 mountHoles、topology 的 `isUsed`。
  - 「是否接地」有 7 種，「是否有馬達」有 5 種，各自取用不同的欄位組合。
  - `used-holes`、`motor-drop`、`actuator-installation`、`motor-release`、`mounting-review` 把鍵值寫死成 `['p1','p2','p3']`，漏掉滑軌的 `m1/m2`。
- **隱含規則沒有人強制檢查。** 見 §3 的 I1–I9。舉例：
  - 同一 id 在各份副本的座標要一致；
  - 承載件與車架引用要存在；
  - `phaseOffset` 要與存檔姿態一致；
  - 針筒 `a/b` 要對到既有孔；
  - 刪除零件後，不會清掉別人指向它的 `motorCarrier`／`motorMount.frameBody`。
- **熱點檔案：** `multilink/solver.js`、`assembly.js`、`module-ops.js`、`app.js`、`core/topology.js`、`model.js`、`actuator-installation.js`、`schema.js`、`motor-tools.js`／`motor-mounts.js`、`input.js`。

## 2. 目標與不做

**目標**

1. **一個關係索引。** 「誰接誰、孔有沒有用、是否接地、有沒有馬達、是不是自由件」都從同一個純函式取得答案。各功能刪除自己的重複判斷。
2. **一個一致性檢查。** 開檔、每次正式提交後、以及測試中都執行。偵測到資料自相矛盾時，以白話說明並提供修復；不讓作品卡死。
3. **新的矛盾不能被寫進作品。** 任何會造成「新」違規的提交一律拒絕。訊息要指名零件，並說明下一步。
4. **測試能抓跨功能錯誤。** 所有內建範例與使用者 fixture 必須零違規；用操作序列測試在每一步驗證不變量。

**不做**

- 不新增持久化的 connections 陣列，不改寫 solver／topology 的求解演算法。
- 存檔格式只在某一包確實需要時，才提出最小差異並附往返測試。
- 不新增操作模式、不新增設定視窗；修復選項放在現有側欄或狀態列。
- 不處理承載、摩擦、全行程干涉；依原 SDD 標示的界限照舊。
- **針筒放在最後一包。**使用者 2026-11-10 指示：在此之前，針筒相關程式只改用新索引查詢，不改流程與 UI。

## 3. 設計

### 3.1 關係索引 `js/blocks/relations.js`（純函式，無 DOM）

`buildRelations(work)` 接受 `{comps, modules, topo}`，回傳唯讀索引：

| 查詢 | 回答 | 取代 |
| --- | --- | --- |
| `copiesOf(id)` | 這個 id 的每一份副本：`{compId, key}` 或 `{compId, holeId}`，含 `m1/m2`、局部孔、`mountHoles`、齒條孔 | 18 個模組各自掃描 p1/p2/p3，`model.pointRefs` |
| `worldOf(id)` | 規範座標。有局部孔時以 `holeWorld` 為準，否則取端點；副本不一致時回報 I1 | `pointCoords` 最後寫入者勝、`allPointsMap` 先到者勝 |
| `isUsed(compId, holeId)` | 有別的零件、模組、針筒、固定、馬達或已加工紀錄引用這個孔。`topo.tracePoints`／`loads`／`dimensions` 的引用另列為「非加工引用」 | `holeUse`、`usedPoint`、`passiveLocalHoles` 的判斷部分 |
| `isGround(id)` | fixed、motor、linear，或經「兩個不同固定孔」傳遞而被鎖住的板 | `isGroundPoint`、`dof.js`、`torque-model`、`fixedSyringePointIds` 等 7 套 |
| `motorOf(compId \| pointId)` | 規範化的馬達關係：`{motor, type, outputId, centerId, carrierId, frameBodyId, partId, phaseOffset}` | `pointHasMotor`、`motorTypeAt`、`offPlateMotors`、`scanMotors` 等 5 套 |
| `attachmentsOf(compId)` | 一個零件的全部關係（共用點、馬達、針筒端、合成、模組接口、齒輪嚙合），附關係種類 | 5 種「自由剛體」判斷、`connectedRootComps` |
| `isFreeBody(compId)` | `attachmentsOf` 為空，且不接地、不驅動 | 同上 |

說明：

- 索引每次由作品重建，不另存狀態。必要時以作品版本快取一次。
- 鍵值一律用 `pointKeysFor(type)`，不再寫死 p1/p2/p3。
- 第一版只**讀**。寫入（接上、解除、換孔）仍走現有域模組，但這些模組改用索引判斷。

### 3.2 一致性檢查 `checkWork(work, relations)`

回傳 `issues[]`。每筆包含：

- `code`
- 涉及的零件（用學生看得到的名稱，不用內部代號）
- 一句白話說明
- `repairs[]`：零到多個修復選項，每個都附上候選作品，可預覽、可確認、可一次復原

第一版的不變量（依盤點 §5）：

| 代號 | 不變量 | 修復選項 |
| --- | --- | --- |
| I1 | 同一 id 的每份副本座標一致。端點用了某零件的孔 id，就必須在該孔的世界位置（容差 0.01 mm） | 移回孔位；或讓它離開該零件（改用自己的 id）。兩者都以剛體平移只掛在它上面的自由件 |
| I2 | 同一 id 的 `type`、`physicalMotor` 在各副本一致 | 依較強的一方統一；有歧義時列出讓學生選 |
| I3 | 馬達紀錄一致：`center` 是帶 `physicalMotor` 的點；`frameBody`／`motorCarrier` 指向存在的零件且彼此相同；承載件的 `motorMountPoint === center`；`partId` 唯一 | 補齊衍生欄位；指向已刪零件時清除並說明；`partId` 重複則重新編號 |
| I4 | 輸入桿的 θ=0 姿態等於存檔姿態，涵蓋世界座標與承載件座標（`alignSavedInputPhase` 推廣） | 以存檔姿態為準重算相位 |
| I5 | 所有引用指向存在的零件、點或孔：針筒 `a/b.componentId`、`motorCarrier`、`frameBody`、`topo.tracePoints`／`loads`／`dimensions`、模組接口 | 清除失效引用並說明。不刪零件，不猜新的接法 |
| I6 | 零件 id 唯一；接點 id 不會因不安全字元被靜默改名而斷開共用 | 改名時同步更新所有副本，並記錄在說明裡 |
| I7 | 同一零件的兩個孔不共用同一 id（不能把自己接到自己） | 拆開，保留原位 |
| I8 | 合成件（`barFusion`、`fusedWith`）的成員與共用孔仍符合凍結形狀 | 提示先解除合成；不自動改形 |
| I9 | 針筒 `a/b (u,v)` 對到既有孔（針筒包才處理） | 移到最近的合法孔，或解除該端 |

**執行時機與政策**

1. **開檔、範例、分享、復原之後：** 執行一次。有違規就在狀態列顯示，並在側欄列出修復選項（把 `motor-release` 的提示推廣成通用元件）。作品照常開啟，不擋保存，也不丟零件。
2. **每次正式提交時：** 比較提交前後。提交後**新增**的違規一律拒絕，沿用現有的候選、拒絕與保留選擇流程；原本就存在的違規不影響提交。所有入口共用這一道關卡，各功能不再各寫一套前置檢查。
3. **測試：** 所有內建範例必須零違規。初次盤點出的既有違規要在 C1 列表，逐項修正或在 fixture 註明原因。

**啟動預算**

- 索引與檢查的核心要小，提交路徑才需要的部分（修復方案、說明文字）一律按需載入。
- 每包都要「刪掉的重複程式 ≥ 新增程式」。本 SDD 的包不調高 `startup-size` 上限；確有需要時先停下來，由使用者決定。

### 3.3 遷移原則

- 一次只遷一類問題。遷移的那一包要刪掉被取代的實作，不留兩套並存。
- 行為差異（例如舊實作漏掉 `m1/m2`）必須在報告中列出，並由測試鎖定新行為。
- 舊作品的接合語意、尺寸與運動結果不變。唯一例外是 I1–I7 修復，而且必須經學生確認才寫入。

## 4. 測試策略

1. **不變量測試 `test/connection-integrity.mjs`：**
   - 所有內建範例：`checkWork` 零違規；
   - 使用者 fixture（`connected-resize.json`、`motor-off-plate.json`）：偵測到預期的違規；
   - 修復選項套用後零違規，而且可以一次復原。
2. **操作序列測試 `test/operation-sequences.mjs`：**
   - 對 4～6 個代表作品，用固定亂數種子跑 N 步隨機合法操作：拖接點、改孔數、設為機架、解除與接回馬達、刪零件、移動自由件、存檔重開。
   - 每步之後斷言：沒有新違規；剛體長度與局部孔幾何不變；能解時姿態連續。
   - 失敗時輸出可重播的最小步驟序列，作為下一包的 fixture。
3. **瀏覽器驗收（主模型負責）：** 每包用使用者原檔與 2～3 個範例，在桌機 1280×900 與手機 390×844 各操作一次，核對訊息、修復、復原與保存重開。

## 5. LOOP 分包

模型分工依 [FTC-LOOP 規則](FTC-LOOP.md)：

- **主模型（Opus）：** 寫規格、每包先寫失敗中的測試或 fixture、審查 diff、跑全套、瀏覽器驗收、記錄證據。
- **施工模型（Sonnet）：** 一次只做一包，只改列出的檔案。
- **唯讀盤點：** 用 Sonnet Explore，節省 token。
- **升級：** 同一包連續兩輪審查未過，主模型先縮小成 fixture，再由 Opus 直接施工。

每包都在獨立分支完成，通過驗收才合併到 main。push 依使用者當次指示。

| 包 | 施工 | 交付 | 驗收閘門 | 狀態 |
| --- | --- | --- | --- | --- |
| C0 測試先行 | Opus | `test/connection-integrity.mjs` 骨架、兩份使用者 fixture、I1–I7 的最小反例；範例掃描腳本 | 測試在 main 上**失敗**，失敗原因正確 | 待核可 |
| C1 索引與檢查（唯讀） | Sonnet | `relations.js`（3.1 全部查詢）、`checkWork` I1–I7；修正 C0 掃出的範例資料或註明原因 | C0 測試通過；範例零違規；啟動大小不增加 | 待做 |
| C2 開檔提示與提交關卡 | Sonnet | 通用的違規提示與修復元件，泛化 `motor-release` 提示；提交前後比較，拒絕新違規 | 兩份使用者原檔在瀏覽器顯示正確修復；任一入口製造 I1 都被拒；一次復原；桌機與手機 | 待做 |
| C3 馬達單一來源 | Sonnet | 「有沒有馬達」「接地」改用 `motorOf`／`isGround`；載入時補齊 I3；刪除 `physical_motor`／`motor_carrier`／`hostBody`／`driverId` 的死讀取；刪除零件時清除失效的承載與車架引用 | 馬達相關 Node 與瀏覽器測試全過；舊範例姿態與匯出不變 | 待做 |
| C4 孔與自由件統一 | Sonnet | `isUsed`／`isFreeBody`／`attachmentsOf` 取代 5＋5 種舊實作；`m1/m2` 與 `mountHoles` 一致處理 | 加工孔集合與範例匯出 hash 不變，例外逐項列出；拖曳、改尺寸、設為機架測試全過 | 待做 |
| C5 操作序列測試 | Sonnet 寫、Opus 審 | `test/operation-sequences.mjs`；把找到的失敗縮小成 fixture，並在本包修正非針筒的部分 | 固定種子 500 步無新違規；找到的問題都有 fixture | 待做 |
| C6 合成、模組與組立接合 | Sonnet | `attachmentsOf` 涵蓋 `barFusion`／`fusedWith`／模組接口／角碼與榫接；I8 | 原 SDD P3 驗收矩陣中非針筒的案例通過 | 待做 |
| C7 針筒（最後） | Sonnet | 針筒查詢與釋放改走索引；I9；解除與接回走共用關卡 | 原 SDD P2 案例通過；針筒 Node 與瀏覽器測試全過 | 待做 |

每包循環：主模型寫測試 → 交辦 → 審查 diff 與跑測試 → 瀏覽器驗收 → 合併 → 在本表更新狀態與證據連結。失敗就留在該包修正，不把局部通過說成全部完成。

## 6. 完成標準

- §5 各包狀態為完成，證據記在 `docs/TEACHING-CHANGELOG.md`。
- 內建範例與 fixture 零違規，操作序列測試通過。
- 盤點列出的重複判斷都已刪除，或註明保留理由。
- 回到原 SDD 的 P3／P4 表格，更新狀態。完成報告分別列出已完成、部分支援、未實作與下一個缺口。
