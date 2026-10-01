// O6：直角安裝子模組的 3D 矩陣與平面輸入切分（純函式，不碰 THREE）。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); }, createElement: t => new FakeElement(t) };

const O3 = await import('../js/blocks3d/orthogonal-3d.js');
const Asm = await import('../js/blocks/assembly.js');
const Ops = await import('../js/blocks/module-ops.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
const nearP = (p, q, t = 1e-9) => near(p.x, q.x, t) && near(p.y, q.y, t) && near(p.z, q.z, t);

// ---------- 1. orthogonalMatrix（合成座標系：d 斜 30°、m 在左側、n＝-z、e 斜 -50°）----------
{
  const a = 30 * Math.PI / 180, c = -50 * Math.PI / 180;
  const d = { x: Math.cos(a), y: Math.sin(a), z: 0 };
  const m = { x: -Math.sin(a), y: Math.cos(a), z: 0 };
  const frame = { origin: { x: 100, y: 40, z: 0 }, d, m, n: { x: 0, y: 0, z: -1 },
    base: { x: 7, y: -3 }, e: { x: Math.cos(c), y: Math.sin(c) }, f: { x: -Math.sin(c), y: Math.cos(c) } };
  const M = O3.orthogonalMatrix(frame, 0);
  check('orthogonalMatrix：16 個有限數', Array.isArray(M) && M.length === 16 && M.every(Number.isFinite));
  const at = (x, y, w) => O3.applyMatrix4(M, { x, y, z: w });
  check('base（w=0）→ origin', nearP(at(7, -3, 0), frame.origin));
  const plus = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k, z: p.z + v.z * k });
  check('base+e → origin+d', nearP(at(7 + frame.e.x, -3 + frame.e.y, 0), plus(frame.origin, d, 1)));
  check('base+f → origin+n', nearP(at(7 + frame.f.x, -3 + frame.f.y, 0), plus(frame.origin, frame.n, 1)));
  check('w 沿 m', nearP(at(7, -3, 5), plus(frame.origin, m, 5)));
  // 與 assembly.toWorld3D 逐點一致
  let same = true;
  [[0, 0, 0], [20, -15, 4], [-8, 33, 12]].forEach(([x, y, w]) => {
    const ref = Asm.toWorld3D(frame, { x, y }, w);
    if (!nearP(at(x, y, w), ref)) same = false;
  });
  check('與 toWorld3D 一致', same);
  const Mz = O3.orthogonalMatrix(frame, 12, 3);
  check('zOffset 抬高宿主 z、wOffset 沿 m 平移', nearP(O3.applyMatrix4(Mz, { x: 7, y: -3, z: 0 }), { x: 100 + m.x * 3, y: 40 + m.y * 3, z: 12 }));
  check('null frame → null', O3.orthogonalMatrix(null) === null);
  const T = O3.multiply4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1], M);
  check('multiply4：先 M 後平移', nearP(O3.applyMatrix4(T, { x: 7, y: -3, z: 0 }), { x: 105, y: 46, z: 7 }));
  check('modelMinZ 取各零件最低 z', O3.modelMinZ({ sticks: [{ z: 6 }], gears: [{ z: -6 }], motors: [{ baseZ: -50 }] }) === -6 && O3.modelMinZ({}) === 0);
}

