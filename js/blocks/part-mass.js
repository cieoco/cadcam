// 零件質量與重心（動力扭力估算 Q1）：外形面積（扣孔、扣切口）× 板厚 × 密度。
// 外形取自匯出幾何（inspectLinkExport／inspectPlateExport），所以與實際切出來的零件一致。
// 純函式，不改作品、不依賴 DOM。重心為零件局部座標：原點 p1、+u 朝 p2、+v 為其逆時針垂直方向（mm）。
import { exportableLinks, exportablePlates, exportableGears, exportableRacks, inspectLinkExport, inspectPlateExport } from './exporters.js';
import { inspectBarFusion } from './bar-fusion-geometry.js';
import { MATERIALS, memberStock } from './member-stock.js';

export const PLYWOOD_DENSITY_KG_M3 = 700;

/** 材料密度 kg/m³；沒有查證的材料回傳 null（畫面顯示「未確認」）。 */
export function materialDensity(materialId) {
  const m = MATERIALS.find(x => x.id === materialId);
  return m && Number.isFinite(m.densityKgM3) ? m.densityKgM3 : null;
}

/** 多邊形面積與形心（shoelace）；退化時 area 為 0。 */
export function polygonProps(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], k = p.x * q.y - q.x * p.y;
    a += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k;
  }
  return Math.abs(a) < 1e-9 ? { area: 0, x: 0, y: 0 } : { area: Math.abs(a) / 2, x: cx / (3 * a), y: cy / (3 * a) };
}

/** 幾何 {outlines,holes,cutouts}（局部座標）→ 淨面積與形心。 */
export function geometryProps(geometry) {
  let area = 0, mx = 0, my = 0;
  const add = (a, x, y, sign) => { area += sign * a; mx += sign * a * x; my += sign * a * y; };
  for (const o of geometry.outlines || []) { const p = polygonProps(o); add(p.area, p.x, p.y, 1); }
  for (const h of geometry.holes || []) add(Math.PI * h.r * h.r, h.x, h.y, -1);
  for (const c of geometry.cutouts || []) { const p = polygonProps(c.points || []); add(p.area, p.x, p.y, -1); }
  return area > 0 ? { areaMm2: area, u: mx / area, v: my / area } : { areaMm2: 0, u: 0, v: 0 };
}

/**
 * 單件質量。未指定材料或密度未確認時用合板 700 kg/m³ 並回傳 assumed:true（reason 說明原因）。
 * @returns {{massG:number, cg:{u:number,v:number}, areaMm2:number, thicknessMm:number, densityKgM3:number, material:string, assumed:boolean, reason:string}}
 */
export function partMassFromGeometry(comp, geometry, { thicknessMm, material } = {}) {
  const stock = memberStock(comp), props = geometryProps(geometry);
  const mat = material || stock.material, own = materialDensity(mat);
  const density = own ?? PLYWOOD_DENSITY_KG_M3;
  const t = Number.isFinite(thicknessMm) && thicknessMm > 0 ? thicknessMm : stock.thicknessMm;
  const reason = own !== null ? '' : mat === 'unspecified' ? '未指定材料，假設合板' : '材料密度未確認，暫以合板計';
  return {
    massG: props.areaMm2 * t * density * 1e-6, cg: { u: props.u, v: props.v }, areaMm2: props.areaMm2,
    thicknessMm: t, densityKgM3: density, material: mat, assumed: own === null, reason
  };
}

const rot = (p, o, e) => ({ x: (p.x - o.x) * e.x + (p.y - o.y) * e.y, y: -(p.x - o.x) * e.y + (p.y - o.y) * e.x });
function plateLocal(geometry, p1, p2) {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, e = { x: (p2.x - p1.x) / d, y: (p2.y - p1.y) / d };
  const tp = p => rot(p, p1, e);
  return {
    outlines: (geometry.outlines || []).map(o => o.map(tp)),
    holes: (geometry.holes || []).map(h => ({ ...h, ...tp(h) })),
    cutouts: (geometry.cutouts || []).map(c => ({ ...c, points: (c.points || []).map(tp) }))
  };
}

export function linkMass(comp, length, settings = {}) {
  return partMassFromGeometry(comp, inspectLinkExport(comp, length, settings));
}
/** points：三個頂點的目前座標（與匯出時相同）。 */
export function plateMass(comp, points, settings = {}) {
  return partMassFromGeometry(comp, plateLocal(inspectPlateExport(comp, points, settings), points[0], points[1]));
}

/**
 * 合成桿（barFusion 根件）：用匯出時的聯集外形（已扣重疊與孔），所以重疊處不會重複計算。
 * 外形座標以根件 p1 為原點、+u 朝 p2，與單桿相同。聯集失敗（板厚不同、外形不相連…）時丟錯，由呼叫端列入 skipped。
 */
