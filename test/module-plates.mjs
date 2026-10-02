// G1：已安裝模組的「固定板」（<id>-frame，夾爪的機架板）要畫得出來，角碼短邊要貼在這塊板上。
import { check, report } from './_harness.mjs';
import { S, B, Asm, ed, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const OJ = await import('../js/blocks/orthogonal-joint.js');
const BP = await import('../js/blocks/build-plan.js');

check('assembly 匯出 mountedFramePlates', typeof Asm.mountedFramePlates === 'function');
if (typeof Asm.mountedFramePlates !== 'function') { report('module-plates'); process.exit(1); }
const T = 3;

// ---------- 1. 直角安裝的夾爪：固定板在夾爪自己的平面 ----------
const [L, G] = fresh('fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const st = B.connect(S.comps, S.modules, G.id, { module: L.id, port: 'edge:ToolBrace_1:R' }, P, motor, { joint: 'bracket-m3' });
const pts = solveAt(st.comps, st.modules, P).points;
const plan = BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings: ex, cnc });
const plates = Asm.mountedFramePlates(st.comps, st.modules, pts, P, { exportSettings: ex, plan });
console.log('plates:', plates.map(p => `${p.name}@${p.plane} z${p.zMm} n${p.outline.length} holes${p.holes.length} cut${p.cutouts.length}`).join(' | '));
const gp = plates.find(p => p.moduleId === G.id);
check('回傳夾爪的固定板：name <id>-frame、plane＝夾爪平面、厚 3、zMm 與製作計畫相同', gp && gp.name === `${G.id}-frame` && gp.plane === G.id && gp.thicknessMm === 3 && gp.zMm === plan.parts.find(x => x.name === `${G.id}-frame`).zMm);
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
const gearCenters = st.comps.filter(c => c.moduleId === G.id && c.type === 'gear').map(c => pts[c.p1.id]);
check('外框是封閉多邊形（≥ 8 點），兩個齒輪軸心都在板內', gp.outline.length >= 8 && gearCenters.every(c => inPoly(c, gp.outline)));
check('有 MG995 的開口（cutouts）與螺絲孔、轉接座孔（holes 帶 layer）', gp.cutouts.length >= 1 && gp.holes.some(h => h.layer === 'ADAPTER_HOLE') && gp.holes.filter(h => h.layer === 'ADAPTER_HOLE').length === 2);
check('沒安裝的模組不在清單裡（它用世界機架板）', !plates.some(p => p.moduleId === L.id));

// ---------- 2. 角碼短邊貼在固定板上、長邊貼在宿主桿上 ----------
const f = Asm.orthogonalFrame(st.comps, st.modules, G.id, pts, P);
const boxes = OJ.bracketBoxes(st.comps, st.modules, G.id, pts, P, { stockMm: T, plan });
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const thinAxis = b => b.axes[['x', 'y', 'z'].findIndex(k => near(b.size[k], 1.2))];
const longLegs = boxes.filter(b => ['x', 'y', 'z'].some(k => near(b.size[k], 13))), shortLegs = boxes.filter(b => ['x', 'y', 'z'].some(k => near(b.size[k], 9.5)));
check('兩片角碼：2 個長邊、2 個短邊', longLegs.length === 2 && shortLegs.length === 2);
check('長邊平貼宿主桿的板面：薄的方向＝宿主法向 z，中心 z＝板厚＋0.6 或 −0.6', longLegs.every(b => near(Math.abs(thinAxis(b).z), 1) && (near(b.center.z, T + 0.6) || near(b.center.z, -0.6))));
const plateMid = Asm.toWorld3D(f, f.base, gp.zMm + T / 2);
check('短邊平貼夾爪固定板：薄的方向＝固定板法向 m，與板中面相距 板厚/2＋0.6', shortLegs.every(b => near(Math.abs(dot(thinAxis(b), f.m)), 1) && near(Math.abs(dot(sub(b.center, plateMid), f.m)), T / 2 + 0.6, 0.01)));
const lay = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: T });
const holeW = lay.childHoles.map(h => Asm.toWorld3D(f, h, gp.zMm + T / 2));
check('短邊蓋住固定板上的轉接座孔（孔心在短邊範圍內）', holeW.every(h => shortLegs.some(b => { const d = sub(h, b.center); return ['x', 'y', 'z'].every((k, i) => Math.abs(dot(d, b.axes[i])) <= b.size[k] / 2 + T / 2 + 0.7); })));
check('兩翼在轉角相接（長邊與短邊的距離 < 10 mm）', longLegs.every(a => shortLegs.some(b => Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y, a.center.z - b.center.z) < 10)));

// 立在面上也一樣貼合
const sd = B.benchAdjust(st.comps, st.modules, G.id, 'stand', P);
const pts2 = solveAt(sd.comps, sd.modules, P).points, f2 = Asm.orthogonalFrame(sd.comps, sd.modules, G.id, pts2, P);
const plan2 = BP.buildPlan({ comps: sd.comps, modules: sd.modules, params: P, exportSettings: ex, cnc });
const gp2 = Asm.mountedFramePlates(sd.comps, sd.modules, pts2, P, { exportSettings: ex, plan: plan2 }).find(p => p.moduleId === G.id);
const b2 = OJ.bracketBoxes(sd.comps, sd.modules, G.id, pts2, P, { stockMm: T, plan: plan2 });
const mid2 = Asm.toWorld3D(f2, f2.base, gp2.zMm + T / 2);
check('立在面上：短邊仍貼固定板、長邊貼宿主上表面', b2.filter(b => ['x', 'y', 'z'].some(k => near(b.size[k], 9.5))).every(b => near(Math.abs(dot(sub(b.center, mid2), f2.m)), T / 2 + 0.6, 0.01)) && b2.filter(b => ['x', 'y', 'z'].some(k => near(b.size[k], 13))).every(b => near(b.center.z, T + 0.6)));

// ---------- 3. 同平面安裝的夾爪（齒條升降）：固定板跟著滑台動 ----------
{
  const [L2, G2] = fresh('rack-lift', 'gear-gripper');
  S.selectedGearId = S.comps.find(c => c.moduleId === G2.id && c.type === 'gear').id;
  ed.mountTo(L2.id, L2.outputs[0].id);
  const P2 = S.topo.params;
  const a = solveAt(S.comps, S.modules, P2).points, b = solveAt(S.comps, S.modules, P2, { '1': 40 }).points;
  const pa = Asm.mountedFramePlates(S.comps, S.modules, a, P2, { exportSettings: ex }).find(p => p.moduleId === G2.id);
  const pb = Asm.mountedFramePlates(S.comps, S.modules, b, P2, { exportSettings: ex }).find(p => p.moduleId === G2.id);
  const base = id => [a[id], b[id]];
  const [ba, bb] = base(G2.base);
  check('同平面安裝：固定板在主平面（plane null）、外框跟著滑台位移', pa && pa.plane === null && near(pb.outline[0].x - pa.outline[0].x, bb.x - ba.x, 1e-3) && near(pb.outline[0].y - pa.outline[0].y, bb.y - ba.y, 1e-3) && Math.hypot(bb.x - ba.x, bb.y - ba.y) > 5);
}
report('module-plates');
