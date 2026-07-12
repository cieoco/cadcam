/** Resolve user-facing motor orientation into world-space presentation data. */
export function directionForOrientation(orientation, { center, carrier, reversed = false } = {}) {
  // Motor local long axis is mapped from this world direction.  Horizontal is
  // deliberately the world-frame default, never the output crank direction.
  if (orientation === 'vertical') return reversed ? { x: 0, y: 1 } : { x: 0, y: -1 };
  if (orientation === 'follow-frame' && center && carrier?.a && carrier?.b) {
    const far = carrier.p1 === center.id ? carrier.b : carrier.a;
    const dx = far.x - center.x, dy = far.y - center.y, len = Math.hypot(dx, dy);
    if (len > 1e-6) return reversed ? { x: -dx / len, y: -dy / len } : { x: dx / len, y: dy / len };
  }
  // Horizontal means the motor body extends to the positive frame X side.
  // The opposite side is a separate "reverse" assembly choice, not a change
  // to the meaning of horizontal.
  return reversed ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

export function motorRotDegFromWorldDir(dir) {
  return Math.atan2(-dir.x, -dir.y) * 180 / Math.PI;
}

export function resolveMotorOrientation(orientation, context = {}) {
  const dir = directionForOrientation(orientation, context);
  return { dir, rotDeg: motorRotDegFromWorldDir(dir) };
}
