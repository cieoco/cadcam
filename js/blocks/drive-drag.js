/**
 * blocks / drive-drag
 *
 * 拖曳試動（按需載入）：機構已有動力來源時，拖曲柄、連桿、搖桿上的接點或孔，都是「轉動輸入角」，
 * 其他桿件依原本的接法一起動；不改桿長、不拆連接（試動 ≠ 改尺寸）。
 * h 由 app.js 注入：displayCoords、solveAt(theta, seed)、seed()、range()、setTheta(theta)、updateMotorSwitcher。
 */
import { looseBarRotation, pointRefs, pointIsGround, holeJoined, updatePointCoordsById } from './model.js';
import {S, activateMotor} from './state.js';

// 拖輸入桿的動端：直接用游標方位反推輸入角（原 app.js rotateInputCrankToPoint，搬來此處按需載入）。
export function rotateCrankTo(h, bar, target) {
  if (!bar || !target) return false;
  const centerPoint = bar.p1.physicalMotor ? bar.p1 : bar.p2;
  // 騎乘馬達的軸心跟著機構動：用「畫面上解出的位置」當圓心，元件座標會脫節。
  const center = h.displayCoords()[centerPoint.id] || h.pointCoords()[centerPoint.id] || centerPoint;
  if (!center || Math.hypot(target.x-center.x,target.y-center.y) < 1e-6) return false;
  // 拖哪根輸入桿就把控制權切給那顆馬達（其他馬達凍結在原角度），符合「摸哪根動哪根」直覺。
  const motorId = String(bar.physicalMotor || '1');
  if (String(S.activeMotor) !== motorId) {
    activateMotor(motorId, Number(S.motorAngles[motorId]) || 0);
    h.updateMotorSwitcher();
  }
  // solver 的曲柄角＝機架桿方位角+θ+phaseOffset（p1→p2 方位角），反推 θ 要扣掉相位與
  // 機架桿方位角（世界機架馬達的機架方位角為 0），拖曳才會貼著游標。
  let carrierAng = 0;
  if (bar.motorCarrier) {
    const carrier = S.comps.find(k => k.type === 'bar' && k.id === bar.motorCarrier);
    if (carrier && carrier.p1 && carrier.p2) {
      const m = h.displayCoords();
      const q1 = m[carrier.p1.id], q2 = m[carrier.p2.id];
      if (q1 && q2) carrierAng = Math.atan2(q2.y - q1.y, q2.x - q1.x) * 180 / Math.PI;
    }
  }
  h.setTheta(Math.atan2(target.y-center.y,target.x-center.x) * 180 / Math.PI - carrierAng - (Number(bar.phaseOffset) || 0));
  return true;
}

const STEP = 2, WIDE_STEP = 5, JUMP_MM = 20, FAR_MM = 8;
let lastFar = null;

/**
 * 找最接近游標的輸入角：從目前角度往兩個方向一步一步走（每步以上一步的解當種子，維持同一分支），
 * 距離不再變小就停；再細調。probe(points) 回傳被拖那一點的世界座標。
 * 回傳 false＝這一點不隨輸入角移動（例如沒接上的零件），交回原本的拖曳規則。
 */
export function driveTo(h, probe, target) {
  const t0 = Number(S.theta) || 0, range = h.range();
  const inRange = t => !range || (t >= range.lo - 1e-9 && t <= range.hi + 1e-9);
  const at = (t, seed) => {
    let s = null;
    try { s = h.solveAt(t, seed); } catch (_) { return null; }
    if (!s || s.isValid === false || !s.points || s.isUnderconstrained) return null;
    const q = probe(s.points);
    return q && Number.isFinite(q.x) && Number.isFinite(q.y) ? {t, q, pts: s.points} : null;
  };
  const cur = at(t0, h.seed());
  if (!cur) return false;
  const dist = r => Math.hypot(r.q.x - target.x, r.q.y - target.y);
  let best = cur, moves = false;
  // 先只走「距離變小」的方向（一般拖曳每幀只差一點點）；游標拉得遠、還差很多時，才把兩個方向走完找最近的。
  for (const greedy of [true, false]) {
    if (!greedy && (!moves || dist(best) <= FAR_MM || (lastFar && Math.hypot(lastFar.x - target.x, lastFar.y - target.y) < FAR_MM))) break;
    if (!greedy) lastFar = {x: target.x, y: target.y};   // 游標在可達路徑外時，同一處不重找（每幀都全掃會卡）
    const step = greedy ? STEP : WIDE_STEP;
    for (const dir of [1, -1]) {
      let prev = cur;
      for (let k = 1; k * step <= 180; k++) {
        const t = t0 + dir * k * step;
        if (!inRange(t)) break;
        const r = at(t, prev.pts);
        if (!r || Math.hypot(r.q.x - prev.q.x, r.q.y - prev.q.y) > JUMP_MM * step / STEP) break;   // 解不出或跳到另一個分支
        if (Math.hypot(r.q.x - cur.q.x, r.q.y - cur.q.y) > 0.01) moves = true;
        if (greedy && dist(r) >= dist(prev) - 1e-9) break;
        if (dist(r) < dist(best)) best = r;
        prev = r;
      }
    }
  }
  if (!moves) return false;
  for (const step of [2, 1, 0.5, 0.25]) for (const t of [best.t - step, best.t + step]) {
    if (!inRange(t)) continue;
    const r = at(t, best.pts);
    if (r && dist(r) < dist(best)) best = r;
  }
  if (best !== cur) h.setTheta(best.t);
  return true;
}

