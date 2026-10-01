// O4b（SDD-ORTHOGONAL-MOUNT O-D5）：3D 列印 L 形轉接座的網格與 ASCII STL。
import { check, report } from './_harness.mjs';
let A = null;
try { A = await import('../js/blocks/adapter-stl.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
check('adapter-stl.js 匯出 adapterMesh／meshToStl', typeof A?.adapterMesh === 'function' && typeof A?.meshToStl === 'function');
if (typeof A?.adapterMesh !== 'function') { report('adapter-stl'); process.exit(1); }

const spec = { lengthMm: 20, wallMm: 4, flangeMm: 14, holeDiameterMm: 3.2, holesPerFlange: 2, segments: 16 };
const mesh = A.adapterMesh(spec);
check('回傳 { vertices: [[x,y,z]], triangles: [[i,j,k]] }', Array.isArray(mesh?.vertices) && Array.isArray(mesh?.triangles) && mesh.triangles.length > 0 &&
  mesh.vertices.every(v => v.length === 3 && v.every(Number.isFinite)) && mesh.triangles.every(t => t.length === 3 && t.every(i => Number.isInteger(i) && i >= 0 && i < mesh.vertices.length)));

// 封閉：每條邊（無向）剛好被兩個三角形共用，且方向一致（每條有向邊只出現一次）
const und = new Map(), dir = new Set();
let dupDir = 0, degenerate = 0;
mesh.triangles.forEach(([a, b, c]) => {
  if (a === b || b === c || a === c) degenerate++;
  [[a, b], [b, c], [c, a]].forEach(([u, v]) => {
    const k = u < v ? `${u},${v}` : `${v},${u}`;
    und.set(k, (und.get(k) || 0) + 1);
    const d = `${u},${v}`;
    if (dir.has(d)) dupDir++; dir.add(d);
  });
});
check('沒有退化三角形', degenerate === 0);
check('封閉網格：每條邊剛好兩個三角形', [...und.values()].every(n => n === 2));
check('方向一致：沒有重複的有向邊', dupDir === 0);

// 體積（散度定理）：L 形截面 F·W＋(F−W)·W，乘長度，扣掉 4 個孔（多邊形面積 × 壁厚）
const V = mesh.vertices;
let vol = 0;
mesh.triangles.forEach(([a, b, c]) => {
  const p = V[a], q = V[b], r = V[c];
  vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
});
const { lengthMm: L, wallMm: W, flangeMm: F, holeDiameterMm: D, segments: N } = spec;
const holeArea = 0.5 * N * (D / 2) ** 2 * Math.sin(2 * Math.PI / N);
const expected = L * (F * W + (F - W) * W) - 2 * spec.holesPerFlange * holeArea * W;
console.log('volume', vol.toFixed(2), 'expected', expected.toFixed(2));
check('體積為正（法向朝外）且與 L 形扣孔一致（±0.5%）', vol > 0 && Math.abs(vol - expected) / expected < 0.005);

const xs = V.map(v => v[0]), ys = V.map(v => v[1]), zs = V.map(v => v[2]);
check('外框：x 0～L、y 0～F、z 0～F', Math.min(...xs) === 0 && Math.max(...xs) === L && Math.min(...ys) === 0 && Math.max(...ys) === F && Math.min(...zs) === 0 && Math.max(...zs) === F);
// 孔位：翼 A（z 0～W 的水平板）孔軸沿 z，中心 (x_k, W+(F−W)/2)；翼 B（y 0～W 的垂直板）孔軸沿 y，中心 (x_k, z=W+(F−W)/2)
const c = W + (F - W) / 2, r = D / 2;
const holeVerts = (axis) => V.filter(v => {
  const [x, y, z] = v;
  const inPlane = axis === 'z' ? Math.hypot(x - L / 4, y - c) : Math.hypot(x - L / 4, z - c);
  return Math.abs(inPlane - r) < 1e-6;
});
check('翼 A 第一孔（x＝L/4）在孔半徑上有頂點', holeVerts('z').length >= N);
check('翼 B 第一孔（x＝L/4）在孔半徑上有頂點', holeVerts('y').length >= N);

const stl = A.meshToStl(mesh, 'adapter');
check('ASCII STL：solid／endsolid、facet 數＝三角形數', typeof stl === 'string' && stl.startsWith('solid adapter') && stl.trim().endsWith('endsolid adapter') &&
  (stl.match(/facet normal/g) || []).length === mesh.triangles.length && (stl.match(/vertex /g) || []).length === 3 * mesh.triangles.length);
const two = A.adapterMesh({ ...spec, holesPerFlange: 1 });
check('每翼 1 孔也封閉', (() => { const m = new Map(); two.triangles.forEach(([a, b, c2]) => [[a, b], [b, c2], [c2, a]].forEach(([u, v]) => { const k = u < v ? `${u},${v}` : `${v},${u}`; m.set(k, (m.get(k) || 0) + 1); })); return [...m.values()].every(n => n === 2); })());
report('adapter-stl');
