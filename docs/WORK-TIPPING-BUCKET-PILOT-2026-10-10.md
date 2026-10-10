# 工作紀錄 — 單軸翻斗側視教學

日期：2026-10-10。基準 c1c0ad3；單一寫入者完成 B0–B3，版本2026.10.10.5，未 commit／push。主代理原未提交 SDD 保留並增補。

## 成果與範圍

僅新增 tipping-bucket 範例：固定 O(0,0)、單M1、80mm底部與40mm高 U 形側視。anchor／bar／triangle 原 solver 求姿態，三個主孔，第四局部造形點(100,40)沒有加工孔。O向右水平為0°，正角逆時針；0°開口向上，−100°轉向右下。−120～30°僅本任務教學範圍，不是伺服或機構極限。O在底部是教學軸；完整側板、底板、軸承、支架、跨寬連接尚待設計，不宣稱施工規格或落料成功。

純入口：tipping-bucket-workflow.js／operations.js，重用 task-operation-support 及 validateMotionRange；接受版本1 createFromExample（exampleId tipping-bucket）或 updateTask，只改 stowAngleDeg／dumpAngleDeg，持久化 params.bucketStowAngle／bucketDumpAngle／bucketWorkflow，維持blocks v1。未知、非有限、超範圍、改造結構／尺寸拒絕且沒有候選。控制器沿用正式 applySnapshot、一次undo及保存流程，候選只顯示數值、不變正式姿態；確認重驗、取消零修改、過期保留新作品。隔離 test/tipping-bucket-pilot.html 不讀寫正式 autosave。

共用 motion 增合法 triangle 局部造形点全對距檢查：三主孔 ref 唯一、有限局部(u,v)、最多6點、無額外孔；基準由原 solver 當前 params 的起始解取得，主孔距仍對params。避免浮點設計 coords 未同步造成合法改參數被誤拒；夾爪同步tip110／edge124但浮點 coords 未改的 prepare 回歸通過。scope 明示造形點相對主孔剛性，不涵蓋全部加工孔。

UI：既有範例選單可達，兩欄任務卡、收納／回位與傾倒姿態；僅草稿顯示確認／取消。新 tipping-bucket-reference.js 畫固定水平、正角與跟隨側形的開口箭頭，純展示，不是工程圖。翻斗全域讀值顯示有號角，其他作品不變。新增 teaching-tipping-bucket.html，學習目錄及卡內短教學連結可達，只改傾倒角的實操與錯誤修正。

## 測試

先建立超範圍負例再實作（入口未存在時 ERR_MODULE_NOT_FOUND red）。本例42/42、controller13/13；定向9/9，報告 output/tipping-bucket/targeted/results.json。包括正反向、零行程、範圍端點、非整除精確終點、固定軸、角度跟隨、局部點剛體位置、非法造形／額外孔、normalization、來源不變、分享保存重開、一次undo、取消與過期。

最終全套169/169：`NODE_OPTIONS=--no-webstorage node tools/test-runner.mjs --output output/tipping-bucket/acceptance-final`，報告 acceptance-final/results.json。Node25.2.0；runner沿基準使用支援的no-experimental-webstorage，沒有為本包修改runner。較早邊寫邊跑的 acceptance/results.json 為167/169（當時正在追加反例／更新載入圖），保留稽核，不當成完成證據。

載入圖 fbea1b567459a5f79004：151 modules／19 pages；生成與 --check 通過。git diff --check exit0，只有LF／CRLF warnings。除了本例及必要core/app掛接，其他HTML變更為共用載入圖token生成。

原 export／scene probe 在0／−100°：inspectPlateExport 44外形點、3孔；buildSceneModel沿同一外形及3孔，局部造形點不產生多餘孔。結果 output/tipping-bucket/plate-scene-export.json，不是加工就緒宣告。

## 真實代理與瀏覽器驗收

主代理實際用Node開發工具呼叫純入口：create收納5／傾倒−140→ANGLE_OUT_OF_RANGE；修正傾倒−95→ok，5→−95、201樣本。這是代理透過開發工具呼叫，不是MCP、自然語言產品服務或外部LLM串接。

Chrome HTTP實際操作：隔離候選建立／確認；−150錯誤及播放拒絕→−60修正確認／傾倒；改−80確認，一次undo回−60；本頁記憶保存重開回−60。外部候選−90預覽後切夾爪，確認回STALE_SOURCE且新例保留。夾爪→parallel→普通四連桿，undo回parallel，卡片正確。再載翻斗確認−80，用正式分享按鈕取得連結並重開，兩角0／−80與161樣本保留；重開驗收加gripperPilot隔離旗標避免正式autosave。

390×844從實際教學範例載入對話啟動；−70草稿期間play及MP4拒絕、無playing狀態；確認後按傾倒顯示−70。常態card176.42px、stage327.81px；草稿card212.42px、stage291.81px；分頁/卡/畫布不重疊，兩輸入各171px寬。SVG viewBox900×560按比例縮放，實際側形與固定水平／開口註記的DOM bounding rect在390px畫布內。驗收後viewport reset。

證據：output/tipping-bucket/desktop-dom.json、mobile-layout.json，console errors=[]。正常 screenshot API嘗試一次仍 Page.captureScreenshot 5000ms timeout；無本輪截圖、沒有冒用前例圖片，依主代理授權保留DOM/layout/幾何證據。