// 拖桿身或板身：記下抓的位置在零件上的局部座標（p1→p2），之後讓那一點跟著游標。
export function bodyProbe(h, comp, grab) {
  if (comp?.type === 'bar') {
    for (const end of [comp.p1, comp.p2]) {
      if (endArm(end.id)) return {tip:end.id, dx:end.x-grab.x, dy:end.y-grab.y};
    }
  }
  if (!comp || h.hasDrive?.() === false) return null;
  const m = h.displayCoords(), a = m[comp.p1?.id], b = m[comp.p2?.id];
  if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return null;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, dx = grab.x - a.x, dy = grab.y - a.y;
  const u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
  const probe = pts => {
    const p = pts[comp.p1.id], q = pts[comp.p2.id];
    if (!p || !q) return null;
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1, ex = (q.x - p.x) / l, ey = (q.y - p.y) / l;
    return {x: p.x + u * ex - v * ey, y: p.y + u * ey + v * ex};
  };
  return follows(h, probe) ? probe : null;   // 機架、沒接上的零件不隨輸入角動：交回原本的選取／拖曳
}

// 這一點會不會隨輸入角移動（試轉 ±STEP）。
function follows(h, probe) {
  const t0 = Number(S.theta) || 0, q0 = (() => { try { return probe(h.solveAt(t0, h.seed())?.points || {}); } catch (_) { return null; } })();
  if (!q0) return false;
  return [STEP, -STEP].some(d => {
    try { const s = h.solveAt(t0 + d, h.seed()), q = s?.isValid !== false && s?.points && probe(s.points); return q && Math.hypot(q.x - q0.x, q.y - q0.y) > 0.01; } catch (_) { return false; }
  });
}

// A free tip and its preceding passive bar form a two-link arm. Keep the
// upstream pin still and choose the elbow on the same side of the arm.
function endArm(id) {
  const tip = looseBarRotation(S.comps, S.topo.params, id);
  if (!tip || tip.disk || pointIsGround(S.comps, tip.pivot.id)) return null;
  const refs = pointRefs(S.comps, tip.pivot.id);
  const prev = refs.find(r => r.comp !== tip.bar);
  if (refs.length !== 2 || !prev || !['p1','p2'].includes(prev.key)) return null;
  const bar = prev.comp;
  if (bar.type !== 'bar' || !bar.fixedLen || bar.isInput || bar.shape === 'disk' ||
      bar.barFusionRoot || bar.barFusion || bar.physicalMotor || holeJoined(S.comps, bar)) return null;
  if (S.comps.some(c => c.type === 'syringe' && [c.a?.componentId,c.b?.componentId,c.outputId].includes(bar.id))) return null;
  const root = prev.key === 'p1' ? bar.p2 : bar.p1;
  if (pointRefs(S.comps,root.id).length < 2 && !pointIsGround(S.comps,root.id)) return null;
  return {tip, root, length:Number(S.topo.params[bar.lenParam])};
}

export function pullTip(h, id, target) {
  const arm = endArm(id);
  if (!arm) return false;
  const {tip, root, length} = arm;
  const dx = target.x-root.x, dy = target.y-root.y, distance = Math.hypot(dx,dy);
  if (!(length > 0) || !Number.isFinite(distance)) return false;
  const oldAngle = Math.atan2(tip.end.y-root.y,tip.end.x-root.x);
  const angle = distance > 1e-8 ? Math.atan2(dy,dx) : oldAngle;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const reach = Math.min(length+tip.length, Math.max(Math.abs(length-tip.length), distance));
  const along = reach > 1e-8 ? (length*length-tip.length*tip.length+reach*reach)/(2*reach) : 0;
  const side = Math.sign((tip.pivot.y-root.y)*ux-(tip.pivot.x-root.x)*uy) || 1;
  const height = side*Math.sqrt(Math.max(0,length*length-along*along));
  if (reach > 1e-8) updatePointCoordsById(S.comps,tip.pivot.id,root.x+along*ux-height*uy,root.y+along*uy+height*ux);
  updatePointCoordsById(S.comps,id,root.x+reach*ux,root.y+reach*uy);
  return true;
}

// Enlarged hit circles overlap on a phone. Resolve a transparent hit by its
// distance to the visible centre; equal centres retain the painted order.
export function nearestHit(event, fallback) {
  let best = fallback, distance = Infinity;
  for (const el of document.elementsFromPoint(event.clientX,event.clientY)) {
    if (!el.dataset.nodeHit) continue;
    const box = el.getBoundingClientRect();
    const d = Math.hypot(event.clientX-box.x-box.width/2,event.clientY-box.y-box.height/2);
    if (d < distance) { best=el.dataset.nodeHit; distance=d; }
  }
  return best;
}
