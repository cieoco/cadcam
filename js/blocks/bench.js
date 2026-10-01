/**
 * blocks / bench
 *
 * 組立台的接口模型與連接調整（SDD-ASSEMBLY-BENCH §4、§5，B1～B2）。純函式，不碰 DOM、不改輸入。
 * 接口（port）：輸出端 → bolt（同平面對鎖）；每根桿的兩條長邊 → edge（直角，靠轉接座）。
 * 連接：connect 依接口種類走同平面或直角安裝；benchAdjust 換邊／掉頭／轉 90°／沿邊滑；
 * toggleAngle 在同平面與直角之間切換。
 */
import { mountModule, mountOrthogonal, unmountModule } from './module-ops.js';
import { orthogonalHostBody, planeOf } from './assembly.js';
import { memberStock } from './member-stock.js';
import { ADAPTER_LENGTH_MM } from './orthogonal-joint.js';

const SLIDE_STEP_MM = 5;   // 沿邊滑動一格（SDD-BENCH Q3）

const asList = v => Array.isArray(v) ? v : [];
const finiteNum = v => typeof v === 'number' && Number.isFinite(v);
const round1 = v => Math.round(v * 10) / 10;

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

// 某模組（moduleId 為 null＝根）的自動接口，不存檔、每次由零件算出。
export function autoPorts(comps, modules, moduleId, params) {
  const list = asList(comps);
  const modList = asList(modules);
  const mod = moduleId == null ? null : modList.find(m => m && m.id === moduleId);
  const outputs = mod ? asList(mod.outputs) : [];
  const ports = [];
  outputs.forEach(o => {
    ports.push({ id: `bolt:${o.id}`, kind: 'bolt', module: moduleId, output: o.id, name: o.name, suggested: true });
  });
  list.forEach(bar => {
    if (!bar || bar.type !== 'bar' || !bar.p1 || !bar.p2) return;
    if ((bar.moduleId || null) !== (moduleId == null ? null : moduleId)) return;
    const owners = outputs.filter(o => o.body && o.body.kind === 'bar' && o.body.id === bar.id);
    const label = owners.length ? owners[0].name : bar.id;
    const lengthMm = barLengthOf(bar, params);
    [1, -1].forEach(side => {
      const port = {
        id: `edge:${bar.id}:${side > 0 ? 'L' : 'R'}`, kind: 'edge', module: moduleId == null ? null : moduleId,
        body: { kind: 'bar', id: bar.id }, side,
        name: `${label}・${edgeWordOf(bar, side)}`, lengthMm,
        suggested: owners.some(o => !o.orthogonal || o.orthogonal.side === side)
      };
      if (owners.length) port.output = owners[0].id;
      ports.push(port);
    });
  });
  return ports;
}

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
  const port = host ? autoPorts(comps, modList, host.id, params).find(p => p.id === target.port) : null;
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

// 接上：bolt 接口＝同平面安裝；edge 接口＝直角安裝（mount.to＝{ module, body }）。
export function connect(comps, modules, childId, target, params, motorState) {
  const list = asList(comps), modList = asList(modules);
  const can = canConnect(list, modList, childId, target, params);
  if (!can.ok) return { ok: false, comps: list, modules: modList, reason: can.reason };
  const port = can.port;
  const r = port.kind === 'bolt'
    ? mountModule(list, modList, childId, { module: target.module, output: port.output }, params, motorState)
    : mountOrthogonal(list, modList, childId, { module: target.module, body: port.body.id, side: port.side }, params, motorState);
  if (!r.ok) return { ok: false, comps: list, modules: modList, reason: reasonText(r.reason) };
  return { ok: true, comps: r.comps, modules: r.modules };
}

// 重組 orient（維持存檔的鍵序 type, edge, side, childAxisDeg, offsetMm?, joint）；offsetMm 為 0 時不寫入。
function withOrient(orient, patch) {
  const o = { ...orient, ...patch };
  const out = { type: o.type, edge: o.edge, side: o.side, childAxisDeg: o.childAxisDeg };
  if (o.offsetMm) out.offsetMm = o.offsetMm;
  out.joint = o.joint;
  return out;
}

