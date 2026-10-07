/**
 * blocks / mate-connect
 *
 * 選一個承接面 → 直接得到做得出來的接合（SDD-MATE-FACES §4，M3）。純函式，不碰 DOM、不改輸入。
 * 只是 mates／bench 上的薄薄一層：板邊→角碼直角（壓在邊上／立在上面／立在下面）、有 2 個以上對鎖孔的輸出端→平貼對鎖。
 * 幾何與接合都沿用 connect／benchAdjust，安裝紀錄不多存任何東西（接在哪個承接面由 mateOfMount 即時算）。
 */
import { effectiveMates } from './mates.js';
import { canConnect, connect, benchAdjust, mountPortId, isDescendant, withOrient, normalizeDeg, moduleLabels } from './bench.js';
import { moduleFrameEdges, orthogonalHostEdge, orthogonalHostBody } from './assembly.js';
import { assemblyRoles, setAssemblyRoot } from './assembly-roles.js';
import { unmountModule } from './module-ops.js';
import { ADAPTER_LENGTH_MM } from './orthogonal-joint.js';
import { pointCoords } from './model.js';

const asList = v => Array.isArray(v) ? v : [];
const findMod = (modules, id) => asList(modules).find(m => m && m.id === id) || null;
const D2R = Math.PI / 180;
const GAP_MM = 4;                                // 同一根桿／同一條邊上，兩個接合之間至少留這麼寬
const PITCH_MM = ADAPTER_LENGTH_MM + GAP_MM;     // 兩個接合的起點至少差這麼多（20 mm 一段＋4 mm 空隙）
const LABELS = { hang: '壓在邊上', 'stand-top': '立在上面', 'stand-bottom': '立在下面', bolt: '平貼對鎖' };

const labelOf = (modules, id) => moduleLabels(asList(modules)).get(id) || id;

// 輸出端的對鎖孔數（不到 2 個就不能對鎖）。
const boltCount = (host, port) => { const o = asList(host.outputs).find(x => x.id === port.output); return asList(o && o.bolts).length; };

// 這個承接面現在能不能接給 child；回 { ok, reason? }。
function checkTarget(comps, modules, childId, host, mate, params) {
  if (!mate.valid || !mate.port) return { ok: false, reason: '這個承接面指到的零件已經不在了，請重新設定' };
  if (isDescendant(asList(modules), host.id, childId)) return { ok: false, reason: '會形成環：這個機構已經是它的宿主（裝在它身上）' };
  if (mate.port.kind === 'bolt' && boltCount(host, mate.port) < 2) return { ok: false, reason: '這個輸出端只有 1 個孔，不能平貼對鎖' };
  if (mate.port.kind === 'bolt') {   // M5a：對鎖的孔只有一組，一次只能鎖一個
    const used = asList(modules).find(m => m && m.id !== childId && m.mount && !m.mount.orient && m.mount.to && m.mount.to.module === host.id && m.mount.to.output === mate.port.output);
    if (used) return { ok: false, reason: `這個輸出端已經鎖著「${labelOf(modules, used.id)}」，一次只能鎖一個；要換的話先把它拆下來` };
  }
  const can = canConnect(comps, modules, childId, { module: host.id, port: mate.port.id }, params);
  return can.ok ? { ok: true } : { ok: false, reason: can.reason };
}

// 還沒安裝的機構 childId 可以接到哪些承接面（其他每個模組的每個承接面；不能接的附上白話原因）。已安裝 → []。
export function mateTargets(comps, modules, childId, params) {
  const child = findMod(modules, childId);
  if (!child || child.mount) return [];
  const out = [];
  asList(modules).forEach(host => {
    if (!host || host.id === childId) return;
    effectiveMates(comps, modules, host.id, params).receive.forEach(mate => {
      const t = { module: host.id, moduleName: host.name || host.id, mateId: mate.id, name: mate.name, kind: (mate.port ? mate.port.kind : mate.ref && mate.ref.kind) === 'bolt' ? 'bolt' : 'edge', portId: mate.port ? mate.port.id : null };
      const c = checkTarget(comps, modules, childId, host, mate, params);
      out.push(c.ok ? { ...t, ok: true } : { ...t, ok: false, reason: c.reason });
    });
  });
  return out;
}

