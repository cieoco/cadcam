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
import { worldFrameComps, moduleFrameExports, moduleFrameNodes, moduleOfPoint, splitFrameMounts } from './assembly.js';
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

export function buildPlan({ comps, modules = [], params = {}, exportSettings = {}, cnc, mounts } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const modById = new Map(modList.map(m => [m.id, m]));
  const stockMm = finitePos(cnc && cnc.stockThicknessMm) ? Number(cnc.stockThicknessMm) : DEFAULT_STOCK_THICKNESS_MM;
  const settings = normalizeExportSettings(exportSettings);
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
    const part = { name: 'frame', kind: 'frame', compId: null, moduleId: null, layer: 0, thicknessMm: stockMm, ...geomInfo(inspectFrameExport(worldNodes, exp, freeSplit.world)) };
    addPart(part, worldNodes.map(n => ({ id: n.id, holeDiameterMm: finitePos(n.holeDiameterMm) ? Number(n.holeDiameterMm) : frameHole, mountBolt: n.holeLayer === 'MOUNT_BOLT' })));
    pushGroup(null, part);
  }
  moduleFrameExports(list, modList, params).forEach(entry => {
    const nodes = moduleFrameNodes(entry, frameConnectorNodes(entry.comps));
    if (!nodes.length) return;
    const part = { name: entry.fileBase, kind: 'frame', compId: null, moduleId: entry.moduleId, layer: 0, thicknessMm: stockMm, ...geomInfo(inspectFrameExport(nodes, exp, freeSplit.byModule[entry.moduleId] || [])) };
    addPart(part, nodes.map(n => ({ id: n.id, holeDiameterMm: finitePos(n.holeDiameterMm) ? Number(n.holeDiameterMm) : frameHole, mountBolt: n.holeLayer === 'MOUNT_BOLT' })));
    pushGroup(entry.moduleId, part);
  });

  const memberPart = (comp, kind, geometry) => ({
    name: safeName(comp.id), kind, compId: comp.id, moduleId: comp.moduleId || null, layer: 0, thicknessMm: thicknessOf(comp), ...geomInfo(geometry)
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
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, seedPts, exp, hosted.get(comp.id)) : null;
    const part = memberPart(comp, 'member', hostGeometry || inspectLinkExport(comp, length, exp));
    addPart(part, pointsOf(comp, ['p1', 'p2'], linkHole));
    partByComp.set(comp.id, part);
    const key = groupKeyOf(comp, modById);
    pushGroup(key, part);
    addBody(key, part, [comp.p1.id, comp.p2.id], comp);
  });
  plates.forEach(({ comp, points }) => {
    const part = memberPart(comp, 'member', inspectPlateExport(comp, points, exp, hosted.get(comp.id)));
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
    if (key !== null) {
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
      groupBodies.forEach((b, i) => { b.part.layer = B + 1 + (raw[i] - min); });
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
  const byId = new Map();   // 點 id -> [{ part, info }]
  parts.forEach(part => {
    const seen = new Set();
    (partPoints.get(part.name) || []).forEach(info => {
      if (!info.id || seen.has(info.id)) return;
      seen.add(info.id);
      if (!byId.has(info.id)) byId.set(info.id, []);
      byId.get(info.id).push({ part, info });
    });
  });
  const motorIds = new Set(motorPointIds(list));
  list.forEach(c => { if (c && c.type === 'bar' && c.motorMount && c.motorMount.center) motorIds.add(c.motorMount.center); });

  // 每層厚度＝該層零件最大厚度；空層用墊片（CNC 板厚）。
  const layerThickness = new Map();
  parts.forEach(p => layerThickness.set(p.layer, Math.max(layerThickness.get(p.layer) || 0, p.thicknessMm)));
  const spanOf = (lo, hi) => {
    let sum = 0;
    for (let l = lo; l <= hi; l++) sum += layerThickness.get(l) || stockMm;
    return Math.round(sum * 1000) / 1000;
  };

  const joints = [];
  byId.forEach((entries, id) => {
    if (entries.length < 2) return;
    const layers = entries.map(e => e.part.layer);
    const lo = Math.min(...layers), hi = Math.max(...layers);
    let kind = 'pivot';
    if (entries.some(e => e.info.guide)) kind = 'guide-pin';
    else if (entries.some(e => e.info.mountBolt)) kind = 'mount-bolt';
    else if (motorIds.has(id)) kind = 'motor-shaft';
    const hole = entries.map(e => e.info.holeDiameterMm).find(v => finitePos(v));
    joints.push({
      id,
      kind,
      parts: entries.map(e => e.part.name),
      layers: [lo, hi],
      holeDiameterMm: hole === undefined ? null : Number(hole),
      spanMm: spanOf(lo, hi)
    });
  });
  joints.sort((a, b) => (a.layers[0] - b.layers[0]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // ---- 4. 馬達 ----
  const motors = [...motorIds].map(centerId => {
    const m = moduleOfPoint(list, centerId);
    const key = m != null ? groupKeyOf({ moduleId: m }, modById) : null;
    const plateName = key === null ? 'frame' : `${key}-frame`;
    return { type: motorTypeAt(list, centerId), centerId, plate: partPoints.has(plateName) ? plateName : null };
  });

  return { parts, joints, motors };
}

// ---- 五金清單 ----
// 回傳 [{ spec, qty, note }]：M3 螺絲（依關節總厚估長度）、孔圖層對應的固定螺絲、
// 防鬆螺帽（穿透式 M3 螺絲各一顆）、馬達。同規格合併成一列，note 寫用途明細。
export function jointScrewSpec(joint) {
  if (!joint || !JOINT_USE_LABEL[joint.kind]) return null;
  const d = Number(joint.holeDiameterMm);
  if (!Number.isFinite(d) || d < M3_HOLE_RANGE_MM[0] || d > M3_HOLE_RANGE_MM[1]) return null;
  const need = Number(joint.spanMm) + NUT_THICKNESS_MM;
  const len = SCREW_LENGTHS_MM.find(l => l >= need) || Math.ceil(need);
  return `M3×${len}`;
}

const USE_ORDER = ['導銷', '對鎖', '樞軸', 'TT 馬達固定', 'MG995 耳孔', 'TT 輪轂', 'MG995 舵盤'];

export function hardwareList(plan) {
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
  joints.forEach(j => {
    const spec = jointScrewSpec(j);
    if (spec) addScrew(spec, JOINT_USE_LABEL[j.kind], 1, true);
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
  if (nuts > 0) rows.push({ spec: 'M3 防鬆螺帽', qty: nuts, note: '穿透式 M3 螺絲各一顆（鎖進輪轂的 M3×8 不需要）' });
  const ttCount = motors.filter(m => m.type === 'tt').length;
  const servoCount = motors.filter(m => m.type === 'mg995').length;
  if (ttCount) rows.push({ spec: 'TT 減速馬達', qty: ttCount, note: '動力來源，裝在機架板背面' });
  if (servoCount) rows.push({ spec: 'MG995 伺服', qty: servoCount, note: '動力來源，從機架板槽穿入' });
  return rows;
}

// ---- 製作包 HTML ----
const escHtml = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtNum = v => String(Number(Number(v).toFixed(3)));
const KIND_LABEL = { frame: '機架板', gear: '齒輪', rack: '齒條', member: '桿件／板件' };

export function buildPackHtml(plan, { title = '機構作品', cnc, warnings = [], interference = [] } = {}) {
  const parts = (plan && plan.parts) || [];
  const joints = (plan && plan.joints) || [];
  const motors = (plan && plan.motors) || [];
  const stock = finitePos(cnc && cnc.stockThicknessMm) ? Number(cnc.stockThicknessMm) : DEFAULT_STOCK_THICKNESS_MM;
  const tool = finitePos(cnc && cnc.toolDiameterMm) ? fmtNum(cnc.toolDiameterMm) : '未設定';
  const e = escHtml;
  const date = new Date().toISOString().slice(0, 10);
  const partsSorted = [...parts].sort((a, b) => (a.layer - b.layer) || (a.name < b.name ? -1 : 1));
  const partRows = partsSorted.map(p => `<tr><td>${p.layer}</td><td>${e(p.name)}.dxf</td><td>${e(KIND_LABEL[p.kind] || p.kind)}</td><td>${fmtNum(p.widthMm || 0)} × ${fmtNum(p.heightMm || 0)} mm</td><td>${fmtNum(p.thicknessMm)} mm</td></tr>`).join('');
  const hw = hardwareList(plan);
  const hwRows = hw.map(r => `<tr><td>${e(r.spec)}</td><td>${r.qty}</td><td>${e(r.note)}</td></tr>`).join('');

  const layers = [...new Set(parts.map(p => p.layer))].sort((a, b) => a - b);
  const steps = layers.map(n => {
    const here = parts.filter(p => p.layer === n);
    const items = [`<li>放上：${here.map(p => e(p.name)).join('、')}。</li>`];
    motors.forEach(m => {
      const plate = here.find(p => p.name === m.plate);
      if (!plate) return;
      items.push(m.type === 'mg995'
        ? `<li>安裝 MG995 伺服（${e(m.centerId)}）：從 ${e(plate.name)} 的槽穿入，用 M3 螺絲鎖耳孔。</li>`
        : `<li>安裝 TT 馬達（${e(m.centerId)}）：裝在 ${e(plate.name)} 背面，用 M3×30 螺絲鎖固定孔。</li>`);
    });
    joints.filter(j => j.layers[1] === n && j.kind !== 'motor-shaft').forEach(j => {
      const spec = jointScrewSpec(j);
      const through = j.parts.map(e).join('、');
      const how = j.kind === 'guide-pin' ? '導銷：不要鎖死，齒條要能滑動。'
        : j.kind === 'mount-bolt' ? '對鎖：鎖緊，把兩片固定在一起。'
        : '樞軸：防鬆螺帽鎖到不晃但可轉動。';
      items.push(`<li>${spec ? e(spec) : '螺絲（孔徑不是 M3，請自行選配）'} 穿過 ${through}（關節 ${e(j.id)}，第 ${j.layers[0]}～${j.layers[1]} 層）。${how}</li>`);
    });
    return `<section class="step"><h3>第 ${n} 層：${here.map(p => e(KIND_LABEL[p.kind] || p.kind)).filter((v, i, a) => a.indexOf(v) === i).join('、')}</h3><ol>${items.join('')}</ol></section>`;
  }).join('');
  const motorShafts = joints.filter(j => j.kind === 'motor-shaft');
  const shaftNote = motorShafts.length
    ? `<p class="muted">馬達軸（${motorShafts.map(j => e(j.id)).join('、')}）鎖在輪轂或舵盤上，不另配 M3 螺絲。</p>` : '';
  const warnList = (warnings || []).length
    ? `<ul>${warnings.map(w => `<li>${e(w)}</li>`).join('')}</ul>` : '<p class="muted">目前沒有 CNC 警告。</p>';
  const interferenceList = (interference || []).length
    ? `<ul>${interference.map(w => `<li>${e(w.message)}</li>`).join('')}</ul>`
    : '<p class="muted">已依各馬達行程取樣檢查，未發現干涉（仍需實物確認）。</p>';

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

<h2>組裝步驟</h2>
<p class="muted">由第 0 層（最靠機架）往外逐層組裝。</p>
${steps}
${shaftNote}

<h2>CNC 注意事項</h2>
${warnList}

<h2>干涉檢查</h2>
${interferenceList}

<h2>尚未驗證</h2>
<ul>
  <li>TT 輪轂與 MG995 舵盤的孔位用的是常見值，需實量後修改。</li>
  <li>干涉檢查為平面近似，仍需實物確認。</li>
  <li>螺絲長度為依關節厚度加防鬆螺帽的估算值，需實物驗證。</li>
</ul>
</body>
</html>
`;
}
