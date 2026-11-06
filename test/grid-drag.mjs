import { check, report } from './_harness.mjs';
import { snapDraggedDimension, projectedDimension } from '../js/blocks/dimension-handle.js';
import { gridDragStep, holeCountText } from '../js/blocks/grid-drag.js';
import { memberDimensions } from '../js/blocks/member-dimensions.js';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { readFileSync } from 'node:fs';

// 步距函式
check('預設仍為 1 mm 取整', snapDraggedDimension(12.4, 8, 100) === 12 && snapDraggedDimension(12.6, 8, 100) === 13 && snapDraggedDimension(7.2, 8.5, 100) === 9);
check('8 mm 取整到 8 的倍數', snapDraggedDimension(51, 8, 2000, 51, 8) === 48 && snapDraggedDimension(52, 8, 2000, 52, 8) === 56 && snapDraggedDimension(59, 8, 2000, 59, 8) === 56);
check('範圍邊界夾在 [min,max] 內的 8 倍數', snapDraggedDimension(3, 8, 2000, 3, 8) === 8 && snapDraggedDimension(5000, 8, 2000, 5000, 8) === 2000 && snapDraggedDimension(100, 10, 30, 100, 8) === 24 && snapDraggedDimension(0, 10, 30, 0, 8) === 16);
check('範圍內沒有 8 的倍數時維持原值', snapDraggedDimension(20, 17, 23, 19.5, 8) === 19.5 && snapDraggedDimension(20, 9, 15, 11.3, 8) === 11.3);
check('projectedDimension 帶 snap 取 8 的倍數，未帶仍為 1', (() => {
  const d = { x: 1, y: 0 };
  return projectedDimension(88, { x: 10, y: 0 }, d, { min: 8, max: 2000, snap: 8 }) === 96 &&
    projectedDimension(88, { x: 3, y: 0 }, d, { min: 8, max: 2000, snap: 8 }) === 88 &&
    projectedDimension(88, { x: 10.4, y: 0 }, d, { min: 8, max: 2000 }) === 98;
})());
check('投影方向長度為零時回傳起點', projectedDimension(90, { x: 5, y: 0 }, { x: 0, y: 0 }, { snap: 8 }) === 90);

// 各尺寸的設定
const dim = (comp, id) => memberDimensions(comp).find(d => d.id === id);
const bar = { type: 'bar', id: 'B1', p1: { id: 'A' }, p2: { id: 'B' }, lenParam: 'L' };
const tri = { type: 'triangle', id: 'T1', p1: { id: 'A' }, p2: { id: 'B' }, p3: { id: 'C' }, gParam: 'G', r1Param: 'R1', r2Param: 'R2' };
const disk = { type: 'bar', shape: 'disk', id: 'D1', p1: { id: 'A' }, p2: { id: 'B' }, lenParam: 'L', diameterMm: 100 };
const fused = { ...bar, id: 'F1', barFusionRoot: 'Root' };
check('一般連桿孔距用 8，板寬板厚用 1', gridDragStep(bar, dim(bar, 'g')) === 8 && gridDragStep(bar, dim(bar, 'width')) === 1 && gridDragStep(bar, dim(bar, 'thickness')) === 1);
check('合成片桿段與圓盤工作孔距用 8', gridDragStep(fused, dim(fused, 'g')) === 8 && gridDragStep(disk, dim(disk, 'g')) === 8);
check('盒體板件用 1', gridDragStep({ ...bar, boxPanel: true }, dim({ ...bar, boxPanel: true }, 'g')) === 1);
check('三點板三邊用 1', ['g', 'r1', 'r2'].every(id => gridDragStep(tri, dim(tri, id)) === 1));
const jaw = normalizeSnapshot(getExample('gear-gripper').snapshot).comps.find(c => c.id === 'LeftJaw');
check('折線桿兩桿段用 8、跨距與爪端長度用 1', (() => {
  const dims = memberDimensions(jaw), by = id => gridDragStep(jaw, dims.find(d => d.id === id));
  const poly = ['g', 'r1', 'r2'].map(by);
  return poly.filter(s => s === 8).length === 2 && poly.filter(s => s === 1).length === 1 && by('tip') === 1;
})());
check('無效輸入不拋錯並回 1', gridDragStep(null, null) === 1 && gridDragStep({ type: 'slider' }, { id: 'g', refs: ['p1', 'p2'] }) === 1);

// 孔數文字
check('在格上顯示 N 孔', holeCountText(48) === '7 孔' && holeCountText(8) === '2 孔' && holeCountText(88) === '12 孔');
check('離格顯示最近孔數與差值', holeCountText(50) === '≈ 7 孔（差 2 mm）' && holeCountText(61.5) === '≈ 9 孔（差 2.5 mm）' && holeCountText(NaN) === '');

// 接線：受格把手用步距，其他把手不傳
const handles = readFileSync(new URL('../js/blocks/editing-handles.js', import.meta.url), 'utf8');
check('尺寸把手接上 gridDragStep，且只有兩處', (handles.match(/gridDragStep\(/g) || []).length === 2);
check('夾爪爪尖與圓盤外徑等把手維持 1 mm', !/disk-diameter[^\n]*gridDragStep/.test(handles) && !/rack-length[^\n]*gridDragStep/.test(handles));
report('grid-drag');
