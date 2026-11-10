/**
 * blocks / relations  (pack C1 of docs/SDD-CONNECTION-INTEGRITY.md)
 *
 * 接合關係的唯讀索引：由作品 { comps, modules, topo } 一次建立，各功能向它查詢，而不是各自掃描 id。
 * 純函式、無 DOM、不修改輸入。影子模式：目前沒有任何啟動模組引用本檔，只由 checkWork（integrity.js）與測試使用。
 *
 *   buildRelations(work) -> {
 *     copiesOf(id)            每份副本 {compId,key} 或 {compId,holeId}（含 m1/m2、局部孔、mountHoles、齒條孔）
 *     worldOf(id)             規範座標與副本差異 {x,y,spread,source,copies}
 *     holeRoles(compId,holeId) 三種孔用途 {machining,mountOccupied,constraint,reasons}
 *     isGround(id)/groundSource(id)
 *     motorOf(compId|pointId) 規範化的馬達關係，或 null
 *     attachmentsOf(compId)   全部關係 [{kind,otherId,via,field,direction}]（kind 見 KINDS；欄位表在 ref-fields.js，模組／組立接合在本檔）
 *     isFreeBody(compId)
 *   }
 * `machining` 的規則只有 used-holes.js 一份（C5 起不再各算一份）；本檔只決定哪一種孔要問它並附理由。
 */
import {pointKeysFor} from './part-types.js';
import {localHoles,holeWorld,idCounts} from '../core/local-holes.js';
import {isHoleUsed} from './used-holes.js';
import {isGroundPoint, motorRecords, motorRecordOf} from './motor-roles.js';
import {attachmentPoint,hasSyringeClamp,fixedSyringePointIds} from '../core/syringe.js';
import {compEdges,ownIdsOf} from './ref-fields.js';

