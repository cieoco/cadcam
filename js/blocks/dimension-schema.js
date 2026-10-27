// 量尺存檔格式：讀檔時丟掉壞的量尺，沒有量尺就不輸出欄位。
const ID = /^[\w.-]+$/u, fin = n => typeof n === 'number' && Number.isFinite(n);
const ref = r => r && ((typeof r.pointId === 'string' && ID.test(r.pointId) && {pointId: r.pointId}) ||
  (typeof r.compId === 'string' && ID.test(r.compId) && Number.isInteger(r.vertex) && r.vertex >= 0 && {compId: r.compId, vertex: r.vertex}));
const BASE = {height: /^(ground|h:[\w.-]+)$/u, horizontal: /^v:[\w.-]+$/u};
export function normalizeDimensions(list) {
  const out = [], seen = new Set();
  for (const d of Array.isArray(list) ? list : []) {
    const a = ref(d?.a);
    if (!d || typeof d.id !== 'string' || !ID.test(d.id) || seen.has(d.id) || !a) continue;
    const e = {id: d.id, name: typeof d.name === 'string' ? d.name.trim().slice(0, 24) : '', kind: d.kind, a};
    if (d.kind === 'distance') { const b = ref(d.b); if (!b) continue; e.b = b; }
    else if (BASE[d.kind]) { if (typeof d.baseline !== 'string' || !BASE[d.kind].test(d.baseline)) continue; e.baseline = d.baseline; }
    else if (d.kind === 'displacement') { if (!fin(d.zero?.x) || !fin(d.zero?.y)) continue; e.zero = {x: d.zero.x, y: d.zero.y}; }
    else continue;
    seen.add(d.id); out.push(e);
    if (out.length >= 24) break;
  }
  return out;
}
