/**
 * blocks / interference
 *
 * L5c 干涉檢查：純函式，不碰 DOM、不改輸入。
 * 實物是一層層板疊起來的；匯出前依各馬達行程取樣若干姿態，用平面凸多邊形（SAT）近似找出：
 *   - same-layer：同一層、會相對運動的零件互撞。
 *   - hardware：關節的螺絲頭／防鬆螺帽凸出板外，掃到該高度（mm）上的其他零件；附 fix＝建議的隔圈。
 *   - motor-body：MG995 機身穿過底板往後伸，撞到該高度範圍（mm）內的零件。
 * L6：疊層改用 mm 高度（plan.parts[].zMm），隔圈（plan.gaps）拉開層間距離；resolveSpacers 自動加隔圈，
 * suggestRackStops 建議齒條長槽限位。
 * cross-plane（D4）：直角安裝的子模組拆成「底板」與「其餘零件」兩塊立體板塊，各自的 8 個角投影到宿主平面取凸包，
 *   並用角的高度區間，檢查宿主平面上、多邊形與高度都重疊的零件（宿主那一片本身不算）。
 * 平面近似（桿＝膠囊、齒輪＝圓、機架板＝凸包），仍需實物確認。
 */
import { compileAssembly, solveAssembly, moduleFrameExports, moduleFrameNodes, worldFrameComps, splitFrameMounts, planeOf, orthogonalFrame, orthogonalHostEdge, slabCorners3D } from './assembly.js';
import { frameConnectorNodes } from './model.js';
import { inspectFrameExport, inspectRackExport, splitMountsByHost, motorMountFeatures, isStaticPlate } from './exporters.js';
import { jawCenterline } from './plate-geometry.js';
import { memberStock } from './member-stock.js';
import { deriveMotorMounts, buildPlan, normalizeSpacers } from './build-plan.js';
import { rackGuideThetaRange, rackStopTrims } from './rack-limits.js';

const D2R = Math.PI / 180;
// 重疊（最小穿透深度）超過這個值才算撞；貼邊、公差級的擦邊不算。
const MIN_PENETRATION_MM = 0.5;
const HEAD_RADIUS_MM = 2.8;      // M3 螺絲頭
const NUT_RADIUS_MM = 3.2;       // M3 防鬆螺帽
const STANDOFF_RADIUS_MM = 3;    // L7：M3 隔柱外半徑（直徑 6 mm）
const MOTOR_BODY_MM = 27;        // MG995 機身約 26 mm（舊版以 9 層 3 mm 板估算）
const HEAD_HEIGHT_MM = 2.4;      // M3 圓頭螺絲頭高
const NUT_HEIGHT_MM = 5;         // 尼龍防鬆螺帽 4 mm＋螺絲尾端外露 1 mm
const Z_OVERLAP_MM = 0.1;        // 高度區間重疊超過這個值才算同一高度
const HEAD_FIX_MM = 3;           // 螺絲頭側建議隔圈（≥ 螺絲頭高）
const NUT_FIX_MM = 5;            // 螺帽側建議隔圈
const CIRCLE_SEGMENTS = 24;
const CAP_SEGMENTS = 8;
const POINT_KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];

const finite = v => Number.isFinite(Number(v));
const validPt = p => p && finite(p.x) && finite(p.y);

// ---------- 幾何基元 ----------
function circlePoly(c, r) {
  const out = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = 2 * Math.PI * i / CIRCLE_SEGMENTS;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

// 膠囊：兩端各 8 段半圓。長度近 0 時退化成圓。
function capsulePoly(a, b, r) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-6) return circlePoly(a, r);
  const th = Math.atan2(dy, dx);
  const out = [];
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const t = th - Math.PI / 2 + Math.PI * i / CAP_SEGMENTS;
    out.push({ x: b.x + r * Math.cos(t), y: b.y + r * Math.sin(t) });
  }
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const t = th + Math.PI / 2 + Math.PI * i / CAP_SEGMENTS;
    out.push({ x: a.x + r * Math.cos(t), y: a.y + r * Math.sin(t) });
  }
  return out;
}

function convexHull(points) {
  const pts = points.filter(validPt).map(p => ({ x: Number(p.x), y: Number(p.y) })).sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  pts.forEach(p => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  });
  const upper = [];
  [...pts].reverse().forEach(p => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 兩個凸多邊形的 SAT 最小穿透深度（沒重疊回 0）。
function penetration(A, B) {
  if (!A || !B || A.length < 3 || B.length < 3) return 0;
  let min = Infinity;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ex = q.x - p.x, ey = q.y - p.y;
      const len = Math.hypot(ex, ey);
      if (len < 1e-9) continue;
      const nx = -ey / len, ny = ex / len;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of A) { const d = v.x * nx + v.y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const v of B) { const d = v.x * nx + v.y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return 0;
      if (overlap < min) min = overlap;
    }
  }
  return min === Infinity ? 0 : min;
}

function bboxOf(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  poly.forEach(p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; });
  return { x0, y0, x1, y1 };
}

function polysOverlap(listA, listB) {
  for (const a of listA) {
    const ba = a.__bb || (a.__bb = bboxOf(a));
    for (const b of listB) {
      const bb = b.__bb || (b.__bb = bboxOf(b));
      if (ba.x1 < bb.x0 || bb.x1 < ba.x0 || ba.y1 < bb.y0 || bb.y1 < ba.y0) continue;
      if (penetration(a, b) > MIN_PENETRATION_MM) return true;
    }
  }
  return false;
}

