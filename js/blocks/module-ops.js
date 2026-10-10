/**
 * blocks / module-ops
 *
 * 模組操作的純函式（SDD-ASSEMBLY-MODULES §4.3a、M1c 刀 1）：存成模組、宣告輸出端、
 * 安裝／拆下／解散、匯出模板、插入實例、模組庫序列化。不碰 DOM、不碰 localStorage。
 */
import { compileAssembly, solveAssembly, outputPose, transformComp, planeOf, orthogonalHostEdge } from './assembly.js?v=20261007_m5a';
import { pointKeysFor } from './part-types.js';
import { normalizeSnapshot } from './schema.js?v=20261007_singleface';
import { normalizeModules, sanitizeName } from './module-schema.js?v=20261007_singleface';
import { BLOCK_EXAMPLES } from './examples.js';
import { ADAPTER_LENGTH_MM } from './orthogonal-joint.js';

const clone = v => JSON.parse(JSON.stringify(v));

// 「相連」與「重新命名」共用：略過列舉型欄位與馬達編號欄位（SDD §4.3a）。
const CONNECTIVITY_EXCLUDED_KEYS = new Set([
  'type', 'color', 'shape', 'shapeMode', 'profile', 'kind', 'motorType', 'role', 'orientation', 'ref', 'baseEnd', 'name', 'id',
  'physicalMotor', 'physical_motor', 'motor'
]);
const MOTOR_KEYS = new Set(['physicalMotor', 'physical_motor', 'motor']);
const BODY_COMP_TYPES = new Set(['bar', 'triangle', 'rack', 'slider']);

// 零件的自有 token：它的 id、接點 id、holes 內孔 id。
function ownTokensOf(comp) {
  const s = new Set();
  if (comp && comp.id) s.add(comp.id);
  pointKeysFor(comp).forEach(k => { const p = comp[k]; if (p && p.id) s.add(p.id); });
  if (Array.isArray(comp.holes)) comp.holes.forEach(h => { if (h && h.id) s.add(h.id); });
  return s;
}

// 深層走訪字串值，略過列舉／馬達欄位，收集這個零件所有欄位裡「參照到別的 token」的字串。
function collectRefTokens(value, out) {
  if (value == null) return;
  if (typeof value === 'string') { out.add(value); return; }
  if (Array.isArray(value)) { value.forEach(v => collectRefTokens(v, out)); return; }
  if (typeof value === 'object') {
    Object.keys(value).forEach(k => {
      if (CONNECTIVITY_EXCLUDED_KEYS.has(k)) return;
      collectRefTokens(value[k], out);
    });
  }
}

function refTokensOf(comp) {
  const out = new Set();
  Object.keys(comp).forEach(k => {
    if (CONNECTIVITY_EXCLUDED_KEYS.has(k)) return;
    collectRefTokens(comp[k], out);
  });
  return out;
}

// 從根零件出發的相連群組（只含沒有 moduleId 的零件）：共用接點，或一方的參照 token 命中另一方的自有 token。
export function connectedRootComps(comps, compId) {
  const list = Array.isArray(comps) ? comps : [];
  const roots = list.filter(c => c && !c.moduleId);
  if (!roots.some(c => c.id === compId)) return [];
  const ownMap = new Map(roots.map(c => [c.id, ownTokensOf(c)]));
  const refMap = new Map(roots.map(c => [c.id, refTokensOf(c)]));
  const connected = (a, b) => {
    const oa = ownMap.get(a), ob = ownMap.get(b);
    for (const t of oa) if (ob.has(t)) return true;
    const ra = refMap.get(a), rb = refMap.get(b);
    for (const t of ra) if (ob.has(t)) return true;
    for (const t of rb) if (oa.has(t)) return true;
    return false;
  };
  const visited = new Set([compId]);
  const queue = [compId];
  while (queue.length) {
    const cur = queue.shift();
    for (const c of roots) {
      if (visited.has(c.id)) continue;
      if (connected(cur, c.id)) { visited.add(c.id); queue.push(c.id); }
    }
  }
  return [...visited];
}

// 存成模組：把與 compId 相連的根零件整組標上新模組 id；base＝群組中第一個 fixed／motor 點。
export function createModule(comps, modules, compId, name) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const group = connectedRootComps(list, compId);
  if (!group.length) return { ok: false, comps: list, modules: modList, moduleId: null, reason: 'not-found' };
  const groupSet = new Set(group);
  const usedIds = new Set(modList.map(m => m.id));
  let n = 1;
  while (usedIds.has(`Mod${n}`)) n++;
  const moduleId = `Mod${n}`;
  const outComps = list.map(c => groupSet.has(c.id) ? { ...c, moduleId } : c);
  let base = null;
  for (const c of list) {
    if (!groupSet.has(c.id)) continue;
    for (const k of pointKeysFor(c)) {
      const p = c[k];
      if (p && (p.type === 'fixed' || p.type === 'motor')) { base = p.id; break; }
    }
    if (base) break;
  }
  const newModule = { id: moduleId, name: sanitizeName(name, moduleId), outputs: [], mount: null };
  if (base) newModule.base = base;
  return { ok: true, comps: outComps, modules: [...modList, newModule], moduleId, reason: 'ok' };
}

// 推論輸出端：點須屬於本模組、不可是固定點；body＝模組內第一個引用該點（pointKeysFor 或 holes）
// 且 type 為 bar／triangle／rack／slider 的零件。
export function inferOutput(comps, module, pointId) {
  const list = Array.isArray(comps) ? comps : [];
  const modComps = list.filter(c => module && c.moduleId === module.id);
  let found = false;
  let isFixed = false;
  for (const c of modComps) {
    for (const k of pointKeysFor(c)) {
      const p = c[k];
      if (p && p.id === pointId) {
        found = true;
        if (p.type === 'fixed') isFixed = true;
      }
    }
    if (Array.isArray(c.holes)) {
      c.holes.forEach(h => { if (h && h.id === pointId) found = true; });
    }
  }
  if (!found) return { ok: false, output: null, reason: 'not-in-module' };
  if (isFixed) return { ok: false, output: null, reason: 'fixed-point' };
  let body = null;
  for (const c of modComps) {
    if (!BODY_COMP_TYPES.has(c.type)) continue;
    const viaPoint = pointKeysFor(c).some(k => c[k] && c[k].id === pointId);
    const viaHole = Array.isArray(c.holes) && c.holes.some(h => h && h.id === pointId);
    if (viaPoint || viaHole) { body = { kind: c.type, id: c.id }; break; }
  }
  if (!body) return { ok: false, output: null, reason: 'no-body' };
  return { ok: true, output: { at: pointId, body }, reason: 'ok' };
}

