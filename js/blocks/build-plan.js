/**
 * blocks / build-plan
 *
 * L5a 實體疊層與關節模型：純函式，不碰 DOM、不改輸入。
 * 回答兩件事給零件清單、組裝說明、干涉檢查用：
 *   - parts：每片會匯出的板（名稱與匯出檔名一致）在第幾層、多厚。
 *   - joints：哪些點被同一根螺絲／銷穿過，跨哪幾層、總厚多少。
 * 零件集合與 app.js 的 exportLinksDxf 一致（世界機架只含不屬於已安裝模組的零件；
 * 每個已安裝模組另有 <moduleId>-frame）。
 */
import {
  safeName, normalizeExportSettings,
  exportableLinks, exportablePlates, exportableGears, exportableRacks,
  inspectLinkExport, inspectPlateExport, inspectFrameExport,
  splitMountsByHost, hostedBarGeometry
} from './exporters.js';
import { frameConnectorNodes, motorPointIds, pointCoords, frameNodeIds, sliderMountInfo, isHiddenSliderRailPoint } from './model.js';
import { worldFrameComps, moduleFrameExports, moduleFrameNodes, moduleOfPoint, splitFrameMounts, planeOf } from './assembly.js?v=face-mount-20261007';
import { orthogonalExportExtras, withAdapterNodes, withWorldAdapterNodes, jointSpec } from './orthogonal-joint.js';
import { buildMotorMounts } from './motor-mounts.js';
import { computeBodyLayers } from '../blocks3d/scene-model.js';
import { motorTypeAt } from './motor-tools.js';
import { pointKeysFor } from './part-types.js';

const DEFAULT_STOCK_THICKNESS_MM = 3;

// ---- 五金規則（L5b）----
// 防鬆螺帽厚度：M3 尼龍防鬆螺帽約 4 mm，螺絲要比關節總厚多出這麼多才鎖得緊。
const NUT_THICKNESS_MM = 4;
// 市售 M3 螺絲標準長度（mm）；估算長度向上取到這些值。
const SCREW_LENGTHS_MM = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40];
// 能用 M3 螺絲穿過的孔徑範圍（mm）：太小穿不過、太大會晃。
const M3_HOLE_RANGE_MM = [2.9, 3.6];
// 關節類型 → 組裝說明用的中文名稱；馬達軸（motor-shaft）鎖在輪轂／舵盤上，不另外配螺絲。
const JOINT_USE_LABEL = { 'guide-pin': '導銷', 'mount-bolt': '對鎖', pivot: '樞軸' };
// 加工孔圖層 → 固定用螺絲：TT 固定孔 M3×30、MG995 耳孔 M3×10 穿透鎖螺帽；
// TT 輪轂 M3×8 鎖進輪轂（不需螺帽）；MG995 舵盤用 M2×6 自攻螺絲。
const LAYER_SCREWS = {
  TT_SCREW:          { spec: 'M3×30',       use: 'TT 馬達固定', nut: true },
  MG995_SCREW:       { spec: 'M3×10',       use: 'MG995 耳孔',  nut: true },
  TT_HUB_SCREW:      { spec: 'M3×8',        use: 'TT 輪轂',     nut: false },
  MG995_HORN_SCREW:  { spec: 'M2×6 自攻',   use: 'MG995 舵盤',  nut: false }
};

const fmtNum = v => String(Number(Number(v).toFixed(3)));
const finitePos = v => Number.isFinite(Number(v)) && Number(v) > 0;

// 群組鍵：已安裝模組（有 mount）用模組 id，其餘（根、未安裝模組、找不到的模組）＝null。
function groupKeyOf(comp, modById) {
  const mod = comp && comp.moduleId ? modById.get(comp.moduleId) : null;
  return mod && mod.mount ? mod.id : null;
}

// 外接矩形（mm，取一位小數）：outlines＝點陣列的陣列。
function boundsOf(outlines) {
  const pts = (outlines || []).flat().filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!pts.length) return { widthMm: 0, heightMm: 0 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const r = v => Math.round(v * 10) / 10;
  return { widthMm: r(Math.max(...xs) - Math.min(...xs)), heightMm: r(Math.max(...ys) - Math.min(...ys)) };
}

// 圓孔依圖層計數：{ TT_SCREW: 2, PIVOT_HOLE: 3 }
function holeLayersOf(holes) {
  const out = {};
  (holes || []).forEach(h => { const k = h.layer || 'HOLE'; out[k] = (out[k] || 0) + 1; });
  return out;
}

// 沒給 mounts 時，用 comps 的座標自行規劃馬達安裝座（與 app.js motorFrameExportMounts 同形狀）；
// 機身方向與 app 的 motorMountPatternRotDegForCenter 相同（沿用靜態座標，不看 solver）。
export function deriveMotorMounts(list) {
  const pts = pointCoords(list);
  const ids = new Set(motorPointIds(list));
  const planned = buildMotorMounts({
    motorIds: ids, groundIds: frameNodeIds(list), staticPoints: pts, comps: list, compiledSteps: [],
    sliderMountInfo: id => sliderMountInfo(list, id), isHiddenSliderRailPoint: id => isHiddenSliderRailPoint(list, id),
    motorTypeForCenter: id => motorTypeAt(list, id)
  });
  const mounts = [];
  ids.forEach(id => {
    const center = pts[id];
    if (!center) return;
    const mount = planned.get(id);
    const inputBar = list.find(c => c.type === 'bar' && c.isInput && c.p1 && c.p2 &&
      ((c.p1.id === id && c.p1.physicalMotor) || (c.p2.id === id && c.p2.physicalMotor)));
    const carrier = inputBar && inputBar.motorCarrier && list.find(c => c.type === 'bar' && c.id === inputBar.motorCarrier);
    const farId = carrier ? (carrier.p1.id === id ? carrier.p2.id : carrier.p2.id === id ? carrier.p1.id : null) : null;
    const far = farId && pts[farId];
    const visual = far ? Math.atan2(-(far.x - center.x), -(far.y - center.y)) * 180 / Math.PI : (mount ? mount.rotDeg : 0);
    mounts.push({
      kind: motorTypeAt(list, id) === 'mg995' ? 'mg995' : 'tt',
      pointId: id, frameBody: mount && mount.frameBody, center, rotDeg: visual - 90, settings: {}
    });
  });
  return mounts;
}