## 明確界限

離散採樣，預設201樣本／0.5°，非連續全行程證明；未驗證 between_samples、interference、contact、load、hardware、material_discharge。側形不是完整料斗、容積、板件展開或已核對加工圖；摩擦、落料、板厚疊放、重心、扭矩、外購件未核對。沒有新增solver、MCP、碰撞、承載或硬體功能。完成後交回完整寫入權，尚未發布。

## 產品方向修正已完成 — 2026.10.10.6（此節優先於上列側視歷史）

同一tipping-bucket例改為真正四片輸出板件，沒有另造decorative mesh或solver。LeftSide使用既有hull與6 vertices、5mm包邊，RightSide90×50、Floor130×100、Back60×50mm，厚3mm；名義內腔90×50×60，底板20mm外翼供交錯內外角碼。O在側板中段、Support固定端在O右側；單側支架與MG995表示，不稱雙支承。Driver→Floor→RightSide及Floor→Back三組由既有planner生成實體角碼與成對孔；沒有gap60懸空固定。模型唯一角度為Drive.servoStart/servoEnd，預設0→−100、新立體教學−120～0°整數；舊三件側視來源仍相容−120～30。

驗收先抓到固定frame/底板相交，移軸中段與右側Support解決負轉分支；抓到LeftSide主孔跨1mm外框，又改5mm包邊及hull外框，解決polygon共線點造成的unassigned_machining_feature。未放寬材料檢查。完整加工catalog的Support、Drive、LeftSide、frame、RightSide-frame、Floor-frame、Back-frame，各圓孔64點及slot輪廓獨立containment全true；三角碼成對孔通過。真材料0→−120每5°共25姿態findings皆空，但status仍not_supported，因MG995、pin及Support/Drive材料姿態尚未完整納入共用碰撞表示；不能解讀為全場碰撞PASS。四板的真world角點／法向／相對距離及內腔坐標採樣核查保存於geometry-audit.json。內腔相對O：x[−5,85]、y[−25,25]、z[9,69]。圓角非密封；扭矩、承載、落料、對側軸承、貫穿軸與PWM硬體未驗證。

新增tipping-bucket-example.js、legacy.js、assembly-validation.js；operations/workflow窄域分支保留，task-operation-support僅新增allowAssembly參數（原夾爪/平行預設仍拒組立）。新validator從真snapshot→faceCandidateModel→原assembly/solver及加工catalog核對，不重複硬寫腔體尺寸；主孔0.5°與材料組立最多5°各自回報，確切端點、反向、零行程、材料孔槽與過期面transform診斷明示。共用servo存檔為整數，AI不接受会被正規化默默round的分數角。

移除本輪未提交bucket-controller/reference與bucketWorkflowContent，沒有常駐翻斗操作卡。沿既有MG995起終角、播放/MP4、模組編輯、組立清單/六面精靈與SVG/DXF。播放與MP4按需同planner驗證並cache幾何key，草稿禁播，非每render掃描。共用MG995文字顯示有號模型角，TT保留0–360；教學從學習目錄可達。人工仍可保存待修正作品，AI只確認有效候選。真正输出12檔（四板、支架、Drive SVG/DXF）保存於output/tipping-bucket/solid-export。

瀏覽器Chrome實操：新例與共用MG995，−100→−85；隔離正式來源−80→−65→一次undo，由純入口重新讀正式來源確認−80（不是隱藏舊文字）。AI錯−140→修正−80→confirm，保存頁面記憶重開仍−80；候選取消零修改、來源切換gear-gripper後confirm回STALE_SOURCE；gear-gripper→parallel-fourbar→翻斗不殘留卡。候選時共用播放保持▶。從瀏覽器實際候選snapshot用產品share codec生成URL後新tab重開四模組；clipboard讀回為舊連結，故不以該讀值宣稱本輪copy輸出已核實。手機390×844真新範例無卡、overflow0，stage390×530，底導覽390×55不與stage重疊，共用MG995可選取。desktop/mobile/pilot console均[]。截圖一次CDP Page.captureScreenshot timeout5秒，未反覆、未借旧图；当前DOM/layout取代圖像證據，3D輪廓以真scene material/geometry證據補充，未宣稱視覺截圖驗收成功。

定向：legacy42/42、新assembly32/32；最後全套與graph見末尾交接紀錄。Node25使用NODE_OPTIONS=--no-webstorage，沒有改runner。版本10.10.6未commit/push。主審agent開發工具直接呼叫仍非MCP、無自然語言外部服務。保留原未提交成果與無關檔案。

交接：最終全套169/169，output/tipping-bucket/solid-complete-acceptance/results.json（基準c1c0ad3、trackedChanges=true、Node25.2.0），幾何修正完成後執行。load graph 36a4c4c3d15ca29b4827、152 modules／19 pages --check通過，git diff --check通過（僅CRLF warnings）。全套後僅修正共用角顯示之M2點上編號與註解、診斷文字及EOF空行；獨立M2 point motor／M1 MG995／TT角顯示定向通過，不影響求解幾何。桌面截圖工具失敗限制如上，未聲稱加工就緒或硬體測試完成。
