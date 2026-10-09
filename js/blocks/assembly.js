/**
 * blocks / assembly
 *
 * 模組組合求解（SDD-ASSEMBLY-MODULES §4.1）：純函式，不碰 DOM。
 * 每個模組是 comps 的一個子集（comp.moduleId 標記；沒有標記＝根），各自用既有
 * compileTopology／solveTopology 獨立求解；已安裝（mount）的模組，解出的點再乘上
 * 剛體變換 T = 宿主輸出端目前位姿 ∘ mount.ref⁻¹ 併入世界座標。
 * solver／topology 一行不改。
 */
import { compileTopology } from '../core/topology.js';
import { solveTopology, sweepTopology, validateSweepRange } from '../multilink/solver.js';
import { pointKeysFor } from './part-types.js';
import { memberStock } from './member-stock.js';
import { frameOutlineEdges, safeName } from './exporters.js?v=20261007_7';   // C1：機架外框直邊、零件檔名
import { frameConnectorNodes, pointCoords } from './model.js';
import { adapterChildHoles } from './orthogonal-joint.js';   // D2：子模組底板上的轉接座孔（只在呼叫時用，與本檔互相引用無妨）
import { assemblyRoles, machineComps } from './assembly-roles.js';   // M5a：底座／機器／未安裝（純函式，不回頭引用本檔）
import {readConnectionHost} from './connection-descriptor.js';
import {frameStockOf} from './frame-stock.js';

const D2R = Math.PI / 180;
const IDENTITY_POSE = { x: 0, y: 0, a: 0 };
const POINT_KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];

// 剛體變換：把「以 ref 姿態記錄」的點 p，轉成「now 姿態下」的世界座標。
function transformPoint(p, ref, now) {
  const rad = (now.a - ref.a) * D2R;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = p.x - ref.x, dy = p.y - ref.y;
  return { x: now.x + dx * cos - dy * sin, y: now.y + dx * sin + dy * cos };
}

// transformPoint 的反變換：世界座標 → ref 姿態下的座標（給 _prevPoints 當種子用）。
function inverseTransformPoint(p, ref, now) {
  const rad = -(now.a - ref.a) * D2R;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = p.x - now.x, dy = p.y - now.y;
  return { x: ref.x + dx * cos - dy * sin, y: ref.y + dx * sin + dy * cos };
}

// 依安裝相依排序：宿主一定排在被裝上的模組前面（DFS 後序：先遞迴宿主再放自己）。
function sortModulesByMountOrder(modules) {
  const byId = new Map(modules.map(m => [m.id, m]));
  const result = [];
  const visited = new Set();
  const visiting = new Set();
  const visit = (m) => {
    if (!m || visited.has(m.id) || visiting.has(m.id)) return;
    visiting.add(m.id);
    if (m.mount && m.mount.to && byId.has(m.mount.to.module)) visit(byId.get(m.mount.to.module));
    visiting.delete(m.id);
    visited.add(m.id);
    result.push(m);
  };
  modules.forEach(visit);
  return result;
}

export function compileAssembly(comps, modules, topo) {
  const allComps = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  if (!modList.length) {
    const single = compileTopology(allComps, topo, new Set());
    return { single, units: [], params: single.params, tracePoint: topo?.tracePoint };
  }
  const compileUnit = (unitComps) => unitComps.length
    ? compileTopology(unitComps, { ...topo, params: { ...(topo?.params || {}) } }, new Set())
    : null;
  const rootComps = allComps.filter(c => !c.moduleId);
  const rootCompiled = compileUnit(rootComps);
  const units = [{ id: '#root', comps: rootComps, compiled: rootCompiled, mount: null }];
  const mergedParams = { ...(rootCompiled ? rootCompiled.params : {}) };
  sortModulesByMountOrder(modList).forEach(m => {
    const modComps = allComps.filter(c => c.moduleId === m.id);
    const compiled = compileUnit(modComps);
    if (compiled) Object.assign(mergedParams, compiled.params);
    units.push({ id: m.id, comps: modComps, compiled, mount: m.mount || null, module: m });
  });
  return { single: null, units, params: mergedParams, tracePoint: topo?.tracePoint };
}

// 輸出端位姿：位置取 at 解出的位置，方向取 body 對應構件的方位角（SDD §3.2）。
export function outputPose(module, outputId, points, comps) {
  if (!module || !Array.isArray(module.outputs)) return null;
  const output = module.outputs.find(o => o.id === outputId);
  if (!output) return null;
  const posPt = points && points[output.at];
  if (!posPt || !Number.isFinite(posPt.x) || !Number.isFinite(posPt.y)) return null;
  const body = output.body;
  if (!body) return null;
  const compList = Array.isArray(comps) ? comps : [];
  const bodyComp = body.id ? compList.find(c => c.id === body.id) : null;
  const dirFromPoints = (id1, id2) => {
    const a = points[id1], b = points[id2];
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
    return Math.atan2(b.y - a.y, b.x - a.x) / D2R;
  };
  let angleDeg = null;
  if (body.kind === 'bar' || body.kind === 'triangle') {
    if (!bodyComp || !bodyComp.p1?.id || !bodyComp.p2?.id) return null;
    angleDeg = dirFromPoints(bodyComp.p1.id, bodyComp.p2.id);
  } else if (body.kind === 'rack') {
    if (!bodyComp) return null;
    angleDeg = Number(bodyComp.axisDeg);
    if (!Number.isFinite(angleDeg)) angleDeg = null;
  } else if (body.kind === 'slider') {
    if (!bodyComp || !bodyComp.p1?.id || !bodyComp.p2?.id) return null;
    angleDeg = dirFromPoints(bodyComp.p1.id, bodyComp.p2.id);
    if (angleDeg === null) {
      const p1 = bodyComp.p1, p2 = bodyComp.p2;
      if (p1 && p2 && Number.isFinite(p1.x) && Number.isFinite(p1.y) && Number.isFinite(p2.x) && Number.isFinite(p2.y)) {
        angleDeg = Math.atan2(p2.y - p1.y, p2.x - p1.x) / D2R;
      }
    }
  } else if (body.kind === 'points') {
    angleDeg = dirFromPoints(body.a, body.b);
  } else {
    return null;
  }
  if (!Number.isFinite(angleDeg)) return null;
  return { x: posPt.x, y: posPt.y, a: angleDeg };
}