// 隔圈輸入正規化：[{ plane?, below, mm }] → 依（平面, below）合併（取最大 mm）、丟掉無效項。
// below＝L 表示在第 L-1 層與第 L 層之間留 mm 的間隙；plane 為 null／undefined 代表主平面，輸出時省略該欄位。
// 排序：主平面在前，其他平面依 id，再依 below。
export function normalizeSpacers(spacers) {
  const byKey = new Map();
  (Array.isArray(spacers) ? spacers : []).forEach(s => {
    if (!s || !Number.isInteger(s.below)) return;
    const mm = Number(s.mm);
    if (!Number.isFinite(mm) || mm <= 0) return;
    const plane = s.plane == null ? null : String(s.plane);
    const key = `${plane == null ? '' : plane}\u0000${s.below}`;
    const prev = byKey.get(key);
    byKey.set(key, { plane, below: s.below, mm: Math.max(prev ? prev.mm : 0, mm) });
  });
  return [...byKey.values()]
    .sort((a, b) => ((a.plane == null ? 0 : 1) - (b.plane == null ? 0 : 1)) ||
      (a.plane === b.plane ? 0 : a.plane < b.plane ? -1 : 1) || (a.below - b.below))
    .map(g => g.plane == null ? { below: g.below, mm: g.mm } : { plane: g.plane, below: g.below, mm: g.mm });
}

// 平面的顯示名稱：找得到模組就用模組名稱，否則退回平面 id。
const planeLabel = (modules, id) => { const m = (modules || []).find(x => x && x.id === id); return (m && m.name) || id; };

// 隔圈所屬平面（主平面＝null）。
const gapPlane = g => (g && g.plane != null ? g.plane : null);

