# SDD — 馬達是獨立零件（O5 規格，待使用者確認後才施工）

日期：2026-11-11（Asia/Taipei）
狀態：使用者 2026-11-12 同意存檔形狀可改（不必保留舊版相容，但**舊檔仍須能開啟**，由轉換器轉換）。**M0 完成（2026-11-12，純轉換器與測試，app 尚未使用）**；**M1 完成（2026-11-12，動作在新形狀上計畫，讀取端與存檔不變；待審查與桌機／手機驗收）**；**M2 完成（2026-11-12，下載的作品檔與分享連結寫馬達零件形狀，所有開啟路徑新舊皆可，待審查與桌機／手機驗收）**；M3 延後。

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
| M1（完成，待驗收） | **動作在新形狀上計畫**（2026-11-12 修訂）：共用動作流程 `runEdit` 增加 `shape:'parts'`——計畫前把作品轉成馬達零件形狀、計畫後轉回現行形狀再套用。刪除、複製／鏡射、分開接點、解除／放回／留在原處馬達改在新形狀上寫，移除各自的馬達特例。讀取端（求解、繪製、匯出、3D，約 90 個檔案、上千處）**不動** | 對照表馬達列；既有全套 Node 與瀏覽器測試與基準相同；桌機與手機驗收 |
| M2（完成，待驗收） | **存檔用新形狀**：存檔與分享寫馬達零件形狀＋`requires` 標記；開檔（新舊皆可）一律轉成現行記憶體形狀。內建範例資料維持現狀（開啟時經同一轉換） | 存檔重開、舊檔開啟、分享連結；匯出比對 |
| M3 | （延後，不在這一輪）讀取端逐步改讀馬達零件、記憶體形狀切換、刪除舊欄位。規模大、對使用者沒有可見差異，等有需要再排 | — |

每包可以單獨上線；M3 之前存檔格式不變，隨時可以停。

## 6. 風險

- **範圍大（約 90 個檔案）**：先做 M0／M1（只讀、行為不變）把風險切掉；M2 之後才有行為改變。
- **舊版相容**：M3 之後存的檔，舊版程式開不了（會有提示）。線上只有一個版本，風險在於使用者手上的舊離線頁；若要保留，可改成「存檔同時寫兩種形狀一段時間」，但會延長兩套並存的時間，不建議。
- **騎乘馬達（裝在會動的零件上）**、齒輪輸出、多馬達：M0 的測試必須涵蓋現有範例中的這三種。

## 7. 使用者決定與計畫修訂（2026-11-12）

1. 使用者確認施工，並決定不用顧慮舊檔相容：存檔可以直接改成新形狀。開舊檔時的自動轉換仍保留（使用者現有作品與內建範例都靠它）。
2. **計畫修訂（主模型，M0 完成後）：** 盤點顯示直接讀舊馬達欄位的地方約 90 個檔案、上千處（`physicalMotor` 361 處、`isInput` 191 處、`motorMount` 148 處…）。把讀取端全部改寫（原 M1）風險與花費都高，而使用者看得到的好處來自「動作不必再處理馬達特例」與「存檔形狀乾淨」。因此改成：動作在新形狀上計畫（M1）、存檔用新形狀（M2），讀取端維持現狀並由 M0 的轉換器雙向轉換；原本的讀取端改寫延後（M3）。代價：轉換器要長期保留。

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

## 9. M1 結果（2026-11-12）

**做了什麼**：`runEdit` 增加 `shape:'parts'`（`edit-pipeline.js` 檔頭有說明）：計畫前 `toMotorParts`、計畫成功後 `toLegacy`，之後的檢查、確認、提交、復原都在今日形狀上，行為與沒有 `shape` 時相同；拒絕、`unchanged`、例外不會轉回任何東西；沒登記的 shape 一律拒絕並說一句話。轉換器由新檔 `plan-shape.js` 登記（`motor-part.js` 約 13 KB，不放進啟動路徑；`edit-pipeline.js` 只多約 1.8 KB，啟動 2,189,553 → 2,191,426 bytes，上限 2,200,000）。

**搬到新形狀上的動作與移除的馬達特例**

