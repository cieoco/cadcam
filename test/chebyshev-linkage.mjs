// 範例驗收：近似直線連桿（Chebyshev）。對應 BLOCK_EXAMPLES「切比雪夫連桿：近似直線」。
// 驗收條件：① 全程解得穩 ② 工作區間內耦合點 P 近似走直線 ③ 直線段有足夠水平行程。
// 跑法：node test/chebyshev-linkage.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { sweep, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'chebyshev-linkage');
const comps = example.snapshot.comps;
const params = example.snapshot.params;

const range = (values) => Math.max(...values) - Math.min(...values);

const { frames, allValid } = sweep(comps, params, ['A', 'B', 'C', 'D', 'P'], 1);
check('全程解得穩（每幀 A/B/C/D/P 都有限）', allValid);

// 這組 Chebyshev fixture 的下方耦合點 P，在 270°–330° 是主要近似直線工作段。
const workFrames = frames.filter(f =>
  f.theta >= 270 && f.theta <= 330 &&
  f.points.A && f.points.B && f.points.C && f.points.D && f.points.P
);
const xs = workFrames.map(f => f.points.P.x);
const ys = workFrames.map(f => f.points.P.y);
const xSpan = range(xs);
const ySpan = range(ys);

check('工作區間內 P 點有可觀水平行程', xSpan > 30,
  `x 行程 ${xSpan.toFixed(2)} mm`);
check('工作區間內 P 點近似直線（y 變化 < 1.5 mm）', ySpan < 1.5,
  `y 變化 ${ySpan.toFixed(3)} mm`);
check('近似直線誤差小於水平行程的 5%', ySpan / xSpan < 0.05,
  `y/x = ${(ySpan / xSpan * 100).toFixed(2)}%`);

report('chebyshev-linkage');
