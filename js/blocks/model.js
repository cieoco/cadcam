/**
 * blocks / model
 *
 * 機構資料模型操作（純函式，不碰 DOM）：在 `comps`（wizard 風格組件陣列）與
 * `topo.params` 上做查詢與修改——接點座標、角色判斷、吸附、合併、長度重算等。
 *
 * 慣例：
 * - 會「就地修改」組件物件的函式不回傳值（同參考，呼叫端自然看到變更）。
 * - 會「移除組件（重建陣列）」的函式回傳新的 comps，呼叫端需自行接回。
 * - 不持有狀態：comps / topo / compiled / theta 一律由呼叫端傳入。
 *
 * 之後的存檔 / undo 序列化就以這支的資料形狀為基礎。
 */

import { solveTopology } from '../multilink/solver.js';
import { pointKeysFor } from './part-types.js';

export function pointCoords(comps) {
  const m = {};
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    if (c[k] && c[k].id) m[c[k].id] = { x: Number(c[k].x) || 0, y: Number(c[k].y) || 0 };
  }));
  return m;
}

// 該點「目前畫面上的位置」：能解就用 solver 解，解不出來才退回元件座標。
export function displayPoint(comps, compiled, theta, id) {
  const pts = pointCoords(comps);
  if (compiled) {
    try {
      const sol = solveTopology(compiled, { thetaDeg: theta });
      const p = sol && sol.points && sol.points[id];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
    } catch (_) {}
  }
  return pts[id] || null;
}

export function updatePointCoordsById(comps, id, x, y) {
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    if (c[k] && c[k].id === id) { c[k].x = x; c[k].y = y; }
  }));
}

export function freezePointAtDisplay(comps, compiled, theta, id) {
  const p = displayPoint(comps, compiled, theta, id);
  if (p) updatePointCoordsById(comps, id, p.x, p.y);
}

export function movePointById(comps, id, dx, dy) {
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    if (c[k] && c[k].id === id) {
      c[k].x = (Number(c[k].x) || 0) + dx;
      c[k].y = (Number(c[k].y) || 0) + dy;
    }
  }));
}

export function pointRefs(comps, id) {
  const refs = [];
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    if (c[k] && c[k].id === id) refs.push({ comp: c, key: k, point: c[k] });
  }));
  return refs;
}

export function hasPoint(comps, id) { return pointRefs(comps, id).length > 0; }

export function pointHasMotor(comps, id) {
  return comps.some(c => c.type === 'bar' && c.isInput && (
    (c.p1 && c.p1.id === id && c.p1.physicalMotor) ||
    (c.p2 && c.p2.id === id && c.p2.physicalMotor)
  ));
}

export function isGroundPoint(p) {
  return p && (p.type === 'fixed' || p.type === 'motor' || p.type === 'linear');
}

export function pointIsGround(comps, id) {
  return pointRefs(comps, id).some(ref => isGroundPoint(ref.point));
}

export function removeMotorAtPoint(comps, id) {
  comps.forEach(c => {
    if (c.type !== 'bar' || !c.isInput || !c.p1 || !c.p2) return;
    const isMotorEnd = (c.p1.id === id && c.p1.physicalMotor) || (c.p2.id === id && c.p2.physicalMotor);
    if (!isMotorEnd) return;
    c.isInput = false;
    delete c.physicalMotor;
    delete c.physical_motor;
  });
  pointRefs(comps, id).forEach(ref => {
    delete ref.point.physicalMotor;
    delete ref.point.physical_motor;
  });
}

// 移除以此點為錨的地錨組件——重建陣列，呼叫端需接回回傳值。
export function removeAnchorsAtPoint(comps, id) {
  return comps.filter(c => !(c.type === 'anchor' && c.p1 && c.p1.id === id));
}

export function setPointType(comps, id, type) {
  pointRefs(comps, id).forEach(ref => {
    ref.point.type = type;
    if (type !== 'fixed') {
      delete ref.point.physicalMotor;
      delete ref.point.physical_motor;
    }
  });
}

