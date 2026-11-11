# SDD — 馬達是獨立零件（O5 規格，待使用者確認後才施工）

日期：2026-11-11（Asia/Taipei）
狀態：**只有規格，尚未施工。** 這份規格會改變存檔的內部形狀（舊檔開啟時轉換），依 `SDD-OPERATION-PIPELINE` O5 的約定，需使用者確認後才動工。

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
