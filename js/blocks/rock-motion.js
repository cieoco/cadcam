// Advance a finite-range rocking motion. The direction is always normalized to
// -1 or 1, and an endpoint always leaves the motion pointing back into range.
export function advanceRock(theta, direction, step, lo, hi) {
  // Non-finite values, negative travel, and reversed bounds return the neutral
  // fallback at lo (or 0 when lo is not finite), pointing in the positive direction.
  const fallback = { theta: Number.isFinite(lo) ? lo : 0, direction: 1 };
  if (![theta, direction, step, lo, hi].every(Number.isFinite) || step < 0 || hi < lo) {
    return fallback;
  }

  const span = hi - lo;
  if (!Number.isFinite(span)) return fallback;
  if (span === 0) return { theta: lo, direction: 1 };

  const period = 2 * span;
  if (!Number.isFinite(period)) return fallback;

  const dir = direction < 0 ? -1 : 1;
  const position = Math.max(lo, Math.min(hi, theta)) - lo;
  let phase = dir > 0 ? position : period - position;
  if (phase >= period) phase = 0;

  // Reduce the travel before adding it, and use subtraction near the wrap point
  // so even large finite ranges do not overflow during phase + travel.
  const travel = step % period;
  if (travel > 0) {
    const untilWrap = period - travel;
    phase = phase >= untilWrap ? phase - untilWrap : phase + travel;
  }

  if (phase === 0) return { theta: lo, direction: 1 };
  if (phase === span) return { theta: hi, direction: -1 };
  if (phase < span) return { theta: lo + phase, direction: 1 };
  return { theta: hi - (phase - span), direction: -1 };
}