export function fusionMass(root, comps, params = {}, settings = {}) {
  const f = inspectBarFusion(comps, root, params, settings, null);
  if (!f.ok) throw new Error(f.reason || '合成桿外形無法計算');
  return partMassFromGeometry(root, f.geometry, { thicknessMm: f.thicknessMm });
}

/**
 * 齒輪（近似）：用匯出的齒形外形扣孔（約等於節圓半徑的圓盤），重心取軸心 p1。板厚取該零件的 stock 預設。
 * 外形座標以軸心為原點，所以不需要旋轉。
 */
export function gearMass(comp, geometry) {
  const m = partMassFromGeometry(comp, { outlines: [geometry.outline], holes: geometry.holes || [], cutouts: geometry.cutouts || [] });
  return { ...m, cg: { u: 0, v: 0 } };
}

/** 齒條（近似）：匯出外形（含齒、扣長槽與孔）；重心取外形形心，依 axisDeg 轉到畫面方向，掛在 p1 上（齒條只平移不轉動）。 */
export function rackMass(comp, geometry) {
  const m = partMassFromGeometry(comp, { outlines: [geometry.outline], holes: geometry.holes || [], cutouts: geometry.cutouts || [] });
  const a = (Number(comp.axisDeg) || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { ...m, offset: { x: m.cg.u * c - m.cg.v * s, y: m.cg.u * s + m.cg.v * c } };
}

/**
 * 整個作品的零件質量清單：桿、合成桿、板、齒輪（近似圓盤）、齒條（近似矩形）。
 * 其他型別（滑塊、凸輪、皮帶輪、針筒…）尚未計入，列在 skipped。
 * 項目帶 frame＋cg（隨兩個接點轉動的零件），或 anchor{pointId,dx,dy}（齒輪軸心、齒條原點，只跟著一個接點平移）。
 * 合成桿與齒輪都以匯出外形計算；重疊處由聯集處理，所以不會重複計入。
 * @param pts 目前求解的接點座標 {id:{x,y}}
 * @returns {{items:Array<{id,kind:'part',compId,frame?,anchor?,massG,cg,assumed,reason}>, skipped:Array<{id,type,reason}>}}
 */
export function assemblyMassModel(comps, pts, params = {}, settings = {}) {
  const items = [], skipped = [], done = new Set();
  const push = (comp, m, extra = {}) => {
    done.add(comp.id);
    items.push({ id: comp.id, kind: 'part', compId: comp.id, massG: m.massG, cg: m.cg, assumed: m.assumed, reason: m.reason, ...extra });
  };
  const skip = (comp, type, reason) => { skipped.push({ id: comp.id, type, reason }); done.add(comp.id); };
  for (const { comp, length } of exportableLinks(comps, pts, params)) {
    try {
      if (comp.barFusion) push(comp, fusionMass(comp, comps, params, settings), { frame: [comp.p1.id, comp.p2.id], fused: true });
      else push(comp, linkMass(comp, length, settings), { frame: [comp.p1.id, comp.p2.id] });
    } catch (e) { skip(comp, 'bar', String(e.message || e)); }
  }
  for (const { comp, points } of exportablePlates(comps, pts)) {
    try { push(comp, plateMass(comp, points, settings), { frame: [comp.p1.id, comp.p2.id] }); } catch (e) { skip(comp, 'triangle', String(e.message || e)); }
  }
  try {
    for (const { comp, geometry } of exportableGears(comps, params, settings, null)) {
      try { push(comp, gearMass(comp, geometry), { anchor: { pointId: comp.p1.id, dx: 0, dy: 0 }, approx: '齒輪' }); } catch (e) { skip(comp, 'gear', String(e.message || e)); }
    }
  } catch (e) {
    for (const c of comps) if (c?.type === 'gear' && !done.has(c.id)) skip(c, 'gear', String(e.message || e));
  }
  try {
    for (const { comp, geometry } of exportableRacks(comps, params)) {
      try { const m = rackMass(comp, geometry); push(comp, m, { anchor: { pointId: comp.p1.id, dx: m.offset.x, dy: m.offset.y }, approx: '齒條' }); } catch (e) { skip(comp, 'rack', String(e.message || e)); }
    }
  } catch (e) {
    for (const c of comps) if (c?.type === 'rack' && !done.has(c.id)) skip(c, 'rack', String(e.message || e));
  }
  for (const c of comps) {
    if (!c || done.has(c.id) || c.type === 'anchor') continue;
    if (c.type === 'bar' && c.barFusionRoot) continue; // 已併入合成桿
    if (c.type === 'triangle' && c.fusedWith) continue;
    skipped.push({ id: c.id, type: c.type, reason: '此類零件質量尚未計入' });
  }
  return { items, skipped };
}
