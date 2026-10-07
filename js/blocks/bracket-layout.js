/** 角碼配置試作：沿接合線分散；只供操作預覽，不是可加工孔位。 */
export function bracketLayout(span, offsets = {}) {
  const margin = 10, width = 7;
  if (!Number.isFinite(span) || span < 30) return [];
  const half = span / 2 - margin;
  const slots = span >= 70
    ? [{ id: 'L1', side: -1, at: -.7 * half }, { id: 'R1', side: 1, at: 0 }, { id: 'L2', side: -1, at: .7 * half }]
    : [{ id: 'L1', side: -1, at: -.5 * half }, { id: 'R1', side: 1, at: .5 * half }];
  const placed = slots.map(slot => ({ ...slot, at: slot.at + (Number.isFinite(offsets[slot.id]) ? offsets[slot.id] : 0), width }));
  if (placed.some(p => Math.abs(p.at) > half) || placed.some((p, i) => placed.slice(i + 1).some(q => p.side === q.side && Math.abs(p.at - q.at) < width + 3))) return [];
  return placed;
}
