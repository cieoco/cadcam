/**
 * blocks / orthogonal-joint
 *
 * 直角安裝的 3D 列印 L 形轉接座（SDD-ORTHOGONAL-MOUNT O-D5）：純函式，不碰 DOM、不改輸入。
 * 轉接座一翼貼在宿主桿（mount.to.body，或輸出端 output.body，kind 'bar'）的面上、另一翼貼在子模組底板上；
 * 這裡只算兩邊木板要鑽的孔位（3.2 mm），STL 另由 adapter-stl.js 產生。
 */
import { memberStock } from './member-stock.js';
import { pointCoords } from './model.js';
import { orthogonalHostEdge } from './assembly.js';
import { worldToLocal } from './plate-geometry.js';

const D2R = Math.PI / 180;

// 轉接座預設尺寸（mm）：長度＝沿接合線；翼高＝每翼貼板的高度；孔徑＝M3 穿孔。
export const ADAPTER_LENGTH_MM = 20;
export const ADAPTER_FLANGE_MM = 14;
export const ADAPTER_HOLE_MM = 3.2;
export const ADAPTER_LAYER = 'ADAPTER_HOLE';
const DEFAULT_WALL_MM = 4;
const DEFAULT_HOLES_PER_FLANGE = 2;

const finitePos = v => Number.isFinite(Number(v)) && Number(v) > 0;
const r3 = v => Math.round(v * 1000) / 1000;

// 單一模組的轉接座排版；不是「直角安裝」的模組回 null。
// 宿主可以是桿（hostHoles＝桿局部 u/v）、三角板的邊或機架板外框的邊（hostHoles＝世界平面 { x, y }，
// 在邊線中點往 d 方向 (offset + s) 處、往板內 flangeHole mm；板上的孔另附板局部 u/v，板會動時孔跟著板走）。
export function adapterLayout(comps, modules, moduleId, params, { stockMm = 3 } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return null;
  const pts = pointCoords(list);
  const edge = orthogonalHostEdge(list, modList, mod.mount, pts, params);
  if (!edge) return null;
  const base = mod.base ? pts[mod.base] : null;
  if (!base) return null;
  const barLength = edge.lengthMm;
  if (!(barLength > 0)) return null;
  const bar = edge.compId ? list.find(c => c && c.id === edge.compId) : null;

  const joint = orient.joint || {};
  const wallMm = finitePos(joint.wallMm) ? Number(joint.wallMm) : DEFAULT_WALL_MM;
  const n = Number.isInteger(joint.holesPerFlange) && joint.holesPerFlange > 0 ? joint.holesPerFlange : DEFAULT_HOLES_PER_FLANGE;
  const lengthMm = ADAPTER_LENGTH_MM, flangeMm = ADAPTER_FLANGE_MM;
  const side = Number(orient.side) < 0 ? -1 : 1;
  const offsetMm = Number.isFinite(Number(orient.offsetMm)) ? Number(orient.offsetMm) : 0;   // 沿桿滑動（從桿中點起算）
  // 翼孔距接合角＝壁厚＋(翼高−壁厚)/2（翼的外露段正中央）
  const flangeHole = wallMm + (flangeMm - wallMm) / 2;
  const barWidth = bar ? memberStock(bar).widthMm : 0;
  const hostThickness = bar && finitePos(bar.stock && bar.stock.thicknessMm) ? Number(bar.stock.thicknessMm) : stockMm;
  const e = { x: Math.cos(orient.childAxisDeg * D2R), y: Math.sin(orient.childAxisDeg * D2R) };
  const f = { x: -e.y, y: e.x };
  const t = hostThickness + flangeHole;
  const ss = Array.from({ length: n }, (_, k) => lengthMm * (k + 0.5) / n);

  let hostHoles;
  if (edge.kind === 'bar') {
    hostHoles = ss.map(k => ({ u: r3(barLength / 2 + offsetMm + k), v: r3(side * (barWidth / 2 - flangeHole)) }));
  } else {
    // 板／機架：邊線已是實際外緣；孔在中點 + (offset + s)·d、往板內 flangeHole mm（−m）。
    const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    const plateRef = edge.kind === 'triangle' && bar ? [bar.p1, bar.p2].map(p => pts[p.id]) : null;
    hostHoles = ss.map(k => {
      const x = mid.x + (offsetMm + k) * edge.d.x - edge.m.x * flangeHole;
      const y = mid.y + (offsetMm + k) * edge.d.y - edge.m.y * flangeHole;
      const h = { x: r3(x), y: r3(y) };
      const uv = plateRef ? worldToLocal(plateRef, { x, y }) : null;
      if (uv) { h.u = r3(uv.u); h.v = r3(uv.v); }
      return h;
    });
  }

  return {
    moduleId,
    hostKind: edge.kind,
    hostCompId: edge.compId,
    hostPartName: edge.partName,
    childPart: `${moduleId}-frame`,
    lengthMm, wallMm, flangeMm,
    holeDiameterMm: ADAPTER_HOLE_MM,
    holesPerFlange: n,
    hostHoles,
    childHoles: ss.map(s => ({ x: r3(base.x + s * e.x + t * f.x), y: r3(base.y + s * e.y + t * f.y) }))
  };
}

// 全部直角模組的匯出附加資料：桿件孔（linkHoles）、三角板孔（plateHoles，世界座標＋板局部 u/v）、
// 世界機架板孔（worldFrameNodes，不參與外框）、子模組底板的額外節點（frameNodes）、轉接座排版清單。
export function orthogonalExportExtras(comps, modules, params, opts = {}) {
  const linkHoles = {}, plateHoles = {}, frameNodes = {}, worldFrameNodes = [], adapters = [];
  (Array.isArray(modules) ? modules : []).forEach(m => {
    const a = m && m.mount && m.mount.orient ? adapterLayout(comps, modules, m.id, params, opts) : null;
    if (!a) return;
    adapters.push(a);
    if (a.hostKind === 'bar') {
      (linkHoles[a.hostCompId] || (linkHoles[a.hostCompId] = []))
        .push(...a.hostHoles.map(h => ({ u: h.u, v: h.v, diameterMm: a.holeDiameterMm })));
    } else if (a.hostKind === 'triangle') {
      (plateHoles[a.hostCompId] || (plateHoles[a.hostCompId] = []))
        .push(...a.hostHoles.map(h => ({ x: h.x, y: h.y, u: h.u, v: h.v, diameterMm: a.holeDiameterMm })));
    } else {
      worldFrameNodes.push(...a.hostHoles.map((h, k) => ({
        id: `ADP_${m.id}_h${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER, outlineExempt: true
      })));
    }
    (frameNodes[m.id] || (frameNodes[m.id] = []))
      .push(...a.childHoles.map((h, k) => ({ id: `ADP_${m.id}_${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER })));
  });
  return { linkHoles, plateHoles, frameNodes, worldFrameNodes, adapters };
}

// 把轉接座孔節點併進模組底板節點（不改輸入）；extras 缺省或沒有該模組時原樣回傳。
export function withAdapterNodes(moduleId, nodes, extras) {
  const add = extras && extras.frameNodes && extras.frameNodes[moduleId];
  return add && add.length ? [...(nodes || []), ...add] : nodes;
}

// 把機架板宿主孔併進世界機架節點（不改輸入）；extras 缺省或沒有時原樣回傳。
export function withWorldAdapterNodes(nodes, extras) {
  const add = extras && extras.worldFrameNodes;
  return add && add.length ? [...(nodes || []), ...add] : nodes;
}
