/**
 * blocks / selection-target  (pack O1 of docs/SDD-OPERATION-PIPELINE.md §3.3)
 *
 * 「現在選到的，到底要動哪個零件？」指令（刪除、之後的移動／解除…）都問這一個函式，不各自猜。純函式、無 DOM；按需載入。
 *
 *   targetOf(S, comps, modules) -> {part, hole?, shared}
 *     part    要動的零件（comp）；沒有選到，或接點被好幾個零件共用而無法確定時為 null
 *     hole    選到的是孔／端點時，那個孔的 id
 *     shared  共用同一個接點的零件（接點由多個零件共用時，不猜，交給呼叫端問使用者）；
 *             機架孔（frameHole）被別的零件接著時，part 是機架孔，shared 是接在它上面的零件
 */
import {buildRelations} from './relations.js';
import {nameOf} from './integrity-repairs.js';

const DELETABLE_BY_HOLE = new Set(['bar', 'triangle', 'slider', 'gear']);

/** 學生看得到的名稱（不顯示內部編號）。 */
export const partName = c => c?.type === 'anchor' ? (c.frameHole ? '機架孔' : '固定點') : nameOf(c);

/** 選到孔時用：回傳這個孔／端點屬於哪些零件（依零件順序、不重複）。 */
export function ownersOfPoint(comps, modules, id) {
  const ids = new Set(buildRelations({comps, modules: modules || []}).copiesOf(id).map(r => r.compId));
  return comps.filter(c => ids.has(c.id));
}

export function targetOf(S, comps, modules = []) {
  const byId = id => (id && comps.find(c => c.id === id)) || null;
  const direct = byId(S.selectedGearId) || byId(S.selectedLinkId) || byId(S.selectedTriangleId) || byId(S.selectedSliderId);
  if (direct) return {part: direct, shared: []};
  const id = S.selectedNodeId;
  if (!id) return {part: null, shared: []};
  const motor = comps.find(c => c.type === 'motor' && c.p1?.id === id);              // 獨立馬達的軸心
  if (motor) return {part: motor, hole: id, shared: []};
  const owners = ownersOfPoint(comps, modules, id);
  const frame = comps.find(c => c.type === 'anchor' && c.frameHole && c.p1?.id === id);   // 機架上自己的固定孔
  if (frame) return {part: frame, hole: id, shared: owners.filter(c => c !== frame)};
  if (owners.length === 1) return {part: owners[0], hole: id, shared: []};
  return {part: null, hole: id, shared: owners};
}

/** 這種零件能不能由「選到它的孔」直接刪除（其他種類請用它自己的面板）。 */
export const deletableByHole = c => DELETABLE_BY_HOLE.has(c?.type) || c?.type === 'motor' || (c?.type === 'anchor' && !!c.frameHole);

/**
 * 共用接點的零件清單，寫成學生看得懂的名稱；名稱相同時加上看得到的差別（桿長、位置），不用內部編號。
 * 回傳 ['孔格桿件（長 40 mm）', ...]
 */
export function distinctLabels(parts, params = {}) {
  const at = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) ? `(${Math.round(p.x)}, ${Math.round(p.y)})` : '';
  const len = c => { const L = Number(params[c.lenParam]); return Number.isFinite(L) ? L : c.p1 && c.p2 ? Math.hypot(c.p2.x - c.p1.x, c.p2.y - c.p1.y) : NaN; };
  const hints = [c => Number.isFinite(len(c)) ? `長 ${Math.round(len(c))} mm` : '', c => at(c.p1) && `一端在 ${at(c.p1)}`, c => at(c.p2) && `另一端在 ${at(c.p2)}`];
  const labels = parts.map(partName), extra = parts.map(() => []);
  for (const h of hints) {
    const dup = labels.map((l, i) => labels.some((m, j) => j !== i && m === l));
    if (!dup.some(Boolean)) break;
    parts.forEach((c, i) => { if (dup[i]) { const t = h(c); if (t) { extra[i].push(t); labels[i] = `${partName(c)}（${extra[i].join('，')}）`; } } });
  }
  return labels;
}
