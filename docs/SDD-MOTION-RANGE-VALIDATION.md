# SDD — 指定行程採樣驗證增量

日期：2026-10-10；沿用本地夾爪試點，不改 blocks v1、solver 數學與外部服務。

目的：同一純入口驗證指定起→終角區間，人工及結構化候選使用相同規則。重用 compileTopology 與 solveTopology；既有 sweepTopology 有前幀分支保持，但僅遞增迴圈且未保證非整除終點、不含參數孔距與跳動診斷，所以本包以小取樣迴圈直接呼叫既有 solver，不重寫求解。既有 health-report 為通用PASS/WARN/FAIL工具；採用與夾爪操作相容 issues(code,severity,message,targets)，另加 angleDeg/componentId。

純入口暫定 validateMotionRange(snapshot, options)：支援未組立的 anchor/bar/triangle/gear、單一驅動馬達；多馬達與其他零件明確拒絕。options含 startDeg/endDeg、motorId、stepDeg(預設0.5)、最大721幀、孔距容差0.1mm、相鄰點位移20mm/deg加0.05mm、構件方向變化15deg；明確含兩端、反向與零長區間。可傳純 endpointChecks量測函式，以既有gripperTips檢查張開/閉合淨距(0.1mm容差)，核心不硬編碼夾爪ID。剛性比對snapshot參數，不以第一幀當正確基準。

有限解、所有受支援零件主孔、剛性邊長與相鄰樣本跳動均檢查；跳動是超採樣門檻的疑似分支變化，不能斷言物理卡死。採樣通過不代表兩樣本間連續可解、全行程干涉或承載通過。結果含範圍、實際步距、幀數、容差、coverage與未驗證項目。無效時保持機器code/角度/零件，不產生可確認候選。

gripper prepare拿既有plan作區間規劃後呼叫新核心；UI只對作品幾何/任務/凍結角變更重算，單純播放theta與render重用驗證結果。現有人工change可存無效設計/拖曳取消語意維持。隔離頁摘要顯示採樣範圍與限制，使用不可達→修正→重驗。

先新增負例並確認失敗，再實作。驗收涵蓋有限解失败、起點孔距不符、超門檻跳動、端點開口不符、精確終點、逆向/零長、來源不變、未支援拒絕與採樣界限；用既有parallel-fourbar驗證同一核心可共用，不新增AI操作或範例。新增測試入manifest，定向通過才全套/load graph，最後桌面/390px HTTP瀏覽器操作並留證據。不得用採樣通過宣稱連續全行程、干涉或實物成功。

政策與擴充界限：endpointChecks量測callback僅由可信域adapter提供，不能從JSON/MCP傳任意函式；gripper adapter固定採用預設policy，不允許工具請求放寬容差。核心policy自訂僅作開發檢查，結果必須展示實際門檻。孔距範圍為primary-solver-points-only；帶非標準vertices的零件明拒，不聲稱所有加工孔已驗證。

完工狀態：本地2026.10.10.3；核心27/27，全套165/165，最終定向7/7與load graph通過。瀏覽器實際操作／DOM layout通過，Chrome截圖工具逾時未有新圖；詳細證據與限制見 [工作紀錄](WORK-MOTION-RANGE-VALIDATION-2026-10-10.md)。
