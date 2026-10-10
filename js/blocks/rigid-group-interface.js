/** 可安裝剛性群組：以既有模組的 base / output / mount 表達，不另存姿態。 */
import { inspectRigidGroup } from './rigid-groups.js';
import { compileAssembly, solveAssembly, outputPose, planeOf } from './assembly.js';
import { mountModule } from './module-ops.js';
import { prepareTaskSnapshot, createTaskOperationSession, taskIssue } from './task-operation-support.js';
import { prepareConnectionWork } from './connection-work.js';
import { pointKeysFor } from './part-types.js';

const fail = (message, code = 'GROUP_INTERFACE_UNSUPPORTED') => ({ ok: false, issues: [taskIssue(code, message)] });
const ground = p => p?.type === 'fixed' && !p.physicalMotor && !p.physical_motor;
const solve = w => solveAssembly(compileAssembly(w.comps, w.modules, { params: w.params }), { thetaDeg: 0, motorAngles: {} });
const fresh = (prefix, used) => { let id = prefix, n = 1; while (used.has(id)) id = `${prefix}-${n++}`; used.add(id); return id; };

export function rigidGroupInterface(comps, modules, hostId, groupId) {
  const host = modules?.find(m => m?.id === hostId), group = host?.rigidGroups?.find(g => g.id === groupId);
  const check = inspectRigidGroup(comps, modules, hostId, group);
  if (!check.ok) return { ok: false, reason: check.reason };
  const body = check.body, own = comps.filter(c => c.moduleId === hostId);
  const independent = own.length === 1 && body.type === 'triangle' && ground(body.p1) && ground(body.p2)
    && !body.physicalMotor && host.base === body.p1.id && check.output.at === body.p1.id;
  return { ...check, host, group, independent, interfacePoint: body.p1.id,
    mounted: !!host.mount, mode: host.mount?.face || host.mount?.orient ? 'spatial' : 'coplanar' };
}

