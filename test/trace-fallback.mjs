// S4 預設軌跡點：沒指定軌跡點時，compile 的預設點是「第一個接點」，常是地錨或馬達軸心，
// 會畫出不動的點並顯示「工作範圍 0 mm」。退回預設點時須略過固定／馬達軸心點。
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { fallbackTraceIds } from '../js/blocks/motion.js';
import { check, report } from './_harness.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lift = BLOCK_EXAMPLES.find(e => e.id === 'competition-fourbar-lift').snapshot;

check('升降臂預設點 O1（fixed）→ 不畫', same(fallbackTraceIds(lift.comps, 'O1'), []));
check('升降臂浮動點 A → [A]', same(fallbackTraceIds(lift.comps, 'A'), ['A']));
check('騎乘馬達的浮動軸心 B（type floating、帶 physicalMotor）會動 → [B]', same(fallbackTraceIds(lift.comps, 'B'), ['B']));
check('工具端 C → [C]', same(fallbackTraceIds(lift.comps, 'C'), ['C']));

const gear = BLOCK_EXAMPLES.find(e => e.id === 'gear-pair').snapshot;
const gca = gear.comps.find(c => c.type === 'gear').p1;
check('齒輪中心（type motor）→ 不畫', gca.type === 'motor' && same(fallbackTraceIds(gear.comps, gca.id), []));

check('空字串／undefined → []', same(fallbackTraceIds(lift.comps, ''), []) && same(fallbackTraceIds(lift.comps, undefined), []));
check('零件裡找不到的 id → []', same(fallbackTraceIds(lift.comps, 'NOPE'), []));
check('comps 為空 → []', same(fallbackTraceIds([], 'A'), []));
check('同一點某處 fixed、某處 floating → 視為固定', same(fallbackTraceIds([
  { type: 'anchor', id: 'K', p1: { id: 'P', type: 'fixed', x: 0, y: 0 } },
  { type: 'bar', id: 'L', p1: { id: 'P', type: 'floating', x: 0, y: 0 }, p2: { id: 'Q', type: 'floating', x: 9, y: 0 } }
], 'P'), []));
check('滑軌的承載孔 m1（fixed）→ 不畫', same(fallbackTraceIds([
  { type: 'slider', id: 'S', p1: { id: 'r1', type: 'fixed' }, p2: { id: 'r2', type: 'fixed' }, p3: { id: 'blk', type: 'floating' },
    m1: { id: 'm1', type: 'fixed' }, m2: { id: 'm2', type: 'fixed' } }
], 'm1'), []));

// 所有沒指定軌跡點的範例：compile 預設點都是固定或馬達軸心 → 一律不畫（2026-09-29 盤點共 9 個）
let fallbackExamples = 0;
for (const ex of BLOCK_EXAMPLES) {
  const s = ex.snapshot;
  if (!s?.comps?.length || s.tracePoints || s.tracePoint) continue;
  const compiled = compileTopology(s.comps, { params: { ...s.params } }, new Set());
  fallbackExamples++;
  check(`${ex.id}：預設點 ${compiled.tracePoint} 不畫`, same(fallbackTraceIds(s.comps, compiled.tracePoint), []));
}
check('盤點到 9 個沒指定軌跡點的範例', fallbackExamples === 9, String(fallbackExamples));

report('trace-fallback');
