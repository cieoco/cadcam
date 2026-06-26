// 範例驗收：減速齒輪列。對應 BLOCK_EXAMPLES「減速齒輪列：4 倍減速」。
// 驗收條件：① 全程解得穩 ② 末輪/首輪總轉角 = 連乘齒比 ③ 相鄰齒輪反向。
// 跑法：node test/reduction-gear-train.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { sweep, angle, unwrapSum, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'reduction-gear-train');
const comps = example.snapshot.comps;
const params = example.snapshot.params;

const { frames, allValid } = sweep(comps, params, ['GCA', 'GPA', 'GCB', 'GPB', 'GCC', 'GPC'], 1);
check('全程解得穩（每幀關鍵點都有限）', allValid);

const turnA = unwrapSum(frames.map(f => angle(f.points.GPA, f.points.GCA)));
const turnB = unwrapSum(frames.map(f => angle(f.points.GPB, f.points.GCB)));
const turnC = unwrapSum(frames.map(f => angle(f.points.GPC, f.points.GCC)));
const ratioBA = turnB / turnA;
const ratioCB = turnC / turnB;
const ratioCA = turnC / turnA;
const expectedBA = -12 / 24;
const expectedCB = -24 / 48;
const expectedCA = 12 / 48;

check('GearB / GearA = -12/24（相鄰反向）', Math.abs(ratioBA - expectedBA) < 0.01,
  `量到 ${ratioBA.toFixed(4)}（預期 ${expectedBA.toFixed(4)}）`);
check('GearC / GearB = -24/48（相鄰反向）', Math.abs(ratioCB - expectedCB) < 0.01,
  `量到 ${ratioCB.toFixed(4)}（預期 ${expectedCB.toFixed(4)}）`);
check('末輪/首輪總轉角 = 連乘齒比，且三齒輪列末輪同向', Math.abs(ratioCA - expectedCA) < 0.01,
  `量到 ${ratioCA.toFixed(4)}（預期 ${expectedCA.toFixed(4)}）`);

report('reduction-gear-train');
