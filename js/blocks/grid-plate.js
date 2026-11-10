/**
 * blocks / grid-plate
 *
 * 三點板的格上編輯（docs/SDD-GRID-BLOCKS.md G4b、R2）。按需載入，不進首次 JS。
 *   1. 邊長拖曳：另外兩邊固定，候選長度 L = 8·√n，使三角形三頂點可同時落在 8 mm 方格。
 *   2. 板上額外孔（hole:true）拖曳：吸附到該板的（可旋轉）方格。
 *   3. 數字欄旁的格向量提示（「斜 1×1 格」「4×3 格」「離格」）。
 * 拖曳不產生離格；數字輸入由呼叫端保留小數，這裡只判定與提示。
 */
import { GRID_PITCH_MM, GRID_TOLERANCE_MM, latticeEmbedding } from './grid-rule.js';
import { plateVertices, polylineTriangleParams, localToWorld, worldToLocal } from './plate-geometry.js';
import { planMemberDimension } from './member-dimensions.js';
import { buildRelations } from './relations.js';

export const EDGE_SEARCH_MM = 24;
const REF_INDEX = { p1: 0, p2: 1, p3: 2 };

// 邊長平方 ÷ P² 的整數 n；邊長偏離 P·√n 超過容差則回 null（該邊不在格上）。
function squareIndex(length, pitch) {
  const n = Math.round(length * length / (pitch * pitch));
  return n >= 1 && Math.abs(length - pitch * Math.sqrt(n)) <= GRID_TOLERANCE_MM ? n : null;
}
// i²+j² = n 的全部整數向量。
function representations(n) {
  const out = [], r = Math.floor(Math.sqrt(n));
  for (let i = -r; i <= r; i++) {
    const rest = n - i * i, j = Math.round(Math.sqrt(rest));
    if (j * j !== rest) continue;
    out.push([i, j]);
    if (j) out.push([i, -j]);
  }
  return out;
}

/**
 * 兩邊 a、b 固定時，第三邊所有能讓三角形落在方格的長度（遞增），限制在 [min,max] 且三角不等式成立。
 * 作法等價於 latticeEmbedding：以 a、b 的夾點為原點，列舉兩個整數向量 u、w。空陣列＝這塊板已是例外。
 */
export function latticeEdgeCandidates(a, b, { min = 0, max = Infinity, pitch = GRID_PITCH_MM } = {}) {
  const A = squareIndex(a, pitch), B = squareIndex(b, pitch);
  if (A === null || B === null) return [];
  const ns = new Set(), ra = representations(A), rb = representations(B);
  for (const u of ra) for (const w of rb) {
    if (u[0] * w[1] - u[1] * w[0] === 0) continue;   // 共線＝退化
    ns.add((u[0] - w[0]) ** 2 + (u[1] - w[1]) ** 2);
  }
  return [...ns].sort((x, y) => x - y).map(n => pitch * Math.sqrt(n))
    .filter(L => L >= min - 1e-9 && L <= max + 1e-9 && L > Math.abs(a - b) + 0.02 && L < a + b - 0.02);
}

// 由近到遠取第一個候選；搜尋範圍 ±EDGE_SEARCH_MM，沒有就回 start（維持原值）。
export function nearestEdgeLength(raw, candidates, start, range = EDGE_SEARCH_MM) {
  let best = null;
  for (const L of candidates) {
    const d = Math.abs(L - raw);
    if (d <= range && (best === null || d < Math.abs(best - raw) - 1e-12)) best = L;
  }
  return best === null ? start : best;
}

// 三點板在自身座標的頂點（與 grid-rule 相同的手性）；length 可覆寫某一邊。
function basePoints(comp, params, override) {
  const val = key => key === override?.param ? override.value : Number(params?.[key]);
  const g = val(comp.gParam), r1 = val(comp.r1Param), r2 = val(comp.r2Param);
  if (![g, r1, r2].every(v => Number.isFinite(v) && v > 0)) return null;
  const x = (g * g + r1 * r1 - r2 * r2) / (2 * g), y2 = r1 * r1 - x * x;
  if (y2 < -1e-6) return null;
  const cross = comp.p1 && comp.p2 && comp.p3 ? (comp.p2.x - comp.p1.x) * (comp.p3.y - comp.p1.y) - (comp.p2.y - comp.p1.y) * (comp.p3.x - comp.p1.x) : 1;
  return [{ x: 0, y: 0 }, { x: g, y: 0 }, { x, y: (cross < 0 ? -1 : 1) * Math.sqrt(Math.max(0, y2)) }];
}
const attachedHoles = (comps, owner) => buildRelations({ comps: comps || [] }).endsOn(owner.id).map(e => ({ x: e.u, y: e.v }));

