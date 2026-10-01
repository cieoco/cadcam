// L3b（走通舉升＋夾取 第 3 包後半）：模組之間用實際螺絲孔連接——滑台輸出端兩顆 M3 孔切在齒條上，
// 夾爪以專用安裝點 GripMount 為基準（不再是伺服軸心），夾爪底板在同位置切出對應的兩個孔。
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
const A = await import('../js/blocks/assembly.js');
const Ex = await import('../js/blocks/exporters.js');
const Model = await import('../js/blocks/model.js');
const { normalizeModules } = await import('../js/blocks/module-schema.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

check('assembly 匯出 moduleFrameNodes', typeof A.moduleFrameNodes === 'function');

// 模板
const lift = Ops.builtinTemplate('rack-lift');
const rack = lift.comps.find(c => c.type === 'rack');
const out = lift.outputs[0];
check('升降：滑台輸出端定義兩顆螺絲 [LiftOutput, LiftOutputB]', Array.isArray(out.bolts) && out.bolts.join(',') === 'LiftOutput,LiftOutputB');
const hb = rack.holes.find(h => h.id === 'LiftOutputB');
check('升降：齒條多一個 LiftOutputB 孔（u 96、v -15、Ø3.2，避開長槽）', hb && hb.u === 96 && hb.v === -15 && hb.diameter === 3.2 && !hb.role);
const grip = Ops.builtinTemplate('gear-gripper');
const gm = grip.comps.find(c => c.type === 'anchor' && c.p1 && c.p1.id === 'GripMount');
check('夾爪：新增固定安裝點 GripMount (0, 40)，且是模組基準', gm && gm.p1.type === 'fixed' && gm.p1.x === 0 && gm.p1.y === 40 && grip.base === 'GripMount');
check('夾爪：原本四個零件不變', ['GearA', 'GearB', 'LeftJaw', 'RightJaw'].every(id => grip.comps.some(c => c.id === id)));

// schema：bolts 保存、非法 id 捨棄
{
  const comps = lift.comps.map(c => ({ ...c, moduleId: 'Lift1' }));
  const mods = [{ id: 'Lift1', name: '齒條升降', base: 'LPC', outputs: [{ ...out, bolts: ['LiftOutput', 'LiftOutputB', 'NotAPoint', 'bad id!'] }], mount: null }];
  const r = normalizeModules(mods, comps);
  const o = (r.modules || r)[0].outputs[0];
  check('schema：bolts 只保留屬於輸出構件的點', Array.isArray(o.bolts) && o.bolts.join(',') === 'LiftOutput,LiftOutputB');
}

// 組合：插入、安裝、匯出用的機架節點
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('rack-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
ed.mountTo(L.id, L.outputs[0].id);
const Gm = S.modules.find(m => m.id === G.id);
check('安裝成功', Gm.mount && Gm.mount.to.module === L.id);
const sol = A.solveAssembly(A.compileAssembly(S.comps, S.modules, { params: S.topo.params }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });
const outAt = sol.points[L.outputs[0].at], baseP = sol.points[Gm.base];
check('安裝後夾爪基準 GripMount 貼齊滑台孔（不是伺服軸心）', Gm.base.startsWith('GripMount') && baseP && near(baseP.x, outAt.x, 1e-6) && near(baseP.y, outAt.y, 1e-6));

if (typeof A.moduleFrameNodes === 'function') {
  const entries = A.moduleFrameExports(S.comps, S.modules, S.topo.params);
  const e = entries.find(x => x.moduleId === G.id);
  check('moduleFrameExports 帶出兩顆螺絲的世界座標（組裝姿態）與孔徑 3.2', e && Array.isArray(e.bolts) && e.bolts.length === 2 &&
    e.bolts.every(b => near(b.diameter, 3.2)) &&
    e.bolts.every(b => { const p = sol.points[b.id]; return p && near(p.x, b.x, 1e-6) && near(p.y, b.y, 1e-6); }));
  const nodes = A.moduleFrameNodes(e, Model.frameConnectorNodes(e.comps));
  check('機架節點：拿掉基準點本身、加入兩顆螺絲節點（孔徑 3.2、圖層 MOUNT_BOLT）',
    !nodes.some(n => n.id === Gm.base) && nodes.filter(n => n.holeLayer === 'MOUNT_BOLT' && near(n.holeDiameterMm, 3.2)).length === 2);
  const f = Ex.inspectFrameExport(nodes, { holeDiameterMm: 12.96, frameHoleDiameterMm: 12.96 }, []);
  const bolts = f.holes.filter(h => h.layer === 'MOUNT_BOLT');
  check('夾爪底板切出兩個 MOUNT_BOLT Ø3.2', bolts.length === 2 && bolts.every(h => near(h.r, 1.6, 1e-6)));
  const pts = f.outlines.flat();
  const bb = { minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)) };
  check('螺絲孔落在夾爪底板外形內', bolts.every(h => h.x - h.r > bb.minX && h.x + h.r < bb.maxX && h.y - h.r > bb.minY && h.y + h.r < bb.maxY));
  check('底板沒有在基準點留 12.96 大孔', !f.holes.some(h => near(h.r, 6.48, 1e-6) && near(h.x, baseP.x, 0.05) && near(h.y, baseP.y, 0.05)));
}
// 齒條匯出含第二顆螺絲孔
{
  const lr = S.comps.find(c => c.moduleId === L.id && c.type === 'rack');
  const g = Ex.inspectRackExport(lr, S.topo.params, S.comps.find(c => c.id === lr.pinion));
  check('齒條匯出 3 個 RACK_HOLE（兩端＋第二顆螺絲）', g.holes.filter(h => h.layer === 'RACK_HOLE').length === 3);
}
report('module-bolts');
