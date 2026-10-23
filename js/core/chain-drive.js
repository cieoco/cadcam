// 鏈輪與 #25 鏈條計算（純函式）；鏈長 L=2C/p+(N1+N2)/2+p(N2−N1)²/(4π²C)

export const CHAIN_25 = Object.freeze({
  id: '25',
  name: 'RS25（#25）',
  pitch: 6.35,
  rollerDiameter: 3.3,
  innerWidth: 3.18,
  pinDiameter: 2.31,
  plateHeight: 5.84,
  plateThickness: 0.75,
  width: 7.6
});

export const TEETH_MIN = 9;
export const TEETH_MAX = 40;
export const MIN_WRAP_DEG = 120;
export const LINK_TOLERANCE_MM = 0.05;

const P = CHAIN_25.pitch;
const RAD = 180 / Math.PI;

export function pitchDiameter(teeth, pitch = P) {
  return pitch / Math.sin(Math.PI / teeth);
}

export function outsideDiameter(teeth, pitch = P) {
  return pitch * (0.6 + 1 / Math.tan(Math.PI / teeth));
}

export function chainLinks(center, teeth1, teeth2, pitch = P) {
  const d = teeth2 - teeth1;
  return 2 * center / pitch + (teeth1 + teeth2) / 2 + pitch * d * d / (4 * Math.PI * Math.PI * center);
}

export function centerForLinks(links, teeth1, teeth2, pitch = P) {
  const d = teeth2 - teeth1;
  const a = links - (teeth1 + teeth2) / 2;
  const disc = a * a - 2 * d * d / (Math.PI * Math.PI);
  if (!(disc >= 0) || !(a > 0)) return NaN;
  return pitch * (a + Math.sqrt(disc)) / 4;
}

export function wrapAngle(center, teeth1, teeth2) {
  const diff = Math.abs(pitchDiameter(teeth2) - pitchDiameter(teeth1));
  const s = Math.min(1, diff / (2 * center));
  return 180 - 2 * Math.asin(s) * RAD;
}

const nearestEven = x => Math.round(x / 2) * 2;

function evenLinksFor(exact, teeth1, teeth2) {
  let n = Math.max(4, nearestEven(exact));
  for (let i = 0; i < 200 && !Number.isFinite(centerForLinks(n, teeth1, teeth2)); i++) n += 2;
  return n;
}

export function checkChainDrive({ center, teeth1, teeth2 }) {
  const issues = [];
  const t1 = Number(teeth1), t2 = Number(teeth2), c = Number(center);
  const teethOk = t => Number.isInteger(t) && t >= TEETH_MIN && t <= TEETH_MAX;
  if (!teethOk(t1) || !teethOk(t2)) {
    issues.push({ code: 'teeth-range', message: `鏈輪齒數要在 ${TEETH_MIN}～${TEETH_MAX} 之間。` });
  }
  const geomOk = Number.isFinite(t1) && Number.isFinite(t2) && t1 >= 3 && t2 >= 3 && Number.isFinite(c) && c > 0;
  if (!geomOk) {
    return { ok: false, links: NaN, linksExact: NaN, deviationMm: NaN, issues };
  }
  const linksExact = chainLinks(c, t1, t2);
  const links = evenLinksFor(linksExact, t1, t2);
  const deviationMm = c - centerForLinks(links, t1, t2);
  if (Math.abs(deviationMm) > LINK_TOLERANCE_MM) {
    issues.push({ code: 'not-integer', message: `中心距不是整數鏈節，差 ${deviationMm.toFixed(2)} mm；請移到 ${links} 節的位置。` });
  }
  if (Math.round(linksExact) % 2 !== 0) {
    issues.push({ code: 'odd-links', message: '鏈節數是奇數，需要半節（過渡鏈節），建議改成偶數。' });
  }
  if (wrapAngle(c, t1, t2) < MIN_WRAP_DEG) {
    issues.push({ code: 'wrap', message: `小鏈輪包角不到 ${MIN_WRAP_DEG}°，鏈條容易跳齒；把兩輪拉近或齒數差縮小。` });
  }
  if (c < (outsideDiameter(t1) + outsideDiameter(t2)) / 2) {
    issues.push({ code: 'interference', message: '兩個鏈輪外徑會互相碰到，請拉開中心距。' });
  }
  return { ok: issues.length === 0, links, linksExact, deviationMm, issues };
}

export function snapCenterToLinks(a, b, teeth1, teeth2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist > 1e-9 ? dx / dist : 1, uy = dist > 1e-9 ? dy / dist : 0;
  const links = evenLinksFor(chainLinks(Math.max(dist, 1e-6), teeth1, teeth2), teeth1, teeth2);
  const c = centerForLinks(links, teeth1, teeth2);
  return { center: { x: a.x + ux * c, y: a.y + uy * c }, links };
}

export function chainTensionSlot(comps, chainId) {
  const chain = comps.find(c => c.type === 'belt' && c.kind === 'chain' && c.id === chainId);
  const find = id => comps.find(c => c.type === 'pulley' && c.id === id);
  const a = chain && find(chain.driver), b = chain && find(chain.driven);
  if (!a?.p1 || !b?.p1) return null;
  const dx = b.p1.x - a.p1.x, dy = b.p1.y - a.p1.y, d = Math.hypot(dx, dy);
  if (!(d > 1e-9)) return null;
  return { pointId: b.p1.id, center: { x: b.p1.x, y: b.p1.y }, dir: { x: dx / d, y: dy / d }, travelMm: CHAIN_25.pitch / 2 };
}