// 接上去。target＝{ module, mate }；失敗回原本的 comps／modules 與白話原因。
// 板邊→金屬角碼（opts.jointKind 可改 'printed'）、接合線方向由子模組的安裝方向決定；對鎖→同平面對鎖。
export function mateConnect(comps, modules, childId, target, params, motorState, opts = {}) {
  const list = asList(comps), mods = asList(modules);
  const fail = reason => ({ ok: false, comps, modules, reason });
  const child = findMod(mods, childId);
  if (!child) return fail('找不到這個模組');
  if (child.mount) return fail('這個模組已經裝在別處，要先拆下才能換地方');
  const host = target && findMod(mods, target.module);
  if (!host || host.id === childId) return fail('找不到要接的模組');
  const mate = effectiveMates(list, mods, host.id, params).receive.find(r => r.id === target.mate);
  if (!mate) return fail('找不到這個承接面');
  const c = checkTarget(list, mods, childId, host, mate, params);
  if (!c.ok) return fail(c.reason);
  const to = { module: host.id, port: mate.port.id };
  // 底座自己被接到別人身上 → 底座跟著走：把那一串的頭（宿主往上找到沒安裝的那個）移到最前面。
  const rebase = res => {
    const roles = assemblyRoles(mods);
    if (roles.root !== childId) return res;
    const after = assemblyRoles(res.modules);
    let head = host.id;
    for (let n = 0; after.parent[head] != null && n < 64; n++) head = after.parent[head];
    return { ...res, modules: setAssemblyRoot(res.modules, head) };
  };
  if (mate.port.kind === 'bolt') {
    const r = connect(list, mods, childId, to, params, motorState);
    return r.ok ? rebase({ ...r, style: 'bolt' }) : fail(r.reason);
  }
  const attach = effectiveMates(list, mods, childId, params).attach;
  const r = connect(list, mods, childId, to, params, motorState, { joint: opts.jointKind || 'bracket-m3' });
  if (!r.ok) return fail(r.reason);
  let res = { ...r, style: 'hang' };
  if (attach) {   // 爪沿宿主邊伸出去：接合線方向＝安裝方向＋180°。
    const modules2 = r.modules.map(m => m.id === childId ? { ...m, mount: { ...m.mount, orient: withOrient(m.mount.orient, { childAxisDeg: normalizeDeg(attach.normalDeg + 180) }) } } : m);
    res = { ok: true, comps: r.comps, modules: modules2, style: 'hang' };
  }
  // M5a：同一根桿／同一條邊上已經有別人 → 排到最近的空位（既有的不動）；排不下就拒絕。
  const slot = freeSlot(res.comps, res.modules, childId, params);
  if (!slot.ok) return fail(slot.reason);
  if (slot.modules) res = { ...res, modules: slot.modules };
  return rebase(res);
}

// ---------- M5a：同一個承接構件上接好幾個 ----------
// 接合在宿主邊上占 [offset, offset+20] mm（沿邊座標，和 benchAdjust 的滑動同一套）。
// 桿的兩側（L／R）共用一份——孔都打在同一根桿上；三角板、機架板各邊自己一份。
const bodyKey = portId => {
  const s = String(portId || '');
  let m = /^edge:frame:(\d+)$/.exec(s);
  if (m) return `frame:${m[1]}`;
  if ((m = /^edge:(.+):e(\d+)$/.exec(s))) return `tri:${m[1]}:${m[2]}`;
  if ((m = /^edge:(.+):[LR]$/.exec(s))) return `bar:${m[1]}`;
  return null;
};
const portOfMount = (comps, modules, mount) => {
  const id = mountPortId(mount);
  if (id) return id;
  const bar = orthogonalHostBody(comps, modules, mount);   // 沒存 body 的舊接法：用輸出端的桿
  return bar ? `edge:${bar.id}:L` : null;
};
const offsetOfMod = m => (m && m.mount && m.mount.orient && Number.isFinite(m.mount.orient.offsetMm)) ? m.mount.orient.offsetMm : 0;

// 宿主 hostId 上、承接面 portId 所在那根桿／那條邊，已經有哪些直角接合：[{ child, from, to }]（依 from 排序，mm）。
// opts.except：不算這個模組（調整它自己的位置時用）。
export function mateOccupancy(comps, modules, hostId, portId, params, opts = {}) {
  const key = bodyKey(portId), list = asList(comps), mods = asList(modules);
  if (!key) return [];
  return mods.filter(m => m && m.id !== (opts && opts.except) && m.mount && m.mount.orient && m.mount.orient.type === 'orthogonal' && m.mount.to && m.mount.to.module === hostId && bodyKey(portOfMount(list, mods, m.mount)) === key)
    .map(m => ({ child: m.id, from: offsetOfMod(m), to: offsetOfMod(m) + ADAPTER_LENGTH_MM }))
    .sort((a, b) => a.from - b.from);
}

