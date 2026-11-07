import { check, report } from './_harness.mjs';
import { S, B, fresh, motor, near } from './_bench-setup.mjs';
// R4：轉接座長 21（(n−1)·8＋2m_h），沿邊位置吸附到宿主孔格（孔自邊起點 8 的倍數）；最短邊改 24
for (const [length, expects] of [[24, [-10.5, -10.5, -10.5]], [39.9, [-18.45, -10.45, -2.45]], [80, [-38.5, -6.5, 17.5]]]) {
  const [host, child] = fresh('fourbar-lift', 'gear-gripper');
  S.comps.push({ id: 'AlignHost', type: 'bar', moduleId: host.id,
    p1: { id: 'AH1', type: 'fixed', x: 500, y: 0 },
    p2: { id: 'AH2', type: 'fixed', x: 500 + length, y: 0 }, lenParam: 'align_len' });
  const params = { ...S.topo.params, align_len: length };
  const r = B.connect(S.comps, S.modules, child.id, { module: host.id, port: 'edge:AlignHost:R' }, params, motor);
  for (const [action, expected] of [['align-start', expects[0]], ['align-center', expects[1]], ['align-end', expects[2]]]) {
    const result = B.benchAdjust(r.comps, r.modules, child.id, action, params);
    const offset = result.modules.find(m => m.id === child.id).mount.orient.offsetMm || 0;
    check(`${length}: ${action} fits edge`, result.ok && offset >= -length / 2 && offset + 21 <= length / 2);
    check(`${length}: ${action} aligns`, near(offset, expected, 0.06));
  }
}
report('bench-align');
