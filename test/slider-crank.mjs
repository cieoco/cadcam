// 範例驗收：曲柄滑塊。對應 BLOCK_EXAMPLES「滑塊曲柄：往復運動」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 滑塊沿軌道往復 ③ 行程 = 2 × 曲柄半徑。
// 跑法：node test/slider-crank.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { sweep, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'slider-crank');
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

const { frames, allValid } = sweep(comps, params, ['O', 'A', 'M1', 'M2', 'P3'], 5);
check('全程解得穩（每幀 O/A/M1/M2/P3 都有限）', allValid);

const validFrames = frames.filter(f => f.points.O && f.points.A && f.points.M1 && f.points.M2 && f.points.P3);
const projections = validFrames.map(f => projectOnTrack(f.points.P3, f.points.M1, f.points.M2));
const offTrack = validFrames.map(f => pointLineDistance(f.points.P3, f.points.M1, f.points.M2));
const minPos = Math.min(...projections);
const maxPos = Math.max(...projections);
const stroke = maxPos - minPos;
const crankRadius = params.LL1;

check('滑塊保持在軌道線上', Math.max(...offTrack) < 1e-6,
  `最大偏離 ${Math.max(...offTrack).toExponential(2)} mm`);
check('滑塊沿軌道往復', minPos < projections[0] && maxPos > projections[Math.floor(projections.length / 2)],
  `投影範圍 ${minPos.toFixed(1)}..${maxPos.toFixed(1)} mm`);
check('行程 = 2 × 曲柄半徑', Math.abs(stroke - 2 * crankRadius) < 1e-6,
  `行程 ${stroke.toFixed(1)} mm，曲柄半徑 ${crankRadius.toFixed(1)} mm`);

report('slider-crank');
