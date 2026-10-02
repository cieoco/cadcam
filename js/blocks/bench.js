/**
 * blocks / bench
 *
 * 組立台的接口模型與連接調整（SDD-ASSEMBLY-BENCH §4、§5，B1～B2）。純函式，不碰 DOM、不改輸入。
 * 接口（port）：輸出端 → bolt（同平面對鎖）；每根桿的兩條長邊 → edge（直角，靠轉接座）。
 * 連接：connect 依接口種類走同平面或直角安裝；benchAdjust 換邊／掉頭／轉 90°／沿邊滑；
 * toggleAngle 在同平面與直角之間切換。
 */
import { mountModule, mountOrthogonal, unmountModule } from './module-ops.js';
import { orthogonalHostBody, orthogonalHostEdge, worldFrameEdges, moduleFrameEdges, planeOf, defaultStandEdge, hostPlateThickness } from './assembly.js';
import { ADAPTER_LENGTH_MM } from './orthogonal-joint.js';
import { pointCoords, frameConnectorNodes } from './model.js';
import { memberStock } from './member-stock.js';

const SLIDE_STEP_MM = 5;   // 沿邊滑動一格（SDD-BENCH Q3）
const TILT_STEP_DEG = 15;   // D4：傾斜一格
const TILT_MAX_DEG = 60;    // D4：傾斜上限（±）
const ADAPTER_STAND_MARGIN_MM = 14;   // D3：站立時宿主桿的板寬要大於「板厚＋14」

const asList = v => Array.isArray(v) ? v : [];
const finiteNum = v => typeof v === 'number' && Number.isFinite(v);
const round1 = v => Math.round(v * 10) / 10;

// 同名模組的顯示標籤：有名稱用名稱，沒名稱用 id；同名的都加序號（ 1  2  3…）。
export function moduleLabels(modules) {
  if (!Array.isArray(modules)) return new Map();
  const labelMap = new Map();   // id → initial label (name or id)
  const count = new Map();      // label → count
  modules.forEach(m => {
    if (!m) return;
    const label = m.name || m.id;
    labelMap.set(m.id, label);
    count.set(label, (count.get(label) || 0) + 1);
  });
  const final = new Map();      // id → final label (with number if duplicate)
  const seen = new Map();       // label → order index
  modules.forEach(m => {
    if (!m) return;
    const label = labelMap.get(m.id);
    if (count.get(label) > 1) {
      const n = (seen.get(label) || 0) + 1;
      seen.set(label, n);
      final.set(m.id, `${label} ${n}`);
    } else {
      final.set(m.id, label);
    }
  });
  return final;
}

