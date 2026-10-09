# SDD — 首例：沿用雙齒輪夾爪，驗證人工與 AI 共用操作

日期：2026-10-10（Asia/Taipei）  
基準：`c318c6c`；狀態：W1–W4 實作與驗收完成（本地 2026.10.10.2，未發布）。  
上位方向：[Blocks／AI／教學 SDD](SDD-BLOCKS-AI-TEACHING.md)。既有功能依 [FTC 模組 SDD](SDD-FTC-MODULES.md)，不重做 R1／R1b。

## 1. 決策：首例重用什麼

使用者要求 LOOP、省 token、適合模型，並避免重複造輪子。盤點後選用既有 `gear-gripper` 作為第一個 AI 操作試點，而不是先新增單側伺服或另一個平行夾爪。

這是對稱雙齒輪、雙側旋轉夾爪，一個模擬動力輸入；不是平行夾爪，也不是已完成選型的單伺服實物。先讓現有作品可以被結構化建立／修改／驗證，日後硬體版再核對伺服、傳扭連接、板厚與加工條件。不得為省事把齒輪、馬達名稱改成伺服就宣稱硬體完成。

本輪成功情境：選既有範例 → 輸入物件寬度與單側餘量 → 得到相同夾爪的獨立候選、開合角及診斷 → 確認一次 → 可復原、保存、重開及下載既有製作記錄。人工輸入與 AI 結構化請求得到等價結果。

## 2. 已有能力與證據

| 現有檔案／入口 | 已有能力 | 本輪處置 |
| --- | --- | --- |
| `js/blocks/examples.js`：`getExample('gear-gripper')` | 四個零件 GearA／GearB／LeftJaw／RightJaw，可編輯 snapshot | 直接複製來源，不另存第二份範例常數 |
| `gripper-workflow.js`：`planGripper`、`gripperTips` | 結構、齒輪中心距、對稱性、圓頭淨距、有效開合區间 | 原樣重用數學；必要時只補穩定診斷代碼 |
| `gripper-controller.js`：`createGripperController` | 任務啟用、草稿、單次 undo、姿態、重算及取消 | 對接共同候選；保留現有拖曳／表單與手機流程 |
| `gripper-object.js` | 示意物件、拖曳／鍵盤改寬、固定參考位置 | 保留，不能另造 AI 專用畫布 |
| `gripper-download.js`、`gripperBuildRecord` | Markdown 製作記錄與內嵌作品、下載生命週期 | 直接沿用；非 DXF 製造驗收證明 |
| `schema.js`、`storage.js` | 正規化、snapshot、分享與保存 | 維持 blocks v1；不改作品格式 |
| `core/topology.js`、`multilink/solver.js`、`plate-geometry.js` | 求解與共用夾指幾何 | 不重寫算法 |
| 既有 assembly／candidate／export 流程 | 後續可組立／輸出能力 | 本輪不改組立、不擴充碰撞或孔位模型 |

本輪實際重跑（不是引用歷史結果）：`node test/gripper-workflow.mjs` 11 cases、`gripper-controller.mjs` 16/16、`gripper-object.mjs` PASS、`gripper-download.mjs` 8/8，四組 exit 0。此次未重跑全套，也未重新驗收產品瀏覽器操作；不能據此宣稱新 API 已完成。

已確認限制：planner 僅接受原始四零件對稱結構與特定 ID；物件寬 10–150 mm、單側餘量 2–40 mm 是輸入邊界，不保證每組值可達。它估算圓頭橫向淨距，不是接觸／夾持力／完整干涉模擬。模型角度不能直接當伺服命令。

## 3. 最小增量與不做事項

新增窄的、無 DOM 的操作入口，暫定 `js/blocks/gripper-operations.js`；由實作盤點確認是否有可直接沿用的共同命令模組後再建立。它負責請求檢查、複製作品、呼叫既有 planner 與回傳差異，不計算另一套運動。

本輪僅開放兩個任務參數：`gripperObjectWidth`、`gripperClearance`。兩者調整任務與開合範圍，**不等於 AI 已會修改實際夾指長度**。任意桿長、齒比、組立、任意作品拓撲、自然語言推理及外部 MCP 傳輸均不在本輪。下例擴充前檢查真正共用需求，不先設計龐大的 command bus。

## 4. 擬定操作契約（待施工，版本 1）

