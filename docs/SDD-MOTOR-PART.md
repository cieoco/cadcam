# SDD — 馬達是獨立零件（O5 規格，待使用者確認後才施工）

日期：2026-11-11（Asia/Taipei）
狀態：使用者 2026-11-12 同意存檔形狀可改（不必保留舊版相容，但**舊檔仍須能開啟**，由轉換器轉換）。**M0 完成（2026-11-12，純轉換器與測試，app 尚未使用）**；M1 起待排程。

## 0. 一句話

現在馬達接上輸出桿之後，馬達的資料是寫在那根桿件上的（`physicalMotor`、`motorType`、`motorMount`、`isInput`、`phaseOffset`…）。所以刪桿件、複製桿件、拆接點，每個動作都得記得「這根桿其實也是一顆馬達」。本規格讓馬達永遠是一個獨立零件，馬達與輸出件之間只是一條連接關係。

## 1. 現況（2026-11-11 盤點）

- 馬達有兩種形狀並存：
  - **獨立馬達** `type:'motor'`（未接輸出時；`independent-motor-v1`）。
  - **寫在輸出件上**：桿件（或齒輪）帶 `physicalMotor`／`motorType`／`motorMount{partId,center,frameBody,outputBody,…}`／`isInput`／`phaseOffset`；軸心點帶 `physicalMotor`；座板帶 `motorMountPoint`、`standardBlank.mountHoles`。
- `motor-roles.js` 的 `motorRecords()` 已經把兩種形狀讀成同一種「馬達關係」紀錄（`ownerId, motor, type, centerId, carrierId, frameBodyId, partId, isInput, phaseOffset, independent`），但只用來查詢；寫入仍是各自改欄位。
- 讀或寫這些欄位的檔案約 90 個。O1 已經在刪除時用「先解除再刪」繞過，但複製、鏡射、合成、匯出、3D、範例資料都各自處理。

## 2. 目標形狀

- **馬達一律是 `type:'motor'` 零件**：`{id, type:'motor', motorType, motor:'1', p1:{id, x, y, type}, mount:{frameBody?, carrier?, face, angleDeg, reversed, orientation}, drives?: {body, phaseOffset}}`。
  - `p1`＝軸心；裝在座板上時 `p1.id` 等於座板的孔 id（既有的「共用孔 id＝接在一起」規則不變）。
  - `drives.body`＝輸出件 id（桿件或齒輪）；沒有 `drives`＝尚未接輸出。
- **輸出件不再帶馬達欄位**：`physicalMotor`、`motorType`、`motorMount`、`isInput`、`phaseOffset`、點上的 `physicalMotor` 都由馬達零件推導。求解需要的「哪根是輸入桿、相位多少」在編譯 topology 時從馬達零件算出，求解器不變。
- **座板**的 `motorMountPoint`、`mountHoles` 維持（那是板子上的加工資料），但由馬達零件的位置決定是否使用中。

## 3. 轉換

- **開檔**：`schema.js` 正規化時，把「寫在輸出件上」的馬達拆成馬達零件＋`drives`（用 `motorRecords()` 的結果產生；`motorMount.partId` 作為馬達零件 id，沒有就新編）。轉換後的作品求解結果、匯出、3D 必須與轉換前逐點相同。
- **存檔**：只寫新形狀，`requires` 加一個新標記（例如 `motor-part-v2`）。舊版程式開新檔會看到「需要較新版本」的既有提示；不寫回舊形狀。
- **內建範例與教學資料**：以同一個轉換器離線轉一次並更新基準雜湊；範例的行為（姿態、掃描範圍）不得改變。

## 4. 動作在新形狀下的意義（對照表 `operation-matrix.js` 的馬達列）

| 動作 | 意義 |
| --- | --- |
| 刪除輸出件 | 刪零件，馬達的 `drives` 清掉；馬達留著（O1 的行為，不再需要「先解除」這個特例） |
| 刪除馬達 | 刪馬達零件；輸出件變成一般零件，座板安裝孔回到未使用 |
| 解除輸出 | 清掉 `drives`；接輸出＝設定 `drives.body` |
| 複製／鏡射輸出件 | 只複製零件，不會多出一顆馬達；要複製馬達就選馬達 |
| 移動馬達 | 換座板孔＝改 `p1` 與 `mount`；輸出件跟著軸心 |
| 多馬達 | 每顆一個零件；`motor` 編號不變 |

## 5. 分包（確認後才開始；LOOP：Sonnet 施工，主模型審查與驗收）

| 包 | 內容 | 驗收 |
| --- | --- | --- |
| M0 | 純轉換器 `motor-part.js`：舊→新、新→求解用的推導；對所有內建範例與使用者 fixture 做「轉換前後求解逐點相同」的測試。不接進程式 | Node 測試；零行為改變 |
| M1 | 讀取端改用推導結果：`model.js` 編譯、`relations.js`、匯出、3D 只讀新形狀（由轉換器在記憶體中提供），舊欄位仍寫 | 全套 Node 與瀏覽器測試與基準相同 |
| M2 | 寫入端：安裝、解除、刪除、移動馬達改寫新形狀（走共用動作流程）；刪掉各處對舊欄位的寫入 | 對照表馬達列；桌機與手機驗收 |
| M3 | 存檔切到新形狀＋`requires` 標記；範例資料轉換；舊欄位的讀取碼刪除 | 舊檔開啟、存檔重開、匯出比對；分享連結 |

每包可以單獨上線；M3 之前存檔格式不變，隨時可以停。

## 6. 風險

