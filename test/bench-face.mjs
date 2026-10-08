import { check, report } from './_harness.mjs';
import { S, B, fresh, motor, solveAt } from './_bench-setup.mjs';
import { moduleFrameEdges, orthogonalFrame } from '../js/blocks/assembly.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
const [host, child] = fresh('fourbar-lift', 'gear-gripper');
const port = B.autoPorts(S.comps, S.modules, host.id, S.topo.params).find(p => p.kind === 'edge' && p.suggested);
const connected = B.connect(S.comps, S.modules, child.id, { module: host.id, port: port.id }, S.topo.params, motor);
const standing = B.benchAdjust(connected.comps, connected.modules, child.id, 'stand', S.topo.params);
check('板面接合可預覽', standing.ok);
const edges = moduleFrameEdges(standing.comps, standing.modules, child.id, S.topo.params, { noOwnHoles: true });
const keys = Object.keys(edges).map(Number);
check('只選實體直邊，沿用舊存檔線段索引', JSON.stringify(keys) === JSON.stringify([6,13,20,27]));
for (const i of keys) {
  const result = B.benchAdjust(standing.comps, standing.modules, child.id, `child-edge:${i}`, S.topo.params);
  check(`接觸邊 ${i} 保留宿主與指定底板邊`, result.ok && result.modules.find(m => m.id === child.id).mount.orient.childEdge === i && result.modules.find(m => m.id === child.id).mount.to.module === host.id);
  const saved = normalizeSnapshot(JSON.parse(JSON.stringify({kind:'blocks',v:1,comps:result.comps,modules:result.modules,params:S.topo.params})));
  const sol = solveAt(saved.comps,saved.modules,saved.params,{'1':30});
  check(`舊站立邊 ${i} 重開保留索引及非零姿態`, saved.modules.find(m=>m.id===child.id).mount.orient.childEdge===i && sol.isValid &&
    !!orthogonalFrame(saved.comps,saved.modules,child.id,sol.points,saved.params));
}
for (const edge of [-1, edges.length, 0, 1, 0.5, 'bad']) check(`拒絕無效邊 ${edge}`, !B.benchAdjust(standing.comps, standing.modules, child.id, `child-edge:${edge}`, S.topo.params).ok);
const rotated = B.benchAdjust(standing.comps, standing.modules, child.id, 'rotate', S.topo.params);
check('換站立邊只走下一條材料直邊', rotated.ok && rotated.modules.find(m=>m.id===child.id).mount.orient.childEdge ===
  keys[(keys.indexOf(standing.modules.find(m=>m.id===child.id).mount.orient.childEdge)+1)%keys.length]);
check('未選板面不能指定子模組接觸邊', !B.benchAdjust(connected.comps, connected.modules, child.id, 'child-edge:0', S.topo.params).ok);
report('bench-face');