```json
{
  "operationVersion": 1,
  "action": "createFromExample",
  "exampleId": "gear-gripper",
  "parameters": { "gripperObjectWidth": 50, "gripperClearance": 10 }
}
```

修改使用 `action: "updateTask"`，另傳來源 snapshot；其餘允許參數相同。未提供欄位保留範例或來源值；未知 action、exampleId、欄位、字串數字、NaN、Infinity、越界或缺失來源明確拒絕，不靜默套用預設。

暫定純函式 `prepareGripperOperation(sourceSnapshot, request)`：建立時讀範例副本；修改時使用完整來源副本。不得從全域 S 或 DOM 讀作品。結果包括：

- `ok`、`operationVersion`、`issues`（code、severity、message、targets）、`changes`（path、before、after）。
- 有效時 `candidateSnapshot`、`plan`；無效時不得產生可確認的候選。診斷可附調整建議，但不自動替使用者改尺寸。
- 完整保留任務未修改的合法欄位；核對正規化前後差異，非本操作必要的修補需明列且阻擋確認，避免丟資料。
- `planGripper` 的既有 `{ok,message}` 相容；如增 `code`，在原分支直接標示，不用中文 message 字串比對猜錯誤類型。初始代碼：INVALID_REQUEST、UNSUPPORTED_STRUCTURE、INVALID_DIMENSIONS、UNREACHABLE、NORMALIZATION_CHANGED、STALE_SOURCE。

瀏覽器確認另走薄 adapter：保留來源 revision／snapshot 比對；確認前檢查當前作品未變、候選仍有效，再走既有 pushUndo／套用／重建／保存路徑。完整批次只一筆 undo；同值修改不增 undo。取消零副作用；確認後候選失效，不能重複套用。確認不得因已無效的舊 plan 而使用上次有效資料。

來源為組立或加過零件的作品時，updateTask 按現有 planner 能力明確拒絕；不要拆掉其他模組以湊出四零件。createFromExample 是建立獨立草稿，不隱式替換目前作品；套用入口明確說明其作用範圍並保留完整復原。

## 5. UI、AI 與教學的驗證方式

- 現有任務卡拖曳／表單經相同 prepare 邏輯驗證；不新增常駐 AI 工程面板。保持原本預覽、取消與操作手感。
- 提供最小隔離驗收頁／Node 驅動：結構化 JSON 請求 → 候選與差異 → 現有作品載入／確認。測試頁不列入學生導航，不讀寫使用者 autosave。
- AI 先在開發驗收中生成上述工具請求，交給同一操作入口，取得機器可讀結果再修正。模擬工具呼叫測試與真正模型產生請求須分開記錄；沒有外部 LLM 或 MCP 不假稱已完成端到端服務。
- 教學沿用已有案例入口，補短文即可：學習「寬度與餘量影響所需開口」→ 50 mm／10 mm → 改成 80 mm／10 mm → 比較角度與可達性 → 試找一組不可達條件並解釋。不得把幾何閉合標成已夾住物件。
- 圖解由同一 snapshot／plate geometry 產生張開與閉合兩姿態，標固定軸與零件 ID；不能用無法對回作品的生成圖片作工程驗收。

## 6. LOOP 工作包與模型

任何時刻只有一個寫入者。主代理保管規格、整合與驗收；子代理只拿一包的函式、檔案、契約和測試，不複製整段歷史。不得兩個模型各做一套方案。小文件包直接完成。

| 包 | 工作與預期檔案範圍 | 完成門檻 | 適合模型 |
| --- | --- | --- | --- |
| W0（本次） | 本 SDD、上位 SDD 連結；讀取原模組／跑四組基準 | 可重用清單、缺口及不重做決策有依據 | 主代理＋Luna 唯讀盤點 |
| W1 | `test/gripper-operations.mjs`、test manifest；純操作入口、必要 planner code | 已知好／壞請求、來源不變、參數與 plan 一致 | Sol medium |
| W2 | `gripper-controller.js`、必要 app 接線、controller 測試 | UI／JSON 等價、預覽取消、一次 undo、過期拒絕 | Sol medium；狀態問題才 high |
| W3 | 隔離驗收頁、案例圖解／短教學、必要相關測試 | 建立→修改→驗證→確認→保存重開走通；手機／桌面 | Sol medium；文案可由 Luna 唯讀審閱 |
| W4 | 版本映射、相關文件與實際驗收證據 | 定向＋全套＋載入檢查；交付能力與限制清楚 | 主代理整合 |

