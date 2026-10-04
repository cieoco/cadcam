import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { measureFourbarSwing } from '../js/blocks/fourbar-measurement.js';

const lesson = normalizeSnapshot(getExample('fourbar-crank-rocker').snapshot);
const before = JSON.stringify(lesson);
const base = measureFourbarSwing(lesson.comps, lesson.params);
assert.equal(base.ok, true, base.message);
assert.equal(base.inputMode, 'rotate');
assert.equal(base.outputMode, 'rock');
assert.ok(base.spanDeg > 0 && base.spanDeg < 180);
const longer = measureFourbarSwing(lesson.comps, { ...lesson.params, LL3: 88 });
assert.equal(longer.ok, true, longer.message);
assert.ok(Math.abs(longer.spanDeg - base.spanDeg) > 1, `${base.spanDeg} vs ${longer.spanDeg}`);
assert.equal(JSON.stringify(lesson), before);

const double = JSON.parse(before);
for (const c of double.comps) for (const key of ['p1', 'p2']) {
  if (c[key]?.id === 'B') c[key].x = -48;
}
double.params = { ...double.params, LL1: 80, LL2: 96, LL3: 80 };
const rotating = measureFourbarSwing(double.comps, double.params);
assert.equal(rotating.ok, true, rotating.message);
assert.equal(rotating.outputMode, 'rotate');
assert.equal(rotating.spanDeg, 360);
assert.match(rotating.message, /整圈旋轉/);

const partial = measureFourbarSwing(lesson.comps, { ...lesson.params, LL1: 96, LL2: 64, LL3: 80, theta: 60 });
assert.equal(partial.ok, false);
assert.equal(partial.spanDeg, null);
assert.match(partial.message, /部分可達|死點/);
assert.equal(measureFourbarSwing([], {}).ok, false);
assert.equal(measureFourbarSwing(null, null).ok, false);
assert.equal(measureFourbarSwing(lesson.comps, { ...lesson.params, LL3: NaN }).ok, false);
const anchored = JSON.parse(before);
anchored.comps.find(c => c.id === 'Link2').p2.type = 'fixed';
assert.equal(measureFourbarSwing(anchored.comps, anchored.params).ok, false);
console.log(`fourbar-measurement: passed; BD 80 mm → ${base.spanDeg}°, 88 mm → ${longer.spanDeg}°`);
