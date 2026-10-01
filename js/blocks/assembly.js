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
import { solveTopology, sweepTopology } from '../multilink/solver.js';
import { pointKeysFor } from './part-types.js';
import { memberStock } from './member-stock.js';

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

export function solveAssembly(asm, params) {
  if (asm.single) return solveTopology(asm.single, params);
  const points = {};
  const perModule = {};
  const orthogonal = {};   // 直角安裝的模組：{ host, now }（宿主輸出端目前位姿；子模組點不做 2D 變換）
  for (const unit of asm.units) {
    if (!unit.compiled) continue;
    let ref = IDENTITY_POSE, now = IDENTITY_POSE;
    if (unit.mount) {
      const host = asm.units.find(u => u.id === unit.mount.to.module);
      now = host && host.module ? outputPose(host.module, unit.mount.to.output, points, host.comps) : null;
      if (!now) { perModule[unit.id] = { isValid: false, reason: 'host-invalid' }; continue; }
      if (unit.mount.orient) {
        // 直角安裝：子模組在自己的平面求解，點座標維持原樣（ref＝now＝IDENTITY），位姿另外回報給 3D／側影帶用。
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
    if (mod.mount.orient) continue;   // 直角安裝：座標存在自己的平面，不 rebake
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
export function orthogonalFrame(comps, modules, moduleId, points) {
  const modList = Array.isArray(modules) ? modules : [];
  const list = Array.isArray(comps) ? comps : [];
  const mod = modList.find(m => m.id === moduleId);
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return null;
  const host = modList.find(m => m.id === mod.mount.to.module);
  const output = host && (host.outputs || []).find(o => o.id === mod.mount.to.output);
  if (!output || !output.body || output.body.kind !== 'bar') return null;
  const bodyComp = list.find(c => c.id === output.body.id);
  if (!bodyComp || !bodyComp.p1 || !bodyComp.p2) return null;
  const p1 = points && points[bodyComp.p1.id], p2 = points && points[bodyComp.p2.id];
  const base = mod.base && points ? points[mod.base] : null;
  if (!validPt(p1) || !validPt(p2) || !validPt(base)) return null;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(len > 0)) return null;
  const dx = (p2.x - p1.x) / len, dy = (p2.y - p1.y) / len;
  const side = orient.side;
  const w = memberStock(bodyComp).widthMm;
  const mx = side * -dy, my = side * dx;   // m＝side·left，left＝(−d.y, d.x)
  const rad = orient.childAxisDeg * D2R;
  const e = { x: Math.cos(rad), y: Math.sin(rad) };
  return {
    origin: { x: (p1.x + p2.x) / 2 + mx * w / 2, y: (p1.y + p2.y) / 2 + my * w / 2, z: 0 },
    d: { x: dx, y: dy, z: 0 },
    m: { x: mx, y: my, z: 0 },
    n: { x: 0, y: 0, z: -side },
    base: { x: base.x, y: base.y },
    e,
    f: { x: -e.y, y: e.x }
  };
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

// 宿主視圖的側影帶：子模組沿接合軸的範圍 × 疊層高度 stackMm，四個點依序
// (smin,0)、(smax,0)、(smax,stack)、(smin,stack)。沒有直角座標系或沒有點 → null。
export function orthogonalBand(comps, modules, moduleId, points, stackMm) {
  const frame = orthogonalFrame(comps, modules, moduleId, points);
  if (!frame) return null;
  const list = Array.isArray(comps) ? comps : [];
  let smin = Infinity, smax = -Infinity;
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
      if (s < smin) smin = s;
      if (s > smax) smax = s;
    });
  });
  if (!Number.isFinite(smin)) return null;
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
    if (mod.mount.orient) return mod.id;
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
    .map(mod => {
      const bolts = [];
      const host = modList.find(m => m.id === mod.mount.to.module);
      const output = host && (host.outputs || []).find(o => o.id === mod.mount.to.output);
      if (params && output && Array.isArray(output.bolts) && output.bolts.length) {
        const pts = solveHome(mod);
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
        baseId: mod.base
      };
    });
}

// 模組底板的機架節點：去掉基準點（它只是安裝用的參考點，不再開大孔），改加每顆螺絲孔（小孔、MOUNT_BOLT 圖層）。
// 純函式，不改輸入。
export function moduleFrameNodes(entry, frameNodes) {
  const nodes = Array.isArray(frameNodes) ? frameNodes : [];
  const baseId = entry && entry.baseId;
  const bolts = entry && Array.isArray(entry.bolts) ? entry.bolts : [];
  return [
    ...nodes.filter(n => !(baseId && n.id === baseId)),
    ...bolts.map(b => ({ id: b.id, x: b.x, y: b.y, holeDiameterMm: b.diameter, holeLayer: 'MOUNT_BOLT' }))
  ];
}
