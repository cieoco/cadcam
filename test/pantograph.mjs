// 範例驗收：縮放儀 pantograph。對應 BLOCK_EXAMPLES「縮放儀：2 倍放大」。
// 驗收條件（自動，本檔）：① 多個手動姿態都解得穩 ② 輸出點 P = O + k·(追蹤點 I − O)，k=2。
// 跑法：node test/pantograph.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'pantograph');
const normalized = normalizeSnapshot(example.snapshot);
const params = normalized.params;
const scale = params.LL1 / params.DI;

const clone = value => JSON.parse(JSON.stringify(value));
const movePoint = (comps, id, x, y) => {
  comps.forEach(c => {
    ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => {
      if (c[k]?.id === id) { c[k].x = x; c[k].y = y; }
    });
  });
};
const solveManualPose = (angleDeg, prevPoints) => {
  const comps = clone(normalized.comps);
  const a = angleDeg * Math.PI / 180;
  movePoint(comps, 'P', Math.cos(a) * params.LL1, Math.sin(a) * params.LL1);
  const topo = { params: { theta: 0, ...params }, tracePoints: normalized.tracePoints || [] };
  const compiled = compileTopology(comps, topo, new Set());
  const sol = solveTopology(compiled, { thetaDeg: 0, _prevPoints: prevPoints });
  return { comps, sol };
};

const poses = [];
let prevPoints = null;
for (const angle of [-25, 0, 25, 50]) {
  const pose = solveManualPose(angle, prevPoints);
  poses.push({ angle, points: pose.sol.points || {}, isValid: pose.sol && pose.sol.isValid !== false });
  prevPoints = pose.sol.points || prevPoints;
}
const allValid = poses.every(f => f.isValid && ['O', 'I', 'P', 'M', 'N'].every(id =>
  f.points[id] && Number.isFinite(f.points[id].x) && Number.isFinite(f.points[id].y)
));
check('多個手動姿態都解得穩（O/I/P/M/N 都有限）', allValid);

const validFrames = poses.filter(f => ['O', 'I', 'P', 'M', 'N'].every(id => f.points[id]));
const errors = validFrames.map(f => {
  const { O, I, P } = f.points;
  const expectedX = O.x + scale * (I.x - O.x);
  const expectedY = O.y + scale * (I.y - O.y);
  return Math.hypot(P.x - expectedX, P.y - expectedY);
});
check('輸出點 = 樞軸 + k × 追蹤向量', Math.max(...errors) < 1e-6,
  `k=${scale.toFixed(1)}，最大誤差 ${Math.max(...errors).toExponential(2)} mm`);

// 平行四邊形 O-M-N-P：四邊各維持固定桿長，且對邊相等（→ 真平行四邊形，比例骨架不變形）
const braceErrors = validFrames.map(f => {
  const { O, I, P, M, N } = f.points;
  const OM = Math.hypot(M.x - O.x, M.y - O.y);
  const PN = Math.hypot(N.x - P.x, N.y - P.y);
  const MN = Math.hypot(N.x - M.x, N.y - M.y);
  const OP = Math.hypot(P.x - O.x, P.y - O.y);
  return Math.max(
    Math.abs(OM - params.LL2),                      // O-M
    Math.abs(Math.hypot(M.x - I.x, M.y - I.y) - params.LL3), // I-M
    Math.abs(Math.hypot(N.x - I.x, N.y - I.y) - params.LL4), // I-N
    Math.abs(PN - params.LL5),                      // P-N
    Math.abs(MN - params.LL6),                      // M-N
    Math.abs(OM - PN),                              // 對邊 O-M = P-N
    Math.abs(MN - OP)                               // 對邊 M-N = O-P
  );
});
check('平行四邊形骨架保持約束長度且對邊相等', Math.max(...braceErrors) < 1e-6,
  `最大長度誤差 ${Math.max(...braceErrors).toExponential(2)} mm`);

report('pantograph');
