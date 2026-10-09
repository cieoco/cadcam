# 指定行程採樣驗證工作紀錄

日期：2026-10-10；本地版本2026.10.10.3；沿用前輪未提交成果，未commit／push／發布。

依 [增量SDD](SDD-MOTION-RANGE-VALIDATION.md) 完成純共用 validateMotionRange。既有 sweepTopology 提供前幀分支保持但未涵蓋反向、精確終點、孔距及跳動診斷；新入口以有限採樣迴圈重用 compileTopology／solveTopology（含_prevPoints），未修改求解數學。支援單馬達、未組立的anchor/bar/triangle/gear與主求解孔；多馬達、其他零件、額外非標準vertices明確拒絕。非法來源含null零件／array params／缺主孔亦明拒。

預設步距上限0.5°、最多721幀，兩端必含、允許反向與零長。實際等分步距回報actualStepDeg；plannedSampleCount與完成sampleCount分開，即使首幀失敗仍揭示既定步距。剛性孔距對snapshot參數容差0.1mm；相鄰方向門檻15°，点位移門檻20mm/°＋0.05mm；端點目標容差0.1mm。超門檻為SUSPECTED_POSE_JUMP，表示需核對分支或加密檢查，不斷言物理卡死。診斷有code、angleDeg、componentId與targets；若solver僅回整體無效且孔點有限，INVALID_POSE標參與零件，不冒稱定位唯一原因。

夾爪prepare重用planner區間及gripperTips端點量測，固定預設policy。無效行程不產生可確認候選；原結構化確認、復原與保存不變。UI重算同入口，cache只忽略單馬達目前播放theta，保留幾何／任務／凍結角；新增cache identity測試證明播放角改變不重新掃描。卡片顯示採樣點數，短caveat明示樣本間／干涉／承載未驗證；隔離頁显示範圍、步距與未驗證清單。製作記錄以採樣區間／步距描述，未附validation的舊planner記錄僅稱找到目標角，不再宣稱連續全行程。

驗收：

- 入口缺失時先執行非法範圍負例失敗；完整純核心最終27/27。既有parallel-fourbar10→40°用相同核心通過61個樣本；非整除終點、反向、零長、取樣上限、非法policy、不可解幾何、起點錯孔距、疑似姿態跳動、端點目標錯、未覆蓋型態與來源不變均有驗收。
- gripper operations40/40；controller17/17（原16項保留，新增cache）；workflow11cases／object PASS／download8/8。新測試已加入manifest，未新增runner。
- `NODE_OPTIONS=--no-webstorage node tools/test-runner.mjs --output output/motion-range/acceptance` 全套165/165，Node25.2.0／Windows，graph43cc0a9c9f73bbf320e4。環境旗標沿用前輪解Node25 webstorage，不改runner。
- 隨後僅补主孔缺失防護、把位移0.05mm明列policy、整理本包縮排；最終定向7/7。graph8428b726f2e1635c56f1（141modules／17pages）檢查通過。報告位於output/motion-range/acceptance/results.json與final-targeted/results.json。
- Chrome HTTP實際操作：150/40→UNREACHABLE且無可確認候選；改80/10→9幀、實際步距0.47924625003361143°，confirm applied true。桌面975×728與390×844都能操作；手機原工具151錯誤→80修正→閉合，顯示80–100mm·9點採樣和可見限制。error console為空。
- 手機DOM layout：design-tabs48–91px，card112–342px，stage350–639px，播放controls646.8px，無互相遮擋。證據output/motion-range/mobile-layout.json、browser-pilot.json、desktop-dom.json。
- 本輪IAB不可用；Chrome Page.captureScreenshot多次CDP5000ms timeout。依主代理指示保留DOM/layout/console證據，不再反覆截圖，也不以舊輪圖片冒充本輪截圖。故本輪有實際瀏覽器互動與layout證據，沒有新截圖。
- 主代理真實agent工具循環另實跑：150/40拒絕；修正65/8通過，10.324900141276885→13.369043830723967°，8個样本、0.4348776699210118°；結果unchecked含between_samples/interference/contact/load/hardware。這是開發工具直接調纯函式，不是MCP或自然語言產品服務。

界限：採樣不代表樣本間連續可解或連續全行程證明；只覆蓋主求解孔，不是所有加工孔；沒有干涉、接觸、摩擦、承載、硬體或加工就緒驗證。可信域adapter才可提供endpointChecks函式，不能將任意callback或放寬policy透過JSON/MCP暴露。
