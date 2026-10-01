// C1（SDD-ASSEMBLY-BENCH §4 後續）：板件邊與底板（機架板）邊也能當直角接口。
import { check, report } from './_harness.mjs';
class FE { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.textContent = ''; this.value = ''; } get firstChild() { return this.children[0] || null; } appendChild(c) { this.children.push(c); return c; } removeChild(c) { return c; } addEventListener() {} setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FE()); return els.get(id); }, createElement: () => new FE() };
const B = await import('../js/blocks/bench.js');
const Asm = await import('../js/blocks/assembly.js');
const BP = await import('../js/blocks/build-plan.js');
const IF = await import('../js/blocks/interference.js');
const Ex = await import('../js/blocks/exporters.js');
const Sch = await import('../js/blocks/schema.js');
const { memberStock } = await import('../js/blocks/member-stock.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
const motor = { activeMotor: '1', theta: 0, motorAngles: {} };
const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 }, ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };
const solve = (c, m, P) => Asm.solveAssembly(Asm.compileAssembly(c, m, { params: P }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });

const reset = () => { S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' }; S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {}; S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null; };
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });

// ---------- 1. 板件（三角板）的三條邊 ----------
reset();
ed.insertBuiltin('gear-gripper');
const G = S.modules[0];
// 宿主：一塊靜止的三角板 H（底邊 p1→p2 水平 120 mm）
const pt = (id, x, y) => ({ id, type: 'fixed', x, y });
S.comps = [...S.comps,
  { type: 'triangle', id: 'Plt', moduleId: 'H', p1: pt('HA', -400, 0), p2: pt('HB', -280, 0), p3: pt('HC', -340, 90), gParam: 'HG', r1Param: 'HR1', r2Param: 'HR2', color: '#888' }];
Object.assign(S.topo.params, { HG: 120, HR1: Math.hypot(60, 90), HR2: Math.hypot(60, 90) });
S.modules = [...S.modules, { id: 'H', name: '底座板', base: 'HA', outputs: [] }];
const P = S.topo.params;
const plate = S.comps.find(c => c.id === 'Plt');
{
  const ports = B.autoPorts(S.comps, S.modules, 'H', P);
  const pe = ports.filter(p => p.kind === 'edge' && p.body.kind === 'triangle' && p.body.id === 'Plt');
  console.log('plate ports:', pe.map(p => `${p.id} ${p.name} ${Math.round(p.lengthMm)}`).join(' | '));
  check('三角板：三條邊各一個 edge 接口（body.kind triangle、edge 0～2）', pe.length === 3 && [0, 1, 2].every(k => pe.some(p => p.body.edge === k)));
  const bottom = pe.find(p => p.body.edge === 0);
  check('底邊 p1→p2：名稱「下緣」、長度 120、法向朝外（離開板心）', bottom && /下緣/.test(bottom.name) && near(bottom.lengthMm, 120));
  const r = B.connect(S.comps, S.modules, G.id, { module: 'H', port: bottom.id }, P, motor);
  check('夾爪直角接到三角板下緣', r.ok && r.modules.find(m => m.id === G.id).mount.to.body === 'Plt' && r.modules.find(m => m.id === G.id).mount.to.edge === 0);
  const f = Asm.orthogonalFrame(r.comps, r.modules, G.id, solve(r.comps, r.modules, P).points);
  const w = memberStock(plate).widthMm;
  check('位姿：d 沿底邊、m 朝下、origin 在底邊中點往外半個板寬', f && near(f.d.x, 1) && near(f.m.y, -1) && near(f.origin.x, -340) && near(f.origin.y, -w / 2));
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: r.comps, modules: r.modules, params: P })));
  check('存檔往返保留 to.edge', n.modules.find(m => m.id === G.id)?.mount?.to?.edge === 0);
  const plan = BP.buildPlan({ comps: r.comps, modules: r.modules, params: P, exportSettings: ex, cnc });
  const hp = plan.parts.find(p => p.compId === 'Plt');
  check('製作：三角板上切 2 個轉接座孔、有 adapter 關節', hp && hp.holeLayers.ADAPTER_HOLE === 2 && plan.joints.some(j => j.kind === 'adapter' && j.parts.includes(hp.name)));
  check('干涉檢查跑得動（不丟例外）', Array.isArray(IF.findInterference({ comps: r.comps, modules: r.modules, params: P, plan, ranges: { '2': { lo: 0, hi: 24 } }, exportSettings: ex })));
}

// ---------- 2. 機架板（底板）的邊 ----------
reset();
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
{
  const L = S.modules[0], G2 = S.modules[1], P2 = S.topo.params;
  const ports = B.autoPorts(S.comps, S.modules, L.id, P2, { childId: G2.id });
  const fe = ports.filter(p => p.kind === 'edge' && p.body.kind === 'frame');
  console.log('frame ports:', fe.map(p => `${p.id} ${p.name} ${Math.round(p.lengthMm)}`).join(' | '));
  check('未安裝模組的機架板：每條外框直邊一個 edge 接口（兩點機架是長條形→ 2 條長邊）', fe.length >= 2 && fe.every(p => p.lengthMm > 0 && /機架/.test(p.name)));
  const longest = fe.slice().sort((a, b) => b.lengthMm - a.lengthMm)[0];
  const r = B.connect(S.comps, S.modules, G2.id, { module: L.id, port: longest.id }, P2, motor);
  check('夾爪直角接到機架邊', r.ok && r.modules.find(m => m.id === G2.id).mount.to.frame !== undefined);
  const pts = solve(r.comps, r.modules, P2).points;
  const f = Asm.orthogonalFrame(r.comps, r.modules, G2.id, pts);
  // origin 必須落在匯出的機架外框上（± 0.5 mm）
  const frameParts = BP.buildPlan({ comps: r.comps, modules: r.modules, params: P2, exportSettings: ex, cnc }).parts.filter(p => p.kind === 'frame' && p.plane === null);
  const { frameConnectorNodes } = await import('../js/blocks/model.js');
  const worldNodes = frameConnectorNodes(Asm.worldFrameComps(r.comps, r.modules));
  const g = Ex.inspectFrameExport(worldNodes, ex, []);
  const outline = g.outlines[0];
  const distToPoly = (p, poly) => Math.min(...poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; const dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }));
  check('位姿 origin 落在匯出的機架外框上（± 0.5 mm）、m 朝外', f && distToPoly(f.origin, outline) < 0.5);
  const plan = BP.buildPlan({ comps: r.comps, modules: r.modules, params: P2, exportSettings: ex, cnc });
  const fp = plan.parts.find(p => p.name === 'frame');
  check('製作：機架板上切 2 個轉接座孔、有 adapter 關節', fp && fp.holeLayers.ADAPTER_HOLE === 2 && plan.joints.some(j => j.kind === 'adapter' && j.parts.includes('frame')));
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: r.comps, modules: r.modules, params: P2 })));
  check('存檔往返保留 to.frame', JSON.stringify(n.modules.find(m => m.id === G2.id)?.mount?.to?.frame) === JSON.stringify(r.modules.find(m => m.id === G2.id).mount.to.frame));
  const adj = B.benchAdjust(r.comps, r.modules, G2.id, 'slide+', P2);
  check('接在機架邊也能沿邊滑 5 mm', adj.ok && adj.modules.find(m => m.id === G2.id).mount.orient.offsetMm === 5);
  check('機架邊不能轉成同平面（白話原因）', B.toggleAngle(r.comps, r.modules, G2.id, P2, motor).ok === false);
}
report('bench-ports2');
