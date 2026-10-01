// O4a（SDD-ORTHOGONAL-MOUNT O-D4／O-D5）：直角安裝的製作——3D 列印 L 形轉接座的孔位切進兩邊木板、
// 製作計畫分成兩個平面各自疊層、五金與組裝步驟。
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

let OJ = null;
try { OJ = await import('../js/blocks/orthogonal-joint.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
check('orthogonal-joint.js 匯出 adapterLayout／orthogonalExportExtras', typeof OJ?.adapterLayout === 'function' && typeof OJ?.orthogonalExportExtras === 'function');
if (typeof OJ?.adapterLayout !== 'function') { report('orthogonal-fab'); process.exit(1); }
const Ex = await import('../js/blocks/exporters.js');
const BP = await import('../js/blocks/build-plan.js');
const { compileAssembly, solveAssembly } = await import('../js/blocks/assembly.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');

S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
ed.mountOrthogonalTo(L.id, 'tool');
const P = S.topo.params;
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const pts = solveAssembly(compileAssembly(S.comps, S.modules, { params: P }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } }).points;
const base = pts[G.base];

// ---------- 1. 轉接座排版 ----------
{
  const a = OJ.adapterLayout(S.comps, S.modules, G.id, P, { stockMm: 3 });
  console.log('layout:', JSON.stringify(a));
  check('預設尺寸：長 20、壁厚 4、翼高 14、孔 3.2', a && a.lengthMm === 20 && a.wallMm === 4 && a.flangeMm === 14 && a.holeDiameterMm === 3.2);
  check('宿主構件＝ToolBrace、子模組板＝夾爪底板', a.hostCompId === brace.id && a.childPart === `${G.id}-frame`);
  // 宿主孔：沿桿從 p1 起算 u（桿長 80 → 中點 40，再往前 5、15）；v＝side·(寬/2 − 9)＝0（板寬 18、翼孔距接合邊 9）
  check('宿主孔（桿座標）：u 45、55，v 0', a.hostHoles.length === 2 && near(a.hostHoles[0].u, 45) && near(a.hostHoles[1].u, 55) && a.hostHoles.every(h => near(h.v, 0)));
  // 子模組孔：base + s·e + t·f；e 沿 childAxisDeg（-90° → (0,-1)）、f＝(−e.y, e.x)＝(1,0)；s 5、15；t＝宿主板厚 3＋9＝12
  check('子模組孔（夾爪自己的座標）：base＋(12,−5)、base＋(12,−15)', a.childHoles.length === 2 &&
    near(a.childHoles[0].x, base.x + 12, 1e-3) && near(a.childHoles[0].y, base.y - 5, 1e-3) && near(a.childHoles[1].y, base.y - 15, 1e-3));
  check('不是直角安裝的模組：回 null', OJ.adapterLayout(S.comps, S.modules, L.id, P, { stockMm: 3 }) === null);
}

// ---------- 2. 匯出 ----------
{
  const extras = OJ.orthogonalExportExtras(S.comps, S.modules, P, { stockMm: 3 });
  const lh = extras.linkHoles && extras.linkHoles[brace.id];
  check('extras.linkHoles[ToolBrace]：2 孔', Array.isArray(lh) && lh.length === 2);
  const g = Ex.inspectLinkExport(brace, 80, { holeDiameterMm: 3.2 }, lh);
  const ad = g.holes.filter(h => h.layer === 'ADAPTER_HOLE');
  const p1 = g.holes.filter(h => h.layer === 'HOLE').sort((a, b) => a.x - b.x)[0];
  check('桿件匯出：多兩個 ADAPTER_HOLE（u 45、55，與 p1 孔同高）、孔徑 3.2', ad.length === 2 && near(ad[0].x - p1.x, 45, 1e-3) && near(ad[1].x - p1.x, 55, 1e-3) && ad.every(h => near(h.y, p1.y, 1e-3) && near(h.r, 1.6, 1e-3)));
  check('沒傳 extra 時桿件匯出不變', Ex.inspectLinkExport(brace, 80, { holeDiameterMm: 3.2 }).holes.every(h => h.layer !== 'ADAPTER_HOLE'));
  const fn = extras.frameNodes && extras.frameNodes[G.id];
  check('extras.frameNodes[夾爪]：2 個 ADAPTER_HOLE 節點（夾爪自己的座標）', Array.isArray(fn) && fn.length === 2 && fn.every(n => n.holeLayer === 'ADAPTER_HOLE' && near(n.holeDiameterMm, 3.2)) && near(fn[0].x, base.x + 12, 1e-3));
}

// ---------- 3. 製作計畫：兩個平面 ----------
const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const plan = BP.buildPlan({ comps: S.comps, modules: S.modules, params: P, exportSettings: { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 }, cnc });
const part = n => plan.parts.find(p => p.name === n || p.name.startsWith(n + '_'));
console.log('parts:', plan.parts.map(p => `${p.name}@${p.plane || 'main'}:${p.layer}`).join(' '));
{
  check('每片板有 plane：四連桿 null、夾爪＝夾爪模組 id', part('frame').plane === null && part('LiftCrank').plane === null && part(`${G.id}-frame`).plane === G.id && part('GearA').plane === G.id);
  check('夾爪自己從第 0 層疊起：底板 0、齒輪 1、爪臂 2', part(`${G.id}-frame`).layer === 0 && part('GearA').layer === 1 && part('LeftJaw').layer === 2);
  check('夾爪底板有 2 個轉接座孔、ToolBrace 有 2 個', part(`${G.id}-frame`).holeLayers.ADAPTER_HOLE === 2 && part('ToolBrace').holeLayers.ADAPTER_HOLE === 2);
  const j = plan.joints.find(x => x.kind === 'adapter');
  check('關節：轉接座（kind adapter）連 ToolBrace 與夾爪底板', j && j.parts.includes(part('ToolBrace').name) && j.parts.includes(`${G.id}-frame`) && j.id === `ADP-${G.id}`);
  check('不同平面的零件不會被當成同一個關節（夾爪的點不跟四連桿的點合併）', plan.joints.every(x => x.kind === 'adapter' || new Set(x.parts.map(n => plan.parts.find(p => p.name === n).plane)).size === 1));
  const hw = BP.hardwareList(plan);
  console.log('hw:', hw.map(r => `${r.spec}×${r.qty}`).join(' '));
  check('五金：3D 列印轉接座 ×1', hw.some(r => /轉接座/.test(r.spec) && r.qty === 1));
  // 每翼 2 孔 × 2 翼 = 4 顆；長度＝板厚 3＋壁厚 4＋螺帽 4 = 11 → M3×12
  const s12 = hw.find(r => r.spec === 'M3×12');
  check('五金：轉接座螺絲 M3×12 ×4', s12 && s12.qty === 4 && /轉接座/.test(s12.note));
  const html = BP.buildPackHtml(plan, { title: 'T', cnc });
  check('製作包有「直角組裝」段落並提到 STL', /直角組裝/.test(html) && /STL/.test(html));
}
report('orthogonal-fab');
