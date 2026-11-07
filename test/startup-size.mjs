import {startupSize} from '../tools/startup-size.mjs';
import {check,report} from './_harness.mjs';
const r=startupSize();
check('基本2D不載入Three.js',!r.paths.includes('js/vendor/three.module.js'));
check('基本2D不載入錄影套件',!r.paths.includes('js/vendor/mediabunny/mediabunny.mjs'));
check('3D與錄影保留動態入口',r.lazyEntries.includes('js/blocks3d/viewer.js')&&r.lazyEntries.includes('js/blocks/video-export.js'));
// 2026-10-23：加入毫米尺規，保留約 10 KB 的增量上限。
// 2026-10-23：加入鏈輪與 #25 鏈條核心（約 12 KB），上限放寬到 1.925MB。
// 2026-10-23：鏈傳動（S1–S3）保留完整註解後，上限再放寬到 1.93MB，原因是鏈輪與鏈條功能。
// 2026-10-24：榫槽接合共用幾何、保存封裝與2D/3D橋接增加約22 KB（基準1,929,444 bytes）；試片下載仍懶載入。
// 2026-10-24：盒體矩形輪廓、能力封裝及 UI 接頭使目前為 1,961,308 bytes；生成與驗證介面仍懶載入。
// 2026-10-28：卡榫盒子 B2 的多組榫槽幾何與上蓋閉合接合（已存盒體不開對話框也要能讀取與輸出）使目前為 1,971,474 bytes，上限放寬到 1.9725MB；啟動瘦身另案處理。
// 2026-10-28：P1 卡榫盒子改為外掛，生成與介面程式移出啟動；保存契約（box-contract）與外掛登記仍在啟動，總量不低於 1.97MB，上限維持 1.9725MB。
// 2026-10-28：固定軸共用選取／精確角度與不可用狀態增加約 2 KB，目前 1,973,959 bytes。
// 2026-10-28：合成桿段選擇與編輯接頭約 1.2 KB（目前 1,975,060 bytes），幾何重算仍懶載入。
// 2026-11-05：共用裝配孔位核對與既有編輯入口接線，增量約 20 KB；無新增依賴或載入 3D。
// 2026-11-06：機架附屬孔保存／跟隨及輸出契約；機架參數面板延後載入，啟動淨增約 1.2 KB。
// 2026-11-07 數位積木 G5：修正孔徑預設（12.96→M3 3.2 mm，單一來源）需 +320 bytes，依前例放寬 1 KB，不以刪掉必要契約縮小數字。
// 2026-11-07 G5-P2 直角孔格對齊：轉接座孔對宿主孔格、佔位長度與滑動吸附（orthogonal-joint／assembly／bench／module-ops），啟動淨增約 1.7 KB，放寬到 2.007MB。
// 2026-11-07 G5-P3：合成聯集修正與預設 13 mm（外形聯集補切重合邊，修方環棍寬 13 時「未閉合」；搖臂孔依棍寬保留），啟動淨增約 1.5 KB，放寬到 2.009MB（主模型追認）。
// 2026-11-07 G1–G7 審查修正：板厚與接合種類傳遞、偏移保存精度約增 1 KB；保留必要驗證，預算調為 2.010 MB。
// 2026-11-07：六連桿範例與短教學約 3.5 KB，沿用既有操作／求解，無新增依賴。
// 2026-11-07：三個 IQ 用途範例與短教學、直線輸入單位修正約 9 KB；沒有新求解器或依賴。
// 2026-11-07：原圖剪式台所需的活動軌道閉環約束、保存與原操作接頭淨增約 11.5 KB；無新增依賴，3D 仍懶載入。
// 2026-11-07 本地 IQ 第一包：獨立升降與組立範例、合成臂角碼孔共用幾何約增 9.1 KB，未增加依賴。
// 2026-11-07：共用兩孔齒輪傳動與 M.A.D. Box 範例淨增約 5.4 KB；沒有新依賴。
// 2026-11-07：三份共用板件的 IQ 被動工具資料與來源教學約 5 KB，無新操作或依賴。
// 2026-11-07：被動輪爪的來源、支承座與輪胎外形約增 5.4 KB；重用既有操作，無新依賴。
// 2026-11-08：範例標準 N×M 機架、保存政策與共用輸出幾何淨增 4,195 bytes（基準 2,059,187）；無新依賴，預算調為 2.064 MB。
// 2026-11-08 H01／24 mm 固定環：共用耳距、標準板包覆與干涉診斷較前輪完成值增 1,257 bytes（2,063,790→2,065,047）；不增加第三方依賴。
// 2026-11-08 Linq：新增單側齒輪四連桿／固定托物段與教學資料，作者helper移除初始化循環；2,065,047→2,069,710（+4,663 bytes），無新第三方依賴。
// 2026-11-08 Linq孔位重建：實體托盤與掛接、來源比例資料增4,214 bytes（2,069,710→2,073,924）；沿既有模組，無新依賴。
// 2026-11-08：三類孔格結構與共用局部孔支援，2,074,980→2,091,543（+16,563 bytes）；設定面板按需載入，無新求解器／依賴。
check('首次JS原始大小低於2.093MB',r.bytes<2093000);
check('標準結構設定面板按需載入',!r.paths.includes('js/blocks/standard-blank-ui.js')&&r.lazyEntries.includes('js/blocks/standard-blank-ui.js'));
check('機架編輯介面延後載入',!r.paths.includes('js/blocks/frame-hole-editor.js')&&!r.paths.includes('js/blocks/frame-panel.js'));
check('合成尺寸候選計算延後載入',!r.paths.includes('js/blocks/bar-fusion-resize.js')&&r.lazyEntries.includes('js/blocks/bar-fusion-resize.js'));
check('盒體生成介面（外掛）延後載入',!r.paths.includes('js/plugins/box-maker/box-generator.js')&&!r.paths.includes('js/plugins/box-maker/box-dialog.js')&&r.lazyEntries.includes('js/plugins/box-maker/index.js'));
check('歷史紀錄點開才載入',!r.paths.includes('js/version-history.js')&&r.lazyEntries.includes('js/version-history.js'));
report('startup-size');
