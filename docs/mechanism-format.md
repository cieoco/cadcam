# 機構 JSON 格式規格 (Mechanism Format Spec)

> 這是「人」與「AI」描述一個閉環機構時**唯一**該遵循的格式。
> 它同時是未來 AI 生成功能裡 `SYSTEM_PROMPT`「可用指令」那一段的來源。
> 驗收由 [`js/core/validation/validate-mechanism.js`](../js/core/validation/validate-mechanism.js) 的
> `validateMechanismJSON()` 執行;測試頁見 [`test/validate.html`](../test/validate.html)。

單位一律 **mm**、角度一律 **度(degree)**。

---

## 1. 頂層結構

```jsonc
{
  "params":     { "theta": 30, "L1": 60, ... },   // ★必要：所有參數的「數值」
  "steps":      [ ... ],                           // ★必要：求解步驟,決定每個點怎麼算出
  "tracePoint": "B",                               //  選填:要畫軌跡的點 id
  "visualization": { "links": [], "polygons": [], "joints": [] }, // 選填:純畫圖
  "parts":      [],                                //  選填:零件摘要
  "_wizard_data": [ ... ],                         //  選填:設計器編輯副本(見 §5)
  "_templateId": "...", "_templateMeta": { ... }   //  選填:範本學習卡
}
```

**核心規則:`steps` + `params` 是「可獨立求解的真相」。** 一份合格的機構 JSON,
光靠這兩個欄位就要能被求解,不依賴 `_wizard_data`。

---

## 2. params(參數值)

- 是一個「名字 → 數值」的對應表,例如 `{ "theta": 30, "Lc": 40 }`。
- `steps` 裡用 `*_param` 欄位填**參數名字**(字串),實際數值來這裡查。
- `theta` 為驅動角度(度);其餘自訂(慣例 `L1/L2/...` 或語意名 `Lc/Lcoup`)。
- 也可在 step 內直接用 `*_val` 寫死數值,略過 params(較不建議,難重用)。

---

## 3. steps:目前支援的 8 種 type

每個 step 必有 `id`(唯一)與 `type`。step 之間用 `id` 互相參照。
求解採「建構式幾何」:被參照的點要先能算出,後面才算得到(單自由度機構)。

### 3.1 `ground` — 固定基準點(地面)
機構**至少要有一個** ground,否則 `NO_GROUNDED_POINTS`。
```jsonc
{ "id": "O2", "type": "ground", "x": 0, "y": 0 }
// 或相對於另一點:
{ "id": "O4", "type": "ground", "dist_param": "Lg", "ref_id": "O2", "ux": 1, "uy": 0 }
```
| 欄位 | 必要 | 說明 |
|---|---|---|
| `x`,`y` | (二選一) | 絕對座標 |
| `dist_param`+`ref_id`+`ux`,`uy` | (二選一) | 沿單位向量 (ux,uy) 距 ref 點 dist |

### 3.2 `input_crank` — 馬達驅動的旋轉曲柄
```jsonc
{ "id": "A", "type": "input_crank", "center": "O2", "len_param": "Lc",
  "physical_motor": "1", "phase_offset": 0 }
```
| 欄位 | 必要 | 說明 |
|---|---|---|
| `center` | ✓ | 旋轉中心(另一點 id) |
| `len_param` | ✓ | 曲柄長(參數名) |
| `physical_motor` | 選 | 對應實體馬達 id(字串) |
| `phase_offset` | 選 | 相位偏移(度) |

### 3.3 `dyad` — 兩圓交點(最常用的連動點)
由兩個已知點各拉一段固定長,交會出新點。四連桿的耦合點就是它。
```jsonc
{ "id": "B", "type": "dyad", "p1": "A", "p2": "O4",
  "r1_param": "Lcoup", "r2_param": "Lout", "sign": 1 }
```
| 欄位 | 必要 | 說明 |
|---|---|---|
| `p1`,`p2` | ✓ | 兩個已知點 id |
| `r1_param`,`r2_param` | ✓ | 各自的桿長 |
| `sign` | 選 | 1 / -1 選哪個交點分支 |

### 3.4 `rigid_triangle` — 兩點 + 三邊長定第三點
```jsonc
{ "id": "T", "type": "rigid_triangle", "p1": "A", "p2": "B",
  "g_param": "base", "r1_param": "side1", "r2_param": "side2", "sign": 1 }
```
| 欄位 | 必要 | 說明 |
|---|---|---|
| `p1`,`p2` | ✓ | 底邊兩端 |
| `r1_param`,`r2_param` | ✓ | 第三點到 p1、p2 的邊長 |
| `g_param` | 選 | 底邊長(預設取 p1-p2 實際距離) |

### 3.5 `slider` — 線與圓交點(滑塊落在軌道上)
```jsonc
{ "id": "P4", "type": "slider", "p1": "P2", "r_param": "L3",
  "line_p1": "P1", "line_p2": "P3", "sign": 1 }
```
| 欄位 | 必要 | 說明 |
|---|---|---|
| `p1` | ✓ | 連桿另一端(圓心) |
| `r_param` | ✓ | 連桿長(圓半徑) |
| `line_p1`,`line_p2` | ✓ | 定義滑軌方向的兩點 |
| `sign` | 選 | 選交點分支 |

