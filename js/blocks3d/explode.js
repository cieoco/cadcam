// 分離（爆炸）檢視：純函式。以中間層為準，沿各零件的法向把各層拉開。
const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0));
/** items：[{id, layer, normal?}]；amount 0–1（超出夾住）；opts.gap＝相鄰層間距 mm。
 *  回傳 {id: [x,y,z]}。全開時每層多拉開 2×gap（至少 1×gap）。 */
export function explodeOffsets(items, amount, { gap = 6 } = {}) {
  const a = clamp01(amount), layerOf = it => Number.isFinite(it.layer) ? it.layer : 0;
  const layers = [...new Set(items.map(layerOf))].sort((x, y) => x - y), n = layers.length;
  const mid = n ? (n % 2 ? layers[(n - 1) / 2] : (layers[n / 2 - 1] + layers[n / 2]) / 2) : 0, out = {};
  for (const it of items) {
    const s = (layerOf(it) - mid) * 2 * gap * a, nv = it.normal || [0, 0, 1], len = Math.hypot(...nv) || 1;
    out[it.id] = nv.map(c => (c / len) * s + 0);
  }
  return out;
}
/** {min,max}（mm）→「整體 寬 × 高 × 厚 mm」；沒有厚度時只寫兩個數。 */
export function formatExtents({ min, max }) {
  const d = [0, 1, 2].map(i => Math.round(max[i] - min[i]));
  return `整體 ${d[2] > 0 ? d.join(' × ') : d.slice(0, 2).join(' × ')} mm`;
}
