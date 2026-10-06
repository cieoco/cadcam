// 指標事件路由回歸：以 capture/target/bubble 的假 SVG 驗證，不代表真實觸控硬體驗收。
import { check, report } from './_harness.mjs';
import * as Input from '../js/blocks/input.js';
import * as View from '../js/blocks/view.js';
import { S } from '../js/blocks/state.js';

globalThis.document = { getElementById: id => ['lenEditor', 'gearEditor', 'sliderBaseBtn', 'linkToRailBtn'].includes(id) ? { style: {} } : null };
globalThis.DOMPoint = class {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform() { return this; }
};
let nextRaf = 0;
const rafs = new Map();
globalThis.requestAnimationFrame = fn => { rafs.set(++nextRaf, fn); return nextRaf; };
globalThis.cancelAnimationFrame = id => rafs.delete(id);
const flush = () => { const pending = [...rafs.values()]; rafs.clear(); pending.forEach(fn => fn()); };
const noop = () => {};
let mobile = false, openedEditor = 0, mergeCount = 0;
const listeners = new Map();
const svg = {
  addEventListener(type, fn, options) {
    const list = listeners.get(type) || [];
    list.push({ fn, capture: options === true || options?.capture === true }); listeners.set(type, list);
  },
  setPointerCapture: noop,
  getScreenCTM: () => ({ a: 1, d: 1, inverse: () => ({}) })
};
function emit(type, id, x, y, target = noop) {
  const event = { pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
    preventDefault: noop, stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stopped = true; this.immediate = true; } };
  const list = listeners.get(type) || [];
  for (const item of list.filter(item => item.capture)) { item.fn(event); if (event.immediate) break; }
  if (!event.stopped) target(event);
  if (!event.stopped) for (const item of list.filter(item => !item.capture)) { item.fn(event); if (event.immediate) break; }
}
Input.init({ svg, draw: noop, rebuild: noop, pause: noop, cancelMotorMode: noop, deselectLink: noop,
  worldFromEvent: e => ({ x: e.clientX, y: e.clientY }), pointCoords: () => ({}), mobilePrompt: () => mobile,
  snapshotStr: () => '{}', updateUndoBtn: noop, nearestDisplayTo: () => null,
  frameNodeIds: () => new Set(), recomputeLengths: noop, mergePoints: () => mergeCount++, pointIsGround: () => false,
  setSliderDetailRows: noop, openMobileEditPanel: () => openedEditor++
});

View.resetView();
emit('pointerdown', 1, 100, 100); emit('pointerdown', 2, 200, 100);
emit('pointermove', 2, 250, 100); flush();
check('背景雙指拉開會放大', View.getScale() > 1.4);
emit('pointerup', 1, 100, 100); emit('pointerup', 2, 250, 100);

View.resetView();
const anchorBefore = View.worldFromScreen(150, 100);
emit('pointerdown', 11, 100, 100); emit('pointerdown', 12, 200, 100);
emit('pointermove', 11, 120, 140); emit('pointermove', 12, 220, 140); flush();
const anchorAfter = View.worldFromScreen(170, 140);
check('雙指平移保留中心所對應的世界位置', Math.hypot(anchorBefore.x - anchorAfter.x, anchorBefore.y - anchorAfter.y) < 1e-8);
emit('pointercancel', 11, 120, 140); emit('pointercancel', 12, 220, 140);

View.resetView();
emit('pointerdown', 3, 100, 100, e => e.stopPropagation());
emit('pointerdown', 4, 200, 100, e => e.stopPropagation());
emit('pointermove', 4, 250, 100); flush();
check('零件阻止冒泡時仍能開始雙指縮放', View.getScale() > 1.4);
emit('pointerup', 3, 100, 100); emit('pointerup', 4, 250, 100);

S.dragFrame = true; S.dragLastWorld = { x: 100, y: 100 }; S.preDragSnap = '{}';
emit('pointerdown', 5, 100, 100); emit('pointerdown', 6, 200, 100);
check('第二指接手時清除機架拖曳', !S.dragFrame && S.dragLastWorld === null);
emit('pointercancel', 5, 100, 100); emit('pointercancel', 6, 200, 100);
S.dragFrame = false;

// 第一指放開後，第二指仍屬於同一次 pinch；不能落入單指移動或放開合併。
// 即使其他零件 handler 留有拖曳狀態，也不能讓最後一指放開執行吸附合併。
emit('pointerdown', 7, 100, 100); emit('pointerdown', 8, 200, 100);
emit('pointerup', 7, 100, 100);
S.dragId = 'unexpected'; S.snapTarget = 'target';
emit('pointerup', 8, 200, 100);
check('雙指最後放開不執行單指合併路徑', mergeCount === 0);
S.dragId = null; S.snapTarget = null;

emit('pointerdown', 13, 100, 100, e => Input.onNodeDown(e, 'P1'));
emit('pointerdown', 14, 200, 100);
emit('pointermove', 14, 250, 100); flush();
check('pinch 不會喚醒尚未越過拖曳門檻的接點', S.dragId === null);
emit('pointerup', 13, 100, 100);
emit('pointermove', 14, 280, 100); flush();
check('第一指離開後剩餘手指不會恢復接點拖曳', S.dragId === null);
emit('pointerup', 14, 280, 100);

// 真正走接點按下 handler，驗證手機編輯面板不在拖曳起點改變畫布尺寸。
mobile = true;
openedEditor = 0;
Input.onNodeDown({ clientX: 100, clientY: 100, pointerId: 9, pointerType: 'touch', preventDefault: noop, stopPropagation: noop }, 'P1');
check('手機按下接點時不提前展開編輯面板', openedEditor === 0);
emit('pointerup', 9, 100, 100);
check('手機放開接點後才展開編輯面板', openedEditor === 1);
mobile = false;
View.resetView();
const beforePan = View.worldFromScreen(100, 100);
emit('pointerdown', 21, 100, 100);
emit('pointermove', 21, 140, 130); flush();
const afterPan = View.worldFromScreen(140, 130);
check('單指空白平移不改世界錨點', Math.hypot(beforePan.x-afterPan.x,beforePan.y-afterPan.y)<1e-8);
emit('pointercancel',21,140,130);
const stopped = View.worldFromScreen(140,130);
emit('pointermove',21,200,200); flush();
check('取消後不殘留畫布拖曳', JSON.stringify(stopped)===JSON.stringify(View.worldFromScreen(140,130)));
emit('pointerdown',22,100,100);
S.drawActive=true;
emit('pointerdown',23,200,100);
check('第二指會取消未完成畫桿', S.drawActive===false);
emit('pointerup',22,100,100);emit('pointerup',23,200,100);
report('input-gestures');