// 角度換算到 (-180, 180]，並四捨五入到 0.1°（與 mountOrthogonal 的 childAxisDeg 同精度，避免浮點誤差累積）。
function normalizeDeg(v) {
  let x = ((v % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return round1(x);
}

// 桿長：有 lenParam 且 params 有有限值就用參數值（與求解一致），否則用靜態座標距離。
function barLengthOf(bar, params) {
  const v = bar.lenParam && params ? params[bar.lenParam] : undefined;
  if (finiteNum(v)) return v;
  const a = bar.p1, b = bar.p2;
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
}

// 邊的白話名稱：由靜態方向 d＝p2−p1 與外法線 m＝side·(−d.y, d.x) 決定。
function edgeWordOf(bar, side) {
  const dx = bar.p2.x - bar.p1.x, dy = bar.p2.y - bar.p1.y;
  const mx = side * -dy, my = side * dx;
  if (Math.abs(dx) >= Math.abs(dy)) return my > 0 ? '上緣' : '下緣';
  return mx > 0 ? '右緣' : '左緣';
}

// 由外法線 m 決定的白話名稱（上緣／下緣／左緣／右緣），規則同 edgeWordOf。
function edgeWordOfM(m) {
  if (Math.abs(m.y) >= Math.abs(m.x)) return m.y > 0 ? '上緣' : '下緣';
  return m.x > 0 ? '右緣' : '左緣';
}

// 同一個宿主下名稱重複時（例如兩條邊都朝上），後面加序號（1）（2）…，避免清單上分不出來。
function dedupeNames(ports) {
  const count = new Map();
  ports.forEach(p => count.set(p.name, (count.get(p.name) || 0) + 1));
  const seen = new Map();
  ports.forEach(p => {
    if (count.get(p.name) < 2) return;
    const n = (seen.get(p.name) || 0) + 1;
    seen.set(p.name, n);
    p.name = `${p.name}（${n}）`;
  });
}

// 把 childId 視為「已安裝」的模組清單：機架外框要排除即將安裝的那個模組（安裝後它的零件就不在世界機架裡了）。
function withVirtualMount(modList, childId) {
  if (!childId) return modList;
  return modList.map(m => m && m.id === childId && !m.mount ? { ...m, mount: { to: { module: null } } } : m);
}

// 某模組（moduleId 為 null＝根）的自動接口，不存檔、每次由零件算出。
// opts.childId：準備安裝上來的模組 id；機架板的邊要排除它（安裝後世界機架就不含它的零件）。
// 接口種類：bolt（輸出端）、edge＋body.kind 'bar'（桿的 L／R 長邊）、'triangle'（三角板的三條邊 e0～e2）、
// 'frame'（未安裝模組／根＝世界機架板、已安裝模組＝自己的底板 <id>-frame 的外框直邊，每段一個）。
// opts.cache：Map，同一輪多次呼叫時共用底板外框的計算結果。
export function autoPorts(comps, modules, moduleId, params, opts = {}) {
  const list = asList(comps);
  const modList = asList(modules);
  const mod = moduleId == null ? null : modList.find(m => m && m.id === moduleId);
  const outputs = mod ? asList(mod.outputs) : [];
  const ports = [];
  const mid = moduleId == null ? null : moduleId;
  outputs.forEach(o => {
    ports.push({ id: `bolt:${o.id}`, kind: 'bolt', module: moduleId, output: o.id, name: o.name, suggested: true });
  });
  list.forEach(bar => {
    if (!bar || bar.type !== 'bar' || !bar.p1 || !bar.p2) return;
    if ((bar.moduleId || null) !== mid) return;
    const owners = outputs.filter(o => o.body && o.body.kind === 'bar' && o.body.id === bar.id);
    const label = owners.length ? owners[0].name : bar.id;
    const lengthMm = barLengthOf(bar, params);
    [1, -1].forEach(side => {
      const port = {
        id: `edge:${bar.id}:${side > 0 ? 'L' : 'R'}`, kind: 'edge', module: mid,
        body: { kind: 'bar', id: bar.id }, side,
        name: `${label}・${edgeWordOf(bar, side)}`, lengthMm,
        suggested: owners.some(o => !o.orthogonal || o.orthogonal.side === side)
      };
      if (owners.length) port.output = owners[0].id;
      ports.push(port);
    });
  });
  // C1：三角板（不含夾爪板 shape 'jaw'）的三條邊；外法線一律朝外（離開板心）。
  const staticPts = pointCoords(list);
  list.forEach(plate => {
    if (!plate || plate.type !== 'triangle' || plate.shape === 'jaw' || !plate.p1 || !plate.p2 || !plate.p3) return;
    if ((plate.moduleId || null) !== mid) return;
    const owners = outputs.filter(o => o.body && o.body.kind === 'triangle' && o.body.id === plate.id);
    const label = owners.length ? owners[0].name : plate.id;
    const group = [];
    [0, 1, 2].forEach(k => {
      const e = orthogonalHostEdge(list, modList, { to: { module: mid, body: plate.id, edge: k } }, staticPts, params);
      if (!e) return;
      group.push({
        id: `edge:${plate.id}:e${k}`, kind: 'edge', module: mid,
        body: { kind: 'triangle', id: plate.id, edge: k }, side: e.side,
        name: `${label}・${edgeWordOfM(e.m)}`, lengthMm: e.lengthMm, suggested: false
      });
    });
    dedupeNames(group);
    ports.push(...group);
  });
  // C1：機架板外框的直邊。世界機架只有一塊（所有未安裝模組與根共用），歸給「擁有機架節點」的模組；已安裝的模組沒有靜止機架。
  if ((mod ? !mod.mount : true) && list.length) {
    const vmods = withVirtualMount(modList, opts && opts.childId);
    const owns = frameConnectorNodes(list.filter(c => c && (c.moduleId || null) === mid)).length > 0;
    if (owns) {
      const group = worldFrameEdges(list, vmods).map((e, k) => ({
        id: `edge:frame:${k}`, kind: 'edge', module: mid,
        body: { kind: 'frame', module: mid, edge: k }, side: sideOf(e),
        name: `機架・${edgeWordOfM(e.m)}`, lengthMm: e.lengthMm, suggested: false
      }));
      dedupeNames(group);
      ports.push(...group);
    }
  } else if (mod && mod.mount && mod.mount.to && mod.mount.to.module != null) {
    // D2：已安裝模組有自己的底板（<id>-frame），外框每段直邊也是一個接口（home 座標算外框，位置隨模組移動）。
    const group = moduleFrameEdges(list, modList, mod.id, params, { cache: opts && opts.cache }).map((e, k) => ({
      id: `edge:frame:${k}`, kind: 'edge', module: mid,
      body: { kind: 'frame', module: mid, edge: k }, side: sideOf(e),
      name: `底板・${edgeWordOfM(e.m)}`, lengthMm: e.lengthMm, suggested: false
    }));
    dedupeNames(group);
    ports.push(...group);
  }
  return ports;
}

// 邊的 side：m＝side·left(d)。
function sideOf(e) { return (e.m.x * -e.d.y + e.m.y * e.d.x) >= 0 ? 1 : -1; }

// candidate 是否為 ancestor 的子孫（沿安裝鏈往上會經過 ancestor）。
function isDescendant(modules, candidateId, ancestorId) {
  const byId = new Map(modules.map(m => [m.id, m]));
  const seen = new Set();
  let cur = byId.get(candidateId);
  while (cur && cur.mount && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = cur.mount.to && cur.mount.to.module;
    if (next === ancestorId) return true;
    cur = byId.get(next);
  }
  return false;
}

// 能不能把 childId 接到 target＝{ module, port }。不能時 reason 用白話說明。
export function canConnect(comps, modules, childId, target, params) {
  const modList = asList(modules);
  const child = modList.find(m => m && m.id === childId);
  if (!child) return { ok: false, reason: '找不到這個模組' };
  if (!target || typeof target !== 'object' || !target.module) return { ok: false, reason: '找不到這個接口' };
  if (target.module === childId) return { ok: false, reason: '模組不能接到自己身上' };
  if (child.mount) return { ok: false, reason: '這個模組已經裝在別處，要先拆下' };
  if (isDescendant(modList, target.module, childId)) return { ok: false, reason: '會形成環：目標模組已經裝在這個模組上' };
  if (!child.base) return { ok: false, reason: '這個模組沒有基準點（base），不能安裝' };
  const host = modList.find(m => m && m.id === target.module);
  const port = host ? autoPorts(comps, modList, host.id, params, { childId }).find(p => p.id === target.port) : null;
  if (!port) return { ok: false, reason: '找不到這個接口' };
  if (port.kind === 'edge' && port.lengthMm < ADAPTER_LENGTH_MM) {
    return { ok: false, reason: `這條邊只有 ${Math.round(port.lengthMm)} mm，轉接座需要至少 ${ADAPTER_LENGTH_MM} mm` };
  }
  return { ok: true, port };
}

// module-ops 回傳的原因代碼 → 白話。
const OPS_REASONS = {
  unsolved: '目前的姿勢解不出來，請先讓機構能動',
  'no-position': '算不出接合位置',
  'no-ref-pose': '算不出宿主的位姿',
  'already-mounted': '這個模組已經裝在別處，要先拆下',
  cycle: '會形成環',
  'no-base': '這個模組沒有基準點（base），不能安裝'
};
const reasonText = code => OPS_REASONS[code] || `安裝失敗（${code}）`;

// 已安裝（直角）模組的宿主邊對應的接口 id；找不到回 null。
export function mountPortId(mount) {
  const to = mount && mount.to;
  if (!to || !mount.orient) return null;
  if (to.frame !== undefined) return to.frame && Number.isInteger(to.frame.edge) ? `edge:frame:${to.frame.edge}` : null;
  if (!to.body) return null;
  if (to.edge !== undefined) return `edge:${to.body}:e${to.edge}`;
  return `edge:${to.body}:${mount.orient.side > 0 ? 'L' : 'R'}`;
}

// 已安裝（直角）模組的宿主邊的白話名稱（例「機架・下緣」）；算不出來回 null。
export function mountPortName(comps, modules, mount, params) {
  const id = mountPortId(mount);
  if (!id) return null;
  const hostId = mount.to.module;
  const port = autoPorts(comps, modules, hostId, params).find(p => p.id === id);
  return port ? port.name : null;
}

// edge 接口 → mountOrthogonal 的目標：桿＝{ body, side }、三角板＝{ body, edge, side }、機架板＝{ frame: { edge }, side }。
function orthogonalTarget(module, port) {
  const b = port.body;
  if (b.kind === 'frame') return { module, frame: { edge: b.edge }, side: port.side };
  if (b.kind === 'triangle') return { module, body: b.id, edge: b.edge, side: port.side };
  return { module, body: b.id, side: port.side };
}

// 接上：bolt 接口＝同平面安裝；edge 接口＝直角安裝（mount.to＝{ module, body[, edge] } 或 { module, frame: { edge } }）。
export function connect(comps, modules, childId, target, params, motorState) {
  const list = asList(comps), modList = asList(modules);
  const can = canConnect(list, modList, childId, target, params);
  if (!can.ok) return { ok: false, comps: list, modules: modList, reason: can.reason };
  const port = can.port;
  const r = port.kind === 'bolt'
    ? mountModule(list, modList, childId, { module: target.module, output: port.output }, params, motorState)
    : mountOrthogonal(list, modList, childId, orthogonalTarget(target.module, port), params, motorState);
  if (!r.ok) return { ok: false, comps: list, modules: modList, reason: reasonText(r.reason) };
  return { ok: true, comps: r.comps, modules: r.modules };
}

// 重組 orient（維持存檔的鍵序 type, edge, side, face?, childEdge?, childAxisDeg, offsetMm?, tiltDeg?, joint）；offsetMm／tiltDeg 為 0 時不寫入；
// face／childEdge 只有 edge 'child'（立在宿主板面上）才寫入。
function withOrient(orient, patch) {
  const o = { ...orient, ...patch };
  const out = { type: o.type, edge: o.edge, side: o.side };
  if (o.edge === 'child') { out.face = o.face; out.childEdge = o.childEdge; }
  out.childAxisDeg = o.childAxisDeg;
  if (o.offsetMm) out.offsetMm = o.offsetMm;
  if (o.tiltDeg) out.tiltDeg = o.tiltDeg;
  out.joint = o.joint;
  return out;
}

// 直角安裝後的一鍵調整：'tilt+' ／ 'tilt-' 傾斜 ±15°（±60° 為限）、'side' 換邊、'reverse' 掉頭、'rotate' 轉 90°、'slide+' ／ 'slide-' 沿邊 ±5 mm；
// D3：'stand' 壓在邊上（host）↔ 立在宿主板面上（child）、'face'（只在立著時）換宿主的另一面；立著時 'rotate'＝換站立邊、'reverse' 不適用。
export function benchAdjust(comps, modules, moduleId, action, params) {
  const list = asList(comps), modList = asList(modules);
  const fail = reason => ({ ok: false, comps: list, modules: modList, reason });
  const idx = modList.findIndex(m => m && m.id === moduleId);
  const mod = modList[idx];
  if (!mod) return fail('找不到這個模組');
  const orient = mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return fail('這個模組不是直角安裝，不能這樣調整');
  let next;
  const standing = orient.edge === 'child';
  if (action === 'stand') {
    if (standing) {
      next = withOrient(orient, { edge: 'host' });
    } else {
      // 宿主是桿時，板寬要容得下「板厚＋轉接座翼孔」才站得住。
      const edge0 = orthogonalHostEdge(list, modList, mod.mount, pointCoords(list), params, { home: true });
      if (!edge0) return fail('找不到宿主的邊');
      const T = hostPlateThickness(list, edge0, 3);
      if (edge0.kind === 'bar') {
        const bar = list.find(c => c && c.id === edge0.compId);
        const w = bar ? memberStock(bar).widthMm : 0;
        if (w < T + ADAPTER_STAND_MARGIN_MM) return fail(`宿主這根桿的板寬只有 ${w} mm，太窄，站不住（至少要 ${T + ADAPTER_STAND_MARGIN_MM} mm 寬）`);
      }
      const k = defaultStandEdge(list, modList, moduleId, params, {});
      if (k === null) return fail('算不出這個模組的底板邊，不能立在板面上');
      next = withOrient(orient, { edge: 'child', face: 1, childEdge: k });
    }
  } else if (action === 'face') {
    if (!standing) return fail('只有「立在面上」時才能換面；先按「立在面上」');
    next = withOrient(orient, { face: orient.face === -1 ? 1 : -1 });
  } else if (action === 'side') {
    // 板／機架的邊只有朝外那一側能裝（另一側是板身），所以不能換邊。
    if (mod.mount.to.frame !== undefined || mod.mount.to.edge !== undefined) return fail('板件、機架或底板的邊只有朝外那一側能裝，不能換邊');
    next = withOrient(orient, { side: -orient.side });
  } else if (action === 'reverse') {
    if (standing) return fail('立在面上時站立邊已決定方向，不能掉頭；想換邊請按「換站立邊」');
    next = withOrient(orient, { childAxisDeg: normalizeDeg(orient.childAxisDeg + 180) });
  } else if (action === 'rotate') {
    if (standing) {
      const count = moduleFrameEdges(list, modList, moduleId, params, { noOwnHoles: true }).length;
      if (count < 2) return fail('這個模組的底板只有一條邊，沒有別的站立邊可換');
      next = withOrient(orient, { childEdge: ((Number.isInteger(orient.childEdge) ? orient.childEdge : 0) + 1) % count });
    } else next = withOrient(orient, { childAxisDeg: normalizeDeg(orient.childAxisDeg + 90) });
  } else if (action === 'slide+' || action === 'slide-') {
    // C1：宿主可以是桿、三角板或機架板的邊；邊長取 lengthMm（桿＝求解用的桿長參數）。
    const edge = orthogonalHostEdge(list, modList, mod.mount, pointCoords(list), params, { home: true });   // D2：只要邊長，底板邊用 home 座標
    if (!edge) return fail('找不到宿主的邊');
    const half = edge.lengthMm / 2;
    const lo = -half, hi = half - ADAPTER_LENGTH_MM;   // 轉接座占 [offset, offset+20]，不能超出邊的兩端
    if (hi < lo) return fail('這條邊太短，不能沿邊滑動');
    const cur = finiteNum(orient.offsetMm) ? orient.offsetMm : 0;
    const v = round1(Math.min(hi, Math.max(lo, cur + (action === 'slide+' ? SLIDE_STEP_MM : -SLIDE_STEP_MM))));
    next = withOrient(orient, { offsetMm: v });
  } else if (action === 'tilt+' || action === 'tilt-') {
    // D4：繞接合線傾斜，15° 一格，範圍 ±60°。
    const cur = finiteNum(orient.tiltDeg) ? orient.tiltDeg : 0;
    const nv = cur + (action === 'tilt+' ? TILT_STEP_DEG : -TILT_STEP_DEG);
    if (Math.abs(nv) > TILT_MAX_DEG) return fail(`傾斜已到極限（±${TILT_MAX_DEG}°）`);
    next = withOrient(orient, { tiltDeg: nv });
  } else {
    return fail('不認識的調整動作');
  }
  const modules2 = modList.map((m, i) => i === idx ? { ...m, mount: { ...m.mount, orient: next } } : m);
  return { ok: true, comps: list, modules: modules2 };
}

// 直角 ↔ 同平面。直角→同平面：宿主桿必須是有 at 的輸出端；同平面→直角：輸出端的 body 必須是桿。
export function toggleAngle(comps, modules, moduleId, params, motorState) {
  const list = asList(comps), modList = asList(modules);
  const fail = reason => ({ ok: false, comps: list, modules: modList, reason });
  const mod = modList.find(m => m && m.id === moduleId);
  if (!mod) return fail('找不到這個模組');
  if (!mod.mount) return fail('這個模組還沒安裝，不能切換角度');
  const host = modList.find(m => m && m.id === mod.mount.to.module);
  if (!host) return fail('找不到宿主模組');
  const outputs = asList(host.outputs);

  if (mod.mount.orient) {
    // 直角 → 同平面（只有「輸出端的桿」做得到；板件的邊與機架板的邊沒有對應的輸出端）
    if (mod.mount.to.frame !== undefined || mod.mount.to.edge !== undefined) return fail('只有「輸出端的桿」能改成同平面；板件、機架或底板的邊只能直角安裝');
    const bar = orthogonalHostBody(list, modList, mod.mount);
    const own = mod.mount.to.output ? outputs.find(o => o.id === mod.mount.to.output) : null;
    const out = (own && own.at ? own : null)
      || (bar ? outputs.find(o => o.at && o.body && o.body.kind === 'bar' && o.body.id === bar.id) : null);
    if (!out) return fail('這根桿不是輸出端，只能直角安裝');
    const un = unmountModule(list, modList, moduleId, params, motorState);
    if (!un.ok) return fail(reasonText(un.reason));
    const r = mountModule(un.comps, un.modules, moduleId, { module: host.id, output: out.id }, params, motorState);
    if (!r.ok) return fail(reasonText(r.reason));
    return { ok: true, comps: r.comps, modules: r.modules };
  }

  // 同平面 → 直角
  const out = outputs.find(o => o.id === mod.mount.to.output);
  if (!out || !out.body || out.body.kind !== 'bar') return fail('這個輸出端不是桿，只能同平面安裝');
  const side = out.orthogonal && (out.orthogonal.side === 1 || out.orthogonal.side === -1) ? out.orthogonal.side : -1;
  const un = unmountModule(list, modList, moduleId, params, motorState);
  if (!un.ok) return fail(reasonText(un.reason));
  const r = connect(un.comps, un.modules, moduleId, { module: host.id, port: `edge:${out.body.id}:${side > 0 ? 'L' : 'R'}` }, params, motorState);
  if (!r.ok) return fail(r.reason);
  return r;
}

// ---- B3：3D 接口標記（純函式）----
// 拿著子模組 childId 時，其他模組（不含自己與子孫；宿主可在主平面或任一直角子平面）的每個接口畫在 3D 哪裡、能不能接。
// 回傳 [{ portId, module, moduleName, kind, name, suggested, compatible, plane, reason?, points }]。
// plane＝宿主所在平面（主平面為 null）；points 用該平面自己的 2D 座標，z＝zOf(id, plane)＋板厚/2，
// 畫進主 3D 場景前要乘上該平面的矩陣（C2，由 bench-ui 處理）。
// edge：桿的兩個求解端點往外法線（side·左法線）挪半個板寬，z＝桿中間高度；bolt：輸出端 at 一個點。
// 子模組不存在、已安裝、或沒有 base → []（已安裝的要先拆下，沒有基準點不能裝）。
export function portMarkers(comps, modules, childId, points, params, { zOf, thicknessMm = 3 } = {}) {
  const list = asList(comps), modList = asList(modules);
  const child = modList.find(m => m && m.id === childId);
  if (!child || child.mount || !child.base) return [];
  const pts = points || {};
  const zBase = (id, plane) => {
    const z = typeof zOf === 'function' && id != null ? zOf(id, plane) : undefined;
    return (finiteNum(z) ? z : 0) + thicknessMm / 2;
  };
  const okPoint = p => p && finiteNum(p.x) && finiteNum(p.y);
  const out = [];
  const seenFrame = new Set();
  const vmods = withVirtualMount(modList, childId);   // 機架外框排除即將安裝的子模組
  const labels = moduleLabels(modList);   // 同名模組的顯示標籤
  const frameCache = new Map();           // D2：同一輪內共用已安裝模組底板外框的計算
  modList.forEach(host => {
    if (!host || host.id === childId || isDescendant(modList, host.id, childId)) return;
    const plane = planeOf(list, modList, host.id);   // 主平面為 null；直角子平面為該平面的模組 id
    autoPorts(list, modList, host.id, params, { childId, cache: frameCache }).forEach(port => {
      let mpoints = null;
      if (port.kind === 'edge') {
        // 邊線兩端點（已朝外挪到實際板外緣），z＝宿主那一片的中間高度（機架板用 'frame'）。
        const b = port.body;
        const to = b.kind === 'frame' ? { module: host.id, frame: { edge: b.edge } }
          : b.kind === 'triangle' ? { module: host.id, body: b.id, edge: b.edge } : { module: host.id, body: b.id };
        const ownFrame = b.kind === 'frame' && host.mount;   // D2：已安裝模組自己的底板，跟著宿主模組走
        if (b.kind === 'frame' && !ownFrame) {
          if (seenFrame.has(b.edge)) return;   // 世界機架只有一塊：多個模組共用時只標一次
          seenFrame.add(b.edge);
        }
        const e = orthogonalHostEdge(list, vmods, { to, orient: { side: port.side } }, pts, params, { cache: frameCache });
        if (!e) return;
        const z = zBase(b.kind === 'frame' ? (ownFrame ? `${host.id}-frame` : 'frame') : b.id, plane);
        mpoints = [{ x: e.a.x, y: e.a.y, z }, { x: e.b.x, y: e.b.y, z }];
      } else {
        const o = asList(host.outputs).find(x => x.id === port.output);
        const at = o && pts[o.at];
        if (!okPoint(at)) return;
        mpoints = [{ x: at.x, y: at.y, z: zBase(o.body && o.body.id, plane) }];
      }
      const can = canConnect(list, modList, childId, { module: host.id, port: port.id }, params);
      const marker = {
        portId: port.id, module: host.id, moduleName: labels.get(host.id) || host.id, kind: port.kind, name: port.name,
        suggested: !!port.suggested, compatible: can.ok, plane, points: mpoints
      };
      if (!can.ok) marker.reason = can.reason;
      out.push(marker);
    });
  });
  return out;
}
