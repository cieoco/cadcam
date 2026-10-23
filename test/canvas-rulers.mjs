import {check, report} from './_harness.mjs';
import {rulerStep, rulerTicks} from '../js/blocks/canvas-rulers.js';
import * as View from '../js/blocks/view.js';

check('無效投影不產生刻度', rulerStep(0) === null && rulerStep(Infinity) === null);
for (const px of [0.08, 0.6, 1.4, 3.2, 8, 12]) {
  const step = rulerStep(px), width = step * px;
  check(`縮放 ${px} 的小尺保持可讀寬度`, width >= 36 - 1e-8 && width <= 90 + 1e-8);
  const ticks = rulerTicks(217.25, px, 390, step);
  check(`縮放 ${px} 的刻度對準世界座標`, ticks.every(t => Math.abs((t.position - 217.25) / px - t.value) < 1e-8));
}
const shifted = rulerTicks(142, 2, 390, 20);
check('平移後零點跟著畫布移動', shifted.find(t => t.value === 0)?.position === 142);
check('負座標刻度仍可見', shifted.some(t => t.value < 0));
const vertical = rulerTicks(200, 2, 400, 20, -1);
check('垂直尺規向上為正', vertical.find(t => t.value === 20)?.position === 160);
check('小數刻度沒有浮點長尾', rulerTicks(0, 120, 390, 0.2).some(t => String(t.value) === '0.6'));

let updates = 0;
const stop = View.onViewChange(() => updates++);
View.resetView();
View.panByClient({getScreenCTM: () => ({a:2,d:2})}, 40, 20);
check('平移通知尺規且座標換算正確', updates === 2 && View.TX(0) === 470 && View.TY(0) === 290);
globalThis.DOMPoint = class {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform() { return this; }
};
const anchor = View.worldFromScreen(240, 160);
View.zoomAt({getScreenCTM: () => ({inverse: () => ({})})}, 240, 160, 1.12);
check('縮放通知尺規並保留手勢錨點', updates === 3 && Math.abs(View.TX(anchor.x) - 240) < 1e-8 && Math.abs(View.TY(anchor.y) - 160) < 1e-8);
View.fit({minX:0,maxX:100,minY:0,maxY:100});
check('置中通知尺規並保留真實毫米', updates === 4 && Math.abs(View.TX(32) - View.TX(0) - 32 * View.getScale()) < 1e-8);
stop();
View.resetView();
check('可取消視圖訂閱', updates === 4);
report('canvas-rulers');