| 動作 | 檔案 | 移除／改變 |
| --- | --- | --- |
| 刪除 | `delete-part.js` | 不再先呼叫 `planMotorRelease`、不再判斷輸出桿的 `isInput／motorMount／physicalMotor`、不再讀 `motorMount.frameBody` 來寫提示；刪輸出件＝刪零件＋`freeMotor`（清 `drives`）；訊息與舊版逐字相同 |
| 刪除（座板／承載件被刪） | `detached-attachments.js` | 新增馬達零件分支（結果與舊的今日形狀分支相同）；舊分支保留，因為 `test/independent-motors.mjs` 直接呼叫它 |
| 刪除齒輪 | `gear-plan.js` | 「裝在它上面的馬達設定也一起移除」改由馬達零件（`drives.body`）判斷並一起刪除，不再讀 `p1.physicalMotor` |
| 複製／鏡射 | `member-copy.js` | `hadMotor` 移除，提示由馬達零件判斷；副本本來就不帶馬達零件。`planMemberCopy` 內剝除馬達欄位的清單**保留**（對話框預覽與 `test/operation-matrix.mjs` 的 `copy-motorbar-plain` 直接用今日形狀呼叫它） |
| 解除輸出、放回座板原孔、離開座板 | `motor-release.js`（新增 `pose-freeze.js`） | `planMotorInstallation` 的「解除」改成 `freeMotor`（清 `drives`、軸心留在畫面位置、補齊安裝記錄、座板記下座孔、相連零件先記下目前姿勢，姿勢步驟抽出共用）；放回／離開改成直接改馬達零件的 `p1`／`mount`。`planMotorRelease／Return／Leave` 仍是今日形狀進出的包裝（測試與修復項目用） |
| `planSplit`／`planMerge` | `connect-ops.js` | 本來就沒有馬達特例，沒動 |

`planMotorInstallation`（安裝面板的「解除」路徑）沒動；`planActuatorPlateHoles` 等讀取端沿用今日形狀，由 `plan-shape.js` 的 `settlePlateHoles` 以「轉成今日形狀的投影」計算，只把它改到的板件孔資料放回新形狀。

**冗餘副本處理**（§8 的三項）：馬達零件沒被動到時，輸出件上的馬達欄位、軸心點副本、零件層 `physicalMotor`、鍵順序都照計畫前原樣放回（`plan-shape.js` 的 `leaveParts`），所以不碰馬達的動作不會讓馬達資料漂移（`test/motor-part-plans.mjs` e 在全部 76 個有／無馬達的作品上驗證）。只有「被解除輸出的馬達」會清掉軸心上的副本（舊的解除也這樣）；軸心換 id（離開座板）時副本跟著新 id。

**與舊規劃函式的資料差異**（`test/fixtures/motor-plan-expected.json` 記錄了舊規劃函式在全部內建範例與 fixture 上的結果雜湊，327 個案例，新結果須相同；比對時排除下列兩項）：
1. 解除後新獨立馬達的零件編號：舊為 `Motor<計數>`，新為 `Motor.<軸心點 id>`（M0 的編號規則）；零件順序：舊放在最後，新留在輸出件原位置。學生看不到。
2. 舊版對 `tipping-bucket`、`unit7-start` 的 `Drive`（馬達掛在不含該軸心的承載桿上）解除或刪除輸出桿會拒絕（「請先在畫布放置馬達…」），新版可完成：承載件上沒有該孔時不在承載件寫 `motorMountPoint`。

**仍在今日形狀上**：`planReleaseMesh`（分開咬合，讀 `g.p1.physicalMotor` 判斷是否仍有驅動）、`offPlateMotors`／`attachedGroup`（整合修復項目與安裝面板用）、`planMotorInstallation`（安裝）、`planMemberCopy` 的剝除清單、`detachDeletedAttachments` 的舊分支、移動／縮放／合成／鏡射以外的所有讀取端。原因：呼叫端仍有直接用今日形狀呼叫的地方，或不屬於這一包的動作；M2 之後再處理。

