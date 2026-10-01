// L5a（走通舉升＋夾取 第 5 包）：實體疊層與關節——零件清單、組裝說明、干涉檢查的共同基礎。
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

let BP = null;
try { BP = await import('../js/blocks/build-plan.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
check('build-plan.js 匯出 buildPlan', typeof BP?.buildPlan === 'function');
if (typeof BP?.buildPlan !== 'function') { report('build-plan'); process.exit(1); }

const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('rack-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
ed.mountTo(L.id, L.outputs[0].id);

const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const plan = BP.buildPlan({ comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 }, cnc });
const part = prefix => plan.parts.find(p => p.name === prefix || p.name.startsWith(prefix + '_'));
const names = plan.parts.map(p => p.name).sort();
console.log('parts:', plan.parts.map(p => `${p.name}@${p.layer}`).join(' '));

check('零件清單：8 片（主機架、夾爪底板、齒條、三顆齒輪、兩片爪臂），名稱與匯出檔名一致',
  plan.parts.length === 8 && ['frame', `${G.id}-frame`].every(n => names.includes(n)) &&
  ['LiftRackGear', 'LiftPinion', 'GearA', 'GearB', 'LeftJaw', 'RightJaw'].every(n => part(n)));
check('第 0 層：主機架', part('frame')?.layer === 0);
check('第 1 層：升降小齒輪與齒條（齒條與帶動它的小齒輪同層）', part('LiftPinion')?.layer === 1 && part('LiftRackGear')?.layer === 1);
check('第 2 層：夾爪底板（裝在齒條上 → 齒條層＋1）', part(`${G.id}-frame`)?.layer === 2);
check('第 3 層：夾爪兩齒輪', part('GearA')?.layer === 3 && part('GearB')?.layer === 3);
check('第 4 層：兩片爪臂（與齒輪共銷 → 往外一層）', part('LeftJaw')?.layer === 4 && part('RightJaw')?.layer === 4);
check('板厚：沒另外設定的零件都用 CNC 板厚 3 mm', plan.parts.every(p => p.thicknessMm === 3));

const joint = idPrefix => plan.joints.find(j => j.id === idPrefix || j.id.startsWith(idPrefix + '_'));
const has = (j, ...ps) => j && ps.every(n => j.parts.some(x => x === n || x.startsWith(n + '_')));
console.log('joints:', plan.joints.map(j => `${j.id}[${j.kind}](${j.parts.join('+')})${j.spanMm}`).join(' '));
check('導銷：LiftGuideA 的點穿過主機架與齒條長槽，kind guide-pin', has(joint('LGA'), 'frame', 'LiftRackGear') && joint('LGA').kind === 'guide-pin');
check('對鎖螺絲：LiftOutput、LiftOutputB 連接齒條與夾爪底板，kind mount-bolt', ['LiftOutput', 'LiftOutputB'].every(id => has(joint(id), 'LiftRackGear', `${G.id}-frame`) && joint(id).kind === 'mount-bolt'));
check('惰輪軸：GCB 連接夾爪底板與 GearB，kind pivot', has(joint('GCB'), `${G.id}-frame`, 'GearB') && joint('GCB').kind === 'pivot');
check('爪臂接齒輪：GPA 連接 GearA 與 LeftJaw', has(joint('GPA'), 'GearA', 'LeftJaw'));
check('關節的孔徑記錄（M3 → 3.2）', joint('GCB')?.holeDiameterMm === 3.2 && joint('LiftOutput')?.holeDiameterMm === 3.2);
check('關節總厚度 spanMm：相鄰兩層 → 6 mm', joint('GPA')?.spanMm === 6 && joint('LiftOutput')?.spanMm === 6 && joint('LGA')?.spanMm === 6);
// 爪臂的 p1 就是齒輪中心：惰輪軸 GCB 穿過 底板＋GearB＋RightJaw 三片 → 9 mm
check('惰輪軸穿三片板：底板＋GearB＋RightJaw，spanMm 9', has(joint('GCB'), `${G.id}-frame`, 'GearB', 'RightJaw') && joint('GCB')?.spanMm === 9);
check('每個關節的 layers 是跨越的最小～最大層', joint('GPA')?.layers?.join(',') === '3,4' && joint('LGA')?.layers?.join(',') === '0,1');

check('動力：一顆 TT（主機架）、一顆 MG995（夾爪底板）', plan.motors.length === 2 &&
  plan.motors.some(m => m.type === 'tt' && m.plate === 'frame') && plan.motors.some(m => m.type === 'mg995' && m.plate === `${G.id}-frame`));
check('純函式：不改 S.comps', S.comps.every(c => !('layer' in c)));
report('build-plan');