### 3.6 `input_linear` — 線性致動器(伸縮缸)
```jsonc
{ "id": "P5", "type": "input_linear", "p1": "P1", "ux": 1, "uy": 0,
  "len_param": "Lbase", "valve_id": "1" }
```
| 欄位 | 必要 | 說明 |
|---|---|---|
| `p1` | ✓ | 起點 |
| `len_param` 或 `baseLen` | ✓ | 基礎長度 |
| `ux`,`uy` | 選 | 伸縮方向單位向量(預設 1,0) |
| `valve_id` | 選 | 對應實體致動器 id |

### 3.7 `point_on_link` — 桿件上的某一點
```jsonc
{ "id": "M", "type": "point_on_link", "p1": "A", "p2": "B", "dist_param": "d" }
```
從 p1 沿 p1→p2 方向移動 dist。

### 3.8 `joint` — 靜態點
```jsonc
{ "id": "X", "type": "joint", "x": 10, "y": 20 }
```
固定座標,通常只供畫圖,不參與求解約束。

---

## 4. tracePoint / visualization / parts

- `tracePoint`:要追蹤畫運動軌跡的 step id;必須存在於 steps,否則 `TRACE_POINT_NOT_IN_STEPS`。
- `visualization.links / polygons / joints`:**只影響畫面**,不影響求解。連桿用 `p1`/`p2` 連兩個點 id,可帶 `color`、`style`(如 `track`/`crank`)。
- `parts`:零件層摘要,供後續 CAD / DXF 使用,不影響求解。

---

## 5. steps 與 _wizard_data 的關係(重要)

兩種資料描述同一個機構,方向相反:

- **設計器流程(人)**:畫圖 → `_wizard_data` → 編譯 → `steps`
- **AI / 交換流程**:直接寫 `steps` + `params`,`_wizard_data` 之後由工具反推

**規範:對外交換或 AI 生成的機構,`steps` 必須非空且自足。** `_wizard_data` 是編輯副本,
可有可無。

> ⚠️ 已知例外:`js/examples/parallel-fourbar.json` 目前 `steps` 為空、機構只存在 `_wizard_data`
> (靠載入時現算)。它會被驗收員標 `TOPOLOGY_STEPS_EMPTY`(warn)。待清理:重存時補上編譯後的 steps。

---

## 6. 驗收員會回的判決代碼

`validateMechanismJSON(json)` 回 `{ status, issues[], counts }`,`status` 為 `pass`/`warn`/`fail`。
每個 issue 帶機器可讀 `code`,未來可直接回灌給 AI 修正。

| code | 級別 | 意義 |
|---|---|---|
| `TOPOLOGY_JSON_PARSE_FAILED` | fail | 不是合法 JSON |
| `INVALID_TOPOLOGY_SHAPE` | fail | 頂層不是物件 |
| `TOPOLOGY_STEPS_MISSING` / `INVALID_TOPOLOGY_STEPS` | fail | 缺 steps / steps 非陣列 |
| `TOPOLOGY_STEPS_EMPTY` | warn | steps 為空 |
| `STEP_ID_MISSING` / `STEP_TYPE_MISSING` / `STEP_TYPE_UNKNOWN` | fail | step 缺 id/type 或 type 不支援 |
| `DUPLICATE_ID` | fail | step id 重複 |
| `NO_GROUNDED_POINTS` | fail | 沒有任何 ground |
| `STEP_FIELD_MISSING` | fail | 缺必填參照欄位 |
| `UNKNOWN_REF` | fail | 參照到不存在的點 id |
| `PARAM_NOT_DEFINED` | warn | `*_param` 取不到值 |
| `GROUND_NO_COORD` | warn | ground 沒給座標(視為原點) |
| `TRACE_POINT_NOT_IN_STEPS` / `TRACE_POINT_UNRESOLVED` | warn | 追蹤點不存在 / 未被求解 |
| `INFEASIBLE_GEOMETRY` / `INVALID_TOPOLOGY` | fail | 桿長配置無解、機構卡死 |
| `SOLVER_THREW` | fail | 求解時拋例外 |

---

## 7. 完整最小範例(可直接驗收通過)

```json
{
  "params": { "theta": 30, "Lc": 40, "Lcoup": 90, "Lout": 70 },
  "steps": [
    { "id": "O2", "type": "ground", "x": 0, "y": 0 },
    { "id": "O4", "type": "ground", "x": 120, "y": 0 },
    { "id": "A",  "type": "input_crank", "center": "O2", "len_param": "Lc", "physical_motor": "1" },
    { "id": "B",  "type": "dyad", "p1": "A", "p2": "O4", "r1_param": "Lcoup", "r2_param": "Lout" }
  ],
  "tracePoint": "B"
}
```
(此即 `test/fixtures/good/fourbar-steps.json`。)