// ---------- 2. 真實的四連桿升降臂 + 直角夾爪 ----------
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
const P = S.topo.params;
const solveAt = a => Asm.solveAssembly(Asm.compileAssembly(S.comps, S.modules, { params: P }), { thetaDeg: 0, motorAngles: { '1': a, '2': 0 } });
{
  const r = Ops.mountOrthogonal(S.comps, S.modules, G.id, { module: L.id, output: 'tool' }, P, { activeMotor: '1', theta: 0, motorAngles: {} });
  S.comps = r.comps; S.modules = r.modules;
}
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const inputsAt = a => {
  const sol = solveAt(a);
  const mk = (type, extra) => S.comps.filter(c => c.type === type).map(c => ({ id: c.id, ...extra }));
  return { links: [{ id: 'x', p1: brace.p1.id, p2: brace.p2.id }, ...S.comps.filter(c => c.type === 'gear' && c.moduleId === G.id).map(c => ({ id: c.id, p1: c.p1.id, p2: c.p2.id }))],
    pts: sol.points, groundIds: new Set(), motorCenterIds: new Set(), polygons: [], sliders: [], gears: mk('gear'), racks: [], cams: [], pulleys: [], belts: [] };
};
{
  const inp = inputsAt(0);
  const main = O3.planeInputs(inp, S.comps, S.modules, null);
  const child = O3.planeInputs(inp, S.comps, S.modules, G.id);
  const gPts = new Set(S.comps.filter(c => c.moduleId === G.id).flatMap(c => ['p1', 'p2', 'p3'].map(k => c[k] && c[k].id)).filter(Boolean));
  check('planeInputs(null)：沒有夾爪的點', Object.keys(main.pts).length > 0 && Object.keys(main.pts).every(id => !gPts.has(id)));
  check('planeInputs(夾爪)：只有夾爪的點', Object.keys(child.pts).length > 0 && Object.keys(child.pts).every(id => gPts.has(id)));
  check('links 依平面分開、不混', main.links.every(l => !gPts.has(l.p1)) && child.links.every(l => gPts.has(l.p1) && gPts.has(l.p2)) && child.links.length > 0);

  for (const a of [0, 40]) {
    const inp2 = inputsAt(a);
    const braceZ = 12;
    const seen = [];
    const kids = O3.buildOrthogonalChildren({
      comps: S.comps, modules: S.modules, inputs: inp2,
      mainModel: { sticks: [{ id: brace.id, z: braceZ }] },
      buildModel: pi => { seen.push(pi); return { sticks: [{ z: 0 }], gears: [{ z: -6 }] }; }
    });
    check(`motor ${a}°：回一個子場景，id＝夾爪`, kids.length === 1 && kids[0].id === G.id && kids[0].matrix.length === 16);
    check('buildModel 只拿到夾爪平面的輸入', seen.length === 1 && Object.keys(seen[0].pts).every(id => gPts.has(id)));
    const f = Asm.orthogonalFrame(S.comps, S.modules, G.id, inp2.pts);
    const base = O3.applyMatrix4(kids[0].matrix, { x: f.base.x, y: f.base.y, z: 0 });
    // 子場景最低 z=-6 → wOffset=6 沿 m：base 在 origin + 6·m，z＝宿主桿 z
    check(`motor ${a}°：夾爪 base 落在工具架側面（origin + 抬層 w·m），z＝宿主桿層 z`,
      nearP(base, { x: f.origin.x + 6 * f.m.x, y: f.origin.y + 6 * f.m.y, z: braceZ + 6 * f.m.z }));
    const lowest = O3.applyMatrix4(kids[0].matrix, { x: f.base.x, y: f.base.y, z: -6 });
    check('最低零件（z=-6）剛好貼在 origin（不穿進桿身）', nearP(lowest, { x: f.origin.x, y: f.origin.y, z: braceZ }));
    const out = O3.applyMatrix4(kids[0].matrix, { x: f.base.x + f.e.x * 10, y: f.base.y + f.e.y * 10, z: 0 });
    check('沿 e 走 10 mm → 沿 d 走 10 mm', near(Math.hypot(out.x - base.x, out.y - base.y), 10, 1e-6) && near(out.z, base.z, 1e-9));
  }
  const noHost = O3.buildOrthogonalChildren({ comps: S.comps, modules: S.modules.map(m => m.id === G.id ? { ...m, mount: { ...m.mount, to: { module: 'nope', output: 'tool' } } } : m), inputs: inputsAt(0), mainModel: { sticks: [] }, buildModel: () => ({}) });
  check('宿主不存在：略過（不丟例外）', Array.isArray(noHost) && noHost.length === 0);
  check('沒有直角安裝：空陣列', O3.buildOrthogonalChildren({ comps: [], modules: [], inputs: {}, mainModel: {}, buildModel: () => ({}) }).length === 0);
}

report('orthogonal-3d');
