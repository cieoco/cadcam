// 初次安裝的轉接座與孔位必須落在宿主短邊內，不能等使用者滑動後才修正。
import { check, report } from './_harness.mjs';
import { S, B, fresh, motor, near } from './_bench-setup.mjs';
import { adapterLayout, adapterSpanMm } from '../js/blocks/orthogonal-joint.js';
import { mountOrthogonal } from '../js/blocks/module-ops.js';
for (const length of [19, 20, 25, 30, 39, 39.9, 40, 80]) {
  const [host, child] = fresh('fourbar-lift', 'gear-gripper');
  S.comps.push({ id: 'ShortHost', type: 'bar', moduleId: host.id,
    p1: { id: 'SH1', type: 'fixed', x: 500, y: 0 },
    p2: { id: 'SH2', type: 'fixed', x: 500 + length, y: 0 }, lenParam: 'sh_len' });
  const params = { ...S.topo.params, sh_len: length };
  const direct = mountOrthogonal(S.comps, S.modules, child.id, { module: host.id, body: 'ShortHost', side: -1 }, params, motor);
  const r = B.connect(S.comps, S.modules, child.id, { module: host.id, port: 'edge:ShortHost:R' }, params, motor);
  if (length < adapterSpanMm()) {
    check(`${length} mm：兩個入口都拒絕過短邊`, !r.ok && !direct.ok);
    continue;
  }
  check(`${length} mm：可安裝`, r.ok && direct.ok);
  const offset = r.modules.find(m => m.id === child.id).mount.orient.offsetMm || 0;
  check(`${length} mm：轉接座整段在邊內`, length / 2 + offset >= 0 && length / 2 + offset + adapterSpanMm() <= length);
  const holes = adapterLayout(r.comps, r.modules, child.id, params).hostHoles;
  check(`${length} mm：孔圓在桿端之內`, holes.every(h => h.u - 1.6 >= 0 && h.u + 1.6 <= length));
  // R4：初裝位置吸附到宿主孔格（孔 u 為 8 的倍數）
  if (length >= 40) check(`${length} mm：初裝孔落在宿主孔格`, holes.every(h => near(h.u / 8, Math.round(h.u / 8))));
}
report('bench-short-edge');
