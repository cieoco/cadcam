/**
 * blocks / grid-rule
 *
 * 數位積木 8 mm 孔格的判定（docs/SDD-GRID-BLOCKS.md G1）。純函式：不碰 DOM、不改作品。
 * 是否「離格」一律由目前幾何即時推導（E1），不寫入作品；呼叫端只拿結果做標示或報告。
 *
 * 規則對應：
 *   R1 條積木：桿的端孔距、折線各段、桿上附加孔沿桿軸為 P 的整數倍。
 *   R2 板積木：三點板、圓盤、合成片的孔可同時落在「該零件自己的」P 方格點（可旋轉，不要求平行世界軸）。
 *   R3 機架：同一設計的機架固定孔可同時落在一個 P 方格。
 *   R5 齒輪：嚙合兩輪中心距為 P 的倍數；齒輪輸出孔落在齒輪方格。
 * 不檢查：滑軌、齒條、皮帶輪、凸輪、針筒本體與其外購固定環孔、鏈條張緊長孔（SDD §3「不受孔格約束」）。
 */
import { LEGO_FRAME_STEP, frameConnectorNodes } from './model.js';
import { plateVertices, plateShapeMode, polylineTriangleParams, localToWorld } from './plate-geometry.js';
import { isDisk } from './disk-plate.js';
import { syncFrameHoles } from './frame-holes.js';

export const GRID_PITCH_MM = LEGO_FRAME_STEP;   // 8 mm
export const GRID_TOLERANCE_MM = 0.01;          // 低於此偏差視為在格上（作品參數多為 0.1 mm 精度）

// 邊距＝P − 板厚／2：立板的邊靠在承接板面上時，第一列孔恰好落在立體格（SDD §2、R4）。
export function gridEdgeMarginMm(thicknessMm, pitch = GRID_PITCH_MM) {
  const t = Number(thicknessMm);
  return Number.isFinite(t) && t > 0 && t < 2 * pitch ? pitch - t / 2 : null;
}
export const gridBarWidthMm = (thicknessMm, pitch = GRID_PITCH_MM) => {
  const m = gridEdgeMarginMm(thicknessMm, pitch);
  return m === null ? null : 2 * m;
};

// R1：長度是否為 P 的整數倍（至少一格）。
export function pitchDeviation(lengthMm, pitch = GRID_PITCH_MM, tol = GRID_TOLERANCE_MM) {
  const L = Number(lengthMm);
  if (!Number.isFinite(L)) return { ok: false, valueMm: L, nearestMm: null, deviationMm: Infinity };
  const nearestMm = Math.max(pitch, Math.round(L / pitch) * pitch);
  const deviationMm = Math.abs(L - nearestMm);
  return { ok: deviationMm <= tol, valueMm: L, nearestMm, deviationMm, holes: Math.round(nearestMm / pitch) + 1 };
}

// R2／R3：一組孔能否同時落在某個旋轉後的 P 方格點上。第一孔為原點（孔本身必在格點）。
// 以「另一孔到原點的向量對齊某個整數格向量 (i,j)」列舉候選旋轉，取最大偏差最小者。
// 回傳 { ok, maxDeviationMm, worstIndex, rotationDeg, coords }；coords 為各孔的整數格座標（ok 時）。
export function latticeEmbedding(points, pitch = GRID_PITCH_MM, tol = GRID_TOLERANCE_MM) {
  const pts = (points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return { ok: true, maxDeviationMm: 0, worstIndex: -1, rotationDeg: 0, coords: pts.map(() => ({ i: 0, j: 0 })) };
  const o = pts[0], rel = pts.map(p => ({ x: p.x - o.x, y: p.y - o.y }));
  let best = null;
  const evaluate = theta => {
    const c = Math.cos(theta), s = Math.sin(theta);
    let max = 0, worst = -1;
    const coords = rel.map((p, k) => {
      const u = (c * p.x + s * p.y) / pitch, v = (-s * p.x + c * p.y) / pitch;
      const i = Math.round(u), j = Math.round(v), d = Math.hypot(u - i, v - j) * pitch;
      if (d > max) { max = d; worst = k; }
      return { i, j };
    });
    if (!best || max < best.maxDeviationMm - 1e-12) best = { maxDeviationMm: max, worstIndex: worst, rotationDeg: theta * 180 / Math.PI, coords };
  };
  for (const q of rel.slice(1)) {
    const d = Math.hypot(q.x, q.y);
    if (d < 1e-9) continue;
    const n = Math.ceil(d / pitch) + 1, phi = Math.atan2(q.y, q.x);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      if (!i && !j) continue;
      if (Math.abs(Math.hypot(i, j) * pitch - d) > pitch) continue;
      evaluate(phi - Math.atan2(j, i));   // 只取第一象限：其餘象限是 90° 旋轉的同一方格
    }
  }
  if (!best) evaluate(0);
  return { ok: best.maxDeviationMm <= tol, ...best };
}

