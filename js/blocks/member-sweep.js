/** 同一取樣姿勢的兩端點配對；不跨無解區間連線，也不改寫求解資料。 */
export function memberSweepSegments(results, aId, bId) {
  const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  return (results || []).flatMap(frame => {
    const a = frame?.points?.[aId], b = frame?.points?.[bId];
    return frame?.isValid && finite(a) && finite(b)
      ? [{ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }] : [];
  });
}
