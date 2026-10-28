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
check('首次JS原始大小低於1.9725MB',r.bytes<1972500);
check('盒體生成介面延後載入',!r.paths.includes('js/blocks/box-generator.js')&&!r.paths.includes('js/blocks/box-dialog.js')&&r.lazyEntries.includes('js/blocks/box-dialog.js'));
check('歷史紀錄點開才載入',!r.paths.includes('js/version-history.js')&&r.lazyEntries.includes('js/version-history.js'));
report('startup-size');
