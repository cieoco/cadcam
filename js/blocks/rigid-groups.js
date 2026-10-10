/** 剛性群組：沿用輸出構件與固定接合樹，不建立第二套姿態或求解器。 */
const safe = value => typeof value === 'string' && /^[\w.-]+$/u.test(value);
const cleanName = value => typeof value === 'string' ? value.replace(/[<>"'`]/g, '').trim().slice(0, 40) : '';

export function normalizeRigidGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set();
  return raw.slice(0, 16).flatMap(g => {
    if (!g || !safe(g.id) || ids.has(g.id) || !safe(g.output) || !Array.isArray(g.members)
      || !g.members.length || g.members.length > 16 || !g.members.every(safe)
      || new Set(g.members).size !== g.members.length) return [];
    ids.add(g.id);
    return [{ id: g.id, name: cleanName(g.name) || '剛性群組', output: g.output, members: [...g.members] }];
  });
}

// 第一版只接納純固定孔的機架板；含活動件的模組不能整包宣稱剛性。
function structuralFrame(comps, id) {
  const own = comps.filter(c => c?.moduleId === id);
  return own.length > 0 && own.every(c => c.type === 'anchor' && c.p1?.type === 'fixed'
    && !c.physicalMotor && !c.physical_motor && !c.p1.physicalMotor && !c.p1.physical_motor);
}
function follows(to, host, output, members) {
  return to && (to.module === host && to.output === output && !to.frame && !to.body
    || members.has(to.module) && !!to.frame && !to.output && !to.body);
}

export function inspectRigidGroup(comps, modules, hostId, group) {
  const fail = reason => ({ ok: false, reason });
  if (!Array.isArray(comps) || !Array.isArray(modules) || !normalizeRigidGroups([group]).length) return fail('群組資料不完整');
  const host = modules.find(m => m?.id === hostId);
  const output = host?.outputs?.find(o => o.id === group.output);
  const body = comps.find(c => c?.moduleId === hostId && c.id === output?.body?.id);
  if (!body || !['bar', 'triangle'].includes(body.type) || output.body.kind !== body.type) return fail('基準板件或輸出端已變更');
  const reached = new Set(), pending = new Set(group.members);
  if (pending.has(hostId)) return fail('固定支架不能與活動輸出整包成組');
  for (let round = 0; round < group.members.length; round++) {
    for (const id of pending) {
      const m = modules.find(x => x?.id === id);
      if (!m || !structuralFrame(comps, id)) return fail('成員含活動件或已刪除；請解散後重新成組');
      if (!m.mount?.face || m.mount.face.childPart !== 'frame') return fail('成員已拆下或不是固定板面接合');
      if (follows(m.mount.to, hostId, group.output, reached)) { reached.add(id); pending.delete(id); }
    }
  }
  if (pending.size) return fail('內部接合已改變；請解散後重新成組');
  return { ok: true, body, output, memberIds: [...reached], plateCount: reached.size + 1,
    unchecked: ['fastener_strength', 'load', 'collision'] };
}

export function rigidGroupCandidates(comps, modules) {
  if (!Array.isArray(comps) || !Array.isArray(modules) || modules.some(m => !m || typeof m !== 'object')) return [];
  const result = [];
  for (const host of modules || []) for (const output of host.outputs || []) {
    const members = new Set();
    for (let round = 0; round < modules.length; round++) for (const m of modules) {
      if (m.id !== host.id && m.mount?.face?.childPart === 'frame' && structuralFrame(comps, m.id)
        && follows(m.mount.to, host.id, output.id, members)) members.add(m.id);
    }
    const group = { id: `group-${output.id}`, name: output.name || '剛性群組', output: output.id, members: [...members] };
    const check = inspectRigidGroup(comps, modules, host.id, group);
    const occupied = modules.some(m => normalizeRigidGroups(m.rigidGroups).some(g =>
      m.id === host.id && (g.output === output.id || m.outputs?.find(o => o.id === g.output)?.body?.id === output.body?.id)
      || g.members.some(id => members.has(id))));
    if (check.ok && !occupied) result.push({ hostId: host.id, group, ...check });
  }
  return result;
}

// UI 與 AI 共用的純操作；呼叫者先檢查 ok，再以既有 pushUndo / rebuild 套用。
export function createRigidGroup(comps, modules, hostId, outputId, name) {
  const candidate = rigidGroupCandidates(comps, modules).find(c => c.hostId === hostId && c.group.output === outputId);
  if (!candidate) return { ok: false, reason: '請先將純結構板接到同一活動板；活動機構或重複成員不能成組' };
  const group = { ...candidate.group, name: cleanName(name) || '剛性群組' };
  const used = new Set(modules.find(m => m.id === hostId)?.rigidGroups?.map(g => g.id));
  while (used.has(group.id)) group.id += '-1';
  return { ok: true, group, modules: modules.map(m => m.id === hostId ? { ...m, rigidGroups: [...(m.rigidGroups || []), group] } : m) };
}

export function dissolveRigidGroup(modules, hostId, groupId) {
  if (!Array.isArray(modules) || !modules.some(m => m?.id === hostId && Array.isArray(m.rigidGroups) && m.rigidGroups.some(g => g?.id === groupId))) return { ok: false, reason: '群組不存在' };
  return { ok: true, modules: modules.map(m => {
    if (m.id !== hostId) return m;
    const { rigidGroups, ...rest } = m, next = rigidGroups.filter(g => g.id !== groupId);
    return next.length ? { ...rest, rigidGroups: next } : rest;
  }) };
}
