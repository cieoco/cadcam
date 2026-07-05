export function camLift(profile, lift, thetaRad) {
  const h = Math.max(0, Number(lift) || 0);
  const t = Number(thetaRad) || 0;
  if (profile === 'constant') return 0;
  // Smooth harmonic rise/fall over one revolution: 0 -> h -> 0.
  return h * (1 - Math.cos(t)) / 2;
}

export function camRadius({ profile = 'harmonic', baseRadius = 24, lift = 24, angleRad = 0 } = {}) {
  return Math.max(1, Number(baseRadius) || 24) + camLift(profile, lift, angleRad);
}

export function camLocalPoint(opts = {}) {
  const a = Number(opts.angleRad) || 0;
  const r = camRadius(opts);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

export function camSupportPoint({
  profile = 'harmonic',
  baseRadius = 24,
  lift = 24,
  thetaRad = 0,
  axisRad = Math.PI / 2,
  samples = 720
} = {}) {
  const ux = Math.cos(axisRad);
  const uy = Math.sin(axisRad);
  const ct = Math.cos(thetaRad);
  const st = Math.sin(thetaRad);
  const n = Math.max(90, Math.round(Number(samples) || 720));
  let best = { x: 0, y: 0, localAngle: 0, projection: -Infinity };

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const local = camLocalPoint({ profile, baseRadius, lift, angleRad: a });
    const x = local.x * ct - local.y * st;
    const y = local.x * st + local.y * ct;
    const projection = x * ux + y * uy;
    if (projection > best.projection) best = { x, y, localAngle: a, projection };
  }

  return best;
}

export function camFollowerState({
  profile = 'harmonic',
  baseRadius = 24,
  lift = 24,
  thetaRad = 0,
  axisRad = Math.PI / 2,
  rollerRadius = 6,
  samples = 720
} = {}) {
  const rr = Math.max(0, Number(rollerRadius) || 0);
  const ux = Math.cos(axisRad);
  const uy = Math.sin(axisRad);
  const nx = -uy;
  const ny = ux;
  const ct = Math.cos(thetaRad);
  const st = Math.sin(thetaRad);
  const n = Math.max(90, Math.round(Number(samples) || 720));
  let best = null;

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const local = camLocalPoint({ profile, baseRadius, lift, angleRad: a });
    const x = local.x * ct - local.y * st;
    const y = local.x * st + local.y * ct;
    const along = x * ux + y * uy;
    const side = x * nx + y * ny;
    if (Math.abs(side) > rr) continue;
    const offset = along + Math.sqrt(Math.max(0, rr * rr - side * side));
    if (!best || offset > best.offset) {
      best = {
        support: { x, y, localAngle: a, projection: along, side },
        offset
      };
    }
  }

  if (!best) {
    const support = camSupportPoint({ profile, baseRadius, lift, thetaRad, axisRad, samples });
    best = { support, offset: support.projection + rr };
  }

  return {
    support: best.support,
    offset: best.offset,
    rollerRadius: rr
  };
}
