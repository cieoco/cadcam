// O1–O2（SDD-ORTHOGONAL-MOUNT）：直角安裝的資料契約、求解與 3D 位姿、宿主視圖側影帶。
// 試行：四連桿升降臂（拿掉手腕，MG995 −60～60°）＋齒輪夾爪，夾爪水平吊在工具架下緣（宿主邊）。
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

const Ops = await import('../js/blocks/module-ops.js');
const Asm = await import('../js/blocks/assembly.js');
const fns = [['module-ops', Ops, ['mountOrthogonal']], ['assembly', Asm, ['orthogonalFrame', 'toWorld3D', 'orthogonalBand']]];
const missing = fns.flatMap(([n, M, list]) => list.filter(f => typeof M[f] !== 'function').map(f => `${n}.${f}`));
check(`匯出 ${fns.flatMap(x => x[2]).join('、')}`, missing.length === 0);
if (missing.length) { console.log('missing:', missing.join(' ')); report('orthogonal-mount'); process.exit(1); }
const Sch = await import('../js/blocks/schema.js');
const MT = await import('../js/blocks/motor-tools.js');
const { memberStock } = await import('../js/blocks/member-stock.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const clone = v => JSON.parse(JSON.stringify(v));

// ---------- 1. 內建四連桿升降臂 ----------
{
  const t = Ops.builtinTemplate('fourbar-lift');
  check('內建模組 fourbar-lift 存在，名稱「四連桿升降臂」', t && t.name === '四連桿升降臂' && Ops.BUILTIN_MODULES.some(m => m.id === 'fourbar-lift'));
  const motors = new Set(t.comps.flatMap(c => ['p1', 'p2'].map(k => c[k] && c[k].physicalMotor).filter(Boolean)).map(String));
  check('拿掉手腕：只剩一顆馬達', motors.size === 1);
  const crank = t.comps.find(c => c.isInput);
  check('升降曲柄改 MG995，−60～60°（平行四連桿過 ±90° 會翻轉）', crank && crank.motorType === 'mg995' && crank.servoStart === -60 && crank.servoEnd === 60);
  check('工具架補斜撐 ToolDiag（否則 A-B-C-D 是會晃的四連桿）', t.comps.some(c => c.id === 'ToolDiag' && c.type === 'bar'));
  const out = (t.outputs || []).find(o => o.id === 'tool');
  check('輸出端「工具架」：at D、body ToolBrace、可直角安裝在下緣（side -1）',
    out && out.name === '工具架' && out.at === 'D' && out.body && out.body.kind === 'bar' && out.body.id === 'ToolBrace' && out.orthogonal && out.orthogonal.side === -1);
  check('base 是固定點 O1', t.base === 'O1');
}

// ---------- 2. 插入、直角安裝 ----------
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
let undo = 0;
const q = () => {};
const ed = createModuleEditor({ pushUndo: () => { undo++; }, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
const P = () => S.topo.params;
const id = (mod, base) => S.comps.flatMap(c => ['p1', 'p2', 'p3'].map(k => c[k])).find(p => p && p.id.startsWith(base + '_') && S.comps.some(c => c.moduleId === mod.id && ['p1', 'p2', 'p3'].some(k => c[k] && c[k].id === p.id)))?.id;
// 連續求解（每步 ≤ 5°，上一步當種子），與播放一致，避免平行四連桿跳到交叉分支。
const solveAt = (comps, modules, a1, a2 = 0) => {
  const asm = Asm.compileAssembly(comps, modules, { params: P() });
  let sol = Asm.solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });
  const n = Math.max(Math.ceil(Math.abs(a1) / 5), Math.ceil(Math.abs(a2) / 5), 1);
  for (let i = 1; i <= n; i++) sol = Asm.solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': a1 * i / n, '2': a2 * i / n }, _prevPoints: sol.points });
  return sol;
};
{
  const pts = solveAt(S.comps, S.modules, 0).points;
  const targets = Ops.mountTargets(S.comps, S.modules, G.id, pts);
  const tt = targets.find(x => x.module === L.id && x.output === 'tool');
  check('mountTargets：工具架標示可直角安裝（orthogonal: true）', tt && tt.orthogonal === true);

  const before = clone(S.comps);
  const r0 = Ops.mountOrthogonal(S.comps, S.modules, G.id, { module: L.id, output: 'nope' }, P(), { activeMotor: '1', theta: 0, motorAngles: {} });
  check('輸出端不存在／不可直角：ok:false', r0.ok === false);
  const r = Ops.mountOrthogonal(S.comps, S.modules, G.id, { module: L.id, output: 'tool' }, P(), { activeMotor: '1', theta: 0, motorAngles: {} });
  check('mountOrthogonal 成功', r.ok === true);
  check('直角安裝不搬動子模組零件（座標存在自己的平面）', JSON.stringify(r.comps) === JSON.stringify(before));
  const m = r.modules.find(x => x.id === G.id).mount;
  check('mount.orient：type orthogonal、edge host、side -1', m && m.orient && m.orient.type === 'orthogonal' && m.orient.edge === 'host' && m.orient.side === -1);
  check('mount.orient.joint 預設 3D 列印轉接座（wall 4、每翼 2 孔）', m.orient.joint && m.orient.joint.kind === 'printed' && m.orient.joint.wallMm === 4 && m.orient.joint.holesPerFlange === 2);
  // 子模組接合軸：從 base 指向子模組所有點的重心（夾爪：base 在上方中央，爪在下方 → 朝下 ≈ -90°）
  check('childAxisDeg 預設由 base 指向子模組重心（夾爪 ≈ -90°）', Number.isFinite(m.orient.childAxisDeg) && Math.abs(m.orient.childAxisDeg - (-90)) < 1);
  check('mount.ref 為有效位姿（相容舊欄位）', m.ref && [m.ref.x, m.ref.y, m.ref.a].every(Number.isFinite));
  S.comps = r.comps; S.modules = r.modules;
}

// ---------- 3. 存檔往返 ----------
{
  const n = Sch.normalizeSnapshot(clone({ kind: 'blocks', v: 1, comps: S.comps, modules: S.modules, params: P() }));
  const mm = n.modules && n.modules.find(x => x.id === G.id);
  check('存檔往返保留 orient（type／edge／side／childAxisDeg／joint）', mm && mm.mount && JSON.stringify(mm.mount.orient) === JSON.stringify(S.modules.find(x => x.id === G.id).mount.orient));
  const bad = clone(S.modules); bad.find(x => x.id === G.id).mount.orient = { type: 'weird' };
  const n2 = Sch.normalizeSnapshot(clone({ kind: 'blocks', v: 1, comps: S.comps, modules: bad, params: P() }));
  check('不合法的 orient 丟掉（退回同平面安裝或未安裝，不會壞檔）', n2 && !(n2.modules.find(x => x.id === G.id)?.mount?.orient));
}

// ---------- 4. 求解：子模組點維持自己的平面 ----------
const gripComps = S.comps.filter(c => c.moduleId === G.id);
const alone = Asm.solveAssembly(Asm.compileAssembly(gripComps.map(c => ({ ...c, moduleId: undefined })), [], { params: P() }), { thetaDeg: 0, motorAngles: { '2': 12 } }).points;
{
  let ok = true, valid = true, posesOk = true;
  for (const a of [-60, -20, 0, 35, 60]) {
    const s = solveAt(S.comps, S.modules, a, 12);
    valid = valid && s.isValid;
    gripComps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => {
      const pid = c[k] && c[k].id; if (!pid || !alone[pid]) return;
      if (!s.points[pid] || !near(s.points[pid].x, alone[pid].x) || !near(s.points[pid].y, alone[pid].y)) ok = false;
    }));
    const o = s.orthogonal && s.orthogonal[G.id];
    if (!o || o.host !== L.id || !o.now || !Number.isFinite(o.now.x)) posesOk = false;
  }
  check('升降 −60～60° 都解得出', valid);
  check('夾爪的點＝自己單獨求解的結果（不被 2D 變換到宿主平面）', ok);
  check('solveAssembly 回傳 orthogonal[夾爪]：{ host, now }', posesOk);
}

