// S1 依時間播放：播放角速度以「度／秒」計，與螢幕更新率無關（SDD-ASSEMBLY-MODULES §4.4、E-S1）。
import { PLAY_STEP, PLAY_SPEED_DEG_PER_SEC, MAX_FRAME_DT_MS, NOMINAL_FRAME_DT_MS, playStepDeg, advanceByTime } from '../js/blocks/motion.js';
import { advanceRock } from '../js/blocks/rock-motion.js';
import { check, report } from './_harness.mjs';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

check('PLAY_STEP 保留給探路（仍為 2°）', PLAY_STEP === 2);
check('預設速度 120°/s（= 舊版 60Hz × 2°）', PLAY_SPEED_DEG_PER_SEC === 120);
check('單幀 dt 上限 100 ms', MAX_FRAME_DT_MS === 100);
check('名目幀長 1000/60 ms', near(NOMINAL_FRAME_DT_MS, 1000 / 60));

check('60Hz 一幀前進 2°', near(playStepDeg(1000 / 60), 2, 1e-9));
check('120Hz 一幀前進 1°', near(playStepDeg(1000 / 120), 1, 1e-9));
check('一秒總角度與更新率無關', (() => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a += playStepDeg(1000 / 60);
  for (let i = 0; i < 144; i++) b += playStepDeg(1000 / 144);
  return near(a, 120, 1e-6) && near(b, 120, 1e-6);
})());
check('dt 超過上限以 100 ms 計（切分頁回來不暴衝）', near(playStepDeg(5000), 12, 1e-9));
check('dt 為負、NaN、Infinity 時不前進', playStepDeg(-5) === 0 && playStepDeg(NaN) === 0 && playStepDeg(Infinity) === 0);
check('可指定速度', near(playStepDeg(50, 90), 4.5, 1e-9));
check('指定速度時 dt 仍受上限約束', near(playStepDeg(500, 90), 9, 1e-9));
check('速度非有限或為負時不前進', playStepDeg(16, NaN) === 0 && playStepDeg(16, -30) === 0);

check('advanceByTime 正向', near(advanceByTime(10, 1000 / 60, 120, 1), 12, 1e-9));
check('advanceByTime 反向', near(advanceByTime(10, 1000 / 60, 120, -1), 8, 1e-9));
check('advanceByTime 預設正向與預設速度', near(advanceByTime(0, 1000 / 60), 2, 1e-9));
check('advanceByTime 不做 360 取模（沿用舊版累加語意）', near(advanceByTime(359, 1000 / 60, 120, 1), 361, 1e-9));

check('rock 模式：以時間步長搭配 advanceRock 不越界', (() => {
  let theta = 0, dir = 1;
  for (let i = 0; i < 1000; i++) {
    const dt = [1000 / 60, 1000 / 144, 250, 7][i % 4];
    const next = advanceRock(theta, dir, playStepDeg(dt), 10, 50);
    theta = next.theta; dir = next.direction;
    if (theta < 10 - 1e-9 || theta > 50 + 1e-9) return false;
  }
  return true;
})());

report('play-timing');
