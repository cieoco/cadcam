import { tippingBucketSnapshot } from '../js/blocks/tipping-bucket-example.js';
import { createRigidGroup, dissolveRigidGroup, inspectRigidGroup, rigidGroupCandidates, normalizeRigidGroups } from '../js/blocks/rigid-groups.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
import { faceCandidateModel } from '../js/blocks/face-candidate.js';
import { instantiateComposite } from '../js/blocks/module-ops.js';
import { check, report } from './_harness.mjs';
const source = structuredClone(tippingBucketSnapshot), before = JSON.stringify(source);
const candidates = rigidGroupCandidates(source.comps, source.modules);
check('活動側板與三片結構板可成組', candidates.length === 1 && candidates[0].plateCount === 4);
const result = createRigidGroup(source.comps, source.modules, 'Driver', 'side', '料斗');
check('純操作不改來源', result.ok && JSON.stringify(source) === before);
const work = { ...source, modules: result.modules }, group = result.group;
check('固定支架與MG995未作為群組成員', group.members.length === 3 && !group.members.includes('Driver') && inspectRigidGroup(work.comps, work.modules, 'Driver', group).body.id === 'LeftSide');
check('重複成組拒絕', !createRigidGroup(work.comps, work.modules, 'Driver', 'side').ok);
for (const change of [
  w => { w.modules.find(m => m.id === 'Floor').mount = null; },
  w => { w.comps.find(c => c.moduleId === 'Back').p1.type = 'motor'; },
  w => { w.modules.find(m => m.id === 'RightSide').mount.to = { module: 'Back', output: 'moving' }; },
  w => { w.modules.find(m => m.id === 'Driver').outputs = []; },
  w => { w.comps.push({ id: 'Moving', type: 'bar', moduleId: 'Floor' }); },
  w => { w.modules.find(m => m.id === 'Floor').mount.to = { module: 'RightSide', frame: { edge: 0 } }; }
]) {
  const bad = structuredClone(work); change(bad);
  check('拆下／活動件／斷開／循環拒絕剛性宣稱', !inspectRigidGroup(bad.comps, bad.modules, 'Driver', group).ok);
}
const n = normalizeSnapshot(decodeShareString(encodeSnapshot(work)));
const saved = toSnapshot(n.comps, { params: n.params }, n.counter, { modules: n.modules, fabrication: n.fabrication });
check('JSON／分享正規化保留群組', saved.modules.find(m => m.id === 'Driver').rigidGroups[0].name === '料斗'
  && inspectRigidGroup(saved.comps, saved.modules, 'Driver', group).ok);
const dissolved = dissolveRigidGroup(work.modules, 'Driver', group.id);
check('解散不拆板、不改接合', dissolved.ok && JSON.stringify(dissolved.modules) === JSON.stringify(source.modules));
check('復原只需既有snapshot', JSON.stringify(JSON.parse(before)) === before);
check('非法欄位／重複id捨棄', normalizeRigidGroups([{ id: '<x>', output: 'side', members: ['Floor'] }, group, group]).length === 1);
check('非法成員與自我包含拒絕', !inspectRigidGroup(work.comps, work.modules, 'Driver', { ...group, members: ['Driver'] }).ok);
check('不完整公開請求回傳失敗', !createRigidGroup(null, null, 'Driver', 'side').ok && !dissolveRigidGroup(null, 'Driver', 'side').ok);
const copied = instantiateComposite(work, { counter: 100 });
const copiedHost = copied.modules.find(m => m.rigidGroups?.length);
check('組合積木複製成員改號、保持有效', copiedHost && copiedHost.rigidGroups[0].members.every(id => !group.members.includes(id))
  && inspectRigidGroup(copied.comps, copied.modules, copiedHost.id, copiedHost.rigidGroups[0]).ok);
for (const angle of [0, -50, -100]) {
  const pose = w => faceCandidateModel({ work: w }, { theta: angle, motorAngles: { '1': angle } }).model.materialParts;
  check(`成組前後${angle}°材料／孔位／姿態完全相同`, JSON.stringify(pose(source)) === JSON.stringify(pose(work)));
}
report('rigid-groups');
