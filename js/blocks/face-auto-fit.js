import { solveFaceMate, transformMatePoint } from './face-mate.js';

/** Move the draft only; retain face choices and rotation. Bracket checks remain independent. */
export function autoFitFaces(host, child, selection) {
  const next = { ...selection, gap: 0 };
  const solve = value => solveFaceMate({ ...value, hostBox: host.box, childBox: child.box });
  const mate = solve(next);
  if (!mate.ok) return mate;
  if (Math.abs(mate.rotation[2][2]) < 1e-6) {
    const points = child.outlines?.flat();
    if (!points?.length) return { ok: false, reason: '缺少接合板輪廓，無法自動貼齊' };
    const heights = points.map(p => transformMatePoint(mate, { ...p, z: 0 }).z);
    const shifts = [host.box.max.z - Math.min(...heights), host.box.min.z - Math.max(...heights)];
    const candidates = shifts.map(dz => ({ ...next,
      offsetU: (next.offsetU || 0) + dz * mate.host.u.z,
      offsetV: (next.offsetV || 0) + dz * mate.host.v.z,
      gap: dz * mate.host.n.z
    })).filter(value => value.gap >= -1e-8);
    candidates.sort((a,b) => Math.abs(solve(a).translation.z-mate.translation.z)-Math.abs(solve(b).translation.z-mate.translation.z));
    if (!candidates.length) return { ok: false, reason: '目前選面無法貼齊，請改選接合面' };
    Object.assign(next, candidates[0], { gap: Math.max(0,candidates[0].gap) });
  }
  return { ok: true, selection: next, mate: solve(next) };
}
