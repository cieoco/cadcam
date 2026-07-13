/**
 * blocks / motor-mounts
 *
 * 馬達安裝方向與裝配層規劃。只讀 plain data，不碰 DOM 或 Blocks 全域狀態。
 */

export function normalizedDir(from, to, fallback = { x: 0, y: -1 }) {
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(to.x)) return fallback;
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  return distance > 1e-6 ? { x: dx / distance, y: dy / distance } : fallback;
}

import { resolveMotorOrientation } from './motor-orientation.js';
export function motorRotDegFromDir(dir) {
  return dir ? Math.atan2(-dir.x, -dir.y) * 180 / Math.PI : 0;
}

function oppositeTarget(origin, point) {
  return origin && point && Number.isFinite(origin.x) && Number.isFinite(point.x)
    ? { x: origin.x * 2 - point.x, y: origin.y * 2 - point.y } : null;
}

export function motorAssemblyLayerForBody(bodyId, motorMounts) {
  if (!bodyId || !motorMounts) return null;
  let found = null;
  motorMounts.forEach(mount => {
    if (found !== null || !mount) return;
    const hasFrame = Boolean(mount.frameBody);
    if (hasFrame && bodyId === mount.frameBody) found = 0;
    else if (bodyId === mount.outputBody) found = hasFrame ? 1 : 0;
  });
  return found;
}

export function computeMotorRotDeg({ id, points, groundIds, comps, compiledSteps, sliderMountInfo, isHiddenSliderRailPoint }) {
  const center = points[id];
  if (!center) return 0;
  let target = null;
  const crankTips = new Set(compiledSteps.filter(step => step.type === 'input_crank' && step.center === id).map(step => step.id));
  const bar = comps.find(comp => comp.type === 'bar' && !comp.isInput && comp.p1 && comp.p2 &&
    (comp.p1.id === id || comp.p2.id === id) && !crankTips.has(comp.p1.id === id ? comp.p2.id : comp.p1.id));
  if (bar) {
    const otherId = bar.p1.id === id ? bar.p2.id : bar.p1.id;
    if (points[otherId] && Number.isFinite(points[otherId].x)) target = points[otherId];
  }
  if (!target) {
    const mount = sliderMountInfo(id);
    if (mount) {
      const other = mount.label === 'M1' ? mount.slider.m2 : mount.slider.m1;
      if (other && points[other.id] && Number.isFinite(points[other.id].x)) target = points[other.id];
    }
  }
  if (!target) {
    let bestDistance = Infinity;
    groundIds.forEach(groundId => {
      if (groundId === id || isHiddenSliderRailPoint(groundId)) return;
      const point = points[groundId];
      if (!point || !Number.isFinite(point.x)) return;
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      if (distance > 1e-3 && distance < bestDistance) { bestDistance = distance; target = point; }
    });
  }
  return target ? Math.atan2(-(target.x - center.x), -(target.y - center.y)) * 180 / Math.PI : 0;
}

