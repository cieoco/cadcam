// 負載標記與重力設定的完整正規化（按需載入；schema.js 只做輕量保存）。
// load = { id, name?, massG, at:{pointId} | {compId,u,v}, force?:{x,y} }
//  - at.pointId：機構中的任一接點（含孔）；at.compId+u,v：零件局部座標（p1→p2 為 +u，+v 為其逆時針垂直方向，mm）。
//  - force：作用在機構上的外力（N，畫面座標 y 向上），例如夾爪夾持物對夾爪的反力。
// gravity：'vertical'（預設，2D 直立、重力朝畫面下方）或 'flat'（平放，重力垂直畫面，不產生扭力）。
const ID = /^[\w.-]+$/u, fin = Number.isFinite;
export const GRAVITY_MODES = Object.freeze(['vertical', 'flat']);
export const DEFAULT_GRAVITY = 'vertical';
export const normalizeGravity = g => (g === 'flat' ? 'flat' : DEFAULT_GRAVITY);

export function normalizeLoads(list) {
  const out = [], seen = new Set();
  for (const l of Array.isArray(list) ? list : []) {
    const a = l?.at, mass = Number(l?.massG);
    if (!l || typeof l.id !== 'string' || !ID.test(l.id) || seen.has(l.id) || !fin(mass) || mass < 0 || !a || typeof a !== 'object') continue;
    const e = { id: l.id, massG: mass };
    if (typeof l.name === 'string' && l.name.trim()) e.name = l.name.trim().slice(0, 24);
    if (typeof a.pointId === 'string' && ID.test(a.pointId)) e.at = { pointId: a.pointId };
    else if (typeof a.compId === 'string' && ID.test(a.compId) && fin(a.u) && fin(a.v)) e.at = { compId: a.compId, u: a.u, v: a.v };
    else continue;
    const f = l.force;
    if (f && fin(f.x) && fin(f.y) && (f.x || f.y)) e.force = { x: f.x, y: f.y };
    seen.add(l.id); out.push(e);
    if (out.length >= 24) break;
  }
  return out;
}
