/**
 * blocks / orthogonal-joint
 *
 * 直角安裝的 3D 列印 L 形轉接座（SDD-ORTHOGONAL-MOUNT O-D5）：純函式，不碰 DOM、不改輸入。
 * 轉接座一翼貼在宿主桿（mount.to.body，或輸出端 output.body，kind 'bar'）的面上、另一翼貼在子模組底板上；
 * 這裡只算兩邊木板要鑽的孔位（3.2 mm），STL 另由 adapter-stl.js 產生。
 */
import { memberStock } from './member-stock.js';
import { pointCoords } from './model.js';
import { orthogonalHostEdge, orthogonalFrame, hostPlateThickness, standChildHoles } from './assembly.js';
import { worldToLocal } from './plate-geometry.js';
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';

const D2R = Math.PI / 180;

// 轉接座預設尺寸（mm）：長度＝沿接合線；翼高＝每翼貼板的高度；孔徑＝M3 穿孔。
export const ADAPTER_LENGTH_MM = 20;
export const ADAPTER_FLANGE_MM = 14;
export const ADAPTER_HOLE_MM = 3.2;
export const ADAPTER_LAYER = 'ADAPTER_HOLE';
const DEFAULT_WALL_MM = 4;
const DEFAULT_HOLES_PER_FLANGE = 2;

// E1：直角接合件的種類。printed＝3D 列印 L 形轉接座（孔距轉角＝壁厚＋(翼高−壁厚)/2＝9，用螺帽）；
// bracket-m3＝現成不鏽鋼 M3 帶牙 L 角碼 13×9.5×7（厚 1.2、一腳一孔、孔心離腳端 3.5）：長腳貼宿主（孔離轉角 9.5）、
// 短腳貼子模組底板（孔離轉角 6），M3×6 穿過 3 mm 木板直接鎖進角碼螺牙，不用螺帽。每處兩片並排，各在 s＝5、15 mm。
export const JOINT_KINDS = {
  printed: { label: '3D 列印轉接座', hostHoleMm: 9, childHoleMm: 9, count: 1, threaded: false, tiltable: true },
  'bracket-m3': {
    label: 'M3 帶牙金屬角碼 13×9.5×7', widthMm: 7, thicknessMm: 1.2, longLegMm: 13, shortLegMm: 9.5,
    hostHoleMm: 9.5, childHoleMm: 6, count: 2, threaded: true, tiltable: false, screw: 'M3×6'
  }
};
export const DEFAULT_JOINT_KIND = 'printed';   // 舊存檔沒有 joint.kind 時視為 printed；新接的預設見 FABRICATION_DEFAULTS.joint.defaultKind
// 讀出 joint 的種類 id（不認得的一律視為 printed，與舊存檔相容）。
export const jointKindOf = joint => (joint && JOINT_KINDS[joint.kind] ? joint.kind : DEFAULT_JOINT_KIND);

const finitePos = v => Number.isFinite(Number(v)) && Number(v) > 0;
const r3 = v => Math.round(v * 1000) / 1000;
const trimNum = v => String(Number(Number(v).toFixed(2)));   // 13 → '13'、9.5 → '9.5'

// F1：接合件規格。printed 與 JOINT_KINDS 相同；bracket-m3 的尺寸取作品加工設定的 joint.bracket
// （孔距轉角：宿主＝長腳−孔心離末端、子模組＝短腳−孔心離末端），沒給設定時用內建預設（13×9.5×7）。
export function jointSpec(kind, jointSettings = FABRICATION_DEFAULTS.joint) {
  const k = JOINT_KINDS[kind] ? kind : DEFAULT_JOINT_KIND;
  if (k === 'printed') return JOINT_KINDS.printed;
  const b = (jointSettings && jointSettings.bracket) || FABRICATION_DEFAULTS.joint.bracket;
  const pick = key => (Number.isFinite(Number(b[key])) && Number(b[key]) > 0 ? Number(b[key]) : FABRICATION_DEFAULTS.joint.bracket[key]);
  const widthMm = pick('widthMm'), thicknessMm = pick('thicknessMm'), longLegMm = pick('longLegMm'), shortLegMm = pick('shortLegMm'), holeEndMm = pick('holeEndMm');
  return {
    ...JOINT_KINDS[k],
    label: `M3 帶牙金屬角碼 ${trimNum(longLegMm)}×${trimNum(shortLegMm)}×${trimNum(widthMm)}`,
    widthMm, thicknessMm, longLegMm, shortLegMm, holeEndMm,
    hostHoleMm: r3(longLegMm - holeEndMm), childHoleMm: r3(shortLegMm - holeEndMm)
  };
}

