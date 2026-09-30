// D9 拖曳安裝（SDD-ASSEMBLY-MODULES §4.3b，E-M9）：純函式＋以假 svg 驅動的控制器。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
const docListeners = {};
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: tag => new FakeElement(tag),
  createElementNS: (_ns, tag) => new FakeElement(tag),
  addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); }
};

const { S } = await import('../js/blocks/state.js');
const Ops = await import('../js/blocks/module-ops.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const { compileAssembly, solveAssembly } = await import('../js/blocks/assembly.js');

const hasFns = ['translateModule', 'mountTargets', 'nearestMountTarget'].every(n => typeof Ops[n] === 'function');
check('module-ops 匯出 translateModule／mountTargets／nearestMountTarget', hasFns);
let createModuleDrag = null;
try { ({ createModuleDrag } = await import('../js/blocks/module-drag.js')); } catch (_) {}
check('module-drag.js 匯出 createModuleDrag', typeof createModuleDrag === 'function');
if (!hasFns || typeof createModuleDrag !== 'function') { report('module-drag'); process.exit(1); }

// ---------- 準備：插入兩個內建模組 ----------
const quiet = () => {};
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
const clearSel = () => { S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null; };
clearSel();
const modEditor = createModuleEditor({ pushUndo: quiet, rebuild: quiet, draw: quiet, transient: quiet, downloadJson: quiet,
  viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: quiet });
modEditor.insertBuiltin('rack-lift');
modEditor.insertBuiltin('gear-gripper');
const lift = S.modules[0], grip = S.modules[1];
const liftOut = lift.outputs[0];
const solve = () => solveAssembly(compileAssembly(S.comps, S.modules, { params: S.topo.params }),
  { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } }).points;
const clone = v => JSON.parse(JSON.stringify(v));
const POINT_KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];

// ---------- 純函式 ----------
{
  const before = clone(S.comps);
  const moved = Ops.translateModule(S.comps, grip.id, 30, -12);
  check('translateModule 不改輸入', JSON.stringify(S.comps) === JSON.stringify(before));
  const okShift = moved.every((c, i) => {
    const o = S.comps[i];
    if (c.moduleId !== grip.id) return c === o;
    return POINT_KEYS.every(k => !o[k] || (Math.abs(c[k].x - o[k].x - 30) < 1e-9 && Math.abs(c[k].y - o[k].y + 12) < 1e-9));
  });
  check('translateModule 只平移指定模組，其他零件原物件回傳', okShift);
  check('translateModule dx 非有限數時回原陣列', Ops.translateModule(S.comps, grip.id, NaN, 0) === S.comps);

  const pts = solve();
  const t = Ops.mountTargets(S.comps, S.modules, grip.id, pts);
  check('mountTargets：夾爪可裝到齒條升降・滑台，座標取 at', t.length === 1 && t[0].module === lift.id && t[0].output === liftOut.id
    && /齒條升降/.test(t[0].label) && /滑台/.test(t[0].label) && Math.abs(t[0].x - pts[liftOut.at].x) < 1e-9);
  check('mountTargets：不存在的模組回 []', Ops.mountTargets(S.comps, S.modules, 'nope', pts).length === 0);
  const far = { x: t[0].x + 50, y: t[0].y };
  check('nearestMountTarget：半徑內取最近', Ops.nearestMountTarget(t, { x: t[0].x + 3, y: t[0].y }, 10) === t[0]);
  check('nearestMountTarget：半徑外回 null', Ops.nearestMountTarget(t, far, 10) === null);
}

// ---------- 控制器 ----------
const svgListeners = {};
const svg = {
  children: [],
  appendChild(c) { this.children.push(c); return c; },
  addEventListener(type, fn) { (svgListeners[type] ||= []).push(fn); },
  setPointerCapture() {}, releasePointerCapture() {},
  getScreenCTM: () => ({ a: 1 })
};
const log = { undo: 0, snaps: [], rebuild: 0, draw: 0, notes: [], pause: 0 };
const md = createModuleDrag({
  svg,
  project: p => ({ x: p.x, y: p.y }),
  worldFromEvent: e => ({ x: e.clientX, y: e.clientY }),
  snapRadiusWorld: () => 10,
  pause: () => { log.pause++; },
  pushUndo: () => { log.undo++; log.snaps.push(JSON.stringify(S.comps)); },
  rebuild: () => { log.rebuild++; },
  draw: () => { log.draw++; },
  notify: m => log.notes.push(m),
  currentModuleId: () => {
    if (S.selectedGearId) return S.comps.find(c => c.id === S.selectedGearId)?.moduleId || null;
    return null;
  },
  points: () => solve(),
  motorState: () => ({ activeMotor: '1', theta: 0, motorAngles: {} })
});
const handleTarget = { closest: sel => (/data-module-handle/.test(sel) ? {} : null) };
const plainTarget = { closest: () => null };
const emit = (type, init = {}) => {
  const e = { type, pointerId: 1, clientX: 0, clientY: 0, button: 0, target: plainTarget, key: '', stopped: false, prevented: false,
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; }, ...init };
  const list = type === 'keydown' ? (docListeners.keydown || []) : (svgListeners[type] || []);
  list.forEach(fn => fn(e));
  return e;
};
const gripGear = S.comps.find(c => c.moduleId === grip.id && c.type === 'gear');

