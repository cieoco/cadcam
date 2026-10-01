/**
 * blocks / adapter-stl
 *
 * O4b：3D 列印 L 形轉接座的封閉三角網格與 ASCII STL（SDD-ORTHOGONAL-MOUNT O-D5）。純函式。
 *
 * 作法：把實體切成格子（x、y、z 三軸的分割點），每格要嘛是實心方塊、要嘛是「中間有圓孔」的方塊；
 * 只輸出「鄰格是空的」那一面。所有面都落在同一套格線上，共用邊的切分一致，不會有 T 形接點，
 * 網格自然封閉。孔的那一面輸出成「方形扣圓孔」的環（方形只用 4 個角，跟鄰格的邊對得上）。
 *
 * 座標：x ∈ [0,L] 長度方向；翼 A＝水平板 y∈[0,F]、z∈[0,W]，孔軸沿 z；
 *       翼 B＝垂直板 y∈[0,W]、z∈[0,F]，孔軸沿 y；孔心 x_k＝L·(k+0.5)/n，離轉角 c＝W+(F−W)/2。
 */

const EPS = 1e-9;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export function adapterMesh({ lengthMm: L = 20, wallMm: W = 4, flangeMm: F = 14, holeDiameterMm: D = 3.2, holesPerFlange: n = 2, segments: N = 16 } = {}) {
  const r = D / 2;
  const c = W + (F - W) / 2;
  const h = Math.min(r + 1.5, (F - W) / 2 - EPS, L / (2 * n) - EPS);   // 孔格半寬：留肉但不超出翼板與相鄰孔
  const holeX = Array.from({ length: n }, (_, k) => L * (k + 0.5) / n);

  const uniq = list => [...new Set(list.map(v => Math.round(v * 1e9) / 1e9))].sort((a, b) => a - b);
  const X = uniq([0, L, ...holeX.flatMap(x => [x - h, x + h])]);
  const Y = uniq([0, W, c - h, c + h, F]);
  const Z = uniq([0, W, c - h, c + h, F]);

  // 格子狀態：0 空、1 實心、'z'／'y' 有孔（孔軸方向）
  const inHoleX = (x0, x1) => holeX.find(x => Math.abs(x0 - (x - h)) < EPS && Math.abs(x1 - (x + h)) < EPS);
  const cellKind = (i, j, k) => {
    if (i < 0 || j < 0 || k < 0 || i >= X.length - 1 || j >= Y.length - 1 || k >= Z.length - 1) return 0;
    const y0 = Y[j], y1 = Y[j + 1], z0 = Z[k], z1 = Z[k + 1];
    const inA = y1 <= F + EPS && z1 <= W + EPS;          // 水平板
    const inB = y1 <= W + EPS && z1 <= F + EPS;          // 垂直板
    if (!inA && !inB) return 0;
    const hx = inHoleX(X[i], X[i + 1]);
    if (hx !== undefined) {
      if (inA && Math.abs(y0 - (c - h)) < EPS && Math.abs(y1 - (c + h)) < EPS) return 'z';
      if (inB && Math.abs(z0 - (c - h)) < EPS && Math.abs(z1 - (c + h)) < EPS) return 'y';
    }
    return 1;
  };

  const vertices = [];
  const index = new Map();
  const vid = p => {
    const key = p.map(v => Math.round(v * 1e9)).join(',');
    if (!index.has(key)) { index.set(key, vertices.length); vertices.push(p.map(v => Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e9) / 1e9)); }
    return index.get(key);
  };
  const triangles = [];
  // 依外法向放三角形：法向朝反方向就交換頂點順序。
  const tri = (a, b, cc, outward) => {
    const n3 = cross(sub(b, a), sub(cc, a));
    const t = [vid(a), vid(b), vid(cc)];
    if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) return;
    triangles.push(dot(n3, outward) >= 0 ? t : [t[0], t[2], t[1]]);
  };
  const quad = (a, b, cc, d, outward) => { tri(a, b, cc, outward); tri(a, cc, d, outward); };

  // 一格的某一面：axis＝法向軸（0/1/2）、side＝-1／+1；其餘兩軸為 (u, v)。
  const faceOf = (i, j, k, axis, side) => {
    const lo = [X[i], Y[j], Z[k]], hi = [X[i + 1], Y[j + 1], Z[k + 1]];
    const fixed = side > 0 ? hi[axis] : lo[axis];
    const [ua, va] = [0, 1, 2].filter(a => a !== axis);
    const pt = (u, v) => { const p = [0, 0, 0]; p[axis] = fixed; p[ua] = u; p[va] = v; return p; };
    return { pt, ua, va, lo, hi };
  };

  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) for (let k = 0; k < Z.length - 1; k++) {
    const kind = cellKind(i, j, k);
    if (!kind) continue;
    const holeAxis = kind === 'z' ? 2 : kind === 'y' ? 1 : -1;
    const centerU = (X[i] + X[i + 1]) / 2;
    [0, 1, 2].forEach(axis => [-1, 1].forEach(side => {
      const ni = i + (axis === 0 ? side : 0), nj = j + (axis === 1 ? side : 0), nk = k + (axis === 2 ? side : 0);
      if (cellKind(ni, nj, nk)) return;   // 鄰格實心：內部面不輸出
      const out = [0, 0, 0]; out[axis] = side;
      const { pt, ua, va, lo, hi } = faceOf(i, j, k, axis, side);
      const u0 = lo[ua], u1 = hi[ua], v0 = lo[va], v1 = hi[va];
      if (axis !== holeAxis) { quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), out); return; }
      // 方形扣圓孔：4 個角＋圓周 N 點；每段圓弧接最近的角，角與角之間補一個三角形。
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const corners = [[u1, v1], [u0, v1], [u0, v0], [u1, v0]];   // 45°、135°、225°、315°
      const circ = Array.from({ length: N }, (_, s) => { const a = 2 * Math.PI * s / N; return [cu + r * Math.cos(a), cv + r * Math.sin(a)]; });
      const cornerOf = s => {
        const mid = (2 * Math.PI * (s + 0.5) / N) * 180 / Math.PI;
        return ((Math.round((mid - 45) / 90) % 4) + 4) % 4;
      };
      for (let s = 0; s < N; s++) {
        const q = cornerOf(s), qn = cornerOf((s + 1) % N);
        tri(pt(...circ[s]), pt(...circ[(s + 1) % N]), pt(...corners[q]), out);
        if (qn !== q) tri(pt(...corners[q]), pt(...circ[(s + 1) % N]), pt(...corners[qn]), out);
      }
    }));
    if (holeAxis >= 0) {
      // 孔壁：圓周兩端（孔軸方向的兩個面）之間的四邊形，法向朝孔軸（離開實體）。
      const lo = [X[i], Y[j], Z[k]], hi = [X[i + 1], Y[j + 1], Z[k + 1]];
      const [ua, va] = [0, 1, 2].filter(a => a !== holeAxis);
      const cu = (lo[ua] + hi[ua]) / 2, cv = (lo[va] + hi[va]) / 2;
      const P = (s, end) => {
        const a = 2 * Math.PI * s / N;
        const p = [0, 0, 0]; p[holeAxis] = end ? hi[holeAxis] : lo[holeAxis];
        p[ua] = cu + r * Math.cos(a); p[va] = cv + r * Math.sin(a);
        return p;
      };
      for (let s = 0; s < N; s++) {
        const s1 = (s + 1) % N;
        const a = 2 * Math.PI * (s + 0.5) / N;
        const inward = [0, 0, 0]; inward[ua] = -Math.cos(a); inward[va] = -Math.sin(a);
        quad(P(s, 0), P(s1, 0), P(s1, 1), P(s, 1), inward);
      }
    }
  }
  return { vertices, triangles };
}

export function meshToStl(mesh, name = 'adapter') {
  const V = (mesh && mesh.vertices) || [];
  const fmt = v => String(Number(v.toFixed(6)));
  const lines = [`solid ${name}`];
  ((mesh && mesh.triangles) || []).forEach(([a, b, c]) => {
    const p = V[a], q = V[b], s = V[c];
    let nrm = cross(sub(q, p), sub(s, p));
    const len = Math.hypot(...nrm);
    nrm = len > 0 ? nrm.map(x => x / len) : [0, 0, 0];
    lines.push(`facet normal ${nrm.map(fmt).join(' ')}`, ' outer loop',
      ...[p, q, s].map(v => `  vertex ${v.map(fmt).join(' ')}`), ' endloop', 'endfacet');
  });
  lines.push(`endsolid ${name}`);
  return lines.join('\n') + '\n';
}