// 格向量文字：(i,j) 為邊兩端的格座標差。
export function gridVectorText(i, j) {
  const a = Math.abs(i), b = Math.abs(j);
  if (!a && !b) return '';
  if (a === b) return `斜 ${a}×${a} 格`;
  return Math.min(a, b) ? `${Math.max(a, b)}×${Math.min(a, b)} 格` : `${Math.max(a, b)} 格`;
}

/** 該邊取值 value 時，整板（三頂點＋額外孔＋針筒掛點）若在格上，回傳格向量文字；離格回「離格」。 */
export function plateGridHint(comp, params, dimension, value, comps = []) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return '';
  const base = basePoints(comp, params, { param: dimension.param, value: v });
  if (!base) return '';
  const extra = plateVertices(comp).filter(p => !p.solve && p.hole === true).map(p => localToWorld(base, p)).filter(Boolean);
  const e = latticeEmbedding([...base, ...extra, ...attachedHoles(comps, comp)]);
  if (!e.ok) return '離格';
  const [a, b] = dimension.refs.map(r => e.coords[REF_INDEX[r]]);
  return a && b ? gridVectorText(b.i - a.i, b.j - a.j) : '';
}

/**
 * 三點板邊長把手的格上設定；不適用（夾爪爪端、板寬板厚、盒體）回 null。
 * 候選以實際尺寸修改結果核對全部孔；沒有合法候選就保留原值，數字欄仍可輸入例外。
 */
export function edgeSnap(comp, dimension, params, { min = 8, max = 2000, comps = [] } = {}) {
  if(comp?.standardBlank)return null;
  if (!comp || comp.type !== 'triangle' || comp.boxPanel || !dimension?.refs || dimension.property || dimension.stockKey) return null;
  if (!['g', 'r1', 'r2'].includes(dimension.id)) return null;
  const segment = polylineTriangleParams(comp)?.segParams.includes(dimension.param);
  const hint = value => {
    const plan = planMemberDimension(comp, params, dimension.id, value, { exact: true });
    return plan.ok ? plateGridHint(comp, { ...params, ...plan.params }, dimension, plan.value, comps) : '離格';
  };
  const valid = value => { const text = hint(value); return !!text && text !== '離格'; };
  const [a, b] = [comp.gParam, comp.r1Param, comp.r2Param].filter(k => k !== dimension.param).map(k => Number(params?.[k]));
  const candidates = segment ? [] : latticeEdgeCandidates(a, b, { min, max }).filter(valid);
  return {
    candidates,
    quantize: start => raw => {
      // 折線桿段仍以 8 mm 為步距，但固定彎角與其他孔也須同時對格。
      const nearby = segment ? Array.from({ length: 7 }, (_, k) => (Math.round(raw / GRID_PITCH_MM) + k - 3) * GRID_PITCH_MM)
        .filter(v => v >= min && v <= max && valid(v)) : candidates;
      return nearestEdgeLength(raw, nearby, start);
    },
    hint
  };
}

const round4 = x => Number(x.toFixed(4));
const snap8 = x => Math.round(x / GRID_PITCH_MM) * GRID_PITCH_MM;

/**
 * 板上額外孔拖曳：world 吸附到板的方格。
 * corners：p1、p2、p3 的世界座標；basis：[p1,p2] 世界座標（局部 u／v 的基準）；others：其他額外孔的局部座標。
 * 回傳新的局部 {u,v}；板本身離格時退回 u、v 各取 8 的倍數。
 */
export function snapPlateHole(corners, basis, others, world, pitch = GRID_PITCH_MM) {
  const extras = (others || []).map(o => localToWorld(basis, o)).filter(Boolean);
  let e = latticeEmbedding([...corners, ...extras], pitch);
  if (!e.ok) e = latticeEmbedding(corners, pitch);
  if (e.ok) {
    const t = e.rotationDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), o = corners[0];
    const dx = world.x - o.x, dy = world.y - o.y;
    const i = Math.round((c * dx + s * dy) / pitch), j = Math.round((-s * dx + c * dy) / pitch);
    const local = worldToLocal(basis, { x: o.x + pitch * (i * c - j * s), y: o.y + pitch * (i * s + j * c) });
    return { u: round4(local.u), v: round4(local.v) };
  }
  const local = worldToLocal(basis, world);
  return { u: snap8(local.u), v: snap8(local.v) };
}