// 由兩組對應點（ref → cur）求剛體變換；只有一個點時只平移。回傳 { cos, sin, tx, ty, angleRad }。
function rigidFrom(refA, refB, curA, curB) {
  let ang = 0;
  if (refB && curB) ang = Math.atan2(curB.y - curA.y, curB.x - curA.x) - Math.atan2(refB.y - refA.y, refB.x - refA.x);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return { cos, sin, angleRad: ang, tx: curA.x - (refA.x * cos - refA.y * sin), ty: curA.y - (refA.x * sin + refA.y * cos) };
}
const applyXf = (xf, p) => ({ x: p.x * xf.cos - p.y * xf.sin + xf.tx, y: p.x * xf.sin + p.y * xf.cos + xf.ty });
const IDENTITY_XF = { cos: 1, sin: 0, tx: 0, ty: 0, angleRad: 0 };

// ---------- 主程式 ----------
// 建立檢查器：做完所有「與姿態無關」的準備（機架外形、剛體分組…），回傳 { solveWalk, solveMulti, runPose }。
// runPose(pose, results, seen) 檢查單一姿態，把新發現的干涉 push 進 results（seen 用來去重）。
function createChecker({ comps, modules = [], params = {}, plan, motorIds = [], exportSettings = {}, mounts } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const parts = (plan && plan.parts) || [];
  const joints = (plan && plan.joints) || [];
  const planMotors = (plan && plan.motors) || [];
  if (!parts.length) return [];

  // 板的高度區間（mm）：[底面, 頂面]；舊呼叫端的 plan 沒有 zMm 時退回層號×板厚。
  const zOf = p => Number.isFinite(Number(p.zMm)) ? Number(p.zMm) : p.layer * p.thicknessMm;
  const zSpan = p => [zOf(p), zOf(p) + p.thicknessMm];
  const zOverlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > Z_OVERLAP_MM;

  const compById = new Map(list.filter(c => c && c.id).map(c => [c.id, c]));
  const modById = new Map(modList.map(m => [m.id, m]));
  const partByName = new Map(parts.map(p => [p.name, p]));
  const exp = { ...exportSettings };
  // 不同平面（直角安裝）的零件互不比較；跨平面的部分由下面的 cross-plane 檢查處理。
  const samePlane = (a, b) => ((a && a.plane) || null) === ((b && b.plane) || null);
  const mountedMod = id => { const m = id != null ? modById.get(id) : null; return m && m.mount ? m : null; };

  const zeros = {};
  motorIds.forEach(id => { zeros[id] = 0; });
  let asm = null;
  try { asm = compileAssembly(list, modList, { params }); } catch (e) { return null; }
  // 連續求解：從組裝姿態（全部 0°）沿著馬達角度每步 ≤ 5° 走過去，每步用上一步的點當種子，
  // 才不會跳到另一個組裝分支（例如平行四連桿在大角度時跳成交叉的反平行四連桿）。
  const STEP_DEG = 5;
  const solveOnce = (angles, prev) => {
    try { return solveAssembly(asm, { thetaDeg: 0, motorAngles: angles, ...(prev ? { _prevPoints: prev } : {}) }); } catch (e) { return null; }
  };
  const home = solveOnce({ ...zeros }, null);
  const walkCache = new Map();   // motor -> [{ a, points }]（由 0 往兩側）
  const solveWalk = (motor, target) => {
    if (!home || !home.isValid) return null;
    if (motor == null || Math.abs(target) < 1e-9) return home;
    const key = motor + (target < 0 ? '-' : '+');
    if (!walkCache.has(key)) walkCache.set(key, [{ a: 0, sol: home }]);
    const path = walkCache.get(key);
    let last = path[path.length - 1];
    // 已走過更遠：找最近的已知點再往前
    const known = path.filter(p => Math.abs(p.a) <= Math.abs(target) + 1e-9).pop();
    if (known && Math.abs(known.a - target) < 1e-9) return known.sol;
    last = known;
    let a = last.a, sol = last.sol;
    const dir = target > a ? 1 : -1;
    while (Math.abs(target - a) > 1e-9) {
      a = Math.abs(target - a) <= STEP_DEG ? target : a + dir * STEP_DEG;
      sol = solveOnce({ ...zeros, [motor]: a }, sol && sol.points);
      if (!sol || !sol.isValid) return sol;
      if (Math.abs(a) > Math.abs(path[path.length - 1].a)) path.push({ a, sol });
    }
    return sol;
  };
  // 多顆馬達同時：全部一起從 0 線性內插到目標，每步最大角度 ≤ STEP_DEG（用上一步的點當種子）。
  const solveMulti = target => {
    if (!home || !home.isValid) return null;
    const ids = Object.keys(target || {});
    const big = Math.max(0, ...ids.map(id => Math.abs(Number(target[id]) || 0)));
    if (big < 1e-9) return home;
    const n = Math.max(1, Math.ceil(big / STEP_DEG - 1e-9));
    let sol = home;
    for (let i = 1; i <= n; i++) {
      const ang = { ...zeros };
      ids.forEach(id => { ang[id] = (Number(target[id]) || 0) * i / n; });
      sol = solveOnce(ang, sol && sol.points);
      if (!sol || !sol.isValid) return sol;
    }
    return sol;
  };
  // ---- 剛體分組（union-find）：靜止機架一組；同一組 mount-bolt 關節穿過的零件併成同剛體 ----
  const parent = new Map(parts.map(p => [p.name, p.name]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { if (!parent.has(a) || !parent.has(b)) return; parent.set(find(a), find(b)); };
  const staticOf = part => {
    // 回傳該零件的靜止群組鍵；會動的零件回 null。
    if (part.kind === 'frame') return part.moduleId && mountedMod(part.moduleId) ? 'M:' + part.moduleId : 'WORLD';
    const comp = part.compId ? compById.get(part.compId) : null;
    if (!comp) return null;
    const isStatic = (comp.type === 'triangle' && isStaticPlate(comp)) ||
      (comp.type === 'bar' && comp.p1 && comp.p2 && comp.p1.type === 'fixed' && comp.p2.type === 'fixed');
    if (!isStatic) return null;
    return mountedMod(comp.moduleId) ? 'M:' + comp.moduleId : 'WORLD';
  };
  const staticFirst = new Map();
  parts.forEach(p => {
    const key = staticOf(p);
    if (!key) return;
    if (staticFirst.has(key)) union(p.name, staticFirst.get(key)); else staticFirst.set(key, p.name);
  });
  joints.filter(j => j.kind === 'mount-bolt').forEach(j => { for (let i = 1; i < j.parts.length; i++) union(j.parts[0], j.parts[i]); });
  const sameBody = (a, b) => find(a) === find(b);

  // 嚙合對：齒輪 mesh、齒條 pinion。
  const meshPairs = new Set();
  const pairKey = (a, b) => a < b ? a + '\u0000' + b : b + '\u0000' + a;
  parts.forEach(p => {
    const c = p.compId ? compById.get(p.compId) : null;
    if (!c) return;
    const other = c.type === 'gear' ? c.mesh : c.type === 'rack' ? c.pinion : null;
    const op = other ? partByName.get(other) : null;
    if (op) meshPairs.add(pairKey(p.name, op.name));
  });

  // ---- 機架板外形（參考姿態）----
  const allMounts = Array.isArray(mounts) ? mounts : deriveMotorMounts(list);
  const { free } = splitMountsByHost(list, allMounts);
  const freeSplit = splitFrameMounts(free, list, modList);
  const refFrames = new Map();   // part.name -> { hulls, anchors: [{id,x,y}], moduleId }
  const worldNodes = frameConnectorNodes(worldFrameComps(list, modList));
  if (worldNodes.length && partByName.has('frame')) {
    const g = inspectFrameExport(worldNodes, exp, freeSplit.world);
    refFrames.set('frame', { hulls: ((g && g.outlines) || []).map(convexHull).filter(h => h.length >= 3), anchors: [], moduleId: null });
  }
  moduleFrameExports(list, modList, params).forEach(entry => {
    const name = entry.fileBase;
    if (!partByName.has(name)) return;
    const nodes = moduleFrameNodes(entry, frameConnectorNodes(entry.comps)).filter(validPt);
    if (!nodes.length) return;
    const g = inspectFrameExport(nodes, exp, freeSplit.byModule[entry.moduleId] || []);
    // 取距離最遠的兩個節點當剛體變換的基準。
    let pair = [nodes[0], null], best = -1;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d > best) { best = d; pair = [nodes[i], nodes[j]]; }
    }
    refFrames.set(name, {
      hulls: ((g && g.outlines) || []).map(convexHull).filter(h => h.length >= 3),
      anchors: pair[1] && best > 1e-6 ? pair : [pair[0]],
      moduleId: entry.moduleId
    });
  });

  // ---- 馬達機身（MG995）在底板上的開口外形（參考姿態，取矩形本體那 4 點）----
  const bodies = [];
  planMotors.forEach(m => {
    if (m.type !== 'mg995' || !m.plate) return;
    const mount = allMounts.find(x => x && x.pointId === m.centerId && x.kind === 'mg995');
    const feats = mount ? motorMountFeatures(mount) : null;
    const slot = feats && feats.cutouts.find(c => c.layer === 'MG995_SLOT');
    const plate = partByName.get(m.plate);
    if (!slot || !plate) return;
    // 機身伸向馬達輸出軸（舵盤）的反側：裝在輸出軸上的零件在底板的哪一側，機身就往另一側。
    const shaft = joints.find(j => j.id === m.centerId && j.kind === 'motor-shaft');
    const others = shaft ? shaft.parts.map(n => partByName.get(n)).filter(p => p && p.name !== plate.name) : [];
    const above = others.length ? others.some(p => p.layer > plate.layer) : true;
    const dir = above ? -1 : 1;
    const pz = zOf(plate);
    bodies.push({
      motorId: m.centerId, plate: plate.name,
      poly: convexHull(slot.points.slice(0, 4)),
      // 機身的高度區間（mm）：在底板下方＝[plateZ-27, plateZ]；在上方＝[plateTop, plateTop+27]
      z0: dir < 0 ? pz - MOTOR_BODY_MM : pz + plate.thicknessMm,
      z1: dir < 0 ? pz : pz + plate.thicknessMm + MOTOR_BODY_MM,
      dir
    });
  });

  // ---- 每個姿態的零件外形（懶算、快取）----
  const rackInfo = new Map();   // comp.id -> { minU, maxU, minV, maxV }
  const rackRect = comp => {
    if (rackInfo.has(comp.id)) return rackInfo.get(comp.id);
    const pinion = comp.pinion ? compById.get(comp.pinion) || null : null;
    const g = inspectRackExport(comp, params, pinion);
    const pts = (g && g.outline) || [];
    const info = pts.length ? {
      minU: Math.min(...pts.map(p => p.x)), maxU: Math.max(...pts.map(p => p.x)),
      minV: Math.min(...pts.map(p => p.y)), maxV: Math.max(...pts.map(p => p.y))
    } : null;
    rackInfo.set(comp.id, info);
    return info;
  };

  const frameXf = (pose, name) => {
    const ref = refFrames.get(name);
    if (!ref) return null;
    if (!ref.moduleId) return IDENTITY_XF;                  // 世界機架靜止
    const cache = pose.__xf || (pose.__xf = new Map());
    if (cache.has(name)) return cache.get(name);
    let xf = null;
    const cur = ref.anchors.map(a => pose.points[a.id]);
    if (cur.every(validPt)) xf = rigidFrom(ref.anchors[0], ref.anchors[1] || null, cur[0], cur[1] || null);
    cache.set(name, xf);
    return xf;
  };
  // 模組目前相對參考姿態轉了多少（供齒條軸向修正）。
  const moduleRot = (pose, moduleId) => {
    const m = mountedMod(moduleId);
    if (!m) return 0;
    const xf = frameXf(pose, m.id + '-frame');
    return xf ? xf.angleRad : 0;
  };

  const partPolys = (pose, part) => {
    const cache = pose.__polys || (pose.__polys = new Map());
    if (cache.has(part.name)) return cache.get(part.name);
    let polys = [];
    try { polys = buildPolys(pose, part); } catch (e) { polys = []; }
    cache.set(part.name, polys);
    return polys;
  };
  function buildPolys(pose, part) {
    if (part.kind === 'frame') {
      const ref = refFrames.get(part.name);
      const xf = ref && frameXf(pose, part.name);
      if (!ref || !xf) return [];
      return ref.hulls.map(h => h.map(p => applyXf(xf, p)));
    }
    const comp = part.compId ? compById.get(part.compId) : null;
    if (!comp) return [];
    const pt = key => {
      const id = comp[key] && comp[key].id;
      const p = id && pose.points[id];
      return validPt(p) ? { x: Number(p.x), y: Number(p.y) } : null;
    };
    if (comp.type === 'gear') {
      const c = pt('p1');
      if (!c) return [];
      const teeth = Math.max(6, Math.round(Number(comp.teeth) || 12));
      const R = Number(comp.radiusParam ? params[comp.radiusParam] : NaN) || (Number(comp.module) > 0 ? teeth * Number(comp.module) / 2 : 36);
      return [circlePoly(c, R + 2 * R / teeth)];
    }
    if (comp.type === 'rack') {
      const p1 = pt('p1');
      const rect = rackRect(comp);
      if (!p1 || !rect) return [];
      const a = ((Number(comp.axisDeg) || 0) * D2R) + moduleRot(pose, comp.moduleId);
      const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      const w = (u, v) => ({ x: p1.x + u * ux + v * nx, y: p1.y + u * uy + v * ny });
      return [[w(rect.minU, rect.minV), w(rect.maxU, rect.minV), w(rect.maxU, rect.maxV), w(rect.minU, rect.maxV)]];
    }
    const r = memberStock(comp).widthMm / 2;
    if (comp.type === 'bar') {
      const a = pt('p1'), b = pt('p2');
      return a && b ? [capsulePoly(a, b, r)] : [];
    }
    if (comp.type === 'triangle') {
      const a = pt('p1'), b = pt('p2'), c = pt('p3');
      if (!a || !b || !c) return [];
      let line = null;
      if (comp.shape === 'jaw') line = jawCenterline([a, b, c], comp.jawTurnSign, comp.jawTipLength);
      const segs = [];
      if (line) { for (let i = 0; i + 1 < line.length; i++) segs.push([line[i], line[i + 1]]); }
      else segs.push([a, b], [b, c], [a, c]);
      return segs.map(([p, q]) => capsulePoly(p, q, r));
    }
    return [];
  }

  // ---- 檢查 ----
  let results = [];
  let seen = new Set();
  const keyOf = (kind, names) => kind + '|' + [...names].sort().join('|');
  const report = (kind, names, layer, pose, message, fix) => {
    const key = keyOf(kind, names);
    if (seen.has(key)) return;
    seen.add(key);
    const item = { kind, parts: names, layer, motor: pose.motor, angleDeg: pose.angleDeg, message };
    if (pose.pose) item.pose = { ...pose.pose };
    if (fix) item.fix = fix;
    results.push(item);
  };
  const when = pose => pose.pose
    ? '在目前姿勢（' + (Object.keys(pose.pose).map(k => `馬達 ${k} ${Math.round(Number(pose.pose[k]) || 0)}°`).join('、') || '全部 0°') + '）'
    : pose.motor == null
    ? '在組裝姿態（全部馬達 0°）'
    : `在馬達 ${pose.motor} 轉到 ${Math.round(pose.angleDeg)}° 時`;

  const layerOfParts = new Map();
  parts.forEach(p => { if (!layerOfParts.has(p.layer)) layerOfParts.set(p.layer, []); layerOfParts.get(p.layer).push(p); });

  const orthoMods = modList.filter(m => m && m.mount && m.mount.orient);

  const runPose = (pose, outResults, outSeen) => {
    results = outResults; seen = outSeen;
    // 1. 同層零件互撞
    layerOfParts.forEach((group, layer) => {
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (!samePlane(a, b) || sameBody(a.name, b.name) || meshPairs.has(pairKey(a.name, b.name))) continue;
        if (seen.has(keyOf('same-layer', [a.name, b.name]))) continue;
        if (polysOverlap(partPolys(pose, a), partPolys(pose, b))) {
          report('same-layer', [a.name, b.name], layer, pose,
            `${a.name} 與 ${b.name} 同在第 ${layer} 層，${when(pose)}會互相重疊。建議：改到不同層（上移一層）或調整位置。`);
        }
      }
    });

    // 2. 螺絲頭／防鬆螺帽：用 mm 高度找出被頭／帽掃到的零件
    joints.forEach(j => {
      if (j.kind === 'motor-shaft') return;
      const p = pose.points[j.id];
      if (!validPt(p)) return;
      const jp = j.parts.map(n => partByName.get(n)).filter(Boolean);
      if (!jp.length) return;
      const center = { x: Number(p.x), y: Number(p.y) };
      const zBottom = Math.min(...jp.map(q => zOf(q)));
      const zTop = Math.max(...jp.map(q => zSpan(q)[1]));
      [
        { z0: zBottom - HEAD_HEIGHT_MM, z1: zBottom, r: HEAD_RADIUS_MM, label: '螺絲頭', fix: { below: j.layers[0], mm: HEAD_FIX_MM } },
        { z0: zTop, z1: zTop + NUT_HEIGHT_MM, r: NUT_RADIUS_MM, label: '防鬆螺帽', fix: { below: j.layers[1] + 1, mm: NUT_FIX_MM } }
      ].forEach(h => {
        // 非主平面的關節：隔圈記在該平面（fix 帶 plane）。
        if (j.plane != null) h.fix = { plane: j.plane, ...h.fix };
        const disc = [circlePoly(center, h.r)];
        parts.forEach(v => {
          if (!samePlane(jp[0], v) || j.parts.includes(v.name) || j.parts.some(n => sameBody(n, v.name))) return;
          const [v0, v1] = zSpan(v);
          if (!zOverlap(h.z0, h.z1, v0, v1)) return;
          if (seen.has(keyOf('hardware', [...j.parts, v.name]))) return;
          if (polysOverlap(disc, partPolys(pose, v))) {
            report('hardware', [...j.parts, v.name], v.layer, pose,
              `關節 ${j.id}（${j.parts.join('、')}）的${h.label}凸出到第 ${v.layer} 層，${when(pose)}螺絲頭／螺帽會刮到 ${v.name}。建議：在第 ${h.fix.below - 1}、${h.fix.below} 層之間加 ${h.fix.mm} mm 隔圈（或改用沉頭），或避開路徑。`,
              { ...h.fix });
          }
        });
      });
    });

    // 2b. L7 隔柱：螺絲中間沒有板的層會套隔柱（半徑 3 mm 的圓柱），掃到那些層的其他零件就是干涉；隔圈解不掉，不附 fix。
    joints.forEach(j => {
      if (!(Number(j.standoffMm) > 0)) return;
      const p = pose.points[j.id];
      if (!validPt(p)) return;
      const jp = j.parts.map(n => partByName.get(n)).filter(Boolean);
      const jointLayers = new Set(jp.map(q => q.layer));
      const empty = new Set();
      for (let l = j.layers[0] + 1; l < j.layers[1]; l++) if (!jointLayers.has(l)) empty.add(l);
      if (!empty.size) return;
      const disc = [circlePoly({ x: Number(p.x), y: Number(p.y) }, STANDOFF_RADIUS_MM)];
      parts.forEach(v => {
        if (!empty.has(v.layer) || !samePlane(jp[0], v)) return;
        if (j.parts.includes(v.name) || j.parts.some(n => sameBody(n, v.name))) return;
        if (seen.has(keyOf('hardware', [...j.parts, v.name]))) return;
        if (polysOverlap(disc, partPolys(pose, v))) {
          report('hardware', [...j.parts, v.name], v.layer, pose,
            `關節 ${j.id}（${j.parts.join('、')}）中間的 ${Math.round(j.standoffMm * 10) / 10} mm 隔柱穿過第 ${v.layer} 層，${when(pose)}隔柱會刮到 ${v.name}。建議：調整零件路徑，或避免讓這顆螺絲跨過這一層。`);
        }
      });
    });

    // 3. MG995 機身
    bodies.forEach(body => {
      const xf = frameXf(pose, body.plate);
      if (!xf) return;
      const poly = [body.poly.map(q => applyXf(xf, q))];
      parts.forEach(v => {
        if (v.name === body.plate || sameBody(body.plate, v.name) || !samePlane(partByName.get(body.plate), v)) return;
        const [v0, v1] = zSpan(v);
        if (!zOverlap(body.z0, body.z1, v0, v1)) return;
        if (seen.has(keyOf('motor-body', [body.plate, v.name]))) return;
        if (polysOverlap(poly, partPolys(pose, v))) {
          report('motor-body', [body.plate, v.name], v.layer, pose,
            `馬達軸 ${body.motorId} 的 MG995 機身（穿過 ${body.plate}，往${body.dir < 0 ? '下' : '上'}佔 ${MOTOR_BODY_MM} mm 高）${when(pose)}會撞到第 ${v.layer} 層的 ${v.name}。建議：限制馬達行程（見長槽限位）、調整安裝方向或位置。`);
        }
      });
    });

    // 4. 跨平面（D4）：直角安裝的子模組拆成兩塊立體板塊——
    //    P＝底板（外框範圍 × 底板厚）、S＝其餘零件（各零件多邊形的 s、t 範圍 × 這些零件的整段疊層高度）。
    //    每塊的 8 個角經 3D 座標系投影到宿主平面取凸包（XY），再用角的 z 區間（宿主本體底面＝0）
    //    與宿主平面上的零件比較：多邊形重疊（SAT）且高度區間重疊才算撞；宿主那一片不算。
    orthoMods.forEach(M => {
      const host = modById.get(M.mount.to && M.mount.to.module);
      // C1：宿主可以是桿、三角板或機架板（機架板的零件名為 'frame'）；宿主那一片不算撞。
      const frameOpts = { asm, exportSettings: exp };   // 與零件多邊形（匯出外框）用同一套匯出設定，站立邊才對得上
      const hostEdge = host ? orthogonalHostEdge(list, modList, M.mount, pose.points, params, frameOpts) : null;
      const bodyPart = hostEdge ? parts.find(p => p.name === hostEdge.partName) : null;
      if (!bodyPart) return;
      const hostPlane = planeOf(list, modList, host.id);
      const frame = orthogonalFrame(list, modList, M.id, pose.points, params, frameOpts);
      if (!frame) return;
      const childParts = parts.filter(p => p.plane === M.id);
      const frameName = `${M.id}-frame`;
      const standing = M.mount.orient.edge === 'child';
      // 一組零件 → 板塊：多邊形頂點在子模組座標的 s、t 範圍＋疊層高度 w 範圍（flip 已反映在 plan 的 zMm）。
      const slabOf = group => {
        let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity, w0 = Infinity, w1 = -Infinity;
        group.forEach(part => {
          let any = false;
          partPolys(pose, part).forEach(poly => poly.forEach(p => {
            if (!validPt(p)) return;
            const s = (p.x - frame.base.x) * frame.e.x + (p.y - frame.base.y) * frame.e.y;
            const t = (p.x - frame.base.x) * frame.f.x + (p.y - frame.base.y) * frame.f.y;
            if (s < smin) smin = s;
            if (s > smax) smax = s;
            if (t < tmin) tmin = t;
            if (t > tmax) tmax = t;
            any = true;
          }));
          if (!any) return;
          w0 = Math.min(w0, zOf(part));
          w1 = Math.max(w1, zOf(part) + part.thicknessMm);
        });
        if (!Number.isFinite(smin) || !(w1 > w0)) return null;
        // 立在宿主板面上（edge 'child'）：t＝0 就是站立邊（貼在宿主板面）。邊以下（t<0）的部分——外框估計比站立邊多出的邊緣、
        // 或齒輪等零件垂到站立邊以下——已在宿主板的邊緣之外，不拿來和宿主下面幾層的零件比（限制：這種垂下去的真撞擊會漏報）。
        if (standing) tmin = Math.min(Math.max(tmin, 0), tmax);
        const corners = slabCorners3D(frame, { smin, smax, tmin, tmax }, w0, w1);
        const zs = corners.map(c => c.z);
        return { corners, hull: convexHull(corners.map(c => ({ x: c.x, y: c.y }))), z0: Math.min(...zs), z1: Math.max(...zs) };
      };
      // 板塊在高度區間 [za, zb] 內的 XY 投影凸包：長方體是凸的，所以取「落在區間內的角」加上「12 條邊與 z＝za、z＝zb 的交點」
      // 的凸包就是準確的截面投影。沒傾斜時邊不是垂直就是水平，結果與整塊 8 角的凸包相同；傾斜時不會把斜向的整塊投影算進來而誤報。
      const EDGE_PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      const hullAt = (sl, za, zb) => {
        const pts = [];
        sl.corners.forEach(c => { if (c.z >= za - 1e-9 && c.z <= zb + 1e-9) pts.push({ x: c.x, y: c.y }); });
        EDGE_PAIRS.forEach(([i, j]) => {
          const A = sl.corners[i], B = sl.corners[j];
          [za, zb].forEach(zc => {
            if ((A.z - zc) * (B.z - zc) < 0) { const k = (zc - A.z) / (B.z - A.z); pts.push({ x: A.x + k * (B.x - A.x), y: A.y + k * (B.y - A.y) }); }
          });
        });
        return pts.length >= 3 ? convexHull(pts) : [];
      };
      const slabs = [slabOf(childParts.filter(p => p.name === frameName)), slabOf(childParts.filter(p => p.name !== frameName))].filter(sl => sl && sl.hull.length >= 3);
      if (!slabs.length) return;
      const bodyZ = zOf(bodyPart);
      parts.forEach(v => {
        if (v.name === bodyPart.name || ((v.plane == null ? null : v.plane) !== hostPlane)) return;
        const vz = zOf(v) - bodyZ;
        if (seen.has(keyOf('cross-plane', [frameName, v.name]))) return;
        const hit = slabs.some(sl => {
          if (!zOverlap(sl.z0, sl.z1, vz, vz + v.thicknessMm)) return false;
          const hull = hullAt(sl, Math.max(sl.z0, vz), Math.min(sl.z1, vz + v.thicknessMm));
          return hull.length >= 3 && polysOverlap([hull], partPolys(pose, v));
        });
        if (hit) {
          report('cross-plane', [frameName, v.name], v.layer, pose,
            `${M.name || M.id}（直角安裝）${when(pose)}會撞到 ${v.name}。建議：調整升降行程或安裝位置。`);
        }
      });
    });
  };

  return { solveWalk, solveMulti, runPose, home };
}