// ---------- 5. 3D 位姿 ----------
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const w = memberStock(brace).widthMm;
{
  const s0 = solveAt(S.comps, S.modules, 0);
  const f0 = Asm.orthogonalFrame(S.comps, S.modules, G.id, s0.points);
  const pA = s0.points[brace.p1.id], pD = s0.points[brace.p2.id];
  check('orthogonalFrame：d 沿 ToolBrace p1→p2（工具架水平 → (1,0,0)）', f0 && near(f0.d.x, 1) && near(f0.d.y, 0) && near(f0.d.z, 0));
  check('m＝下緣外法線（0,-1,0）、n＝(0,0,1)（d×n＝m）', near(f0.m.y, -1) && near(f0.m.x, 0) && near(f0.n.z, 1));
  check('origin＝ToolBrace 下緣中點（中心線往下半個板寬）', near(f0.origin.x, (pA.x + pD.x) / 2) && near(f0.origin.y, (pA.y + pD.y) / 2 - w / 2) && near(f0.origin.z, 0));
  const base = s0.points[G.base];
  const o3 = Asm.toWorld3D(f0, base, 0);
  check('toWorld3D：夾爪 base 落在 origin', near(o3.x, f0.origin.x) && near(o3.y, f0.origin.y) && near(o3.z, 0));
  const ax = S.modules.find(x => x.id === G.id).mount.orient.childAxisDeg * Math.PI / 180;
  const along = Asm.toWorld3D(f0, { x: base.x + 40 * Math.cos(ax), y: base.y + 40 * Math.sin(ax) }, 0);
  check('沿接合軸 40 mm → 沿 d 往前 40 mm（爪朝前）', near(along.x, f0.origin.x + 40) && near(along.y, f0.origin.y) && near(along.z, 0));
  const side = Asm.toWorld3D(f0, { x: base.x + 30 * -Math.sin(ax), y: base.y + 30 * Math.cos(ax) }, 0);
  check('垂直接合軸 30 mm → 沿 n（離開宿主平面）30 mm', near(side.z, 30) && near(side.x, f0.origin.x) && near(side.y, f0.origin.y));
  const up = Asm.toWorld3D(f0, base, 6);
  check('子模組第 w mm 高度 → 沿 m（往下、遠離宿主）', near(up.y, f0.origin.y - 6));

  const s1 = solveAt(S.comps, S.modules, 40);
  const f1 = Asm.orthogonalFrame(S.comps, S.modules, G.id, s1.points);
  const dD = { x: s1.points[brace.p2.id].x - pD.x, y: s1.points[brace.p2.id].y - pD.y };
  check('升降 40°：origin 跟著 D 平移，方向不變（工具架保持水平）', near(f1.origin.x - f0.origin.x, dD.x) && near(f1.origin.y - f0.origin.y, dD.y) && near(f1.d.x, 1));
  const g12 = solveAt(S.comps, S.modules, 40, 20);
  const f2 = Asm.orthogonalFrame(S.comps, S.modules, G.id, g12.points);
  check('夾爪開合不影響位姿', near(f2.origin.x, f1.origin.x) && near(f2.origin.y, f1.origin.y));
  check('沒直角安裝的模組：orthogonalFrame 回 null', Asm.orthogonalFrame(S.comps, S.modules, L.id, s0.points) === null);

  // ---------- 6. 宿主視圖側影帶 ----------
  const band = Asm.orthogonalBand(S.comps, S.modules, G.id, s0.points, 15);
  check('側影帶：4 個點', Array.isArray(band) && band.length === 4);
  const ys = band.map(p => p.y), xs = band.map(p => p.x);
  check('側影帶在工具架下緣下方，厚 15 mm', near(Math.max(...ys), f0.origin.y) && near(Math.min(...ys), f0.origin.y - 15));
  const sVals = Object.entries(s0.points).filter(([pid]) => gripComps.some(c => ['p1', 'p2', 'p3'].some(k => c[k] && c[k].id === pid)))
    .map(([, p]) => (p.x - base.x) * Math.cos(ax) + (p.y - base.y) * Math.sin(ax));
  check('側影帶長度＝夾爪沿接合軸的範圍', near(Math.min(...xs), f0.origin.x + Math.min(...sVals), 1e-4) && near(Math.max(...xs), f0.origin.x + Math.max(...sVals), 1e-4));
}

