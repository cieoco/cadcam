// O5（SDD-ORTHOGONAL-MOUNT §5）：隔圈分平面記錄；直角子模組以側影帶（含它在宿主法向的厚度範圍）檢查宿主平面的零件。
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

const BP = await import('../js/blocks/build-plan.js');
const IF = await import('../js/blocks/interference.js');
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');

// ---------- 1. 隔圈分平面 ----------
{
  const n = BP.normalizeSpacers([{ below: 1, mm: 3 }, { plane: 'G', below: 1, mm: 3 }, { plane: 'G', below: 1, mm: 5 }, { plane: null, below: 2, mm: 3 }]);
  check('normalizeSpacers：依（平面, below）合併；主平面不帶 plane 欄位；主平面排前面',
    JSON.stringify(n) === JSON.stringify([{ below: 1, mm: 3 }, { below: 2, mm: 3 }, { plane: 'G', below: 1, mm: 5 }]));
}

S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q, setViewPlane: q });
ed.insertBuiltin('fourbar-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
ed.mountOrthogonalTo(L.id, 'tool');
const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };
const base = { comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc };
const part = (plan, n) => plan.parts.find(p => p.name === n || p.name.startsWith(n + '_'));
{
  const p0 = BP.buildPlan(base);
  const p1 = BP.buildPlan({ ...base, spacers: [{ plane: G.id, below: 1, mm: 3 }] });
  check('夾爪平面的隔圈只墊高夾爪的板（齒輪 zMm +3），四連桿不動',
    part(p1, 'GearA').zMm === part(p0, 'GearA').zMm + 3 && part(p1, 'LiftUpright').zMm === part(p0, 'LiftUpright').zMm && part(p1, 'LiftCrank').zMm === part(p0, 'LiftCrank').zMm);
  check('plan.gaps 帶 plane', JSON.stringify(p1.gaps) === JSON.stringify([{ plane: G.id, below: 1, mm: 3 }]));
  const html = BP.buildPackHtml(p1, { title: 'T', cnc, modules: S.modules });
  check('製作包的層間隔圈寫出是哪個平面（齒輪夾爪）', /齒輪夾爪[^<]{0,12}第 0、1 層之間/.test(html) || /第 0、1 層之間[^<]{0,40}齒輪夾爪/.test(html));
}
{
  const ranges = { '1': { lo: -60, hi: 60 }, '2': { lo: 0, hi: 24 } };
  const r = IF.resolveSpacers({ ...base, ranges, samplesPerMotor: 5 });
  console.log('pilot gaps:', JSON.stringify(r.plan.gaps));
  console.log('pilot interference:', r.interference.map(x => `[${x.kind}] ${x.message}`).join(' | '));
  check('螺絲頭干涉的 fix 帶 plane：夾爪平面的隔圈記在夾爪平面', r.plan.gaps.every(g => g.plane === undefined || g.plane === G.id));
  check('沒有跨平面的「同層／螺絲頭」誤報（兩個平面的零件不互比）', r.interference.every(x => x.kind === 'cross-plane' || new Set(x.parts.map(n => (part(r.plan, n) || {}).plane ?? null)).size === 1));
}

// ---------- 2. 跨平面：夾爪側影帶 vs 宿主零件 ----------
const obstacle = (y, x1, x2) => ({ type: 'bar', id: 'Obst', p1: { id: 'OB1', type: 'fixed', x: x1, y }, p2: { id: 'OB2', type: 'fixed', x: x2, y }, lenParam: 'OBL', color: '#888' });
{
  const ranges = { '1': { lo: -60, hi: 60 }, '2': { lo: 0, hi: 24 } };
  // 障礙桿放在工具架下緣正下方、夾爪往前伸的範圍內（依插入後實際位置計算，四連桿插入時可能被挪開）
  const br = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
  const ox = (br.p1.x + br.p2.x) / 2, edgeY = (br.p1.y + br.p2.y) / 2 - 9;
  const near = [...S.comps, obstacle(edgeY - 5, ox + 30, ox + 80)];
  const params = { ...S.topo.params, OBL: 50 };
  const plan = BP.buildPlan({ ...base, comps: near, params });
  const w = IF.findInterference({ ...base, comps: near, params, plan, ranges, samplesPerMotor: 5 });
  const hit = w.find(x => x.kind === 'cross-plane' && x.parts.some(n => n.startsWith('Obst')));
  console.log('cross-plane:', hit && hit.message);
  check('工具架正下方的障礙桿：報 cross-plane 干涉', !!hit);
  check('cross-plane 項目：parts 含夾爪底板與障礙桿、帶馬達與角度、中文說明含模組名稱', hit && hit.parts.includes(`${G.id}-frame`) &&
    (hit.motor === null || typeof hit.motor === 'string') && Number.isFinite(hit.angleDeg) && /齒輪夾爪/.test(hit.message) && /Obst/.test(hit.message));
  check('夾爪鎖住的宿主桿（ToolBrace）不算干涉', !w.some(x => x.kind === 'cross-plane' && x.parts.some(n => n.startsWith('ToolBrace'))));
  const far = [...S.comps, obstacle(edgeY - 5, ox + 400, ox + 450)];
  const plan2 = BP.buildPlan({ ...base, comps: far, params });
  const w2 = IF.findInterference({ ...base, comps: far, params, plan: plan2, ranges, samplesPerMotor: 5 });
  check('遠處的障礙桿：不報', !w2.some(x => x.kind === 'cross-plane' && x.parts.some(n => n.startsWith('Obst'))));
}
// ---------- 3. 連續求解：取樣姿態不可跳到交叉分支 ----------
{
  const plan = BP.buildPlan(base);
  const w = IF.findInterference({ ...base, plan, ranges: { '1': { lo: -60, hi: 60 }, '2': { lo: 0, hi: 24 } }, samplesPerMotor: 13 });
  check('平行四連桿全行程取樣：曲柄與從動臂不會被誤判互撞（沿行程連續求解）', !w.some(x => x.kind === 'same-layer' && x.parts.some(n => n.startsWith('LiftCrank')) && x.parts.some(n => n.startsWith('LiftFollower'))));
  const r = IF.resolveSpacers({ ...base, ranges: { '1': { lo: -60, hi: 60 }, '2': { lo: 0, hi: 24 } }, samplesPerMotor: 13 });
  check('四連桿（臂長 140）＋直角夾爪：−60～60° 干涉 0 項', r.interference.length === 0);
}
report('orthogonal-interference');
