// 鏈輪＋鏈條的放置、改齒數、對齊整數鏈節（純函式：不碰 DOM、不改傳入資料）。
// 兩輪一條鏈：主動輪中心是馬達，從動輪中心是固定軸；對齊時只沿兩輪連線移動從動輪。
import {
  TEETH_MIN, TEETH_MAX, pitchDiameter, outsideDiameter, centerForLinks, checkChainDrive, snapCenterToLinks
} from '../core/chain-drive.js';

const clone = v => JSON.parse(JSON.stringify(v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const POINT_KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];
const MIN_GAP_MM = 2;   // 兩輪外徑之間至少留的空隙
const fail = (message, comps, params) => ({ ok: false, comps, params, message });

const pinRadiusFor = R => Math.max(4, Math.round(R * 0.65));

function usedIds(comps) {
  const ids = new Set();
  comps.forEach(c => {
    ids.add(c.id);
    POINT_KEYS.forEach(k => { if (c[k]?.id) ids.add(c[k].id); });
  });
  return ids;
}
function usedMotors(comps) {
  const ids = new Set();
  comps.forEach(c => [c, ...POINT_KEYS.map(k => c[k])].forEach(o => {
    const v = o && (o.physicalMotor || o.physical_motor);
    if (v) ids.add(String(v));
  }));
  return ids;
}
function nextMotor(comps) {
  const used = usedMotors(comps);
  let n = 1;
  while (used.has(String(n))) n += 1;
  return String(n);
}

// 所有零件裡同 id 的點一起平移（從動輪中心、輪緣銷可能被別的零件共用）。
function movePointEverywhere(comps, id, dx, dy) {
  comps.forEach(c => POINT_KEYS.forEach(k => {
    if (c[k]?.id === id) { c[k].x = (Number(c[k].x) || 0) + dx; c[k].y = (Number(c[k].y) || 0) + dy; }
  }));
}

const sprocketById = (comps, id) => comps.find(c => c.type === 'pulley' && c.kind === 'sprocket' && c.id === id) || null;
const chainFor = (comps, sprocketId) =>
  comps.find(c => c.type === 'belt' && c.kind === 'chain' && (c.driver === sprocketId || c.driven === sprocketId)) || null;

// 從動輪沿 a→b 對齊到最近的偶數鏈節；若會讓兩輪外徑相碰，就往外多加 2 節直到不碰。
function alignedPlacement(a, b, teeth1, teeth2) {
  const need = (outsideDiameter(teeth1) + outsideDiameter(teeth2)) / 2 + MIN_GAP_MM;
  let snap = snapCenterToLinks(a, b, teeth1, teeth2);
  for (let i = 0; i < 60 && dist(a, snap.center) < need; i++) {
    const links = snap.links + 2;
    const c = centerForLinks(links, teeth1, teeth2);
    if (!Number.isFinite(c)) continue;
    const d = dist(a, b) > 1e-9 ? dist(a, b) : 1;
    const ux = dist(a, b) > 1e-9 ? (b.x - a.x) / d : 1, uy = dist(a, b) > 1e-9 ? (b.y - a.y) / d : 0;
    snap = { center: { x: a.x + ux * c, y: a.y + uy * c }, links };
  }
  return snap;
}

export function placeChainDrive(comps, params, driverPoint, drivenPoint, { teeth1 = 12, teeth2 = 24 } = {}) {
  const baseComps = clone(comps || []);
  const baseParams = clone(params || {});
  const t1 = Math.round(Number(teeth1)), t2 = Math.round(Number(teeth2));
  if (![t1, t2].every(t => t >= TEETH_MIN && t <= TEETH_MAX)) return fail(`鏈輪齒數要在 ${TEETH_MIN}～${TEETH_MAX} 之間。`, baseComps, baseParams);
  const a = { x: Number(driverPoint?.x), y: Number(driverPoint?.y) };
  const b = { x: Number(drivenPoint?.x), y: Number(drivenPoint?.y) };
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return fail('找不到放鏈輪的位置。', baseComps, baseParams);
  const need = (outsideDiameter(t1) + outsideDiameter(t2)) / 2 + MIN_GAP_MM;
  const snap = snapCenterToLinks(a, b, t1, t2);
  if (dist(a, snap.center) < need) {
    return fail(`兩個鏈輪太近會互相碰到，中心距離至少要 ${Math.ceil(need)} mm。`, baseComps, baseParams);
  }
  const ids = usedIds(baseComps);
  let k = 1;
  while ([`SprocketA${k}`, `SprocketB${k}`, `Chain${k}`, `SKC${k}A`, `SKC${k}B`, `SKP${k}A`, `SKP${k}B`].some(id => ids.has(id))) k += 1;
  const rA = pitchDiameter(t1) / 2, rB = pitchDiameter(t2) / 2;
  const pinA = pinRadiusFor(rA), pinB = pinRadiusFor(rB);
  const motor = nextMotor(baseComps);
  const radA = `SKR${k}A`, radB = `SKR${k}B`;
  const sprA = {
    type: 'pulley', id: `SprocketA${k}`, kind: 'sprocket', teeth: t1, color: '#e74c3c',
    p1: { id: `SKC${k}A`, type: 'motor', x: a.x, y: a.y, physicalMotor: motor },
    p2: { id: `SKP${k}A`, type: 'floating', x: a.x + pinA, y: a.y },
    radiusParam: radA, pinRadius: pinA, phase: 0
  };
  const sprB = {
    type: 'pulley', id: `SprocketB${k}`, kind: 'sprocket', teeth: t2, color: '#2c6fbb',
    p1: { id: `SKC${k}B`, type: 'fixed', x: snap.center.x, y: snap.center.y },
    p2: { id: `SKP${k}B`, type: 'floating', x: snap.center.x + pinB, y: snap.center.y },
    radiusParam: radB, pinRadius: pinB, phase: 0
  };
  const chain = {
    type: 'belt', id: `Chain${k}`, kind: 'chain', standard: '25', links: snap.links, color: '#34495e',
    driver: sprA.id, driven: sprB.id
  };
  baseParams[radA] = rA;
  baseParams[radB] = rB;
  const issues = checkChainDrive({ center: dist(a, snap.center), teeth1: t1, teeth2: t2 }).issues;
  return { ok: true, comps: [...baseComps, sprA, sprB, chain], params: baseParams, message: issues.map(i => i.message).join(' '), motor };
}

// 只改一顆鏈輪的齒數；有鏈條時，從動輪沿連線移到新的偶數鏈節位置（主動輪不動）。
export function setSprocketTeeth(comps, params, id, teeth) {
  const out = clone(comps || []);
  const outParams = clone(params || {});
  const n = Math.round(Number(teeth));
  const spr = sprocketById(out, id);
  if (!spr) return fail('找不到這個鏈輪。', out, outParams);
  if (!(n >= TEETH_MIN && n <= TEETH_MAX)) return fail(`鏈輪齒數要在 ${TEETH_MIN}～${TEETH_MAX} 之間。`, clone(comps), clone(params));
  spr.teeth = n;
  const R = pitchDiameter(n) / 2;
  outParams[spr.radiusParam] = R;
  if (!spr.pinRadiusParam && Number(spr.pinRadius) > R * 0.9) spr.pinRadius = pinRadiusFor(R);
  const chain = chainFor(out, id);
  if (!chain) return { ok: true, comps: out, params: outParams, message: '' };
  const r = realign(out, outParams, chain);
  return { ok: r.ok, comps: out, params: outParams, message: r.message };
}

// 把從動輪沿兩輪連線移到最接近的偶數鏈節位置，並更新鏈條的鏈節數。
export function alignChainLinks(comps, params, chainId) {
  const out = clone(comps || []);
  const outParams = clone(params || {});
  const chain = out.find(c => c.type === 'belt' && c.kind === 'chain' && c.id === chainId);
  if (!chain) return fail('找不到這條鏈條。', out, outParams);
  const r = realign(out, outParams, chain);
  return { ok: r.ok, comps: out, params: outParams, message: r.message };
}

function realign(comps, params, chain) {
  const a = sprocketById(comps, chain.driver), b = sprocketById(comps, chain.driven);
  if (!a || !b) return { ok: false, message: '鏈條要連接兩個鏈輪。' };
  const snap = alignedPlacement(a.p1, b.p1, a.teeth, b.teeth);
  const dx = snap.center.x - b.p1.x, dy = snap.center.y - b.p1.y;
  const pin = b.p2;   // 先取 id：p1 移動時同 id 的點會一起改
  movePointEverywhere(comps, b.p1.id, dx, dy);
  if (pin?.id) movePointEverywhere(comps, pin.id, dx, dy);
  chain.links = snap.links;
  return { ok: true, message: `已對齊：${snap.links} 節` };
}
