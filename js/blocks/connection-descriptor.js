/** Immutable connection reads. Design defaults (faceParts / mates) are never a saved endpoint. */
import { normalizeFaceMountContract } from './face-mount-contract.js';

const clone = value => structuredClone(value);
const fixedBar = comp => comp?.type === 'bar' && [comp.p1, comp.p2].every(p => p && ['fixed', 'motor'].includes(p.type));
const reason = (code, message) => ({ code, message });

/**
 * F1 six-face read contract; other persisted formats remain explicit unsupported
 * sources until W3b. The returned plain data never shares mutable source objects.
 * mount overrides the child's current mount when reading a reselect draft.
 */
export function readConnectionDescriptor({ comps = [], modules = [], childId, mount } = {}) {
  const childModule = modules.find(m => m.id === childId);
  const saved = mount === undefined ? childModule?.mount : mount;
  const diagnostics = [];
  const result = { id: `connection:${childId}`, sourceFormat: saved?.face ? 'face-v1' : saved?.orient ? 'orient' : saved ? 'planar' : 'unmounted',
    host: null, child: null, placement: null, fastener: null,
    capabilities: { placement: false, refresh: false, drilling: false }, diagnostics, ok: false };
  if (!saved?.face) {
    diagnostics.push(reason(saved ? 'connection_format_not_supported' : 'connection_missing', saved ? '此接合格式尚未接入共同讀取契約。' : '尚未設定接合。'));
    return result;
  }
  const normalized = normalizeFaceMountContract(saved.face);
  if (!normalized.ok) { diagnostics.push(reason('face_record_invalid', normalized.reason)); return result; }
  const face = normalized.value;
  result.placement = { rotation: clone(face.rotation), translation: clone(face.translation), selection: clone(face.selection),
    hostThicknessMm: face.hostThicknessMm, childThicknessMm: face.childThicknessMm };
  result.fastener = face.selection.brackets ? clone(face.selection.brackets) : null;
  result.capabilities.placement = true; // A saved transform survives unavailable endpoints.
  const target = saved.to || {}, hostModule = modules.find(m => m.id === target.module);
  const host = { moduleId: target.module, partId: null, face: face.selection.hostFace,
    source: target.frame ? { kind: 'frame', edge: target.frame.edge } : { kind: 'output', outputId: target.output }, available: false, reason: null };
  if (!hostModule) host.reason = reason('host_module_missing', '宿主模組已不存在，請重新選取接合位置。');
  else if (target.frame) {
    host.partId = 'frame'; host.edge = target.frame.edge; host.available = true;
    diagnostics.push(reason('host_frame_not_supported', '宿主底板的六面接合尚未支援重算；已保留原安裝姿態。'));
  } else {
    const output = hostModule.outputs?.find(o => o.id === target.output);
    host.partId = output?.body?.id || null;
    if (!output) host.reason = reason('host_output_missing', '宿主輸出端已不存在，請重新選取接合位置。');
    else if (!['bar', 'triangle', 'rack'].includes(output.body?.kind)) host.reason = reason('host_part_not_supported', '宿主輸出端尚無支援的接合板。');
    else if (!comps.some(c => c.moduleId === hostModule.id && c.id === host.partId && c.type === output.body.kind)) host.reason = reason('host_part_missing', '宿主接合零件已不存在，請重新選取接合位置。');
    else host.available = true;
  }
  // Only older *confirmed fastener records* identify a legacy child part. A
  // current preset or normalDeg cannot resolve missing persisted identity.
  const explicit = face.childPart !== undefined;
  const partId = explicit ? face.childPart : face.selection.brackets?.childPart;
  const child = { moduleId: childId, partId: partId || null, face: face.selection.childFace,
    source: { kind: explicit ? 'face-child-part' : partId ? 'legacy-bracket' : 'legacy-ambiguous' }, available: false, reason: null };
  if (!childModule) child.reason = reason('child_module_missing', '安裝模組已不存在，請重新選取接合位置。');
  else if (!partId) child.reason = reason('legacy_child_endpoint_ambiguous', '舊接合未保存安裝端零件，請重新選面；已保留原安裝姿態。');
  else if (partId === 'frame') {
    child.available = comps.some(c => c.moduleId === childId && [c.p1, c.p2, c.p3, c.m1, c.m2].some(p => p && ['fixed', 'motor'].includes(p.type)));
    if (!child.available) child.reason = reason('child_frame_missing', '安裝端底板已不存在，請重新選面。');
  } else {
    const comp = comps.find(c => c.moduleId === childId && c.id === partId);
    if (!comp) child.reason = reason('child_part_missing', '安裝端接合零件已不存在，請重新選面。');
    else if (!fixedBar(comp)) child.reason = reason('child_part_not_fixed', '安裝端接合桿必須是固定桿，請重新選面。');
    else child.available = true;
  }
  result.host = host; result.child = child;
  for (const endpoint of [host, child]) if (endpoint.reason) diagnostics.push({ ...endpoint.reason, moduleId: endpoint.moduleId, partId: endpoint.partId });
  result.ok = host.available && child.available && !target.frame;
  result.capabilities.refresh = result.ok;
  result.capabilities.drilling = result.ok && hostModule.outputs?.find(o => o.id === target.output)?.body?.kind !== 'rack';
  return result;
}

export function readConnectionDescriptors({ comps = [], modules = [] } = {}) {
  return modules.filter(m => m.mount).map(m => readConnectionDescriptor({ comps, modules, childId: m.id }));
}