// 新增輸出端：id 為 out1、out2…不重複；名稱預設「輸出 N」。
export function addOutput(comps, modules, moduleId, pointId, name) {
  const modList = Array.isArray(modules) ? modules : [];
  const idx = modList.findIndex(m => m.id === moduleId);
  if (idx < 0) return { ok: false, modules: modList, reason: 'no-module' };
  const mod = modList[idx];
  const inferred = inferOutput(comps, mod, pointId);
  if (!inferred.ok) return { ok: false, modules: modList, reason: inferred.reason };
  const existing = Array.isArray(mod.outputs) ? mod.outputs : [];
  const usedIds = new Set(existing.map(o => o.id));
  let n = 1;
  while (usedIds.has(`out${n}`)) n++;
  const outId = `out${n}`;
  const output = {
    id: outId,
    name: (typeof name === 'string' && name) ? name : `輸出 ${n}`,
    at: inferred.output.at,
    body: inferred.output.body
  };
  const newMod = { ...mod, outputs: [...existing, output] };
  const newModules = modList.map((m, i) => i === idx ? newMod : m);
  return { ok: true, modules: newModules, reason: 'ok' };
}

// 宿主鏈（宿主模組及其祖先）模組 id 集合：從 hostId 沿 mount.to.module 往上走。
function hostChainIds(modules, hostId) {
  const byId = new Map(modules.map(m => [m.id, m]));
  const ids = new Set();
  let cur = byId.get(hostId);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    ids.add(cur.id);
    if (!cur.mount) break;
    cur = byId.get(cur.mount.to.module);
  }
  return ids;
}

// candidateId 是否為 ancestorId 的子孫（沿 candidate 的 mount 鏈往上走會經過 ancestorId）。
function isDescendantOf(modules, candidateId, ancestorId) {
  const byId = new Map(modules.map(m => [m.id, m]));
  let cur = byId.get(candidateId);
  const seen = new Set();
  while (cur && cur.mount) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const nextId = cur.mount.to.module;
    if (nextId === ancestorId) return true;
    cur = byId.get(nextId);
  }
  return false;
}

// 安裝：以目前姿態求解，模組整組平移（不旋轉）讓 base 落在 at 的目前位置；
// ref＝輸出端目前位姿；home＝宿主鏈上每顆馬達的目前角度。
export function mountModule(comps, modules, moduleId, target, params, motorState) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m.id === moduleId);
  if (!mod) return { ok: false, comps: list, modules: modList, reason: 'no-module' };
  if (mod.mount) return { ok: false, comps: list, modules: modList, reason: 'already-mounted' };
  if (!mod.base) return { ok: false, comps: list, modules: modList, reason: 'no-base' };
  if (!target || typeof target !== 'object' || !target.module || !target.output) {
    return { ok: false, comps: list, modules: modList, reason: 'no-target' };
  }
  if (target.module === moduleId || isDescendantOf(modList, target.module, moduleId)) {
    return { ok: false, comps: list, modules: modList, reason: 'cycle' };
  }
  const hostMod = modList.find(m => m.id === target.module);
  if (!hostMod) return { ok: false, comps: list, modules: modList, reason: 'no-host' };
  const output = (hostMod.outputs || []).find(o => o.id === target.output);
  if (!output) return { ok: false, comps: list, modules: modList, reason: 'no-output' };

  const motor = motorState || {};
  const activeMotor = motor.activeMotor;
  const theta = Number(motor.theta) || 0;
  const motorAngles = { ...(motor.motorAngles || {}) };
  const solveAngles = { ...motorAngles, [activeMotor]: theta };
  const asm = compileAssembly(list, modList, { params });
  const sol = solveAssembly(asm, { thetaDeg: theta, motorAngles: solveAngles });
  if (!sol.isValid) return { ok: false, comps: list, modules: modList, reason: 'unsolved' };
  const atPos = sol.points[output.at];
  const basePos = sol.points[mod.base];
  if (!atPos || !basePos || !Number.isFinite(atPos.x) || !Number.isFinite(basePos.x)) {
    return { ok: false, comps: list, modules: modList, reason: 'no-position' };
  }
  const hostComps = list.filter(c => c.moduleId === hostMod.id);
  const refPose = outputPose(hostMod, target.output, sol.points, hostComps);
  if (!refPose) return { ok: false, comps: list, modules: modList, reason: 'no-ref-pose' };

  const chainIds = hostChainIds(modList, hostMod.id);
  const chainComps = list.filter(c => c.moduleId && chainIds.has(c.moduleId));
  const seenMotors = new Set();
  const motorOrder = [];
  chainComps.forEach(c => scanMotors(c, seenMotors, motorOrder));
  const home = {};
  motorOrder.forEach(m => { home[m] = (m === String(activeMotor)) ? theta : Number(motorAngles[m] ?? 0); });

  const originPose = { x: basePos.x, y: basePos.y, a: 0 };
  const destPose = { x: atPos.x, y: atPos.y, a: 0 };
  const newComps = list.map(c => c.moduleId === moduleId ? transformComp(c, originPose, destPose, 0) : c);
  const newModules = modList.map(m => m.id === moduleId
    ? { ...m, mount: { to: { module: target.module, output: target.output }, ref: refPose, home } }
    : m);
  return { ok: true, comps: newComps, modules: newModules, reason: 'ok' };
}

