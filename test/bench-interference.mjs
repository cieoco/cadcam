// B6（SDD-ASSEMBLY-BENCH §6）：組立台即時干涉——目前姿勢檢查（多顆馬達同時）、全行程時間軸、撞到的零件名單。
import { check, report } from './_harness.mjs';
class FE { constructor() { this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; } get firstChild() { return null; } appendChild(c) { return c; } removeChild(c) { return c; } addEventListener() {} setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } }
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FE()); return els.get(id); }, createElement: () => new FE() };
const IF = await import('../js/blocks/interference.js');
check('interference.js 匯出 interferenceTimeline／hitPartNames', typeof IF.interferenceTimeline === 'function' && typeof IF.hitPartNames === 'function');
if (typeof IF.interferenceTimeline !== 'function') { report('bench-interference'); process.exit(1); }
const BP = await import('../js/blocks/build-plan.js');
const B = await import('../js/blocks/bench.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1], P = S.topo.params;
const motor = { activeMotor: '1', theta: 0, motorAngles: {} };
const good = B.connect(S.comps, S.modules, G.id, { module: L.id, port: 'edge:ToolBrace_1:R' }, P, motor);
const side = B.benchAdjust(good.comps, good.modules, G.id, 'side', P);
const rev = B.benchAdjust(good.comps, good.modules, G.id, 'reverse', P);
const base = s => ({ comps: s.comps, modules: s.modules, params: P, exportSettings: { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 }, cnc: { toolDiameterMm: 3.175, stockThicknessMm: 3 } });
const ranges = { '1': { lo: -60, hi: 60 }, '2': { lo: 0, hi: 24 } };
const planOf = s => IF.resolveSpacers({ ...base(s), ranges, samplesPerMotor: 13 }).plan;
const has = (w, n) => w.some(x => x.parts.some(p => p.startsWith(n)));

// ---------- 1. 目前姿勢 ----------
{
  const gp = planOf(good);
  check('正確接法（工具架下緣）：目前姿勢 0°／0° 沒有干涉', IF.findInterference({ ...base(good), plan: gp, pose: { '1': 0, '2': 0 } }).length === 0);
  check('正確接法：升降 −45°、夾爪 20° 同時（多顆馬達一起）也沒有干涉', IF.findInterference({ ...base(good), plan: gp, pose: { '1': -45, '2': 20 } }).length === 0);
  const ws = IF.findInterference({ ...base(side), plan: planOf(side), pose: { '1': 0, '2': 0 } });
  check('換到上緣：夾爪撞到工具架的前桿與斜撐（cross-plane）', has(ws, 'ToolFront') && has(ws, 'ToolDiag') && ws.every(x => x.motor === null || typeof x.motor === 'string'));
  const rp = planOf(rev);
  check('掉頭（爪朝後）：升降 30° 撞到曲柄', has(IF.findInterference({ ...base(rev), plan: rp, pose: { '1': 30, '2': 0 } }), 'LiftCrank'));
  check('掉頭：升降 −30° 還沒撞到曲柄', !has(IF.findInterference({ ...base(rev), plan: rp, pose: { '1': -30, '2': 0 } }), 'LiftCrank'));
  check('pose 給了就只檢查那一個姿勢（回報的角度＝該姿勢）', IF.findInterference({ ...base(rev), plan: rp, pose: { '1': 30, '2': 0 } }).every(x => x.pose && x.pose['1'] === 30));
}

// ---------- 2. 全行程時間軸 ----------
{
  const rp = planOf(rev);
  const t0 = Date.now();
  const tl = IF.interferenceTimeline({ ...base(rev), plan: rp, ranges, stepDeg: 10 });
  const ms = Date.now() - t0;
  console.log('timeline ms', ms, Object.entries(tl.motors).map(([m, a]) => `${m}:` + a.map(e => `${e.angleDeg}${e.findings.length ? '!' : ''}`).join(',')).join(' | '));
  check('時間軸：每顆馬達一列，角度 lo～hi 每 10° 一格（含兩端）', tl.motors['1'].length === 13 && tl.motors['1'][0].angleDeg === -60 && tl.motors['1'][12].angleDeg === 60 &&
    tl.motors['2'].map(e => e.angleDeg).join(',') === '0,10,20,24');
  const crankAt = tl.motors['1'].filter(e => has(e.findings, 'LiftCrank')).map(e => e.angleDeg);
  check('掉頭：曲柄干涉落在升降正角度那段（10°～60°）', crankAt.length > 0 && Math.min(...crankAt) >= 0 && crankAt.includes(60));
  check('全行程時間軸夠快（< 3 秒）', ms < 3000);
  const gt = IF.interferenceTimeline({ ...base(good), plan: planOf(good), ranges, stepDeg: 10 });
  check('正確接法：時間軸全部沒有干涉', Object.values(gt.motors).every(a => a.every(e => e.findings.length === 0)));
  check('hitPartNames：撞到的零件名稱（不重複）', (() => { const n = IF.hitPartNames(tl.motors['1'].flatMap(e => e.findings)); return Array.isArray(n) && n.includes(`${G.id}-frame`) && n.some(x => x.startsWith('LiftCrank')) && new Set(n).size === n.length; })());
}
// ---------- 3. 伺服負角度存檔不被夾成 0（復原／存檔後升降行程不可只剩一半） ----------
{
  const Sch = await import('../js/blocks/schema.js');
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: good.comps, modules: good.modules, params: P })));
  const crank = n.comps.find(c => c.isInput && c.type === 'bar');
  check('存檔往返：四連桿曲柄 MG995 −60～60° 保留負角度', crank && crank.servoStart === -60 && crank.servoEnd === 60);
}
report('bench-interference');
