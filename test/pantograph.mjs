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

const { frames, allValid } = sweep(comps, params, ['O', 'I', 'P', 'U', 'V', 'W', 'X'], 5);
check('全程解得穩（每幀 O/I/P/U/V/W/X 都有限）', allValid);

const validFrames = frames.filter(f => f.points.O && f.points.I && f.points.P && f.points.U && f.points.V && f.points.W && f.points.X);
const errors = validFrames.map(f => {
  const { O, I, P } = f.points;
  const expectedX = O.x + scale * (I.x - O.x);
  const expectedY = O.y + scale * (I.y - O.y);
  return Math.hypot(P.x - expectedX, P.y - expectedY);
});
check('輸出點 = 樞軸 + k × 追蹤向量', Math.max(...errors) < 1e-6,
  `k=${scale.toFixed(1)}，最大誤差 ${Math.max(...errors).toExponential(2)} mm`);

const braceErrors = validFrames.map(f => {
  const { O, I, P, U, V, W, X } = f.points;
  return Math.max(
    Math.abs(Math.hypot(U.x - O.x, U.y - O.y) - params.LL2),
    Math.abs(Math.hypot(I.x - U.x, I.y - U.y) - params.LL3),
    Math.abs(Math.hypot(W.x - I.x, W.y - I.y) - params.LL4),
    Math.abs(Math.hypot(P.x - W.x, P.y - W.y) - params.LL5),
    Math.abs(Math.hypot(V.x - O.x, V.y - O.y) - params.LL6),
    Math.abs(Math.hypot(I.x - V.x, I.y - V.y) - params.LL7),
    Math.abs(Math.hypot(X.x - I.x, X.y - I.y) - params.LL8),
    Math.abs(Math.hypot(P.x - X.x, P.y - X.y) - params.LL9),
    Math.abs(Math.hypot(W.x - U.x, W.y - U.y) - params.LL10),
    Math.abs(Math.hypot(X.x - V.x, X.y - V.y) - params.LL11)
  );
});
check('兩段菱形剪架保持約束長度', Math.max(...braceErrors) < 1e-6,
  `最大長度誤差 ${Math.max(...braceErrors).toExponential(2)} mm`);

report('pantograph');
