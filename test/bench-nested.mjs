// C2（SDD-ASSEMBLY-BENCH 後續）：宿主本身在直角子平面上時，接口標記也要出現（帶 plane），並且接得上。
import { check, report } from './_harness.mjs';
class FE { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.textContent = ''; this.value = ''; } get firstChild() { return this.children[0] || null; } appendChild(c) { this.children.push(c); return c; } removeChild(c) { return c; } addEventListener() {} setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FE()); return els.get(id); }, createElement: () => new FE() };
const B = await import('../js/blocks/bench.js');
const Asm = await import('../js/blocks/assembly.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' }; S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
const pt = (id, x, y) => ({ id, type: 'fixed', x, y });
S.comps = [...S.comps, { type: 'triangle', id: 'Plt', moduleId: 'H', p1: pt('HA', -600, 0), p2: pt('HB', -400, 0), p3: pt('HC', -500, 120), gParam: 'HG', r1Param: 'HR1', r2Param: 'HR2', color: '#888' }];
Object.assign(S.topo.params, { HG: 200, HR1: Math.hypot(100, 120), HR2: Math.hypot(100, 120) });
S.modules = [...S.modules, { id: 'H', name: '底座板', base: 'HA', outputs: [] }];
const P = S.topo.params, motor = { activeMotor: '1', theta: 0, motorAngles: {} };
// 四連桿直角立在底座板上緣（e2 或 e1 取上方的那條）
const hp = B.autoPorts(S.comps, S.modules, 'H', P, { childId: L.id }).filter(p => p.kind === 'edge' && p.body.kind === 'triangle');
let st = B.connect(S.comps, S.modules, L.id, { module: 'H', port: hp.find(p => p.body.edge === 0).id }, P, motor);
check('四連桿直角裝在底座板上', st.ok && Asm.planeOf(st.comps, st.modules, L.id) === L.id);
const pts = Asm.solveAssembly(Asm.compileAssembly(st.comps, st.modules, { params: P }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } }).points;
const mk = B.portMarkers(st.comps, st.modules, G.id, pts, P, { zOf: () => 3, thicknessMm: 3 });
const inL = mk.filter(m => m.module === L.id);
console.log('nested markers:', inL.map(m => `${m.portId}@${m.plane}`).join(' '));
check('拿著夾爪：四連桿（在直角子平面上）的接口也有標記', inL.length > 0);
check('這些標記帶 plane＝四連桿的平面、點用四連桿自己的座標', inL.every(m => m.plane === L.id) && inL.find(m => m.portId.startsWith('edge:ToolBrace')).points.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)));
check('主平面的接口 plane 為 null', mk.filter(m => m.module === 'H').every(m => m.plane === null));
const r = B.connect(st.comps, st.modules, G.id, { module: L.id, port: inL.find(m => /ToolBrace.*:R$/.test(m.portId)).portId }, P, motor);
check('夾爪直角裝到「直角子平面上的」四連桿工具架下緣', r.ok && Asm.planeOf(r.comps, r.modules, G.id) === G.id);
const pts2 = Asm.solveAssembly(Asm.compileAssembly(r.comps, r.modules, { params: P }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });
check('三層都解得出、夾爪位姿存在（在四連桿平面座標）', pts2.isValid && Asm.orthogonalFrame(r.comps, r.modules, G.id, pts2.points) !== null);
report('bench-nested');
