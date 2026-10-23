import {startupSize} from '../tools/startup-size.mjs';
import {check,report} from './_harness.mjs';
const r=startupSize();
check('基本2D不載入Three.js',!r.paths.includes('js/vendor/three.module.js'));
check('基本2D不載入錄影套件',!r.paths.includes('js/vendor/mediabunny/mediabunny.mjs'));
check('3D與錄影保留動態入口',r.lazyEntries.includes('js/blocks3d/viewer.js')&&r.lazyEntries.includes('js/blocks/video-export.js'));
// 2026-10-23：加入毫米尺規，保留約 10 KB 的增量上限。
check('首次JS原始大小低於1.91MB',r.bytes<1910000);
check('歷史紀錄點開才載入',!r.paths.includes('js/version-history.js')&&r.lazyEntries.includes('js/version-history.js'));
report('startup-size');