// 直角安裝的宿主桿：mount.to.body 有值就取該根桿（任一根桿的邊都能裝），
// 否則取宿主輸出端的 body（必須是桿）。找不到或不是桿 → null。純函式。
export function orthogonalHostBody(comps, modules, mount) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const to = mount && mount.to;
  if (!to) return null;
  const identity=readConnectionHost({comps:list,modules:modList,mount});
  if(!identity.available || identity.partKind!=='bar')return null;
  const host = modList.find(m => m && m.id === to.module);
  if (!host) return null;
  let bodyId = null;
  if (to.body) bodyId = to.body;
  else {
    const output = (host.outputs || []).find(o => o.id === to.output);
    if (!output || !output.body || output.body.kind !== 'bar') return null;
    bodyId = output.body.id;
  }
  const bar = list.find(c => c && c.id === bodyId && c.moduleId===identity.moduleId);
  return bar && bar.type === 'bar' && bar.p1 && bar.p2 ? bar : null;
}

// ---- C1：直角接口的宿主「邊」（桿的長邊／三角板的邊／機架板外框的直邊）----

const EDGE_EPS = 1e-9;
// m＝side·left(d)（left＝(−d.y, d.x)）：由外法線 m 反推 side。
const sideOfM = (d, m) => (m.x * -d.y + m.y * d.x) >= 0 ? 1 : -1;

// 世界機架（不屬於已安裝模組的零件）外框的每一段直邊；opts.exportSettings 缺省時用預設匯出設定。
// M5a：多個未安裝的機構時，機架板只算「那個宿主自己的」——opts.hostId 缺省＝底座（整台機器的機架）。
export function worldFrameEdges(comps, modules, opts = {}) {
  const nodes = frameConnectorNodes(hostFrameComps(comps, modules, opts && opts.hostId));
  return frameOutlineEdges(nodes, (opts && opts.exportSettings) || {}).map(e=>({...e,stockThicknessMm:frameStockOf(nodes).thicknessMm}));
}

// 直角安裝的宿主邊（mount.to 決定）：
//   to.body（桿）＋ orient.side  → 桿的 L／R 長邊；
//   to.body（三角板）＋ to.edge  → 三角板第 k 條邊（0＝p1→p2、1＝p2→p3、2＝p3→p1），side 取使 m 朝外（離開板心）的那一邊；
//   to.frame.edge                → 世界機架板外框第 k 段直邊（每次由目前節點重算），m 朝外；
//                                  宿主模組已安裝時改為它自己的底板（<id>-frame）外框第 k 段（D2，見 mountedFrameEdge）。
// opts.home＝true：已安裝宿主的底板邊用匯出（home）座標、不套目前位姿；opts.asm／opts.cache：底板外框的快取；opts.stockMm：板厚。
// 回傳 { kind, a, b, d, m, side, lengthMm, partName, compId, moves, pose }：
//   a→b＝邊線端點（已朝外挪半個板寬，即實際板外緣）、d＝沿邊單位向量、m＝外法線＝side·left(d)、
//   partName＝宿主零件在製作清單的名稱（機架為 'frame'）、moves＝宿主是否會動、pose＝{ x, y, a }（mount.ref 用的宿主位姿）。
// 找不到宿主、點未解出或邊不存在 → null。純函式。points 是世界座標點表（求解結果或靜態座標）。
export function orthogonalHostEdge(comps, modules, mount, points, params, opts = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const to = mount && mount.to;
  if (!to) return null;
  // to.module 為 null＝根（只給 autoPorts 推導接口用；真正的安裝一定指向某個模組）
  if (to.module != null && !modList.some(m => m && m.id === to.module)) return null;
  // Persisted host identity is shared with face reads; never borrow another
  // module's equally named body. null-module frame ports are unsaved autoPorts.
  if(to.module!=null&&!readConnectionHost({comps:list,modules:modList,mount}).available)return null;
  const angleOf = d => Math.atan2(d.y, d.x) / D2R;
  if (to.frame !== undefined) {
    const k = to.frame && to.frame.edge;
    if (!Number.isInteger(k) || k < 0) return null;
    // D2：宿主是「已安裝的模組」→ 它自己的底板（<id>-frame），隨模組剛體移動；否則是靜止的世界機架板。
    const hostMod = to.module != null ? modList.find(m => m && m.id === to.module) : null;
    if (hostMod && hostMod.mount && hostMod.mount.to && hostMod.mount.to.module != null) return mountedFrameEdge(list, modList, hostMod, k, points, params, opts);
    const e = worldFrameEdges(list, modList, { ...opts, hostId: to.module })[k];
    if (!e) return null;
    return {
      kind: 'frame', a: e.a, b: e.b, d: e.d, m: e.m, side: sideOfM(e.d, e.m), lengthMm: e.lengthMm,
      partName: 'frame', compId: null, moves: false, stockThicknessMm:e.stockThicknessMm,pose: { x: e.a.x, y: e.a.y, a: angleOf(e.d) }
    };
  }
  const comp = to.body ? list.find(c => c && c.id === to.body) : orthogonalHostBody(list, modList, mount);
  if (!comp) return null;
  const pt = p => (p && p.id && points ? points[p.id] : null);
  const isFixed = p => !!p && p.type === 'fixed';
  if (comp.type === 'bar' && comp.p1 && comp.p2) {
    const p1 = pt(comp.p1), p2 = pt(comp.p2);
    if (!validPt(p1) || !validPt(p2)) return null;
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!(len > EDGE_EPS)) return null;
    const d = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len };
    const side = mount.orient && mount.orient.side === -1 ? -1 : 1;
    const m = { x: side * -d.y, y: side * d.x };
    const h = memberStock(comp).widthMm / 2;
    const pv = comp.lenParam && params ? params[comp.lenParam] : undefined;
    return {
      kind: 'bar', a: { x: p1.x + m.x * h, y: p1.y + m.y * h }, b: { x: p2.x + m.x * h, y: p2.y + m.y * h },
      d, m, side, lengthMm: Number.isFinite(pv) && pv > 0 ? pv : len, partName: safeName(comp.id), compId: comp.id,
      moves: !(isFixed(comp.p1) && isFixed(comp.p2)), pose: { x: p1.x, y: p1.y, a: angleOf(d) }
    };
  }
  if (comp.type === 'triangle' && comp.shape !== 'jaw' && comp.p1 && comp.p2 && comp.p3 && Number.isInteger(to.edge) && to.edge >= 0 && to.edge <= 2) {
    const vs = [comp.p1, comp.p2, comp.p3];
    const P = vs.map(pt);
    if (!P.every(validPt)) return null;
    const A = P[to.edge], B = P[(to.edge + 1) % 3];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    if (!(len > EDGE_EPS)) return null;
    const d = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
    const cx = (P[0].x + P[1].x + P[2].x) / 3, cy = (P[0].y + P[1].y + P[2].y) / 3;
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const side = (-d.y * (mid.x - cx) + d.x * (mid.y - cy)) >= 0 ? 1 : -1;   // 外法線＝離開板心
    const m = { x: side * -d.y, y: side * d.x };
    const h = memberStock(comp).widthMm / 2;
    return {
      kind: 'triangle', a: { x: A.x + m.x * h, y: A.y + m.y * h }, b: { x: B.x + m.x * h, y: B.y + m.y * h },
      d, m, side, lengthMm: len, partName: safeName(comp.id), compId: comp.id,
      moves: !vs.every(isFixed), pose: { x: A.x, y: A.y, a: angleOf(d) }
    };
  }
  return null;
}