const numOr = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
const rangeOf = r => {
  const lo = numOr(r && r.lo, 0);
  return { lo, hi: numOr(r && r.hi, lo) };
};

export function findInterference(args = {}) {
  const { ranges = {}, samplesPerMotor = 9, pose } = args;
  if (!((args.plan && args.plan.parts) || []).length) return [];
  const results = [], seen = new Set();
  // 單一組合姿勢（多顆馬達同時）：只檢查這一個姿勢。
  if (pose && typeof pose === 'object') {
    const ck = createChecker({ ...args, motorIds: Object.keys(pose) });
    if (!ck) return [];
    const sol = ck.solveMulti(pose);
    if (!sol || !sol.isValid || !sol.points) return [];
    ck.runPose({ motor: null, angleDeg: 0, motorAngles: { ...pose }, pose: { ...pose }, points: sol.points }, results, seen);
    return results;
  }
  // ---- 取樣姿態 ----
  const motorIds = Object.keys(ranges || {});
  const ck = createChecker({ ...args, motorIds });
  if (!ck) return [];
  const zeros = {};
  motorIds.forEach(id => { zeros[id] = 0; });
  const poseDefs = [{ motor: null, angleDeg: 0, motorAngles: {} }];
  motorIds.forEach(id => {
    const { lo, hi } = rangeOf(ranges[id]);
    const n = Math.max(1, Math.round(Number(samplesPerMotor) || 1));
    const count = (hi === lo || n === 1) ? 1 : n;
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? lo : lo + (hi - lo) * i / (count - 1);
      poseDefs.push({ motor: id, angleDeg: a, motorAngles: { ...zeros, [id]: a } });
    }
  });
  const poses = [];
  poseDefs.forEach(def => {
    const sol = ck.solveWalk(def.motor, def.angleDeg);
    if (sol && sol.isValid && sol.points) poses.push({ ...def, points: sol.points });
  });
  poses.forEach(p => ck.runPose(p, results, seen));
  return results;
}