export function roleLabel(comps, id) {
  if (pointHasMotor(comps, id)) return '馬達';
  if (pointIsGround(comps, id)) return '地錨';
  return '自由';
}

export function findNearest(comps, id, snapWorld) {
  const m = pointCoords(comps);
  const d = m[id]; if (!d) return null;
  let best = null, bestDist = snapWorld;
  Object.keys(m).forEach(id2 => {
    if (id2 === id) return;
    const dist = Math.hypot(m[id2].x - d.x, m[id2].y - d.y);
    if (dist < bestDist) { bestDist = dist; best = id2; }
  });
  return best;
}

// 把 fromId 併到 toId（座標對齊 toId）；併成零長度的桿就移除。回傳新的 comps。
export function mergePoints(comps, fromId, toId) {
  const t = pointCoords(comps)[toId]; if (!t) return comps;
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    if (c[k] && c[k].id === fromId) { c[k].id = toId; c[k].x = t.x; c[k].y = t.y; }
  }));
  // 被合併成零長度的桿就移除
  return comps.filter(c => !(c.type === 'bar' && c.p1 && c.p2 && c.p1.id === c.p2.id));
}

export function recomputeLengths(comps, topo) {
  // 固定長度的連桿不跟著拉伸；其餘桿（如曲柄）長度跟著畫面更新
  comps.forEach(c => {
    if (c.type === 'bar' && !c.fixedLen && c.lenParam && c.p1 && c.p2) {
      topo.params[c.lenParam] = Math.round(
        Math.hypot((c.p2.x || 0) - (c.p1.x || 0), (c.p2.y || 0) - (c.p1.y || 0)));
    }
  });
}

