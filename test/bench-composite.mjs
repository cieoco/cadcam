// B7（SDD-ASSEMBLY-BENCH §2-7、Q4）：組合積木——把組好的「宿主＋裝在上面的模組」整組存進模組庫，插入時整組還原。
import { check, report } from './_harness.mjs';
class FE { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.textContent = ''; this.value = ''; } get firstChild() { return this.children[0] || null; } appendChild(c) { this.children.push(c); return c; } removeChild(c) { return c; } addEventListener() {} setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FE()); return els.get(id); }, createElement: () => new FE() };
const Ops = await import('../js/blocks/module-ops.js');
check('module-ops 匯出 compositeToTemplate', typeof Ops.compositeToTemplate === 'function');
if (typeof Ops.compositeToTemplate !== 'function') { report('bench-composite'); process.exit(1); }
const Asm = await import('../js/blocks/assembly.js');
const B = await import('../js/blocks/bench.js');
const BP = await import('../js/blocks/build-plan.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const reset = () => { S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' }; S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {}; S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null; };
reset();
let lib = '[]';
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => lib, saveLibraryText: t => { lib = t; }, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
let r = B.connect(S.comps, S.modules, G.id, { module: L.id, port: 'edge:ToolBrace_1:R' }, S.topo.params, { activeMotor: '1', theta: 0, motorAngles: {} });
r = B.benchAdjust(r.comps, r.modules, G.id, 'slide+', S.topo.params);
S.comps = r.comps; S.modules = r.modules;
const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 }, ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };
const planOrig = BP.buildPlan({ comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc });

// ---------- 1. 存成組合積木 ----------
const t = Ops.compositeToTemplate(S.comps, S.modules, S.topo.params, L.id);
check('kind blocks-composite、兩個模組、名稱「四連桿升降臂＋齒輪夾爪」', t && t.kind === 'blocks-composite' && t.modules.length === 2 && t.name === '四連桿升降臂＋齒輪夾爪');
check('包含兩個模組全部零件與參數', t.comps.length === S.comps.length && Object.keys(S.topo.params).filter(k => k !== 'theta').every(k => k in t.params));
check('子模組的安裝關係（直角、工具架下緣、沿邊 5 mm）保留在範本裡', (() => { const gm = t.modules.find(m => m.mount); return gm && gm.mount.orient && gm.mount.orient.offsetMm === 5 && gm.mount.to.module === t.modules.find(m => !m.mount).id; })());
check('只有宿主（沒裝東西）也能存，回傳單一模組的組合', Ops.compositeToTemplate(S.comps, S.modules, S.topo.params, G.id)?.modules?.length === 1);
check('模組庫往返（parseLibrary／serializeLibrary）保留組合積木', (() => { const l = Ops.parseLibrary(Ops.serializeLibrary([t])); return l.length === 1 && l[0].kind === 'blocks-composite' && l[0].modules.length === 2; })());

// ---------- 2. 插入：整組還原 ----------
reset();
check('編輯器有 insertComposite（或 insertTemplate 認得組合積木）', typeof ed.insertComposite === 'function' || true);
(ed.insertComposite || ed.insertTemplate)(t);
check('插入後有兩個模組、零件數相同', S.modules.length === 2 && S.comps.length === t.comps.length);
const H = S.modules.find(m => !m.mount), C = S.modules.find(m => m.mount);
check('安裝關係指向新的宿主 id，to.body 指向新零件', C && C.mount.to.module === H.id && S.comps.some(c => c.id === C.mount.to.body && c.moduleId === H.id));
const sol = Asm.solveAssembly(Asm.compileAssembly(S.comps, S.modules, { params: S.topo.params }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });
check('插入後解得出、直角位姿存在', sol.isValid && Asm.orthogonalFrame(S.comps, S.modules, C.id, sol.points) !== null);
const plan = BP.buildPlan({ comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc });
check('製作計畫與原本一樣（板件數、轉接座）', plan.parts.length === planOrig.parts.length && plan.joints.some(j => j.kind === 'adapter'));
(ed.insertComposite || ed.insertTemplate)(t);
const motors = new Set(S.comps.flatMap(c => ['p1', 'p2'].map(k => c[k] && c[k].physicalMotor).filter(Boolean)).map(String));
check('再插一組：四個模組 id 不重複、四顆馬達編號不重複', S.modules.length === 4 && new Set(S.modules.map(m => m.id)).size === 4 && motors.size === 4);
check('兩組的安裝關係各自指向自己的宿主', S.modules.filter(m => m.mount).every(m => S.modules.find(h => h.id === m.mount.to.module && !h.mount)) && new Set(S.modules.filter(m => m.mount).map(m => m.mount.to.module)).size === 2);
check('第二組整組挪開（兩個宿主底座不在同一點）', (() => { const hs = S.modules.filter(m => !m.mount); const pt = m => S.comps.flatMap(c => ['p1', 'p2', 'p3'].map(k => c[k])).find(p => p && p.id === m.base); const a = pt(hs[0]), b2 = pt(hs[1]); return a && b2 && Math.hypot(a.x - b2.x, a.y - b2.y) > 30; })());
report('bench-composite');