// ---------- B6：全行程時間軸 ----------
// 每顆馬達從 lo 到 hi（含兩端，不重複）每 stepDeg 一格，其他馬達 0°；
// 連續求解的路徑快取讓整條掃描是線性的。每格的 findings 各自獨立（不跨格去重）。
export function interferenceTimeline(args = {}) {
  const { ranges = {}, stepDeg = 5 } = args;
  const out = { motors: {} };
  const motorIds = Object.keys(ranges || {});
  const ck = ((args.plan && args.plan.parts) || []).length ? createChecker({ ...args, motorIds }) : null;
  const step = Math.max(0.5, Number(stepDeg) || 5);
  motorIds.forEach(id => {
    const { lo, hi } = rangeOf(ranges[id]);
    const angles = [];
    for (let a = lo; a < hi - 1e-9; a += step) angles.push(Math.round(a * 1e6) / 1e6);
    angles.push(hi);
    const row = angles.map(angleDeg => ({ angleDeg, findings: [] }));
    out.motors[id] = row;
    if (!ck) return;
    // 由 0 往兩側走：依 |角度| 由小到大處理，路徑快取才會一路往前。
    row.map((e, i) => i).sort((i, j) => Math.abs(row[i].angleDeg) - Math.abs(row[j].angleDeg)).forEach(i => {
      const e = row[i];
      const sol = ck.solveWalk(id, e.angleDeg);
      if (!sol || !sol.isValid || !sol.points) return;
      const found = [];
      ck.runPose({ motor: id, angleDeg: e.angleDeg, motorAngles: { [id]: e.angleDeg }, points: sol.points }, found, new Set());
      e.findings = found;
    });
  });
  return out;
}

