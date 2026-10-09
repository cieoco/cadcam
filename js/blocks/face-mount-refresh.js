/** 尺寸與加工設定修改後，維持使用者選定的面／對齊／間距。純函式。 */
import { buildMountSurfaces, findMountSurface } from './mount-surfaces.js';
import { buildFacePlacement } from './face-placement.js';
import { mountFacePlacement } from './face-mount.js';
import { readConnectionDescriptor } from './connection-descriptor.js';

function reference(surface) {
  const axes = ['x', 'y', 'z'];
  const center = Object.fromEntries(axes.map(k => [k, (surface.box.min[k] + surface.box.max[k]) / 2]));
  return { surface, box: { min: Object.fromEntries(axes.map(k => [k, surface.box.min[k] - center[k]])), max: Object.fromEntries(axes.map(k => [k, surface.box.max[k] - center[k]])) } };
}
export function refreshFaceMounts(comps, modules, params, { exportSettings = {}, stockMm = 3 } = {}) {
  const warnings = [];
  const diagnostics = [];
  const updated = modules.map(mod => {
    if (!mod.mount?.face) return mod;
    const descriptor = readConnectionDescriptor({ comps, modules, childId: mod.id });
    const retain = (code, message) => {
      warnings.push(`${mod.name || mod.id}：${message}`);
      diagnostics.push({ connectionId: descriptor.id, code, message });
      return mod;
    };
    if (!descriptor.capabilities.refresh) {
      for (const d of descriptor.diagnostics) { warnings.push(`${mod.name || mod.id}：${d.message}`); diagnostics.push({ ...d, connectionId: descriptor.id }); }
      return mod;
    }
    const target = mod.mount.to;
    const describe = (id, partId) => buildMountSurfaces({ comps, modules, params, moduleId: id, partId, exportSettings, thicknessMm: stockMm }).surfaces || [];
    const host = findMountSurface(describe(target.module), target);
    const part = descriptor.child.partId;
    const child = describe(mod.id, part).find(s => part && part !== 'frame' ? s.compId === part : s.kind === 'frame');
    if (!host || !child) return retain('endpoint_geometry_unavailable', '接合板已改變，請重新選面；已保留原安裝姿態。');
    const placement = buildFacePlacement({ host: reference(host), child: reference(child), selection: mod.mount.face.selection });
    if (!placement.ok) return retain('face_placement_invalid', placement.reason);
    const face = { version: 1, ...placement.record.transform, selection: placement.record.selection,
      ...(mod.mount.face.childPart !== undefined ? { childPart: part } : {}),
      hostThicknessMm: host.box.max.z - host.box.min.z, childThicknessMm: child.box.max.z - child.box.min.z };
    const unmounted = modules.map(m => m.id === mod.id ? { ...m, mount: null } : m);
    const result = mountFacePlacement(comps, unmounted, mod.id, { hostId: target.module, outputId: target.output, frameEdge:target.frame?.edge, face }, params);
    if (!result.ok) return retain('face_mount_refresh_failed', result.reason);
    // Legacy bracket identity is an immutable read fallback, not a migration.
    if (mod.mount.face.childPart === undefined) delete result.mount.face.childPart;
    return JSON.stringify(result.mount) === JSON.stringify(mod.mount) ? mod : { ...mod, mount: result.mount };
  });
  return { modules: updated, warnings, diagnostics };
}
