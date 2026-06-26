// 範例驗收：急回機構。對應 BLOCK_EXAMPLES「急回機構：偏置曲柄滑塊」。
// 驗收條件：① 全程解得穩 ② 滑塊保持在偏置滑軌上 ③ 前進/回程曲柄角度不相等。
// 跑法：node test/quick-return.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { sweep, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'quick-return');
const comps = example.snapshot.comps;
const params = example.snapshot.params;

const projectOnTrack = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
};

const pointLineDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
};

const circularDelta = (a, b) => {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
};

const { frames, allValid } = sweep(comps, params, ['O', 'A', 'M1', 'M2', 'S'], 1);
check('全程解得穩（每幀 O/A/M1/M2/S 都有限）', allValid);

const validFrames = frames.filter(f => f.points.O && f.points.A && f.points.M1 && f.points.M2 && f.points.S);
const projections = validFrames.map(f => projectOnTrack(f.points.S, f.points.M1, f.points.M2));
const offTrack = validFrames.map(f => pointLineDistance(f.points.S, f.points.M1, f.points.M2));
let minIndex = 0;
let maxIndex = 0;
projections.forEach((value, index) => {
  if (value < projections[minIndex]) minIndex = index;
  if (value > projections[maxIndex]) maxIndex = index;
});

const stroke = projections[maxIndex] - projections[minIndex];
const maxStep = Math.max(...projections.slice(1).map((value, index) => Math.abs(value - projections[index])));
const thetaA = validFrames[minIndex].theta;
const thetaB = validFrames[maxIndex].theta;
const shortArc = circularDelta(thetaA, thetaB);
const longArc = 360 - shortArc;
const ratio = longArc / shortArc;

check('滑塊保持在偏置滑軌上', Math.max(...offTrack) < 1e-6,
  `最大偏離 ${Math.max(...offTrack).toExponential(2)} mm`);
check('滑塊行程夠明顯', stroke > 60,
  `行程 ${stroke.toFixed(1)} mm`);
check('滑塊位移連續、不靠跳分支表現快回', maxStep < 4,
  `最大每度位移 ${maxStep.toFixed(2)} mm`);
check('前進/回程曲柄角度明顯不相等（急回）', ratio > 1.5,
  `角度 ${shortArc.toFixed(0)}° / ${longArc.toFixed(0)}°，比例 ${ratio.toFixed(2)}`);

report('quick-return');
