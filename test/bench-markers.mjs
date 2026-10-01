// B3（SDD-ASSEMBLY-BENCH §2、§3）：組立台 3D 接口標記（純函式）——拿著某個子模組時，哪些接口要亮、畫在哪裡。
import { check, report } from './_harness.mjs';
class FakeElement { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; } get firstChild() { return null; } appendChild(c) { return c; } removeChild(c) { return c; } addEventListener() {} setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); }, createElement: () => new FakeElement() };
const B = await import('../js/blocks/bench.js');
check('bench.js 匯出 portMarkers', typeof B.portMarkers === 'function');
if (typeof B.portMarkers !== 'function') { report('bench-markers'); process.exit(1); }
const Asm = await import('../js/blocks/assembly.js');
const { memberStock } = await import('../js/blocks/member-stock.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1], P = S.topo.params;
const pts = Asm.solveAssembly(Asm.compileAssembly(S.comps, S.modules, { params: P }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } }).points;
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const zOf = id => (id === brace.id ? 9 : 3);   // 場景裡每根桿的底面高度（測試用）
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;

const mk = B.portMarkers(S.comps, S.modules, G.id, pts, P, { zOf, thicknessMm: 3 });
console.log('markers:', mk.map(m => `${m.portId}${m.suggested ? '*' : ''}${m.compatible ? '' : '(x)'}`).join(' '));
check('拿著夾爪：列出四連桿的接口標記（每個接口一個）', mk.length === B.autoPorts(S.comps, S.modules, L.id, P, { childId: G.id }).length && mk.every(m => m.module === L.id));
check('不列出夾爪自己的接口', mk.every(m => m.module !== G.id));
const bottom = mk.find(m => m.portId === `edge:${brace.id}:R`);
const w = memberStock(brace).widthMm;
const p1 = pts[brace.p1.id], p2 = pts[brace.p2.id];
check('工具架下緣：線段＝桿兩端往下半個板寬、z＝桿的中間高度', bottom && bottom.kind === 'edge' && bottom.points.length === 2 &&
  near(bottom.points[0].x, p1.x) && near(bottom.points[0].y, p1.y - w / 2) && near(bottom.points[1].x, p2.x) && near(bottom.points[0].z, 9 + 1.5));
check('建議的接口標記 suggested、相容 compatible', bottom.suggested === true && bottom.compatible === true);
const bolt = mk.find(m => m.kind === 'bolt');
check('對鎖接口：一個點在輸出端 at', bolt && bolt.points.length === 1 && near(bolt.points[0].x, pts[L.outputs[0].at].x));
check('標記帶白話名稱', mk.every(m => typeof m.name === 'string' && m.name.length > 0));
const tiny = B.portMarkers(S.comps, S.modules, G.id, pts, { ...P, [S.comps.find(c => c.moduleId === L.id && c.id.startsWith('LiftUpright')).lenParam]: 12 }, { zOf, thicknessMm: 3 });
const up = tiny.find(m => m.portId.startsWith('edge:LiftUpright'));
check('不相容的接口：compatible false＋reason（邊太短）', up && up.compatible === false && /20/.test(up.reason));
check('已安裝的子模組：沒有標記（要先拆下）', (() => { const r = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, { activeMotor: '1', theta: 0, motorAngles: {} }); return B.portMarkers(r.comps, r.modules, G.id, pts, P, { zOf, thicknessMm: 3 }).length === 0; })());
report('bench-markers');