**驗證**：`test/edit-pipeline.mjs`（轉換一次進一次出、拒絕不轉回、什麼都不做的計畫在 5 個 fixture 上往返逐點相等）、`test/motor-part-plans.mjs`（刪輸出件 34、刪馬達 57、複製 34、記錄比對 327、無漂移 76）；既有的 `delete／copy／gear／release-connect／motor-release／operation-matrix` 等測試未改任何斷言。

## 10. M2 結果（2026-11-12）

**寫出**：下載的作品檔與分享連結寫 `toMotorParts(snapshot)`，封裝（`blocks-envelope`）的 `requires` 多一個 `motor-part-v2`（作品含馬達零件時才有；舊讀取器看到未知旗標會拒絕並說明要新版）。入口是 `storage.js` 的 `toStoredShape(snapshot)`（非同步，按需載入轉換器），呼叫端是 `app.js` 的存檔表單（`saveFile`）與 `share()`；`storedProject` 偵測到馬達零件就加旗標。沒有馬達的作品原物件返回，輸出與今日逐字相同、沒有旗標。模組庫匯出（`downloadJson` 的另一個用途）不是作品，沒動。

**自動存檔（localStorage）維持今日形狀**：資料不離開這台機器，不必每次自動存檔都轉換，也不需要在啟動時載入轉換器；還原走原本的路徑。復原點同樣是今日形狀。兩者只由本版程式讀寫。

**讀入**：所有開啟路徑（開檔、分享連結、自動存檔、內建範例、復原）共用 `normalizeSnapshot` 開頭的 `readStoredProject`；它先拆封裝，若偵測到新形狀的馬達零件（`type:'motor'`、有 `motor` 編號、沒有舊的 `physicalMotor／motorMount`）就套 `toLegacy`，之後的正規化與所有讀取端不變。今日形狀的輸入原物件通過。轉換器 `motor-part-io.js`（含 `motor-part.js`）因啟動大小預算按需載入：`pickWorkFile` 與啟動時的分享連結在正規化前 `await prepareMotorParts(raw)`（只有偵測到馬達零件才載入）；舊形狀的分享連結仍走原本的同步路徑。**矛盾檔案拒絕**：新形狀馬達零件驅動的輸出件上仍帶舊馬達欄位或 `isInput`（手改過），回「作品檔同時含有馬達零件 X 與 Y 上舊的馬達欄位（…），可能被手動改過，為避免讀錯沒有開啟。」，不半轉換。M0 範圍外而原樣保留的舊資料（活塞／滑軌輸入、同軸心多個帶資料的輸出件）不算矛盾。

**存檔 -> 開啟後的資料差異**（`test/motor-part-save.mjs`，52 個含馬達的作品＝全部內建範例與 5 個 fixture）：與存檔前逐欄相同，只有 §8 記載的 8 個冗餘 `physicalMotor` 副本不還原：`tipping-bucket/LeftSide.p1`、`gear-gripper/LeftJaw.p1`、`jansen-leg/Anchor2.p1`、`assembly-lift-gripper(-practice)/LeftJaw.p1`、`clawbot-lift-gripper(-practice)/LeftJaw.p1`、`unit7-start/LeftSide.p1`。每顆馬達 12 個角度的求解逐點相同（684 次掃描）。

**驗證**：檔案與分享連結往返、無馬達作品逐字相同且無旗標、今日形狀的 fixture 檔（含封裝）開啟結果不變、自動存檔仍為今日形狀且可還原、矛盾檔拒絕、未知新旗標仍拒絕。啟動大小 2,191,426 -> 2,194,525 bytes（上限 2,200,000 不變）。

## 驗收紀錄（主模型，2026-11-12）

- M1：桌機與手機實際操作（放回／離開座板與復原、刪輸出桿保留馬達並存檔重開、複製輸出桿、齒輪刪除與分開咬合、翻斗範例刪驅動桿與復原）；Node 全套通過；全套瀏覽器測試與主線基準相同（多出的 iq-linq-lift 單獨重跑兩次通過）。
- M2：桌機與手機實際操作（四連桿與馬達離座作品存檔→重開，零件與參數逐字相同、輸出件無舊馬達欄位、可播放；分享連結新分頁開啟逐字相同）；Node 全套通過；全套瀏覽器測試與主線基準相同（多出的 iq-passive-tools 單獨重跑三次通過，為已知偶發）。
