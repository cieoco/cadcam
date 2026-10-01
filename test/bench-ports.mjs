// B1–B2（SDD-ASSEMBLY-BENCH §4、§5）：組立台的接口模型與連接調整（純函式）。
// 接口：輸出端（同平面對鎖）＋每根桿的兩條邊（直角）。調整：換邊、掉頭、轉 90°、沿邊 5 mm、直角↔同平面。
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

let B = null;
try { B = await import('../js/blocks/bench.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
const fns = ['autoPorts', 'canConnect', 'connect', 'benchAdjust', 'toggleAngle'];
check(`bench.js 匯出 ${fns.join('／')}`, fns.every(f => typeof B?.[f] === 'function'));
if (!fns.every(f => typeof B?.[f] === 'function')) { report('bench-ports'); process.exit(1); }
const Asm = await import('../js/blocks/assembly.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const Sch = await import('../js/blocks/schema.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');

S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
const P = S.topo.params;
const motor = { activeMotor: '1', theta: 0, motorAngles: {} };
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t;
const clone = v => JSON.parse(JSON.stringify(v));
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const upright = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('LiftUpright'));
const solve = (comps, modules) => Asm.solveAssembly(Asm.compileAssembly(comps, modules, { params: P }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });

// ---------- 1. 自動接口 ----------
const ports = B.autoPorts(S.comps, S.modules, L.id, P);
console.log('ports:', ports.map(p => `${p.id}[${p.kind}${p.suggested ? '*' : ''}] ${p.name}`).join(' | '));
{
  check('輸出端「工具架」→ 同平面對鎖接口（bolt，建議）', ports.some(p => p.kind === 'bolt' && p.output === 'tool' && p.suggested));
  const bars = S.comps.filter(c => c.moduleId === L.id && c.type === 'bar');
  check('每根桿兩條邊各一個 edge 接口', bars.every(b => ports.filter(p => p.kind === 'edge' && p.body.id === b.id).length === 2));
  const bottom = ports.find(p => p.kind === 'edge' && p.body.id === brace.id && p.side === -1);
  check('工具架下緣：side -1、名稱含「下緣」、建議、長度＝桿長 80', bottom && /下緣/.test(bottom.name) && bottom.suggested && near(bottom.lengthMm, 80));
  const top = ports.find(p => p.kind === 'edge' && p.body.id === brace.id && p.side === 1);
  check('工具架上緣：名稱含「上緣」，不是建議的那一邊', top && /上緣/.test(top.name) && !top.suggested);
  const up = ports.filter(p => p.kind === 'edge' && p.body.id === upright.id).map(p => p.name).join(',');
  check('直立的桿用「左緣／右緣」', /左緣/.test(up) && /右緣/.test(up));
  check('接口 id 唯一', new Set(ports.map(p => p.id)).size === ports.length);
  check('不列出別的模組的零件', ports.every(p => p.kind !== 'edge' || S.comps.find(c => c.id === p.body.id).moduleId === L.id));
}

// ---------- 2. 相容性 ----------
const bottomPort = ports.find(p => p.kind === 'edge' && p.body.id === brace.id && p.side === -1);
{
  check('夾爪接到工具架下緣：可以', B.canConnect(S.comps, S.modules, G.id, { module: L.id, port: bottomPort.id }, P).ok === true);
  const self = B.canConnect(S.comps, S.modules, L.id, { module: L.id, port: bottomPort.id }, P);
  check('接到自己：不行，白話原因', self.ok === false && /自己/.test(self.reason));
  const tinyParams = { ...P, [upright.lenParam]: 12 };
  const upPort = B.autoPorts(S.comps, S.modules, L.id, tinyParams).find(p => p.kind === 'edge' && p.body.id === upright.id);
  const short = B.canConnect(S.comps, S.modules, G.id, { module: L.id, port: upPort.id }, tinyParams);
  check('邊太短（12 mm < 轉接座 20 mm）：不行，原因含長度', short.ok === false && /12/.test(short.reason) && /20/.test(short.reason));
  check('找不到接口：不行', B.canConnect(S.comps, S.modules, G.id, { module: L.id, port: 'nope' }, P).ok === false);
}

// ---------- 3. 接上（任一根桿的邊都能直角安裝） ----------
let cur = { comps: S.comps, modules: S.modules };
{
  const before = JSON.stringify(cur.comps);
  const r = B.connect(cur.comps, cur.modules, G.id, { module: L.id, port: bottomPort.id }, P, motor);
  check('connect 到工具架下緣：ok、直角、零件不動', r.ok && r.modules.find(m => m.id === G.id).mount.orient?.type === 'orthogonal' && JSON.stringify(r.comps) === before);
  const m = r.modules.find(x => x.id === G.id).mount;
  check('mount.to 記 body 與 side（不必是輸出端）', m.to.module === L.id && m.to.body === brace.id && m.orient.side === -1);
  const f = Asm.orthogonalFrame(r.comps, r.modules, G.id, solve(r.comps, r.modules).points);
  check('位姿與舊的「工具架輸出端」直角安裝一致（d=(1,0,0)、m=(0,-1,0)）', f && near(f.d.x, 1) && near(f.m.y, -1));
  const n = Sch.normalizeSnapshot(clone({ kind: 'blocks', v: 1, comps: r.comps, modules: r.modules, params: P }));
  check('存檔往返保留 to.body', n.modules.find(x => x.id === G.id).mount?.to?.body === brace.id);
  // 接到不是輸出端的桿（立桿右緣）
  const upR = ports.find(p => p.kind === 'edge' && p.body.id === upright.id && /右緣/.test(p.name));
  const r2 = B.connect(cur.comps, cur.modules, G.id, { module: L.id, port: upR.id }, P, motor);
  check('也能接到非輸出端的桿（立桿右緣）', r2.ok && r2.modules.find(x => x.id === G.id).mount.to.body === upright.id);
  const f2 = Asm.orthogonalFrame(r2.comps, r2.modules, G.id, solve(r2.comps, r2.modules).points);
  check('立桿右緣：d 沿立桿（垂直）、m 朝右', f2 && near(Math.abs(f2.d.y), 1, 1e-6) && f2.m.x > 0.99);
  cur = { comps: r.comps, modules: r.modules };
}

// ---------- 4. 一鍵調整 ----------
const frameOf = st => Asm.orthogonalFrame(st.comps, st.modules, G.id, solve(st.comps, st.modules).points);
const orientOf = st => st.modules.find(x => x.id === G.id).mount.orient;
{
  const f0 = frameOf(cur), o0 = orientOf(cur);
  const s1 = B.benchAdjust(cur.comps, cur.modules, G.id, 'slide+', P);
  check('沿邊 +5 mm：offsetMm 5、origin 沿 d 移 5', s1.ok && orientOf(s1).offsetMm === 5 && near(frameOf(s1).origin.x - f0.origin.x, 5) && near(frameOf(s1).origin.y, f0.origin.y));
  const a = OJ.adapterLayout(s1.comps, s1.modules, G.id, P, { stockMm: 3 }), a0 = OJ.adapterLayout(cur.comps, cur.modules, G.id, P, { stockMm: 3 });
  check('轉接座孔位跟著滑 5 mm', near(a.hostHoles[0].u - a0.hostHoles[0].u, 5));
  let st = cur;
  for (let i = 0; i < 20; i++) st = B.benchAdjust(st.comps, st.modules, G.id, 'slide+', P);
  check('滑到底會停：轉接座不超出桿端（offset ≤ 桿長/2 − 20）', orientOf(st).offsetMm <= 40 - 20 + 1e-9);
  const back = B.benchAdjust(s1.comps, s1.modules, G.id, 'slide-', P);
  check('沿邊 −5 mm 回到 0（offsetMm 為 0 時不寫入欄位）', back.ok && !('offsetMm' in orientOf(back)));
  const rev = B.benchAdjust(cur.comps, cur.modules, G.id, 'reverse', P);
  check('掉頭：childAxisDeg +180', rev.ok && near(Math.cos((orientOf(rev).childAxisDeg - o0.childAxisDeg) * Math.PI / 180), -1, 1e-9) && orientOf(rev).childAxisDeg > -180 && orientOf(rev).childAxisDeg <= 180);
  const rot = B.benchAdjust(cur.comps, cur.modules, G.id, 'rotate', P);
  check('轉 90°：childAxisDeg +90', rot.ok && near(Math.cos((orientOf(rot).childAxisDeg - o0.childAxisDeg - 90) * Math.PI / 180), 1, 1e-9));
  const sd = B.benchAdjust(cur.comps, cur.modules, G.id, 'side', P);
  check('換邊：side 變 +1、origin 移到上緣（往上一個板寬 18）', sd.ok && orientOf(sd).side === 1 && near(frameOf(sd).origin.y - f0.origin.y, 18));
  check('調整不改零件', [s1, rev, rot, sd].every(r => JSON.stringify(r.comps) === JSON.stringify(cur.comps)));
  const bad = B.benchAdjust(cur.comps, cur.modules, L.id, 'side', P);
  check('沒有直角安裝的模組：調整失敗並說明', bad.ok === false && typeof bad.reason === 'string');
}

// ---------- 5. 直角 ↔ 同平面 ----------
{
  const viaOutput = B.connect(S.comps, S.modules, G.id, { module: L.id, port: ports.find(p => p.kind === 'bolt' && p.output === 'tool').id }, P, motor);
  check('接到 bolt 接口＝同平面安裝（沒有 orient）', viaOutput.ok && viaOutput.modules.find(x => x.id === G.id).mount && !viaOutput.modules.find(x => x.id === G.id).mount.orient);
  const t1 = B.toggleAngle(cur.comps, cur.modules, G.id, P, motor);
  check('直角 → 同平面（工具架是輸出端，可對鎖）', t1.ok && !t1.modules.find(x => x.id === G.id).mount.orient && t1.modules.find(x => x.id === G.id).mount.to.output === 'tool');
  const t2 = B.toggleAngle(t1.comps, t1.modules, G.id, P, motor);
  check('同平面 → 直角（回到工具架下緣）', t2.ok && t2.modules.find(x => x.id === G.id).mount.orient?.type === 'orthogonal' && t2.modules.find(x => x.id === G.id).mount.to.body === brace.id);
  const upR = ports.find(p => p.kind === 'edge' && p.body.id === upright.id && /右緣/.test(p.name));
  const onUp = B.connect(S.comps, S.modules, G.id, { module: L.id, port: upR.id }, P, motor);
  const t3 = B.toggleAngle(onUp.comps, onUp.modules, G.id, P, motor);
  check('裝在非輸出端的桿：不能轉成同平面，白話原因', t3.ok === false && /輸出端/.test(t3.reason));
}
report('bench-ports');