// D2：子模組底板上的轉接座孔（子模組平面座標）。只靠子模組的 base、orient 與宿主桿（取板厚），
// 與宿主邊的幾何無關——所以宿主是「已安裝模組的底板」時，宿主底板外框可以直接算它，不必繞回求解。
// bar＝宿主桿／三角板零件（機架板宿主傳 null）；回傳 [{ x, y }]。
export function adapterChildHoles({ base, orient, bar = null, stockMm = 3, joint: jointSettings }) {
  if (!base || !orient) return [];
  const joint = orient.joint || {};
  const kind = jointKindOf(joint);
  const bracket = kind !== 'printed';
  const wallMm = finitePos(joint.wallMm) ? Number(joint.wallMm) : DEFAULT_WALL_MM;
  const K = jointSpec(kind, jointSettings);
  const n = bracket ? K.count : (Number.isInteger(joint.holesPerFlange) && joint.holesPerFlange > 0 ? joint.holesPerFlange : DEFAULT_HOLES_PER_FLANGE);
  // 子模組端的孔離轉角：列印版＝翼孔距；角碼＝短腳孔距（預設 6，由規格算出）。
  const flangeHole = bracket ? K.childHoleMm : wallMm + (ADAPTER_FLANGE_MM - wallMm) / 2;
  const hostThickness = bar && finitePos(bar.stock && bar.stock.thicknessMm) ? Number(bar.stock.thicknessMm) : stockMm;
  const e = { x: Math.cos(orient.childAxisDeg * D2R), y: Math.sin(orient.childAxisDeg * D2R) };
  const f = { x: -e.y, y: e.x };
  const t = hostThickness + flangeHole;
  return Array.from({ length: n }, (_, k) => {
    const s = ADAPTER_LENGTH_MM * (k + 0.5) / n;
    return { x: r3(base.x + s * e.x + t * f.x), y: r3(base.y + s * e.y + t * f.y) };
  });
}