export function buildMotorMounts({ motorIds, groundIds, staticPoints, comps, compiledSteps, sliderMountInfo, isHiddenSliderRailPoint, motorTypeForCenter }) {
  const mounts = new Map();
  const add = (id, target, reason, assembly = {}) => {
    const dir = normalizedDir(staticPoints[id], target);
    mounts.set(id, { dir, rotDeg: motorRotDegFromDir(dir), reason, ...assembly });
  };
  motorIds.forEach(id => {
    const center = staticPoints[id];
    if (!center) return;
    const located = comps.find(comp => comp?.p1?.id === id && comp.mountLocatorPoint && staticPoints[comp.mountLocatorPoint]);
    if (located) {
      const q = normalizedDir(center, staticPoints[located.mountLocatorPoint]);
      const rotDeg = Math.atan2(q.y, -q.x) * 180 / Math.PI, radians = rotDeg * Math.PI / 180;
      mounts.set(id, { dir: { x: -Math.sin(radians), y: -Math.cos(radians) }, rotDeg, reason: 'shaft-locator', locatorPoint: located.mountLocatorPoint, outputBody: located.id, order: ['motor', 'outputBody'] });
      return;
    }
    const crankTips = new Set(compiledSteps.filter(step => step.type === 'input_crank' && step.center === id).map(step => step.id));
    // 先找明確宣告「軸心就是這顆馬達」的桿（motorMount.center）；只靠「端點接在馬達
    // 中心且 isInput」推斷會在兩顆馬達共點時搶答（例：M1 曲柄的浮動端剛好是 M2 軸心），
    // 導致騎乘馬達的 frameBody 被別顆馬達的 mount 蓋掉、安裝特徵誤入自動地基。
    const outputBar = comps.find(comp => comp.type === 'bar' && comp.motorMount && comp.motorMount.center === id)
      || comps.find(comp => comp.type === 'bar' && comp.p1 && comp.p2 && (comp.p1.id === id || comp.p2.id === id) &&
        (comp.isInput || crankTips.has(comp.p1.id === id ? comp.p2.id : comp.p1.id)));
    // A riding motor is mounted to its carrier link, not to the world frame.
    // Preserve that assembly relationship so 3D does not rebuild the frame at
    // the motor's moving centre on every animation frame.
    const carrierId = outputBar && (outputBar.motorMount?.frameBody || outputBar.motorCarrier || outputBar.motor_carrier);
    const orientation = outputBar?.motorMount?.orientation;
    const barAssembly = outputBar
      ? {
          outputBody: outputBar.id,
          ...(carrierId ? { frameBody: carrierId } : {}),
          orientation: orientation || (carrierId ? 'follow-frame' : 'horizontal'),
          reversed: Boolean(outputBar.motorMount?.reversed),
          order: carrierId ? ['motor', 'frameBody', 'outputBody'] : ['motor', 'outputBody']
        }
      : {};
    // "follow-frame" only means follow a concrete moving carrier.  With the
    // world frame there is no carrier bar to follow, so use the frame's
    // default horizontal datum instead of falling back to the output crank.
    if (orientation === 'horizontal' || orientation === 'vertical' || orientation === 'follow-frame') {
      // A carrier's live direction is resolved by 2D/3D frame updates.  At
      // build time this gives world mounts their canonical horizontal/vertical
      // direction and prevents any fallback to the output crank.
      const resolved = resolveMotorOrientation(orientation, { center, reversed: Boolean(outputBar.motorMount?.reversed) });
      mounts.set(id, { ...resolved, reason: `mount-${orientation}`, ...barAssembly });
      return;
    }
    const gear = comps.find(comp => comp.type === 'gear' && comp.p1?.id === id);
    if (gear) {
      const meshed = gear.mesh ? comps.find(comp => comp.type === 'gear' && comp.id === gear.mesh) : comps.find(comp => comp.type === 'gear' && comp.mesh === gear.id);
      if (meshed?.p1 && staticPoints[meshed.p1.id]) { add(id, oppositeTarget(center, staticPoints[meshed.p1.id]), 'gear-mesh', { outputBody: gear.id, order: ['motor', 'outputBody'] }); return; }
      const rack = comps.find(comp => comp.type === 'rack' && comp.pinion === gear.id);
      if (rack?.p1 && staticPoints[rack.p1.id]) { add(id, oppositeTarget(center, staticPoints[rack.p1.id]), 'rack-pinion', { outputBody: gear.id, order: ['motor', 'outputBody'] }); return; }
    }
    const pulley = comps.find(comp => comp.type === 'pulley' && comp.p1?.id === id);
    if (pulley) {
      const belt = comps.find(comp => comp.type === 'belt' && (comp.driver === pulley.id || comp.driven === pulley.id));
      const otherId = belt && (belt.driver === pulley.id ? belt.driven : belt.driver);
      const other = otherId && comps.find(comp => comp.type === 'pulley' && comp.id === otherId);
      if (other?.p1 && staticPoints[other.p1.id]) { add(id, oppositeTarget(center, staticPoints[other.p1.id]), 'pulley-belt', { outputBody: pulley.id, order: ['motor', 'outputBody'] }); return; }
    }
    const cam = comps.find(comp => comp.type === 'cam' && comp.p1?.id === id);
    if (cam?.p2 && staticPoints[cam.p2.id]) { add(id, oppositeTarget(center, staticPoints[cam.p2.id]), 'cam-follower', { outputBody: cam.id, order: ['motor', 'outputBody'] }); return; }
    if (motorTypeForCenter(id) === 'mg995') {
      const alongBar = comps.find(comp => comp.type === 'bar' && !comp.isInput && comp.p1 && comp.p2 && (comp.p1.id === id || comp.p2.id === id) && !crankTips.has(comp.p1.id === id ? comp.p2.id : comp.p1.id));
      const alongId = alongBar && (alongBar.p1.id === id ? alongBar.p2.id : alongBar.p1.id);
      if (alongId && staticPoints[alongId]) { add(id, staticPoints[alongId], 'servo-frame-bar', barAssembly); return; }
    }
    if (outputBar) { const otherId = outputBar.p1.id === id ? outputBar.p2.id : outputBar.p1.id; add(id, oppositeTarget(center, staticPoints[otherId]), 'output-crank', barAssembly); return; }
    const sliderMount = sliderMountInfo(id);
    if (sliderMount) {
      const other = sliderMount.label === 'M1' ? sliderMount.slider.m2 : sliderMount.slider.m1;
      if (other && staticPoints[other.id]) { add(id, staticPoints[other.id], 'slider-mount', barAssembly); return; }
    }
    let best = null, bestDistance = Infinity;
    groundIds.forEach(groundId => {
      if (groundId === id || isHiddenSliderRailPoint(groundId)) return;
      const point = staticPoints[groundId]; if (!point) return;
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      if (distance > 1e-3 && distance < bestDistance) { bestDistance = distance; best = point; }
    });
    add(id, best || { x: center.x, y: center.y - 1 }, 'nearest-ground', barAssembly);
  });
  return mounts;
}
