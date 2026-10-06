/** Pure creation of a six-face mount record from a confirmed face transform. */
import { compileAssembly, outputPose, solveAssembly } from './assembly.js?v=face-mount-20261007';
import { normalizeFaceMountContract } from './face-mount-contract.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Capture a face placement in the static module reference frame used by mount
 * surface descriptors. The reference pose is solved at theta 0 with no motor
 * overrides, and home stays empty so runtime motion follows the host output.
 */
export function mountFacePlacement(comps, modules, childId, { hostId, outputId, face } = {}, params = {}, motorState = {}) {
  const fail = reason => ({ ok: false, reason });
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const byId = new Map(modList.map(mod => [mod && mod.id, mod]));
  const child = byId.get(childId), host = byId.get(hostId);
  if (!child || !host || childId === hostId) return fail('請選擇不同且存在的宿主與安裝模組。');
  if (child.mount) return fail('安裝模組目前已有安裝目標。');
  if (host.mount && !host.mount.face) return fail('宿主必須未安裝或使用六面安裝。');
  if (!child.base || !list.some(c => c.moduleId === childId && [c.p1, c.p2, c.p3, c.m1, c.m2].some(p => p && p.id === child.base && (p.type === 'fixed' || p.type === 'motor')))) {
    return fail('安裝模組需要有效的固定或馬達基準點。');
  }
  const output = (host.outputs || []).find(item => item && item.id === outputId);
  if (!output) return fail('宿主輸出端不存在。');
  if (!output.body || !['bar', 'triangle', 'rack'].includes(output.body.kind)) return fail('宿主輸出端尚無支援的接合板。');
  const seen = new Set([childId]);
  for (let current = host; current; current = current.mount ? byId.get(current.mount.to && current.mount.to.module) : null) {
    if (seen.has(current.id)) return fail('安裝會形成模組迴圈。');
    seen.add(current.id);
  }
  const normalized = normalizeFaceMountContract(face);
  if (!normalized.ok) return fail(normalized.reason);

  try {
    const asm = compileAssembly(list, modList, { params: isRecord(params) ? params : {} });
    const solved = solveAssembly(asm, { thetaDeg: 0, motorAngles: {} });
    if (!solved || !solved.isValid || !solved.perModule || !solved.perModule[hostId]?.isValid) return fail('宿主在參考姿態無法求解。');
    const ref = outputPose(host, outputId, solved.points, list.filter(c => c && c.moduleId === hostId));
    if (!ref || ![ref.x, ref.y, ref.a].every(Number.isFinite)) return fail('宿主輸出端在參考姿態沒有有效位姿。');
    const mount = { to: { module: hostId, output: outputId }, ref: { ...ref }, home: {}, face: normalized.value };
    // motorState is accepted to keep the caller contract aligned with other mount
    // operations; face transforms deliberately capture the static reference pose.
    void motorState;
    return { ok: true, mount };
  } catch (_) {
    return fail('無法計算宿主參考姿態。');
  }
}