// ---- D2：已安裝模組自己的底板（<id>-frame）外框的邊 ----

// F1：快取鍵要含接合件規格（角碼短腳孔距會改變子模組底板外框）。
const jointCacheKey = joint => (joint && joint.bracket ? `${joint.bracket.shortLegMm}/${joint.bracket.holeEndMm}` : '');
const ASM_FRAME_CACHE = new WeakMap();   // asm → Map（同一次編譯內底板外框不變，求解迴圈裡不必重算）

// 模組 mod 的 home 姿態解：只解「未安裝的單元＋mod 的安裝鏈」，不含其他已安裝模組，
// 所以不會因為底板邊又回頭求解整個組合而無限遞迴（鏈上每一層都只依賴更上一層）。
function solveHomeChain(list, modList, mod, topoParams, asm) {
  const base = asm && asm.units ? asm : compileAssembly(list, modList, { params: topoParams || {} });
  if (!base.units) return null;
  const byId = new Map(modList.map(m => [m.id, m]));
  const chain = new Set();
  for (let cur = mod; cur && !chain.has(cur.id); cur = cur.mount && cur.mount.to ? byId.get(cur.mount.to.module) : null) chain.add(cur.id);
  const sub = { ...base, units: base.units.filter(u => !u.mount || chain.has(u.id)) };
  try {
    const sol = solveAssembly(sub, { thetaDeg: 0, motorAngles: { ...((mod.mount && mod.mount.home) || {}) } });
    return sol && sol.points ? sol.points : null;
  } catch (e) { return null; }
}

// 已安裝模組底板的外框直邊（home／匯出座標，與 moduleFrameExports＋moduleFrameNodes＋frameGeometry 同一套規則）。
// 加入子模組孔前會解析宿主邊方向；巢狀時沿 mount 鏈往父模組計算，不會回到目前模組。
// 轉接座孔是 outlineExempt、不撐大外框；本模組自己直角安裝用的子模組端轉接座孔不豁免（它確實在板上），一併算入。
// 回傳 [{ a, b, d, m, lengthMm }]；找不到模組或沒有安裝 → []。
export function moduleFrameEdges(comps, modules, moduleId, params, opts = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  if (!mod || !mod.mount) return [];
  const cache = opts.asm ? (ASM_FRAME_CACHE.get(opts.asm) || ASM_FRAME_CACHE.set(opts.asm, new Map()).get(opts.asm)) : (opts.cache instanceof Map ? opts.cache : null);
  // D3：立在宿主板面上（edge 'child'）時，站立邊就是這個外框的一條邊，轉接座孔在外框之內，不能反過來參與外框（會循環）。
  const standing = !!(opts.noOwnHoles || (mod.mount.orient && mod.mount.orient.edge === 'child'));
  let hostEdge = null;
  if (mod.mount.orient && mod.base && !standing) hostEdge = orthogonalHostEdge(list, modList, mod.mount, pointCoords(list), params, { ...opts, home: true });
  const hostSide = hostEdge && hostEdge.side;
  const key = `${moduleId}|${opts.stockMm || ''}|${jointCacheKey(opts.joint)}|${opts.exportSettings ? JSON.stringify(opts.exportSettings) : ''}|${standing ? 's' : hostSide ?? ''}`;
  if (cache && cache.has(key)) return cache.get(key);
  const entry = frameEntryOf(list, modList, mod, params || {}, () => solveHomeChain(list, modList, mod, opts.asm ? null : params, opts.asm));
  let nodes = moduleFrameNodes(entry, frameConnectorNodes(entry.comps));
  if (mod.mount.orient && mod.base && !standing) {
    const pts = pointCoords(list);
    const to = mod.mount.to;
    const bar = to && to.body ? list.find(c => c && c.id === to.body) : null;
    const holes = adapterChildHoles({ base: pts[mod.base], orient: mod.mount.orient, bar, hostSide: hostEdge ? hostEdge.side : undefined, hostThicknessMm:hostPlateThickness(list,hostEdge,opts.stockMm),stockMm: opts.stockMm || 3, joint: opts.joint });
    nodes = [...nodes, ...holes.map((h, i) => ({ id: `ADP_${moduleId}_${i}`, x: h.x, y: h.y }))];
  }
  const edges = frameOutlineEdges(nodes, opts.exportSettings || {});
  if (cache) cache.set(key, edges);
  return edges;
}

// 已安裝模組底板的第 k 段邊在「目前位姿」的幾何：home 座標的邊套上與求解器相同的剛體變換。
//   同平面安裝：宿主輸出端目前位姿 vs mount.ref（transformPoint）；直角／六面安裝：模組在自己的平面靜止＝不變；
//   巢狀時 points 已是各層求解後的座標，宿主輸出端的位姿自然包含上層的運動。
function mountedFrameEdge(list, modList, mod, k, points, params, opts) {
  const e = moduleFrameEdges(list, modList, mod.id, params, opts)[k];
  if (!e) return null;
  let ref = IDENTITY_POSE, now = IDENTITY_POSE;
  if (!opts.home && !mod.mount.orient && !mod.mount.face) {
    const host = modList.find(m => m && m.id === mod.mount.to.module);
    const p = host ? outputPose(host, mod.mount.to.output, points, list.filter(c => c && c.moduleId === host.id)) : null;
    if (!p) return null;
    now = p;
    ref = mod.mount.ref || IDENTITY_POSE;
  }
  const rad = (now.a - ref.a) * D2R, cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = v => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos });
  const a = transformPoint(e.a, ref, now), b = transformPoint(e.b, ref, now);
  const d = rot(e.d), m = rot(e.m);
  return {
    kind: 'frame', a, b, d, m, side: sideOfM(d, m), lengthMm: e.lengthMm,
    partName: `${mod.id}-frame`, compId: null, moves: true, frameModule: mod.id,stockThicknessMm:frameStockOf(frameConnectorNodes(list.filter(c=>c.moduleId===mod.id))).thicknessMm,
    pose: { x: a.x, y: a.y, a: Math.atan2(d.y, d.x) / D2R }
  };
}

