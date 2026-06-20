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

export function pointCoords(comps) {
  const m = {};
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
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
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
    if (c[k] && c[k].id === id) { c[k].x = x; c[k].y = y; }
  }));
}

export function freezePointAtDisplay(comps, compiled, theta, id) {
  const p = displayPoint(comps, compiled, theta, id);
  if (p) updatePointCoordsById(comps, id, p.x, p.y);
}

export function movePointById(comps, id, dx, dy) {
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
    if (c[k] && c[k].id === id) {
      c[k].x = (Number(c[k].x) || 0) + dx;
      c[k].y = (Number(c[k].y) || 0) + dy;
    }
  }));
}

export function pointRefs(comps, id) {
  const refs = [];
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
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
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
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

// 找出「以此點為端點、且只屬於一根」的固定長度連桿（用來做圓規式拖曳）
export function fixedLinkFor(comps, id) {
  const ls = comps.filter(c => c.type === 'bar' && c.fixedLen && (c.p1.id === id || c.p2.id === id));
  return ls.length === 1 ? ls[0] : null;
}

export function pointUseCount(comps, id) {
  let count = 0;
  comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
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