// 直角安裝（SDD-ORTHOGONAL-MOUNT O2）：子模組在垂直於宿主的平面，零件座標不動（不 2D 變換）；
// 只記錄 ref＝輸出端目前位姿與 orient（接合軸取 base 指向子模組所有點重心的方向）。
// target 形式：{ module, output }（輸出端須標 orthogonal.side）；
// { module, body, side }（組立台：宿主模組裡任一根桿的邊，side 為 1／-1；ref＝桿 p1 位置與 p1→p2 方向）；
// { module, body, edge, side }（C1：三角板第 edge 條邊，side 取朝外那一側，ref＝邊起點與方向）；
// { module, frame: { edge }, side }（C1：世界機架板外框第 edge 段直邊，ref＝外擴邊線起點與方向）。
export function mountOrthogonal(comps, modules, moduleId, target, params, motorState, opts = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const fail = reason => ({ ok: false, comps: list, modules: modList, reason });
  const mod = modList.find(m => m.id === moduleId);
  if (!mod) return fail('no-module');
  if (mod.mount) return fail('already-mounted');
  if (!mod.base) return fail('no-base');
  const byFrame = !!(target && typeof target === 'object' && target.frame && typeof target.frame === 'object');
  const byBody = !!(target && typeof target === 'object' && target.body) && !byFrame;
  if (!target || typeof target !== 'object' || !target.module || !(byBody || byFrame || target.output)) return fail('no-target');
  if (target.module === moduleId || isDescendantOf(modList, target.module, moduleId)) return fail('cycle');
  const hostMod = modList.find(m => m.id === target.module);
  if (!hostMod) return fail('no-host');
  // 直角安裝的宿主邊：桿（to.body）、三角板的邊（to.body＋to.edge）、機架板外框的邊（to.frame.edge）。
  let output = null, hostComp = null, sideOut = 0, to = null;
  if (byBody || byFrame) {
    if (byFrame) {
      if (!Number.isInteger(target.frame.edge) || target.frame.edge < 0) return fail('no-body');
      to = { module: target.module, frame: { edge: target.frame.edge } };
    } else {
      hostComp = list.find(c => c.id === target.body && (c.type === 'bar' || c.type === 'triangle') && c.moduleId === hostMod.id);
      if (!hostComp || !hostComp.p1 || !hostComp.p2) return fail('no-body');
      to = { module: target.module, body: target.body };
      if (hostComp.type === 'triangle') {
        if (hostComp.shape === 'jaw' || !hostComp.p3 || !Number.isInteger(target.edge) || target.edge < 0 || target.edge > 2) return fail('no-body');
        to.edge = target.edge;
      }
    }
    if (target.side !== 1 && target.side !== -1) return fail('not-orthogonal');
    sideOut = target.side;
  } else {
    output = (hostMod.outputs || []).find(o => o.id === target.output);
    if (!output) return fail('no-output');
    if (!output.orthogonal || (output.orthogonal.side !== 1 && output.orthogonal.side !== -1)) return fail('not-orthogonal');
    sideOut = output.orthogonal.side;
  }

  const motor = motorState || {};
  const theta = Number(motor.theta) || 0;
  const solveAngles = { ...(motor.motorAngles || {}), [motor.activeMotor]: theta };
  const sol = solveAssembly(compileAssembly(list, modList, { params }), { thetaDeg: theta, motorAngles: solveAngles });
  if (!sol.isValid) return fail('unsolved');
  const basePos = sol.points[mod.base];
  let now = null;
  if (byBody || byFrame) {
    if (!basePos || !Number.isFinite(basePos.x)) return fail('no-position');
    // 機架外框要在「子模組已安裝」的前提下算（安裝後它的零件不在世界機架裡），板／桿的邊直接用目前求解的點。
    const asMounted = modList.map(m => m.id === moduleId ? { ...m, mount: { to, orient: { type: 'orthogonal', side: sideOut } } } : m);
    const edge = orthogonalHostEdge(list, asMounted, { to, orient: { side: sideOut } }, sol.points, params);
    if (!edge) return fail('no-position');
    sideOut = edge.side;   // 板／機架：side 由外法線決定（朝外），桿：維持傳入的 L／R
    now = edge.pose;
  } else {
    const atPos = sol.points[output.at];
    if (!atPos || !basePos || !Number.isFinite(atPos.x) || !Number.isFinite(basePos.x)) return fail('no-position');
    const hostComps = list.filter(c => c.moduleId === hostMod.id);
    now = outputPose(hostMod, target.output, sol.points, hostComps);
  }
  if (!now) return fail('no-ref-pose');

  // childAxisDeg：base → 子模組所有點（p1,p2,p3,m1,m2，id 去重）重心的方向，四捨五入到 0.1°。
  const seen = new Set();
  let sx = 0, sy = 0, cnt = 0;
  list.forEach(c => {
    if (c.moduleId !== moduleId) return;
    ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => {
      const pt = c[k];
      if (!pt || !pt.id || seen.has(pt.id)) return;
      seen.add(pt.id);
      const sp = sol.points[pt.id];
      if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.y)) { sx += sp.x; sy += sp.y; cnt++; }
    });
  });
  const cx = cnt ? sx / cnt : basePos.x, cy = cnt ? sy / cnt : basePos.y;
  const childAxisDeg = Math.round(Math.atan2(cy - basePos.y, cx - basePos.x) * 180 / Math.PI * 10) / 10;

  // 轉接座從邊中點往正向占一整段；短邊初裝也要套用滑動時的邊界。
  const mountTo = (byBody || byFrame) ? to : { module: target.module, output: target.output };
  const mounted = modList.map(m => m.id === moduleId ? { ...m, mount: { to: mountTo } } : m);
  const hostEdge = orthogonalHostEdge(list, mounted, { to: mountTo, orient: { side: sideOut } }, sol.points, params);
  if (!hostEdge || hostEdge.lengthMm < ADAPTER_LENGTH_MM) return fail('short-edge');
  const offsetMm = Math.min(0, Math.floor((hostEdge.lengthMm / 2 - ADAPTER_LENGTH_MM) * 10) / 10);

  const newModules = modList.map(m => m.id === moduleId
    ? {
      ...m,
      mount: {
        to: (byBody || byFrame) ? to : { module: target.module, output: target.output },
        ref: { x: now.x, y: now.y, a: now.a },
        home: {},
        orient: {
          type: 'orthogonal', edge: 'host', side: sideOut, childAxisDeg,
          ...(offsetMm ? { offsetMm } : {}),
          // E1：接合件種類（opts.joint）；預設 3D 列印轉接座，角碼是現成零件不帶壁厚／孔數。
          joint: opts && opts.joint === 'bracket-m3' ? { kind: 'bracket-m3' } : { kind: 'printed', wallMm: 4, holesPerFlange: 2 }
        }
      }
    }
    : m);
  return { ok: true, comps: list, modules: newModules, reason: 'ok' };
}

// D9 拖曳安裝（SDD §4.3b）：整組平移——只動 moduleId 的零件（不旋轉、不改輸入），其餘零件原物件回傳。
export function translateModule(comps, moduleId, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return comps;
  const list = Array.isArray(comps) ? comps : [];
  return list.map(c => c.moduleId === moduleId
    ? transformComp(c, { x: 0, y: 0, a: 0 }, { x: dx, y: dy, a: 0 }, 0)
    : c);
}

// P2：插入新模組時避免與既有零件範圍重疊——回傳把新範圍挪到既有範圍外（相距 margin）所需的最小位移 { dx, dy }。
// 範圍含接點，另納入齒輪齒頂圓與齒條外框（尺寸取自 params，規則同 app.js currentBounds／drawRack）。
export function insertOffset(existingComps, newComps, margin, params, { sideBySide = false } = {}) {
  const par = params || {};
  const boxOf = comps => {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    (Array.isArray(comps) ? comps : []).forEach(c => {
      for (const k of pointKeysFor(c)) {
        const p = c[k];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
          b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
        }
      }
      const c0 = c && c.p1;
      if (!c0 || !Number.isFinite(c0.x) || !Number.isFinite(c0.y)) return;
      let ex = 0, ey = 0;
      if (c.type === 'gear') {
        const teeth = Math.max(6, Math.round(Number(c.teeth) || 12));
        const r = Number(par[c.radiusParam]) || 40;
        ex = ey = r + 2 * r / teeth;
      } else if (c.type === 'rack') {
        const L = (Number(par[c.lenParam]) || 160) + 2 * (Number(c.endMargin) || 12), H = Number(c.bodyHeight) || 20;
        const a = (Number(c.axisDeg) || 0) * Math.PI / 180;
        ex = Math.abs(Math.cos(a)) * L / 2 + Math.abs(Math.sin(a)) * H / 2;
        ey = Math.abs(Math.sin(a)) * L / 2 + Math.abs(Math.cos(a)) * H / 2;
      } else return;
      b.minX = Math.min(b.minX, c0.x - ex); b.maxX = Math.max(b.maxX, c0.x + ex);
      b.minY = Math.min(b.minY, c0.y - ey); b.maxY = Math.max(b.maxY, c0.y + ey);
    });
    return b;
  };
  const E = boxOf(existingComps), N = boxOf(newComps);
  if (!Number.isFinite(E.minX) || !Number.isFinite(N.minX)) return { dx: 0, dy: 0 };
  // 匯入獨立套件時左右並列；避免最短避讓選上下，從 3D 看起來像已接合。
  if (sideBySide) return { dx: E.maxX + margin - N.minX, dy: (E.minY + E.maxY - N.minY - N.maxY) / 2 };
  const dist = Math.max(N.minX - E.maxX, E.minX - N.maxX, N.minY - E.maxY, E.minY - N.maxY);
  if (dist >= margin) return { dx: 0, dy: 0 };
  const candidates = [
    { dx: E.maxX + margin - N.minX, dy: 0 },
    { dx: E.minX - margin - N.maxX, dy: 0 },
    { dx: 0, dy: E.maxY + margin - N.minY },
    { dx: 0, dy: E.minY - margin - N.maxY }
  ];
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c.dx + c.dy) < Math.abs(best.dx + best.dy)) best = c;
  return best;
}

