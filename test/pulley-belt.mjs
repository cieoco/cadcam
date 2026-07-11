// 範例驗收：皮帶輪傳動（open belt，同向變速）。對應 BLOCK_EXAMPLES「皮帶輪傳動」。
// 驗收條件（自動，本檔）：① 全程解得穩 ② 從動/主動角速度比 = R主動/R從動 ③ 開口皮帶同向 ④ 外公切線與包覆弧幾何可成立。
// 還需人工一眼（每範例一次）：皮帶直線段+繞輪弧線、輪槽/輪緣孔與播放手感。
// 跑法：node test/pulley-belt.mjs
import { sweep, angle, unwrapSum, check, report } from './_harness.mjs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { buildOpenBeltPath, openBeltTangents } from '../js/blocks/transmission-geometry.js';

const example = BLOCK_EXAMPLES.find(e => e.id === 'pulley-belt');
const norm = normalizeSnapshot(example.snapshot);
const RA = norm.params.PRA;
const RB = norm.params.PRB;

const { frames, allValid } = sweep(norm.comps, norm.params, ['PLA', 'PPA', 'PLB', 'PPB']);
check('全程解得穩（每幀兩輪中心與輪緣孔都有限）', allValid);

const driverTurn = unwrapSum(frames.map(f => angle(f.points.PPA, f.points.PLA)));
const drivenTurn = unwrapSum(frames.map(f => angle(f.points.PPB, f.points.PLB)));
const ratio = drivenTurn / driverTurn;
const expected = RA / RB;
check('角速度比 = R主動/R從動', Math.abs(ratio - expected) < 0.01,
  `量到 ${ratio.toFixed(4)}（預期 ${expected.toFixed(4)}）`);
check('開口皮帶兩輪同向旋轉', ratio > 0,
  `ratio=${ratio.toFixed(4)}`);

const a = frames[0].points.PLA;
const b = frames[0].points.PLB;
const d = Math.hypot(b.x - a.x, b.y - a.y);
const tangentExists = d > Math.abs(RA - RB);
check('兩輪可建立開口皮帶外公切線', tangentExists,
  `中心距 ${d.toFixed(1)}mm，半徑差 ${Math.abs(RA - RB).toFixed(1)}mm`);
const tangents = openBeltTangents(a, RA, b, RB);
const path = buildOpenBeltPath(a, RA, b, RB, p => p);
check('皮帶 SVG 路徑由獨立傳動幾何模組生成', tangents.length === 2 && path.startsWith('M ') && path.endsWith(' Z'));

report('pulley-belt');