export function solveAssembly(asm, params) {
  if (asm.single) return solveTopology(asm.single, params);
  const points = {};
  const perModule = {};
  const orthogonal = {};   // 直角／六面安裝模組：{ host, now }（子模組點不做 2D 變換）
  for (const unit of asm.units) {
    if (!unit.compiled) continue;
    let ref = IDENTITY_POSE, now = IDENTITY_POSE;
    if (unit.mount) {
      const host = asm.units.find(u => u.id === unit.mount.to.module);
      if (unit.mount.to.body || unit.mount.to.frame) {
        // 直角安裝到桿／三角板／機架板的邊：宿主位姿＝邊的起點與方向（桿＝p1 與 p1→p2）；宿主點都要解出來。
        const allComps = asm.units.flatMap(u => u.comps || []);
        const allMods = asm.units.filter(u => u.module).map(u => u.module);
        const e = unit.mount.orient || unit.mount.face ? orthogonalHostEdge(allComps, allMods, unit.mount, points, params, { asm }) : null;
        now = e ? e.pose : null;
      } else {
        now = host && host.module ? outputPose(host.module, unit.mount.to.output, points, host.comps) : null;
      }
      if (!now) { perModule[unit.id] = { isValid: false, reason: 'host-invalid' }; continue; }
      if (unit.mount.orient || unit.mount.face) {
        // 直角／六面安裝：子模組在自己的平面求解，點座標維持原樣，位姿另外回報給 3D／側影帶用。
        orthogonal[unit.id] = { host: unit.mount.to.module, now };
        now = IDENTITY_POSE;
      } else {
        ref = unit.mount.ref;
      }
    }
    let unitParams = params;
    if (params && params._prevPoints) {
      const local = {};
      for (const id in params._prevPoints) {
        const p = params._prevPoints[id];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) local[id] = inverseTransformPoint(p, ref, now);
      }
      unitParams = { ...params, _prevPoints: local };
    }
    const sol = solveTopology(unit.compiled, unitParams);
    for (const id in sol.points) {
      const p = sol.points[id];
      points[id] = (p && Number.isFinite(p.x) && Number.isFinite(p.y)) ? transformPoint(p, ref, now) : p;
    }
    perModule[unit.id] = { isValid: !!sol.isValid, reason: sol.isValid ? 'ok' : 'solve-invalid' };
  }
  const isValid = Object.values(perModule).every(m => m.isValid);
  const B = asm.tracePoint ? points[asm.tracePoint] : undefined;
  return { isValid, points, B, perModule, orthogonal };
}

export function sweepAssembly(asm, params, startDeg, endDeg, stepDeg) {
  validateSweepRange(startDeg, endDeg, stepDeg);
  if (asm.single) return sweepTopology(asm.single, params, startDeg, endDeg, stepDeg);
  const results = [];
  const validRanges = [];
  const invalidRanges = [];
  let currentValid = null;
  let currentInvalid = null;
  let prevPoints = null;
  const sweepMotor = params && params.sweepMotor ? String(params.sweepMotor) : null;
  for (let th = startDeg; th <= endDeg; th += stepDeg) {
    const stepParams = { ...params, thetaDeg: th, _prevPoints: prevPoints };
    if (sweepMotor) stepParams.motorAngles = { ...(params.motorAngles || {}), [sweepMotor]: th };
    const sol = solveAssembly(asm, stepParams);
    const isValid = sol.isValid;
    results.push({ theta: th, isValid, B: isValid ? sol.B : null, points: isValid ? sol.points : null });
    if (isValid) {
      prevPoints = sol.points;
      if (currentInvalid) { invalidRanges.push(currentInvalid); currentInvalid = null; }
      if (!currentValid) currentValid = { start: th, end: th };
      else currentValid.end = th;
    } else {
      if (currentValid) { validRanges.push(currentValid); currentValid = null; }
      if (!currentInvalid) currentInvalid = { start: th, end: th };
      else currentInvalid.end = th;
    }
  }
  if (currentValid) validRanges.push(currentValid);
  if (currentInvalid) invalidRanges.push(currentInvalid);
  return { results, validRanges, invalidRanges };
}

// rebake 的剛體變換（SDD §4.1）：點座標整組平移＋旋轉；世界方向角度欄位 +δ；
// 局部座標（三角板 vertices 的 u,v、齒條 holes 的 u,v）與馬達角（servoStart/End）不動。
export function transformComp(comp, ref, now, deltaDeg) {
  const out = { ...comp };
  POINT_KEYS.forEach(k => {
    const pt = out[k];
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      const np = transformPoint(pt, ref, now);
      out[k] = { ...pt, x: np.x, y: np.y };
    }
  });
  if (comp.type === 'gear' && Number.isFinite(comp.phase)) out.phase = comp.phase + deltaDeg;
  else if (comp.type === 'pulley' && Number.isFinite(comp.phase)) out.phase = comp.phase + deltaDeg;
  else if (comp.type === 'rack' && Number.isFinite(comp.axisDeg)) out.axisDeg = comp.axisDeg + deltaDeg;
  else if (comp.type === 'cam' && Number.isFinite(comp.axisDeg)) out.axisDeg = comp.axisDeg + deltaDeg;
  if (comp.type === 'bar' && Number.isFinite(comp.phaseOffset) && !comp.motorCarrier) out.phaseOffset = comp.phaseOffset + deltaDeg;
  return out;
}

export function rebakeModules(comps, modules, params) {
  let curComps = JSON.parse(JSON.stringify(comps || []));
  let curModules = JSON.parse(JSON.stringify(modules || []));
  let changed = false;
  const order = sortModulesByMountOrder(curModules).map(m => m.id);
  for (const modId of order) {
    const idx = curModules.findIndex(m => m.id === modId);
    const mod = curModules[idx];
    if (!mod || !mod.mount) continue;
    if (mod.mount.orient || mod.mount.face) continue;   // 直角／六面安裝：座標存在自己的平面，不 rebake
    const asm = compileAssembly(curComps, curModules, { params });
    const sol = solveAssembly(asm, { thetaDeg: 0, motorAngles: { ...(mod.mount.home || {}) } });
    const hostId = mod.mount.to.module;
    const hostModule = curModules.find(m => m.id === hostId);
    const hostComps = curComps.filter(c => c.moduleId === hostId);
    const H = hostModule ? outputPose(hostModule, mod.mount.to.output, sol.points, hostComps) : null;
    if (!H) continue;
    const ref = mod.mount.ref;
    // 角度差換算到 (-180, 180]：180° 與 -180° 是同一方向，不可當成轉了一圈。
    const delta = ((H.a - ref.a) % 360 + 540) % 360 - 180;
    const unchanged = Math.abs(H.x - ref.x) < 1e-9 && Math.abs(H.y - ref.y) < 1e-9 && Math.abs(delta) < 1e-9;
    if (unchanged) continue;
    curComps = curComps.map(c => c.moduleId === mod.id ? transformComp(c, ref, H, delta) : c);
    curModules[idx] = { ...mod, mount: { ...mod.mount, ref: { x: H.x, y: H.y, a: H.a } } };
    changed = true;
  }
  return { comps: curComps, modules: curModules, changed };
}