// D9：可安裝的目標清單（規則同選單候選：排除自己與子孫；已安裝或不存在回 []）。x,y 取 points[output.at]。
export function mountTargets(comps, modules, moduleId, points) {
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m.id === moduleId);
  if (!mod || mod.mount) return [];
  const list = [];
  modList.forEach(m => {
    if (m.id === moduleId || isDescendantOf(modList, m.id, moduleId)) return;
    (m.outputs || []).forEach(o => {
      const p = points && points[o.at];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const t = { module: m.id, output: o.id, label: `${m.name}・${o.name}`, x: p.x, y: p.y };
      if (o.orthogonal && (o.orthogonal.side === 1 || o.orthogonal.side === -1)) t.orthogonal = true;
      list.push(t);
    });
  });
  return list;
}

// D9：距離 pos 在 radius 內（含）的最近目標，沒有回 null。
export function nearestMountTarget(targets, pos, radius) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(radius)) return null;
  let best = null, bestD = Infinity;
  (Array.isArray(targets) ? targets : []).forEach(t => {
    const d = Math.hypot(t.x - pos.x, t.y - pos.y);
    if (d <= radius && d < bestD) { best = t; bestD = d; }
  });
  return best;
}

// 拆下：以目前姿態把模組零件剛體變換到世界座標（同 rebake 規則），mount 改 null。
export function unmountModule(comps, modules, moduleId, params, motorState) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const idx = modList.findIndex(m => m.id === moduleId);
  if (idx < 0) return { ok: false, comps: list, modules: modList, reason: 'no-module' };
  const mod = modList[idx];
  if (!mod.mount) return { ok: false, comps: list, modules: modList, reason: 'not-mounted' };
  // 直角安裝：零件座標本來就在自己的平面，拆下只清掉 mount。
  if (mod.mount.orient || mod.mount.face) {
    return { ok: true, comps: list, modules: modList.map((m, i) => i === idx ? { ...m, mount: null } : m), reason: 'ok' };
  }

  const motor = motorState || {};
  const activeMotor = motor.activeMotor;
  const theta = Number(motor.theta) || 0;
  const motorAngles = { ...(motor.motorAngles || {}) };
  const solveAngles = { ...motorAngles, [activeMotor]: theta };
  const asm = compileAssembly(list, modList, { params });
  const sol = solveAssembly(asm, { thetaDeg: theta, motorAngles: solveAngles });
  if (!sol.isValid) return { ok: false, comps: list, modules: modList, reason: 'unsolved' };

  const hostMod = modList.find(m => m.id === mod.mount.to.module);
  const hostComps = list.filter(c => c.moduleId === (hostMod && hostMod.id));
  const now = hostMod ? outputPose(hostMod, mod.mount.to.output, sol.points, hostComps) : null;
  if (!now) return { ok: false, comps: list, modules: modList, reason: 'host-invalid' };
  const ref = mod.mount.ref;
  // 角度差換算到 (-180, 180]（同 rebakeModules）。
  const delta = ((now.a - ref.a) % 360 + 540) % 360 - 180;
  const newComps = list.map(c => c.moduleId === moduleId ? transformComp(c, ref, now, delta) : c);
  const newModules = modList.map((m, i) => i === idx ? { ...m, mount: null } : m);
  return { ok: true, comps: newComps, modules: newModules, reason: 'ok' };
}

// 翻面：只改疊層順序（底板移到最外層），零件座標不動；flip 為假時移除 flip 欄位。不改輸入。
export function setMountFlip(comps, modules, moduleId, flip) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const idx = modList.findIndex(m => m.id === moduleId);
  if (idx < 0) return { ok: false, comps: list, modules: modList, reason: 'no-module' };
  const mod = modList[idx];
  if (mod.mount?.face) return { ok: false, comps: list, modules: modList, reason: 'face-mount' };
  if (!mod.mount) return { ok: false, comps: list, modules: modList, reason: 'not-mounted' };
  const { flip: _drop, ...rest } = mod.mount;
  const mount = flip ? { ...rest, flip: true } : rest;
  const newModules = modList.map((m, i) => i === idx ? { ...m, mount } : m);
  return { ok: true, comps: list, modules: newModules, reason: 'ok' };
}

// 解散：只允許未安裝、且沒有其他模組裝在它上面的模組。
export function dissolveModule(comps, modules, moduleId) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m.id === moduleId);
  if (!mod) return { ok: false, comps: list, modules: modList, reason: 'no-module' };
  if (mod.mount) return { ok: false, comps: list, modules: modList, reason: 'mounted' };
  if (modList.some(m => m.mount && m.mount.to.module === moduleId)) {
    return { ok: false, comps: list, modules: modList, reason: 'has-children' };
  }
  const newComps = list.map(c => {
    if (c.moduleId !== moduleId) return c;
    const rest = { ...c };
    delete rest.moduleId;
    return rest;
  });
  const newModules = modList.filter(m => m.id !== moduleId);
  return { ok: true, comps: newComps, modules: newModules, reason: 'ok' };
}

// 此模組實際參照到的 params key（各零件 paramProps 指到的 key 聯集）。
// 零件所有參照 token（含孔的 distParam、皮帶輪 pinRadiusParam 等 paramProps 沒列的欄位）；呼叫端再與 params key 取交集。
function referencedParamKeys(comps) {
  const keys = new Set();
  comps.forEach(c => refTokensOf(c).forEach(k => keys.add(k)));
  return keys;
}

