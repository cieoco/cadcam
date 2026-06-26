// 範例驗收：步行腿（Jansen）。對應 js/jansen/topology.js 的既有專頁拓樸。
// 驗收條件：① 全程解得穩 ② 足端 P5 軌跡閉合 ③ 軌跡連續且行程明顯。
// 跑法：node test/jansen.mjs
import { JANSEN_TOPOLOGY, JANSEN_DEFAULT_PARAMS } from '../js/jansen/topology.js';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { solveTopology } from '../js/multilink/solver.js';
import { sweep, check, report } from './_harness.mjs';

const watchIds = ['O', 'F', 'P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
const frames = [];
let allValid = true;
let prevPoints = null;

for (let theta = 0; theta <= 360; theta += 1) {
  const sol = solveTopology(JANSEN_TOPOLOGY, {
    ...JANSEN_DEFAULT_PARAMS,
    thetaDeg: theta,
    _prevPoints: prevPoints,
  });
  const points = sol?.points || {};
  const ok = sol?.isValid && watchIds.every(id =>
    points[id] && Number.isFinite(points[id].x) && Number.isFinite(points[id].y)
  );
  if (!ok) allValid = false;
  frames.push({ theta, points });
  if (ok) prevPoints = points;
}

check('全程解得穩（每幀 O/F/P0..P5 都有限）', allValid);

const feet = frames.map(f => f.points.P5).filter(Boolean);
const firstPoints = frames[0].points;
const distance = (points, id1, id2) => Math.hypot(points[id2].x - points[id1].x, points[id2].y - points[id1].y);
const holyPairs = [
  ['m', 'O', 'P0'],
  ['j', 'P0', 'P1'],
  ['k', 'P0', 'P2'],
  ['b', 'F', 'P1'],
  ['c', 'F', 'P2'],
  ['e', 'P1', 'P3'],
  ['d', 'F', 'P3'],
  ['f', 'P3', 'P4'],
  ['g', 'P2', 'P4'],
  ['h', 'P4', 'P5'],
  ['i', 'P2', 'P5']
];
const maxHolyError = Math.max(...holyPairs.map(([param, id1, id2]) =>
  Math.abs(distance(firstPoints, id1, id2) - JANSEN_DEFAULT_PARAMS[param])
));
check('11 holy numbers 幾何比例正確（含 a/l 固定偏移）',
  Math.abs(firstPoints.O.x - firstPoints.F.x - JANSEN_DEFAULT_PARAMS.a) < 1e-9 &&
  Math.abs(firstPoints.O.y - firstPoints.F.y - JANSEN_DEFAULT_PARAMS.l) < 1e-9 &&
  maxHolyError < 1e-9,
  `最大桿長誤差 ${maxHolyError.toExponential(2)} mm`);

const first = feet[0];
const last = feet[feet.length - 1];
const closure = Math.hypot(last.x - first.x, last.y - first.y);
const stepDistances = feet.slice(1).map((p, index) => Math.hypot(p.x - feet[index].x, p.y - feet[index].y));
const maxStep = Math.max(...stepDistances);
const xs = feet.map(p => p.x);
const ys = feet.map(p => p.y);
const xSpan = Math.max(...xs) - Math.min(...xs);
const ySpan = Math.max(...ys) - Math.min(...ys);

check('足端 P5 軌跡閉合', closure < 1e-6,
  `閉合誤差 ${closure.toExponential(2)} mm`);
check('足端 P5 軌跡連續、不跳分支', maxStep < 2,
  `最大每度位移 ${maxStep.toFixed(3)} mm`);
check('足端 P5 行程明顯', xSpan > 60 && ySpan > 20,
  `x=${xSpan.toFixed(1)} mm, y=${ySpan.toFixed(1)} mm`);

const blockExample = BLOCK_EXAMPLES.find(e => e.id === 'jansen-leg');
const normalizedBlock = normalizeSnapshot(blockExample.snapshot);
const compiledBlock = compileTopology(blockExample.snapshot.comps, {}, null);
const visualPlates = blockExample.snapshot.comps.filter(c => c.type === 'triangle' && c.visualOnly);
check('blocks 範例畫出 holy numbers 的兩塊剛性三角板，且不新增求解零件',
  visualPlates.length === 2 &&
  visualPlates.every(c => c.color === '#168bd1') &&
  visualPlates.some(c => c.id === 'TriUpper') &&
  visualPlates.some(c => c.id === 'TriLower') &&
  compiledBlock.visualization.polygons.some(poly => poly.points.join('|') === 'F|P1|P3') &&
  compiledBlock.visualization.polygons.some(poly => poly.points.join('|') === 'P2|P4|P5') &&
  !compiledBlock.parts.some(part => visualPlates.some(plate => plate.id === part.id)));

const blockSweep = sweep(blockExample.snapshot.comps, blockExample.snapshot.params, watchIds, 1);
check('blocks 範例下拉中的 Jansen snapshot 全程可解', blockSweep.allValid);

const blockFeet = blockSweep.frames.map(f => f.points.P5).filter(Boolean);
const blockFirstPoints = blockSweep.frames[0].points;
const blockMaxHolyError = Math.max(...holyPairs.map(([param, id1, id2]) =>
  Math.abs(distance(blockFirstPoints, id1, id2) - blockExample.snapshot.params[param])
));
check('blocks 範例使用 11 holy numbers 比例',
  Math.abs(blockFirstPoints.O.x - blockFirstPoints.F.x - blockExample.snapshot.params.a) < 1e-9 &&
  Math.abs(blockFirstPoints.O.y - blockFirstPoints.F.y - blockExample.snapshot.params.l) < 1e-9 &&
  blockMaxHolyError < 1e-9,
  `最大桿長誤差 ${blockMaxHolyError.toExponential(2)} mm`);

const exactParams = ['m', 'j', 'k', 'b', 'c', 'e', 'd', 'f', 'g', 'h', 'i'];
const maxNormalizedParamError = Math.max(...exactParams.map(param =>
  Math.abs(normalizedBlock.params[param] - blockExample.snapshot.params[param])
));
check('blocks 範例載入後不吸附成 8mm 倍數',
  maxNormalizedParamError < 1e-9 &&
  normalizedBlock.comps
    .filter(c => c.type === 'bar' && exactParams.includes(c.lenParam))
    .every(c => c.snapLength === false) &&
  normalizedBlock.comps
    .filter(c => c.type === 'triangle' && c.visualOnly)
    .every(c => c.snapLength === false),
  `最大正規化誤差 ${maxNormalizedParamError.toExponential(2)} mm`);

const blockFirst = blockFeet[0];
const blockLast = blockFeet[blockFeet.length - 1];
const blockXs = blockFeet.map(p => p.x);
const blockYs = blockFeet.map(p => p.y);
const blockClosure = Math.hypot(blockLast.x - blockFirst.x, blockLast.y - blockFirst.y);
const blockMaxStep = Math.max(...blockFeet.slice(1).map((p, index) => Math.hypot(p.x - blockFeet[index].x, p.y - blockFeet[index].y)));
check('blocks 範例足端 P5 軌跡閉合、連續、行程明顯',
  blockClosure < 1e-6 &&
  blockMaxStep < 2 &&
  Math.max(...blockXs) - Math.min(...blockXs) > 60 &&
  Math.max(...blockYs) - Math.min(...blockYs) > 20,
  `閉合 ${blockClosure.toExponential(2)} mm，最大步距 ${blockMaxStep.toFixed(3)} mm`);

report('jansen');
