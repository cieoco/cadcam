// 範例驗收：曲柄搖桿（四連桿）。對應 BLOCK_EXAMPLES「四連桿：曲柄搖桿」。
// 驗收條件（自動，本檔）：① Grashof 預測最短桿可整圈 ② 全程解得穩
// ③ 輸入曲柄整圈轉 ④ 輸出搖桿來回擺但不整圈。
// 跑法：node test/fourbar-crank-rocker.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { sweep, angle, unwrapSum, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'fourbar-crank-rocker');
const comps = example.snapshot.comps;
const params = example.snapshot.params;

const getPoint = (id) => {
  for (const c of comps) {
    for (const key of ['p1', 'p2', 'p3', 'm1', 'm2']) {
      if (c[key]?.id === id) return c[key];
    }
  }
  return null;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unwrappedAngles = (values) => {
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    let v = values[i];
    while (v - out[i - 1] > Math.PI) v -= 2 * Math.PI;
    while (v - out[i - 1] < -Math.PI) v += 2 * Math.PI;
    out.push(v);
  }
  return out;
};

const A = getPoint('A');
const B = getPoint('B');
const lengths = [
  dist(A, B),
  params.LL1,
  params.LL2,
  params.LL3
].sort((x, y) => x - y);
const [S, P, Q, L] = lengths;
check('Grashof 條件預測可整圈（S+L ≤ P+Q）', S + L <= P + Q + 1e-9,
  `S+L=${(S + L).toFixed(1)}, P+Q=${(P + Q).toFixed(1)}`);

const { frames, allValid } = sweep(comps, params, ['A', 'B', 'C', 'D'], 5);
check('全程解得穩（每幀 A/B/C/D 都有限）', allValid);

const validFrames = frames.filter(f => f.points.A && f.points.B && f.points.C && f.points.D);
const driverTurn = unwrapSum(validFrames.map(f => angle(f.points.C, f.points.A)));
check('輸入曲柄整圈轉', Math.abs(Math.abs(driverTurn) - 2 * Math.PI) < 0.05,
  `總轉角 ${(driverTurn * 180 / Math.PI).toFixed(1)}°`);

const rockerAngles = unwrappedAngles(validFrames.map(f => angle(f.points.D, f.points.B)));
const rockerTurn = rockerAngles[rockerAngles.length - 1] - rockerAngles[0];
const rockerSpan = Math.max(...rockerAngles) - Math.min(...rockerAngles);
check('輸出搖桿來回擺、不整圈', Math.abs(rockerTurn) < 0.1 && rockerSpan > 0.5 && rockerSpan < Math.PI,
  `淨轉角 ${(rockerTurn * 180 / Math.PI).toFixed(1)}°，擺幅 ${(rockerSpan * 180 / Math.PI).toFixed(1)}°`);

report('fourbar-crank-rocker');
