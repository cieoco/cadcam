/**
 * blocks / mate-connect
 *
 * 選一個承接面 → 直接得到做得出來的接合（SDD-MATE-FACES §4，M3）。純函式，不碰 DOM、不改輸入。
 * 只是 mates／bench 上的薄薄一層：板邊→角碼直角（壓在邊上／立在上面／立在下面）、有 2 個以上對鎖孔的輸出端→平貼對鎖。
 * 幾何與接合都沿用 connect／benchAdjust，安裝紀錄不多存任何東西（接在哪個承接面由 mateOfMount 即時算）。
 */
import { effectiveMates } from './mates.js';
import { canConnect, connect, benchAdjust, mountPortId, isDescendant, withOrient, normalizeDeg } from './bench.js';
import { moduleFrameEdges } from './assembly.js';

const asList = v => Array.isArray(v) ? v : [];
const findMod = (modules, id) => asList(modules).find(m => m && m.id === id) || null;
const D2R = Math.PI / 180;
const LABELS = { hang: '壓在邊上', 'stand-top': '立在上面', 'stand-bottom': '立在下面', bolt: '平貼對鎖' };

// 輸出端的對鎖孔數（不到 2 個就不能對鎖）。
const boltCount = (host, port) => { const o = asList(host.outputs).find(x => x.id === port.output); return asList(o && o.bolts).length; };

// 這個承接面現在能不能接給 child；回 { ok, reason? }。
function checkTarget(comps, modules, childId, host, mate, params) {
  if (!mate.valid || !mate.port) return { ok: false, reason: '這個承接面指到的零件已經不在了，請重新設定' };
  if (isDescendant(asList(modules), host.id, childId)) return { ok: false, reason: '會形成環：這個機構已經是它的宿主（裝在它身上）' };
  if (mate.port.kind === 'bolt' && boltCount(host, mate.port) < 2) return { ok: false, reason: '這個輸出端只有 1 個孔，不能平貼對鎖' };
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
  if (mate.port.kind === 'bolt') {
    const r = connect(list, mods, childId, to, params, motorState);
    return r.ok ? { ...r, style: 'bolt' } : fail(r.reason);
  }
  const attach = effectiveMates(list, mods, childId, params).attach;
  const r = connect(list, mods, childId, to, params, motorState, { joint: opts.jointKind || 'bracket-m3' });
  if (!r.ok) return fail(r.reason);
  if (!attach) return { ...r, style: 'hang' };
  // 爪沿宿主邊伸出去：接合線方向＝安裝方向＋180°。
  const modules2 = r.modules.map(m => m.id === childId ? { ...m, mount: { ...m.mount, orient: withOrient(m.mount.orient, { childAxisDeg: normalizeDeg(attach.normalDeg + 180) }) } } : m);
  return { ok: true, comps: r.comps, modules: modules2, style: 'hang' };
}

// 已接好的機構接在誰的哪個承接面；沒安裝或找不到回 null。
export function mateOfMount(comps, modules, childId, params) {
  const child = findMod(modules, childId), mount = child && child.mount, to = mount && mount.to;
  if (!to || to.module == null) return null;
  const host = findMod(modules, to.module);
  const portId = mountPortId(mount) || (to.output ? `bolt:${to.output}` : null);
  if (!host || !portId) return null;
  const hit = effectiveMates(comps, modules, host.id, params).receive.find(r => r.port && r.port.id === portId);
  return hit ? { module: host.id, mateId: hit.id, name: hit.name } : null;
}

// 目前的接法：'hang' 壓在邊上｜'stand-top' 立在上面｜'stand-bottom' 立在下面｜'bolt' 平貼對鎖｜null（沒安裝）。
export function mateStyle(modules, childId) {
  const m = findMod(modules, childId), mount = m && m.mount;
  if (!mount || !mount.to) return null;
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
