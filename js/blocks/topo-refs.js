/**
 * blocks / topo-refs  (pack C2 of docs/SDD-CONNECTION-INTEGRITY.md)
 *
 * 作品層（topo）對接點的引用：軌跡追蹤點、參考點、負載位置、量尺端點。接點被合併或零件被刪除後，
 * 這些引用必須跟著改指或清掉，否則存檔會留下指向不存在的點（integrity I5）。純函式、無 DOM；按需載入。
 */
import {pointKeysFor} from './part-types.js';
import {localHoles} from '../core/local-holes.js';

const dimEnds = topo => (topo.dimensions || []).flatMap(d => [d?.a, d?.b]).filter(Boolean);

/** 接點 fromId 併入 toId：所有引用改指 toId（軌跡點去重）。就地修改 topo。 */
export function retargetPointRefs(topo, fromId, toId) {
  if (!topo || !fromId || fromId === toId) return;
  const re = id => id === fromId ? toId : id;
  if (Array.isArray(topo.tracePoints)) topo.tracePoints = [...new Set(topo.tracePoints.map(re))];
  if (topo.tracePoint) topo.tracePoint = re(topo.tracePoint);
  if (topo.referencePoint) topo.referencePoint = re(topo.referencePoint);
  for (const l of topo.loads || []) if (l?.at?.pointId) l.at.pointId = re(l.at.pointId);
  for (const r of dimEnds(topo)) if (r.pointId) r.pointId = re(r.pointId);
}

/** 零件刪除後：清掉指向已不存在的點或零件的引用（負載與量尺整筆移除）。就地修改 topo。 */
export function pruneTopoRefs(topo, comps) {
  if (!topo) return;
  const live = new Set(comps.flatMap(c => [c.id, ...pointKeysFor(c).map(k => c[k]?.id), ...localHoles(c).map(h => h.id), ...(c.standardBlank?.mountHoles || []).map(h => h.id)]));
  const ok = r => !r || (r.pointId ? live.has(r.pointId) : !r.compId || live.has(r.compId));
  if (Array.isArray(topo.tracePoints)) topo.tracePoints = topo.tracePoints.filter(id => live.has(id));
  if (topo.tracePoint && !live.has(topo.tracePoint)) topo.tracePoint = '';
  if (topo.referencePoint && !live.has(topo.referencePoint)) topo.referencePoint = '';
  if (Array.isArray(topo.loads)) topo.loads = topo.loads.filter(l => ok(l?.at));
  if (Array.isArray(topo.dimensions)) topo.dimensions = topo.dimensions.filter(d => ok(d?.a) && ok(d?.b));
}