// 撞到的零件名稱（不重複，依第一次出現的順序）。
export function hitPartNames(findings) {
  const names = [];
  (findings || []).forEach(f => (f.parts || []).forEach(n => { if (!names.includes(n)) names.push(n); }));
  return names;
}

// ---------- L6a：自動加隔圈 ----------
// 螺絲頭／螺帽刮到鄰層時，findInterference 的 hardware 項目附 fix（{ below, mm }）；
// 把 fix 併入隔圈後重排疊層再檢查，最多 4 輪，直到沒有新的隔圈。
// 回傳 { plan, interference, spacers }；spacers 與 plan.gaps 相同。
export function resolveSpacers({ comps, modules = [], params = {}, exportSettings = {}, cnc, mounts, ranges = {}, samplesPerMotor = 9, spacers = [] } = {}) {
  let current = normalizeSpacers(spacers);
  let plan = null, interference = [];
  for (let i = 0; i < 4; i++) {
    plan = buildPlan({ comps, modules, params, exportSettings, cnc, mounts, spacers: current });
    interference = findInterference({ comps, modules, params, exportSettings, mounts, plan, ranges, samplesPerMotor });
    // 螺絲頭的隔圈先加：它會把上面各層一起抬高，常順便解掉螺帽那側的干涉；沒有螺絲頭問題才處理螺帽。
    const hw = interference.filter(x => x.kind === 'hardware' && x.fix);
    const heads = hw.filter(x => x.fix.mm === HEAD_FIX_MM);
    const fixes = (heads.length ? heads : hw).map(x => x.fix);
    const next = normalizeSpacers([...current, ...fixes]);
    if (JSON.stringify(next) === JSON.stringify(current)) break;
    current = next;
  }
  return { plan, interference, spacers: plan.gaps.map(g => ({ ...g })) };
}

