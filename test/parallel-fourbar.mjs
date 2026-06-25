// 範例驗收：平行四邊形連桿。對應 BLOCK_EXAMPLES「四連桿：平行保持」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 穩定工作區間內，輸出桿方向角 − 輸入桿方向角保持常數。
// 跑法：node test/parallel-fourbar.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { sweep, angle, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'parallel-fourbar');
const comps = example.snapshot.comps;
const params = example.snapshot.params;

const circularDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

const { frames, allValid } = sweep(comps, params, ['A', 'B', 'C', 'D'], 5);
check('全程解得穩（每幀 A/B/C/D 都有限）', allValid);

// 純四桿平行四邊形在 toggle/dead-point 後會有分支曖昧；這個範例驗「保持姿態」的穩定工作區間。
const validFrames = frames.filter(f => f.theta <= 270 && f.points.A && f.points.B && f.points.C && f.points.D);
const diffs = validFrames.map(f =>
  circularDiff(angle(f.points.D, f.points.B), angle(f.points.C, f.points.A))
);
const first = diffs[0];
const maxErr = Math.max(...diffs.map(d => Math.abs(circularDiff(d, first))));
check('輸出桿方向角 − 輸入桿方向角保持常數', maxErr < 1e-3,
  `最大誤差 ${maxErr.toExponential(2)} rad`);

report('parallel-fourbar');