// ---- 直角安裝的 3D 位姿與宿主視圖側影帶（SDD-ORTHOGONAL-MOUNT O2）----

const validPt = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

// 直角子模組的 3D 座標系：origin＝宿主構件那一側邊緣的中點；d＝構件方向；m＝離開宿主邊緣的外法線；
// n＝子模組平面的法線（離開宿主平面）；base／e／f＝子模組平面上的基準點與接合軸（e）及其垂直軸（f）。
// 不是直角安裝、輸出構件不是桿、或點未解出 → null。純函式。
// opts.asm：已編譯的組合（compileAssembly 的結果），已安裝宿主的底板外框用它快取，播放時才不必每幀重算。
export function orthogonalFrame(comps, modules, moduleId, points, params, opts = {}) {
  const modList = Array.isArray(modules) ? modules : [];
  const list = Array.isArray(comps) ? comps : [];
  const mod = modList.find(m => m.id === moduleId);
  const face = mod && mod.mount && mod.mount.face;
  if (face) {
    const host = modList.find(m => m.id === mod.mount.to.module);
    const hostPose = host ? (mod.mount.to.frame ? orthogonalHostEdge(list,modList,mod.mount,points,params,opts)?.pose : outputPose(host, mod.mount.to.output, points, list.filter(c => c && c.moduleId === host.id))) : null;
    if (!hostPose) return null;
    // Face transforms and drilling are authored in the design geometry, not the
    // solved theta-zero pose stored by older mounts. Use the same design frame
    // as the stock holes; this also repairs existing saved face placements.
    const hostComps = list.filter(c => c && c.moduleId === host.id);
    const ref = mod.mount.to.frame ? orthogonalHostEdge(list,modList,mod.mount,pointCoords(list),params,{...opts,home:true})?.pose : outputPose(host, mod.mount.to.output, pointCoords(hostComps), hostComps);
    if (!ref) return null;
    const angle = (hostPose.a - ref.a) * D2R, cos = Math.cos(angle), sin = Math.sin(angle);
    const rotate = v => ({ x: cos * v[0] - sin * v[1], y: sin * v[0] + cos * v[1], z: v[2] });
    const transform = face.rotation, t = face.translation;
    const origin = transformPoint({ x: t.x, y: t.y }, ref, hostPose);
    return {
      origin: { ...origin, z: t.z },
      d: rotate([transform[0][0], transform[1][0], transform[2][0]]),
      n: rotate([transform[0][1], transform[1][1], transform[2][1]]),
      m: rotate([transform[0][2], transform[1][2], transform[2][2]]),
      base: { x: 0, y: 0 }, e: { x: 1, y: 0 }, f: { x: 0, y: 1 }
    };
  }
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return null;
  const edge = orthogonalHostEdge(list, modList, mod.mount, points, params, opts);
  if (!edge) return null;
  const { d, m, side } = edge;
  const off = Number.isFinite(orient.offsetMm) ? orient.offsetMm : 0;   // 沿 d 滑動的位置（從邊中點起算）
  const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
  if (orient.edge === 'child') {
    // D3：子模組的底板立在宿主板面上，正面貼齊宿主的邊；n＝板面法線（face 1＝上面 +z），d＝n×m。
    const se = standEdgeOf(list, modList, mod, params, opts);
    if (!se) return null;
    const T = hostPlateThickness(list, edge, opts.stockMm);
    const face = orient.face === -1 ? -1 : 1;
    return tiltFrame({
      origin: { x: mid.x + off * d.x - T * m.x, y: mid.y + off * d.y - T * m.y, z: face === 1 ? T : 0 },
      d: { x: -face * m.y, y: face * m.x, z: 0 },
      m: { x: m.x, y: m.y, z: 0 },
      n: { x: 0, y: 0, z: face },
      base: se.base, e: se.e, f: se.f
    }, orient.tiltDeg);
  }
  const base = mod.base && points ? points[mod.base] : null;
  if (!validPt(base)) return null;
  const rad = orient.childAxisDeg * D2R;
  const e = { x: Math.cos(rad), y: Math.sin(rad) };
  return tiltFrame({
    origin: { x: mid.x + off * d.x, y: mid.y + off * d.y, z: 0 },
    d: { x: d.x, y: d.y, z: 0 },
    m: { x: m.x, y: m.y, z: 0 },
    n: { x: 0, y: 0, z: -side },
    base: { x: base.x, y: base.y },
    e,
    f: { x: -e.y, y: e.x }
  }, orient.tiltDeg);
}

// D4：傾斜——整個子模組繞接合線（過 origin、沿 d）轉 α＝tiltDeg：n′＝cosα·n＋sinα·m、m′＝cosα·m−sinα·n。
// d、origin、base、e、f 都不變；tiltDeg 為 0／沒有時原樣回傳（與舊版一模一樣）。
function tiltFrame(frame, tiltDeg) {
  const a = Number(tiltDeg);
  if (!Number.isFinite(a) || a === 0) return frame;
  const c = Math.cos(a * D2R), s = Math.sin(a * D2R);
  const { n, m } = frame;
  return {
    ...frame,
    n: { x: c * n.x + s * m.x, y: c * n.y + s * m.y, z: c * n.z + s * m.z },
    m: { x: c * m.x - s * n.x, y: c * m.y - s * n.y, z: c * m.z - s * n.z }
  };
}

// D3：宿主板厚（mm）：宿主零件 stock.thicknessMm，沒有就用 stockMm（預設 3；機架板沒有零件）。
export function hostPlateThickness(comps, edge, stockMm = 3) {
  const comp = edge && edge.compId ? (Array.isArray(comps) ? comps : []).find(c => c && c.id === edge.compId) : null;
  const t = edge?.kind==='frame'?Number(edge.stockThicknessMm):comp && comp.stock ? Number(comp.stock.thicknessMm) : NaN;
  return Number.isFinite(t) && t > 0 ? t : (Number.isFinite(Number(stockMm)) && Number(stockMm) > 0 ? Number(stockMm) : 3);
}