const isStr = v => typeof v === 'string' && v !== '';
const hasId = p => !!p && typeof p === 'object' && isStr(p.id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const attempt = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

/** 作品形狀：匯出器傳 {...snapshot, topo: snapshot}；也容許只有其中一邊。 */
export function workParts(work) {
  const topo = work?.topo || {};
  return {
    comps: Array.isArray(work?.comps) ? work.comps.filter(c => c && typeof c === 'object') : [],
    modules: Array.isArray(work?.modules) ? work.modules : [],
    params: work?.params || topo.params || {},
    topo,
  };
}

/** attachmentsOf 的關係種類：每種關係有自己的 kind，由「引用者那一側的欄位」決定（欄位表見 ref-fields.js 與下方 moduleEdges）。 */
export const KINDS = ['shared-point', 'syringe', 'motor', 'fusion', 'plate-gear-fusion', 'mesh', 'rack', 'belt', 'reference',
  'module-mount', 'module-output', 'face-mount', 'bracket', 'tab-nut', 'rigid-group'];

// 模組與組立接合：只讀這些欄位（moduleId、模組 id、mount.to.module 是模組編號，不是零件，不算引用）。
// 回傳 [{kind,field,from,to,via,module?}]；from 是 `module:<id>`（模組本身的宣告）或零件 id（兩個零件之間的接合）。
function moduleEdges(comps, modules, owners) {
  const out = [], seen = new Set();
  const compsOf = id => (owners.get(id) || []).map(i => comps[i]);
  const push = (kind, field, from, to, via, module) => {
    const key = [kind, field, from, to, via].join('|');
    if (from === to || seen.has(key)) return;
    seen.add(key); out.push({kind, field, from, to, via, ...(module ? {module: true} : {})});
  };
  const ids = v => (Array.isArray(v) ? v : [v]).filter(isStr);
  const bodyOf = (modId, outId) => modules.find(m => m?.id === modId)?.outputs?.find(o => o?.id === outId)?.body;
  for (const m of modules) {
    if (!m || !isStr(m.id)) continue;
    const from = `module:${m.id}`, ref = (kind, field, v) => ids(v).forEach(id => compsOf(id).forEach(c => push(kind, field, from, c.id, id, true)));
    ref('module-mount', 'base', m.base);
    for (const o of Array.isArray(m.outputs) ? m.outputs : []) {
      const b = o?.body || {};
      ref('module-output', 'outputs.at', o?.at);
      ref('module-output', 'outputs.bolts', o?.bolts);
      if (b.kind === 'points') { ref('module-output', 'outputs.body.a', b.a); ref('module-output', 'outputs.body.b', b.b); }
      else ref('module-output', 'outputs.body', b.id);
    }
    // 剛性群組：基準板件（宿主輸出的 body）與每個成員模組的零件固定在一起。
    for (const g of Array.isArray(m.rigidGroups) ? m.rigidGroups : []) {
      const base = ids(bodyOf(m.id, g?.output)?.id)[0];
      if (base) for (const mem of ids(g?.members)) for (const c of comps) if (c.moduleId === mem) push('rigid-group', 'rigidGroups', base, c.id, g.id);
    }
    const mount = m.mount && typeof m.mount === 'object' ? m.mount : null, to = mount?.to, face = mount?.face;
    if (mount) {
      ref('module-mount', 'mount.to.body', to?.body);
      const host = ids(to?.body)[0] || ids(bodyOf(to?.module, to?.output)?.id)[0];          // 宿主零件：直接指定的 body，或宿主輸出端的 body
      if (!to?.body) ref('module-mount', 'mount.to.output', host);
      const sel = face?.selection || {};
      // 面接合的固定方式決定種類：榫槽＋螺絲 tab-nut、角碼 bracket、其餘 face-mount（只定位）。
      const kind = sel.fastener ? 'tab-nut' : sel.brackets ? 'bracket' : 'face-mount';
      for (const child of new Set([face?.childPart, sel.brackets?.childPart].filter(c => isStr(c) && c !== 'frame'))) {
        ref(kind, 'mount.face.childPart', child);
        if (host) compsOf(child).forEach(c => push(kind, 'mount.face.childPart', host, c.id, m.id));
      }
    }
    for (const r of Array.isArray(m.mates?.receive) ? m.mates.receive : []) if (r?.ref?.kind === 'bar' || r?.ref?.kind === 'triangle') ref('face-mount', 'mates.receive', r.ref.id);
    for (const k of ['part', 'attach']) if (m.faceParts?.[k] !== 'frame') ref('face-mount', 'faceParts.' + k, m.faceParts?.[k]);
  }
  return out;
}

export function buildRelations(work) {
  const {comps, modules, params} = workParts(work);
  const compIndex = new Map();
  comps.forEach((c, i) => { if (!compIndex.has(c.id)) compIndex.set(c.id, i); });
  const compById = id => compIndex.has(id) ? comps[compIndex.get(id)] : null;
  const memo = {};
  const once = (key, build) => key in memo ? memo[key] : (memo[key] = build());

  // ---------------------------------------------------------------- copies (points / holes)
  const copies = () => once('copies', () => {
    const byId = new Map();
    const add = (id, rec) => { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(rec); };
    for (const c of comps) {
      for (const k of pointKeysFor(c)) {
        const p = c[k];
        if (hasId(p)) add(p.id, {compId: c.id, key: k, x: Number(p.x), y: Number(p.y), type: p.type, physicalMotor: p.physicalMotor, host: false});
      }
      if (c.type === 'rack' && Array.isArray(c.holes)) {
        for (const h of c.holes) if (hasId(h)) add(h.id, {compId: c.id, holeId: h.id, where: 'rack', x: Number(h.x ?? c.p1?.x), y: Number(h.y ?? c.p1?.y), type: h.type, physicalMotor: h.physicalMotor, host: true});
      }
      if (c.p1 && c.p2) {
        for (const h of localHoles(c)) if (hasId(h)) add(h.id, {compId: c.id, holeId: h.id, where: 'holes', ...attempt(() => holeWorld(c, h), {x: NaN, y: NaN}), type: h.type, physicalMotor: h.physicalMotor, host: true});
        for (const h of c.standardBlank?.mountHoles || []) {
          if (hasId(h) && Number.isFinite(h.u) && Number.isFinite(h.v)) add(h.id, {compId: c.id, holeId: h.id, where: 'mountHoles', ...attempt(() => holeWorld(c, h), {x: NaN, y: NaN}), type: h.type, physicalMotor: h.physicalMotor, host: true});
        }
      }
    }
    return byId;
  });
  const copiesOf = id => (copies().get(id) || []).map(({host, ...r}) => ({...r}));
  const worldOf = id => {
    const list = copies().get(id) || [], ok = list.filter(r => Number.isFinite(r.x) && Number.isFinite(r.y));
    if (!ok.length) return null;
    // 孔屬於板件的幾何：有板上孔副本時以它為規範位置，其餘副本才是「跟著孔」的端點。
    const canon = ok.find(r => r.host) || ok[0];
    let spread = 0;
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) spread = Math.max(spread, dist(ok[i], ok[j]));
    return {x: canon.x, y: canon.y, spread, source: canon.holeId ? {compId: canon.compId, holeId: canon.holeId} : {compId: canon.compId, key: canon.key},
      copies: ok.map(r => ({compId: r.compId, ...(r.holeId ? {holeId: r.holeId} : {key: r.key}), x: r.x, y: r.y, offset: dist(r, canon)}))};
  };

  // ---------------------------------------------------------------- string references across comps + modules
  const refs = () => once('refs', () => {
    const list = [];                       // {kind:'comp'|'module', index, ownerId, path, value}
    const visit = (v, path, base) => {
      if (typeof v === 'string') { if (v) list.push({...base, path, value: v}); }
      else if (Array.isArray(v)) v.forEach((x, i) => visit(x, path ? `${path}.${i}` : String(i), base));
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) visit(v[k], path ? `${path}.${k}` : k, base);
    };
    comps.forEach((c, index) => visit(c, '', {kind: 'comp', index, ownerId: c.id}));
    modules.forEach((m, index) => visit(m, '', {kind: 'module', index, ownerId: m?.id}));
    const byValue = new Map();
    for (const r of list) { if (!byValue.has(r.value)) byValue.set(r.value, []); byValue.get(r.value).push(r); }
    return {list, byValue};
  });
  // id -> indexes of comps that own that id (comp id, point ids, hole ids)
  const owners = () => once('owners', () => {
    const m = new Map();
    comps.forEach((c, i) => ownIdsOf(c).forEach(id => { if (!m.has(id)) m.set(id, new Set()); m.get(id).add(i); }));
    return m;
  });

  // ---------------------------------------------------------------- attachments (field-directed; fields in ref-fields.js and moduleEdges)
  const edges = () => once('edges', () => {
    const own = new Map([...owners()].map(([id, set]) => [id, [...set]]));
    return [...compEdges(comps), ...moduleEdges(comps, modules, own)];
  });
  const attachmentsOf = compId => {
    const list = [];
    for (const e of edges()) {
      const m = e.module ? {module: true} : {};
      if (e.from === compId) list.push({kind: e.kind, otherId: e.to, via: e.via, field: e.field, direction: 'out', ...m});
      else if (e.to === compId) list.push({kind: e.kind, otherId: e.from, via: e.via, field: e.field, direction: 'in', ...m});
    }
    return list;
  };

  // ---------------------------------------------------------------- ground
  const lockedIds = () => once('locked', () => attempt(() => fixedSyringePointIds(comps), new Set()));
  const groundSource = id => {
    for (const r of copies().get(id) || []) if (isGroundPoint(r)) return r.type;
    return lockedIds().has(id) ? 'locked-plate' : null;
  };
  const isGround = id => groundSource(id) !== null;

  // ---------------------------------------------------------------- motors (field roles of SDD 3.1)
  const motors = () => once('motors', () => motorRecords(comps));
  const motorOf = id => {
    const rec = motorRecordOf(motors(), id);
    return rec ? {...rec, sources: {...rec.sources}} : null;
  };

  // ---------------------------------------------------------------- free body
  const isFreeBody = compId => {
    const c = compById(compId);
    if (!c) return false;
    const part = c.type === 'motor';
    const points = [...pointKeysFor(c).map(k => c[k]).filter(hasId), ...localHoles(c)];
    // 獨立馬達零件自己的軸心就是馬達／固定點，不算「接地」；尚未接任何關係時仍可自由擺放。
    if (!part && (c.isInput || c.physicalMotor != null || points.some(p => isGroundPoint(p) || p.physicalMotor))) return false;
    // 每個孔 id 只屬於這個零件
    const own = owners();
    for (const p of points) if ((own.get(p.id)?.size || 0) > 1) return false;
    return attachmentsOf(c.id).length === 0;
  };

  // ---------------------------------------------------------------- hole roles
  const syringeEnds = hostId => once('syr:' + hostId, () => {
    const out = [];
    for (const o of comps) for (const r of [o.a, o.b]) {
      if (!r || r.componentId !== hostId) continue;
      const q = attempt(() => attachmentPoint(r, comps, params), null);
      if (q && Number.isFinite(q.x) && Number.isFinite(q.y)) out.push({x: q.x, y: q.y, by: o.id, clamp: hasSyringeClamp(o)});
    }
    return out;
  });
  const holeRoles = (compId, holeId) => {
    const none = {found: false, machining: false, mountOccupied: false, constraint: false, reasons: {machining: [], mountOccupied: [], constraint: []}};
    const c = compById(compId);
    if (!c || !isStr(holeId)) return none;
    let p = null, kind = '', decl = '';
    const li = (Array.isArray(c.holes) ? c.holes : []).findIndex(h => h?.id === holeId);
    const mi = (c.standardBlank?.mountHoles || []).findIndex(h => h?.id === holeId);
    if (li >= 0) { p = c.holes[li]; kind = 'lattice'; decl = `holes.${li}.id`; }
    else if (mi >= 0) { p = c.standardBlank.mountHoles[mi]; kind = 'mount'; decl = `standardBlank.mountHoles.${mi}.id`; }
    else {
      const k = pointKeysFor(c).find(k => c[k]?.id === holeId);
      if (k) { p = c[k]; kind = 'primary'; decl = `${k}.id`; }
    }
    if (!p) return none;
    const reasons = {machining: [], mountOccupied: [], constraint: []};
    // 別處的引用（宣告本身不算）
    const external = (refs().byValue.get(holeId) || []).filter(r => !(r.kind === 'comp' && r.index === compIndex.get(compId) && r.path === decl));
    const refText = r => `${r.kind === 'comp' ? r.ownerId : '模組 ' + r.ownerId}.${r.path}`;
    const ground = isGroundPoint(p);
    // constraint：參與運動約束
    if (kind === 'primary') reasons.constraint.push('零件自己的主要孔');
    if (ground) reasons.constraint.push(`type=${p.type}`);
    if (p.physicalMotor) reasons.constraint.push('physicalMotor');
    for (const r of external) reasons.constraint.push(`被 ${refText(r)} 引用`);
    // mountOccupied：被馬達／管夾等安裝特徵占用或停放
    const world = kind === 'primary' || p.u == null ? p : attempt(() => holeWorld(c, p), null);
    if (kind === 'mount') reasons.mountOccupied.push('停放在 standardBlank.mountHoles');
    for (const o of comps) if (o.motorMount?.frameBody === c.id && o.motorMount.center === holeId) reasons.mountOccupied.push(`${o.id} 的馬達軸心 (motorMount.center)`);
    const syr = world ? syringeEnds(c.id).filter(s => Math.hypot(s.x - world.x, s.y - world.y) < 0.001) : [];
    for (const s of syr) if (s.clamp) reasons.mountOccupied.push(`${s.by} 的管夾`);
    // machining：需要加工成真正的孔（見 3.2；不與運動角色混用）。規則只有 used-holes.js 一份，這裡只決定「哪一種孔要問它」。
    if (!c.standardBlank) reasons.machining.push('非標準孔格件：整件依外形加工');
    else if (kind === 'mount') { if (p.manufactured === true) reasons.machining.push('manufactured'); }
    else if (c.drilled || c.standardBlank.drill === 'all') reasons.machining.push(c.drilled ? '已鑽孔 (drilled)' : 'standardBlank.drill=all');
    else if (isHoleUsed(c, p, comps, {modules, params, use: once('use', () => idCounts(comps, modules))})) reasons.machining.push('孔被使用（used-holes 規則：manufactured／接地／馬達／被引用／針筒接合）');
    return {found: true, kind, machining: reasons.machining.length > 0, mountOccupied: reasons.mountOccupied.length > 0, constraint: reasons.constraint.length > 0, reasons};
  };

  return {copiesOf, worldOf, holeRoles, isGround, groundSource, motorOf, attachmentsOf, isFreeBody,
    // 供 integrity.js 重用同一份掃描（不屬於對外契約）
    _internal: {comps, modules, params, topo: workParts(work).topo, compById, copies, motors, owners, edges}};
}
