// 多馬達（雙動力來源）驗收：
// 1) 騎乘馬達放置：放在「未接地的共用節點」上不落地、分配新編號（'2'）。
// 2) 求解：競賽升降臂 + 騎在綠色立桿上的第二顆馬達 → 兩軸各自獨立、每組 (θ1,θ2) 唯一解。
// 3) sweepTopology 的 sweepMotor：掃 M2 時 M1 凍結不動。
// 4) activateMotor 換手：舊馬達角度凍結、新馬達接手，再換回來角度不遺失。
// 5) schema 快照往返：activeMotor / motorAngles / physicalMotor '2' 都保留。
import { check, report } from './_harness.mjs';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology, sweepTopology } from '../js/multilink/solver.js';

class FakeElement {
  constructor() { this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.classList = { toggle() {} }; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
}
const els = new Map();
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: () => new FakeElement()
};

const { S, activateMotor, usedMotorIds, nextMotorId } = await import('../js/blocks/state.js');
const Model = await import('../js/blocks/model.js');
const Schema = await import('../js/blocks/schema.js');
const { createMotorTools } = await import('../js/blocks/motor-tools.js');

const pt = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });
const bar = (id, p1, p2, lenParam, extra = {}) => ({ type: 'bar', id, color: '#3498db', p1, p2, lenParam, fixedLen: true, isInput: false, ...extra });

// 競賽升降臂（單馬達版）：平行四連桿 O1-A-B-O2 + 前端工具矩形 A-B-C-D
function buildLift() {
  return [
    { type: 'anchor', id: 'Anchor1', p1: pt('O1', 'fixed', -96, 0) },
    { type: 'anchor', id: 'Anchor2', p1: pt('O2', 'fixed', -96, 72) },
    bar('LiftCrank', pt('O1', 'fixed', -96, 0, { physicalMotor: '1' }), pt('A', 'floating', -48, 0), 'LIFT_ARM',
      { isInput: true, physicalMotor: '1', phaseOffset: 0, color: '#e74c3c' }),
    bar('LiftFollower', pt('O2', 'fixed', -96, 72), pt('B', 'floating', -48, 72), 'LIFT_ARM_2'),
    bar('LiftUpright', pt('A', 'floating', -48, 0), pt('B', 'floating', -48, 72), 'LIFT_UPRIGHT', { color: '#27ae60' }),
    bar('ToolPlate', pt('B', 'floating', -48, 72), pt('C', 'floating', 0, 72), 'LIFT_TOOL_TOP', { color: '#f39c12' }),
    bar('ToolBrace', pt('A', 'floating', -48, 0), pt('D', 'floating', 0, 0), 'LIFT_TOOL_BOTTOM', { color: '#f39c12' }),
    bar('ToolFront', pt('D', 'floating', 0, 0), pt('C', 'floating', 0, 72), 'LIFT_TOOL_FRONT', { color: '#f39c12' })
  ];
}
const LIFT_PARAMS = { LIFT_ARM: 48, LIFT_ARM_2: 48, LIFT_UPRIGHT: 72, LIFT_TOOL_TOP: 48, LIFT_TOOL_BOTTOM: 48, LIFT_TOOL_FRONT: 72, theta: 0 };

