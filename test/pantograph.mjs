// 範例驗收：縮放儀 pantograph。對應 BLOCK_EXAMPLES「縮放儀：2 倍放大」。
// 驗收條件：① 拖曳右端 R 的多個姿態都能解 ② R = B + 2×(P-B)
// ③ 兩支三點桿維持共線 ④ 所有桿長/三點桿邊長維持。
// 跑法：node test/pantograph.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { pointCoords, solvePinnedConstraints } from '../js/blocks/model.js';
import { check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'pantograph');
const normalized = normalizeSnapshot(example.snapshot);
const params = normalized.params;
const scale = params.TR1_Tri4 / params.TG4;

const clone = value => JSON.parse(JSON.stringify(value));
const dist = (pts, a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
const lineError = (pts, a, m, b) => {
  const ax = pts[a].x, ay = pts[a].y;
  const bx = pts[b].x, by = pts[b].y;
  const mx = pts[m].x, my = pts[m].y;
  const len = Math.hypot(bx - ax, by - ay);
  return len > 1e-9 ? Math.abs((bx - ax) * (ay - my) - (ax - mx) * (by - ay)) / len : Infinity;
};

const targets = [
  { x: 192, y: 160 },
  { x: 176, y: 112 },
  { x: 136, y: 200 },
  { x: 224, y: 192 }
];

const poses = targets.map(target => {
  const comps = clone(normalized.comps);
  const ok = solvePinnedConstraints(comps, { params }, 'R', target, { tolerance: 1, iterations: 160 });
  return { ok, target, pts: pointCoords(comps) };
});

const required = ['O', 'A', 'B', 'D', 'P', 'R'];
const allValid = poses.every(pose => pose.ok && required.every(id =>
  pose.pts[id] && Number.isFinite(pose.pts[id].x) && Number.isFinite(pose.pts[id].y)
));
check('多個手動姿態都解得穩（O/A/B/D/P/R 都有限）', allValid);

const scaleErrors = poses.map(({ pts }) => {
  const expectedX = pts.B.x + scale * (pts.P.x - pts.B.x);
  const expectedY = pts.B.y + scale * (pts.P.y - pts.B.y);
  return Math.hypot(pts.R.x - expectedX, pts.R.y - expectedY);
});
check('輸出點 R = B + k × 追蹤向量 BP', Math.max(...scaleErrors) < 1e-6,
  `k=${scale.toFixed(1)}，最大誤差 ${Math.max(...scaleErrors).toExponential(2)} mm`);

const collinearErrors = poses.map(({ pts }) => Math.max(
  lineError(pts, 'O', 'A', 'B'),
  lineError(pts, 'B', 'P', 'R')
));
check('兩支三點桿的中間孔維持在線上', Math.max(...collinearErrors) < 1e-6,
  `最大偏離 ${Math.max(...collinearErrors).toExponential(2)} mm`);

const lengthErrors = poses.map(({ pts }) => Math.max(
  Math.abs(dist(pts, 'O', 'A') - params.TG1),
  Math.abs(dist(pts, 'O', 'B') - params.TR1_Tri1),
  Math.abs(dist(pts, 'A', 'B') - params.TR2_Tri1),
  Math.abs(dist(pts, 'A', 'D') - params.LL2),
  Math.abs(dist(pts, 'D', 'P') - params.LL3),
  Math.abs(dist(pts, 'B', 'P') - params.TG4),
  Math.abs(dist(pts, 'B', 'R') - params.TR1_Tri4),
  Math.abs(dist(pts, 'P', 'R') - params.TR2_Tri4)
));
check('所有桿長/三點桿邊長維持', Math.max(...lengthErrors) < 1,
  `最大誤差 ${Math.max(...lengthErrors).toFixed(2)} mm`);

report('pantograph');