// 匯出成模板：零件去掉 moduleId；params 只保留零件參照到的 key。
export function moduleToTemplate(comps, modules, params, moduleId) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m.id === moduleId);
  const moduleComps = list.filter(c => c.moduleId === moduleId).map(c => {
    const rest = { ...c };
    delete rest.moduleId;
    return rest;
  });
  const refKeys = referencedParamKeys(moduleComps);
  const srcParams = params || {};
  const outParams = {};
  refKeys.forEach(k => { if (k in srcParams) outParams[k] = srcParams[k]; });
  const template = {
    kind: 'blocks-module', v: 1,
    name: mod ? mod.name : '',
    comps: moduleComps,
    params: outParams
  };
  if (mod && mod.source) template.source = mod.source;
  if (mod && mod.base) template.base = mod.base;
  template.outputs = mod && Array.isArray(mod.outputs) ? clone(mod.outputs) : [];
  if (mod && mod.mates) template.mates = clone(mod.mates);   // M1：接合面跟著範本走
  if (mod && mod.faceParts) template.faceParts = clone(mod.faceParts);
  return template;
}

// 走 normalizeSnapshot（零件）＋ normalizeModules（base／outputs，用暫時 moduleId）同一套檢查。
export function normalizeTemplate(raw) {
  if (raw && typeof raw === 'object' && raw.kind === 'blocks-composite') return normalizeComposite(raw);
  if (!raw || typeof raw !== 'object' || raw.kind !== 'blocks-module') {
    return { ok: false, template: null, warnings: ['kind 必須是 blocks-module，已拒絕。'] };
  }
  if (!Array.isArray(raw.comps)) {
    return { ok: false, template: null, warnings: ['comps 必須是陣列，已拒絕。'] };
  }
  const warnings = [];
  const snap = normalizeSnapshot({ kind: 'blocks', v: 1, comps: raw.comps, params: raw.params });
  if (!snap) return { ok: false, template: null, warnings: ['零件格式不正確，已拒絕。'] };
  warnings.push(...snap.warnings);
  const cleanComps = snap.comps;

  const TEMPLATE_MODULE_ID = '__template__';
  const taggedComps = cleanComps.map(c => ({ ...c, moduleId: TEMPLATE_MODULE_ID }));
  const moduleDescriptor = {
    id: TEMPLATE_MODULE_ID, name: raw.name, source: raw.source, base: raw.base, outputs: raw.outputs, mount: null, mates: raw.mates, faceParts: raw.faceParts
  };
  const modResult = normalizeModules([moduleDescriptor], taggedComps);
  warnings.push(...modResult.warnings);
  if (!modResult.ok) return { ok: false, template: null, warnings };
  const modNorm = modResult.modules.find(m => m.id === TEMPLATE_MODULE_ID);
  if (!modNorm) return { ok: false, template: null, warnings };

  const template = { kind: 'blocks-module', v: 1, name: sanitizeName(raw.name, '模組'), comps: cleanComps, params: snap.params };
  if (typeof raw.source === 'string' && /^[\w.-]+$/u.test(raw.source)) template.source = raw.source;
  if (modNorm.base) template.base = modNorm.base;
  template.outputs = modNorm.outputs || [];
  if (modNorm.mates) template.mates = modNorm.mates;
  if (modNorm.faceParts) template.faceParts = modNorm.faceParts;
  return { ok: true, template, warnings };
}

// 深層字串替換：把 renameMap 命中的值換掉；physicalMotor 家族欄位另外處理，不在這裡碰。
function renameStrings(value, renameMap) {
  if (typeof value === 'string') return renameMap.has(value) ? renameMap.get(value) : value;
  if (Array.isArray(value)) return value.map(v => renameStrings(v, renameMap));
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => {
      out[k] = MOTOR_KEYS.has(k) ? value[k] : renameStrings(value[k], renameMap);
    });
    return out;
  }
  return value;
}

// 深層改寫 physicalMotor 家族欄位的值。
function renameMotors(value, motorMap) {
  if (Array.isArray(value)) return value.map(v => renameMotors(v, motorMap));
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => {
      if (MOTOR_KEYS.has(k) && value[k] !== undefined && value[k] !== null && value[k] !== '') {
        const old = String(value[k]);
        out[k] = motorMap.has(old) ? motorMap.get(old) : value[k];
      } else {
        out[k] = renameMotors(value[k], motorMap);
      }
    });
    return out;
  }
  return value;
}

// 依模板出現順序收集 physicalMotor 家族欄位的舊值（去重、保留第一次出現的順序）。
function scanMotors(value, seen, order) {
  if (Array.isArray(value)) { value.forEach(v => scanMotors(v, seen, order)); return; }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach(k => {
      if (MOTOR_KEYS.has(k) && value[k] !== undefined && value[k] !== null && value[k] !== '') {
        const s = String(value[k]);
        if (!seen.has(s)) { seen.add(s); order.push(s); }
      } else {
        scanMotors(value[k], seen, order);
      }
    });
  }
}

function findPointPos(list, id) {
  for (const c of list) {
    for (const k of pointKeysFor(c)) {
      if (c[k] && c[k].id === id) return { x: c[k].x, y: c[k].y };
    }
  }
  return null;
}

// 輸出端的 at／body／bolts 依 renameStr 改名（單一模組與組合積木共用）；輸出端 id 是每個模組自己的，不改。
function renameOutputs(list, renameStr) {
  return (Array.isArray(list) ? list : []).map(o => {
    const body = o && o.body ? { ...o.body } : null;
    if (body) {
      if (typeof body.id === 'string') body.id = renameStr(body.id);
      if (typeof body.a === 'string') body.a = renameStr(body.a);
      if (typeof body.b === 'string') body.b = renameStr(body.b);
    }
    const out = { id: o.id, name: o.name, at: renameStr(o.at), body };
    if (Array.isArray(o.bolts) && o.bolts.length) out.bolts = o.bolts.map(renameStr);
    if (o.orthogonal && typeof o.orthogonal === 'object') out.orthogonal = { ...o.orthogonal };
    return out;
  });
}

// M1：接合面的參照跟著零件改名（bar／triangle 的零件 id）；輸出端 id 是每個模組自己的，不改。
function renameMates(mates, renameStr) {
  if (!mates || typeof mates !== 'object') return undefined;
  const m = clone(mates);
  (Array.isArray(m.receive) ? m.receive : []).forEach(r => { if (r && r.ref && (r.ref.kind === 'bar' || r.ref.kind === 'triangle')) r.ref.id = renameStr(r.ref.id); });
  return m;
}

