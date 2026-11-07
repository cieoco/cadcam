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
check('首次JS原始大小低於2.006MB',r.bytes<2006000);
check('機架編輯介面延後載入',!r.paths.includes('js/blocks/frame-hole-editor.js')&&!r.paths.includes('js/blocks/frame-panel.js'));
check('合成尺寸候選計算延後載入',!r.paths.includes('js/blocks/bar-fusion-resize.js')&&r.lazyEntries.includes('js/blocks/bar-fusion-resize.js'));
check('盒體生成介面（外掛）延後載入',!r.paths.includes('js/plugins/box-maker/box-generator.js')&&!r.paths.includes('js/plugins/box-maker/box-dialog.js')&&r.lazyEntries.includes('js/plugins/box-maker/index.js'));
check('歷史紀錄點開才載入',!r.paths.includes('js/version-history.js')&&r.lazyEntries.includes('js/version-history.js'));
report('startup-size');
