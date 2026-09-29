// S2 軌跡一次掃完：同一份 compiled 只 sweep 一次，再分別取出各軌跡點；結果須與「每點各掃一次」逐點相同（E-S2）。
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { sweepTopology } from '../js/multilink/solver.js';
import { traceSweeps } from '../js/blocks/motion.js';
import { check, report } from './_harness.mjs';

const same = (a, b) => (a == null && b == null)
  || (a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);

let compared = 0;
for (const ex of BLOCK_EXAMPLES) {
  const snap = ex.snapshot;
  if (!snap?.comps?.length) continue;
  const compiled = compileTopology(snap.comps, { params: { ...snap.params } }, new Set());
  const motors = new Set();
  JSON.stringify(snap.comps, (k, v) => { if (k === 'physicalMotor') motors.add(String(v)); return v; });
  const params = motors.size > 1
    ? { ...compiled.params, motorAngles: Object.fromEntries([...motors].map(m => [m, 0])), sweepMotor: '1' }
    : { ...compiled.params };
  // 範例的軌跡點＋所有非固定點，擴大比對面
  const ids = new Set(snap.tracePoints || []);
  snap.comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => { if (c[k]?.id && c[k].type !== 'fixed') ids.add(c[k].id); }));
  const idList = [...ids];

  const fresh = traceSweeps(compiled, params, idList, 0, 360, 5);
  const shapeOk = Array.isArray(fresh) && fresh.length === idList.length
    && fresh.every((t, i) => t.id === idList[i] && Array.isArray(t.results));
  check(`${ex.id}：回傳每個軌跡點一筆、順序與輸入相同`, shapeOk);
  if (!shapeOk) continue;

  let mismatch = '';
  idList.forEach((id, i) => {
    const old = sweepTopology({ ...compiled, tracePoint: id }, params, 0, 360, 5).results;
    const neu = fresh[i].results;
    if (old.length !== neu.length) { mismatch ||= `${id} 步數 ${old.length}≠${neu.length}`; return; }
    old.forEach((r, k) => {
      const n = neu[k];
      if (r.theta !== n.theta || r.isValid !== n.isValid || !same(r.B, n.B)) mismatch ||= `${id} @${r.theta}°`;
    });
    compared++;
  });
  check(`${ex.id}：新舊軌跡逐點相同`, !mismatch, mismatch);
}
check('至少比對 40 條軌跡', compared >= 40, `實際 ${compared}`);

check('空清單回傳空陣列', Array.isArray(traceSweeps(compileTopology([], { params: {} }, new Set()), {}, [], 0, 360, 5))
  && traceSweeps(compileTopology([], { params: {} }, new Set()), {}, [], 0, 360, 5).length === 0);

report('trace-sweep');