function extract(work, info) {
  const { host, group, body } = info;
  if (info.independent) return fail('此群組已經獨立，可直接拆下或安裝。');
  if (host.mount || body.type !== 'triangle' || group.output !== info.output.id || info.output.at !== body.p1.id || work.modules.length >= 16) return fail('本輪只支援未安裝宿主中、以第一孔作轉軸的多孔板。');
  const carrier = work.comps.find(c => c.moduleId === host.id && c.type === 'bar' && c.isInput
    && c.p1.id === body.p1.id && c.p2.id === body.p2.id);
  if (!carrier) return fail('找不到與基準板同軸同向的驅動桿；不能推測抽離後的運動。');
  const points = new Set(pointKeysFor(body).map(k => body[k]?.id).filter(Boolean));
  if (work.comps.some(c => c.id !== body.id && c.id !== carrier.id && pointKeysFor(c).some(k => points.has(c[k]?.id)))) return fail('基準板仍與其他活動構件共用孔，不能直接抽離。');
  if (host.outputs.some(o => o.id !== group.output && o.body?.id === body.id)
    || work.modules.some(m => m.mount?.to?.module === host.id && (m.mount.to.body === body.id || m.mount.to.output === group.output) && !group.members.includes(m.id))) return fail('基準板還連接群組以外的模組，請先整理連接。');
  const solved = solve(work);
  if (!solved.isValid) return fail('目前作品無法求解，請先修正機構。');
  const ids = new Set(work.modules.map(m => m.id));
  const moduleId = fresh('RigidGroup', ids);
  const usedPoints = new Set(work.comps.flatMap(c => pointKeysFor(c).map(k => c[k]?.id)));
  const extracted = structuredClone(body);
  extracted.moduleId = moduleId;
  for (const k of ['p1', 'p2', 'p3']) {
    const p = solved.points[body[k].id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return fail('基準板孔位無有效解。');
    extracted[k] = { ...body[k], id: fresh(`${moduleId}-${body[k].id}`, usedPoints), x: p.x, y: p.y, type: k === 'p3' ? 'floating' : 'fixed' };
    delete extracted[k].physicalMotor; delete extracted[k].physical_motor;
  }
  delete extracted.physicalMotor; delete extracted.physical_motor; delete extracted.isInput;
  const usedParams = new Set(Object.keys(work.params));
  for (const field of ['gParam', 'r1Param', 'r2Param']) {
    const key = body[field], next = fresh(`${moduleId}-${key}`, usedParams);
    if (!Number.isFinite(work.params[key]) || work.params[key] <= 0) return fail('基準板長度參數無效。');
    extracted[field] = next; work.params[next] = work.params[key];
  }
  work.comps = work.comps.map(c => c.id === body.id ? extracted : c);
  host.outputs = host.outputs.map(o => o.id === group.output ? { id: o.id, name: '驅動輸出', at: carrier.p1.id, body: { kind: 'bar', id: carrier.id } } : o);
  host.rigidGroups = host.rigidGroups.filter(g => g.id !== group.id);
  if (!host.rigidGroups.length) delete host.rigidGroups;
  const ref = outputPose(host, group.output, solved.points, work.comps.filter(c => c.moduleId === host.id));
  if (!ref) return fail('驅動輸出缺少參考姿態。');
  work.modules.push({ id: moduleId, name: group.name, base: extracted.p1.id,
    outputs: [{ id: group.output, name: '基準板', at: extracted.p1.id, body: { kind: 'triangle', id: extracted.id } }],
    mount: { to: { module: host.id, output: group.output }, ref, home: {} }, rigidGroups: [structuredClone(group)] });
  for (const m of work.modules) if (group.members.includes(m.id) && m.mount?.to?.module === host.id) m.mount.to.module = moduleId;
  return { ok: true, hostId: moduleId, groupId: group.id };
}

function prepareInterface(source, request) {
  if (!request || request.operationVersion !== 1 || !['extract', 'detach', 'attach'].includes(request.action)
    || typeof request.hostId !== 'string' || typeof request.groupId !== 'string') return fail('群組操作請求不完整。', 'INVALID_REQUEST');
  const prepared = prepareTaskSnapshot(source, { allowAssembly: true });
  if (!prepared.ok) return prepared;
  const work = prepared.candidateSnapshot;
  const info = rigidGroupInterface(work.comps, work.modules, request.hostId, request.groupId);
  if (!info.ok) return fail(info.reason);
  let result = { ok: true, hostId: request.hostId, groupId: request.groupId };
  if (request.action === 'extract') result = extract(work, info);
  else {
    if (!info.independent || info.mode !== 'coplanar') return fail('請先將群組獨立；此入口只處理同平面轉軸安裝。');
    if (request.action === 'detach') {
      if (!info.mounted) return fail('群組尚未安裝。');
      // 回到板件設計姿態拆下，不旋轉任何內部板面選擇或清除子接合。
      info.host.mount = null;
    } else {
      if (info.mounted) return fail('請先拆下群組再選新的輸出端。');
      const target = request.target;
      if (!target || typeof target.module !== 'string' || typeof target.output !== 'string') return fail('請選擇有效輸出端。');
      if (planeOf(work.comps, work.modules, target.module) != null) return fail('本輪尚不支援跨平面的轉軸安裝。');
      const r = mountModule(work.comps, work.modules, info.host.id, target, work.params, { activeMotor: source.activeMotor || '1', theta: 0, motorAngles: {} });
      if (!r.ok) return fail(`無法安裝群組（${r.reason}）。`);
      work.comps = r.comps; work.modules = r.modules;
    }
  }
  if (!result.ok) return result;
  // 主板平移後，內部六面接合需經正常 rebuild 相同的姿態刷新。
  const connected = prepareConnectionWork(work.comps, work.modules, { params: work.params }, { stockMm: work.fabrication?.cnc?.stockThicknessMm, joint: work.fabrication?.joint, exportSettings: work.fabrication?.export });
  if (connected.warnings.length) return fail('內部接合需重新確認，未套用群組操作。');
  work.modules = connected.modules; work.params = connected.topo.params;
  const after = rigidGroupInterface(work.comps, work.modules, result.hostId, result.groupId);
  if (!after.ok || !solve(work).isValid) return fail('操作後群組無法求解，原作品保持不變。');
  return { ...result, issues: [], candidateSnapshot: work,
    validation: { scope: 'structural_connection_and_reference_pose', unchecked: ['collision', 'fastener_fit', 'load'] } };
}

export function prepareRigidGroupInterface(source, request) {
  try { return prepareInterface(source, request); }
  catch (_) { return fail('群組資料或接合幾何無法驗證，原作品保持不變。'); }
}

export const createRigidGroupInterfaceSession = adapter => createTaskOperationSession({ ...adapter, prepareOperation: prepareRigidGroupInterface });
