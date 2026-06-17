# SDD — AI 機構生成的地基工程

> 這份文件規畫「讓 AI 能生成機構」之前,**必須先打穩的地基**。
> 它不碰 AI 本身,只做兩件事:把機構的 JSON 寫法**定死寫清楚**、把檢查器**整理成可單獨呼叫的驗收工具**。
>
> 註:repo 另有一份 `SOFTWARE_DESIGN_DOCUMENT.md`,那份講的是馬達 / digital twin,與本文無關。

---

## 1. 為什麼要做這個(白話版)

最終目標:使用者說一句話 → AI 生出一個可用的機構。

要走到那步,中間有兩樣東西要先穩:

1. **一套固定的「機構說明書寫法」** —— 讓人跟 AI 都照同一種格式寫機構。現在這個格式存在,但散在三個地方、寫法不完全一致。
2. **一個「驗收員」** —— 給它一份機構 JSON,它會算算看並回報「✅ 能動 / ⚠️ 有疑慮 / ❌ 壞在哪」。這個已經有八成,但跟 UI 綁著,還不能單獨拿來用。

AI 其實是最後、最簡單的一步(只是照格式填空)。**這份 SDD 只做上面那兩樣地基。**

---

## 2. 現況盤點(從程式碼實際撈出來的)

### 2.1 機構 JSON 目前長這樣

一份機構(topology)頂層物件:

```jsonc
{
  "steps": [ ... ],            // ★ 核心:求解步驟,決定每個點怎麼算出來
  "tracePoint": "P4",          // 要追蹤畫軌跡的點 id
  "params": { "L1": 60 },      // 參數值(L1, L2…);← 目前還在飄,見 §5
  "visualization": {           // 純畫圖用,不影響求解
    "links": [], "polygons": [], "joints": []
  },
  "parts": [],                 // 零件摘要
  "_wizard_data": [ ... ],     // 設計器可編輯的「桿/三角/滑塊」視圖
  "_templateId": "slider-track",
  "_templateMeta": { ... }     // 學習卡(learningGoal/keyParams/...)
}
```

### 2.2 `steps` 裡目前實際支援的 8 種 type

(來源:`js/multilink/solver.js` 第 1074–1258 行,這是唯一真相)

| type | 意義 | 必填欄位 | 選填 |
|---|---|---|---|
| `ground` | 固定基準點 | `id` + (`x`,`y`) 或 (`dist_param`,`ref_id`,`ux`,`uy`) | `x_param`/`y_param`/`*_offset` |
| `input_crank` | 馬達驅動的旋轉曲柄 | `id`,`center`,`len_param`,`physical_motor` | `phase_offset`(度) |
| `input_linear` | 線性致動器(伸縮) | `id`,`p1`,`ux`,`uy`,`len_param` | `valve_id`,`baseLen` |
| `dyad` | 兩圓交點(最常用的連動點) | `id`,`p1`,`p2`,`r1_param`,`r2_param` | `sign`(1/-1 選分支) |
| `rigid_triangle` | 由兩點 + 三邊長定第三點 | `id`,`p1`,`p2`,`g_param`,`r1_param`,`r2_param` | `sign` |
| `slider` | 線與圓交點(滑塊落在軌上) | `id`,`p1`,`r_param`,`line_p1`,`line_p2` | `sign` |
| `point_on_link` | 桿件上的某一點 | `id`,`p1`,`p2`,`dist_param` | — |
| `joint` | 靜態點(多半只給畫圖用) | `id`,`x`,`y` | — |

規則:`*_param` 欄位填的是參數名字(如 `"L1"`),實際數值去 `params` 找。step 之間用 `id` 互相參照,且**前面的 step 要先算得出來,後面才算得到**(建構式幾何,單自由度)。

### 2.3 驗收員目前的狀態

已經有三道檢查 + 一個統一輸出格式:

- `validation/input-validator.js` —— 第一關:JSON 解析、格式、重複 id
- `validation/topology-validator.js` —— 第二關:有沒有基準點、元件結構、`tracePoint` 對不對得上 `steps`
- `validation/solve-validator.js` —— 第三關:解得出來嗎、是否約束不足、有沒有點解不出來
- `validation/health-report.js` —— 統一輸出:每個問題都有 `status`/`code`/`message`/`suggestion`/`targets`

✅ 好消息:`health-report` 的 `code` 已經是**機器可讀**的,這正是未來回灌給 AI 的關鍵。
⚠️ 問題:這三關目前是被 UI 預覽流程串起來呼叫的,**沒有一個「給我一份 JSON、還我一張判決」的單一入口**。

---

## 3. 這次要交付的東西(Deliverables)

### D1 —— 機構 JSON 格式正式規格 `docs/mechanism-format.md`
把 §2.1 / §2.2 擴寫成完整、唯一的規格:
- 每種 step type 的欄位、型別、範圍、預設值
- 哪些是「給求解用」、哪些是「給畫圖用」、哪些是 `_` 開頭的內部欄位
- `params` 數值該放哪(見 §5 待定項,要在這份規格裡拍板)
- 這份文件**同時就是未來 AI 的 `SYSTEM_PROMPT` 裡「可用指令」那段的草稿**

### D2 —— 單一驗收函式 `js/core/validation/validate-mechanism.js`
新增一個純函式,不碰 DOM:

```js
// 輸入:一份機構 JSON(字串或物件)
// 輸出:一張判決
validateMechanismJSON(input) => {
  status: 'pass' | 'warn' | 'fail',
  issues: [ { status, code, message, suggestion, targets } ],
  counts: { pass, warn, fail }
}
```

