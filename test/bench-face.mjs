import { check, report } from './_harness.mjs';
import { S, B, fresh, motor } from './_bench-setup.mjs';
import { moduleFrameEdges } from '../js/blocks/assembly.js';
const [host, child] = fresh('fourbar-lift', 'gear-gripper');
const port = B.autoPorts(S.comps, S.modules, host.id, S.topo.params).find(p => p.kind === 'edge' && p.suggested);
const connected = B.connect(S.comps, S.modules, child.id, { module: host.id, port: port.id }, S.topo.params, motor);
const standing = B.benchAdjust(connected.comps, connected.modules, child.id, 'stand', S.topo.params);
check('板面接合可預覽', standing.ok);
const count = moduleFrameEdges(standing.comps, standing.modules, child.id, S.topo.params, { noOwnHoles: true }).length;
for (let i = 0; i < count; i++) {
  const result = B.benchAdjust(standing.comps, standing.modules, child.id, `child-edge:${i}`, S.topo.params);
  check(`接觸邊 ${i} 保留宿主與指定底板邊`, result.ok && result.modules.find(m => m.id === child.id).mount.orient.childEdge === i && result.modules.find(m => m.id === child.id).mount.to.module === host.id);
}
for (const edge of [-1, count, 0.5, 'bad']) check(`拒絕無效邊 ${edge}`, !B.benchAdjust(standing.comps, standing.modules, child.id, `child-edge:${edge}`, S.topo.params).ok);
check('未選板面不能指定子模組接觸邊', !B.benchAdjust(connected.comps, connected.modules, child.id, 'child-edge:0', S.topo.params).ok);
report('bench-face');