// 剛接上的 childId 若離既有的接合太近（起點差 < 24 mm），挪到最近的空位（先試 5 mm 一格，再試 1 mm 一格）。
// 回 { ok:true, modules? }（有挪才有 modules）或 { ok:false, reason }。
function freeSlot(comps, modules, childId, params) {
  const child = findMod(modules, childId), mount = child && child.mount;
  if (!mount || !mount.to || !mount.orient) return { ok: true };
  const hostId = mount.to.module, cur = offsetOfMod(child);
  const occ = mateOccupancy(comps, modules, hostId, portOfMount(comps, modules, mount), params, { except: childId });
  const free = v => occ.every(o => Math.abs(v - o.from) >= PITCH_MM - 1e-6);
  if (!occ.length || free(cur)) return { ok: true };
  const edge = orthogonalHostEdge(comps, modules, mount, pointCoords(comps), params, { home: true });
  if (!edge) return { ok: true };
  const half = edge.lengthMm / 2, lo = -half, hi = half - ADAPTER_LENGTH_MM;
  let pick = null;
  [5, 1].some(step => {
    for (let k = 1; k * step <= edge.lengthMm && pick === null; k++) {
      pick = [cur + k * step, cur - k * step].map(v => Math.round(v * 10) / 10).find(v => v >= lo - 1e-9 && v <= hi + 1e-9 && free(v)) ?? null;
    }
    return pick !== null;
  });
  if (pick === null) return { ok: false, reason: `「${labelOf(modules, hostId)}」這一段已經排滿了：每個接合占 20 mm、之間要留 ${GAP_MM} mm，放不下了。請換一個位置接，或先拆掉一個` };
  return { ok: true, modules: modules.map(m => m.id === childId ? { ...m, mount: { ...m.mount, orient: withOrient(m.mount.orient, { offsetMm: pick }) } } : m) };
}

// 同 benchAdjust；滑動／對齊的結果若和鄰居擠在一起（空隙 < 4 mm）就拒絕，原因講到鄰居的名字。其他動作原樣通過。
export function mateAdjust(comps, modules, childId, action, params, opts = {}) {
  const r = benchAdjust(comps, modules, childId, action, params, opts);
  if (!r.ok || !['slide+', 'slide-', 'align-start', 'align-center', 'align-end'].includes(action)) return r;
  const child = findMod(r.modules, childId), mount = child && child.mount;
  if (!mount || !mount.to) return r;
  const v = offsetOfMod(child), cur = offsetOfMod(findMod(modules, childId));
  const near = mateOccupancy(r.comps, r.modules, mount.to.module, portOfMount(r.comps, r.modules, mount), params, { except: childId })
    .filter(o => Math.abs(v - o.from) < PITCH_MM - 1e-6);
  if (!near.length || near.every(o => Math.abs(v - o.from) > Math.abs(cur - o.from) + 1e-9)) return r;   // 沒碰到，或本來就擠著、這步是在拉開
  const o = near.reduce((a, b) => Math.abs(v - b.from) < Math.abs(v - a.from) ? b : a);
  return { ok: false, comps, modules, reason: `會和旁邊的「${labelOf(modules, o.child)}」重疊：再${action === 'slide-' ? '往前' : action === 'slide+' ? '往後' : '移過去'}會擠在一起（兩個接合之間至少要留 ${GAP_MM} mm）` };
}