const num = (params, key) => Number(params?.[key]);
const issue = (comp, rule, subject, extra) => ({ componentId: comp?.id || '', moduleId: comp?.moduleId || null, type: comp?.type || '', rule, subject, ...extra });

// 三點板在自身座標的頂點：p1 原點、p2 在 +x，p3 方向沿用作品座標的左右手性。
function trianglePoints(c, params) {
  const g = num(params, c.gParam), r1 = num(params, c.r1Param), r2 = num(params, c.r2Param);
  if (![g, r1, r2].every(v => Number.isFinite(v) && v > 0)) return null;
  const x = (g * g + r1 * r1 - r2 * r2) / (2 * g), y2 = r1 * r1 - x * x;
  if (y2 < -1e-6) return null;
  const cross = c.p1 && c.p2 && c.p3 ? (c.p2.x - c.p1.x) * (c.p3.y - c.p1.y) - (c.p2.y - c.p1.y) * (c.p3.x - c.p1.x) : 1;
  return [{ x: 0, y: 0 }, { x: g, y: 0 }, { x, y: (cross < 0 ? -1 : 1) * Math.sqrt(Math.max(0, y2)) }];
}

// 針筒端點接在零件上的孔，換成宿主零件 p1→p2 座標（core/syringe attachmentPoint 的 u／v）。
function attachedHoles(comps, owner) {
  return comps.filter(c => c.type === 'syringe').flatMap(c => ['a', 'b'].map(k => c[k]))
    .filter(r => r && r.componentId === owner.id && Number.isFinite(r.u) && Number.isFinite(r.v))
    .map(r => ({ x: r.u, y: r.v }));
}

function barIssues(c, comps, params, pitch, tol, out) {
  const L = num(params, c.lenParam);
  if (isDisk(c)) {
    const pts = [{ x: 0, y: 0 }, { x: L, y: 0 }, ...attachedHoles(comps, c)];
    const e = latticeEmbedding(pts, pitch, tol);
    if (!e.ok) out.push(issue(c, 'R2', '圓盤孔位', { valueMm: L, deviationMm: e.maxDeviationMm, message: `圓盤的孔無法同時落在 ${pitch} mm 方格（最大偏差 ${fmt(e.maxDeviationMm)} mm）` }));
    return;
  }
  const d = pitchDeviation(L, pitch, tol);
  if (!d.ok) out.push(issue(c, 'R1', '孔距', { valueMm: L, nearestMm: d.nearestMm, deviationMm: d.deviationMm, message: `孔距 ${fmt(L)} mm 不是 ${pitch} mm 的倍數（最近 ${d.nearestMm} mm、${d.holes} 孔，差 ${fmt(d.deviationMm)} mm）` }));
  for (const h of attachedHoles(comps, c)) {
    const du = pitchDeviation(h.x, pitch, tol), off = Math.abs(h.y);
    const dev = Math.max(Math.abs(h.x) < tol ? 0 : du.deviationMm, off);
    if (dev > tol) out.push(issue(c, 'R1', '附加孔', { valueMm: h.x, offsetMm: h.y, deviationMm: dev, message: `桿上附加孔（沿桿 ${fmt(h.x)} mm、偏離桿軸 ${fmt(h.y)} mm）不在 ${pitch} mm 孔位上` }));
  }
}

