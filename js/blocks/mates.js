/**
 * blocks / mates
 *
 * 接合面資料模型（SDD-MATE-FACES §3，M1）。純函式，不碰 DOM、不改輸入。
 *   attach ＝ 這個模組「從哪一側裝到別人身上」（模組座標的外法線角度，90° 的倍數）
 *   receive＝ 別人可以裝在這個模組哪裡（對自動接口的穩定參照，不存座標；最多 8 個）
 * ownPorts 只算模組自己的接口（未安裝模組共用的世界機架板會把其他模組排除）；參照 portRef／resolveRef 不依賴邊編號 k。
 */
import { autoPorts, withVirtualMount } from './bench.js';
import { worldFrameEdges, moduleFrameEdges } from './assembly.js';
import { pointCoords } from './model.js';
import { MATES_MAX_RECEIVE, normalizeMates, normalizeRef, snapDeg90, cleanMateName } from './mates-schema.js';

export { normalizeMates };

const asList = v => Array.isArray(v) ? v : [];
const D2R = Math.PI / 180;
const findMod = (modules, id) => asList(modules).find(m => m && m.id === id) || null;

// ---------- 接口 ----------
// 模組自己的接口：已安裝＝autoPorts 原樣；未安裝＝把其他未安裝模組當成不在世界機架裡再算。
// 機架／底板邊的接口另帶不可列舉的 geom＝{ a, b, d, m }（portRef 用外法線與位置排序）。
export function ownPorts(comps, modules, moduleId, params) {
  const list = asList(comps), mods = asList(modules), mod = findMod(mods, moduleId);
  if (!mod) return [];
  const others = mod.mount ? [] : mods.filter(m => m && m.id !== moduleId && !m.mount).map(m => m.id);
  const vm = withVirtualMount(mods, others);
  const ports = autoPorts(list, vm, moduleId, params).filter(p => p.module === moduleId);
  if (ports.some(p => p.body && p.body.kind === 'frame')) {
    const edges = mod.mount ? moduleFrameEdges(list, mods, moduleId, params) : worldFrameEdges(list, vm);
    ports.forEach(p => {
      const e = p.body && p.body.kind === 'frame' ? edges[p.body.edge] : null;
      if (e) Object.defineProperty(p, 'geom', { value: { a: e.a, b: e.b, d: e.d, m: e.m }, enumerable: false });
    });
  }
  return ports;
}

const normalDegOf = m => ((Math.round(Math.atan2(m.y, m.x) / D2R) % 360) + 360) % 360;
const degDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// 機架邊 → { normalDeg, order }：同一外法線角度的邊，沿邊方向（再沿法線）排序後的序號。回傳 Map(port.id → key)。
function frameKeys(ports) {
  const groups = new Map();
  asList(ports).forEach(p => {
    if (!(p && p.body && p.body.kind === 'frame' && p.geom)) return;
    const n = normalDegOf(p.geom.m);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(p);
  });
  const out = new Map();
  groups.forEach((g, n) => {
    const t = { x: -Math.sin(n * D2R), y: Math.cos(n * D2R) }, nm = { x: Math.cos(n * D2R), y: Math.sin(n * D2R) };
    const key = p => { const mx = (p.geom.a.x + p.geom.b.x) / 2, my = (p.geom.a.y + p.geom.b.y) / 2; return [Math.round((mx * t.x + my * t.y) * 100), Math.round((mx * nm.x + my * nm.y) * 100)]; };
    g.map(p => ({ p, k: key(p) })).sort((u, v) => u.k[0] - v.k[0] || u.k[1] - v.k[1]).forEach((e, i) => out.set(e.p.id, { normalDeg: n, order: i }));
  });
  return out;
}

// 接口 → 穩定參照；ports 是同一批 ownPorts 結果（機架邊要靠它排序）。算不出回 null。
export function portRef(port, ports) {
  const b = port && port.body;
  if (port && port.kind === 'bolt' && port.output) return { kind: 'bolt', output: port.output };
  if (!b) return null;
  if (b.kind === 'bar') return { kind: 'bar', id: b.id, side: port.side };
  if (b.kind === 'triangle') return { kind: 'triangle', id: b.id, edge: b.edge };
  if (b.kind === 'frame') { const k = frameKeys(ports).get(port.id); return k ? { kind: 'frame', normalDeg: k.normalDeg, order: k.order } : null; }
  return null;
}

// 參照 → 接口；找不到回 null（不丟例外）。機架邊的角度容許 ±1°。
export function resolveRef(ports, ref) {
  const list = asList(ports), r = normalizeRef(ref);
  if (!r) return null;
  if (r.kind === 'bar') return list.find(p => p.body && p.body.kind === 'bar' && p.body.id === r.id && p.side === r.side) || null;
  if (r.kind === 'triangle') return list.find(p => p.body && p.body.kind === 'triangle' && p.body.id === r.id && p.body.edge === r.edge) || null;
  if (r.kind === 'bolt') return list.find(p => p.kind === 'bolt' && p.output === r.output) || null;
  const keys = frameKeys(list);
  const hit = list.filter(p => keys.has(p.id) && keys.get(p.id).order === r.order && degDiff(keys.get(p.id).normalDeg, r.normalDeg) <= 1);
  return hit.find(p => keys.get(p.id).normalDeg === r.normalDeg) || hit[0] || null;
}

