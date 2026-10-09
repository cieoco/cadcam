/** Pure creation of a six-face mount record from a confirmed face transform. */
import { compileAssembly, outputPose, solveAssembly, orthogonalHostEdge } from './assembly.js?v=20261007_m5a';
import { normalizeFaceMountContract } from './face-mount-contract.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Capture a face placement in the static module reference frame used by mount
 * surface descriptors. The reference pose is solved at theta 0 with no motor
 * overrides, and home stays empty so runtime motion follows the host output.
 */
export function mountFacePlacement(comps, modules, childId, { hostId, outputId, frameEdge, face } = {}, params = {}, motorState = {}) {
  const fail = reason => ({ ok: false, reason });
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const byId = new Map(modList.map(mod => [mod && mod.id, mod]));
  const child = byId.get(childId), host = byId.get(hostId);
  if (!child || !host || childId === hostId) return fail('請選擇不同且存在的宿主與安裝模組。');
  if (child.mount) return fail('安裝模組目前已有安裝目標。');
  if (!child.base || !list.some(c => c.moduleId === childId && [c.p1, c.p2, c.p3, c.m1, c.m2].some(p => p && p.id === child.base && (p.type === 'fixed' || p.type === 'motor')))) {
    return fail('安裝模組需要有效的固定或馬達基準點。');
  }
  const output = (host.outputs || []).find(item => item && item.id === outputId);
  if (frameEdge !== undefined && outputId !== undefined) return fail('宿主接合參照不唯一。');
  if (frameEdge === undefined && !output) return fail('宿主輸出端不存在。');
  if (frameEdge === undefined && (!output.body || !['bar', 'triangle', 'rack'].includes(output.body.kind))) return fail('宿主輸出端尚無支援的接合板。');
  const seen = new Set([childId]);
  for (let current = host; current; current = current.mount ? byId.get(current.mount.to && current.mount.to.module) : null) {
    if (seen.has(current.id)) return fail('安裝會形成模組迴圈。');
    seen.add(current.id);
  }
  // New operations use an explicit part (the old API's default is the frame).
  // Reading a persisted legacy mount never applies this creation default.
  const normalized = normalizeFaceMountContract({ ...face, childPart: face?.childPart !== undefined ? face.childPart : face?.selection?.brackets?.childPart ?? 'frame' });
  if (!normalized.ok) return fail(normalized.reason);
  const childPart = normalized.value.childPart;
  if (childPart !== 'frame' && !list.some(c => c.moduleId === childId && c.id === childPart && c.type === 'bar' && [c.p1, c.p2].every(p => p && ['fixed', 'motor'].includes(p.type)))) {
    return fail('安裝端接合桿已不存在或不是固定桿，請重新選面。');
  }

  try {
    const input = structuredClone({comps:list,modules:modList,params:isRecord(params) ? params : {}});
    const asm = compileAssembly(input.comps, input.modules, { params: input.params });
    const solved = solveAssembly(asm, { thetaDeg: 0, motorAngles: {} });
    if (!solved || !solved.isValid || !solved.perModule || !solved.perModule[hostId]?.isValid) return fail('宿主在參考姿態無法求解。');
    const to = frameEdge === undefined ? {module:hostId,output:outputId} : {module:hostId,frame:{edge:frameEdge}};
    const ref = frameEdge === undefined ? outputPose(host, outputId, solved.points, list.filter(c => c && c.moduleId === hostId))
      : orthogonalHostEdge(input.comps,input.modules,{to},solved.points,input.params,{asm,home:true})?.pose;
    if (!ref || ![ref.x, ref.y, ref.a].every(Number.isFinite)) return fail('宿主輸出端在參考姿態沒有有效位姿。');
    const mount = { to, ref: { ...ref }, home: {}, face: normalized.value };
    // motorState is accepted to keep the caller contract aligned with other mount
    // operations; face transforms deliberately capture the static reference pose.
    void motorState;
    return { ok: true, mount };
  } catch (_) {
    return fail('無法計算宿主參考姿態。');
  }
}