// 直角安裝後的一鍵調整：'side' 換邊、'reverse' 掉頭、'rotate' 轉 90°、'slide+' ／ 'slide-' 沿邊 ±5 mm。
export function benchAdjust(comps, modules, moduleId, action, params) {
  const list = asList(comps), modList = asList(modules);
  const fail = reason => ({ ok: false, comps: list, modules: modList, reason });
  const idx = modList.findIndex(m => m && m.id === moduleId);
  const mod = modList[idx];
  if (!mod) return fail('找不到這個模組');
  const orient = mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return fail('這個模組不是直角安裝，不能這樣調整');
  let next;
  if (action === 'side') {
    next = withOrient(orient, { side: -orient.side });
  } else if (action === 'reverse') {
    next = withOrient(orient, { childAxisDeg: normalizeDeg(orient.childAxisDeg + 180) });
  } else if (action === 'rotate') {
    next = withOrient(orient, { childAxisDeg: normalizeDeg(orient.childAxisDeg + 90) });
  } else if (action === 'slide+' || action === 'slide-') {
    const bar = orthogonalHostBody(list, modList, mod.mount);
    if (!bar) return fail('找不到宿主的桿');
    const half = barLengthOf(bar, params) / 2;
    const lo = -half, hi = half - ADAPTER_LENGTH_MM;   // 轉接座占 [offset, offset+20]，不能超出桿端
    if (hi < lo) return fail('這根桿太短，不能沿邊滑動');
    const cur = finiteNum(orient.offsetMm) ? orient.offsetMm : 0;
    const v = round1(Math.min(hi, Math.max(lo, cur + (action === 'slide+' ? SLIDE_STEP_MM : -SLIDE_STEP_MM))));
    next = withOrient(orient, { offsetMm: v });
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
    // 直角 → 同平面
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
// 拿著子模組 childId 時，其他模組（不含自己與子孫、且在主平面）的每個接口畫在 3D 哪裡、能不能接。
// 回傳 [{ portId, module, moduleName, kind, name, suggested, compatible, reason?, points }]。
// edge：桿的兩個求解端點往外法線（side·左法線）挪半個板寬，z＝桿中間高度；bolt：輸出端 at 一個點。
// 子模組不存在、已安裝、或沒有 base → []（已安裝的要先拆下，沒有基準點不能裝）。
export function portMarkers(comps, modules, childId, points, params, { zOf, thicknessMm = 3 } = {}) {
  const list = asList(comps), modList = asList(modules);
  const child = modList.find(m => m && m.id === childId);
  if (!child || child.mount || !child.base) return [];
  const pts = points || {};
  const zBase = id => {
    const z = typeof zOf === 'function' && id != null ? zOf(id) : undefined;
    return (finiteNum(z) ? z : 0) + thicknessMm / 2;
  };
  const okPoint = p => p && finiteNum(p.x) && finiteNum(p.y);
  const out = [];
  modList.forEach(host => {
    if (!host || host.id === childId || isDescendant(modList, host.id, childId)) return;
    if (planeOf(list, modList, host.id) !== null) return;   // 目前只處理主平面上的宿主
    autoPorts(list, modList, host.id, params).forEach(port => {
      let mpoints = null;
      if (port.kind === 'edge') {
        const bar = list.find(c => c && c.type === 'bar' && c.id === port.body.id);
        const p1 = bar && pts[bar.p1.id], p2 = bar && pts[bar.p2.id];
        if (!okPoint(p1) || !okPoint(p2)) return;
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const half = memberStock(bar).widthMm / 2;
        const mx = port.side * (-(p2.y - p1.y) / len) * half, my = port.side * ((p2.x - p1.x) / len) * half;
        const z = zBase(bar.id);
        mpoints = [{ x: p1.x + mx, y: p1.y + my, z }, { x: p2.x + mx, y: p2.y + my, z }];
      } else {
        const o = asList(host.outputs).find(x => x.id === port.output);
        const at = o && pts[o.at];
        if (!okPoint(at)) return;
        mpoints = [{ x: at.x, y: at.y, z: zBase(o.body && o.body.id) }];
      }
      const can = canConnect(list, modList, childId, { module: host.id, port: port.id }, params);
      const marker = {
        portId: port.id, module: host.id, moduleName: host.name, kind: port.kind, name: port.name,
        suggested: !!port.suggested, compatible: can.ok, points: mpoints
      };
      if (!can.ok) marker.reason = can.reason;
      out.push(marker);
    });
  });
  return out;
}