// D3：子模組自己底板外框第 k 條邊（orient.childEdge）當作站立邊：base＝邊中點、e＝沿邊單位向量，
// 使 f＝e 的左法線指向板內（＝−外法線）。找不到邊回 null。座標是子模組自己平面的座標。
function standEdgeOf(list, modList, mod, params, opts = {}) {
  const k = mod.mount.orient.childEdge;
  if (!Number.isInteger(k) || k < 0) return null;
  const e = moduleFrameEdges(list, modList, mod.id, params, { asm: opts.asm, cache: opts.cache, stockMm: opts.stockMm, exportSettings: opts.exportSettings, joint: opts.joint })[k];
  return e ? standFrameOfEdge(e) : null;
}
function standFrameOfEdge(e) {
  return {
    base: { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 },
    e: { x: -e.m.y, y: e.m.x },
    f: { x: -e.m.x, y: -e.m.y }
  };
}

// D3：切到「立在板面上」時預設站哪一條底板邊：子模組所有點（p1,p2,p3,m1,m2）在該邊內側方向 f 上的最小距離最大者
// （＝「背面」，最少幾何跑到宿主板面下方）；平手取編號小的。算不出回 null。
export function defaultStandEdge(comps, modules, moduleId, params, opts = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  if (!mod || !mod.mount) return null;
  const edges = moduleFrameEdges(list, modList, moduleId, params, { ...opts, noOwnHoles: true });
  if (!edges.length) return null;
  const pts = [];
  list.forEach(c => {
    if (!c || c.moduleId !== moduleId) return;
    POINT_KEYS.forEach(k => { const p = c[k]; if (p && validPt(p)) pts.push(p); });
  });
  if (!pts.length) return Number(Object.keys(edges)[0]);
  let best = 0, bestMin = -Infinity;
  edges.forEach((e, i) => {
    const s = standFrameOfEdge(e);
    const lo = Math.min(...pts.map(p => (p.x - s.base.x) * s.f.x + (p.y - s.base.y) * s.f.y));
    if (lo > bestMin + 1e-9) { bestMin = lo; best = i; }
  });
  return best;
}

// D3：立在板面時，子模組站立邊上的轉接座孔（子模組自己平面的座標）；孔沿 slide 方向的位置 ss（相對 origin 沿宿主邊的 d 方向）。
// sgn＝frame.d 與宿主邊 d 的點積符號（face −1 時兩者反向）。孔離站立邊 flangeHole mm、沿邊相距由 ss 決定。
export function standChildHoles(frame, hostD, ss, flangeHole) {
  const sgn = (frame.d.x * hostD.x + frame.d.y * hostD.y) >= 0 ? 1 : -1;
  const r3 = v => Math.round(v * 1000) / 1000;
  return ss.map(k => ({
    x: r3(frame.base.x + sgn * k * frame.e.x + flangeHole * frame.f.x),
    y: r3(frame.base.y + sgn * k * frame.e.y + flangeHole * frame.f.y)
  }));
}

// 子模組平面上的點 p（加上疊層高度 wMm，沿 m）→ 3D 世界座標。
export function toWorld3D(frame, p, wMm = 0) {
  const rx = p.x - frame.base.x, ry = p.y - frame.base.y;
  const s = rx * frame.e.x + ry * frame.e.y;
  const t = rx * frame.f.x + ry * frame.f.y;
  return {
    x: frame.origin.x + s * frame.d.x + t * frame.n.x + wMm * frame.m.x,
    y: frame.origin.y + s * frame.d.y + t * frame.n.y + wMm * frame.m.y,
    z: frame.origin.z + s * frame.d.z + t * frame.n.z + wMm * frame.m.z
  };
}

// D4：子模組座標 (s, t, w)（沿 e 的距離、沿 f 的距離、疊層高度）→ 3D 世界座標：origin + s·d + t·n + w·m。
export function stToWorld3D(frame, s, t, w = 0) {
  return {
    x: frame.origin.x + s * frame.d.x + t * frame.n.x + w * frame.m.x,
    y: frame.origin.y + s * frame.d.y + t * frame.n.y + w * frame.m.y,
    z: frame.origin.z + s * frame.d.z + t * frame.n.z + w * frame.m.z
  };
}

// D4：一塊在子模組座標裡的長方體板塊（s∈[smin,smax] × t∈[tmin,tmax] × w∈[w0,w1]）的 8 個角（3D 世界座標）。
export function slabCorners3D(frame, { smin, smax, tmin, tmax }, w0, w1) {
  const out = [];
  [smin, smax].forEach(s => [tmin, tmax].forEach(t => [w0, w1].forEach(w => out.push(stToWorld3D(frame, s, t, w)))));
  return out;
}

// 平面點集的凸包（Andrew monotone chain，逆時針）；少於 3 個不同點時原樣（去重後）回傳。
export function hull2D(points) {
  const pts = points.map(p => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((p, i, arr) => i === 0 || Math.abs(p.x - arr[i - 1].x) > 1e-9 || Math.abs(p.y - arr[i - 1].y) > 1e-9);
  if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  pts.forEach(p => { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) lower.pop(); lower.push(p); });
  [...pts].reverse().forEach(p => { while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) upper.pop(); upper.push(p); });
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// 宿主視圖的側影帶：子模組沿接合軸的範圍 × 疊層高度 stackMm，四個點依序
// (smin,0)、(smax,0)、(smax,stack)、(smin,stack)。沒有直角座標系或沒有點 → null。
// D4：有傾斜（orient.tiltDeg ≠ 0）時，改回傳「子模組外框長方體（s × t × w∈[0,stack]）8 個角投影到宿主 XY 的凸包」。
export function orthogonalBand(comps, modules, moduleId, points, stackMm, params, opts = {}) {
  const frame = orthogonalFrame(comps, modules, moduleId, points, params, opts);
  if (!frame) return null;
  const list = Array.isArray(comps) ? comps : [];
  const mod = (Array.isArray(modules) ? modules : []).find(m => m && m.id === moduleId);
  const tilted = !!(mod && mod.mount && mod.mount.orient && Number(mod.mount.orient.tiltDeg));
  let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity;
  const seen = new Set();
  list.forEach(c => {
    if (c.moduleId !== moduleId) return;
    POINT_KEYS.forEach(k => {
      const pt = c[k];
      if (!pt || !pt.id || seen.has(pt.id)) return;
      seen.add(pt.id);
      const sp = points[pt.id];
      if (!validPt(sp)) return;
      const s = (sp.x - frame.base.x) * frame.e.x + (sp.y - frame.base.y) * frame.e.y;
      const t = (sp.x - frame.base.x) * frame.f.x + (sp.y - frame.base.y) * frame.f.y;
      if (s < smin) smin = s;
      if (s > smax) smax = s;
      if (t < tmin) tmin = t;
      if (t > tmax) tmax = t;
    });
  });
  if (!Number.isFinite(smin)) return null;
  if (tilted) return hull2D(slabCorners3D(frame, { smin, smax, tmin, tmax }, 0, stackMm));
  const at = (s, w) => ({
    x: frame.origin.x + s * frame.d.x + w * frame.m.x,
    y: frame.origin.y + s * frame.d.y + w * frame.m.y
  });
  return [at(smin, 0), at(smax, 0), at(smax, stackMm), at(smin, stackMm)];
}