// 插入模板實例：自有 token／param key 加後綴 _N（N 從 counter+1 起，撞 existingTokens 就重試）；
// 馬達重新編號成未用過的最小正整數；整組平移讓 base（沒有則第一個接點）落在 place。
export function instantiateTemplate(template, ctx) {
  const t = template || {};
  const srcComps = Array.isArray(t.comps) ? clone(t.comps) : [];
  const srcParams = (t.params && typeof t.params === 'object') ? clone(t.params) : {};
  const context = ctx || {};
  const existing = context.existingTokens instanceof Set ? context.existingTokens : new Set(context.existingTokens || []);
  const place = context.place || { x: 0, y: 0 };

  const selfTokens = new Set();
  srcComps.forEach(c => ownTokensOf(c).forEach(tok => selfTokens.add(tok)));
  const paramKeys = new Set(Object.keys(srcParams));

  const candidateNames = (n) => {
    const names = new Set();
    selfTokens.forEach(tok => names.add(`${tok}_${n}`));
    paramKeys.forEach(k => names.add(`${k}_${n}`));
    names.add(`Mod${n}`);
    return names;
  };
  let n = (Number(context.counter) || 0) + 1;
  while ([...candidateNames(n)].some(name => existing.has(name))) n++;
  const moduleId = `Mod${n}`;

  const renameMap = new Map();
  selfTokens.forEach(tok => renameMap.set(tok, `${tok}_${n}`));
  paramKeys.forEach(k => { if (!renameMap.has(k)) renameMap.set(k, `${k}_${n}`); });

  // 馬達重新編號（依出現順序、未用過的最小正整數）。
  const seenMotors = new Set();
  const motorOrder = [];
  srcComps.forEach(c => scanMotors(c, seenMotors, motorOrder));
  const usedMotors = new Set((context.usedMotorIds || []).map(String));
  const motorMap = new Map();
  motorOrder.forEach(old => {
    let m = 1;
    while (usedMotors.has(String(m))) m++;
    motorMap.set(old, String(m));
    usedMotors.add(String(m));
  });

  let renamedComps = srcComps.map(c => {
    let out = renameStrings(c, renameMap);
    out = renameMotors(out, motorMap);
    out.moduleId = moduleId;
    return out;
  });

  const renameStr = (s) => (typeof s === 'string' && renameMap.has(s)) ? renameMap.get(s) : s;
  let baseId = (typeof t.base === 'string') ? renameStr(t.base) : null;
  if (!baseId) {
    outer: for (const c of renamedComps) {
      for (const k of pointKeysFor(c)) {
        if (c[k] && c[k].id) { baseId = c[k].id; break outer; }
      }
    }
  }

  let basePos = baseId ? findPointPos(renamedComps, baseId) : null;
  if (!basePos) basePos = { x: 0, y: 0 };
  const originPose = { x: basePos.x, y: basePos.y, a: 0 };
  const destPose = { x: Number(place.x) || 0, y: Number(place.y) || 0, a: 0 };
  renamedComps = renamedComps.map(c => {
    const moved = transformComp(c, originPose, destPose, 0);
    moved.moduleId = moduleId;
    return moved;
  });

  const outputs = renameOutputs(t.outputs, renameStr);

  const mod = { id: moduleId, name: (typeof t.name === 'string' && t.name) ? t.name : moduleId, outputs, mount: null };
  if (typeof t.source === 'string' && t.source) mod.source = t.source;
  if (baseId) mod.base = baseId;
  if (t.mates) mod.mates = renameMates(t.mates, renameStr);
  if (t.faceParts) mod.faceParts = { ...t.faceParts, ...(t.faceParts.part && t.faceParts.part !== 'frame' ? { part: renameStr(t.faceParts.part) } : {}), ...(t.faceParts.attach && t.faceParts.attach !== 'frame' ? { attach: renameStr(t.faceParts.attach) } : {}) };

  const newParams = {};
  Object.keys(srcParams).forEach(k => {
    const nk = renameMap.has(k) ? renameMap.get(k) : k;
    newParams[nk] = srcParams[k];
  });

  return { comps: renamedComps, params: newParams, module: mod, counter: n };
}

// ---------------------------------------------------------------- B7 組合積木（SDD-ASSEMBLY-BENCH §2-7、Q4）
export const COMPOSITE_MAX_MODULES = 16;   // 與 module-schema 的模組數上限一致

// 以 rootModuleId 為根，沿「裝在它上面」往下收集整棵子樹（深度優先、根在前；任何安裝型態都算）。
function compositeModuleIds(modList, rootId) {
  const ids = [];
  const seen = new Set();
  const visit = id => {
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
    modList.forEach(m => { if (m && m.mount && m.mount.to && m.mount.to.module === id) visit(m.id); });
  };
  visit(rootId);
  return ids;
}

// 存成組合積木：根模組＋所有（遞迴）裝在它上面的模組；零件保留 moduleId；根自己的 mount 丟掉（範本裡根是未安裝）。
export function compositeToTemplate(comps, modules, params, rootModuleId) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const root = modList.find(m => m && m.id === rootModuleId);
  if (!root) return null;
  const ids = compositeModuleIds(modList, root.id);
  const idSet = new Set(ids);
  const byId = new Map(modList.map(m => [m.id, m]));
  const outModules = ids.map(id => {
    const m = clone(byId.get(id));
    if (id === root.id) m.mount = null;
    else if (!m.mount) m.mount = null;
    return m;
  });
  const outComps = clone(list.filter(c => c && idSet.has(c.moduleId)));
  const refKeys = referencedParamKeys(outComps);
  const srcParams = params || {};
  const outParams = {};
  refKeys.forEach(k => { if (k in srcParams) outParams[k] = srcParams[k]; });
  return {
    kind: 'blocks-composite', v: 1,
    name: ids.map(id => byId.get(id).name || id).join('＋'),
    modules: outModules, comps: outComps, params: outParams
  };
}

// 組合積木的驗證：零件走 normalizeSnapshot、模組走 normalizeModules（含 mount）；
// 只留「從唯一的根（未安裝）一路裝得上去」的模組，壞的連同它的零件一起捨棄。
function normalizeComposite(raw) {
  if (!Array.isArray(raw.comps) || !Array.isArray(raw.modules)) {
    return { ok: false, template: null, warnings: ['組合積木的 comps／modules 必須是陣列，已拒絕。'] };
  }
  const warnings = [];
  // normalizeSnapshot 會連 modules（含 mount、輸出端）一起走 normalizeModules；零件的 moduleId 也在這裡保留。
  const snap = normalizeSnapshot({ kind: 'blocks', v: 1, comps: raw.comps, modules: raw.modules, params: raw.params });
  if (!snap) return { ok: false, template: null, warnings: ['零件或模組格式不正確，已拒絕。'] };
  warnings.push(...snap.warnings);
  const modResult = { modules: snap.modules, comps: snap.comps };
  const root = modResult.modules.find(m => !m.mount);
  if (!root) return { ok: false, template: null, warnings: [...warnings, '組合積木找不到未安裝的根模組，已拒絕。'] };
  const keep = new Set([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    modResult.modules.forEach(m => {
      if (!keep.has(m.id) && m.mount && keep.has(m.mount.to.module)) { keep.add(m.id); grew = true; }
    });
  }
  const rawById = new Map(raw.modules.filter(m => m && typeof m === 'object').map(m => [m.id, m]));
  const modules = [root, ...modResult.modules.filter(m => m.id !== root.id && keep.has(m.id))].map(m => {
    const out = { ...m };
    const rp = rawById.get(m.id) && rawById.get(m.id).ports;
    if (Array.isArray(rp)) out.ports = clone(rp);
    return out;
  });
  modResult.modules.forEach(m => { if (!keep.has(m.id)) warnings.push(`組合積木的模組 ${m.id} 裝不回根模組，已捨棄。`); });
  const comps = modResult.comps.filter(c => c.moduleId && keep.has(c.moduleId));
  const template = { kind: 'blocks-composite', v: 1, name: sanitizeName(raw.name, '組合積木'), modules, comps, params: snap.params };
  return { ok: true, template, warnings };
}

// 整組（組合積木實例）平移：只動主視圖平面的零件（planeOf 為 null）；直角子模組在自己平面的零件不動。
// mount.ref 是宿主輸出端／桿在宿主座標下的位姿，宿主在主視圖時 ref 要跟著平移（同平面安裝的 ref 不跟會被 rebake 當成位移）。
export function translateComposite(comps, modules, dx, dy) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return { comps: list, modules: modList };
  const move = { x: 0, y: 0, a: 0 }, to = { x: dx, y: dy, a: 0 };
  const newComps = list.map(c => planeOf(list, modList, c) === null ? transformComp(c, move, to, 0) : c);
  const newModules = modList.map(m => {
    if (!m.mount || !m.mount.ref || planeOf(list, modList, m.mount.to.module) !== null) return m;
    return { ...m, mount: { ...m.mount, ref: { ...m.mount.ref, x: m.mount.ref.x + dx, y: m.mount.ref.y + dy },
      ...(m.mount.face ? { face: { ...m.mount.face, translation: { ...m.mount.face.translation, x: m.mount.face.translation.x + dx, y: m.mount.face.translation.y + dy } } } : {}) } };
  });
  return { comps: newComps, modules: newModules };
}

