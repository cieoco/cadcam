// 範例驗收：凸輪從動件（轉→上下）。對應 BLOCK_EXAMPLES「凸輪從動件」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 從動點由凸輪/滾子相切幾何推出 ③ 只沿導桿方向移動 ④ 接觸半徑正確 ⑤ 行程明顯。
// 還需人工一眼（每範例一次）：凸輪外形、從動件導桿與播放手感。
// 跑法：node test/cam-follower.mjs
import { sweep, check, report } from './_harness.mjs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { camFollowerState } from '../js/utils/cam-profile.js';

const example = BLOCK_EXAMPLES.find(e => e.id === 'cam-follower');
const norm = normalizeSnapshot(example.snapshot);
const baseRadius = norm.params.CBR;
const lift = norm.params.CLF;
const rollerRadius = norm.comps.find(c => c.type === 'cam').rollerRadius;
const axisRad = Math.PI / 2;
const ux = Math.cos(axisRad);
const uy = Math.sin(axisRad);
const nx = -uy;
const ny = ux;

const { frames, allValid } = sweep(norm.comps, norm.params, ['CC', 'CF'], 5);
check('全程解得穩（每幀凸輪中心與從動點都有限）', allValid);

let maxProfileErr = 0;
let maxSideDrift = 0;
let maxTangentErr = 0;
const offsets = [];
for (const f of frames) {
  const c = f.points.CC;
  const p = f.points.CF;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const offset = dx * ux + dy * uy;
  const side = dx * nx + dy * ny;
  const state = camFollowerState({
    profile: 'harmonic',
    baseRadius,
    lift,
    thetaRad: f.theta * Math.PI / 180,
    axisRad,
    rollerRadius
  });
  const expected = state.offset;
  const supportDx = dx - state.support.x;
  const supportDy = dy - state.support.y;
  const contactRadius = Math.hypot(supportDx, supportDy);
  offsets.push(offset);
  maxProfileErr = Math.max(maxProfileErr, Math.abs(offset - expected));
  maxSideDrift = Math.max(maxSideDrift, Math.abs(side));
  maxTangentErr = Math.max(maxTangentErr, Math.abs(contactRadius - rollerRadius));
}

check('從動點由凸輪/滾子相切幾何推出', maxProfileErr < 0.2,
  `最大誤差 ${maxProfileErr.toExponential(2)} mm`);
check('從動點只沿導桿方向移動', maxSideDrift < 1e-9,
  `側向漂移 ${maxSideDrift.toExponential(2)} mm`);
check('接觸線長度等於滾子半徑', maxTangentErr < 0.2,
  `最大半徑誤差 ${maxTangentErr.toExponential(2)} mm`);

const travel = Math.max(...offsets) - Math.min(...offsets);
check('從動件行程明顯，且由輪廓幾何自然產生', travel > lift * 0.5,
  `行程 ${travel.toFixed(2)} mm（lift=${lift}）`);

report('cam-follower');