// ---------- 7. 編輯器、拆下、rebake ----------
{
  const r = Asm.rebakeModules(S.comps, S.modules, P());
  check('rebakeModules 不搬動直角子模組、不改 orient', r && JSON.stringify(r.comps.filter(c => c.moduleId === G.id)) === JSON.stringify(gripComps) &&
    JSON.stringify(r.modules.find(x => x.id === G.id).mount.orient) === JSON.stringify(S.modules.find(x => x.id === G.id).mount.orient));
  const moved = Ops.translateModule(S.comps, G.id, 25, -10);
  const s = solveAt(moved, S.modules, 0);
  const f = Asm.orthogonalFrame(moved, S.modules, G.id, s.points);
  const b = Asm.toWorld3D(f, s.points[G.base], 0);
  check('在自己的平面搬動夾爪：3D 位置不變（以 base 為準）', near(b.x, f.origin.x) && near(b.y, f.origin.y));
  const before = clone(S.comps);
  const u = Ops.unmountModule(S.comps, S.modules, G.id, P(), { activeMotor: '1', theta: 0, motorAngles: {} });
  check('拆下直角安裝：零件不動、mount 清空', u.ok && JSON.stringify(u.comps) === JSON.stringify(before) && !u.modules.find(x => x.id === G.id).mount);

  check('編輯器有 mountOrthogonalTo', typeof ed.mountOrthogonalTo === 'function');
  S.modules = u.modules; S.comps = u.comps;
  S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
  const u0 = undo;
  ed.mountOrthogonalTo(L.id, 'tool');
  check('編輯器直角安裝：一筆 undo、mount.orient 存在', undo === u0 + 1 && S.modules.find(x => x.id === G.id).mount?.orient?.type === 'orthogonal');
  check('夾爪仍是 MG995 0～24°（馬達 2）', (() => { const r = MT.servoRange(S.comps, '2'); return r && r.lo === 0 && r.hi === 24; })());
}
report('orthogonal-mount');
