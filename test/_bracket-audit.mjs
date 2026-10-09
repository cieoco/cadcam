// 角碼一致性檢查（共用）：3D 畫面的角碼／螺絲、木板上的加工孔、製作包五金三者要對得上。
//   a. 長腳平貼宿主板面  b. 短腳平貼子模組底板  c. 兩腳在轉角相接、短腳不嵌進宿主板
//   d. 螺牙孔對準兩邊木板的 ADAPTER_HOLE  e. 螺絲從木板另一面穿進角碼，長度＝五金表規格
import { check } from './_harness.mjs';
import { S, Asm, near, solveAt, ex } from './_bench-setup.mjs';
const OJ = await import('../js/blocks/orthogonal-joint.js');
const BP = await import('../js/blocks/build-plan.js');
// Parameter-only audit for current shared solids. Legacy audit below keeps its
// historical callers/labels; measurements never consume production.ok.
export {auditBracketPhysical as auditPhysical} from './fixtures/bracket-physical-audit.mjs';
const TH = 1.2, KS = ['x', 'y', 'z'];
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const offAxis = (a, b, ax) => { const v = sub(a, b), t = dot(v, ax); return Math.hypot(v.x - t * ax.x, v.y - t * ax.y, v.z - t * ax.z); };
// 方塊在某個單位向量上的區間
const span = (b, ax) => { const c = dot(b.center, ax); const h = KS.reduce((s, k, i) => s + Math.abs(dot(b.axes[i], ax)) * b.size[k] / 2, 0); return [c - h, c + h]; };
const isLong = b => KS.some(k => near(b.size[k], 13));
export const fails = [];
export function audit(st, id, label, { T = 3, face = null, params = S.topo.params, points = null, joint, exportSettings = ex } = {}) {
  const P = params, cnc = { toolDiameterMm: 3.175, stockThicknessMm: T };
  const ok = (name, cond) => { check(`${label}｜${name}`, !!cond); if (!cond) fails.push(`${label}｜${name}`); };
  if (!st || st.ok === false) { ok(`操作成功（${st && st.reason}）`, false); return; }
  const pts = points || solveAt(st.comps, st.modules, P).points;
  const plan = BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings, cnc, joint });
  const o = { stockMm: T, plan, joint };
  const f = Asm.orthogonalFrame(st.comps, st.modules, id, pts, P, { stockMm: T, joint });
  const boxes = OJ.bracketBoxes(st.comps, st.modules, id, pts, P, o);
  const screws = OJ.bracketScrews(st.comps, st.modules, id, pts, P, o);
  const lay = OJ.adapterLayout(st.comps, st.modules, id, P, { stockMm: T, joint });
  if (!f || boxes.length !== 4 || screws.length !== 4 || !lay) { ok('有座標系、4 塊翼、4 支螺絲、排版', false); return; }
  const Z = { x: 0, y: 0, z: 1 };
  const longs = boxes.filter(isLong), shorts = boxes.filter(b => !isLong(b));
  // a. 長腳平貼宿主板面（宿主板在方塊座標 z∈[0,T]）
  const zs = longs.map(b => span(b, Z));
  const onTop = zs.every(([lo, hi]) => near(lo, T, 1e-6) && near(hi, T + TH, 1e-6)), onBottom = zs.every(([lo, hi]) => near(lo, -TH, 1e-6) && near(hi, 0, 1e-6));
  console.log(`  ${label}: long z=${zs.map(z => z.map(v => +v.toFixed(2)).join('~')).join(' ')} n.z=${f.n.z} m=${[f.m.x, f.m.y, f.m.z].map(v => +(+v).toFixed(2))}`);
  ok('a. 長腳平貼宿主板面（上面 z=T～T+1.2 或下面 −1.2～0）', longs.length === 2 && (onTop || onBottom));
  if (face) ok(`a2. 站立在${face > 0 ? '上' : '下'}面：長腳也在那一面`, face > 0 ? onTop : onBottom);
  // b. 短腳平貼子模組底板朝宿主那一面：底板在 m 方向佔 [w0, w0+板厚]
  const plate = plan.parts.find(p => p.name === `${id}-frame`);
  const w0 = Number(plate && plate.zMm) || 0;
  const ms = shorts.map(b => span(b, f.m).map(v => v - dot(f.origin, f.m)));
  ok('b. 短腳平貼子模組底板（m 方向 w0−1.2～w0）', shorts.length === 2 && ms.every(([lo, hi]) => near(lo, w0 - TH, 1e-6) && near(hi, w0, 1e-6)));
  // c. 兩腳在轉角相接：三個方向的區間都相接或重疊，而且重疊體積不超過「轉角那一小條」
  const pairOk = longs.every(a => { const b = shorts.find(s => near(dot(sub(s.center, a.center), f.d), 0, 1e-6)); if (!b) return false;
    const ov = [f.d, f.m, f.n].map(ax => { const [a0, a1] = span(a, ax), [b0, b1] = span(b, ax); return Math.min(a1, b1) - Math.max(a0, b0); });
    return ov.every(v => v > -1e-6) && ov[0] * Math.max(ov[1], 0) * Math.max(ov[2], 0) <= 7 * TH * TH + 1e-6; });
  ok('c. 同一片角碼的兩腳在轉角相接', pairOk);
  // c2. 短腳不嵌進宿主板（非站立：短腳與宿主板 z∈(0,T) 不重疊）
  if (!lay.stand) ok('c2. 短腳不嵌進宿主板', shorts.every(b => { const [lo, hi] = span(b, Z); return hi <= 1e-6 || lo >= T - 1e-6; }));
  // d. 孔對準木板
  let hostW;
  if (lay.hostKind === 'bar') {
    const bar = st.comps.find(c => c.id === lay.hostCompId), p1 = pts[bar.p1.id], p2 = pts[bar.p2.id], len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const d = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len }, left = { x: -d.y, y: d.x };
    hostW = lay.hostHoles.map(h => ({ x: p1.x + h.u * d.x + h.v * left.x, y: p1.y + h.u * d.y + h.v * left.y }));
  } else hostW = lay.hostHoles.map(h => ({ x: h.x, y: h.y }));
  ok('d1. 長腳的孔對準宿主木板上的孔', hostW.every(h => longs.some(b => Math.hypot(b.hole.center.x - h.x, b.hole.center.y - h.y) < 0.05)));
  const childW = lay.childHoles.map(h => Asm.toWorld3D(f, h, 0));
  ok('d2. 短腳的孔對準子模組底板上的孔', childW.every(h => shorts.some(b => offAxis(b.hole.center, h, b.hole.axis) < 0.05)));
  ok('d3. 加工：宿主零件與子模組底板各切 2 個 ADAPTER_HOLE', plate && plate.holeLayers.ADAPTER_HOLE >= 2 &&
    plan.parts.some(p => (p.compId === lay.hostCompId || p.name === lay.hostPartName) && p.holeLayers && p.holeLayers.ADAPTER_HOLE >= 2));
  // e. 螺絲
  const j = plan.joints.find(x => x.kind === 'adapter' && x.id === `ADP-${id}`);
  const spec = j && BP.adapterScrewSpec(j);
  const wood = b => (isLong(b) ? T : Number(plate.thicknessMm) || T);
  ok('e1. 螺絲頭在木板的另一面（離孔心＝板厚＋角碼厚/2）、沿孔軸', boxes.every(b => screws.some(s => offAxis(s.head, b.hole.center, b.hole.axis) < 0.05 && near(Math.abs(dot(sub(s.head, b.hole.center), b.hole.axis)), wood(b) + TH / 2, 0.01) && offAxis(s.tip, b.hole.center, b.hole.axis) < 0.05)));
  ok(`e2. 螺絲長度夠穿過各自木板＋角碼且尖端穿出角碼`, boxes.every(b=>screws.some(s=>s.holePairId===b.holePairId&&s.lengthMm>=wood(b)+TH-1e-9)));
  ok(`e3. 3D 的各翼螺絲長度＝製作包五金規格（${spec}）`, screws.every(s=>j?.hardware?.some(h=>h.id===s.id&&h.spec===`M3×${s.lengthMm}`)));
  const hw = BP.hardwareList(plan, { modules: st.modules });
  ok('e4. 五金表有各翼規格的角碼螺絲', screws.every(s=>hw.some(r => r.spec === s.spec && /角碼/.test(r.note || ''))));
}

