/** 小型任務操作共用：JSON安全、schema核對、一次候選確認。無DOM。 */
import { normalizeSnapshot } from './schema.js';
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
export const taskIssue = (code, message, targets = []) => ({ code, severity: 'error', message, targets });
// 對物件鍵排序：snapshot 屬性順序不應影響來源比對。
export function taskSnapshotKey(value) {
  if (Array.isArray(value)) return '[' + value.map(taskSnapshotKey).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + taskSnapshotKey(value[k])).join(',') + '}';
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

export function prepareTaskSnapshot(source, { allowAssembly = false } = {}) {
  const fail=(code,message,targets=[],changes=[])=>({ok:false,issues:[taskIssue(code,message,targets)],changes});
  if (!record(source) || source.kind !== 'blocks' || source.v !== 1 || !Array.isArray(source.comps) || !record(source.params)) return fail('INVALID_REQUEST', '修改需要完整 blocks v1 來源作品。');
  if (!jsonSafe(source)) return fail('INVALID_REQUEST', '來源包含非 JSON 資料，請先修復作品。');
  const snapshotKeys = ['kind','v','counter','comps','params','tracePoint','tracePoints','referencePoint','activeMotor','motorAngles','fabrication','modules'];
  const unknown = Object.keys(source).filter(k => !snapshotKeys.includes(k));
  if (unknown.length) return fail('NORMALIZATION_CHANGED', '目前作品保存流程不支援額外頂層欄位，確認可能丟失資料。', unknown);
  if (!allowAssembly && (source.modules?.length || source.comps.some(c => c?.moduleId))) return fail('UNSUPPORTED_STRUCTURE', '組立作品不在此任務操作範圍；原作品已保留。');
  let candidate, norm;
  try { candidate = clone(source); norm = normalizeSnapshot(candidate); } catch (_) { return fail('INVALID_REQUEST', '來源必須是可序列化的作品。'); }
  if (!norm) return fail('NORMALIZATION_CHANGED', '來源無法正規化，請先修復作品。');
  const repairs = [];
  // kind/v 保留；未知頂層已拒絕，只核對正規化器擁有的欄位，忽略補入的預設。
  for (const key of Object.keys(norm).filter(k => k !== 'warnings')) {
    if (Object.hasOwn(candidate, key)) changedProvided(candidate[key], norm[key], key, repairs);
  }
  if (repairs.length) return fail('NORMALIZATION_CHANGED', '正規化會修補或移除原資料；請先核對作品。', repairs.map(c => c.path), repairs);
  return {ok:true,candidateSnapshot:candidate};
}
/** 一次候選確認；adapter 沿用宿主的 undo / apply / 保存路徑。 */
export function createTaskOperationSession({ getSnapshot, applySnapshot, prepareOperation }) {
  let pending = null;
  function prepare(request) {
    pending = null;
    const source = getSnapshot();
    const result = prepareOperation(source, request);
    if (result.ok) pending = { sourceKey: taskSnapshotKey(source), request: clone(request), candidateKey: taskSnapshotKey(result.candidateSnapshot), result: clone(result) };
    return result;
  }
  function confirm() {
    const candidate = pending; pending = null;
    if (!candidate || candidate.sourceKey !== taskSnapshotKey(getSnapshot())) return {ok:false, issues:[taskIssue('STALE_SOURCE','候選已失效或來源作品已改變，請重新預覽。')]};
    const result = prepareOperation(getSnapshot(), candidate.request);
    if (!result.ok || candidate.candidateKey !== taskSnapshotKey(result.candidateSnapshot)) return {ok:false, issues: result.issues.length ? result.issues : [taskIssue('STALE_SOURCE','候選內容已改變，請重新預覽。')]};
    const changed = taskSnapshotKey(getSnapshot()) !== taskSnapshotKey(result.candidateSnapshot);
    if (changed) applySnapshot(clone(result.candidateSnapshot));
    return {...result, applied:changed};
  }
  return { prepare, confirm, cancel: () => { pending = null; } };
}

