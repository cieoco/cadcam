// 範例驗收：齒輪對（嚙合傳動）。對應 BLOCK_EXAMPLES「齒輪對」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 轉速比 = −N驅動/N從動、反向。
// 還需人工一眼（每範例一次）：齒形畫得對、嚙合相切、紅環只在沒對好時出現。
// 跑法：node test/gear-pair.mjs
import { sweep, angle, unwrapSum, check, report } from './_harness.mjs';

// fixture：GearA 驅動（15 齒、中心帶馬達）、GearB 從動（20 齒、mesh=GearA）。R∝N，故 RA=30、RB=40。
const comps = [
  { type: 'gear', id: 'GearA', color: '#e74c3c',
    p1: { id: 'GCA', type: 'motor', x: -40, y: 0, physicalMotor: '1' },
    p2: { id: 'GPA', type: 'floating', x: -10, y: 0 },
    radiusParam: 'GRA', teeth: 15, phase: 0 },
  { type: 'gear', id: 'GearB', color: '#2c6fbb',
    p1: { id: 'GCB', type: 'fixed', x: 30, y: 0 },
    p2: { id: 'GPB', type: 'floating', x: 70, y: 0 },
    radiusParam: 'GRB', teeth: 20, phase: 0, mesh: 'GearA' }
];

const { frames, allValid } = sweep(comps, { GRA: 30, GRB: 40 }, ['GCA', 'GPA', 'GCB', 'GPB']);
check('全程解得穩（每幀關鍵點都有限）', allValid);

const driverTurn = unwrapSum(frames.map(f => angle(f.points.GPA, f.points.GCA)));
const drivenTurn = unwrapSum(frames.map(f => angle(f.points.GPB, f.points.GCB)));
const ratio = drivenTurn / driverTurn;
const expected = -15 / 20;   // −N驅動/N從動，外嚙合反向
check('轉速比 = −N驅動/N從動 且反向', Math.abs(ratio - expected) < 0.01,
  `量到 ${ratio.toFixed(4)}（預期 ${expected.toFixed(4)}）`);

report('gear-pair');
