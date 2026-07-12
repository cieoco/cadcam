// 三點桿 / 板件域（plate-editor.js）驗收：選取、外形模式、造形點增刪與鑽孔切換、
// g/r1/r2 邊長調整（含折線桿保持彎角）、reshapeTriangle 兩圓交點取近側。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor() { this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.disabled = false; this.classList = { toggle() {} }; }
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
const { MAX_PLATE_POINTS } = await import('../js/blocks/plate-geometry.js');
const Panels = await import('../js/blocks/panels.js');
const { createPlateEditor } = await import('../js/blocks/plate-editor.js');

const noop = () => {};
let banner = '';
const editor = createPlateEditor({
  svg: { setPointerCapture: noop, addEventListener: noop, removeEventListener: noop },
  pushUndo: noop, pause: noop, rebuild: noop, draw: noop,
  cancelMotorMode: noop, deselectGear: noop, openMobileEditPanel: noop,
  setSliderDetailRows: noop, setBanner: text => { banner = text; },
  snapLego: v => Math.max(8, Math.round((Number(v) || 0) / 8) * 8),
  worldFromEvent: () => null,
  pointCoords: () => Model.pointCoords(S.comps),
  updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y)
});

// Panels 的 renderTriValue / renderLenEditor 依賴注入（照 app.js init 的接線，其餘給替身）。
Panels.init({
  pointCoords: () => Model.pointCoords(S.comps), sliderMountInfo: () => null,
  roleLabel: () => '', triParamFor: c => editor.triParamFor(c), hasPoint: () => false,
  motorBarForCenter: () => null, pointUseCount: () => 0, pointIsGround: () => false,
  isGroundPositionUnlocked: () => false
});

// 一塊 3-4-5 直角三點桿：P1 原點、P2 在 (80,0)、P3 在 (80,60)。
const tri = {
  type: 'triangle', id: 'Tri1', gParam: 'TG1', r1Param: 'TR1', r2Param: 'TR2',
  p1: { id: 'T1a', type: 'floating', x: 0, y: 0 },
  p2: { id: 'T1b', type: 'floating', x: 80, y: 0 },
  p3: { id: 'T1c', type: 'floating', x: 80, y: 60 }
};
S.comps = [tri];
S.topo.params = { theta: 0, TG1: 80, TR1: 100, TR2: 60 };

// ---- 選取與屬性列 ----
editor.selectTriangle('Tri1');
check('選取三點桿並顯示長度面板', S.selectedTriangleId === 'Tri1' && document.getElementById('lenEditor').style.display === 'flex');
check('選取時預設調底邊 g', S.triSide === 'g' && editor.triParamFor(tri) === 'TG1');

// ---- 邊長調整：g +8 → P2 沿底邊方向重擺、P3 由兩圓交點取近側 ----
editor.changeTriSide(8);
check('底邊 g 對齊 8mm 並重擺 P2', S.topo.params.TG1 === 88 && tri.p2.x === 88 && tri.p2.y === 0);
const d13 = Math.hypot(tri.p3.x - tri.p1.x, tri.p3.y - tri.p1.y);
const d23 = Math.hypot(tri.p3.x - tri.p2.x, tri.p3.y - tri.p2.y);
check('P3 仍滿足 r1/r2 且不翻面', Math.abs(d13 - 100) < 1e-6 && Math.abs(d23 - 60) < 1e-6 && tri.p3.y > 0);
editor.setTriSide('r1');
check('切換調整邊到 r1', editor.triParamFor(tri) === 'TR1');

// ---- 外形模式與造形點 ----
editor.setTriangleShapeMode('polygon');
check('外形模式切到多邊形板', tri.shapeMode === 'polygon');
const before = (tri.vertices || []).length;
editor.addTriangleOutlinePoint();
check('新增造形點（前三點之外）', tri.vertices.length === Math.max(before, 3) + 1 && tri.vertices.at(-1).solve === false);
const vi = tri.vertices.length - 1;
// 純點擊（未拖動）＝切換鑽孔
S.dragShape = { compId: 'Tri1', vi, moved: false, startX: 0, startY: 0 };
editor.shapeDragEnd();
check('點擊造形點切換為鑽孔', tri.vertices[vi].hole === true);
editor.deleteShapeVertex('Tri1', vi);
check('刪除造形點（求解點不可刪）', tri.vertices.length === Math.max(before, 3));
editor.deleteShapeVertex('Tri1', 0);
check('前三個求解點拒絕刪除', tri.vertices.length === Math.max(before, 3));
// 造形點上限防呆
while (tri.vertices.length < MAX_PLATE_POINTS) editor.addTriangleOutlinePoint();
editor.addTriangleOutlinePoint();
check(`造形點達上限 ${MAX_PLATE_POINTS} 出提示`, tri.vertices.length === MAX_PLATE_POINTS && banner.includes('最多'));

// ---- 折線桿：改桿段長度保持彎角（對角線自動重算）----
const seg = {
  type: 'triangle', id: 'Tri2', shape: 'jaw', shapeMode: 'polyline',
  gParam: 'PG2', r1Param: 'PR21', r2Param: 'PR22',
  p1: { id: 'T2a', type: 'floating', x: 0, y: 0 },
  p2: { id: 'T2b', type: 'floating', x: 0, y: 0 },
  p3: { id: 'T2c', type: 'floating', x: 0, y: 0 }
};
// 直角折線桿：兩段 80/60，對角線 = 100（直角）
seg.p2.x = 80; seg.p3.x = 80; seg.p3.y = 60;
S.comps = [seg];
S.selectedTriangleId = 'Tri2';
S.topo.params = { theta: 0, PG2: 80, PR21: 100, PR22: 60 };
S.triSide = 'g';
editor.changeTriSide(8);   // 桿段 g: 80 → 88
const d1 = S.topo.params.PG2, dg = S.topo.params.PR21, d2 = S.topo.params.PR22;
check('折線桿改段長後保持直角（對角線 = √(a²+b²)）', d1 === 88 && d2 === 60 && Math.abs(dg - Math.hypot(88, 60)) < 0.06);

report('plate-editor');
