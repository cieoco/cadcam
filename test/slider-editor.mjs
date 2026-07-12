// 滑軌域（slider-editor.js）驗收：幾何同步、尺寸 / 行程調整與夾限、固定端切換、翻面。
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
const { createSliderEditor } = await import('../js/blocks/slider-editor.js');

const noop = () => {};
const editor = createSliderEditor({
  pushUndo: noop, rebuild: noop, draw: noop, cancelMotorMode: noop, deselectGear: noop,
  openMobileEditPanel: noop,
  updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y),
  roundMm: v => Math.round(Number(v) || 0),
  renderLenEditor: noop, setLenButtonTitles: noop, updatePlateShapeControls: noop
});

// 一根水平滑軌：軌道 100mm，滑塊 p3 在 40mm 處。
const slider = {
  type: 'slider', id: 'Slider1', lenParam: 'SLL1', baseEnd: 'p1',
  p1: { id: 'SL1a', type: 'fixed', x: 0, y: 0 },
  p2: { id: 'SL1b', type: 'fixed', x: 100, y: 0 },
  p3: { id: 'SL1s', type: 'floating', x: 40, y: 0 }
};
S.comps = [slider];
S.topo.params.SLL1 = 100;

// ---- 幾何同步：補齊 m1/m2 固定孔並沿載板擺正軌道 ----
editor.syncSliderGeometries();
check('同步後補齊 m1/m2 固定孔且載板長 = 軌道長', slider.m1 && slider.m2 && slider.m1.type === 'fixed' && slider.carrierLen === 100);
check('軌道端點沿載板方向擺正', slider.p1.x === 0 && slider.p2.x === 100 && slider.p2.y === 0);

// ---- 選取與屬性列 ----
editor.selectSlider('Slider1');
check('選取滑軌並顯示屬性列', S.selectedSliderId === 'Slider1' && document.getElementById('lenEditor').style.display === 'flex');
check('行程預設 0..軌道長並夾限', editor.sliderTravelStart(slider) === 0 && editor.sliderTravelEnd(slider) === 100);

// ---- 尺寸調整與夾限 ----
editor.changeRailLen(8);
check('載板未加長時軌道長被載板夾限', editor.railLength(slider) === 100);
editor.changeSliderCarrierLen(16);
editor.changeRailLen(8);
check('載板加長後軌道可加長', slider.carrierLen === 116 && editor.railLength(slider) === 108);
editor.changeSliderRailOffset(4);
check('軌道位移不超過載板餘裕', editor.sliderRailOffset(slider) === 4);
editor.changeSliderTravelStart(24);
editor.changeSliderTravelEnd(-40);
check('行程起訖互相夾限（start ≤ end ≤ 軌道長）', slider.travelStart === 24 && slider.travelEnd === 60);

// ---- 固定端切換：行程從滑塊目前投影位置重新起算 ----
editor.toggleSliderBase();
check('固定端切到 B 且行程以 p3 投影重算', slider.baseEnd === 'p2' && slider.travelStart === editor.sliderProjectedDistance(slider));

// ---- 翻面 ----
editor.flipSlider();
check('翻面切換滑塊解的一側', slider.sign === -1);

report('slider-editor');