const DETACH_REASONS = {
  'no-module': '找不到這個機構',
  'not-mounted': '這個機構還沒裝在別人身上，不用拆',
  'host-invalid': '宿主目前解不出來，拆不下來',
  unsolved: '目前的姿勢解不出來，請先讓機構能動'
};
// 拆下：同 unmountModule，另回 moved＝跟著它一起回到「未安裝」的子孫數（它們彼此的接法保留）。
// 底座不變：拆下的若排在底座前面，不能因此搶走底座。
export function mateDetach(comps, modules, childId, params, motorState) {
  const mods = asList(modules), roles = assemblyRoles(mods);
  const r = unmountModule(comps, modules, childId, params, motorState);
  if (!r.ok) return { ok: false, comps, modules, moved: 0, reason: DETACH_REASONS[r.reason] || `拆不下來（${r.reason}）` };
  const moved = mods.filter(m => m && m.id !== childId && (() => { let p = roles.parent[m.id]; for (let n = 0; p != null && n < 64; n++, p = roles.parent[p]) if (p === childId) return true; return false; })()).length;
  const next = roles.root !== null && assemblyRoles(r.modules).root !== roles.root ? setAssemblyRoot(r.modules, roles.root) : r.modules;
  return { ...r, modules: next, moved };
}

// 已接好的機構接在誰的哪個承接面；沒安裝或找不到回 null。
export function mateOfMount(comps, modules, childId, params) {
  const child = findMod(modules, childId), mount = child && child.mount, to = mount && mount.to;
  if (!to || to.module == null || mount.face) return null;
  const host = findMod(modules, to.module);
  const portId = mountPortId(mount) || (to.output ? `bolt:${to.output}` : null);
  if (!host || !portId) return null;
  const hit = effectiveMates(comps, modules, host.id, params).receive.find(r => r.port && r.port.id === portId);
  return hit ? { module: host.id, mateId: hit.id, name: hit.name } : null;
}

// 目前的接法：'hang' 壓在邊上｜'stand-top' 立在上面｜'stand-bottom' 立在下面｜'bolt' 平貼對鎖｜null（沒安裝）。
export function mateStyle(modules, childId) {
  const m = findMod(modules, childId), mount = m && m.mount;
  if (!mount || !mount.to || mount.face) return null;
  const o = mount.orient;
  if (!o) return mount.to.output ? 'bolt' : null;
  if (o.type !== 'orthogonal') return null;
  return o.edge === 'child' ? (o.face === -1 ? 'stand-bottom' : 'stand-top') : 'hang';
}

// 換接法（回傳形狀同 benchAdjust）：壓在邊上↔立著用 'stand'、上面／下面用 'face'；
// 剛站起來時選「外法線最接近安裝方向」的底板邊（差 45° 以內，否則用預設）。
export function setMateStyle(comps, modules, childId, style, params, opts = {}) {
  const list = asList(comps), mods = asList(modules);
  const fail = reason => ({ ok: false, comps: list, modules: mods, reason });
  const cur = mateStyle(mods, childId);
  if (!cur) return fail('這個模組還沒安裝，沒有接法可換');
  if (!LABELS[style]) return fail('不認識的接法');
  if (style === cur) return { ok: true, comps: list, modules: mods };
  if (cur === 'bolt' || style === 'bolt') return fail('平貼對鎖只有一種接法，不能換成立在面上或壓在邊上');
  let st = { ok: true, comps: list, modules: mods };
  const step = action => { if (st.ok) st = benchAdjust(st.comps, st.modules, childId, action, params, opts); };
  if (style === 'hang') { step('stand'); return st; }
  if (cur === 'hang') {
    step('stand');
    if (!st.ok) return st;
    const attach = effectiveMates(st.comps, st.modules, childId, params).attach;
    if (attach) {
      let best = -1, bestDiff = 45.0001;
      moduleFrameEdges(st.comps, st.modules, childId, params, { noOwnHoles: true }).forEach((e, k) => {
        const diff = Math.abs(((Math.atan2(e.m.y, e.m.x) / D2R - attach.normalDeg + 540) % 360) - 180);
        if (diff < bestDiff) { best = k; bestDiff = diff; }
      });
      if (best >= 0) step(`child-edge:${best}`);
    }
  }
  if (st.ok && mateStyle(st.modules, childId) !== style) step('face');
  return st;
}

// 這個機構現在可選的接法（ok 是真的試過切換）。對鎖只有一種。
export function mateStyles(comps, modules, childId, params, opts = {}) {
  const cur = mateStyle(modules, childId);
  if (!cur) return [];
  if (cur === 'bolt') return [{ style: 'bolt', label: LABELS.bolt, ok: true, current: true }];
  return ['hang', 'stand-top', 'stand-bottom'].map(style => {
    const r = setMateStyle(comps, modules, childId, style, params, opts);
    const o = { style, label: LABELS[style], ok: r.ok, current: style === cur };
    if (!r.ok) o.reason = r.reason;
    return o;
  });
}
