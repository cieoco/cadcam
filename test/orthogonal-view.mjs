// O3（SDD-ORTHOGONAL-MOUNT §4.3、O-D3）：主畫面一次畫一個平面——零件屬於哪個平面、目前平面要畫哪些零件。
import { check, report } from './_harness.mjs';
const Asm = await import('../js/blocks/assembly.js');
check('assembly 匯出 planeOf／compsInPlane', typeof Asm.planeOf === 'function' && typeof Asm.compsInPlane === 'function');
if (typeof Asm.planeOf !== 'function' || typeof Asm.compsInPlane !== 'function') { report('orthogonal-view'); process.exit(1); }

const orient = { type: 'orthogonal', edge: 'host', side: -1, childAxisDeg: -90, joint: { kind: 'printed', wallMm: 4, holesPerFlange: 2 } };
const ref = { x: 0, y: 0, a: 0 };
const modules = [
  { id: 'Lift', name: 'L', outputs: [{ id: 'tool', at: 'D', body: { kind: 'bar', id: 'B1' }, orthogonal: { side: -1 } }] },
  { id: 'Grip', name: 'G', outputs: [{ id: 'o', at: 'X', body: { kind: 'bar', id: 'B2' } }], mount: { to: { module: 'Lift', output: 'tool' }, ref, home: {}, orient } },
  { id: 'Tip', name: 'T', outputs: [], mount: { to: { module: 'Grip', output: 'o' }, ref, home: {} } },
  { id: 'Loose', name: 'U', outputs: [] }
];
const comps = [
  { type: 'bar', id: 'R0' },
  { type: 'bar', id: 'B1', moduleId: 'Lift' },
  { type: 'bar', id: 'B2', moduleId: 'Grip' },
  { type: 'bar', id: 'B3', moduleId: 'Tip' },
  { type: 'bar', id: 'B4', moduleId: 'Loose' },
  { type: 'bar', id: 'B5', moduleId: 'Gone' }
];
check('根零件 → 平面 null（主視圖）', Asm.planeOf(comps, modules, comps[0]) === null);
check('同平面模組（Lift）→ null', Asm.planeOf(comps, modules, comps[1]) === null);
check('直角安裝的模組（Grip）→ 自己的 id', Asm.planeOf(comps, modules, comps[2]) === 'Grip');
check('裝在直角子模組上的同平面模組（Tip）→ 跟著 Grip 的平面', Asm.planeOf(comps, modules, comps[3]) === 'Grip');
check('未安裝模組、找不到的模組 → null', Asm.planeOf(comps, modules, comps[4]) === null && Asm.planeOf(comps, modules, comps[5]) === null);
check('也接受模組 id 字串', Asm.planeOf(comps, modules, 'Tip') === 'Grip' && Asm.planeOf(comps, modules, null) === null);
check('compsInPlane(null)：主視圖零件', Asm.compsInPlane(comps, modules, null).map(c => c.id).join(',') === 'R0,B1,B4,B5');
check('compsInPlane(Grip)：夾爪平面零件', Asm.compsInPlane(comps, modules, 'Grip').map(c => c.id).join(',') === 'B2,B3');
check('沒有模組時 compsInPlane(null) 回原陣列內容', Asm.compsInPlane(comps.slice(0, 1), [], null).length === 1);
const cyc = [{ id: 'A', mount: { to: { module: 'B', output: 'o' }, ref, home: {} } }, { id: 'B', mount: { to: { module: 'A', output: 'o' }, ref, home: {} } }];
check('安裝成環不會無窮迴圈', Asm.planeOf([], cyc, 'A') === null);
report('orthogonal-view');