- **範圍大（約 90 個檔案）**：先做 M0／M1（只讀、行為不變）把風險切掉；M2 之後才有行為改變。
- **舊版相容**：M3 之後存的檔，舊版程式開不了（會有提示）。線上只有一個版本，風險在於使用者手上的舊離線頁；若要保留，可改成「存檔同時寫兩種形狀一段時間」，但會延長兩套並存的時間，不建議。
- **騎乘馬達（裝在會動的零件上）**、齒輪輸出、多馬達：M0 的測試必須涵蓋現有範例中的這三種。

## 7. 需要使用者決定

1. 是否同意改存檔形狀（M3）。不同意的話可以只做到 M2 的一半：程式內部用馬達零件，存檔時再寫回舊形狀——可行，但轉換碼要永久保留。
2. 開始時間：建議在 `SDD-OPERATION-PIPELINE` 的 O4 完成之後。

## 8. M0 結果（2026-11-12）

`js/blocks/motor-part.js`（純函式，app 尚未 import）與 `test/motor-part.mjs`（已登錄 manifest）。

**定案的目標形狀**（檔頭註解有同一份）：

```
{ id, type:'motor', motorType:'tt'|'n20'|'mg995', motor:'1',
  p1:{id,x,y,type,…},                      // 軸心，點上沒有 physicalMotor
  mount?:{frameBody?, face?, orientation?, angleDeg?, reversed?, carrier?},   // 舊資料有寫才有；carrier＝原 motorCarrier
  drives?:{body, phaseOffset?},            // 沒有＝未接輸出；phaseOffset 舊資料有寫才有
  servoStart?, servoEnd?,                  // 只有 mg995（從輸出件搬到馬達）
  moduleId?, name?, … }                    // 其餘欄位原樣保留
```

- 與原 §2 的差異：`mount` 與 `phaseOffset` 改成「可缺席」——舊檔的缺席（例如 quick-return 的輸入桿沒有 motorMount）要原樣還原，不補預設；`mount.carrier` 把 `motorCarrier` 收進來；`servoStart/End` 屬於馬達，跟著搬。
- 馬達零件 id：驅動件有 `motorMount.partId` 就沿用，否則 `Motor.<軸心 id>`（撞名加 `.2`…）；獨立馬達沿用原 id。零件位置：獨立馬達原位置換；驅動件的馬達緊接在輸出件之後（`toLegacy` 拿掉後順序與原本相同）。
- 輸出件失去 `physicalMotor／motorType／motorMount／phaseOffset／motorCarrier／servoStart／servoEnd`、軸心點上的 `physicalMotor`，`isInput` 變 `false`（桿件本來就一定有這個欄位）。
- `motorFacts(work)` 回傳每顆馬達的 `{id, centerId, bodyId, phaseOffset, carrierId, frameBodyId, type, motor, point, servo?}`，只由馬達零件導出；M1 起取代各處讀舊欄位。
- 範圍外（原樣保留）：活塞桿（`style:'piston'`）與滑軌輸入（閥門編號，不是旋轉馬達）、找不到軸心點的輸出件、同一軸心有兩個以上帶資料的輸出件（內建資料與 fixture 都沒有）。

**不能逐字往返的欄位**（其餘全部 `deepEqual`，含 `normalizeSnapshot` 之後）：

1. **非擁有者點上的 `physicalMotor` 副本**：8 個內建作品各有 1 個（tipping-bucket／unit7-start 的 `LeftSide.p1`、gear-gripper 與 assembly-lift-gripper／-practice／clawbot-lift-gripper／-practice 的 `LeftJaw.p1`、jansen-leg 的 `Anchor2.p1`）。理由：這些是冗餘副本（編號與擁有者相同、類型欄位仍留著）；`toLegacy` 不能補在其他零件上，因為 `normalizeBar` 看到點上有 `physicalMotor` 就會把那根桿當輸入桿（parallel-gripper 的 `PGLeftGround` 實測會變成第二個輸入桿）。這 8 個作品的求解逐點相同。
2. 齒輪／皮帶輪／三點桿／凸輪的**零件層** `physicalMotor`（與軸心點上的重複，topology 只讀點）不還原；內建資料與 fixture 為 0 筆，測試斷言為 0。
3. 驅動件的 `partId` 靠 id 是否以 `Motor.` 開頭判斷是否自動編號；真實 partId（`Motor<n>`）不含句點，不會誤判。

**涵蓋**：78 個作品（71 內建範例含延遲載入的單元起點、5 個 fixture、2 個合成：由 `planMotorRelease` 解出的獨立馬達、手寫的 mg995 獨立馬達）、59 顆馬達、24 個無馬達作品，共 996 次掃描（每顆馬達 12 個角度，原始 vs `toLegacy(toMotorParts(·))` 的編譯＋求解逐點相同）。個案：座板＋輸出桿 22、齒輪輸出 17（皮帶輪 3、凸輪 1）、mg995 18、世界機架 28、騎乘馬達 1（competition-fourbar-lift）、單作品多馬達 5、軸心離開座板 2（motor-off-plate、delete-blocked，不一致被保留而非修正）、未接輸出的獨立馬達 2。

**給 M1 的注意**：(a) 內建範例**沒有**舊式獨立馬達（`type:'motor'`），獨立馬達只出現在合成案例，M1 的瀏覽器驗收要手動放一顆；(b) `compileTopology` 不讀 `phaseOffset`（App 的馬達運動模組讀），所以求解相同不能證明相位正確，相位靠 `deepEqual` 與 `motorFacts` 對照 `motorRecords`；(c) 驅動件馬達的 `p1.x/y` 是輸出件軸心點的**副本**，`toLegacy` 不回寫座標，M2 改寫入端時要決定誰是權威（建議馬達零件）；(d) 載入圖（`js/load-graph.*` 與各 html）已重新產生。
