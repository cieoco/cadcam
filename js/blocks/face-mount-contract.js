/** Pure validation for the persisted six-face module mount contract. */
const FACE_IDS = new Set(['right', 'left', 'front', 'back', 'top', 'bottom']);
const SELECT_KEYS = ['hostFace', 'childFace', 'alignU', 'alignV', 'offsetU', 'offsetV', 'gap', 'quarterTurns'];
const finite = value => typeof value === 'number' && Number.isFinite(value);

function validRotation(rotation) {
  if (!Array.isArray(rotation) || rotation.length !== 3 ||
      !rotation.every(row => Array.isArray(row) && row.length === 3 && row.every(finite))) return false;
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const cols = [0, 1, 2].map(c => rotation.map(row => row[c]));
  if (cols.some((col, i) => Math.abs(dot(col, col) - 1) > 1e-6 || cols.some((other, j) => j !== i && Math.abs(dot(col, other)) > 1e-6))) return false;
  const [a, b, c] = cols;
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const determinant = dot(cross, c);
  return Math.abs(determinant - 1) <= 1e-6;
}

export function normalizeFaceMountContract(raw) {
  const fail = reason => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return fail('face.version 必須是 1。');
  if (Object.hasOwn(raw, 'orient') || Object.hasOwn(raw, 'flip')) return fail('face 安裝不能同時帶有 orient 或 flip。');
  if (!validRotation(raw.rotation)) return fail('face.rotation 必須是有限、正交且行列式為 +1 的 3×3 矩陣。');
  const t = raw.translation;
  if (!t || typeof t !== 'object' || Array.isArray(t) || !['x', 'y', 'z'].every(k => finite(t[k]))) return fail('face.translation 必須是有限的 x/y/z 座標。');
  const s = raw.selection;
  if (!s || typeof s !== 'object' || Array.isArray(s) || !SELECT_KEYS.every(k => Object.hasOwn(s, k))) return fail('face.selection 欄位不完整。');
  if (!FACE_IDS.has(s.hostFace) || !FACE_IDS.has(s.childFace) || ![-1, 0, 1].includes(s.alignU) || ![-1, 0, 1].includes(s.alignV) ||
      !finite(s.offsetU) || !finite(s.offsetV) || !finite(s.gap) || s.gap < 0 || !Number.isInteger(s.quarterTurns) || s.quarterTurns < 0 || s.quarterTurns > 3) {
    return fail('face.selection 的面、對齊、偏置、間距或轉向不合法。');
  }
  if (s.rotationDeg !== undefined && !finite(s.rotationDeg)) return fail('接合角度必須是有限數值。');
  if (!finite(raw.hostThicknessMm) || raw.hostThicknessMm <= 0 || !finite(raw.childThicknessMm) || raw.childThicknessMm <= 0) {
    return fail('face.hostThicknessMm 與 face.childThicknessMm 必須是正的有限數值。');
  }
  return { ok: true, value: {
    version: 1,
    rotation: raw.rotation.map(row => row.slice()),
    translation: { x: t.x, y: t.y, z: t.z },
    selection: { ...Object.fromEntries(SELECT_KEYS.map(k => [k, s[k]])), ...(s.rotationDeg !== undefined ? { rotationDeg: s.rotationDeg } : {}) },
    hostThicknessMm: raw.hostThicknessMm,
    childThicknessMm: raw.childThicknessMm
  }};
}