export function solvePinnedConstraints(comps, topo, pinId, target, options = {}) {
  if (!pinId || !target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
  const params = (topo && topo.params) ? topo.params : {};
  const points = pointCoords(comps);
  if (!points[pinId]) return false;

  const pointIds = new Set(Object.keys(points));
  const pinned = new Set([pinId]);
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    const p = c[k];
    if (p && p.id && isGroundPoint(p)) pinned.add(p.id);
  }));

  const constraints = [];
  const collinearConstraints = [];
  const paramLen = (name, fallback) => {
    const v = name && params[name] !== undefined ? Number(params[name]) : fallback;
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const addDist = (a, b, len) => {
    if (!a || !b || a === b || !Number.isFinite(len) || len <= 0) return;
    pointIds.add(a);
    pointIds.add(b);
    constraints.push({ a, b, len });
  };
  const addCollinear = (a, mid, b, aMidLen, midBLen, aBLen) => {
    if (!a || !mid || !b || a === mid || mid === b || a === b) return;
    const sum = aMidLen + midBLen;
    const eps = Math.max(0.75, sum * 0.01);
    if (!Number.isFinite(sum) || sum <= 0 || Math.abs(sum - aBLen) > eps) return;
    collinearConstraints.push({ a, mid, b, t: aMidLen / sum });
  };

  comps.forEach(c => {
    if (c.type === 'bar' && c.p1?.id && c.p2?.id) {
      const fallback = Math.hypot((c.p2.x || 0) - (c.p1.x || 0), (c.p2.y || 0) - (c.p1.y || 0));
      addDist(c.p1.id, c.p2.id, paramLen(c.lenParam, fallback));
    } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
      const g = Math.hypot((c.p2.x || 0) - (c.p1.x || 0), (c.p2.y || 0) - (c.p1.y || 0));
      const r1 = Math.hypot((c.p3.x || 0) - (c.p1.x || 0), (c.p3.y || 0) - (c.p1.y || 0));
      const r2 = Math.hypot((c.p3.x || 0) - (c.p2.x || 0), (c.p3.y || 0) - (c.p2.y || 0));
      const lg = paramLen(c.gParam, g);
      const lr1 = paramLen(c.r1Param, r1);
      const lr2 = paramLen(c.r2Param, r2);
      addDist(c.p1.id, c.p2.id, lg);
      addDist(c.p1.id, c.p3.id, lr1);
      addDist(c.p2.id, c.p3.id, lr2);
      addCollinear(c.p1.id, c.p2.id, c.p3.id, lg, lr2, lr1);
      addCollinear(c.p1.id, c.p3.id, c.p2.id, lr1, lr2, lg);
      addCollinear(c.p2.id, c.p1.id, c.p3.id, lg, lr1, lr2);
    }
  });

  const relevant = new Set([pinId]);
  let grew = true;
  while (grew) {
    grew = false;
    constraints.forEach(c => {
      if (relevant.has(c.a) && !relevant.has(c.b)) { relevant.add(c.b); grew = true; }
      if (relevant.has(c.b) && !relevant.has(c.a)) { relevant.add(c.a); grew = true; }
    });
  }
  const hasGround = Array.from(relevant).some(id => pinned.has(id) && id !== pinId);
  if (!hasGround) return false;

  points[pinId] = { x: target.x, y: target.y };
  const original = pointCoords(comps);
  const iterations = options.iterations || 80;
  for (let iter = 0; iter < iterations; iter++) {
    points[pinId] = { x: target.x, y: target.y };
    constraints.forEach(c => {
      if (!relevant.has(c.a) || !relevant.has(c.b)) return;
      const a = points[c.a];
      const b = points[c.b];
      if (!a || !b) return;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d <= 1e-9) {
        const oa = original[c.a] || { x: 0, y: 0 };
        const ob = original[c.b] || { x: c.len, y: 0 };
        dx = ob.x - oa.x;
        dy = ob.y - oa.y;
        d = Math.hypot(dx, dy) || 1;
      }
      const err = (d - c.len) / d;
      const axPinned = pinned.has(c.a);
      const bxPinned = pinned.has(c.b);
      if (axPinned && bxPinned) return;
      if (axPinned) {
        b.x -= dx * err;
        b.y -= dy * err;
      } else if (bxPinned) {
        a.x += dx * err;
        a.y += dy * err;
      } else {
        a.x += dx * err * 0.5;
        a.y += dy * err * 0.5;
        b.x -= dx * err * 0.5;
        b.y -= dy * err * 0.5;
      }
    });
    collinearConstraints.forEach(c => {
      if (!relevant.has(c.a) || !relevant.has(c.mid) || !relevant.has(c.b) || pinned.has(c.mid)) return;
      const a = points[c.a];
      const b = points[c.b];
      const mid = points[c.mid];
      if (!a || !b || !mid) return;
      mid.x = a.x + (b.x - a.x) * c.t;
      mid.y = a.y + (b.y - a.y) * c.t;
    });
  }
  points[pinId] = { x: target.x, y: target.y };

  let maxErr = 0;
  constraints.forEach(c => {
    if (!relevant.has(c.a) || !relevant.has(c.b)) return;
    const a = points[c.a];
    const b = points[c.b];
    if (!a || !b) return;
    maxErr = Math.max(maxErr, Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - c.len));
  });
  if (maxErr > (options.tolerance || 2)) return false;

  relevant.forEach(id => {
    const p = points[id];
    if (p && !pinned.has(id)) updatePointCoordsById(comps, id, p.x, p.y);
  });
  updatePointCoordsById(comps, pinId, target.x, target.y);
  return true;
}

// 找出「以此點為端點、且只屬於一根」的固定長度連桿（用來做圓規式拖曳）
export function fixedLinkFor(comps, id) {
  const ls = comps.filter(c => c.type === 'bar' && c.fixedLen && (c.p1.id === id || c.p2.id === id));
  return ls.length === 1 ? ls[0] : null;
}

export function pointUseCount(comps, id) {
  let count = 0;
  comps.forEach(c => pointKeysFor(c).forEach(k => {
    if (c[k] && c[k].id === id) count += 1;
  }));
  return count;
}

