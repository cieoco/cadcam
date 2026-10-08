// S3 漏解警示：solver 回報有效、卻有會動的接點沒解出時，要能列出來（SDD-ASSEMBLY-MODULES §4.4、E-S3）。
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { unsolvedMovingPoints } from '../js/blocks/solve-health.js';
import { check, report } from './_harness.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const motorsOf = comps => {
  const m = new Set();
  JSON.stringify(comps, (k, v) => { if (k === 'physicalMotor') m.add(String(v)); return v; });
  return m;
};
const solve = (comps, params, motorAngles) => {
  const compiled = compileTopology(comps, { params: { ...params } }, new Set());
  return solveTopology(compiled, motorAngles ? { thetaDeg: 0, motorAngles } : { thetaDeg: 0 });
};

// 1. 所有範例在多個角度都不應誤報（示意物件 workpiece 不參與求解，須排除）
for (const ex of BLOCK_EXAMPLES) {
  const s = ex.snapshot;
  if (!s?.comps?.length) continue;
  const motors = motorsOf(s.comps);
  let bad = '';
  for (const deg of [0, 90, 180, 270]) {
    const angles = motors.size > 1 ? Object.fromEntries([...motors].map(m => [m, m === '1' ? deg : 0])) : null;
    const compiled = compileTopology(s.comps, { params: { ...s.params } }, new Set());
    const sol = solveTopology(compiled, angles ? { thetaDeg: deg, motorAngles: angles } : { thetaDeg: deg });
    const miss = unsolvedMovingPoints(s.comps, sol);
    if (!Array.isArray(miss)) { bad = '回傳不是陣列'; break; }
    if (sol.isValid !== false && miss.length) { bad = `${deg}°：${miss.join(',')}`; break; }
  }
  check(`${ex.id}：不誤報`, !bad, bad);
}

// 2. L0 的錯誤接法：夾爪齒輪中心直接共用升降滑台的點。
// solver 現在會直接拒絕無法保持孔距的三角板；漏解檢查仍需涵蓋歷史部分結果。
{
  const lift = clone(BLOCK_EXAMPLES.find(e => e.id === 'competition-rack-lift').snapshot);
  const grip = clone(BLOCK_EXAMPLES.find(e => e.id === 'gear-gripper').snapshot);
  grip.comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => { if (c[k]?.physicalMotor) c[k].physicalMotor = '2'; }));
  const gripIds = new Set(grip.comps.map(c => c.id));
  const comps = clone([...lift.comps, ...grip.comps]);
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
    if (!c[k] || !gripIds.has(c.id)) return;
    c[k].x += 75; c[k].y += 88;
    if (c[k].id === 'GCA') { c[k].id = 'LiftOutput'; c[k].type = 'floating'; }
    if (c[k].id === 'GCB') c[k].type = 'floating';
  }));
  const sol = solve(comps, { ...lift.params, ...grip.params }, { '1': 1, '2': 0 });
  const miss = unsolvedMovingPoints(comps, sol);
  check('錯誤接法：solver 拒絕且指出無法保持孔距的構件', sol.isValid === false && /LeftJaw.*孔距/.test(sol.errorReason || ''), sol.errorReason || '');
  check('錯誤接法：整体無解由 solver 診斷，漏解檢查不重複報警', miss.length === 0);
  const partial = unsolvedMovingPoints(comps, { ...sol, isValid: true });
  check('歷史部分結果：有效標記仍不能掩蓋 GCB、GPB、RT 漏解', ['GCB', 'GPB', 'RT'].every(id => partial.includes(id)) && partial.length === 3, partial.join(','));
}

// 3. 同一點在某個零件標 fixed、另一個標 floating：視為固定，不列入
{
  const comps = [
    { type: 'anchor', id: 'A1', p1: { id: 'P', type: 'fixed', x: 0, y: 0 } },
    { type: 'bar', id: 'L1', p1: { id: 'P', type: 'floating', x: 0, y: 0 }, p2: { id: 'Q', type: 'floating', x: 40, y: 0 }, lenParam: 'LL1' }
  ];
  const miss = unsolvedMovingPoints(comps, { isValid: true, points: { Q: { x: 40, y: 0 } } });
  check('fixed 優先：共用點其一為 fixed 就不算漏解', miss.length === 0, miss.join(','));
}

// 4. 邊界輸入
check('sol 為 null 回傳空陣列', unsolvedMovingPoints([], null).length === 0);
check('sol.isValid 為 false 時回傳空陣列（整體無解另有狀態）', unsolvedMovingPoints(
  [{ type: 'bar', id: 'L', p1: { id: 'a', type: 'floating', x: 0, y: 0 }, p2: { id: 'b', type: 'floating', x: 1, y: 0 } }],
  { isValid: false, points: {} }).length === 0);
check('座標為 NaN 視為沒解出', unsolvedMovingPoints(
  [{ type: 'bar', id: 'L', p1: { id: 'a', type: 'fixed', x: 0, y: 0 }, p2: { id: 'b', type: 'floating', x: 1, y: 0 } }],
  { isValid: true, points: { a: { x: 0, y: 0 }, b: { x: NaN, y: 0 } } }).join(',') === 'b');
check('結果不重複', (() => {
  const comps = [
    { type: 'bar', id: 'L1', p1: { id: 'a', type: 'fixed', x: 0, y: 0 }, p2: { id: 'b', type: 'floating', x: 1, y: 0 } },
    { type: 'bar', id: 'L2', p1: { id: 'b', type: 'floating', x: 1, y: 0 }, p2: { id: 'c', type: 'fixed', x: 2, y: 0 } }
  ];
  const miss = unsolvedMovingPoints(comps, { isValid: true, points: { a: { x: 0, y: 0 }, c: { x: 2, y: 0 } } });
  return miss.length === 1 && miss[0] === 'b';
})());

report('solve-health');
