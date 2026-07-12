// 節點角色域（node-editor.js）驗收：角色切換、X/Y 微調（LEGO 吸附）、拆馬達、
// 分離合併點、軌跡點兩點量測循環、量測基準防呆、固定點位置鎖。
import { check, report } from './_harness.mjs';

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

const { S } = await import('../js/blocks/state.js');
const Model = await import('../js/blocks/model.js');
const Panels = await import('../js/blocks/panels.js');
const { createNodeEditor } = await import('../js/blocks/node-editor.js');

const noop = () => {};
let banner = '', toast = '', invalidated = 0;
Panels.init({
  pointCoords: () => Model.pointCoords(S.comps), sliderMountInfo: () => null,
  roleLabel: () => '', triParamFor: () => '', hasPoint: id => Model.hasPoint(S.comps, id),
  motorBarForCenter: () => null, pointUseCount: () => 0,
  pointIsGround: id => Model.pointIsGround(S.comps, id), isGroundPositionUnlocked: () => false
});
const editor = createNodeEditor({
  pushUndo: noop, pause: noop, rebuild: noop, draw: noop,
  setBanner: t => { banner = t; }, transient: t => { toast = t; }, scheduleAutosave: noop,
  hasPoint: id => Model.hasPoint(S.comps, id),
  pointCoords: () => Model.pointCoords(S.comps),
  pointIsGround: id => Model.pointIsGround(S.comps, id),
  updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y),
  snapFramePoint: p => p,
  sliderMountInfo: () => null,
  removeMotorAtPoint: id => Model.removeMotorAtPoint(S.comps, id),
  removeAnchorsAtPoint: id => { S.comps = Model.removeAnchorsAtPoint(S.comps, id); },
  setPointType: (id, type) => Model.setPointType(S.comps, id, type),
  freezePointAtDisplay: noop,
  pointRefs: id => Model.pointRefs(S.comps, id),
  motorBarForCenter: id => S.comps.find(c => c.type === 'bar' && c.isInput &&
    ((c.p1?.id === id && c.p1.physicalMotor) || (c.p2?.id === id && c.p2.physicalMotor))) || null,
  sliderTravelStart: () => 0, sliderTravelEnd: c => Number(c.travelEnd) || 100,
  railLength: () => 100, normalizeSliderRange: noop,
  traceIds: () => {
    const raw = Array.isArray(S.topo.tracePoints) ? S.topo.tracePoints : [];
    return [...raw];
  },
  invalidateTrajectory: () => { invalidated++; }
});

// 兩根桿共用中間接點 N2：N1-(Bar1)-N2、N2-(Bar2)-N3
const mk = (id, x, y, type = 'floating') => ({ id, type, x, y });
S.comps = [
  { type: 'bar', id: 'Bar1', lenParam: 'L1', fixedLen: true, p1: mk('N1', 0, 0, 'fixed'), p2: mk('N2', 80, 0) },
  { type: 'bar', id: 'Bar2', lenParam: 'L2', fixedLen: true, p1: mk('N2', 80, 0), p2: mk('N3', 160, 0) }
];
S.topo.params = { theta: 0, L1: 80, L2: 80 };
S.counter = 3;

// ---- 角色切換 ----
S.selectedNodeId = 'N2';
editor.setNodeRole('fixed');
check('接點設為固定（所有共用副本一起改）', S.comps[0].p2.type === 'fixed' && S.comps[1].p1.type === 'fixed');
editor.setNodeRole('floating');
check('接點回自由', S.comps[0].p2.type === 'floating');

// ---- X/Y 微調與 LEGO 吸附 ----
editor.changeNodePos('x', 4);
check('X +4mm（未鎖 LEGO 時任意步進）', S.comps[0].p2.x === 84 && S.comps[1].p1.x === 84);
S.lockFrameHoles = true;
editor.setNodeRole('fixed');
editor.changeNodePos('x', 1);
check('鎖 LEGO 時固定點步進 = 8mm', S.comps[0].p2.x === 92);
S.lockFrameHoles = false;

// ---- 軌跡點：一點 → 兩點 → 第三點重新開始 ----
S.topo.tracePoints = [];
editor.toggleTracePoint();                        // N2 為第一點
check('第一個軌跡點', JSON.stringify(S.topo.tracePoints) === '["N2"]' && invalidated === 1);
S.selectedNodeId = 'N3';
editor.toggleTracePoint();                        // N3 為第二點（夾持量測）
check('第二個軌跡點（兩點量測）', JSON.stringify(S.topo.tracePoints) === '["N2","N3"]');
S.selectedNodeId = 'N1';
editor.toggleTracePoint();                        // 第三點：重新開始
check('第三點重新開始量測', JSON.stringify(S.topo.tracePoints) === '["N1"]');

// ---- 量測基準：必須接地 ----
S.selectedNodeId = 'N3';
editor.toggleMeasurementReference();
check('自由點不能當量測基準', S.topo.referencePoint === '' && toast.includes('固定於機架'));
S.selectedNodeId = 'N1';
editor.toggleMeasurementReference();
check('接地點可設量測基準', S.topo.referencePoint === 'N1');

// ---- 位置鎖 ----
editor.toggleGroundPositionLock();
check('固定點解鎖一次性拖曳', editor.isGroundPositionUnlocked('N1') === true);
editor.relockGroundPosition('N1');
check('放開後自動回鎖', editor.isGroundPositionUnlocked('N1') === false);

// ---- 分離合併點 ----
S.selectedNodeId = 'N2';
editor.splitNode();
check('分離後兩桿端點各自獨立', S.comps[0].p2.id !== S.comps[1].p1.id && S.selectedNodeId === null);

// ---- 拆馬達：連線性致動器設定一起清 ----
const servo = { type: 'bar', id: 'Bar3', lenParam: 'L3', fixedLen: true, isInput: true, motorType: 'mg995',
  servoStart: 0, servoEnd: 90, p1: { ...mk('N9', 0, 0, 'fixed'), physicalMotor: '1' }, p2: mk('N10', 50, 0) };
S.comps = [servo];
S.selectedNodeId = 'N9';
editor.changeServoAngle('end', 15);
check('伺服結束角 +15', servo.servoEnd === 105);
editor.removeNodeMotor();
check('拆馬達清掉輸入旗標', !servo.isInput && !servo.p1.physicalMotor);

report('node-editor');
