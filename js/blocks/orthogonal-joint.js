/**
 * blocks / orthogonal-joint
 *
 * 直角安裝的 3D 列印 L 形轉接座（SDD-ORTHOGONAL-MOUNT O-D5）：純函式，不碰 DOM、不改輸入。
 * 轉接座一翼貼在宿主桿（output.body，kind 'bar'）的面上、另一翼貼在子模組底板上；
 * 這裡只算兩邊木板要鑽的孔位（3.2 mm），STL 另由 adapter-stl.js 產生。
 */
import { memberStock } from './member-stock.js';
import { pointCoords } from './model.js';

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

// 桿長：有 lenParam 且 params 有值就用參數值（與 solver 一致），否則用靜態座標距離。
function barLengthOf(bar, pts, params) {
  const param = bar.lenParam ? Number(params && params[bar.lenParam]) : NaN;
  if (finitePos(param)) return param;
  const a = pts[bar.p1.id], b = pts[bar.p2.id];
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

// 單一模組的轉接座排版；不是「直角安裝在桿件上」的模組回 null。
export function adapterLayout(comps, modules, moduleId, params, { stockMm = 3 } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return null;
  const host = modList.find(m => m && m.id === mod.mount.to.module);
  const output = host && (host.outputs || []).find(o => o.id === mod.mount.to.output);
  if (!output || !output.body || output.body.kind !== 'bar') return null;
  const bar = list.find(c => c && c.id === output.body.id);
  if (!bar || !bar.p1 || !bar.p2) return null;
  const pts = pointCoords(list);
  const base = mod.base ? pts[mod.base] : null;
  if (!base) return null;
  const barLength = barLengthOf(bar, pts, params);
  if (!(barLength > 0)) return null;

  const joint = orient.joint || {};
  const wallMm = finitePos(joint.wallMm) ? Number(joint.wallMm) : DEFAULT_WALL_MM;
  const n = Number.isInteger(joint.holesPerFlange) && joint.holesPerFlange > 0 ? joint.holesPerFlange : DEFAULT_HOLES_PER_FLANGE;
  const lengthMm = ADAPTER_LENGTH_MM, flangeMm = ADAPTER_FLANGE_MM;
  const side = Number(orient.side) < 0 ? -1 : 1;
  // 翼孔距接合角＝壁厚＋(翼高−壁厚)/2（翼的外露段正中央）
  const flangeHole = wallMm + (flangeMm - wallMm) / 2;
  const barWidth = memberStock(bar).widthMm;
  const hostThickness = finitePos(bar.stock && bar.stock.thicknessMm) ? Number(bar.stock.thicknessMm) : stockMm;
  const e = { x: Math.cos(orient.childAxisDeg * D2R), y: Math.sin(orient.childAxisDeg * D2R) };
  const f = { x: -e.y, y: e.x };
  const t = hostThickness + flangeHole;
  const ss = Array.from({ length: n }, (_, k) => lengthMm * (k + 0.5) / n);

  return {
    moduleId,
    hostCompId: bar.id,
    childPart: `${moduleId}-frame`,
    lengthMm, wallMm, flangeMm,
    holeDiameterMm: ADAPTER_HOLE_MM,
    holesPerFlange: n,
    hostHoles: ss.map(s => ({ u: r3(barLength / 2 + s), v: r3(side * (barWidth / 2 - flangeHole)) })),
    childHoles: ss.map(s => ({ x: r3(base.x + s * e.x + t * f.x), y: r3(base.y + s * e.y + t * f.y) }))
  };
}

// 全部直角模組的匯出附加資料：桿件孔、子模組底板的額外節點、轉接座排版清單。
export function orthogonalExportExtras(comps, modules, params, opts = {}) {
  const linkHoles = {}, frameNodes = {}, adapters = [];
  (Array.isArray(modules) ? modules : []).forEach(m => {
    const a = m && m.mount && m.mount.orient ? adapterLayout(comps, modules, m.id, params, opts) : null;
    if (!a) return;
    adapters.push(a);
    (linkHoles[a.hostCompId] || (linkHoles[a.hostCompId] = []))
      .push(...a.hostHoles.map(h => ({ u: h.u, v: h.v, diameterMm: a.holeDiameterMm })));
    (frameNodes[m.id] || (frameNodes[m.id] = []))
      .push(...a.childHoles.map((h, k) => ({ id: `ADP_${m.id}_${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER })));
  });
  return { linkHoles, frameNodes, adapters };
}

// 把轉接座孔節點併進模組底板節點（不改輸入）；extras 缺省或沒有該模組時原樣回傳。
export function withAdapterNodes(moduleId, nodes, extras) {
  const add = extras && extras.frameNodes && extras.frameNodes[moduleId];
  return add && add.length ? [...(nodes || []), ...add] : nodes;
}