// ---- 1) 騎乘馬達放置 ----
S.comps = buildLift();
S.topo = { params: { ...LIFT_PARAMS }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
const noop = () => {};
const motorTools = createMotorTools({
  svg: { style: {} }, pushUndo: noop, pause: noop, rebuild: noop, draw: noop,
  setBanner: noop, clearBanner: noop, promptText: d => d, exitDrawTools: noop, deselectLink: noop,
  openMobileEditPanel: noop, updateRoleEditor: noop,
  barsAtNode: id => Model.barsAtNode(S.comps, id),
  pointIsGround: id => Model.pointIsGround(S.comps, id),
  pointUseCount: id => Model.pointUseCount(S.comps, id),
  freezePointAtDisplay: noop,
  setPointType: (id, type) => Model.setPointType(S.comps, id, type),
  gearById: () => null, gearMeshChain: () => [], selectGear: noop, rackPinionThetaRange: () => null,
  sliderProjectedDistance: () => 0, railLength: () => 0, sliderTravelStart: () => 0, sliderTravelEnd: () => 0
});
check('放第一顆馬達前：編號分配從既有零件推得', usedMotorIds().has('1') && nextMotorId() === '2');
motorTools.driveBarAt('ToolPlate', 'B');   // 第二顆 TT 放在 B（綠桿上的共用節點）驅動 ToolPlate
check('騎乘馬達：B 還有兩根桿可當機架 → 進入選機架桿階段',
  S.pickBars && S.pickBars.stage === 'carrier' && S.pickBars.drivenId === 'ToolPlate' &&
  JSON.stringify(S.pickBars.ids.slice().sort()) === JSON.stringify(['LiftFollower', 'LiftUpright']));
motorTools.tryPickBar('LiftUpright');      // 馬達殼鎖在綠色立桿上：綠桿＝這顆馬達的機架
const toolPlate = S.comps.find(c => c.id === 'ToolPlate');
check('騎乘馬達：共用節點不落地（B 仍為 floating）', toolPlate.p1.type === 'floating');
check('騎乘馬達：分配新編號 2 且成為輸入', toolPlate.physicalMotor === '2' && toolPlate.p1.physicalMotor === '2' && toolPlate.isInput === true);
check('騎乘馬達：機架桿記為綠桿', toolPlate.motorCarrier === 'LiftUpright');
check('騎乘馬達：控制權切給馬達 2、馬達 1 角度凍結', S.activeMotor === '2' && S.theta === 0 && S.motorAngles['1'] === 0);
check('騎乘馬達：相位＝相對機架桿的夾角（B→C 0° − 綠桿 90° = −90°）', Math.abs(toolPlate.phaseOffset - (-90)) < 1e-9);

// ---- 2) 兩軸獨立求解 ----
const topo = { params: { ...LIFT_PARAMS } };
const compiled = compileTopology(S.comps, topo, new Set());
const solveAt = (m1, m2) => solveTopology(compiled, { thetaDeg: 0, motorAngles: { '1': m1, '2': m2 } });
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
{
  const sol = solveAt(60, 0);
  const { A, B, C, D } = sol.points;
  check('M1=60 M2=0：升降臂抬升（B 跟著上升）', sol.isValid && Math.abs(B.y - 113.6) < 0.5 && Math.abs(B.x - (-72)) < 0.5);
  check('M1=60 M2=0：工具架姿態保持（B→C 維持水平）', Math.abs((C.y - B.y)) < 1e-6 && Math.abs((C.x - B.x) - 48) < 1e-6);
  check('M1=60 M2=0：桿長全部守恆', Math.abs(dist(A, B) - 72) < 1e-6 && Math.abs(dist(A, D) - 48) < 1e-6 && Math.abs(dist(D, C) - 72) < 1e-6);
}
{
  const sol = solveAt(60, 45);
  const { A, B, C, D } = sol.points;
  const expC = { x: B.x + 48 * Math.cos(Math.PI / 4), y: B.y + 48 * Math.sin(Math.PI / 4) };
  check('M1=60 M2=45：工具架繞 B 轉 45°（C 唯一確定）', sol.isValid && dist(C, expC) < 1e-6);
  check('M1=60 M2=45：D 由 dyad 唯一解出且桿長守恆', Math.abs(dist(A, D) - 48) < 1e-6 && Math.abs(dist(D, C) - 72) < 1e-6);
}

// ---- 3) sweepMotor：掃 M2 時 M1 凍結 ----
{
  const sweep = sweepTopology({ ...compiled, tracePoint: 'C' }, { ...topo.params, motorAngles: { '1': 60 }, sweepMotor: '2' }, 0, 90, 15);
  const aPositions = sweep.results.filter(r => r.isValid).map(r => r.points.A);
  const aMoved = aPositions.some(p => dist(p, aPositions[0]) > 1e-6);
  const cMoved = sweep.results.filter(r => r.isValid).map(r => r.points.C).some((p, _, arr) => dist(p, arr[0]) > 1);
  check('sweepMotor=2：M1 凍結（A 不動）、M2 掃動（C 移動）', !aMoved && cMoved && sweep.results.every(r => r.isValid));
}

// ---- 3.5) 旋轉機架桿：2R 手臂（肘部馬達殼鎖在會轉的大臂上）----
// 相對機架桿語意的關鍵驗證：M2 凍結時，肘關節夾角固定，小臂跟著大臂一起轉；
// 絕對角語意在這裡會錯（小臂停在世界角度不跟著大臂走）。
{
  const armComps = [
    { type: 'anchor', id: 'ArmBase', p1: pt('O', 'fixed', 0, 0) },
    bar('Arm1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('E', 'floating', 48, 0), 'ARM1',
      { isInput: true, physicalMotor: '1', phaseOffset: 0 }),
    bar('Arm2', pt('E', 'floating', 48, 0, { physicalMotor: '2' }), pt('F', 'floating', 96, 0), 'ARM2',
      { isInput: true, physicalMotor: '2', motorCarrier: 'Arm1', phaseOffset: 0 })
  ];
  const armCompiled = compileTopology(armComps, { params: { ARM1: 48, ARM2: 48, theta: 0 } }, new Set());
  const at = (m1, m2) => solveTopology(armCompiled, { thetaDeg: 0, motorAngles: { '1': m1, '2': m2 } }).points;
  {
    const p = at(30, 0);
    const expE = { x: 48 * Math.cos(Math.PI / 6), y: 48 * Math.sin(Math.PI / 6) };
    const expF = { x: 96 * Math.cos(Math.PI / 6), y: 96 * Math.sin(Math.PI / 6) };
    check('2R 手臂 M1=30 M2=0：肘角凍結，小臂跟著大臂轉（F 與 O、E 共線）',
      dist(p.E, expE) < 1e-6 && dist(p.F, expF) < 1e-6);
  }
  {
    const p = at(30, 45);
    const expF = { x: p.E.x + 48 * Math.cos(Math.PI * 75 / 180), y: p.E.y + 48 * Math.sin(Math.PI * 75 / 180) };
    check('2R 手臂 M1=30 M2=45：小臂角＝大臂 30° + 肘角 45°', dist(p.F, expF) < 1e-6);
  }
}

// ---- 4) activateMotor 換手 ----
S.activeMotor = '2'; S.theta = 45; S.motorAngles = { '1': 60 };
activateMotor('1', S.motorAngles['1']);
check('換手到馬達 1：接手凍結角 60、馬達 2 凍結在 45', S.activeMotor === '1' && S.theta === 60 && S.motorAngles['2'] === 45 && S.motorAngles['1'] === undefined);
activateMotor('2', S.motorAngles['2']);
check('換回馬達 2：角度不遺失', S.activeMotor === '2' && S.theta === 45 && S.motorAngles['1'] === 60);

// ---- 5) schema 快照往返 ----
{
  const snap = Schema.toSnapshot(S.comps, { params: topo.params }, 8, { activeMotor: S.activeMotor, motorAngles: { '1': 60 } });
  check('toSnapshot：保留 activeMotor 與凍結角', snap.activeMotor === '2' && snap.motorAngles && snap.motorAngles['1'] === 60);
  const norm = Schema.normalizeSnapshot(JSON.parse(JSON.stringify(snap)));
  const nToolPlate = norm.comps.find(c => c.id === 'ToolPlate');
  check('normalizeSnapshot：騎乘馬達桿保留編號 2 與 floating 節點',
    norm.activeMotor === '2' && norm.motorAngles['1'] === 60 &&
    nToolPlate.physicalMotor === '2' && nToolPlate.p1.physicalMotor === '2' && nToolPlate.p1.type === 'floating');
  check('normalizeSnapshot：機架桿（motorCarrier）與相對相位保留',
    nToolPlate.motorCarrier === 'LiftUpright' && Math.abs(nToolPlate.phaseOffset - (-90)) < 1e-9);
}

report('blocks-multimotor');