// ---------- L6b：建議齒條長槽限位 ----------
// 齒條行程超出無干涉範圍時，把長槽一端縮短（slot.trimStart／trimEnd），導銷碰到槽端就停。
// 對每個由 ranges 內某馬達驅動的齒條：從 0° 往 lo、hi 逐步試單一角度，遇到第一個有干涉的角度就停，
// 往內縮 marginDeg；再用逆公式換成要縮短的 mm。0° 本身就干涉、或整段都乾淨 → 不建議。
export function suggestRackStops({ comps, modules = [], params = {}, plan, ranges = {}, exportSettings = {}, mounts, samplesPerMotor = 9, marginDeg = 2 } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const gearById = new Map(list.filter(c => c && c.type === 'gear').map(g => [g.id, g]));
  // 沿 mesh 鏈往上找帶動小齒輪的馬達 id（回傳字串；沒有回 null）
  const motorOfPinion = pinionId => {
    const seen = new Set();
    let g = gearById.get(pinionId);
    while (g && !seen.has(g.id)) {
      seen.add(g.id);
      const m = g.p1 && (g.p1.physicalMotor || g.p1.physical_motor);
      if (m) return String(m);
      g = g.mesh ? gearById.get(g.mesh) : null;
    }
    return null;
  };
  const run = (motor, a) => findInterference({
    comps: list, modules, params, exportSettings, mounts, plan, samplesPerMotor,
    ranges: { ...ranges, [motor]: { lo: a, hi: a } }
  });
  const fmt1 = v => String(Number(Number(v).toFixed(1)));
  const out = [];
  list.forEach(rack => {
    if (!rack || rack.type !== 'rack' || !rack.pinion || !rack.slot || typeof rack.slot !== 'object') return;
    const motor = motorOfPinion(rack.pinion);
    if (motor == null || !ranges[motor]) return;
    const pinion = gearById.get(rack.pinion);
    const R = Number(params[pinion.radiusParam]);
    const sign = rack.sign === -1 ? -1 : 1;
    const { length, width } = rack.slot;
    const lo0 = Number(ranges[motor].lo), hi0 = Number(ranges[motor].hi);
    if (!Number.isFinite(lo0) || !Number.isFinite(hi0) || !(R > 0) || !rackGuideThetaRange(R, length, width, sign)) return;
    if (run(motor, 0).length) return;   // 組裝姿態（0°）本身就干涉：不是行程問題

    // 從 0° 往 dir（-1＝lo、+1＝hi）找第一個干涉角度：先 5° 粗掃，再 1° 細掃。回傳 { clean, dirty, findings } 或 null。
    const scan = dir => {
      const limit = dir < 0 ? lo0 : hi0;
      if (dir < 0 ? limit >= 0 : limit <= 0) return null;
      let clean = 0, hit = null;
      for (let a = 5; ; a += 5) {
        const t = dir < 0 ? Math.max(-a, limit) : Math.min(a, limit);
        const f = run(motor, t);
        if (f.length) { hit = { angle: t, findings: f }; break; }
        clean = t;
        if (t === limit) return null;
      }
      for (let a = clean + dir; dir < 0 ? a > hit.angle : a < hit.angle; a += dir) {
        const f = run(motor, a);
        if (f.length) { hit = { angle: a, findings: f }; break; }
        clean = a;
      }
      return { clean, dirty: hit.angle, findings: hit.findings };
    };
    const low = scan(-1), high = scan(1);
    if (!low && !high) return;
    const newLo = low ? Math.min(0, low.clean + marginDeg) : null;
    const newHi = high ? Math.max(0, high.clean - marginDeg) : null;
    const t = rackStopTrims(R, length, width, sign, newLo == null ? -1e9 : newLo, newHi == null ? 1e9 : newHi);
    // 沒變的那一側保持原本的縮短量（沒有就 0）；有變的那一側取新算的（不小於原本）。
    const oldS = Math.max(0, Number(rack.slot.trimStart) || 0), oldE = Math.max(0, Number(rack.slot.trimEnd) || 0);
    const r1 = v => Math.round(v * 10) / 10;
    const trimStart = r1(t.trimStart > 0 ? Math.max(t.trimStart, oldS) : oldS);
    const trimEnd = r1(t.trimEnd > 0 ? Math.max(t.trimEnd, oldE) : oldE);
    const range = rackGuideThetaRange(R, length, width, sign, trimStart, trimEnd);
    if (!range) return;
    const D = Math.PI / 180;
    const travelMm = {
      before: Math.round((hi0 - lo0) * D * R * 10) / 10,
      after: Math.round((range.hi - range.lo) * D * R * 10) / 10
    };
    const why = hit => {
      const names = [...new Set(hit.findings.flatMap(f => f.kind === 'motor-body' ? [f.parts[f.parts.length - 1]] : f.parts))].slice(0, 4);
      return hit.findings.every(f => f.kind === 'motor-body') ? `MG995 機身會撞到 ${names.join('、')}` : `會與 ${names.join('、')} 干涉`;
    };
    const ang = v => `${Math.round(v * 10) / 10}°`;
    const reasons = [], actions = [];
    [low, high].forEach(side => {
      if (!side) return;
      const isLow = side === low;
      reasons.push(`在 ${ang(side.dirty)} ${isLow ? '以下' : '以上'} ${why(side)}`);
    });
    // 用學生看得懂的說法：縮短的那一端擋的是馬達往正角度還是負角度那側（sign=1 時 trimStart 擋正角度、trimEnd 擋負角度）。
    const act = [];
    const sideOf = isStart => ((sign > 0) === isStart ? '正角度' : '負角度');
    if (t.trimStart > 0) act.push(`擋${sideOf(true)}那端縮短 ${fmt1(trimStart)} mm`);
    if (t.trimEnd > 0) act.push(`擋${sideOf(false)}那端縮短 ${fmt1(trimEnd)} mm`);
    actions.push(act.join('、'));
    const message = `馬達 ${motor} ${reasons.join('；')}：建議把齒條 ${rack.id} 長槽 ${actions[0]}，行程改為 ${ang(range.lo)}～${ang(range.hi)}（${fmt1(travelMm.before)} mm → ${fmt1(travelMm.after)} mm）。`;
    out.push({ rackId: rack.id, motor, trimStart, trimEnd, range, travelMm, message });
  });
  return out;
}
