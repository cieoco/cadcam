/**
 * blocks / grid-gear
 *
 * 齒輪對格（docs/SDD-GRID-BLOCKS.md R5、E2）：輸出孔拖曳吸附、中心距提示與齒數建議。
 * 按需載入（由 editing-handles 引入），不進首次 JS。純計算與一個小字提示，不改作品。
 */
import { GRID_PITCH_MM, pitchDeviation } from './grid-rule.js';

const TEETH_MIN = 6, TEETH_MAX = 60;
const fmt = v => Number(Number(v).toFixed(2));
const norm = a => ((a % 360) + 360) % 360;

/**
 * 輸出孔拖曳：在齒輪局部座標（扣掉姿態 poseDeg）取最近的 8 mm 格點 (i,j)，
 * 孔距 8·√(i²+j²) 必須落在 [pitch, pitchRadius-4]；最近點不合法就退到次近合法格點，沒有回 null。
 */
export function gearHoleGridAtPoint(gear, params, point, { center = gear.p1, poseDeg = 0, pitch = GRID_PITCH_MM } = {}) {
  const max = Number(params[gear.radiusParam]) - 4, dx = point.x - center.x, dy = point.y - center.y;
  if (![max, dx, dy].every(Number.isFinite) || max < pitch) return null;
  const t = -poseDeg * Math.PI / 180, lx = dx * Math.cos(t) - dy * Math.sin(t), ly = dx * Math.sin(t) + dy * Math.cos(t);
  const n = Math.ceil(max / pitch) + 1, found = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const r = pitch * Math.hypot(i, j);
    if (r < pitch - 1e-9 || r > max + 1e-9) continue;
    found.push({ d: Math.hypot(lx - i * pitch, ly - j * pitch), i, j, r });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const g = found[0];
  return { radius: g.r, angle: norm(Math.atan2(g.j, g.i) * 180 / Math.PI) };
}

/** 使中心距 m(z1+z2)/2 為 pitch 倍數、最接近目前齒數的 (z1,z2) 組合（只建議，不套用）。 */
export function gearGridSuggestions(z1, z2, module, max = 3, pitch = GRID_PITCH_MM) {
  const out = [], m = Number(module);
  if (![z1, z2, m].every(Number.isFinite) || m <= 0) return out;
  for (let a = TEETH_MIN; a <= Math.max(TEETH_MAX, z1); a++) for (let b = TEETH_MIN; b <= Math.max(TEETH_MAX, z2); b++) {
    if ((a === z1 && b === z2) || !pitchDeviation(m * (a + b) / 2, pitch).ok) continue;
    const da = Math.abs(a - z1), db = Math.abs(b - z2);
    out.push({ z1: a, z2: b, change: da + db, spread: Math.max(da, db), da });
  }
  out.sort((p, q) => p.change - q.change || p.spread - q.spread || p.da - q.da || p.z1 - q.z1);
  return out.slice(0, max).map(({ z1: a, z2: b }) => ({ z1: a, z2: b }));
}

export function gearCenterText(z1, z2, module, pitch = GRID_PITCH_MM) {
  const center = module * (z1 + z2) / 2, d = pitchDeviation(center, pitch);
  if (d.ok) return `中心距 ${fmt(center)} mm＝${Math.round(center / pitch)} 格`;
  const list = gearGridSuggestions(z1, z2, module, 3, pitch).map(s => `${s.z1}/${s.z2}`).join('、');
  return `中心距 ${fmt(center)} mm 離格${list ? `，可改齒數：${list}` : ''}`;
}

// 齒數欄旁的小字；選中齒輪有嚙合對象時顯示，否則隱藏。
export function showGearGridHint(gear, comps, params) {
  const host = document.getElementById('gearTeethField');
  if (!host) return;
  let el = host.parentElement.querySelector('[data-gear-grid-hint]');
  if (!el) {
    el = document.createElement('small');
    el.dataset.gearGridHint = '';
    el.style.cssText = 'display:block;margin:2px 0;color:#075e75';
    el.setAttribute('aria-live', 'polite');
    host.after(el);
  }
  const radius = g => { const r = Number(params[g.radiusParam]); return r > 0 ? r : g.teeth * g.module / 2; };
  const mates = gear ? comps.filter(g => g.type === 'gear' && (g.id === gear.mesh || g.mesh === gear.id)) : [];
  const mate = mates.find(g => !pitchDeviation(radius(gear) + radius(g), GRID_PITCH_MM).ok) || mates[0];
  el.hidden = !mate;
  el.textContent = mate ? gearCenterText(gear.teeth, mate.teeth, Number(gear.module) || (2 * radius(gear) / gear.teeth)) : '';
}