// ---- 視圖平面（SDD-ORTHOGONAL-MOUNT §4.3、O-D3）----

// 零件／模組所在的平面：沿安裝鏈往上走（含自己），第一個 mount 帶 orient 的模組 id 就是平面；
// 走到未安裝、找不到的模組或根 → null（主視圖）。安裝成環時以 seen 中止回 null。
// compOrModuleId 可以是零件物件（取 moduleId）、模組 id 字串或 null。
export function planeOf(comps, modules, compOrModuleId) {
  const modList = Array.isArray(modules) ? modules : [];
  let id = compOrModuleId && typeof compOrModuleId === 'object' ? compOrModuleId.moduleId : compOrModuleId;
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const mod = modList.find(m => m.id === id);
    if (!mod || !mod.mount) return null;
    if (mod.mount.orient || mod.mount.face) return mod.id;
    id = mod.mount.to && mod.mount.to.module;
  }
  return null;
}

// 屬於指定平面的零件（保持原順序）。
export function compsInPlane(comps, modules, plane) {
  const list = Array.isArray(comps) ? comps : [];
  const target = plane || null;
  return list.filter(c => planeOf(list, modules, c) === target);
}

// 指定平面所有零件用到的點 id（含零件 holes 裡的孔）；給繪製與命中過濾用。
export function pointIdsInPlane(comps, modules, plane) {
  const ids = new Set();
  compsInPlane(comps, modules, plane).forEach(c => {
    pointKeysFor(c).forEach(k => { if (c[k] && c[k].id) ids.add(c[k].id); });
    if (Array.isArray(c.holes)) c.holes.forEach(h => { if (h && h.id) ids.add(h.id); });
  });
  return ids;
}

// 這個點 id（pointKeysFor 的點或零件 holes 裡的孔）所屬的模組 id；沒有標記或找不到回 null。
export function moduleOfPoint(comps, id) {
  const list = Array.isArray(comps) ? comps : [];
  for (const c of list) {
    for (const k of pointKeysFor(c)) {
      if (c[k] && c[k].id === id) return c.moduleId || null;
    }
    if (Array.isArray(c.holes)) {
      for (const h of c.holes) {
        if (h && h.id === id) return c.moduleId || null;
      }
    }
  }
  return null;
}

export function canMergePoints(comps, idA, idB) {
  return moduleOfPoint(comps, idA) === moduleOfPoint(comps, idB);
}

// D2：新零件要接的既有節點是否同屬一個模組（根也算一個）；略過 falsy 的 id。
export function connectionModule(comps, nodeIds) {
  const ids = (Array.isArray(nodeIds) ? nodeIds : []).filter(Boolean);
  let moduleId = null, has = false;
  for (const id of ids) {
    const m = moduleOfPoint(comps, id);
    if (!has) { moduleId = m; has = true; }
    else if (m !== moduleId) return { ok: false, moduleId: null };
  }
  return { ok: true, moduleId: has ? moduleId : null };
}

// 目前選取的零件／節點屬於哪個模組：依 link → triangle → slider → gear → node 順序，
// 取第一個「有值」的欄位（零件查不到就回 null，不會落到下一個欄位）。
export function selectionModule(comps, sel) {
  if (!sel) return null;
  const list = Array.isArray(comps) ? comps : [];
  const byCompId = (id) => {
    const c = list.find(x => x.id === id);
    return c ? (c.moduleId ?? null) : null;
  };
  if (sel.linkId) return byCompId(sel.linkId);
  if (sel.triangleId) return byCompId(sel.triangleId);
  if (sel.sliderId) return byCompId(sel.sliderId);
  if (sel.gearId) return byCompId(sel.gearId);
  if (sel.nodeId) return moduleOfPoint(comps, sel.nodeId);
  return null;
}

// D3：沿安裝鏈往上走，把沿途每個模組 mount.home 合併（祖先先放、越靠近自己的越後放＝覆蓋）。
// 未安裝、根（null）、找不到 → {}；遇到走過的 id 就停，防迴圈。
export function homePoseFor(modules, moduleId) {
  const list = Array.isArray(modules) ? modules : [];
  const byId = new Map(list.map(m => [m.id, m]));
  const chain = [];   // chain[0] 是自己的 home，越後面離自己越遠
  const seen = new Set();
  let curId = moduleId;
  while (curId != null) {
    if (seen.has(curId)) break;
    seen.add(curId);
    const mod = byId.get(curId);
    if (!mod || !mod.mount) break;
    chain.push(mod.mount.home || {});
    curId = mod.mount.to.module;
  }
  const result = {};
  for (let i = chain.length - 1; i >= 0; i--) Object.assign(result, chain[i]);
  return result;
}

// D3：目前姿態與組裝姿態（home）差多少；current = { activeMotor, theta, motorAngles }。
// 全部相同（或 home 為空）→ null；否則回傳把 home 裡的馬達角度套用後的 { theta, motorAngles }。
export function homeAdjustment(modules, moduleId, current) {
  const home = homePoseFor(modules, moduleId);
  const keys = Object.keys(home);
  if (!keys.length) return null;
  const activeMotor = current.activeMotor;
  const theta = current.theta;
  const motorAngles = current.motorAngles || {};
  const norm = v => ((Number(v) % 360) + 360) % 360;
  let diff = false;
  for (const m of keys) {
    const curAngle = (m === activeMotor) ? theta : (motorAngles[m] ?? 0);
    const d = Math.abs(norm(curAngle) - norm(home[m]));
    if (Math.min(d, 360 - d) > 1e-6) { diff = true; break; }   // 359.9999999° 與 0° 視為同角
  }
  if (!diff) return null;
  const newMotorAngles = { ...motorAngles };
  let newTheta = theta;
  keys.forEach(m => {
    if (m === activeMotor) newTheta = home[m];
    else newMotorAngles[m] = home[m];
  });
  return { theta: newTheta, motorAngles: newMotorAngles };
}

