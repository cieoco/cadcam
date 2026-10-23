import {startupSize} from '../tools/startup-size.mjs';
import {check,report} from './_harness.mjs';
const r=startupSize();
check('基本2D不載入Three.js',!r.paths.includes('js/vendor/three.module.js'));
check('基本2D不載入錄影套件',!r.paths.includes('js/vendor/mediabunny/mediabunny.mjs'));
check('3D與錄影保留動態入口',r.lazyEntries.includes('js/blocks3d/viewer.js')&&r.lazyEntries.includes('js/blocks/video-export.js'));
// 2026-10-23：加入毫米尺規，保留約 10 KB 的增量上限。
// 2026-10-23：加入鏈輪與 #25 鏈條核心（約 12 KB），上限放寬到 1.925MB。
// 2026-10-23：鏈傳動（S1–S3）保留完整註解後，上限再放寬到 1.93MB，原因是鏈輪與鏈條功能。
check('首次JS原始大小低於1.93MB',r.bytes<1930000);
check('歷史紀錄點開才載入',!r.paths.includes('js/version-history.js')&&r.lazyEntries.includes('js/version-history.js'));
report('startup-size');