{
  clearSel();
  check('沒選取：不畫把手', md.draw(solve()) === null);
  S.selectedGearId = gripGear.id;
  const n0 = svg.children.length;
  const upd = md.draw(solve());
  const h = svg.children[svg.children.length - 1];
  check('選未安裝的夾爪：畫出把手並回傳更新函式', typeof upd === 'function' && svg.children.length === n0 + 1 && h.attrs['data-module-handle'] === grip.id);
}

// 點一下不改作品
{
  const orig = JSON.stringify(S.comps); const u0 = log.undo;
  const base = solve()[grip.base];
  const d = emit('pointerdown', { target: handleTarget, clientX: base.x, clientY: base.y });
  check('按下把手：接手事件', d.stopped === true && md.state().dragging === true);
  emit('pointerup', { clientX: base.x + 1, clientY: base.y });
  check('點一下（<3px）：作品不變、不記 undo', JSON.stringify(S.comps) === orig && log.undo === u0 && md.state().dragging === false);
}

// 拖到空白處：整組平移，一筆 undo
{
  const orig = JSON.stringify(S.comps); const liftBefore = JSON.stringify(S.comps.filter(c => c.moduleId === lift.id));
  const pts = solve(); const base = pts[grip.base]; const at = pts[liftOut.at];
  const dx = at.x - base.x + 100, dy = at.y - base.y + 100;
  const u0 = log.undo;
  emit('pointerdown', { target: handleTarget, clientX: base.x, clientY: base.y });
  emit('pointermove', { clientX: base.x + dx, clientY: base.y + dy });
  check('拖曳中不吸附（離接口遠）', md.state().target === null);
  emit('pointerup', { clientX: base.x + dx, clientY: base.y + dy });
  const origComps = JSON.parse(orig);
  const shifted = S.comps.every((c, i) => c.moduleId !== grip.id || POINT_KEYS.every(k => !c[k] ||
    (Math.abs(c[k].x - origComps[i][k].x - dx) < 1e-6 && Math.abs(c[k].y - origComps[i][k].y - dy) < 1e-6)));
  check('放開：夾爪整組平移 (dx,dy)', shifted);
  check('升降模組不動', JSON.stringify(S.comps.filter(c => c.moduleId === lift.id)) === liftBefore);
  check('只記一筆 undo，且 undo 存的是拖曳前作品', log.undo === u0 + 1 && log.snaps[log.snaps.length - 1] === orig);
  check('沒有安裝', !S.modules.find(m => m.id === grip.id).mount);
}

// Escape 取消
{
  const orig = JSON.stringify(S.comps); const u0 = log.undo;
  const base = solve()[grip.base];
  emit('pointerdown', { target: handleTarget, clientX: base.x, clientY: base.y });
  emit('pointermove', { clientX: base.x + 40, clientY: base.y + 5 });
  check('拖曳中作品已預覽平移', JSON.stringify(S.comps) !== orig);
  emit('keydown', { key: 'Escape' });
  check('Escape：作品還原、不記 undo', JSON.stringify(S.comps) === orig && log.undo === u0 && md.state().dragging === false);
}

// 另一指按下＝取消，且不攔截第二指
{
  const orig = JSON.stringify(S.comps); const u0 = log.undo;
  const base = solve()[grip.base];
  emit('pointerdown', { target: handleTarget, clientX: base.x, clientY: base.y });
  emit('pointermove', { clientX: base.x + 40, clientY: base.y + 5 });
  const second = emit('pointerdown', { pointerId: 2, target: plainTarget, clientX: base.x + 200, clientY: base.y });
  check('第二指：拖曳取消、作品還原、不記 undo', JSON.stringify(S.comps) === orig && log.undo === u0 && md.state().dragging === false);
  check('第二指事件不被攔截（交給雙指縮放）', second.stopped === false);
  emit('pointerup', { pointerId: 2 }); emit('pointerup', { pointerId: 1 });
}

// 拖到滑台附近放開：安裝
{
  const pts = solve(); const base = pts[grip.base]; const at = pts[liftOut.at];
  const u0 = log.undo; const orig = JSON.stringify(S.comps);
  emit('pointerdown', { target: handleTarget, clientX: base.x, clientY: base.y });
  emit('pointermove', { clientX: base.x + (at.x - base.x) + 4, clientY: base.y + (at.y - base.y) - 3 });
  const tg = md.state().target;
  check('靠近滑台：吸附目標為 齒條升降・滑台', tg && tg.module === lift.id && tg.output === liftOut.id);
  emit('pointerup', { clientX: base.x + (at.x - base.x) + 4, clientY: base.y + (at.y - base.y) - 3 });
  const g = S.modules.find(m => m.id === grip.id);
  check('放開：安裝到滑台', g.mount && g.mount.to.module === lift.id && g.mount.to.output === liftOut.id);
  const after = solve();
  check('安裝後 base 貼齊滑台孔', Math.hypot(after[g.base].x - after[liftOut.at].x, after[g.base].y - after[liftOut.at].y) < 1e-6);
  check('安裝只記一筆 undo，且存的是拖曳前作品', log.undo === u0 + 1 && log.snaps[log.snaps.length - 1] === orig);
  check('提示已安裝', log.notes.some(n => /已安裝/.test(n) && /滑台/.test(n)));
  check('已安裝的模組不畫把手', md.draw(solve()) === null);
}

report('module-drag');