function triangleIssues(c, comps, params, pitch, tol, out) {
  const base = trianglePoints(c, params);
  if (!base) return;
  const poly = polylineTriangleParams(c);
  if (poly) for (const key of poly.segParams) {
    const d = pitchDeviation(num(params, key), pitch, tol);
    if (!d.ok) out.push(issue(c, 'R1', '折線段', { param: key, valueMm: d.valueMm, nearestMm: d.nearestMm, deviationMm: d.deviationMm, message: `折線段 ${fmt(d.valueMm)} mm 不是 ${pitch} mm 的倍數（最近 ${d.nearestMm} mm，差 ${fmt(d.deviationMm)} mm）` }));
  }
  const extra = plateVertices(c).filter(v => !v.solve && v.hole === true).map(v => localToWorld(base, v)).filter(Boolean);
  const holes = [...base, ...extra, ...attachedHoles(comps, c)];
  const e = latticeEmbedding(holes, pitch, tol);
  if (!e.ok) out.push(issue(c, 'R2', '頂點孔位', { shapeMode: plateShapeMode(c), deviationMm: e.maxDeviationMm, message: `三點板的孔無法同時落在 ${pitch} mm 方格點（最大偏差 ${fmt(e.maxDeviationMm)} mm）` }));
}

function fusionIssues(c, pitch, tol, out) {
  const e = latticeEmbedding(c.barFusion?.points || [], pitch, tol);
  if (!e.ok) out.push(issue(c, 'R2', '合成片孔位', { deviationMm: e.maxDeviationMm, message: `合成片的孔無法同時落在 ${pitch} mm 方格（最大偏差 ${fmt(e.maxDeviationMm)} mm）` }));
}

function gearIssues(c, comps, params, pitch, tol, out) {
  const radius = g => { const r = num(params, g.radiusParam); return Number.isFinite(r) && r > 0 ? r : Number(g.teeth) * Number(g.module) / 2; };
  const mate = c.mesh && comps.find(g => g.id === c.mesh && g.type === 'gear');
  if (mate) {
    const d = pitchDeviation(radius(c) + radius(mate), pitch, tol);
    if (!d.ok) out.push(issue(c, 'R5', '齒輪中心距', { mateId: mate.id, valueMm: d.valueMm, nearestMm: d.nearestMm, deviationMm: d.deviationMm, message: `與 ${mate.id} 的中心距 ${fmt(d.valueMm)} mm 不是 ${pitch} mm 的倍數（差 ${fmt(d.deviationMm)} mm）` }));
  }
  const r = num(params, c.pinRadiusParam);
  if (Number.isFinite(r) && r > 0) {
    const e = latticeEmbedding([{ x: 0, y: 0 }, { x: r, y: 0 }], pitch, tol);
    if (!e.ok) out.push(issue(c, 'R5', '齒輪輸出孔', { valueMm: r, deviationMm: e.maxDeviationMm, message: `輸出孔離中心 ${fmt(r)} mm，無法落在齒輪的 ${pitch} mm 方格（差 ${fmt(e.maxDeviationMm)} mm）` }));
  }
}

function frameIssues(group, moduleId, pitch, tol, out) {
  const nodes = frameConnectorNodes(group).filter(p => !String(p.holeLayer || '').startsWith('SYRINGE') && !p.axleSlot);
  if (nodes.length < 2) return;
  const e = latticeEmbedding(nodes, pitch, tol);
  if (!e.ok) {
    // 最佳擬合會旋轉分攤誤差，worstIndex 只是偏差最大的孔，不一定是被移動的那一個；訊息不點名。
    const worst = nodes[e.worstIndex];
    out.push({ componentId: '', moduleId, type: 'frame', rule: 'R3', subject: '機架固定孔', pointId: worst?.id || '', deviationMm: e.maxDeviationMm,
      message: `機架的 ${nodes.length} 個固定孔無法同時落在 ${pitch} mm 方格（最大偏差 ${fmt(e.maxDeviationMm)} mm）` });
  }
}

const fmt = v => (Math.round(v * 100) / 100).toString();

/**
 * 回傳作品中所有離格項目；空陣列＝全部在格上。不修改 comps。
 * @param {object[]} comps 正規化後的元件
 * @param {object} params topo.params
 */
export function gridIssues(comps, params = {}, { pitch = GRID_PITCH_MM, tol = GRID_TOLERANCE_MM } = {}) {
  const list = structuredClone(comps || []);
  syncFrameHoles(list);
  const out = [];
  for (const c of list) {
    if (c.type === 'bar') barIssues(c, list, params, pitch, tol, out);
    else if (c.type === 'triangle') triangleIssues(c, list, params, pitch, tol, out);
    else if (c.type === 'gear') gearIssues(c, list, params, pitch, tol, out);
    if (c.barFusion) fusionIssues(c, pitch, tol, out);
  }
  const groups = new Map();
  list.forEach(c => { const k = c.moduleId || null; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  for (const [moduleId, group] of groups) frameIssues(group, moduleId, pitch, tol, out);
  return out;
}
