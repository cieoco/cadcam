/** 真實內建機構的安裝參考；只建立隔離範例，不讀寫正在編輯的作品。 */
import { builtinTemplate, instantiateTemplate } from './module-ops.js';
import { buildMountSurfaces } from './mount-surfaces.js';

function example(id, counter) {
  const instance = instantiateTemplate(builtinTemplate(id), { counter, place: { x: 0, y: 0 } });
  const result = buildMountSurfaces({ comps: instance.comps, modules: [instance.module], moduleId: instance.module.id, params: instance.params, thicknessMm: 4 });
  if (!result.ok) throw new Error(result.reason);
  return { ...instance, surfaces: result.surfaces };
}

function reference(instance, kind) {
  const surface = instance.surfaces.find(s => s.kind === kind);
  if (!surface) throw new Error(`${instance.module.name}沒有可用的安裝參考`);
  const center = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (surface.box.min[axis] + surface.box.max[axis]) / 2]));
  const relative = p => ({ ...p, x: p.x - center.x, y: p.y - center.y });
  return {
    name: `${instance.module.name} · ${kind === 'frame' ? '底板' : surface.name}`,
    detail: kind === 'output' ? '活動承接位置' : '固定底座',
    box: { min: Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, surface.box.min[axis] - center[axis]])), max: Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, surface.box.max[axis] - center[axis]])) },
    outlines: (surface.outlines || [surface.outline]).map(ring => ring.map(relative)),
    holes: (surface.holes || []).map(relative),
    cutouts: (surface.cutouts || []).map(c => ({ ...c, points: c.points.map(relative) })),
    surface, instance
  };
}

export function realMountExamples() {
  const lift = example('fourbar-lift', 0), rack = example('rack-lift', 1), gripper = example('gear-gripper', 2);
  return { hosts: [reference(lift, 'output'), reference(rack, 'output')], children: [reference(gripper, 'frame')] };
}