export function isFreeLink(comps, c) {
  return c && c.type === 'bar' && c.fixedLen &&
    c.p1 && c.p2 &&
    !isGroundPoint(c.p1) && !isGroundPoint(c.p2) &&
    pointUseCount(comps, c.p1.id) === 1 && pointUseCount(comps, c.p2.id) === 1;
}

export function freeLinkForPoint(comps, id) {
  const c = fixedLinkFor(comps, id);
  return isFreeLink(comps, c) ? c : null;
}

export function barsAtNode(comps, nodeId) {
  return comps.filter(c => c.type === 'bar' && c.p1 && c.p2 && (c.p1.id === nodeId || c.p2.id === nodeId));
}

// 自由三點桿：三頂點都未接地、且各自只屬於這個三角（沒和別的桿/接點合併）。
// 此時整個三角是自由剛體——拖任一頂點＝整體平移，三邊長不變（不會被拖到變形）。
export function freeTriangleForPoint(comps, id) {
  const t = comps.find(c => c.type === 'triangle' &&
    [c.p1, c.p2, c.p3].some(p => p && p.id === id));
  if (!t || !t.p1 || !t.p2 || !t.p3) return null;
  const free = [t.p1, t.p2, t.p3].every(p =>
    !isGroundPoint(p) && pointUseCount(comps, p.id) === 1);
  return free ? t : null;
}

// 一頂點被「固定」（接地，或與其他桿/元件共用而被牽制）、另兩頂點自由的三點桿：
// 拖自由頂點＝整個三角繞那個樞紐頂點剛性旋轉。回傳 { tri, pivot }；dragId 必須是兩個自由頂點之一。
// 樞紐放寬到「useCount>1」是為了支援「桿＋三點桿」相接：相接的角落雖非地錨，卻被另一支桿牽住，
// 仍應作為旋轉中心，三角才不會被拖到變形。
export function pinnedTriangleForPoint(comps, id) {
  const t = comps.find(c => c.type === 'triangle' &&
    [c.p1, c.p2, c.p3].some(p => p && p.id === id));
  if (!t || !t.p1 || !t.p2 || !t.p3) return null;
  const verts = [t.p1, t.p2, t.p3];
  const isPivot = p => pointIsGround(comps, p.id) || pointUseCount(comps, p.id) > 1;
  const pivots = verts.filter(isPivot);
  if (pivots.length !== 1) return null;              // 需恰好一個樞紐頂點
  const pivot = pivots[0];
  if (pivot.id === id) return null;                  // 拖的是樞紐本身 → 不旋轉
  const others = verts.filter(p => p.id !== pivot.id);
  // 另兩頂點都必須自由（未接地、未與別處共用），才能單純繞樞紐旋轉
  if (!others.every(p => !pointIsGround(comps, p.id) && pointUseCount(comps, p.id) === 1)) return null;
  return { tri: t, pivot };
}

// 被機構鎖死的三點桿自由頂點：拖的是某三角的自由頂點（未接地、useCount===1），
// 但「另外兩個頂點都被牽制」（接地或與別的桿共用）。此時這個頂點被剛體完全決定（兩固定點＋三邊長
// → 唯一解），不該能自由拖動。回傳 true 表示「鎖住、別讓它變形」。
export function lockedTriangleVertex(comps, id) {
  const t = comps.find(c => c.type === 'triangle' &&
    [c.p1, c.p2, c.p3].some(p => p && p.id === id));
  if (!t || !t.p1 || !t.p2 || !t.p3) return false;
  if (pointIsGround(comps, id) || pointUseCount(comps, id) > 1) return false; // 拖的是樞紐本身，不鎖
  const others = [t.p1, t.p2, t.p3].filter(p => p.id !== id);
  const pinned = others.filter(p => pointIsGround(comps, p.id) || pointUseCount(comps, p.id) > 1);
  return pinned.length >= 2;                          // 另兩頂點都被牽制 → 此頂點被剛體決定
}
