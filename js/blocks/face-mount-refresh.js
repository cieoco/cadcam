/** 尺寸與加工設定修改後，維持使用者選定的面／對齊／間距。純函式。 */
import { buildMountSurfaces } from './mount-surfaces.js';
import { buildFacePlacement } from './face-placement.js';
import { mountFacePlacement } from './face-mount.js';

function reference(surface) {
  const axes = ['x', 'y', 'z'];
  const center = Object.fromEntries(axes.map(k => [k, (surface.box.min[k] + surface.box.max[k]) / 2]));
  return { surface, box: { min: Object.fromEntries(axes.map(k => [k, surface.box.min[k] - center[k]])), max: Object.fromEntries(axes.map(k => [k, surface.box.max[k] - center[k]])) } };
}
export function refreshFaceMounts(comps, modules, params, { exportSettings = {}, stockMm = 3 } = {}) {
  const warnings = [];
  const updated = modules.map(mod => {
    if (!mod.mount?.face) return mod;
    const target = mod.mount.to;
    const describe = (id, partId) => buildMountSurfaces({ comps, modules, params, moduleId: id, partId, exportSettings, thicknessMm: stockMm }).surfaces || [];
    const host = describe(target.module).find(s => s.outputId === target.output && s.kind === 'output');
    const part = mod.mount.face.selection.brackets?.childPart;
    const child = describe(mod.id, part).find(s => part && part !== 'frame' ? s.compId === part : s.kind === 'frame');
    if (!host || !child) { warnings.push(`${mod.name}接合板已改變，請重新選面。`); return { ...mod, mount: null }; }
    const placement = buildFacePlacement({ host: reference(host), child: reference(child), selection: mod.mount.face.selection });
    if (!placement.ok) { warnings.push(placement.reason); return { ...mod, mount: null }; }
    const face = { version: 1, ...placement.record.transform, selection: placement.record.selection,
      hostThicknessMm: host.box.max.z - host.box.min.z, childThicknessMm: child.box.max.z - child.box.min.z };
    const unmounted = modules.map(m => m.id === mod.id ? { ...m, mount: null } : m);
    const result = mountFacePlacement(comps, unmounted, mod.id, { hostId: target.module, outputId: target.output, face }, params);
    if (!result.ok) { warnings.push(result.reason); return { ...mod, mount: null }; }
    return JSON.stringify(result.mount) === JSON.stringify(mod.mount) ? mod : { ...mod, mount: result.mount };
  });
  return { modules: updated, warnings };
}