// 接口名稱 → 承接面名稱：去掉「・」；沒有輸出端名稱的桿／板以零件 id 當名稱，改用「連桿」「三角板」，不顯示內部 id。
function tidyName(port) {
  const [label, ...rest] = String(port.name || '').split('・');
  const b = port.body, lab = b && b.id !== undefined && label === b.id ? (b.kind === 'triangle' ? '三角板' : '連桿') : label;
  return cleanMateName(lab + rest.join('')) || '承接面';
}

// ---------- 建議 ----------
// 安裝方向＝基準點→模組所有接點重心的反方向，取最近的 90°；沒有基準點（或重心就在基準點上）回 null。
function suggestAttach(comps, mod) {
  if (!mod.base) return null;
  const all = pointCoords(asList(comps).filter(c => c && c.moduleId === mod.id)), pts = Object.values(all), b = all[mod.base];
  if (!b || !pts.length) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length - b.x, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length - b.y;
  if (Math.hypot(cx, cy) < 1e-6) return null;
  return { normalDeg: snapDeg90(Math.atan2(cy, cx) / D2R + 180) };
}

// 建議的接合面：輸出端是桿→兩條長邊；輸出端有 2 個以上對鎖孔→對鎖。名稱不含內部零件 id。
export function suggestMates(comps, modules, moduleId, params) {
  const mod = findMod(modules, moduleId);
  if (!mod) return { attach: null, receive: [] };
  const ports = ownPorts(comps, modules, moduleId, params);
  const picks = [];
  asList(mod.outputs).forEach(o => {
    if (o.body && o.body.kind === 'bar') ports.filter(p => p.body && p.body.kind === 'bar' && p.body.id === o.body.id).sort((a, b) => b.side - a.side).forEach(p => picks.push(p));
    if (asList(o.bolts).length >= 2) ports.filter(p => p.kind === 'bolt' && p.output === o.id).forEach(p => picks.push(p));
  });
  const receive = [];
  picks.forEach(p => { const ref = portRef(p, ports); if (ref) receive.push({ id: `r${receive.length + 1}`, name: tidyName(p), ref }); });
  return { attach: suggestAttach(comps, mod), receive: receive.slice(0, MATES_MAX_RECEIVE) };
}

// 目前有效的接合面：有存 mates 用存的，沒有就即時建議（suggested true、不寫回）；每筆承接面還原成 port，指不到的 valid false 但保留。
export function effectiveMates(comps, modules, moduleId, params) {
  const mod = findMod(modules, moduleId);
  const stored = mod && mod.mates ? mod.mates : null;
  const m = stored || suggestMates(comps, modules, moduleId, params);
  const ports = ownPorts(comps, modules, moduleId, params);
  const receive = asList(m.receive).map(r => { const port = resolveRef(ports, r.ref); return { id: r.id, name: r.name, ref: r.ref, port, valid: !!port }; });
  return { attach: m.attach || null, receive, suggested: !stored };
}

// ---------- 編輯（不改輸入；沒動到的模組物件保持原樣）----------
const withMates = (modules, moduleId, fn) => {
  const mods = asList(modules), i = mods.findIndex(m => m && m.id === moduleId);
  if (i < 0) return mods;
  const cur = mods[i].mates || { attach: null, receive: [] };
  const next = fn(cur);
  return next === cur ? mods : mods.map((m, j) => j === i ? { ...m, mates: next } : m);
};

export function setAttach(modules, moduleId, normalDegOrNull) {
  const d = snapDeg90(normalDegOrNull);
  return withMates(modules, moduleId, cur => ({ ...cur, attach: d === null ? null : { normalDeg: d } }));
}

export function addReceive(comps, modules, moduleId, portId, params, name) {
  const mods = asList(modules), mod = findMod(mods, moduleId);
  const fail = reason => ({ ok: false, modules: mods, reason });
  if (!mod) return fail('找不到這個模組');
  const ports = ownPorts(comps, mods, moduleId, params);
  const port = ports.find(p => p.id === portId);
  const ref = port && portRef(port, ports);
  if (!port || !ref) return fail('找不到這個接口');
  const cur = mod.mates || { attach: null, receive: [] };
  if (cur.receive.length >= MATES_MAX_RECEIVE) return fail(`承接面最多 ${MATES_MAX_RECEIVE} 個，請先移除一個`);
  if (cur.receive.some(r => { const q = resolveRef(ports, r.ref); return q ? q.id === port.id : JSON.stringify(r.ref) === JSON.stringify(ref); })) return fail('這個位置已經是承接面了');
  let nm = cleanMateName(name);
  if (!nm) {
    const base = tidyName(port);
    nm = base;
    for (let n = 2; cur.receive.some(r => r.name === nm); n++) nm = `${base}（${n}）`;
  }
  let n = 1;
  while (cur.receive.some(r => r.id === `r${n}`)) n++;
  const mates = { ...cur, receive: [...cur.receive, { id: `r${n}`, name: nm, ref }] };
  return { ok: true, modules: mods.map(m => m === mod ? { ...m, mates } : m) };
}

export const removeReceive = (modules, moduleId, mateId) => withMates(modules, moduleId, cur => cur.receive.some(r => r.id === mateId) ? { ...cur, receive: cur.receive.filter(r => r.id !== mateId) } : cur);

export function renameReceive(modules, moduleId, mateId, name) {
  const nm = cleanMateName(name);
  return withMates(modules, moduleId, cur => nm && cur.receive.some(r => r.id === mateId) ? { ...cur, receive: cur.receive.map(r => r.id === mateId ? { ...r, name: nm } : r) } : cur);
}
