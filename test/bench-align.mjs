import { check, report } from './_harness.mjs';
import { S, B, fresh, motor, near } from './_bench-setup.mjs';
for (const length of [20, 39.9, 80]) {
  const [host, child] = fresh('fourbar-lift', 'gear-gripper');
  S.comps.push({ id: 'AlignHost', type: 'bar', moduleId: host.id,
    p1: { id: 'AH1', type: 'fixed', x: 500, y: 0 },
    p2: { id: 'AH2', type: 'fixed', x: 500 + length, y: 0 }, lenParam: 'align_len' });
  const params = { ...S.topo.params, align_len: length };
  const r = B.connect(S.comps, S.modules, child.id, { module: host.id, port: 'edge:AlignHost:R' }, params, motor);
  for (const [action, expected] of [['align-start', -length / 2], ['align-center', -10], ['align-end', length / 2 - 20]]) {
    const result = B.benchAdjust(r.comps, r.modules, child.id, action, params);
    const offset = result.modules.find(m => m.id === child.id).mount.orient.offsetMm || 0;
    check(`${length}: ${action} fits edge`, result.ok && offset >= -length / 2 && offset + 20 <= length / 2);
    check(`${length}: ${action} aligns`, near(offset, expected, 0.051));
  }
}
report('bench-align');