內部就是把現有三關 + (可選)跑一次 solver 串起來,**重用現有程式碼,不重寫檢查邏輯**。這就是「驗收員」的乾淨入口。

### D3 —— 測試樣本 + 瀏覽器測試頁
- `test/fixtures/good/*.json` —— 已知能動的機構(含一個純 steps+params 的 AI 風格樣本)→ 應無 FAIL
- 既有三個範本(`js/examples/*.json`)也納入 GOOD 名單,直接引用、不複製
- `test/fixtures/bad/*.json` —— 故意做壞的機構,每個對應一個預期的 `code`
- `test/validate.html` —— 瀏覽器測試頁,跑完所有樣本、印出結果表

> 註:本環境僅有 Python、無 Node。驗收改用「瀏覽器測試頁 + `python -m http.server`」進行,
> 完全留在「純靜態、無 build」的世界,且更忠實(驗收員未來就是在瀏覽器裡被 AI 功能呼叫)。

---

## 4. 不做什麼(守住範圍,出自 `.agent/rules.md`)

- ❌ **不碰 AI**:這次完全不接 LLM、不寫 prompt 串接。
- ❌ **不改 solver 數學**:`multilink/solver.js` 的計算邏輯一行都不動,只「讀」它來對齊規格。
- ❌ **不重構 UI**:`controls.js`、`wizard.js` 不動。新驗收函式是「多一個入口」,不是改舊流程。
- ❌ **不順便改格式**:現有範本 JSON 維持可用;若發現格式裂縫(見 §5)先記錄、不擅自改。

---

## 5. 過程中要拍板的待定項(現在還在飄的)

這些是「地基還沒抹平」的地方,規格(D1)要明確選一個答案:

1. **`params` 數值放哪?** 現在數值來自 UI 動態參數,範本 JSON 裡不一定自帶。但 AI 生出來的機構必須**自帶數值**才能獨立驗收。→ 規格需規定 `params` 為機構 JSON 的必要欄位。
2. ~~**`_wizard_data` 跟 `steps` 誰是主?**~~ ✅ **已拍板**:`steps`+`params` 是可獨立求解的真相,AI 只生這個;`_wizard_data` 是設計器編輯副本。詳見 `docs/mechanism-format.md` §5。(驗收時發現 `parallel-fourbar.json` 違反此規範:steps 為空,待清理。)
3. **散落的暫存檔**:根目錄 `_tmp_topo.json` / `_tmp_topo2.json` / `_tmp_topo3.json` 要不要清掉。
4. **小裂縫**:`mechanism-config.js` 的 `crankslider` 有重複的 `motorRotation` 參數(第 259–278 行)。

---

## 6. ★ 驗收方式(Acceptance)

因為專案沒有 test runner,驗收用「樣本 + node 腳本」進行,符合現有「純靜態、無 build」的調性。**這套驗收本身,日後就是 AI 的把關器與 reward signal。**

### 6.1 怎麼跑

從專案根目錄啟動靜態伺服器,開啟測試頁:

```bash
python -m http.server 8000
# 瀏覽器開 http://localhost:8000/test/validate.html
```

頁面對每個樣本呼叫 `validateMechanismJSON()`,比對「實際判決」與「預期判決」,
最上方顯示 `N passed / 0 failed`,下方是逐列結果表(GOOD 看 counts.fail===0,BAD 看是否命中預期 code)。

### 6.2 驗收標準(全部達成才算這次地基完成)

| # | 標準 | 怎麼確認 |
|---|---|---|
| A1 | 三個現有範本(parallel-fourbar / gripper / slider-track)全部回 `pass` | 跑腳本,GOOD 區全 ✓ |
| A2 | 至少 6 個故意做壞的樣本,各自回出**正確的 `code`** | 跑腳本,BAD 區全 ✓,且 code 精準 |
| A3 | `validateMechanismJSON()` 不依賴 `window`/DOM | 它被測試頁以純 module 直接 import 呼叫,不經預覽流程即證明 |
| A4 | 規格文件(D1)涵蓋全部 8 種 step type,且 §5 四個待定項都有結論 | 人工檢視文件 |
| A5 | 既有 UI 預覽 / 設計器行為**完全不變** | 開瀏覽器手動操作三個範本,動畫與 diagnostics 與改動前一致 |

### 6.3 必備的故意做壞樣本(對應 §2.3 既有的 code)

- `no-ground.json` → `NO_GROUNDED_POINTS`
- `dup-id.json` → 重複 id(input-validator 既有)
- `unknown-ref.json` → step 參照到不存在的點
- `empty-steps.json` → `TOPOLOGY_STEPS_EMPTY`
- `trace-missing.json` → `TRACE_POINT_NOT_IN_STEPS`
- `infeasible.json` → `INFEASIBLE_GEOMETRY`(桿長湊不出交點,機構卡死)

---

## 7. 工作順序

```
步驟1  盤點對齊:讀 solver 把 8 種 type 欄位確認到位 ──┐(本文件 §2 已完成大半)
步驟2  寫 D1 規格文件,順便對 §5 拍板               │
步驟3  寫 D2 validateMechanismJSON()(串現有三關)   │
步驟4  做 D3 樣本 + 腳本                            │
步驟5  跑驗收 §6.2,A1–A5 全綠                      ┘
步驟6  (這次到此為止)交棒給未來的 AI 接頭工程
```

完成這六步,地基就穩了。之後接 AI 時,`SYSTEM_PROMPT` 直接抄 D1,把關器直接用 D2,重試迴圈直接讀 D2 吐的 `code` —— 全部都是現成的。
