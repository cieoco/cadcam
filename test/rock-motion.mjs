import { advanceRock } from '../js/blocks/rock-motion.js';
import { check, report } from './_harness.mjs';

const near = (actual, expected) => Math.abs(actual - expected) < 1e-10;

check('moves normally in the positive direction', (() => {
  const next = advanceRock(3, 1, 2, 0, 10);
  return near(next.theta, 5) && next.direction === 1;
})());

check('moves normally in the negative direction', (() => {
  const next = advanceRock(7, -1, 2, 0, 10);
  return near(next.theta, 5) && next.direction === -1;
})());

check('endpoint directions point inward for either starting sign', (() => {
  const atLoOut = advanceRock(0, -1, 2, 0, 10);
  const atLoIn = advanceRock(0, 1, 2, 0, 10);
  const atHiOut = advanceRock(10, 1, 2, 0, 10);
  const atHiIn = advanceRock(10, -1, 2, 0, 10);
  const landsAtLo = advanceRock(2, -1, 2, 0, 10);
  const landsAtHi = advanceRock(8, 1, 2, 0, 10);
  return near(atLoOut.theta, 2) && atLoOut.direction === 1
    && near(atLoIn.theta, 2) && atLoIn.direction === 1
    && near(atHiOut.theta, 8) && atHiOut.direction === -1
    && near(atHiIn.theta, 8) && atHiIn.direction === -1
    && landsAtLo.theta === 0 && landsAtLo.direction === 1
    && landsAtHi.theta === 10 && landsAtHi.direction === -1;
})());

check('keeps motion across a span narrower than one step', (() => {
  const next = advanceRock(0, 1, 1.25, 0, 0.25);
  return near(next.theta, 0.25) && next.direction === -1;
})());

check('preserves travel through multiple bounces', (() => {
  const next = advanceRock(2, 1, 35, 0, 10);
  return near(next.theta, 3) && next.direction === -1;
})());

check('zero span stays at its single position', (() => {
  const next = advanceRock(4, -1, 20, 4, 4);
  return next.theta === 4 && next.direction === 1;
})());

check('clamps an out-of-range starting position before advancing', (() => {
  const next = advanceRock(-5, 1, 2, 0, 10);
  return near(next.theta, 2) && next.direction === 1;
})());

check('invalid inputs return the documented neutral fallback', (() => {
  const nonFinite = advanceRock(Number.NaN, -1, 1, 2, 8);
  const negativeStep = advanceRock(4, 1, -1, 2, 8);
  const reversedRange = advanceRock(4, 1, 1, 8, 2);
  return nonFinite.theta === 2 && nonFinite.direction === 1
    && negativeStep.theta === 2 && negativeStep.direction === 1
    && reversedRange.theta === 8 && reversedRange.direction === 1;
})());

report('rock-motion');