// 不屬於「已安裝模組」的零件：沒有 moduleId、或 moduleId 對應的模組不存在、或該模組 mount 為 null。
export function worldFrameComps(comps, modules) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  if (!modList.length) return list;
  const byId = new Map(modList.map(m => [m.id, m]));
  return list.filter(c => {
    if (!c.moduleId) return true;
    const mod = byId.get(c.moduleId);
    if (!mod) return true;
    return !mod.mount;
  });
}

// M5a：整台機器的機架零件＝世界機架去掉「未安裝」機構的零件（底座那串的零件＋沒有 moduleId 的零件）。
// 製作包、干涉、匯出、組立台的機架板都用它；worldFrameComps 本身不變（ownPorts 要拿來配虛擬安裝）。
export function machineFrameComps(comps, modules) {
  return worldFrameComps(machineComps(comps, modules), modules);
}

// 只留機器的馬達安裝座（座所在的零件屬於未安裝機構的丟掉）。
export function machineMounts(mounts, comps, modules) {
  const spare = new Set(assemblyRoles(modules).spare);
  if (!spare.size) return mounts;
  return (Array.isArray(mounts) ? mounts : []).filter(m => !(m && m.pointId && spare.has(moduleOfPoint(comps, m.pointId))));
}

// 某個未安裝宿主自己的機架零件：其他未安裝機構的零件不算（底座或沒指定＝整台機器的機架）。
export function hostFrameComps(comps, modules, hostId) {
  const modList = Array.isArray(modules) ? modules : [];
  if (hostId == null || hostId === assemblyRoles(modList).root) return machineFrameComps(comps, modList);
  const others = new Set(modList.filter(m => m && !m.mount && m.id !== hostId).map(m => m.id));
  return worldFrameComps(comps, modList).filter(c => !c.moduleId || !others.has(c.moduleId));
}

// 已安裝模組零件上，type 為 fixed 或 motor 的點 id（這些孔「鎖在宿主上」，外觀不畫地錨樣式）。
export function mountedBaseIds(comps, modules) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const byId = new Map(modList.map(m => [m.id, m]));
  const ids = new Set();
  list.forEach(c => {
    if (!c.moduleId) return;
    const mod = byId.get(c.moduleId);
    if (!mod || !mod.mount) return;
    pointKeysFor(c).forEach(k => {
      const p = c[k];
      if (p && (p.type === 'fixed' || p.type === 'motor')) ids.add(p.id);
    });
  });
  return ids;
}

// 把一組馬達安裝座（free mounts）依所屬模組分流：已安裝模組的歸該模組，其餘（含根與未安裝模組）歸世界。
export function splitFrameMounts(freeMounts, comps, modules) {
  const list = Array.isArray(freeMounts) ? freeMounts : [];
  const modList = Array.isArray(modules) ? modules : [];
  const byId = new Map(modList.map(m => [m.id, m]));
  const world = [];
  const byModule = {};
  list.forEach(mount => {
    const m = moduleOfPoint(comps, mount.pointId);
    const mod = m != null ? byId.get(m) : null;
    if (mod && mod.mount) {
      (byModule[m] || (byModule[m] = [])).push(mount);
    } else {
      world.push(mount);
    }
  });
  return { world, byModule };
}

// 每個已安裝模組另出一份機架清單：{ moduleId, fileBase, comps, bolts, baseId }，依 modules 陣列順序。
// 帶 params 時：宿主輸出端若有 bolts，以組裝姿態（thetaDeg 0、馬達＝mount.home）解出螺絲孔的世界座標，
// bolts: [{ id, x, y, diameter }]（diameter 取宿主齒條 holes 的孔徑，找不到用 3.2）；否則 bolts 為 []。
export function moduleFrameExports(comps, modules, params) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  let solved = null;
  const solveHome = (mod) => {
    if (!solved) solved = new Map();
    if (solved.has(mod.id)) return solved.get(mod.id);
    let pts = null;
    try {
      const sol = solveAssembly(compileAssembly(list, modList, { params }), {
        thetaDeg: 0, motorAngles: { ...((mod.mount && mod.mount.home) || {}) }
      });
      pts = sol && sol.points ? sol.points : null;
    } catch (e) { pts = null; }
    solved.set(mod.id, pts);
    return pts;
  };
  return modList
    .filter(mod => mod && mod.mount)
    .map(mod => frameEntryOf(list, modList, mod, params, () => solveHome(mod)));
}

// 單一已安裝模組的底板清單項：{ moduleId, fileBase, comps, bolts, baseId }（bolts 的算法見 moduleFrameExports）。
// solveHome：回傳該模組 home 姿態的世界座標點表（只在宿主輸出端有 bolts 時才呼叫）。
function frameEntryOf(list, modList, mod, params, solveHome) {
  const bolts = [];
  const host = modList.find(m => m.id === mod.mount.to.module);
  const output = host && (host.outputs || []).find(o => o.id === mod.mount.to.output);
  if (params && output && Array.isArray(output.bolts) && output.bolts.length && !mod.mount.face) {
    const pts = solveHome();
    output.bolts.forEach(id => {
      const p = pts && pts[id];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      let diameter = 3.2;
      list.some(c => Array.isArray(c.holes) && c.holes.some(h => {
        if (h.id !== id) return false;
        if (Number.isFinite(Number(h.diameter)) && Number(h.diameter) > 0) diameter = Number(h.diameter);
        return true;
      }));
      bolts.push({ id, x: p.x, y: p.y, diameter });
    });
  }
  return {
    moduleId: mod.id,
    fileBase: `${mod.id}-frame`,
    comps: list.filter(c => c.moduleId === mod.id),
    bolts,
    baseId: mod.base,
    preserveBaseHole: !!(mod.mount && mod.mount.face)
  };
}

// 模組底板的機架節點：去掉基準點（它只是安裝用的參考點，不再開大孔），改加每顆螺絲孔（小孔、MOUNT_BOLT 圖層）。
// 純函式，不改輸入。
export function moduleFrameNodes(entry, frameNodes) {
  const nodes = Array.isArray(frameNodes) ? frameNodes : [];
  const baseId = entry && entry.baseId;
  const bolts = entry && Array.isArray(entry.bolts) ? entry.bolts : [];
  return [
    ...nodes.filter(n => !(baseId && n.id === baseId && !entry.preserveBaseHole)),
    ...bolts.map(b => ({ id: b.id, x: b.x, y: b.y, holeDiameterMm: b.diameter, holeLayer: 'MOUNT_BOLT' }))
  ];
}

// G1：已安裝模組固定板（<id>-frame）在目前位姿的幾何，給 3D／2D 畫（實作在 module-plates.js）。
export { mountedFramePlates } from './module-plates.js?v=20261007_m5a';
