/** 剛性桿件共用尺寸語意；不持有 UI 或修改輸入資料。 */
import { polylineTriangleParams, preservedDiagonalLength } from './plate-geometry.js';

export function memberDimensions(comp) {
  if (comp?.type === 'bar') return [{ id: 'g', label: '孔距 A–B', refs: ['p1', 'p2'], param: comp.lenParam }];
  if (comp?.type !== 'triangle') return [];
  const dimensions = [
    { id: 'g', label: '孔距 A–B', refs: ['p1', 'p2'], param: comp.gParam },
    { id: 'r1', label: '孔距 A–C', refs: ['p1', 'p3'], param: comp.r1Param },
    { id: 'r2', label: '孔距 B–C', refs: ['p2', 'p3'], param: comp.r2Param }
  ];
  const poly = polylineTriangleParams(comp);
  if (poly) dimensions.find(d => d.param === poly.diagParam).label += '（跨距）';
  if (comp.shape === 'jaw') dimensions.push({ id: 'tip', label: '爪端長度 C–T', refs: ['p3', 'tip'], property: 'jawTipLength' });
  return dimensions;
}

export function memberDimensionValue(comp, params, id = 'g') {
  const dimension = memberDimensions(comp).find(d => d.id === id);
  if (!dimension) return NaN;
  if (dimension.property) return Number(comp.jawTipLength ?? Math.max(38, Math.min(84, Number(params[comp.r1Param]) * 0.58)));
  return Number(params[dimension.param]);
}

export function planMemberDimension(comp, params, id, raw) {
  const dimension = memberDimensions(comp).find(d => d.id === id);
  const numeric = Number(raw);
  const value = Math.round(numeric * 10) / 10;
  const max = id === 'tip' ? 160 : 2000;
  if (!dimension || !Number.isFinite(numeric) || numeric < 8 || numeric > max)
    return { ok: false, message: `尺寸請填 8–${max} mm，最多一位小數。` };
  if (dimension.property) return { ok: true, params: {}, properties: { [dimension.property]: value }, value };
  const patch = { [dimension.param]: value };
  const poly = polylineTriangleParams(comp);
  if (poly && dimension.param !== poly.diagParam) {
    const [a, b] = poly.segParams;
    const diagonal = preservedDiagonalLength(Number(params[a]), Number(params[b]), Number(params[poly.diagParam]),
      Number(patch[a] ?? params[a]), Number(patch[b] ?? params[b]));
    if (diagonal !== null) patch[poly.diagParam] = Math.round(diagonal * 10) / 10;
  }
  if (comp.type === 'triangle') {
    const lengths = [comp.gParam, comp.r1Param, comp.r2Param].map(key => Number(patch[key] ?? params[key]));
    const [a, b, c] = lengths.slice().sort((x, y) => x - y);
    if (!lengths.every(n => Number.isFinite(n) && n > 0) || a + b <= c + 0.01)
      return { ok: false, message: '這個孔距無法形成剛性三點桿，請縮小變化或改另一段。' };
  }
  return { ok: true, params: patch, properties: { snapLength: false }, value };
}

// 只有水平鏡像、尺寸一致的既有任務對才允許連動；不以名稱猜配對。
export function mirroredJaw(comp, comps, params) {
  if (Number(params.gripperWorkflow) !== 1 || comp?.shape !== 'jaw') return null;
  const otherId = comp.id === 'LeftJaw' ? 'RightJaw' : comp.id === 'RightJaw' ? 'LeftJaw' : null;
  const other = comps.find(c => c.id === otherId && c.type === 'triangle' && c.shape === 'jaw');
  if (!other || other.jawTurnSign !== -comp.jawTurnSign || Math.abs(comp.p1.y - other.p1.y) > 0.1) return null;
  const same = ['g', 'r1', 'r2', 'tip'].every(id => Math.abs(memberDimensionValue(comp, params, id) - memberDimensionValue(other, params, id)) < 0.1);
  const middle = (comp.p1.x + other.p1.x) / 2;
  const mirror = ['p1', 'p2', 'p3'].every(ref => Math.abs(comp[ref].x + other[ref].x - 2 * middle) < 0.1 && Math.abs(comp[ref].y - other[ref].y) < 0.1);
  return same && mirror ? other : null;
}

export function dimensionLock(comp, comps, id) {
  const dimension = memberDimensions(comp).find(d => d.id === id);
  if (!dimension || dimension.property) return '';
  const ids = dimension.refs.map(ref => comp[ref]?.id);
  const gear = comps.find(c => c.type === 'gear' && ids.includes(c.p1?.id) && ids.includes(c.p2?.id));
  return gear ? '這段孔距由齒輪輸出孔決定，請選齒輪調整輸出孔半徑。' : '';
}
