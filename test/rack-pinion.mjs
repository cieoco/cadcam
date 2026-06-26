// 範例驗收：齒條齒輪（rack-and-pinion，轉→直線）。對應 BLOCK_EXAMPLES「齒條齒輪」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 位移 = R·θ（純滾動，沿軸向線性）③ 轉一圈行程 = 2πR。
// 還需人工一眼（每範例一次）：齒桿齒形畫得對、與小齒輪相切咬合、沒對好時齒桿轉紅。
// 跑法：node test/rack-pinion.mjs
import { sweep, check, report } from './_harness.mjs';

const R = 30;   // 小齒輪節圓半徑（PR）

// fixture：小齒輪 Pinion（15 齒、中心帶馬達、R=30）驅動水平齒條 Rack1（沿 +x 平移）。
const comps = [
  { type: 'gear', id: 'Pinion', color: '#e74c3c',
    p1: { id: 'PC', type: 'motor', x: 0, y: 0, physicalMotor: '1' },
    p2: { id: 'PP', type: 'floating', x: 18, y: 0 },
    radiusParam: 'PR', teeth: 15, module: 4, phase: 0 },
  { type: 'rack', id: 'Rack1', color: '#16a085',
    p1: { id: 'RKP', type: 'floating', x: 0, y: -30 },
    pinion: 'Pinion', lenParam: 'RKL', axisDeg: 0, sign: 1 }
];

const { frames, allValid } = sweep(comps, { PR: R, RKL: 160 }, ['PC', 'PP', 'RKP']);
check('全程解得穩（每幀關鍵點都有限）', allValid);

// 位移 = R·θ：齒條沿軸向（+x）位移應線性正比於小齒輪轉角，斜率＝R。
const base = frames[0].points.RKP;            // θ=0 起始位置
let maxErr = 0;
let maxDriftY = 0;
for (const f of frames) {
  const s = f.points.RKP.x - base.x;          // 沿 +x 的位移
  const expected = R * (f.theta * Math.PI / 180);
  maxErr = Math.max(maxErr, Math.abs(s - expected));
  maxDriftY = Math.max(maxDriftY, Math.abs(f.points.RKP.y - base.y));   // 應只沿軸向移動，y 不動
}
check('位移 = R·θ（純滾動，沿軸向線性）', maxErr < 0.5, `最大誤差 ${maxErr.toFixed(4)}mm`);
check('只沿軸向平移（垂直方向不漂移）', maxDriftY < 1e-6, `最大 y 漂移 ${maxDriftY.toExponential(2)}mm`);

// 轉一整圈 → 齒條走過一個節圓周長 2πR。
const total = frames[frames.length - 1].points.RKP.x - base.x;
const expectedTotal = 2 * Math.PI * R;
check('轉一圈行程 = 2πR', Math.abs(total - expectedTotal) < 1,
  `量到 ${total.toFixed(2)}（預期 ${expectedTotal.toFixed(2)}）`);

report('rack-pinion');
