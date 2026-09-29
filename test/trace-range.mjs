// S2b 窄範圍軌跡取樣：有限行程很窄時（如夾爪 3.8°），軌跡要有足夠取樣且含兩端點；整圈維持每 5°。
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { planGripper } from '../js/blocks/gripper-workflow.js';
import { clampRangeFromTraces } from '../js/blocks/measurement.js';
import { traceSweepRange, traceSweeps, TRACE_STEP_DEG, TRACE_MIN_SAMPLES } from '../js/blocks/motion.js';
import { check, report } from './_harness.mjs';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

check('常數：整圈步長 5°、窄範圍至少 25 個取樣', TRACE_STEP_DEG === 5 && TRACE_MIN_SAMPLES === 25);

// 1. 整圈與寬範圍：完全沿用舊參數（E-S2 的前提不變）
{
  const r = traceSweepRange(0, 360);
  check('0–360：start 0、end 360、step 5', r.start === 0 && r.end === 360 && r.step === 5);
  const w = traceSweepRange(10, 130);
  check('寬範圍（120°，5° 已有 ≥25 個取樣）維持 step 5、end 不變', w.start === 10 && w.end === 130 && w.step === 5);
}

// 2. 窄範圍：取樣數 ≥ 25，且 sweep 迴圈（th <= end, th += step）會走到兩端點
const walk = ({ start, end, step }) => { const out = []; for (let th = start; th <= end; th += step) out.push(th); return out; };
for (const [lo, hi] of [[12.41947832837468, 16.21160666079959], [0, 90], [30, 31], [-20, 20]]) {
  const r = traceSweepRange(lo, hi);
  const ths = walk(r);
  check(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]：取樣 ≥ 25`, ths.length >= 25, `實際 ${ths.length}`);
  check(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]：首點＝lo`, ths[0] === lo);
  check(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]：末點≈hi（1e-6）且不超出太多`, near(ths[ths.length - 1], hi, 1e-6), String(ths[ths.length - 1]));
  check(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]：步長 ≤ 5`, r.step > 0 && r.step <= 5);
}

// 3. 退化輸入：不當機、回傳可用的單點掃描
{
  const z = traceSweepRange(15, 15);
  check('lo == hi：只取一點', walk(z).length === 1 && z.step > 0);
  const bad = traceSweepRange(NaN, 10);
  check('非有限輸入：退回 0–360 每 5°', bad.start === 0 && bad.end === 360 && bad.step === 5);
  const rev = traceSweepRange(20, 10);
  check('hi < lo：退回 0–360 每 5°', rev.start === 0 && rev.end === 360 && rev.step === 5);
}

// 4. 實際夾爪：兩條軌跡都有多點，兩爪尖距離有明顯變化
//    （爪尖距離≠淨開口：淨開口 70→50 mm 以內彎爪板接觸處估算，爪尖距離實測約變化 13 mm）
{
  const s = BLOCK_EXAMPLES.find(e => e.id === 'gear-gripper').snapshot;
  const plan = planGripper(s.comps, s.params);
  const compiled = compileTopology(s.comps, { params: { ...s.params } }, new Set());
  const r = traceSweepRange(plan.range.lo, plan.range.hi);
  const traces = traceSweeps(compiled, { ...compiled.params, motorAngles: {}, sweepMotor: '1' }, ['LT', 'RT'], r.start, r.end, r.step);
  const valid = traces.map(t => t.results.filter(x => x.isValid && x.B).length);
  check('夾爪：兩條軌跡各 ≥ 25 個有效點', valid.every(n => n >= 25), valid.join('/'));
  const clamp = clampRangeFromTraces(traces[0], traces[1]);
  const diff = clamp ? clamp.max.distance - clamp.min.distance : 0;
  check('夾爪：兩點距離最大−最小 > 5 mm（不再是 150–150）', clamp && diff > 5, diff.toFixed(3));
}

report('trace-range');
