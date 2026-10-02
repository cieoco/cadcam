// 組立台測試共用：假 DOM＋插入內建模組。
class FE { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.textContent = ''; this.value = ''; } get firstChild() { return this.children[0] || null; } appendChild(c) { this.children.push(c); return c; } removeChild(c) { return c; } addEventListener() {} setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FE()); return els.get(id); }, createElement: () => new FE() };
export const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
export const Asm = await import('../js/blocks/assembly.js');
export const B = await import('../js/blocks/bench.js');
const q = () => {};
export const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
export function fresh(...ids) {
  S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' }; S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
  S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
  ids.forEach(id => ed.insertBuiltin(id));
  return S.modules.slice();
}
export const motor = { activeMotor: '1', theta: 0, motorAngles: {} };
export const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
// 連續求解到指定馬達角度（每步 ≤ 5°）
export function solveAt(comps, modules, params, angles = {}) {
  const asm = Asm.compileAssembly(comps, modules, { params });
  const ids = ['1', '2', '3', '4'];
  const zero = Object.fromEntries(ids.map(i => [i, 0]));
  let sol = Asm.solveAssembly(asm, { thetaDeg: 0, motorAngles: zero });
  const n = Math.max(1, ...Object.values(angles).map(a => Math.ceil(Math.abs(a) / 5)));
  for (let i = 1; i <= n; i++) sol = Asm.solveAssembly(asm, { thetaDeg: 0, motorAngles: { ...zero, ...Object.fromEntries(Object.entries(angles).map(([k, a]) => [k, a * i / n])) }, _prevPoints: sol.points });
  return sol;
}
export const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
export const ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };
