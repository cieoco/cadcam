# SDD — 模擬補齊與模組組裝（數位樂高 M1）

> 上位原則：[SDD-FTC-MODULES.md](SDD-FTC-MODULES.md)「快速原型＋數位樂高」。本文件是 R3「升降模組及模組接口」的前置規格，也收錄三個模擬面的小修補。
> 施工與驗收記錄寫在 [FTC-LOOP.md](FTC-LOOP.md) 的「M1」節；本文件只定義行為、資料契約與驗收，不記錄施工過程。
> 本輪**不含力學**（扭力、夾持力、碰撞、材料強度）。

## 0. 一句話

讓使用者把一組零件存成「模組」，從模組庫拖出來，裝到另一個模組的輸出端（例如夾爪裝到升降滑台），兩個模組各自保有馬達、一起播放，並且仍然可以拆開、修改、重用。求解器一行不改。

## 1. 現況與缺口（2026-09-29 盤點）

| 項目 | 現況 | 缺口 |
| --- | --- | --- |
| 快速原型 | 放零件 → 接孔 → 改尺寸 → 播放 → 存檔／分享 → SVG／DXF 已通 | — |
| 模組／重用 | 作品只是一堆散零件；範例只能整份載入 | 沒辦法把做好的機構當一塊積木重用、接到別的機構上 |
| 動基座上的傳動件 | 桿件馬達可騎在動桿上（`motorCarrier`，[solver.js:627-667](../js/multilink/solver.js)） | 齒輪／齒條／凸輪／皮帶輪在 solver 第一階段就需要「已知中心」（[solver.js:259-400](../js/multilink/solver.js)），中心在會動的構件上就解不出 |
| 播放速度 | 每幀固定 `PLAY_STEP=2°`（[motion.js:10](../js/blocks/motion.js)） | 速度隨螢幕更新率改變：120Hz 比 60Hz 快一倍 |
| 軌跡 | 每個軌跡點各跑一次完整 `sweepTopology`（[app.js:500-509](../js/blocks/app.js)） | N 個點就解 N×73 次；sweep 結果本來就帶全部點 |
| 漏解偵測 | solver 對部分點無解時仍可能回報 `isValid: true` | 使用者看到零件停在原位，沒有任何提示 |

### L0 實驗證據（scratchpad POC，將轉成 M1a 測試）

以 `competition-rack-lift`（M1 升降）＋ `gear-gripper`（改用 M2）組合：

- **(A) 直接共用點**（把夾爪 GCA 改成 `LiftOutput`、GCB 改 floating）：solver 回報 `isValid: true`，但 `GCB`、`GPB`、`RT` 沒解出。**會靜默失敗。**
- **(B) 模組各自求解＋剛體變換**：M1 ∈ {−40, 0, 60}、M2 ∈ {0, 30} 時，兩齒輪中心距恆為 60.000；GCA 相對 `LiftOutput` 的偏移恆為 0；M1 不影響爪端距（189.82／87.37 只隨 M2 變）。
- **(B′) 旋轉宿主**：夾爪整組旋轉 0.7 rad 後，齒輪銷相對底座的角度差為 0（1e-9 內）。

→ 採用 (B)，見 D1。

## 2. 決策

- **D1 組合方式：模組各自求解，再依「安裝構件位姿」做剛體變換。** 每個模組是獨立的 comps 子集，用現有 `compileTopology`／`solveTopology` 求解，解出的點再乘上「宿主輸出端目前位姿 ∘ 組裝時位姿⁻¹」。不改 solver、不改 topology。否決：(A) 共用點會靜默失敗；讓齒輪支援動中心需要改 solver，違反紅線。
- **D2 樹狀組裝。** 模組之間只透過「一個安裝接口」剛性連接；不允許跨模組共用接點或形成跨模組閉環。FTC 常見組合（夾爪裝滑台、手腕裝臂、進料裝擺臂）都是樹狀。需要閉環的機構請做在同一個模組內。
- **D3 座標不變量 I1：模組零件存的是「組裝姿態（home）下的世界座標」。**
  - 安裝時記下宿主鏈上每顆馬達的角度（`home`）與輸出端當下位姿（`ref`）。
  - 宿主被修改（改長度、移孔）導致輸出端 home 位姿變了，就在 `rebuild()` 時把整個子模組的座標剛體平移／旋轉（rebake）並更新 `ref`，讓 I1 永遠成立；子模組的子模組一併處理。
  - **編輯規則（M1 範圍）**：要選取或拖曳「已安裝模組」內的零件時，先暫停，並把宿主鏈馬達轉回 `home`（狀態列顯示「回到組裝姿態以便修改」）。此時變換為恆等，既有的所有編輯器（桿長、板形、爪端、齒輪、滑軌）不需要改。一般根零件的編輯行為不變。
  - 取捨：學生改零件時升降會先降回組裝姿態，看起來會跳一下；換來的是既有編輯器零修改。若 M0 盤點發現座標讀寫的入口夠集中（≤ 6 處），可改為「任意姿態編輯＋反變換」，由主模型決定並記錄於 FTC-LOOP。
- **D4 馬達：各模組保有自己的馬達編號。** 沿用多馬達 `motorAngles`／`activeMotor` 與控制列 M1/M2 切換；插入模組時若編號衝突，自動換成下一個未用的編號。
- **D5 id 全域唯一。** 插入模組實例時，所有 comp id、點 id、param key、馬達編號都重新命名（沿用 `S.counter`），同一模組插兩次會得到兩組互不相干的零件。
- **D6 模組庫三來源。** 內建模組（由既有範例定義，先收 `gear-gripper`、`competition-rack-lift`）、本機模組（localStorage）、模組 JSON 匯出／匯入。**作品存檔／分享時，實例已經完整展開在作品裡**，接收端不需要有相同的模組庫。
- **D7 不擴張 R1 夾爪任務卡。** `gripperWorkflow` 只在作品「只有夾爪那組零件」時啟用（現有檢查）；R3 組合範例不帶這個 marker。任務卡改成支援模組是後續工作。

## 3. 資料契約

### 3.1 snapshot 新增欄位（選配；沒有模組時**不輸出**，舊檔逐位元組不變）

```jsonc
{
  "kind": "blocks", "v": 1,
  "comps": [ { "type": "gear", "id": "GearA", "moduleId": "Grip1", ... } ],  // comp.moduleId：所屬模組；沒有＝根
  // 注意：不可用 comp.module——齒輪既有欄位 module 是「模數」（M0 發現）
  "modules": [
    {
      "id": "Lift1",                     // safeId
      "name": "齒條升降",                 // ≤ 40 字
      "source": "competition-rack-lift", // 選配：內建模組來源，僅供顯示
      "base": "LPC",                     // 選配：此模組的安裝把手點（必須是本模組的 fixed／motor 點）
      "outputs": [
        { "id": "carriage", "name": "滑台", "at": "LiftOutput",
          "body": { "kind": "rack", "id": "LiftRackGear" } }
      ],
      "mount": null                      // null＝基座固定在世界
    },
    {
      "id": "Grip1", "name": "齒輪夾爪", "base": "GCA", "outputs": [],
      "mount": {
        "to": { "module": "Lift1", "output": "carriage" },
        "ref":  { "x": 45, "y": 88, "a": 90 },   // 安裝時輸出端的世界位姿（a 為度）
        "home": { "1": 0 }                        // 安裝時宿主鏈上各馬達角度（度）
      }
    }
  ]
}
```

### 3.2 構件位姿 `body`（輸出端的「剛體」是誰）

| kind | 原點 | 方位角 |
| --- | --- | --- |
| `bar` | `p1` 解出位置 | `p1 → p2` |
| `triangle` | `p1` | `p1 → p2` |
| `rack` | `p1` 解出位置 | 常數 `axisDeg`（齒條只平移） |
| `slider` | `p3`（滑塊）解出位置 | 常數：軌道 `p1 → p2` |
| `points` | 點 `a` | `a → b`（兩點必須在同一剛體上，由建立者負責） |

`at` 是輸出端上的吸附點（使用者拖模組 `base` 靠近它時吸附），必須是 `body` 上的點。

### 3.3 正規化規則（`schema.js` 呼叫純函式 `normalizeModules`）

- `modules` 最多 16 個；id 不安全或重複則丟棄該模組並警告。
- `name` 去除 `< > " ' `` ` 並截到 40 字——share-codec 的字元閘遇到這些字元會拒絕整份分享連結（[share-codec.js:23](../js/share-codec.js)）。
- `comp.moduleId` 指向不存在的模組 → 移除標記、該零件回到根，警告。
- `outputs[].body` 指向的零件不屬於本模組、或 `at` 不存在 → 丟棄該輸出，警告。
- `mount.to` 指向不存在的模組／輸出，或形成安裝迴圈 → `mount` 改為 `null`（模組留在目前座標、固定在世界），警告。
- 跨模組共用點 id（違反 D2）→ 載入失敗訊息並保留目前作品（比照非法載入不覆寫的既有規則）。
- 沒有任何模組時，`toSnapshot` 不輸出 `modules` 鍵，`comp.moduleId` 也不存在。
- 各 `normalizeXxx` 目前會丟掉未知欄位；M1a 要讓每種零件都保留合法的 `moduleId`（M0 驗證：現行 schema 會把它全部丟掉）。

## 4. 行為規格

### 4.1 組合求解 `js/blocks/assembly.js`（純函式，不碰 DOM）

```
compileAssembly(comps, modules, topo)  → { root, byModule: Map<id, compiled>, order: [moduleId…] }
solveAssembly(asm, params)             → { isValid, points, B, perModule }   // 與 solveTopology 同形
sweepAssembly(asm, params, start, end, step) → 與 sweepTopology 同形
rebakeModules(comps, modules, params)  → { comps, modules }                  // 維持 I1
bodyPose(body, points, comps)          → { x, y, a }
```

- 沒有 `modules`（或為空）時：`compileAssembly` 退化為單一 `compileTopology`、`solveAssembly` 直接回傳 `solveTopology` 的結果物件，**與現況完全等價**（E-M3 保證）。
- 求解順序：根 → 依 `mount` 拓撲排序。每個模組用同一份 `params`（`thetaDeg`、`motorAngles`、`_prevPoints`）求解，解出的點乘上變換 `T = pose(host 輸出端, 現在) ∘ ref⁻¹` 後併入 `points`。
- 宿主輸出端算不出位姿（宿主無解）→ 該模組及其子模組本幀視為無效，`isValid` 為 false，`perModule` 標出是哪一個。
- `_prevPoints` 以世界座標傳入；對子模組要先乘 `T⁻¹` 轉回模組座標再當種子。

### 4.2 app 整合（M0 修訂：雙軌——繪製用整體編譯、求解用組合）

**`S.compiled` 維持「全部零件一起編譯」**（模組間不共用點，只是幾個互不相連的子圖），繪製、3D、馬達安裝、`displayPoint` 全部照舊讀它。**另加 `S.assembly = compileAssembly(...)` 專供求解**。M0 核對：`S.compiled` 只有 app.js 讀（22 處），全部改寫不划算；整體編譯對 fixture 可正常編譯與求解。

改走 assembly 的求解呼叫點只有 4 處（沒有模組時行為不變）：
`app.js` 的 `rebuild`（多編一份 assembly、並呼叫 `rebakeModules`）、`solveFrame`（solve）、`getTrajectoryData`（`traceSweeps` 內的 sweep 需有 assembly 版本）、`motion.js` 的 `walkBranch`（`planMotion` 探路）。不改：`model.js` 的 `displayPoint`（D3 規則下編輯模組時處於 home 姿態，整體編譯的解與組合解相同）、`gripper-workflow.js`（D7）。

- **世界機架只排除三處**（皆在 app 的包裝層，傳入「排除已安裝模組零件」的 comps 即可）：`frameNodeIds`（拖曳機架把手、機架吸格——否則拖機架會把掛在滑台上的夾爪底座一起搬走）、`frameNodes`／`frameConnectorNodes`（機架連線繪製與 `frame` 匯出）。
- **`groundIds` 不排除**：馬達朝向找「最近機架點」、3D 疊層從固定點起算（[motor-mounts.js:55,142](../js/blocks/motor-mounts.js)、[scene-model.js:43](../js/blocks3d/scene-model.js)），對已安裝模組而言它自己的底座點正該扮演這個角色。只有節點外觀要改：`renderNodes` 多收一個 `mountedBaseIds`，這些點畫成「鎖在宿主上的孔」（不畫地錨樣式）。
- **`pointIsGround`（34 處）不改**：在 D3 規則下，模組的固定點在模組內的編輯語意本來就是「固定」。
- **合併防呆**：拖曳吸附（`mergePoints` 6 個呼叫點，app／input／tools）與畫桿起點／終點，若兩點屬於不同模組 → 不合併，狀態列提示「不同模組只能用安裝接口連接」。新畫的零件歸屬起點所在的模組。
- **自由度**：`analyzeDof` **不改**——每個模組各自有底座，對整體分析的結果等於各模組相加（M0：fixture 升降 1＋夾爪 1＝整體 2）。
- **輸出端標記**：`at` 畫成可吸附的接口標記（只在選取模組或拖曳模組時顯示）。
- **匯出**：採「另出 `<模組名>-frame`」。`exportFrameAsSvg`／`exportFrameAsDxf`／`frameExportWarnings` 本來就吃一組 `frameNodes` 陣列（[exporters.js:1075-1083](../js/blocks/exporters.js)），對每個已安裝模組用它自己的零件再呼叫一次即可；馬達安裝座依 `splitMountsByHost` 分到各模組。座標用 home 姿態（加工只需相對位置）。
- **已知風險（M1 不處理，列入驗收觀察）**：`buildMotorMounts` 的朝向用靜態座標計算（[motor-mounts.js:136-148](../js/blocks/motor-mounts.js)）；宿主若會「旋轉」，模組上的馬達外觀朝向可能停在 home。R3 的齒條滑台只平移，不受影響。

### 4.3 模組操作（UI，沿用既有面板，不新增常駐側欄）

1. **存成模組**：選取任一零件 → 零件設定列「存成模組」→ 把與它以共用接點相連、且尚未屬於其他模組的整組零件標記為新模組；輸入名稱；`base` 預設為該組第一個 fixed／motor 點。不需要多選。
2. **模組庫**：零件盤新增「模組」分頁：內建＋本機模組清單；點選或拖出即插入實例（D5 重新命名），放在畫面中央，`mount: null`。
3. **安裝**：拖曳模組的 `base` 把手靠近另一模組的輸出端 `at` → 綠圈吸附 → 放開即安裝：整組平移讓 `base` 落在 `at`，寫入 `mount.ref`／`mount.home`。M1 不自動旋轉；方位以使用者放下時為準。
4. **拆下**：選取已安裝模組 → 「拆下」→ 模組留在目前世界位置，`mount = null`（先依目前姿態 rebake）。
5. **解散模組**：只允許未安裝的模組；移除所有 `comp.moduleId` 標記與該模組條目，零件回到根。
6. **匯出／匯入模組 JSON**：本機模組可下載為 `.blocks-module.json`，匯入時走與作品相同的 schema 正規化（只接受 kind 為 `blocks-module`）。
7. 上述每個動作都是一次 undo；存檔、分享、autosave、範例切換都保留 `modules`。

### 4.4 模擬補齊（與模組無關，可先做）

- **S1 依時間播放**：播放角速度改為「度／秒」，以 `requestAnimationFrame` 的時間戳計算 `dt`（上限 100 ms，避免切分頁回來瞬間暴衝）。預設 120°/s，等於現在 60Hz × 2°。`PLAY_STEP` 保留給 `walkBranch` 探路用，不改。
- **S2 軌跡一次掃完**：`getTrajectoryData` 對同一份 compiled 只跑一次 sweep，從 `results[].points` 取出各軌跡點；輸出資料格式不變。
- **S3 漏解警示**：新增純函式 `unsolvedMovingPoints(comps, sol)`：列出非 fixed、非 `workpiece`、有被零件引用、但 `sol.points` 沒有的點 id。有漏解時狀態列顯示「有 N 個接點沒有被帶動（停在原位）」並在 tooltip 列出 id。只提示，不阻止播放。

## 5. 驗收

### 自動（`node test/<name>.mjs`，沿用 `_harness.mjs`）

- **E-S1**：`advanceByTime(theta, dtMs, degPerSec)` 在 dt=16.67 ms、120°/s 時前進 2°±0.01；dt>100 ms 以 100 ms 計；rock 模式搭配 `advanceRock` 不越界。
- **E-S2**：所有 `BLOCK_EXAMPLES` 的軌跡點，新舊算法逐點相同（1e-9）。
- **E-S3**：所有範例在 θ=0 回傳空陣列（基準：只有 `INTAKE_OBJECT` 是 workpiece，須被排除）；L0 的 (A) 共用點組合回傳 `['GCB','GPB','RT']`（順序不拘）。
- **E-M1**（升降＋夾爪）：M1 ∈ {−40, 0, 60} × M2 ∈ {0, 30}：兩齒輪中心距 60±1e-6；GCA 相對 `LiftOutput` 偏移不變；M1 不改變爪端距；M2 不改變 `LiftOutput`。
- **E-M2**（旋轉宿主）：夾爪裝在有馬達的桿上，桿轉 0°／45°／90° 時齒輪銷相對底座角度差 < 1e-9，中心距不變。
- **E-M3**（零回歸）：沒有 `modules` 的所有範例，在 0／90／180／270° 下 `solveAssembly` 與 `solveTopology` 的 `points` 完全相同；`sweepAssembly` 同理。
- **E-M4**（schema）：完整往返；3.3 每一條錯誤規則各一個 fixture；沒有模組時輸出的 snapshot 與改版前逐位元組相同。
- **E-M5**（rebake／I1）：把升降齒條加長、或把 `LiftOutput` 孔位移動後 rebuild，夾爪座標同步平移，且在 home 姿態下 `solveAssembly` 的夾爪點與 comps 座標一致（1e-6）。
- **E-M6**（插入實例）：同一模組插兩次，所有 id／param／馬達編號不衝突；兩組獨立運動。
- **E-M7**（合併防呆）：純函式 `canMergePoints(comps, idA, idB)`，跨模組回傳 false，同模組或都在根回傳 true。
- 既有全部 `test/*.mjs` 與 `test_blocks_schema.mjs` 維持通過。

### 瀏覽器（`python -m http.server 8000`，桌機 1280×800 與窄畫面 ~508 寬）

- **E-M8（R3 情境）**：從模組庫插入「齒條升降」與「齒輪夾爪」→ 把夾爪 `base` 拖到滑台接口吸附 → 播放 M1 升降，夾爪跟著上下且不脫咬 → 切到 M2 開合夾爪 → 暫停在升起姿態，點夾爪爪端改長度（應先回到組裝姿態）→ 復原 → 存檔／重載／分享連結還原 → 3D 預覽播放 → 拆下 → 解散。console 無 error。
- **E-S1b**：播放速度在桌機與窄畫面肉眼一致；切到別的分頁再切回來，機構不會一次跳一大段。
- **E-S3b**：用 L0 (A) 的錯誤接法手動組出來，狀態列出現漏解提示。

### 證據邊界

模組可組合、可播放，不代表實體接口可裝配、無碰撞或結構強度足夠；匯出若僅提示底座未產生加工檔，不能宣稱模組作品已可加工。

## 6. 紅線

- 不改 `js/multilink/solver.js`、`js/core/topology.js`。
- comps 維持 plain JSON；舊檔、分享連結、範例不遷移、不改寫。
- 零相依、無 build step；新功能放子模組（`assembly.js`、`module-editor.js`），`app.js` 只做接線。
- 不動凍結的 mechanism 應用；不擴張 R1 夾爪任務卡（D7）。

## 7. 開放問題（M0 已回答，2026-09-29）

1. **D3 編輯規則 → 維持「回到組裝姿態再編輯」。** 座標寫入入口不集中：`updatePointCoordsById` 24 處／9 檔、`pointCoords` 40 處、`worldFromEvent` 21 處，遠超過 6 處門檻，反變換做不乾淨。
2. **匯出 → 另出 `<模組名>-frame`**，成本低（見 §4.2）。
3. **讀 fixed 點的地方**共 109 處／16 檔，但只需排除三個世界機架入口（`frameNodeIds`、`frameNodes`、`frameConnectorNodes`）與節點外觀；`groundIds`、`pointIsGround`、`analyzeDof` 不改（見 §4.2）。
4. **內建模組第一版只收兩個**：齒條升降（`competition-rack-lift`）與齒輪夾爪（`gear-gripper`）。R3 驗收只需要這兩個；其他範例等模組流程穩定後再逐個評估是否適合當模組。

附帶發現：`comp.module` 會與齒輪的模數欄位撞名，改為 `comp.moduleId`；share-codec 的字元閘會拒絕含引號的模組名稱，正規化時需過濾。
