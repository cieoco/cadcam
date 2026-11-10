# SDD — 接合關係的統一查詢與一致性檢查

日期：2026-11-10（Asia/Taipei）
狀態：第二版草案。已依 2026-11-10 的審查修正（§7），待核可後依 LOOP 施工。

本文件是[可拆裝、可保存的積木設計](SDD-RAPID-MECHANISM-VALIDATION.md#reversible-assembly)之下的**實作規格**，服務該節的 P3「共用孔與組立接合」與 P4「提交與錯誤一致」，不另立產品方向。該節的三個檢查時機、零件與連接規則、固定驗收矩陣繼續適用。依該節約定，本文件**不先建立新的 connections 陣列**，也**不改寫求解器**。

## 1. 問題

2026-11-07～11-10 共有 64 個 commit。針筒、馬達／軸心、孔位各約 15 個，大量在修補兩個功能之間的衝突（Fix／Restore／Keep／Reject／Preserve）。同一份使用者作品連續碰到三種狀況，Node 測試全綠卻都沒有抓到：

1. **接好的機構無法改桿長。** 每個格孔都展開成剛體約束；懸空件補位時把格孔放歪，整份作品被判無解。
2. **改尺寸後，懸空的下游桿被拉長。** 畫面丟掉欠約束的那一幀，改用存檔座標。
3. **馬達軸心被拖離座板，之後無法解除輸出。** 使用者「解除位置鎖定」後拖動軸心，軸心仍沿用座板孔的 id；之後連「解除輸出」都被安裝檢查擋住，無法存檔。

根因相同：**接合沒有共用的查詢，也沒有人負責檢查資料一致。**

### 1.1 盤點結果（2026-11-10，af73ecc）

- **接合靠 id 相同。** 每個零件各存一份 `{id,type,x,y}`，id 相同即視為接合。112 個檔案直接讀 `.pN.id`。
- **馬達有兩套表示，讀取路徑也不同。**
  - 舊表示放在輸出件上：`physicalMotor`（零件與點都可能有）、`motorType`、`isInput`、`phaseOffset`、`motorCarrier`、`motorMount{…}`；承載件另有 `motorMountPoint`、`frameSeparate`。新表示是獨立的 `type:'motor'` 零件。
  - topology 從軸心點讀 `physicalMotor`，solver 從桿件欄位讀；編譯時不讀 `motorCarrier`／`motorMount`。
  - `physical_motor`、`motor_carrier`、`motorMount.hostBody`、`slider.driverId` 有讀取者，卻沒有寫入者。
- **同一個問題有多套答案：**
  - 「自由剛體」有 5 套：`model.isFreeBody`、`motor-release.attachedGroup`、`standard-blank.blockifyBars`、齒輪／鏈條手寫清單、`module-ops.connectedRootComps`。
  - 「孔是否使用中」有 5 套：`used-holes.holeUse`、`actuator-plate-holes.usedPoint`、`local-holes.passiveLocalHoles`、`motor-drop` 的 mountHoles、topology `isUsed`。
  - 「接地」有 7 套，「有沒有馬達」有 5 套。
  - 多處把鍵值寫死成 `['p1','p2','p3']`，漏掉滑軌的 `m1/m2`。
- **隱含規則沒有人檢查。** 例如同 id 副本座標要一致、承載與車架引用要存在、刪除零件不會清理指向它的 `motorCarrier`／`motorMount.frameBody`、針筒 `a/b` 的承載件要存在。
- **熱點：** `multilink/solver.js`、`assembly.js`、`module-ops.js`、`app.js`、`core/topology.js`、`model.js`、`actuator-installation.js`、`schema.js`、`motor-tools.js`／`motor-mounts.js`、`input.js`。

## 2. 目標與不做

**目標**

1. **一個關係索引。** 各功能從同一個純函式取得關係事實，再逐包刪除自己的重複判斷。不同問題保持不同的查詢，不合併成單一答案。
2. **一個一致性檢查。** 先以「只讀、只回報」的影子模式校準。證明不會誤判正常作品之後，才逐項接到開檔提示與提交關卡。
3. **跨功能錯誤由測試抓到。** 所有內建範例與使用者 fixture 必須零誤報；操作序列測試要提早加入。

**不做**

- 不新增持久化 connections 陣列，不改寫 solver／topology 演算法。存檔格式只在某包確實需要時提出最小差異，並附往返測試。
- 不新增操作模式或設定視窗。修復選項放在現有側欄／狀態列。
- 不處理承載、摩擦、全行程干涉，界限依原 SDD。
- **針筒放最後一包**（使用者 2026-11-10 指示）。在那之前，針筒程式只改用新索引查詢，不改流程與 UI。

## 3. 設計

### 3.1 欄位角色

檢查只比對「同角色」的資料。欄位缺席不等於矛盾。

| 角色 | 欄位 | 規則 |
| --- | --- | --- |
| 身分 | 點／孔 `id`、零件 `id` | 共用 id 代表接合；零件 id 唯一 |
| 幾何 | 點副本的 `x,y`、局部孔 `u,v` 推得的世界座標 | 同一 id 的幾何副本必須一致（I1） |
| 運動角色 | 點的 `type`（floating／fixed／motor／linear） | 各副本可以只有部分帶強角色，以最強者為準。只有兩個強角色互相衝突才算矛盾，例如兩個不同的 `physicalMotor` |
| 馬達擁有 | 輸出件或獨立馬達的 `physicalMotor`、`motorType`、`isInput`、`phaseOffset`、`motorMount` | 由擁有者保存。點與承載孔上的 `physicalMotor` 是**可選的副本**：沒有複製不算錯；有複製則值必須相同 |
| 承載 | `motorMount.frameBody`；`motorCarrier` 只在承載件會動時使用；承載件的 `motorMountPoint`、`frameSeparate` | 板材承載合法地沒有 `motorCarrier`。兩者都存在時才要求相同；有寫的引用必須指向存在的零件 |
| 加工 | 局部孔的 `manufactured`、`standardBlank.drill`、`mountHoles` | 見 3.2 的三種孔用途，不與運動角色混用 |
| 非加工引用 | `topo.tracePoints`、`loads`、`dimensions`、`referencePoint` | 只要求引用存在，不讓孔變成「需加工」 |

C1 必須以程式碼逐欄核對本表，並把修正寫回本節。

### 3.2 關係索引 `js/blocks/relations.js`（純函式，無 DOM）

`buildRelations(work)` 由 `{comps, modules, topo}` 建立唯讀索引，每次由作品重建，必要時以作品版本快取。鍵值一律用 `pointKeysFor(type)`。

| 查詢 | 回答 | 現有對應 |
| --- | --- | --- |
| `copiesOf(id)` | 每份副本 `{compId, key}` 或 `{compId, holeId}`，含 `m1/m2`、局部孔、`mountHoles`、齒條孔 | `model.pointRefs` 與各模組自掃 |
| `worldOf(id)` | 規範座標與副本差異 | `pointCoords`、`allPointsMap` |
| `holeRoles(compId, holeId)` | **分開回答三種用途**：`machining`（需加工）、`mountOccupied`（被馬達／管夾等安裝特徵占用或停放）、`constraint`（參與運動約束），每種附上理由 | `machining` 對應 `used-holes.holeUse`；`mountOccupied` 對應 `actuator-plate-holes.usedPoint`／`occupied()`、`motor-drop`；`constraint` 對應 `passiveLocalHoles`、topology `isUsed` |
| `isGround(id)` | fixed／motor／linear，或經兩個不同固定孔鎖住的板；附來源 | `isGroundPoint`、`dof.js`、`torque-model`、`fixedSyringePointIds` 等 |
| `motorOf(compId \| pointId)` | 依 3.1 規範化的馬達關係，附上每個欄位的來源 | `pointHasMotor`、`motorTypeAt`、`offPlateMotors`、`scanMotors` 等 |
| `attachmentsOf(compId)` | 全部關係與種類：共用點、馬達、針筒端、合成、模組接口、嚙合 | 5 套自由剛體判斷 |
| `isFreeBody(compId)` | 沒有關係、不接地、不驅動 | 同上 |

第一版只讀不寫。接上、解除、換孔仍走現有域模組。

### 3.3 一致性檢查 `checkWork(work, relations)`

回傳 `issues[]`，每筆含 `code`、`severity`（`contradiction` 資料自相矛盾／`dangling` 引用失效／`notice` 可疑但可能合法）、零件名稱（學生看得到的名稱）、一句說明、`repairs[]`（候選作品，可預覽、可確認、一次復原）。

| 代號 | 規則 | 修復（C3 才提供） |
| --- | --- | --- |
| I1 | 同一 id 的幾何副本一致。端點用了某零件的孔 id，就要在該孔世界位置（容差 0.01 mm） | 移回孔位，或改用自己的 id 離開該零件；只掛在它上面的自由件剛體同行 |
| I2 | 強運動角色不互相衝突：兩個不同 `physicalMotor`，或 fixed 與 motor 指向不同驅動。只缺複製不算 | 列出讓學生選擇，不自動決定 |
| I3 | 馬達引用可解析：`center` 是輸出件或獨立馬達自己的點；有寫的 `frameBody`／`motorCarrier`／`motorMountPoint` 指向存在的零件；兩者並存時相同；`partId` 唯一 | 清除指向已刪零件的引用並說明；`partId` 重新編號 |
| I4 | 重開作品的姿態等於存檔姿態，比對方式：用**存檔的各馬達角度**（`topo.motorAngles`／`theta`／`activeMotor`）求解，而不是一律零度；涵蓋多馬達與相對承載件角度。現行 `alignSavedInputPhase` 刻意排除的情況（凍結輸入、承載件輸入等）先只標記 `notice` | 只對已證明安全的案例重算相位；其他情況只說明 |
| I5 | 有寫的引用必須存在：針筒端的承載零件、`motorCarrier`、`frameBody`、`topo` 的追蹤／負載／尺寸點、模組接口 | 清除失效引用並說明；不刪零件、不猜接法 |
| I6 | 零件 id 唯一；不安全字元的 id 改名後共用要同步更新 | 改名並同步全部副本 |
| I7 | 同一零件的兩個孔不共用同一 id | 拆開並保留原位 |
| I8 | 合成件成員與共用孔符合凍結形狀 | 提示先解除合成，不自動改形 |
| I9 | 針筒端點**可解析**：承載零件存在；`(u,v)` 在零件外形內、符合現有針筒放置規則。可以是任意已支援位置或新增的固定孔，**不要求對到既有格孔** | 只在承載零件失效時提供「解除該端」 |

**分階段啟用**

1. **影子模式（C1、C2）：** `checkWork` 只在測試與開發記錄中執行，不顯示給學生，不阻擋任何操作。以所有內建範例、使用者 fixture、操作序列測試的每一步、`output/` 內既有的試用作品掃描，逐項校準誤報。
2. **逐項啟用提示（C3）：** 某一條規則在影子模式零誤報，且至少有一個真實違規 fixture，才在開檔時顯示說明與修復。每條各自一個開關與證據。
3. **逐項接入提交關卡（C4 起）：** 只有已啟用提示的 `contradiction` 規則，才拒絕「提交後新增」的違規。`notice` 永遠不阻擋。原本就存在的違規不影響提交。

**啟動預算：** 索引與檢查放在按需載入的模組。影子模式不進啟動路徑；接入提交關卡後只在提交時載入。每包都要求「刪掉的重複程式 ≥ 新增程式」，不調高 `startup-size` 上限；確有需要先停下由使用者決定。

### 3.4 遷移原則

- 一次只遷一類問題，並刪除被取代的實作，不留兩套並存。
- 新舊答案不同時，先在影子模式列出差異。由主模型判斷哪一方對，再以測試鎖定；不靜默改變行為。
- 舊作品的接合語意、尺寸、運動結果與加工孔集合不變。I1–I7 的修復都必須由學生確認才寫入。

## 4. 測試策略

1. **影子比對 `test/connection-integrity.mjs`：**
   - 全部內建範例：零 `contradiction`、零 `dangling`，`notice` 逐項列出原因。
   - 使用者 fixture：`connected-resize.json` 應零違規；`motor-off-plate.json` 應有 I1。
   - 新舊查詢差異表：每個舊實作與新索引對同一範例的回答。
2. **操作序列測試 `test/operation-sequences.mjs`（C2 就加入）：**
   - 4～6 個代表作品，固定亂數種子，隨機合法操作：拖接點、改孔數、設為機架、解除與接回馬達、刪零件、移動自由件、存檔重開。
   - 每步斷言：剛體長度與局部孔幾何不變；能解時姿態連續；影子檢查沒有新的 `contradiction`。
   - 失敗時輸出最小重播序列作為 fixture。
3. **瀏覽器驗收（主模型）：** 啟用提示或關卡的包，用使用者原檔與 2～3 個範例，在桌機 1280×900 與手機 390×844 各操作一次。

## 5. LOOP 分包

**分工：**
- **主模型（Opus）：** 規格、每包先寫失敗中的測試或 fixture、審查 diff、全套測試、瀏覽器驗收、記錄。
- **施工（Sonnet）：** 一次一包，只改列出的檔案。
- **唯讀盤點：** 用 Sonnet Explore。
- **升級：** 同一包連續兩輪審查未過，主模型先縮小成 fixture，再由 Opus 施工。

每包在獨立分支完成，驗收通過才合併到 main；push 依使用者指示。

| 包 | 施工 | 交付 | 驗收閘門 | 狀態 |
| --- | --- | --- | --- | --- |
| C0 測試先行 | Opus | `test/connection-integrity.mjs` 骨架與兩份使用者 fixture；I1–I9 各一個最小反例與一個「看似矛盾但合法」的正例（板材承載無 `motorCarrier`、承載孔無 `physicalMotor` 副本、多馬達非零角度、針筒任意位置固定孔） | 反例在 main 上失敗、正例通過，失敗原因正確 | 待核可 |
| C1 索引與影子檢查 | Sonnet | `relations.js`（3.2）、`checkWork`（3.3），按需載入；核對並修正 3.1 欄位角色表；新舊查詢差異表 | C0 全過；範例零 `contradiction`／`dangling`；差異逐項有判斷；不進啟動路徑 | 待做 |
| C2 操作序列測試 | Sonnet 寫、Opus 審 | `test/operation-sequences.mjs`；影子檢查每步執行；把失敗縮小成 fixture，非針筒的問題在本包修 | 固定種子 500 步無新 `contradiction`，失敗都有 fixture | 待做 |
| C3 逐項啟用開檔提示 | Sonnet | 通用提示與修復元件（泛化 `motor-release` 提示）；I1、I3、I5 先啟用，其他保持影子 | 兩份使用者原檔顯示正確；範例無提示；修復一次復原；桌機與手機 | 待做 |
| C4 馬達單一來源與提交關卡 | Sonnet | 「有沒有馬達」「接地」改用 `motorOf`／`isGround`；刪除 `physical_motor` 等死讀取；刪除零件清理失效的承載引用；I1／I3 接入提交關卡 | 馬達相關 Node 與瀏覽器測試全過；範例姿態與匯出不變；任一入口製造 I1 被拒 | 待做 |
| C5 孔用途與自由件統一 | Sonnet | `holeRoles` 三種用途、`isFreeBody`／`attachmentsOf` 取代舊實作；`m1/m2`、`mountHoles` 一致 | 加工孔集合與範例匯出 hash 不變，例外逐項列出；拖曳、改尺寸、設機架、安裝測試全過 | 待做 |
| C6 合成、模組與組立接合 | Sonnet | `attachmentsOf` 涵蓋合成、模組接口、角碼／榫接；I8 啟用提示 | 原 SDD P3 矩陣非針筒案例通過 | 待做 |
| C7 針筒（最後） | Sonnet | 針筒查詢與釋放改走索引；I9 依 3.3 定義啟用；解除與接回走共用關卡 | 原 SDD P2 案例通過；任意位置與新增固定孔不被誤判；針筒 Node 與瀏覽器測試全過 | 待做 |

每包循環：主模型寫測試 → 交辦 → 審查與全套測試 → 需要時做瀏覽器驗收 → 合併 → 更新本表與證據。失敗留在該包修，不把局部通過說成全部完成。

## 6. 完成標準

- §5 各包完成，證據記入 `docs/TEACHING-CHANGELOG.md`。
- 範例與 fixture 零誤報，操作序列測試通過，已啟用的規則各有真實違規 fixture。
- 盤點列出的重複判斷已刪除，或註明保留理由。
- 回到原 SDD 的 P3／P4 表格更新狀態，分別列出已完成、部分支援、未實作及下一個缺口。

## 7. 審查紀錄

- **2026-11-10 第一版（fda35e94）審查意見**，第二版已處理：
  1. **馬達資料不能一律要求相同。** 改以 3.1 欄位角色比對：板材承載無 `motorCarrier` 合法，承載孔無 `physicalMotor` 副本合法；I2／I3 改為「強角色衝突」與「有寫的引用可解析」。
  2. **孔用途要分開。** 索引改為 `holeRoles` 分別回答加工、安裝占用、運動約束三種用途，不以單一「使用中」取代。
  3. **存檔姿態不能一律當零度。** I4 改以存檔的各馬達角度求解比對，涵蓋多馬達與相對承載件；現行刻意排除的情況先只標 `notice`。
  4. **針筒位置不一定是既有格孔。** I9 改為「可解析且符合現有放置規則」，保留任意位置與新增固定孔。
  5. **先驗證規則，再啟用阻擋。** 改為影子模式 → 逐項啟用提示 → 逐項接入提交關卡；操作序列測試移到 C2。
