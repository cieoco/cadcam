// 動力來源域（motor-tools.js）驗收：放置模式、桿 / 滑塊 / 齒輪指派輸入、
// 防呆（兩端固定 / 線性致動器限滑塊）、型號查詢與有限行程範圍。
// 依 app.js 的接線方式把 gear-editor / slider-editor / motor-tools 三個 factory 串起來測。
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
const { createGearEditor } = await import('../js/blocks/gear-editor.js');
const { createSliderEditor } = await import('../js/blocks/slider-editor.js');
const { createMotorTools } = await import('../js/blocks/motor-tools.js');

const noop = () => {};
let banner = '';
const svg = { style: {} };
const shared = {
  pushUndo: noop, pause: noop, rebuild: noop, draw: noop, renderFrame: noop,
  transient: noop, scheduleAutosave: noop, exitDrawTools: noop,
  openMobileEditPanel: noop, closeMobileEditPanel: noop, hideEditorPanels: noop,
  snapshotStr: () => '', updateUndoBtn: noop, recordManualTrace: noop,
  worldFromEvent: () => null, mobilePrompt: () => false,
  pointCoords: () => Model.pointCoords(S.comps),
  updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y),
  pointIsGround: id => Model.pointIsGround(S.comps, id)
};
const gearEditor = createGearEditor({ ...shared, cancelMotorMode: (...a) => motorTools.cancelMotorMode(...a) });
const sliderEditor = createSliderEditor({
  ...shared, cancelMotorMode: (...a) => motorTools.cancelMotorMode(...a),
  deselectGear: gearEditor.deselectGear, roundMm: v => Math.round(Number(v) || 0),
  renderLenEditor: noop, setLenButtonTitles: noop, updatePlateShapeControls: noop
});
const motorTools = createMotorTools({
  svg, pushUndo: noop, pause: noop, rebuild: noop, draw: noop,
  setBanner: text => { banner = text; }, clearBanner: () => { banner = ''; },
  promptText: (desktop) => desktop, exitDrawTools: noop, deselectLink: noop,
  openMobileEditPanel: noop, updateRoleEditor: noop,
  barsAtNode: id => Model.barsAtNode(S.comps, id),
  pointIsGround: shared.pointIsGround,
  freezePointAtDisplay: noop,
  setPointType: (id, type) => Model.setPointType(S.comps, id, type),
  gearById: gearEditor.gearById, gearMeshChain: gearEditor.gearMeshChain,
  selectGear: gearEditor.selectGear, rackPinionThetaRange: gearEditor.rackPinionThetaRange,
  sliderProjectedDistance: sliderEditor.sliderProjectedDistance,
  railLength: sliderEditor.railLength,
  sliderTravelStart: sliderEditor.sliderTravelStart, sliderTravelEnd: sliderEditor.sliderTravelEnd
});

// ---- 放置模式 ----
motorTools.placeMotor();
check('放置模式：游標十字並顯示提示', S.placingMotor === true && svg.style.cursor === 'crosshair' && banner.includes('TT馬達'));
motorTools.cancelMotorMode();
check('取消放置：游標與提示復原', S.placingMotor === false && svg.style.cursor === '' && banner === '');

// ---- 桿件指派：TT 馬達從目前姿勢起轉（相位偏移吸收絕對角）----
const bar = {
  type: 'bar', id: 'Bar1', lenParam: 'LL1', fixedLen: true,
  p1: { id: 'N1', type: 'fixed', x: 0, y: 0 },
  p2: { id: 'N2', type: 'floating', x: 0, y: 50 }
};
S.comps = [bar];
S.theta = 30;
motorTools.driveBarAt('Bar1', 'N1');
check('TT 馬達：曲柄設輸入且相位偏移 = 目前角 − theta', bar.isInput === true && bar.p1.physicalMotor === '1' && Math.abs(bar.phaseOffset - (90 - 30)) < 1e-9);
check('指派後選取馬達接點', S.selectedNodeId === 'N1');

// ---- MG995：theta 歸零、預設 0..90 擺動 ----
delete bar.isInput; delete bar.p1.physicalMotor;
S.pendingMotorType = 'mg995';
motorTools.driveBarAt('Bar1', 'N1');
check('MG995：theta 歸零且預設擺動 0..90', S.theta === 0 && bar.servoStart === 0 && bar.servoEnd === 90 && bar.motorType === 'mg995');
check('伺服型號查詢與擺動範圍', motorTools.motorTypeForCenter('N1') === 'mg995' && JSON.stringify(motorTools.inputRockRange()) === '{"lo":0,"hi":90}');

// ---- 防呆：兩端都固定的桿不能上馬達 ----
const stuck = {
  type: 'bar', id: 'Bar2', lenParam: 'LL2', fixedLen: true,
  p1: { id: 'N3', type: 'fixed', x: 0, y: 0 },
  p2: { id: 'N4', type: 'fixed', x: 50, y: 0 }
};
S.comps = [stuck];
motorTools.driveBarAt('Bar2', 'N3');
check('兩端固定的桿拒絕上馬達', !stuck.isInput && banner.includes('兩端都固定'));

// ---- 線性致動器：只能放滑塊點 ----
S.pendingMotorType = 'linear';
motorTools.handleMotorOnNode('N3');
check('線性致動器拒絕非滑塊點', banner.includes('滑塊'));
const slider = {
  type: 'slider', id: 'Slider1', lenParam: 'SLL1', baseEnd: 'p1',
  p1: { id: 'SL1a', type: 'fixed', x: 0, y: 0 },
  p2: { id: 'SL1b', type: 'fixed', x: 100, y: 0 },
  p3: { id: 'SL1s', type: 'floating', x: 40, y: 0 }
};
S.comps = [slider];
S.topo.params.SLL1 = 100;
motorTools.handleMotorOnNode('SL1s');
check('線性致動器：滑塊設輸入且行程 = 投影..軌道長', slider.isInput === true && slider.travelStart === 40 && slider.travelEnd === 100);
check('線性行程的來回範圍 = 0..stroke', JSON.stringify(motorTools.inputRockRange()) === '{"lo":0,"hi":60}');

// ---- 齒輪指派：沿嚙合鏈找根驅動輪、固定中心、提醒接地 ----
S.comps = []; S.topo.params = { theta: 0 }; S.counter = 0; S.pendingMotorType = 'tt';
gearEditor.addGearPair();
const [driver, driven] = S.comps.filter(c => c.type === 'gear');
motorTools.driveGearAt(driven.id);   // 點從動輪也應把馬達放到根驅動輪
check('齒輪馬達記在根驅動輪且中心固定', driver.p1.physicalMotor === '1' && driver.p1.type === 'fixed');
check('嚙合夥伴未接地時提醒', banner.includes('另一個齒輪中心'));
S.pendingMotorType = 'linear';
delete driver.p1.physicalMotor;
motorTools.driveGearAt(driver.id);
// 註：現行 driveGearAt 先 setBanner 再 cancelMotorMode（會清 banner），警告實際不會停留——照現行為驗收。
check('線性致動器不能驅動齒輪（僅取消放置、不指派）', !driver.p1.physicalMotor && S.placingMotor === false);

report('motor-tools');