// 單一模組的轉接座排版；不是「直角安裝」的模組回 null。
// 宿主可以是桿（hostHoles＝桿局部 u/v）、三角板的邊或機架板外框的邊（hostHoles＝世界平面 { x, y }，
// 在邊線中點往 d 方向 (offset + s) 處、往板內 flangeHole mm；板上的孔另附板局部 u/v，板會動時孔跟著板走）。
export function adapterLayout(comps, modules, moduleId, params, { stockMm = 3, joint: jointSettings } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return null;
  const pts = pointCoords(list);
  // D2：宿主是已安裝模組的底板時，孔位要用底板的匯出（home）座標，所以用 home 姿態（不套目前位姿的剛體變換）。
  const edge = orthogonalHostEdge(list, modList, mod.mount, pts, params, { home: true, stockMm, joint: jointSettings });
  if (!edge) return null;
  const base = mod.base ? pts[mod.base] : null;
  if (!base && orient.edge !== 'child') return null;
  const barLength = edge.lengthMm;
  if (!(barLength > 0)) return null;
  const bar = edge.compId ? list.find(c => c && c.id === edge.compId) : null;

  const joint = orient.joint || {};
  const kind = jointKindOf(joint);
  const bracket = kind !== 'printed';
  const K = jointSpec(kind, jointSettings);
  const wallMm = finitePos(joint.wallMm) ? Number(joint.wallMm) : DEFAULT_WALL_MM;
  const n = bracket ? K.count : (Number.isInteger(joint.holesPerFlange) && joint.holesPerFlange > 0 ? joint.holesPerFlange : DEFAULT_HOLES_PER_FLANGE);
  const lengthMm = ADAPTER_LENGTH_MM, flangeMm = ADAPTER_FLANGE_MM;
  const side = Number(orient.side) < 0 ? -1 : 1;
  const offsetMm = Number.isFinite(Number(orient.offsetMm)) ? Number(orient.offsetMm) : 0;   // 沿桿滑動（從桿中點起算）
  // 列印版：翼孔距接合角＝壁厚＋(翼高−壁厚)/2（翼的外露段正中央）＝9；角碼：長腳孔（預設 9.5，宿主）、短腳孔（預設 6，子模組）。
  const flangeHole = bracket ? K.hostHoleMm : wallMm + (flangeMm - wallMm) / 2;
  const childHole = bracket ? K.childHoleMm : flangeHole;
  const barWidth = bar ? memberStock(bar).widthMm : 0;
  const ss = Array.from({ length: n }, (_, k) => lengthMm * (k + 0.5) / n);

  // D3：子模組立在宿主板面上（edge 'child'）：宿主孔在板面上、離邊 板厚＋flangeHole；壓在邊上則離邊 flangeHole（在板面的邊上）。
  const standing = orient.edge === 'child';
  const T = standing ? hostPlateThickness(list, edge, stockMm) : 0;
  const inset = standing ? T + flangeHole : flangeHole;
  let hostHoles;
  if (edge.kind === 'bar') {
    hostHoles = ss.map(k => ({ u: r3(barLength / 2 + offsetMm + k), v: r3(side * (barWidth / 2 - inset)) }));
  } else {
    // 板／機架：邊線已是實際外緣；孔在中點 + (offset + s)·d、往板內 inset mm（−m）。
    const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    const plateRef = edge.kind === 'triangle' && bar ? [bar.p1, bar.p2].map(p => pts[p.id]) : null;
    hostHoles = ss.map(k => {
      const x = mid.x + (offsetMm + k) * edge.d.x - edge.m.x * inset;
      const y = mid.y + (offsetMm + k) * edge.d.y - edge.m.y * inset;
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
    stand: orient.edge === 'child' ? { face: orient.face === -1 ? -1 : 1 } : null,   // D3：立在板面上（1＝上面、-1＝下面）
    hostModuleId: edge.frameModule || null,   // D2：宿主是已安裝模組的底板時為該模組 id，世界機架為 null
    childPart: `${moduleId}-frame`,
    kind,
    lengthMm, wallMm, flangeMm,
    holeDiameterMm: ADAPTER_HOLE_MM,
    holesPerFlange: n,
    tiltDeg: Number(orient.tiltDeg) || 0,   // D4：兩翼夾角＝90°＋tiltDeg
    hostHoles,
    childHoles: standing ? standHoles(list, modList, mod, params, edge, ss, childHole, stockMm, jointSettings) : adapterChildHoles({ base, orient, bar, stockMm, joint: jointSettings }),
    // F1：角碼外形（寬、厚、兩腳長），給 3D 與說明用；列印版沒有
    bracket: bracket ? { widthMm: K.widthMm, thicknessMm: K.thicknessMm, longLegMm: K.longLegMm, shortLegMm: K.shortLegMm } : undefined
  };
}

// D3：立在板面時子模組底板上的孔：離站立邊 flangeHole mm、沿邊位置與宿主孔對齊（frame.d 與宿主邊 d 可能反向）。
function standHoles(list, modList, mod, params, edge, ss, childHole, stockMm, jointSettings) {
  // 用 home 姿態的宿主邊求 frame 即可：孔只和 base／e／f／d 的方向有關，不隨求解位姿變。
  const frame = orthogonalFrame(list, modList, mod.id, pointCoords(list), params, { home: true, stockMm, joint: jointSettings });
  return frame ? standChildHoles(frame, edge.d, ss, childHole) : [];
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
      const hostNodes = a.hostHoles.map((h, k) => ({
        id: `ADP_${m.id}_h${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER, outlineExempt: true
      }));
      // D2：宿主是已安裝模組的底板 → 孔進該模組的底板節點（匯出座標），否則進世界機架。
      if (a.hostModuleId) (frameNodes[a.hostModuleId] || (frameNodes[a.hostModuleId] = [])).push(...hostNodes);
      else worldFrameNodes.push(...hostNodes);
    }
    (frameNodes[m.id] || (frameNodes[m.id] = []))
      .push(...a.childHoles.map((h, k) => ({
        id: `ADP_${m.id}_${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER,
        ...(a.stand ? { outlineExempt: true } : {})   // D3：站立邊就是外框的邊，孔不撐大外框
      })));
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

// F1：角碼的實體方塊（給 3D 畫）。回傳 []：模組不是直角安裝、接合件不是角碼、或找不到座標系。
// 每處兩片（count＝2，沿接合線 d 各在 s＝5、15 mm），每片兩翼各一塊薄板：
//   長腳貼宿主板面（沿 −m 從轉角往宿主板內伸 longLegMm），短腳貼子模組底板朝宿主那一面（沿 n 離開宿主面 shortLegMm）。
// 座標：宿主平面 mm，與 orthogonalFrame 同一套（origin＋s·d＋w·m＋t·n）；板厚方向的 z 以宿主板底面為 0，
// 3D 端再加上宿主本體的 z。每塊 { center, axes:[d, m, n]（單位向量）, size:{ x:沿 d, y:沿 m, z:沿 n } }。
// 宿主面：站立（D3）時板面就是 t＝0；一般安裝時 n 朝上（+z）則板面在板厚 T 處、朝下則在 0（子模組長向宿主的那一側）。
export function bracketBoxes(comps, modules, moduleId, points, params, { stockMm = 3, joint: jointSettings, asm = null } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return [];
  const kind = jointKindOf(orient.joint);
  if (kind === 'printed') return [];
  const K = jointSpec(kind, jointSettings);
  const opts = { stockMm, joint: jointSettings, asm };
  const frame = orthogonalFrame(list, modList, moduleId, points, params, opts);
  if (!frame) return [];
  const edge = orthogonalHostEdge(list, modList, mod.mount, points, params, opts);
  const standing = orient.edge === 'child';
  const T = hostPlateThickness(list, edge, stockMm);
  const tFace = standing ? 0 : (frame.n.z > 0 ? T : 0);
  const { d, m, n, origin } = frame;
  const at = (s, w, t) => ({ x: origin.x + s * d.x + w * m.x + t * n.x, y: origin.y + s * d.y + w * m.y + t * n.y, z: origin.z + s * d.z + w * m.z + t * n.z });
  const axes = [{ ...d }, { ...m }, { ...n }];
  const count = K.count;
  const out = [];
  for (let k = 0; k < count; k++) {
    const s = ADAPTER_LENGTH_MM * (k + 0.5) / count;
    // 長腳：貼宿主板面（t 從 tFace 起、厚 thicknessMm），沿 −m 從轉角伸 longLegMm。
    out.push({ center: at(s, -K.longLegMm / 2, tFace + K.thicknessMm / 2), axes, size: { x: K.widthMm, y: K.longLegMm, z: K.thicknessMm } });
    // 短腳：貼子模組底板朝宿主的那一面（w 從 −thicknessMm 到 0），沿 n 離開宿主面 shortLegMm。
    out.push({ center: at(s, -K.thicknessMm / 2, tFace + K.shortLegMm / 2), axes, size: { x: K.widthMm, y: K.thicknessMm, z: K.shortLegMm } });
  }
  return out;
}