// 插入組合積木實例：整組用同一個後綴 _N 改名（模組 id 取 Mod{N}…Mod{N+K-1}、零件／接點／孔／param key、
// 馬達編號對 usedMotorIds 與組合內部都不重複），安裝關係（to.module／to.body／home 的馬達編號）與輸出端、base、ports 一併改；
// 整組平移讓根模組的 base 落在 place（只動主視圖零件，見 translateComposite）。
export function instantiateComposite(template, ctx) {
  const t = template || {};
  const srcMods = Array.isArray(t.modules) ? clone(t.modules) : [];
  const srcComps = Array.isArray(t.comps) ? clone(t.comps) : [];
  const srcParams = (t.params && typeof t.params === 'object') ? clone(t.params) : {};
  const context = ctx || {};
  const existing = context.existingTokens instanceof Set ? context.existingTokens : new Set(context.existingTokens || []);
  const place = context.place || { x: 0, y: 0 };
  const K = Math.max(1, srcMods.length);

  const selfTokens = new Set();
  srcComps.forEach(c => ownTokensOf(c).forEach(tok => selfTokens.add(tok)));
  const paramKeys = new Set(Object.keys(srcParams));
  const candidateNames = n => {
    const names = new Set();
    selfTokens.forEach(tok => names.add(`${tok}_${n}`));
    paramKeys.forEach(k => names.add(`${k}_${n}`));
    for (let i = 0; i < K; i++) names.add(`Mod${n + i}`);
    return names;
  };
  let n = (Number(context.counter) || 0) + 1;
  while ([...candidateNames(n)].some(name => existing.has(name))) n++;

  const moduleMap = new Map(srcMods.map((m, i) => [m.id, `Mod${n + i}`]));
  const renameMap = new Map();
  selfTokens.forEach(tok => renameMap.set(tok, `${tok}_${n}`));
  paramKeys.forEach(k => { if (!renameMap.has(k)) renameMap.set(k, `${k}_${n}`); });
  const renameStr = s => (typeof s === 'string' && renameMap.has(s)) ? renameMap.get(s) : s;

  // 馬達重新編號：整個組合依出現順序，取未用過的最小正整數。
  const seenMotors = new Set();
  const motorOrder = [];
  srcComps.forEach(c => scanMotors(c, seenMotors, motorOrder));
  const usedMotors = new Set((context.usedMotorIds || []).map(String));
  const motorMap = new Map();
  motorOrder.forEach(old => {
    let m = 1;
    while (usedMotors.has(String(m))) m++;
    motorMap.set(old, String(m));
    usedMotors.add(String(m));
  });

  let comps = srcComps.map(c => {
    const out = renameMotors(renameStrings(c, renameMap), motorMap);
    if (c.moduleId !== undefined) out.moduleId = moduleMap.get(c.moduleId) || c.moduleId;
    return out;
  });

  const modules = srcMods.map(m => {
    const out = { id: moduleMap.get(m.id), name: (typeof m.name === 'string' && m.name) ? m.name : moduleMap.get(m.id) };
    if (typeof m.source === 'string' && m.source) out.source = m.source;
    if (typeof m.base === 'string' && m.base) out.base = renameStr(m.base);
    out.outputs = renameOutputs(m.outputs, renameStr);
    if (Array.isArray(m.ports)) {
      out.ports = m.ports.map(p => {
        const q = { ...p };
        if (q.body && typeof q.body === 'object') { q.body = { ...q.body }; if (typeof q.body.id === 'string') q.body.id = renameStr(q.body.id); }
        if (Array.isArray(q.holes)) q.holes = q.holes.map(renameStr);
        if (Array.isArray(q.bolts)) q.bolts = q.bolts.map(renameStr);
        return q;
      });
    }
    let mount = null;
    const sm = m.mount;
    if (sm && sm.to && moduleMap.has(sm.to.module)) {
      const to = { module: moduleMap.get(sm.to.module) };
      if (sm.to.output !== undefined) to.output = sm.to.output;          // 輸出端 id 是每個模組自己的，不改
      if (sm.to.body !== undefined) to.body = renameStr(sm.to.body);
      if (sm.to.edge !== undefined) to.edge = sm.to.edge;                   // C1：三角板的邊序號
      if (sm.to.frame !== undefined) to.frame = { ...sm.to.frame };         // C1：機架板外框的邊序號
      mount = { ...clone(sm), to };
      const home = {};
      Object.keys(sm.home || {}).forEach(k => { if (motorMap.has(String(k))) home[motorMap.get(String(k))] = sm.home[k]; });
      mount.home = home;
    }
    out.mount = mount;
    if (m.mates) out.mates = renameMates(m.mates, renameStr);
    // 群組 id／output 屬於宿主；成員是作品層級模組 id，複製時必須一起改號。
    if (m.rigidGroups) out.rigidGroups = m.rigidGroups.map(g => ({ ...g, members: g.members.map(id => moduleMap.get(id) || id) }));
    return out;
  });

  const newParams = {};
  Object.keys(srcParams).forEach(k => { newParams[renameStr(k)] = srcParams[k]; });

  // 根（未安裝）模組的 base 落在 place；沒有 base 就取根模組第一個接點。
  const root = modules.find(m => !m.mount) || modules[0];
  let basePos = null;
  if (root) {
    const rootComps = comps.filter(c => c.moduleId === root.id);
    if (root.base) basePos = findPointPos(rootComps, root.base);
    if (!basePos) {
      outer: for (const c of rootComps) {
        for (const k of pointKeysFor(c)) { if (c[k] && Number.isFinite(c[k].x)) { basePos = { x: c[k].x, y: c[k].y }; break outer; } }
      }
    }
  }
  if (basePos) {
    const moved = translateComposite(comps, modules, (Number(place.x) || 0) - basePos.x, (Number(place.y) || 0) - basePos.y);
    comps = moved.comps;
    moved.modules.forEach((m, i) => { modules[i] = m; });
  }
  return { comps, params: newParams, modules, counter: n + K - 1 };
}

