/** 從既有兩個範例經共同群組操作建立托斗；不另造機構幾何。 */
import { tippingBucketSnapshot } from './tipping-bucket-example.js';
import { createRigidGroup } from './rigid-groups.js';
import { prepareRigidGroupInterface } from './rigid-group-interface.js';
export function liftBucketSnapshot(liftSource) {
  let work = structuredClone(tippingBucketSnapshot);
  const group = createRigidGroup(work.comps, work.modules, 'Driver', 'side', '托斗');
  work.modules = group.modules;
  for (const [action, hostId] of [['extract', 'Driver'], ['detach', 'RigidGroup']]) {
    const r = prepareRigidGroupInterface(work, { operationVersion: 1, action, hostId, groupId: group.group.id });
    if (!r.ok) throw Error(r.issues[0].message);
    work = r.candidateSnapshot;
  }
  work.comps = work.comps.filter(c => c.moduleId !== 'Driver');
  work.modules = work.modules.filter(m => m.id !== 'Driver');
  const lift = structuredClone(liftSource);
  work.comps.push(...lift.comps.map(c => ({ ...c, moduleId: 'Lift' })));
  work.modules.unshift({ id: 'Lift', name: '平行升降臂', base: 'A', outputs: [{ id: 'tool', name: '保持姿態工具架', at: 'C', body: { kind: 'bar', id: 'Link3' } }], mount: null });
  work.params = { ...work.params, ...lift.params, liftBucket: 1 };
  delete work.params.bucketAssembly;
  const r = prepareRigidGroupInterface(work, { operationVersion: 1, action: 'attach', hostId: 'RigidGroup', groupId: group.group.id, target: { module: 'Lift', output: 'tool' } });
  if (!r.ok) throw Error(r.issues[0].message);
  return r.candidateSnapshot;
}
