// 範例驗收：縮放儀 pantograph。對應 BLOCK_EXAMPLES「縮放儀：2 倍放大」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 輸出點 P = O + k·(追蹤點 I − O)，k=2。
// 跑法：node test/pantograph.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { sweep, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'pantograph');
const normalized = normalizeSnapshot(example.snapshot);
const comps = normalized.comps;
const params = normalized.params;
const scale = params.LL1 / params.DI;

const { frames, allValid } = sweep(comps, params, ['O', 'I', 'P', 'U', 'V'], 5);
check('全程解得穩（每幀 O/I/P/U/V 都有限）', allValid);

const validFrames = frames.filter(f => f.points.O && f.points.I && f.points.P);
const errors = validFrames.map(f => {
  const { O, I, P } = f.points;
  const expectedX = O.x + scale * (I.x - O.x);
  const expectedY = O.y + scale * (I.y - O.y);
  return Math.hypot(P.x - expectedX, P.y - expectedY);
});
check('輸出點 = 樞軸 + k × 追蹤向量', Math.max(...errors) < 1e-6,
  `k=${scale.toFixed(1)}，最大誤差 ${Math.max(...errors).toExponential(2)} mm`);

const braceErrors = validFrames.map(f => {
  const { O, P, U, V } = f.points;
  return Math.max(
    Math.abs(Math.hypot(U.x - O.x, U.y - O.y) - params.LL2),
    Math.abs(Math.hypot(P.x - U.x, P.y - U.y) - params.LL3),
    Math.abs(Math.hypot(V.x - O.x, V.y - O.y) - params.LL4),
    Math.abs(Math.hypot(P.x - V.x, P.y - V.y) - params.LL5)
  );
});
check('上下支撐桿保持等長菱形架', Math.max(...braceErrors) < 1e-6,
  `最大長度誤差 ${Math.max(...braceErrors).toExponential(2)} mm`);

report('pantograph');