// 內建模組：齒條升降（輸出 carriage＝LiftOutput）、齒輪夾爪（base GCA；去掉夾爪任務 params）。
export const BUILTIN_MODULES = [
  { id: 'rack-lift', name: '齒條升降', source: 'competition-rack-lift', description: '小齒輪帶動垂直齒條升降。' },
  { id: 'gear-gripper', name: '齒輪夾爪', source: 'gear-gripper', description: '雙齒輪同步開合夾爪。' },
  { id: 'fourbar-lift', name: '四連桿升降臂', source: 'competition-fourbar-lift', description: '平行四連桿升降，工具架保持水平。' }
];

export function builtinTemplate(id) {
  const entry = BUILTIN_MODULES.find(m => m.id === id);
  if (!entry) return null;
  const example = BLOCK_EXAMPLES.find(e => e.id === entry.source);
  if (!example) return null;
  const comps = clone(example.snapshot.comps || []);
  const refKeys = referencedParamKeys(comps);
  const srcParams = example.snapshot.params || {};
  const params = {};
  refKeys.forEach(k => { if (k in srcParams) params[k] = srcParams[k]; });
  const template = { kind: 'blocks-module', v: 1, name: entry.name, source: entry.source, comps, params };
  if (id === 'rack-lift') {
    template.base = 'LPC';
    // 滑台輸出端兩顆 M3 螺絲孔（LiftOutput＋LiftOutputB，v 同為 -15，u 96 在長槽之外、齒條本體之內），
    // 夾爪鎖上去才不會繞單一孔轉。
    const rackComp = comps.find(c => c.type === 'rack');
    if (rackComp && Array.isArray(rackComp.holes) && !rackComp.holes.some(h => h.id === 'LiftOutputB')) {
      rackComp.holes.push({ id: 'LiftOutputB', type: 'floating', u: 96, v: -15, diameter: 3.2 });
    }
    template.outputs = [{ id: 'carriage', name: '滑台', at: 'LiftOutput', body: { kind: 'rack', id: 'LiftRackGear' }, bolts: ['LiftOutput', 'LiftOutputB'] }];
    template.mates = { attach: { normalDeg: 180 }, receive: [{ id: 'r1', name: '滑台', ref: { kind: 'bolt', output: 'carriage' } }] };   // M1：與 suggestMates 規則一致（有 2 個對鎖孔的輸出端）
  } else if (id === 'fourbar-lift') {
    // 拿掉手腕馬達：工具架 ToolPlate 變成一般桿，靠平行四連桿保持水平；補斜撐 ToolDiag（B–D）避免 A-B-C-D 晃動。
    const plate = comps.find(c => c.id === 'ToolPlate');
    const brace = comps.find(c => c.id === 'ToolBrace');
    if (plate) {
      ['isInput', 'physicalMotor', 'motorType', 'motorCarrier', 'motorMount', 'phaseOffset'].forEach(k => { delete plate[k]; });
      if (plate.p1) delete plate.p1.physicalMotor;
    }
    // 放大到能吊得動夾爪的比例（範例臂長 48 mm 太小，夾爪約 180 mm）：臂長 140、工具架 80，立桿維持 72。
    const SCALE_PTS = { A: [44, 0], B: [44, 72], C: [124, 72], D: [124, 0] };
    comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
      const q = c[k];
      if (q && SCALE_PTS[q.id]) { q.x = SCALE_PTS[q.id][0]; q.y = SCALE_PTS[q.id][1]; }
    }));
    Object.assign(params, { LIFT_ARM: 140, LIFT_ARM_2: 140, LIFT_TOOL_TOP: 80, LIFT_TOOL_BOTTOM: 80 });
    const pB = plate && plate.p1 ? { ...plate.p1, type: 'floating' } : null;
    const pD = brace && brace.p2 ? { ...brace.p2, type: 'floating' } : null;
    if (pB && pD) {
      delete pB.physicalMotor; delete pD.physicalMotor;
      const diag = Math.hypot(pD.x - pB.x, pD.y - pB.y);
      comps.push({
        type: 'bar', id: 'ToolDiag', color: '#f39c12', p1: pB, p2: pD,
        lenParam: 'LIFT_TOOL_DIAG', fixedLen: true, isInput: false
      });
      params.LIFT_TOOL_DIAG = diag;
    }
    const crank = comps.find(c => c.isInput);
    if (crank) { crank.motorType = 'mg995'; crank.servoStart = -60; crank.servoEnd = 60; }
    template.base = 'O1';
    template.outputs = [{ id: 'tool', name: '工具架', at: 'D', body: { kind: 'bar', id: 'ToolBrace' }, orthogonal: { side: -1 } }];
    template.mates = { attach: { normalDeg: 180 }, receive: [
      { id: 'r1', name: '工具架上緣', ref: { kind: 'bar', id: 'ToolBrace', side: 1 } },
      { id: 'r2', name: '工具架下緣', ref: { kind: 'bar', id: 'ToolBrace', side: -1 } }] };
  } else if (id === 'gear-gripper') {
    // 專用安裝點 GripMount：避開伺服軸（GCA 是 MG995 輸出軸心，鎖不了），夾爪以它為基準裝到滑台孔上。
    comps.push({ type: 'anchor', id: 'GripMount', p1: { id: 'GripMount', type: 'fixed', x: 0, y: 40 } });
    template.base = 'GripMount';
    template.outputs = [];
    template.mates = { attach: { normalDeg: 90 }, receive: [] };   // 爪往 −y 伸，朝宿主的那一側是 +90°
    // 以實際爪尖（jawCenterline 末端）扣板寬量淨距：0° 約 134 mm，24° 約 9 mm，約 25.7° 兩爪相碰、之後交錯；
    // 故夾爪馬達用 MG995 限 0～24°（接點 p3 是折彎處，不是爪尖，不能拿來量）。
    // 爪臂接齒輪用 M3
    comps.forEach(c => {
      if (c.type === 'gear') c.pinHoleDiameter = 3.2;
    });
    const drive = comps.find(c => c.type === 'gear' && c.p1 && c.p1.physicalMotor);
    if (drive) { drive.motorType = 'mg995'; drive.servoStart = 0; drive.servoEnd = 24; }
  } else {
    template.outputs = [];
  }
  return template;
}

// 本機模組庫：JSON 陣列，每筆走 normalizeTemplate，壞的略過，最多 32 筆。
export function parseLibrary(jsonString) {
  if (typeof jsonString !== 'string') return [];
  let data;
  try { data = JSON.parse(jsonString); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const item of data) {
    if (out.length >= 32) break;
    const r = normalizeTemplate(item);
    if (r.ok) out.push(r.template);
  }
  return out;
}

export function serializeLibrary(list) {
  return JSON.stringify(Array.isArray(list) ? list : []);
}
