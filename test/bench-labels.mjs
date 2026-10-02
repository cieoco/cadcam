// D1：同名模組加編號，接口／狀態文字才分得出是哪一個。
import { check, report } from './_harness.mjs';
import { B } from './_bench-setup.mjs';
check('bench.js 匯出 moduleLabels', typeof B.moduleLabels === 'function');
if (typeof B.moduleLabels !== 'function') { report('bench-labels'); process.exit(1); }
const mods = [{ id: 'A', name: '四連桿升降臂' }, { id: 'B', name: '齒輪夾爪' }, { id: 'C', name: '四連桿升降臂' }, { id: 'D', name: '四連桿升降臂' }, { id: 'E' }];
const L = B.moduleLabels(mods);
check('回傳 Map（id → 顯示名稱）', L instanceof Map && L.size === 5);
check('不重複的名稱不變', L.get('B') === '齒輪夾爪');
check('重複的名稱依序加編號：四連桿升降臂 1／2／3', L.get('A') === '四連桿升降臂 1' && L.get('C') === '四連桿升降臂 2' && L.get('D') === '四連桿升降臂 3');
check('沒有名稱時用 id', L.get('E') === 'E');
check('空陣列／非陣列回空 Map', B.moduleLabels([]).size === 0 && B.moduleLabels(null).size === 0);
report('bench-labels');
