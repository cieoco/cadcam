// D2：已安裝模組的底板（<id>-frame）外框邊也能當直角接口；底板跟著宿主動，接在上面的模組也跟著動。
import { check, report } from './_harness.mjs';
import { S, B, Asm, ed, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const BP = await import('../js/blocks/build-plan.js');
const IF = await import('../js/blocks/interference.js');
const Sch = await import('../js/blocks/schema.js');

// ---------- 1. 同平面安裝的夾爪（裝在齒條滑台）→ 它的底板邊 ----------
{
  const [L, G, G2] = fresh('rack-lift', 'gear-gripper', 'gear-gripper');
  S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
  ed.mountTo(L.id, L.outputs[0].id);
  const P = S.topo.params;
  check('前置：第一個夾爪已同平面裝在滑台', !!S.modules.find(m => m.id === G.id).mount);
  const ports = B.autoPorts(S.comps, S.modules, G.id, P, { childId: G2.id });
  const fe = ports.filter(p => p.kind === 'edge' && p.body.kind === 'frame');
  console.log('mounted frame ports:', fe.map(p => `${p.id} ${p.name} ${Math.round(p.lengthMm)}`).join(' | '));
  check('已安裝模組：底板外框每條直邊一個接口（≥ 3），名稱含「底板」', fe.length >= 3 && fe.every(p => /底板/.test(p.name) && p.lengthMm > 0));
  const port = fe.slice().sort((a, b) => b.lengthMm - a.lengthMm)[0];
  const r = B.connect(S.comps, S.modules, G2.id, { module: G.id, port: port.id }, P, motor);
  const m2 = r.ok && r.modules.find(m => m.id === G2.id).mount;
  check('第二個夾爪直角接到第一個夾爪的底板邊', r.ok && m2.to.module === G.id && m2.to.frame && Number.isInteger(m2.to.frame.edge) && m2.orient?.type === 'orthogonal');
  const s0 = solveAt(r.comps, r.modules, P, {}), s1 = solveAt(r.comps, r.modules, P, { '1': 40 });
  const f0 = Asm.orthogonalFrame(r.comps, r.modules, G2.id, s0.points), f1 = Asm.orthogonalFrame(r.comps, r.modules, G2.id, s1.points);
  const b0 = s0.points[G.base], b1 = s1.points[G.base];
  check('升降動了，接在底板邊的模組跟著動（位移與宿主底座相同）', f0 && f1 && Math.hypot(b1.x - b0.x, b1.y - b0.y) > 5 && near(f1.origin.x - f0.origin.x, b1.x - b0.x, 1e-4) && near(f1.origin.y - f0.origin.y, b1.y - b0.y, 1e-4));
  const plan = BP.buildPlan({ comps: r.comps, modules: r.modules, params: P, exportSettings: ex, cnc });
  const hp = plan.parts.find(p => p.name === `${G.id}-frame`);
  check('製作：宿主底板切 2 個轉接座孔、轉接座關節連 兩片底板', hp && hp.holeLayers.ADAPTER_HOLE === 2 && plan.joints.some(j => j.kind === 'adapter' && j.parts.includes(`${G.id}-frame`) && j.parts.includes(`${G2.id}-frame`)));
  check('宿主底板孔數不因此改變外框尺寸（轉接座孔不撐大外框）', (() => { const p0 = BP.buildPlan({ comps: S.comps, modules: S.modules, params: P, exportSettings: ex, cnc }).parts.find(p => p.name === `${G.id}-frame`); return near(p0.widthMm, hp.widthMm, 0.05) && near(p0.heightMm, hp.heightMm, 0.05); })());
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: r.comps, modules: r.modules, params: P })));
  check('存檔往返保留', JSON.stringify(n.modules.find(m => m.id === G2.id)?.mount?.to) === JSON.stringify(m2.to));
  check('干涉檢查跑得動', Array.isArray(IF.findInterference({ comps: r.comps, modules: r.modules, params: P, plan, pose: { '1': 0, '2': 0, '3': 0 }, exportSettings: ex })));
  const mk = B.portMarkers(S.comps, S.modules, G2.id, s0.points, P, { zOf: () => 3 });
  check('接口標記包含已安裝模組的底板邊', mk.some(m => m.module === G.id && m.portId.startsWith('edge:frame:')));
}

// ---------- 2. 直角安裝的夾爪 → 它的底板邊（在它自己的平面） ----------
{
  const [L, G, G2] = fresh('fourbar-lift', 'gear-gripper', 'gear-gripper');
  const P = S.topo.params;
  const a = B.connect(S.comps, S.modules, G.id, { module: L.id, port: 'edge:ToolBrace_1:R' }, P, motor);
  const fe = B.autoPorts(a.comps, a.modules, G.id, P, { childId: G2.id }).filter(p => p.kind === 'edge' && p.body.kind === 'frame');
  check('直角安裝的模組：底板邊也有接口', fe.length >= 3);
  const r = B.connect(a.comps, a.modules, G2.id, { module: G.id, port: fe[0].id }, P, motor);
  check('接得上，且第二個夾爪有自己的平面', r.ok && Asm.planeOf(r.comps, r.modules, G2.id) === G2.id);
  const s = solveAt(r.comps, r.modules, P, { '1': 30 });
  check('三層解得出、位姿存在', s.isValid && Asm.orthogonalFrame(r.comps, r.modules, G2.id, s.points) !== null);
}
report('bench-mounted-frame');
