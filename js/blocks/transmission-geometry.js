/**
 * blocks / transmission-geometry
 *
 * 傳動零件共用的純幾何：不碰 SVG、DOM 或 Blocks 狀態。
 */

export function openBeltTangents(c1, r1, c2, r2) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d <= Math.abs(r1 - r2) || d < 1e-6) return [];
  const ux = dx / d, uy = dy / d;
  const nx = -uy, ny = ux;
  const h = (r1 - r2) / d;
  const k = Math.sqrt(Math.max(0, 1 - h * h));
  return [-1, 1].map(sign => {
    const vx = h * ux + sign * k * nx;
    const vy = h * uy + sign * k * ny;
    return { a: { x: c1.x + vx * r1, y: c1.y + vy * r1 }, b: { x: c2.x + vx * r2, y: c2.y + vy * r2 } };
  });
}

function beltArcPoints(center, radius, from, to, awayFrom, steps = 22) {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  let ccw = a1 - a0;
  while (ccw < 0) ccw += Math.PI * 2;
  const cw = ccw - Math.PI * 2;
  const midpointDistance = delta => {
    const a = a0 + delta / 2;
    return Math.hypot(center.x + Math.cos(a) * radius - awayFrom.x, center.y + Math.sin(a) * radius - awayFrom.y);
  };
  const delta = midpointDistance(ccw) >= midpointDistance(cw) ? ccw : cw;
  const count = Math.max(4, Math.round(Math.abs(delta) / (Math.PI * 2) * steps));
  return Array.from({ length: count }, (_, index) => {
    const a = a0 + delta * ((index + 1) / count);
    return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
  });
}

// project(point) => { x, y }，讓幾何層不依賴 SVG / View。
export function buildOpenBeltPath(c1, r1, c2, r2, project) {
  const tangents = openBeltTangents(c1, r1, c2, r2);
  if (tangents.length < 2) return '';
  const points = [tangents[0].a, tangents[0].b,
    ...beltArcPoints(c2, r2, tangents[0].b, tangents[1].b, c1), tangents[1].a,
    ...beltArcPoints(c1, r1, tangents[1].a, tangents[0].a, c2)];
  return points.map((point, index) => {
    const p = project(point);
    return `${index ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

// 2D 齒形的嚙合補償角度（度）。輸出銷仍保持 solver 算出的角度；只有齒形本體使用此偏移。
export function gearMeshPhaseDeg(gear, points, gearById, memo = new Map()) {
  if (!gear || !gear.mesh) return 0;
  if (memo.has(gear.id)) return memo.get(gear.id);
  // app.js 使用查詢函式；3D / 測試端則自然使用 Map。兩種資料來源都接受，
  // 避免純幾何模組反過來綁死某個 UI 容器。
  const driver = typeof gearById === 'function' ? gearById(gear.mesh) : gearById?.get(gear.mesh);
  if (!driver?.p1 || !driver.p2 || !gear.p1 || !gear.p2) return 0;
  const centerA = points[driver.p1.id] || driver.p1;
  const centerB = points[gear.p1.id] || gear.p1;
  const pinA = points[driver.p2.id] || driver.p2;
  const pinB = points[gear.p2.id] || gear.p2;
  if (![centerA, centerB, pinA, pinB].every(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))) return 0;
  const teethA = Math.max(6, Math.round(Number(driver.teeth) || 12));
  const teethB = Math.max(6, Math.round(Number(gear.teeth) || 12));
  const betaA = Math.atan2(centerB.y - centerA.y, centerB.x - centerA.x);
  const betaB = Math.atan2(centerA.y - centerB.y, centerA.x - centerB.x);
  const angleA = Math.atan2(pinA.y - centerA.y, pinA.x - centerA.x);
  const angleB = Math.atan2(pinB.y - centerB.y, pinB.x - centerB.x);
  const parentPhase = gearMeshPhaseDeg(driver, points, gearById, memo) * Math.PI / 180;
  let q = (teethA * (betaA + angleA + parentPhase) + teethB * (betaB + angleB)) / (2 * Math.PI);
  q -= Math.floor(q);
  const phase = (0.5 - q) * (360 / teethB);
  memo.set(gear.id, phase);
  return phase;
}
