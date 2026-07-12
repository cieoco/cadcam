// 量測純計算（measurement.js）驗收：工作範圍（最大兩點距）、兩點夾持開口極值、目前距離。
import { workRangeFromTrace, clampRangeFromTraces, currentPointDistance } from '../js/blocks/measurement.js';
import { check, report } from './_harness.mjs';

const trace = points => ({ results: points.map(B => (B ? { isValid: true, B } : { isValid: false })) });

// ---- 工作範圍：半徑 50 的整圈圓 → 最大兩點距 = 直徑 100，X/Y 跨距各 100 ----
const circle = [];
for (let d = 0; d < 360; d += 5) circle.push({ x: 50 * Math.cos(d * Math.PI / 180), y: 50 * Math.sin(d * Math.PI / 180) });
const range = workRangeFromTrace(trace(circle));
check('整圈圓的工作範圍 = 直徑', range && Math.abs(range.distance - 100) < 0.1 && Math.abs(range.spanX - 100) < 0.1 && Math.abs(range.spanY - 100) < 0.1);

// ---- 無效幀被剔除；有效點不足回 null ----
check('少於 2 個有效點回 null', workRangeFromTrace(trace([{ x: 0, y: 0 }, null, null])) === null);
check('無效幀不參與量測', workRangeFromTrace(trace([{ x: 0, y: 0 }, null, { x: 30, y: 40 }])).distance === 50);

// ---- 兩點夾持：兩爪對稱開合 → 最小/最大開口 ----
const jawA = [], jawB = [];
for (let t = 0; t <= 10; t++) { jawA.push({ x: -10 - t, y: 0 }); jawB.push({ x: 10 + t, y: 0 }); }
const clamp = clampRangeFromTraces(trace(jawA), trace(jawB));
check('夾持開口極值 20–40mm', clamp && clamp.min.distance === 20 && clamp.max.distance === 40);
check('同幀配對（不跨幀比距離）', clamp.min.a.x === -10 && clamp.min.b.x === 10);
check('兩軌跡都無效回 null', clampRangeFromTraces(trace([null]), trace([null])) === null);

// ---- 目前距離 ----
check('目前距離 = 兩點歐氏距離', currentPointDistance({ A: { x: 0, y: 0 }, B: { x: 3, y: 4 } }, ['A', 'B']) === 5);
check('缺點位回 null', currentPointDistance({ A: { x: 0, y: 0 } }, ['A', 'B']) === null);

report('measurement');
