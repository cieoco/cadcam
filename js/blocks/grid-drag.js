/**
 * blocks / grid-drag
 *
 * 受格尺寸的拖曳步距與「N 孔」顯示（docs/SDD-GRID-BLOCKS.md E2、G3）。按需載入，不進首次 JS。
 * 受格：一般連桿與合成片的桿段孔距、折線桿的兩個桿段、圓盤工作孔距。
 * 不受格（維持 1 mm）：三點板三邊、折線跨距、爪端長度、板寬板厚、外徑、齒條、滑軌等。
 */
import { GRID_PITCH_MM, pitchDeviation } from './grid-rule.js';
import { polylineTriangleParams } from './plate-geometry.js';

// dimension 為 memberDimensions(comp) 的一項；回傳圖上拖曳的步距（mm）。
export function gridDragStep(comp, dimension) {
  if (!comp || !dimension?.refs || dimension.stockKey || dimension.property || comp.boxPanel) return 1;
  if(comp.standardBlank)return GRID_PITCH_MM;
  if (comp.type === 'bar') return dimension.id === 'g' ? GRID_PITCH_MM : 1;
  if (comp.type !== 'triangle') return 1;
  return polylineTriangleParams(comp)?.segParams.includes(dimension.param) ? GRID_PITCH_MM : 1;
}

export function holeCountText(lengthMm) {
  const d = pitchDeviation(lengthMm);
  if (!Number.isFinite(d.deviationMm)) return '';
  return d.ok ? `${d.holes} 孔` : `≈ ${d.holes} 孔（差 ${Number(d.deviationMm.toFixed(2))} mm）`;
}

// 在數字欄旁顯示孔數；field 為空則隱藏。數字欄手動輸入時同步更新。
const spans = new WeakMap();
let shown = null;
export function showHoleCount(field, lengthMm, textFn = holeCountText) {
  if (shown && shown !== spans.get(field)) shown.hidden = true;
  shown = null;
  if (!field) return;
  let span = spans.get(field);
  if (!span) {
    span = document.createElement('small');
    span.dataset.holeCount = '';
    span.style.cssText = 'margin-left:6px;white-space:nowrap;color:#075e75';
    span.setAttribute('aria-live', 'polite');
    // 放在單位（mm）之後，避免讀成「64 9 孔 mm」。
    let unit = field.nextElementSibling;
    while (unit && unit.tagName === 'INPUT' && unit.style.display === 'none') unit = unit.nextElementSibling;   // 略過隱藏的其他數字欄
    (unit && unit.tagName !== 'INPUT' && /^\s*mm\s*$/.test(unit.textContent) ? unit : field).after(span);
    spans.set(field, span);
    field.addEventListener('input', () => { if (!span.hidden) span.textContent = span.textFn(Number(field.value)); });
  }
  span.hidden = false;
  span.textFn = textFn;
  span.textContent = textFn(lengthMm);
  shown = span;
}