export function buildPlan({ comps, modules = [], params = {}, exportSettings = {}, cnc, mounts, spacers, extras, joint } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const modById = new Map(modList.map(m => [m.id, m]));
  const stockMm = finitePos(cnc && cnc.stockThicknessMm) ? Number(cnc.stockThicknessMm) : DEFAULT_STOCK_THICKNESS_MM;
  const settings = normalizeExportSettings(exportSettings);
  // 直角安裝的轉接座孔（沒傳就依 comps／modules 自算）。
  const orthoExtras = extras || orthogonalExportExtras(list, modList, params, { stockMm, joint });
  const extraHolesOf = comp => (orthoExtras.linkHoles && orthoExtras.linkHoles[comp.id]) || [];
  const plateHolesOf = comp => (orthoExtras.plateHoles && orthoExtras.plateHoles[comp.id]) || [];   // C1：三角板上的轉接座孔
  const thicknessOf = comp => {
    const t = comp && comp.stock && comp.stock.thicknessMm;
    return finitePos(t) ? Number(t) : stockMm;
  };

  // ---- 1. 零件清單（與匯出檔一一對應）----
  const parts = [];
  const partPoints = new Map();   // part.name -> [{ id, holeDiameterMm, kind?, guide? }]
  const addPart = (part, points) => { parts.push(part); partPoints.set(part.name, points); };
  const partByComp = new Map();   // comp.id -> part
  const partsOfGroup = new Map(); // groupKey -> parts[]
  const pushGroup = (key, part) => {
    if (!partsOfGroup.has(key)) partsOfGroup.set(key, []);
    partsOfGroup.get(key).push(part);
  };
  const frameHole = settings.frameHoleDiameterMm;

  // 馬達安裝座：有宿主桿／板的特徵切進該零件，其餘依所屬群組進世界機架或模組機架（同 app 匯出）。
  const exp = { ...exportSettings };
  const allMounts = Array.isArray(mounts) ? mounts : deriveMotorMounts(list);
  const { hosted, free } = splitMountsByHost(list, allMounts);
  const freeSplit = splitFrameMounts(free, list, modList);
  const geomInfo = g => ({
    ...boundsOf(g ? (g.outlines || (g.outline ? [g.outline] : [])) : []),
    holeLayers: holeLayersOf(g && g.holes)
  });
  const seedPts = pointCoords(list);

  // 機架板：世界機架（不屬於已安裝模組的零件）與每個已安裝模組的 <moduleId>-frame。
  const worldNodes = frameConnectorNodes(worldFrameComps(list, modList));
  if (worldNodes.length) {
    // C1：直角安裝在機架板邊上的轉接座孔（不參與外框、不列入關節點）。
    const worldCut = withWorldAdapterNodes(worldNodes, orthoExtras);
    const part = { name: 'frame', kind: 'frame', compId: null, moduleId: null, plane: null, layer: 0, thicknessMm: stockMm, ...geomInfo(inspectFrameExport(worldCut, exp, freeSplit.world)) };
    addPart(part, worldNodes.map(n => ({ id: n.id, holeDiameterMm: finitePos(n.holeDiameterMm) ? Number(n.holeDiameterMm) : frameHole, mountBolt: n.holeLayer === 'MOUNT_BOLT' })));
    pushGroup(null, part);
  }
  moduleFrameExports(list, modList, params).forEach(entry => {
    const baseNodes = moduleFrameNodes(entry, frameConnectorNodes(entry.comps));
    if (!baseNodes.length) return;
    const nodes = withAdapterNodes(entry.moduleId, baseNodes, orthoExtras);
    const part = { name: entry.fileBase, kind: 'frame', compId: null, moduleId: entry.moduleId, plane: planeOf(list, modList, entry.moduleId), layer: 0, thicknessMm: stockMm, ...geomInfo(inspectFrameExport(nodes, exp, freeSplit.byModule[entry.moduleId] || [])) };
    // 轉接座孔只是板上的孔，不是關節：不列入關節點。
    addPart(part, nodes.filter(n => n.holeLayer !== 'ADAPTER_HOLE').map(n => ({ id: n.id, holeDiameterMm: finitePos(n.holeDiameterMm) ? Number(n.holeDiameterMm) : frameHole, mountBolt: n.holeLayer === 'MOUNT_BOLT' })));
    pushGroup(entry.moduleId, part);
  });

  const memberPart = (comp, kind, geometry) => ({
    name: safeName(comp.id), kind, compId: comp.id, moduleId: comp.moduleId || null, plane: planeOf(list, modList, comp), layer: 0, thicknessMm: thicknessOf(comp), ...geomInfo(geometry)
  });
  const bodies = new Map();       // groupKey -> [{ part, joints, lift }]（齒輪先、桿件、板件）
  const addBody = (key, part, joints, comp) => {
    if (!bodies.has(key)) bodies.set(key, []);
    bodies.get(key).push({ part, joints, lift: Number(comp.zlift) || 0 });
  };
  const pointsOf = (comp, keys, hole) => keys.filter(k => comp[k] && comp[k].id).map(k => ({ id: comp[k].id, holeDiameterMm: hole }));
  const linkHole = settings.holeDiameterMm;

  const gears = exportableGears(list, params, exportSettings);
  const links = exportableLinks(list, seedPts, params);
  const plates = exportablePlates(list, seedPts);
  const racks = exportableRacks(list, params);

  gears.forEach(({ comp, geometry }) => {
    const part = memberPart(comp, 'gear', geometry);
    const pinHole = finitePos(comp.pinHoleDiameter) ? Number(comp.pinHoleDiameter) : linkHole;
    addPart(part, [{ id: comp.p1.id, holeDiameterMm: linkHole }, { id: comp.p2.id, holeDiameterMm: pinHole }]);
    partByComp.set(comp.id, part);
    const key = groupKeyOf(comp, modById);
    pushGroup(key, part);
    addBody(key, part, [comp.p1.id, comp.p2.id], comp);
  });
  links.forEach(({ comp, length }) => {
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, seedPts, exp, hosted.get(comp.id), extraHolesOf(comp)) : null;
    const part = memberPart(comp, 'member', hostGeometry || inspectLinkExport(comp, length, exp, extraHolesOf(comp)));
    addPart(part, pointsOf(comp, ['p1', 'p2'], linkHole));
    partByComp.set(comp.id, part);
    const key = groupKeyOf(comp, modById);
    pushGroup(key, part);
    addBody(key, part, [comp.p1.id, comp.p2.id], comp);
  });
  plates.forEach(({ comp, points }) => {
    const part = memberPart(comp, 'member', inspectPlateExport(comp, points, exp, hosted.get(comp.id), plateHolesOf(comp)));
    addPart(part, pointsOf(comp, ['p1', 'p2', 'p3'], linkHole));
    partByComp.set(comp.id, part);
    const key = groupKeyOf(comp, modById);
    pushGroup(key, part);
    addBody(key, part, [comp.p1.id, comp.p2.id, comp.p3.id], comp);
  });
  racks.forEach(({ comp, geometry }) => {
    const part = memberPart(comp, 'rack', geometry);
    const pts = (comp.holes || []).filter(h => h && h.id).map(h => ({ id: h.id, holeDiameterMm: finitePos(h.diameter) ? Number(h.diameter) : null }));
    // 導銷：framePins 穿過齒條的長槽（槽不是孔，所以孔徑留給機架節點記錄）。
    (Array.isArray(comp.framePins) ? comp.framePins : []).forEach(id => {
      if (id) pts.push({ id, holeDiameterMm: null, guide: true });
    });
    addPart(part, pts);
    partByComp.set(comp.id, part);
    pushGroup(groupKeyOf(comp, modById), part);
  });

  // ---- 2. 疊層 ----
  // 群組起始層 B：根＝0；已安裝模組＝宿主輸出端 body 所在零件的層＋1（宿主先算）。
  const baseOf = new Map();
  const layersDone = new Set();
  const layoutGroup = (key, stack = new Set()) => {
    if (layersDone.has(key)) return;
    if (stack.has(key)) { baseOf.set(key, 0); layersDone.add(key); return; }   // 安裝鏈成環：保底
    stack.add(key);
    let B = 0;
    if (key !== null && (modById.get(key).mount.orient || modById.get(key).mount.face)) {
      B = 0;   // 直角安裝：子模組在自己的平面疊層，從第 0 層起（O-D4）
    } else if (key !== null) {
      const mod = modById.get(key);
      const hostKey = groupKeyOf({ moduleId: mod.mount.to.module }, modById);
      layoutGroup(hostKey, stack);
      const host = modById.get(mod.mount.to.module);
      const output = host && (host.outputs || []).find(o => o.id === mod.mount.to.output);
      const body = output && output.body;
      let bodyPart = body && body.id ? partByComp.get(body.id) : null;
      if (!bodyPart && output && output.at) {
        // kind:'points' 沒有零件 id：取宿主群組裡含這個輸出點的零件中最高層。
        const hit = (partsOfGroup.get(hostKey) || []).filter(p => (partPoints.get(p.name) || []).some(q => q.id === output.at) && p.kind !== 'frame');
        bodyPart = hit.sort((a, b) => b.layer - a.layer)[0] || null;
      }
      B = (bodyPart ? bodyPart.layer : baseOf.get(hostKey) || 0) + 1;
    }
    baseOf.set(key, B);
    // 機架板＝B
    (partsOfGroup.get(key) || []).filter(p => p.kind === 'frame').forEach(p => { p.layer = B; });
    // 齒輪與桿件／板件：剛體疊層，正規化成最小值 0 後放在機架板上一層起。
    const groupBodies = bodies.get(key) || [];
    if (groupBodies.length) {
      const groundIds = new Set();
      list.forEach(c => {
        if (groupKeyOf(c, modById) !== key) return;
        pointKeysFor(c).forEach(k => {
          const p = c[k];
          if (p && p.id && (p.type === 'fixed' || p.type === 'motor')) groundIds.add(p.id);
        });
      });
      const raw = computeBodyLayers(groupBodies.map(b => ({ joints: b.joints, lift: b.lift })), groundIds);
      const min = Math.min(...raw);
      const max = Math.max(...raw);
      const flipped = !!(key !== null && modById.get(key).mount.flip);
      if (flipped) {
        // L7 翻面：疊層鏡射——零件先、底板最外層（B＋(max-min)＋1），MG995 機身因此朝外。
        groupBodies.forEach((b, i) => { b.part.layer = B + (max - raw[i]); });
        (partsOfGroup.get(key) || []).filter(p => p.kind === 'frame').forEach(p => { p.layer = B + (max - min) + 1; });
      } else {
        groupBodies.forEach((b, i) => { b.part.layer = B + 1 + (raw[i] - min); });
      }
    }
    // 齒條：與帶動它的小齒輪同層（嚙合同平面）；沒有 pinion 就 B＋1。
    list.forEach(c => {
      if (c.type !== 'rack' || !partByComp.has(c.id) || groupKeyOf(c, modById) !== key) return;
      const pinionPart = c.pinion ? partByComp.get(c.pinion) : null;
      partByComp.get(c.id).layer = pinionPart ? pinionPart.layer : B + 1;
    });
    stack.delete(key);
    layersDone.add(key);
  };
  [null, ...modList.filter(m => m && m.mount).map(m => m.id)].forEach(k => layoutGroup(k));

  // ---- 3. 關節 ----
  // 只合併同一平面內的點（不同平面的零件不會穿過同一根螺絲）：鍵＝「平面\0點 id」。
  const byId = new Map();   // 平面＋點 id -> [{ part, info }]
  parts.forEach(part => {
    const seen = new Set();
    (partPoints.get(part.name) || []).forEach(info => {
      if (!info.id || seen.has(info.id)) return;
      seen.add(info.id);
      const key = `${part.plane == null ? '' : part.plane}\u0000${info.id}`;
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push({ part, info });
    });
  });
  const motorIds = new Set(motorPointIds(list));
  list.forEach(c => { if (c && c.type === 'bar' && c.motorMount && c.motorMount.center) motorIds.add(c.motorMount.center); });

  // 每層厚度＝該層零件最大厚度；空層用墊片（CNC 板厚）。
  // 每個平面各自一條疊層軸（O-D4）：鍵＝「平面:層」。
  const layerThickness = new Map();
  const lk = (plane, l) => `${plane == null ? '' : plane}:${l}`;
  parts.forEach(p => layerThickness.set(lk(p.plane, p.layer), Math.max(layerThickness.get(lk(p.plane, p.layer)) || 0, p.thicknessMm)));
  const thickAt = (plane, l) => layerThickness.get(lk(plane, l)) || stockMm;
  const r3 = v => Math.round(v * 1000) / 1000;
  const spanOf = (plane, lo, hi) => {
    let sum = 0;
    for (let l = lo; l <= hi; l++) sum += thickAt(plane, l);
    return r3(sum);
  };
  // 隔圈：層與層之間額外留的間隙（mm）。每片板的 zMm＝底面高度＝下面各層厚度＋跨過的隔圈。
  const gaps = normalizeSpacers(spacers);
  parts.forEach(p => {
    const minLayer = Math.min(...parts.filter(q => q.plane === p.plane).map(q => q.layer));
    let z = 0;
    for (let l = minLayer; l < p.layer; l++) z += thickAt(p.plane, l);
    gaps.forEach(g => { if (gapPlane(g) === (p.plane == null ? null : p.plane) && g.below > minLayer && g.below <= p.layer) z += g.mm; });
    p.zMm = r3(z);
  });

  // L7 隔柱：螺絲兩端之間、沒有這個關節任何零件的層（中間空著）要用隔柱撐住。
  // 一段空層的隔柱長度＝空層厚度＋落在那段空隙裡的隔圈（隔圈併進隔柱，不另外列隔圈）。
  const standoffOf = (plane, lo, hi, jointLayers) => {
    const has = new Set(jointLayers);
    let sum = 0;
    const absorbed = new Set();
    let prev = lo;
    for (let l = lo + 1; l <= hi; l++) {
      if (!has.has(l)) continue;
      if (l - prev > 1) {
        for (let k = prev + 1; k < l; k++) sum += thickAt(plane, k);
        gaps.forEach(g => { if (gapPlane(g) === plane && g.below > prev && g.below <= l) { sum += g.mm; absorbed.add(g.below); } });
      }
      prev = l;
    }
    return { mm: r3(sum), absorbed };
  };
  const joints = [];
  byId.forEach((entries, key) => {
    if (entries.length < 2) return;
    const id = key.slice(key.indexOf('\u0000') + 1);
    const plane = entries[0].part.plane == null ? null : entries[0].part.plane;
    const layers = entries.map(e => e.part.layer);
    const lo = Math.min(...layers), hi = Math.max(...layers);
    let kind = 'pivot';
    if (entries.some(e => e.info.guide)) kind = 'guide-pin';
    else if (entries.some(e => e.info.mountBolt)) kind = 'mount-bolt';
    else if (motorIds.has(id)) kind = 'motor-shaft';
    const hole = entries.map(e => e.info.holeDiameterMm).find(v => finitePos(v));
    const planeGaps = gaps.filter(g => gapPlane(g) === plane);
    const standoff = standoffOf(plane, lo, hi, layers);
    const crossed = planeGaps.filter(g => g.below > lo && g.below <= hi && !standoff.absorbed.has(g.below)).map(g => ({ ...g }));
    const absorbedMm = planeGaps.filter(g => standoff.absorbed.has(g.below)).reduce((s, g) => s + g.mm, 0);
    joints.push({
      id,
      kind,
      plane,
      parts: entries.map(e => e.part.name),
      layers: [lo, hi],
      holeDiameterMm: hole === undefined ? null : Number(hole),
      spanMm: r3(spanOf(plane, lo, hi) + crossed.reduce((s, g) => s + g.mm, 0) + absorbedMm),
      standoffMm: standoff.mm,
      spacers: crossed
    });
  });
  joints.sort((a, b) => (a.layers[0] - b.layers[0]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 直角轉接座：每個直角模組一個關節，連宿主桿與子模組底板（STL 另外列印；孔已切進兩片板）。
  (orthoExtras.adapters || []).forEach(a => {
    const hostPart = a.hostCompId ? partByComp.get(a.hostCompId) : parts.find(p => p.name === a.hostPartName);
    const childPart = parts.find(p => p.name === a.childPart);
    if (!hostPart || !childPart) return;
    const spec = jointSpec(a.kind || 'printed', joint);   // F1：角碼規格取作品的加工設定
    const bracketKind = !!a.kind && a.kind !== 'printed';
    joints.push({
      id: `ADP-${a.moduleId}`,
      kind: 'adapter',
      plane: null,
      parts: [hostPart.name, childPart.name],
      layers: [hostPart.layer, childPart.layer],   // 兩個平面各自的層號，僅供參考
      holeDiameterMm: a.holeDiameterMm,
      // E1：角碼的螺絲只穿過木板、鎖進角碼厚 1.2 mm 的螺牙；列印版穿過板厚＋轉接座壁厚。
      jointKind: a.kind || 'printed',
      spanMm: r3(Math.max(hostPart.thicknessMm, childPart.thicknessMm) + (bracketKind ? spec.thicknessMm : a.wallMm)),
      // F1：角碼的名稱與尺寸存在關節上，五金清單／製作包不必再查設定。
      ...(bracketKind ? {
        jointLabel: spec.label, thicknessMm: spec.thicknessMm, widthMm: spec.widthMm, longLegMm: spec.longLegMm,
        shortLegMm: spec.shortLegMm, bracketCount: spec.count
      } : {}),
      standoffMm: 0,
      spacers: [],
      holesPerFlange: a.holesPerFlange,
      ...(a.tiltDeg ? { tiltDeg: a.tiltDeg } : {}),   // D4：傾斜角（兩翼夾角＝90°＋tiltDeg）
      ...(a.stand ? { stand: { face: a.stand.face } } : {})   // D3：子模組立在宿主板面上
    });
  });

  // ---- 4. 馬達 ----
  const motors = [...motorIds].map(centerId => {
    const m = moduleOfPoint(list, centerId);
    const key = m != null ? groupKeyOf({ moduleId: m }, modById) : null;
    const plateName = key === null ? 'frame' : `${key}-frame`;
    return { type: motorTypeAt(list, centerId), centerId, plate: partPoints.has(plateName) ? plateName : null };
  });

  return { parts, joints, motors, gaps };
}

// ---- 五金清單 ----
// 回傳 [{ spec, qty, note }]：M3 螺絲（依關節總厚估長度）、孔圖層對應的固定螺絲、
// 防鬆螺帽（穿透式 M3 螺絲各一顆）、馬達。同規格合併成一列，note 寫用途明細。
// D4：傾斜的轉接座說明，例如「轉接座兩翼夾角 120°（傾斜 30°）」；兩翼夾角＝90°＋傾斜角。
export function bracketAngleText(tiltDeg) {
  const t = Number(tiltDeg) || 0;
  return `轉接座兩翼夾角 ${90 + t}°（傾斜 ${t}°）`;
}

const isBracketJoint = j => !!j && j.jointKind === 'bracket-m3';
// F1：關節上存的角碼名稱與尺寸；舊計畫（沒有這些欄位）退回內建預設規格。
const bracketOf = j => {
  const d = jointSpec('bracket-m3');
  const pick = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  return {
    label: j && j.jointLabel ? j.jointLabel : d.label,
    count: pick(j && j.bracketCount, d.count),
    longLegMm: pick(j && j.longLegMm, d.longLegMm),
    shortLegMm: pick(j && j.shortLegMm, d.shortLegMm)
  };
};
// 直角轉接座的螺絲：穿過「板厚＋轉接座壁厚」再加防鬆螺帽；孔徑固定 3.2，一律是 M3。
export function adapterScrewSpec(joint) {
  if (!joint || joint.kind !== 'adapter') return null;
  // E1：角碼不用螺帽，螺絲穿過板（spanMm 已含角碼 1.2 mm 螺牙厚）後鎖進螺牙；一般板厚 3 mm → M3×6。
  if (isBracketJoint(joint)) {
    const need = Number(joint.spanMm);
    return `M3×${SCREW_LENGTHS_MM.find(l => l >= need) || Math.ceil(need)}`;
  }
  const need = Number(joint.spanMm) + NUT_THICKNESS_MM;
  return `M3×${SCREW_LENGTHS_MM.find(l => l >= need) || Math.ceil(need)}`;
}

export function jointScrewSpec(joint) {
  if (!joint || !JOINT_USE_LABEL[joint.kind]) return null;
  const d = Number(joint.holeDiameterMm);
  if (!Number.isFinite(d) || d < M3_HOLE_RANGE_MM[0] || d > M3_HOLE_RANGE_MM[1]) return null;
  const need = Number(joint.spanMm) + NUT_THICKNESS_MM;
  const len = SCREW_LENGTHS_MM.find(l => l >= need) || Math.ceil(need);
  return `M3×${len}`;
}

const USE_ORDER = ['導銷', '對鎖', '樞軸', '轉接座', '角碼', 'TT 馬達固定', 'MG995 耳孔', 'TT 輪轂', 'MG995 舵盤'];

export function hardwareList(plan, { modules = [] } = {}) {
  const joints = (plan && plan.joints) || [];
  const parts = (plan && plan.parts) || [];
  const motors = (plan && plan.motors) || [];
  const screws = new Map();   // spec -> { qty, uses: Map }
  let nuts = 0;
  const addScrew = (spec, use, n, nut) => {
    if (!screws.has(spec)) screws.set(spec, { qty: 0, uses: new Map() });
    const row = screws.get(spec);
    row.qty += n;
    row.uses.set(use, (row.uses.get(use) || 0) + n);
    if (nut) nuts += n;
  };
  const spacerRows = new Map();   // mm -> { qty, belows:Map(key -> {plane, below}) }（只算有螺絲的關節；馬達軸不算）
  const standoffRows = new Map(); // mm -> qty（L7 隔柱：螺絲中間沒有板的地方）
  let adapters = 0;
  const brackets = new Map();   // F1：角碼名稱（含尺寸）→ 片數
  const tiltNotes = [];   // D4：傾斜的轉接座
  joints.forEach(j => {
    if (j.kind === 'adapter' && isBracketJoint(j)) {
      // E1：每處兩片角碼、每片一顆 M3×6 穿過木板，宿主與子模組各 2 顆＝4 顆；直接鎖進螺牙，不用螺帽。
      const K = bracketOf(j);
      brackets.set(K.label, (brackets.get(K.label) || 0) + K.count);
      addScrew(adapterScrewSpec(j), '角碼', 2 * K.count, false);
      return;
    }
    if (j.kind === 'adapter') {
      // 每個轉接座兩翼各 holesPerFlange 顆 M3，都穿透鎖防鬆螺帽。
      adapters += 1;
      if (Number(j.tiltDeg)) tiltNotes.push(`${j.id.replace(/^ADP-/, '')}：${bracketAngleText(j.tiltDeg)}`);
      addScrew(adapterScrewSpec(j), '轉接座', 2 * (Number(j.holesPerFlange) || 2), true);
      return;
    }
    const spec = jointScrewSpec(j);
    if (!spec) return;
    addScrew(spec, JOINT_USE_LABEL[j.kind], 1, true);
    if (Number(j.standoffMm) > 0) standoffRows.set(j.standoffMm, (standoffRows.get(j.standoffMm) || 0) + 1);
    (j.spacers || []).forEach(g => {
      if (!spacerRows.has(g.mm)) spacerRows.set(g.mm, { qty: 0, belows: new Map() });
      const row = spacerRows.get(g.mm);
      const gp = gapPlane(g);
      row.qty += 1; row.belows.set(`${gp == null ? '' : gp}\u0000${g.below}`, { plane: gp, below: g.below });
    });
  });
  parts.forEach(p => {
    Object.keys(p.holeLayers || {}).forEach(layer => {
      const rule = LAYER_SCREWS[layer];
      if (rule) addScrew(rule.spec, rule.use, p.holeLayers[layer], rule.nut);
    });
  });
  const lenOf = spec => Number((/×(\d+)/.exec(spec) || [])[1]) || 0;
  const specs = [...screws.keys()].sort((a, b) => {
    const ma = a.startsWith('M3') ? 0 : 1, mb = b.startsWith('M3') ? 0 : 1;
    return (ma - mb) || (lenOf(a) - lenOf(b));
  });
  const rows = specs.map(spec => {
    const row = screws.get(spec);
    const note = [...row.uses.entries()]
      .sort((a, b) => USE_ORDER.indexOf(a[0]) - USE_ORDER.indexOf(b[0]))
      .map(([use, n]) => `${use} ${n}`).join('、');
    return { spec, qty: row.qty, note };
  });
  [...spacerRows.entries()].sort((a, b) => a[0] - b[0]).forEach(([mm, row]) => {
    const between = [...row.belows.values()]
      .sort((a, b) => ((a.plane == null ? 0 : 1) - (b.plane == null ? 0 : 1)) || (a.plane === b.plane ? 0 : a.plane < b.plane ? -1 : 1) || (a.below - b.below))
      .map(b => `${b.plane == null ? '' : planeLabel(modules, b.plane) + '平面：'}第 ${b.below - 1}、${b.below} 層之間`).join('；');
    rows.push({ spec: `M3 隔圈 ${fmtNum(mm)} mm`, qty: row.qty, note: `套在螺絲上，墊在${between}` });
  });
  [...standoffRows.entries()].sort((a, b) => a[0] - b[0]).forEach(([mm, qty]) => {
    rows.push({ spec: `M3 隔柱 ${fmtNum(mm)} mm`, qty, note: '對鎖螺絲中間沒有板的地方用隔柱撐住' });
  });
  if (adapters > 0) rows.push({ spec: '3D 列印轉接座', qty: adapters, note: `L 形，STL 另外下載列印${tiltNotes.length ? '；' + tiltNotes.join('；') : ''}` });
  brackets.forEach((qty, label) => rows.push({ spec: label, qty, note: '直角接合，每處兩片' }));
  if (nuts > 0) rows.push({ spec: 'M3 防鬆螺帽', qty: nuts, note: '穿透式 M3 螺絲各一顆（鎖進輪轂的 M3×8 不需要）' });
  const ttCount = motors.filter(m => m.type === 'tt').length;
  const servoCount = motors.filter(m => m.type === 'mg995').length;
  if (ttCount) rows.push({ spec: 'TT 減速馬達', qty: ttCount, note: '動力來源，裝在機架板背面' });
  if (servoCount) rows.push({ spec: 'MG995 伺服', qty: servoCount, note: '動力來源，從機架板槽穿入' });
  return rows;
}

// ---- 製作包 HTML ----
const escHtml = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const KIND_LABEL = { frame: '機架板', gear: '齒輪', rack: '齒條', member: '桿件／板件' };

export function buildPackHtml(plan, { title = '機構作品', cnc, warnings = [], interference = [], suggestions = [], modules = [] } = {}) {
  warnings = [...warnings, ...modules.filter(m => m?.mount?.face).map(m => `六面接合 ${m.name || m.id}：擺放姿態已保存；轉接件、配對固定孔與跨面干涉尚未驗證，不能直接依此製造組立。`)];
  const parts = (plan && plan.parts) || [];
  const joints = (plan && plan.joints) || [];
  const motors = (plan && plan.motors) || [];
  const gaps = (plan && plan.gaps) || [];
  const stock = finitePos(cnc && cnc.stockThicknessMm) ? Number(cnc.stockThicknessMm) : DEFAULT_STOCK_THICKNESS_MM;
  const tool = finitePos(cnc && cnc.toolDiameterMm) ? fmtNum(cnc.toolDiameterMm) : '未設定';
  const e = escHtml;
  const date = new Date().toISOString().slice(0, 10);
  const partsSorted = [...parts].sort((a, b) => (a.layer - b.layer) || (a.name < b.name ? -1 : 1));
  const partRows = partsSorted.map(p => `<tr><td>${p.layer}</td><td>${e(p.name)}.dxf</td><td>${e(KIND_LABEL[p.kind] || p.kind)}</td><td>${fmtNum(p.widthMm || 0)} × ${fmtNum(p.heightMm || 0)} mm</td><td>${fmtNum(p.thicknessMm)} mm</td></tr>`).join('');
  const hw = hardwareList(plan, { modules });
  const hwRows = hw.map(r => `<tr><td>${e(r.spec)}</td><td>${r.qty}</td><td>${e(r.note)}</td></tr>`).join('');

  // 組裝步驟依平面分組：主平面照舊；每個直角子模組平面另起一段，標題寫子模組名稱。
  const stepsOfPlane = plane => {
    const planeParts = parts.filter(p => (p.plane || null) === plane);
    const planeJoints = joints.filter(j => j.kind !== 'adapter' && (j.plane || null) === plane);
    const layers = [...new Set(planeParts.map(p => p.layer))].sort((a, b) => a - b);
    return layers.map(n => {
      const here = planeParts.filter(p => p.layer === n);
      const items = [`<li>放上：${here.map(p => e(p.name)).join('、')}。</li>`];
      motors.forEach(m => {
        const plate = here.find(p => p.name === m.plate);
        if (!plate) return;
        items.push(m.type === 'mg995'
          ? `<li>安裝 MG995 伺服（${e(m.centerId)}）：從 ${e(plate.name)} 的槽穿入，用 M3 螺絲鎖耳孔。</li>`
          : `<li>安裝 TT 馬達（${e(m.centerId)}）：裝在 ${e(plate.name)} 背面，用 M3×30 螺絲鎖固定孔。</li>`);
      });
      planeJoints.filter(j => j.layers[1] === n && j.kind !== 'motor-shaft').forEach(j => {
        const spec = jointScrewSpec(j);
        const through = j.parts.map(e).join('、');
        const how = j.kind === 'guide-pin' ? '導銷：不要鎖死，齒條要能滑動。'
          : j.kind === 'mount-bolt' ? '對鎖：鎖緊，把兩片固定在一起。'
          : '樞軸：防鬆螺帽鎖到不晃但可轉動。';
        const passSp = (j.spacers || []).length
          ? `中間在${j.spacers.map(g => `${g.plane != null ? e(planeName(g.plane)) + '平面' : ''}第 ${g.below - 1}、${g.below} 層之間套 ${fmtNum(g.mm)} mm 隔圈`).join('、')}。` : '';
        const layerSet = new Set(planeParts.filter(p => j.parts.includes(p.name)).map(p => p.layer));
        const emptyLayers = [];
        for (let l = j.layers[0] + 1; l < j.layers[1]; l++) if (!layerSet.has(l)) emptyLayers.push(l);
        const passSt = Number(j.standoffMm) > 0 && emptyLayers.length
          ? `中間套 ${fmtNum(j.standoffMm)} mm 隔柱撐住（第 ${emptyLayers[0]}～${emptyLayers[emptyLayers.length - 1]} 層沒有板）。` : '';
        items.push(`<li>${spec ? e(spec) : '螺絲（孔徑不是 M3，請自行選配）'} 穿過 ${through}（關節 ${e(j.id)}，第 ${j.layers[0]}～${j.layers[1]} 層）。${passSp}${passSt}${how}</li>`);
      });
      return `<section class="step"><h3>第 ${n} 層：${here.map(p => e(KIND_LABEL[p.kind] || p.kind)).filter((v, i, a) => a.indexOf(v) === i).join('、')}</h3><ol>${items.join('')}</ol></section>`;
    }).join('');
  };
  const planeIds = [...new Set(parts.map(p => p.plane || null).filter(v => v !== null))];
  const planeName = id => planeLabel(modules, id);
  const steps = stepsOfPlane(null) + planeIds.map(id =>
    `<h3 class="plane">${e(planeName(id))}（${e(id)}，直角面）：由第 0 層往外逐層組裝</h3>${stepsOfPlane(id)}`).join('');
  // 直角組裝：3D 列印 L 形轉接座把兩個平面接成 90°。
  const adapterJoints = joints.filter(j => j.kind === 'adapter');
  const anyPrinted = adapterJoints.some(j => !isBracketJoint(j));
  const anyBracket = adapterJoints.some(isBracketJoint);
  const orthoSection = adapterJoints.length
    ? `<h2>直角組裝</h2>
<p class="muted">兩個平面各自疊層組好後，用${anyBracket && anyPrinted ? ' M3 帶牙金屬角碼或 3D 列印的轉接座' : anyBracket ? ' M3 帶牙金屬角碼' : ' 3D 列印的轉接座'}把它們接成 90°。</p>
${adapterJoints.map(j => {
    const spec = adapterScrewSpec(j);
    const n = Number(j.holesPerFlange) || 2;
    const [hostName, childName] = j.parts;
    if (isBracketJoint(j)) {
      const K = bracketOf(j);
      return `<section class="step"><h3>角碼 ${e(j.id)}：${e(hostName)} ⟂ ${e(childName)}</h3><ol>
${j.stand ? `<li>子模組底板 ${e(childName)} 立在 ${e(hostName)} 的板面上（${j.stand.face === -1 ? '下面' : '上面'}），正面貼齊邊緣，板子與板面成 90°。</li>\n` : ''}<li>準備 ${K.count} 片 ${e(K.label)}，並排放在接合線上（兩片中心相距 10 mm，對準木板上的 ADAPTER_HOLE 孔）。</li>
<li>長腳（${K.longLegMm} mm）貼在宿主 ${e(hostName)} 上，用 ${K.count} 顆 ${e(spec)} 從木板這一面穿過 3.2 mm 孔，直接鎖進角碼的螺牙，不用螺帽。</li>
<li>短腳（${K.shortLegMm} mm）貼在子模組底板 ${e(childName)} 上，同樣用 ${K.count} 顆 ${e(spec)} 穿過底板鎖進螺牙。</li>
<li>注意：螺牙只有 1.2 mm 厚，不要鎖太緊（轉到貼平就停）。</li>
<li>確認子模組與宿主成 90°（子模組的板面垂直於宿主的板面），再開始轉動測試。</li>
</ol></section>`;
    }
    return `<section class="step"><h3>轉接座 ${e(j.id)}：${e(hostName)} ⟂ ${e(childName)}</h3><ol>
<li>用 3D 印表機印出轉接座（下載 STL），填充約 100%，孔徑 3.2 mm 不縮小；L 形兩翼各 ${n} 個 M3 穿孔。${j.tiltDeg ? e(bracketAngleText(j.tiltDeg)) + '。' : ''}</li>
${j.stand ? `<li>子模組底板 ${e(childName)} 立在 ${e(hostName)} 的板面上（${j.stand.face === -1 ? '下面' : '上面'}），正面貼齊邊緣，板子與板面成 90°。</li>\n` : ''}<li>翼 A 貼在宿主桿 ${e(hostName)} 上，用 ${n} 顆 ${e(spec)} 穿過桿與翼 A，鎖防鬆螺帽。</li>
<li>翼 B 貼在子模組底板 ${e(childName)} 上，用 ${n} 顆 ${e(spec)} 穿過底板與翼 B，鎖防鬆螺帽。</li>
<li>${j.tiltDeg ? `確認子模組與宿主桿的夾角為 ${90 + Number(j.tiltDeg)}°（傾斜 ${j.tiltDeg}°，${j.tiltDeg > 0 ? '往外打開' : '往內合起'}）` : '確認子模組與宿主桿成 90°（子模組的板面垂直於宿主的板面）'}，再開始轉動測試。</li>
</ol></section>`;
  }).join('')}
` : '';
  const motorShafts = joints.filter(j => j.kind === 'motor-shaft');
  const shaftNote = motorShafts.length
    ? `<p class="muted">馬達軸（${motorShafts.map(j => e(j.id)).join('、')}）鎖在輪轂或舵盤上，不另配 M3 螺絲。</p>` : '';
  const shaftSpacer = motorShafts.filter(j => (j.spacers || []).length)
    .map(j => `<li>馬達軸 ${e(j.id)} 穿過隔圈層：輪轂／舵盤要墊高 ${fmtNum(j.spacers.reduce((s, g) => s + g.mm, 0))} mm，齒輪才會在正確高度。</li>`).join('');
  const gapSection = gaps.length
    ? `<h2>層間隔圈</h2>
<ul>${gaps.map(g => `<li>${g.plane != null ? e(planeName(g.plane)) + '平面：' : ''}第 ${g.below - 1}、${g.below} 層之間留 ${fmtNum(g.mm)} mm（用 M3 隔圈或墊片墊出空間，讓螺絲頭／螺帽不刮到鄰層）</li>`).join('')}${shaftSpacer}</ul>
` : '';
  const warnList = (warnings || []).length
    ? `<ul>${warnings.map(w => `<li>${e(w)}</li>`).join('')}</ul>` : '<p class="muted">目前沒有 CNC 警告。</p>';
  const interferenceList = (interference || []).length
    ? `<ul>${interference.map(w => `<li>${e(w.message)}</li>`).join('')}</ul>`
    : modules.some(m => m?.mount?.face) ? '<p class="muted">六面接合的跨面干涉尚未驗證。</p>' : '<p class="muted">已依各馬達行程取樣檢查，未發現干涉（仍需實物確認）。</p>';
  const suggestList = (suggestions || []).length
    ? `<ul>${suggestions.map(s => `<li>建議：${e(s.message)}</li>`).join('')}</ul>` : '';

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} 製作包</title>
<style>
  body { font-family: "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif; color: #1c1c1e; max-width: 880px; margin: 24px auto; padding: 0 16px; line-height: 1.6; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 8px; border-bottom: 2px solid #1c1c1e; padding-bottom: 4px; }
  h3 { font-size: 15px; margin: 0 0 4px; }
  h3.plane { margin: 16px 0 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #aaa; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .muted { color: #555; font-size: 14px; }
  .step { break-inside: avoid; border: 1px solid #ccc; border-radius: 6px; padding: 8px 12px; margin: 8px 0; }
  .step ol { margin: 4px 0 0; padding-left: 20px; }
  @media print { body { margin: 0; max-width: none; } h2 { break-after: avoid; } }
</style>
</head>
<body>
<h1>${e(title)} 製作包</h1>
<p class="muted">日期：${date}　板材厚度：${fmtNum(stock)} mm　刀徑：${tool} mm</p>

<h2>板件清單</h2>
<table><thead><tr><th>層</th><th>檔名</th><th>類型</th><th>外形尺寸</th><th>厚度</th></tr></thead><tbody>${partRows}</tbody></table>

<h2>五金清單</h2>
<table><thead><tr><th>規格</th><th>數量</th><th>用途</th></tr></thead><tbody>${hwRows}</tbody></table>

${gapSection}<h2>組裝步驟</h2>
<p class="muted">由第 0 層（最靠機架）往外逐層組裝。</p>
${steps}
${shaftNote}
${orthoSection}
<h2>CNC 注意事項</h2>
${warnList}

<h2>干涉檢查</h2>
${interferenceList}
${suggestList}

<h2>尚未驗證</h2>
<ul>
  <li>TT 輪轂與 MG995 舵盤的孔位用的是常見值，需實量後修改。</li>
  <li>干涉檢查為平面近似，仍需實物確認。</li>
  <li>螺絲長度為依關節厚度加防鬆螺帽的估算值，需實物驗證。</li>
  <li>MG995 伺服頂面高出底板約 10 mm，舵盤上的齒輪實際高度需實物確認。</li>
</ul>
</body>
</html>
`;
}
