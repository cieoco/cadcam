/** 窄的夾爪結構化操作：複製作品，重用 planner；不讀 DOM 或全域 state。 */
import { getExample } from './examples.js';
import { normalizeSnapshot } from './schema.js';
import { validateMotionRange } from './motion-range-validation.js';
import { gripperTips, planGripper } from './gripper-workflow.js';

export const GRIPPER_OPERATION_VERSION = 1;
const keys = ['gripperObjectWidth', 'gripperClearance'];
const clone = value => JSON.parse(JSON.stringify(value));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
function jsonSafe(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) return false;
  seen.add(value);
  const ok = Object.values(value).every(v => jsonSafe(v, seen));
  seen.delete(value); return ok;
}
export const gripperIssue = (code, message, targets = []) => ({ code, severity: 'error', message, targets });
// 對物件鍵排序：snapshot 屬性順序不應影響來源比對。
export function gripperSnapshotKey(value) {
  if (Array.isArray(value)) return '[' + value.map(gripperSnapshotKey).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + gripperSnapshotKey(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function changedProvided(before, after, path, changes) {
  if (record(before) || Array.isArray(before)) {
    if (!after || typeof after !== 'object' || Array.isArray(before) !== Array.isArray(after)) {
      changes.push({path, before, after}); return;
    }
    for (const key of Object.keys(before)) changedProvided(before[key], after[key], `${path}.${key}`, changes);
    if (Array.isArray(before) && before.length !== after.length) changes.push({path: `${path}.length`, before: before.length, after: after.length});
  } else if (!Object.is(before, after)) changes.push({path, before, after});
}
export function prepareGripperOperation(sourceSnapshot, request) {
  const fail = (code, message, targets = [], changes = []) => ({ok: false, operationVersion: 1, issues: [gripperIssue(code, message, targets)], changes});
  if (!record(request) || request.operationVersion !== 1 || !['createFromExample', 'updateTask'].includes(request.action))
    return fail('INVALID_REQUEST', '請提供版本 1 的 createFromExample 或 updateTask 請求。');
  const allowed = request.action === 'createFromExample' ? ['operationVersion','action','exampleId','parameters'] : ['operationVersion','action','parameters'];
  if (Object.keys(request).some(k => !allowed.includes(k)) || (request.parameters !== undefined && !record(request.parameters)))
    return fail('INVALID_REQUEST', '請求含未知欄位或 parameters 格式不正確。');
  const parameters = request.parameters || {};
  if (Object.keys(parameters).some(k => !keys.includes(k))) return fail('INVALID_REQUEST', '本操作只支援物件寬度與單側餘量。', Object.keys(parameters).filter(k => !keys.includes(k)));
  for (const key of Object.keys(parameters)) {
    const v = parameters[key], [min, max] = key === keys[0] ? [10,150] : [2,40];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return fail('INVALID_DIMENSIONS', `${key} 必須是 ${min}–${max} 的有限數字。`, [`params.${key}`]);
  }
  if (request.action === 'createFromExample' && request.exampleId !== 'gear-gripper') return fail('INVALID_REQUEST', '本操作只支援 gear-gripper 範例。', ['exampleId']);
  const source = request.action === 'createFromExample' ? getExample('gear-gripper').snapshot : sourceSnapshot;
  if (!record(source) || source.kind !== 'blocks' || source.v !== 1 || !Array.isArray(source.comps) || !record(source.params)) return fail('INVALID_REQUEST', '修改需要完整 blocks v1 來源作品。');
  if (!jsonSafe(source)) return fail('INVALID_REQUEST', '來源包含非 JSON 資料，請先修復作品。');
  const snapshotKeys = ['kind','v','counter','comps','params','tracePoint','tracePoints','referencePoint','activeMotor','motorAngles','fabrication','modules'];
  const unknown = Object.keys(source).filter(k => !snapshotKeys.includes(k));
  if (unknown.length) return fail('NORMALIZATION_CHANGED', '目前作品保存流程不支援額外頂層欄位，確認可能丟失資料。', unknown);
  if (source.modules?.length || source.comps.some(c => c?.moduleId)) return fail('UNSUPPORTED_STRUCTURE', '組立作品不在此夾爪任務操作範圍；原作品已保留。');
  let candidate, norm;
  try { candidate = clone(source); norm = normalizeSnapshot(candidate); } catch (_) { return fail('INVALID_REQUEST', '來源必須是可序列化的作品。'); }
  if (!norm) return fail('NORMALIZATION_CHANGED', '來源無法正規化，請先修復作品。');
  const repairs = [];
  // kind/v 保留；未知頂層已拒絕，只核對正規化器擁有的欄位，忽略補入的預設。
  for (const key of Object.keys(norm).filter(k => k !== 'warnings')) {
    if (Object.hasOwn(candidate, key)) changedProvided(candidate[key], norm[key], key, repairs);
  }
  if (repairs.length) return fail('NORMALIZATION_CHANGED', '正規化會修補或移除原資料；請先核對作品。', repairs.map(c => c.path), repairs);
  const changes = keys.filter(k => Object.hasOwn(parameters,k) && candidate.params[k] !== parameters[k]).map(k => ({path: `params.${k}`, before: candidate.params[k], after: parameters[k]}));
  Object.assign(candidate.params, parameters);
  const plan = planGripper(candidate.comps, candidate.params);
  if (!plan.ok) return fail(plan.code || 'UNSUPPORTED_STRUCTURE', plan.message);
  const validation = validateMotionRange(candidate, { startDeg: plan.open.theta, endDeg: plan.closed.theta, motorId: plan.motor,
    endpointChecks: [{ startMm: plan.width + 2 * plan.clearance, endMm: plan.width, targets: ['LeftJaw','RightJaw'], measure: points => gripperTips(candidate.comps, points)?.gap }] });
  if (!validation.ok) return { ok: false, operationVersion: 1, issues: validation.issues, changes, validation };
  return {ok: true, operationVersion: 1, issues: [], changes, candidateSnapshot: candidate, plan, validation};
}

/** 一次候選確認；adapter 沿用宿主的 undo / apply / 保存路徑。 */
export function createGripperOperationSession({ getSnapshot, applySnapshot }) {
  let pending = null;
  function prepare(request) {
    pending = null;
    const source = getSnapshot();
    const result = prepareGripperOperation(source, request);
    if (result.ok) pending = { sourceKey: gripperSnapshotKey(source), request: clone(request), candidateKey: gripperSnapshotKey(result.candidateSnapshot), result: clone(result) };
    return result;
  }
  function confirm() {
    const candidate = pending; pending = null;
    if (!candidate || candidate.sourceKey !== gripperSnapshotKey(getSnapshot())) return {ok:false, issues:[gripperIssue('STALE_SOURCE','候選已失效或來源作品已改變，請重新預覽。')]};
    const result = prepareGripperOperation(getSnapshot(), candidate.request);
    if (!result.ok || candidate.candidateKey !== gripperSnapshotKey(result.candidateSnapshot)) return {ok:false, issues: result.issues.length ? result.issues : [gripperIssue('STALE_SOURCE','候選內容已改變，請重新預覽。')]};
    const changed = gripperSnapshotKey(getSnapshot()) !== gripperSnapshotKey(result.candidateSnapshot);
    if (changed) applySnapshot(clone(result.candidateSnapshot));
    return {...result, applied:changed};
  }
  return { prepare, confirm, cancel: () => { pending = null; } };
}