選用模型以環境實際提供及使用者授權為準；優先省去不必要交接。兩輪沒有實質進展先縮小 fixture，再考慮 Astra low 做疑難唯讀審查，不直接提高推理強度。不虛報 token 節省百分比。MCP 接頭另立小包，待共同操作可驗證後再做。

W1 先驗證最小負例能抓住問題，再實作；每包只跑相關驗收，通過再進下一包。W4 才做必要全套；結果不變不重跑。新增 .mjs 要加入現有 `test/manifest.json`，不另造 runner；程式模組改動依 `tools/load-graph.mjs` 既有流程更新／檢查。

## 7. 驗收矩陣

| 案例 | 必須成立 |
| --- | --- |
| 建立預設範例、50／10、80／10 | 重用現有範例；planner 可達時幾何結果與原入口相同 |
| 合法範圍內但不可達、非法尺寸／未知參數 | 明確 code；沒有可確認候選，不污染來源 |
| 非四零件／非對稱／錯中心距／舊外彎作品 | 保留原資料，拒絕超出能力操作；不自動升級拓撲 |
| 同值修改、拖曳多次預覽、取消 | 不堆疊 undo，不改來源／autosave |
| 一次修改兩參數並確認 | 一筆 undo；undo 還原完整作品，不只還原兩個數字 |
| 預覽後手動改作品、重複確認 | 拒絕過期／已消費候選，保留較新作品 |
| 保存／分享重開、下載製作記錄 | 同一參數、plan 與 snapshot；未修改欄位保留 |
| 張開至閉合的有效區間掃描 | 孔距固定、有限解、左右對稱、目標淨距符合既有容差 |
| 瀏覽器 390px 手機尺寸及桌面 | 既有入口可完成，無新增遮擋／console error；不宣稱實機已測 |
| AI 驗收請求與人工等價 | 固定 JSON 測試可重現；真正 AI 產生的請求另留最小紀錄 |

既有四組回歸不能刪掉或放寬。定向執行 `node test/gripper-workflow.mjs`、`node test/gripper-controller.mjs`、`node test/gripper-object.mjs`、`node test/gripper-download.mjs`，再新增操作測試。發布前依現行流程執行 `node tools/test-runner.mjs` 及載入圖檢查；不在規劃文件填未執行的成功數字。

## 8. 完工界限與後續

本試點完工只代表「既有夾爪可被人工及結構化工具請求建立／修改任務／驗證，且完整作品流程可靠」。不代表任意機構生成、自然語言服務上線、MCP 已部署、實物夾持成功或全部加工圖完成。

硬體階段需確認伺服型號／行程、齒輪與軸的固定方式、板厚、刀具及軸承／墊片。可先完成不相依的 API 與幾何驗收；出加工就緒圖前集中確認這些資訊。下一例再以單軸臂或翻斗驗證操作是否可重用，不能把首例 ID 寫死的 planner 直接冒充通用驗收器。

本輪只規劃 SDD、基準與最小工作包；未改產品程式。施工時依當次授權連續進行範圍內 LOOP，必要例外才詢問。commit／push 與外部服務部署依當次明確授權，不引用其他歷史工作包作為本輪發布授權。

## 9. 本輪實作對照（2026-10-10）

- `gripper-operations.js` 提供純 prepare 與一次性確認 session；UI 重算與開發工具請求使用相同驗證。取消、過期及已消費候選不能套用。
- 人工表單保留既有「可保存無效數字設計供後續修正」語意，無效時阻擋姿態與下載；結構化確認只接受有效候選。因此等價指相同有效輸入的 snapshot／plan 與診斷，不是兩者無條件提交語意相同。
- 只支援 schema 已有頂層欄位；未知頂層資料無法經產品保存，明確 NORMALIZATION_CHANGED 阻擋。已提供欄位被正規化改／丟時列 repairs；schema 補入預設不誤拒絕。非 JSON 值直接拒絕。
- 隔離入口 `test/gripper-pilot.html` 嵌入正式工具 `?gripperPilot=1`，禁止正式 autosave 載入／保存。驗收用保存僅存本頁記憶；原工具 JSON／分享與製作記錄能力沿用。
- 手機實測修正任務卡被設計分頁遮住及播放列被任務卡遮住的既有排版。詳細驗收、執行環境及界限見 [本輪工作紀錄](WORK-GRIPPER-AI-PILOT-2026-10-10.md)。
