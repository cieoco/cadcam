/**
 * blocks / slider-editor
 *
 * 滑軌（rail + 滑塊 / 載板）域：選取與屬性列、軌道 / 本體 / 載板尺寸調整、
 * 行程範圍正規化、固定端切換、翻面，以及 rebuild 前的滑軌幾何同步。
 * 函式本體自 app.js 照搬、零行為改變；app 層以注入回呼提供重建 / 繪製 / undo / 面板能力。
 */

import { S } from './state.js';

export function createSliderEditor({
  pushUndo, rebuild, draw, cancelMotorMode, deselectGear, openMobileEditPanel,
  updatePointCoordsById, roundMm, renderLenEditor, setLenButtonTitles, updatePlateShapeControls
}) {

  // 滑軌幾何同步（rebuild 前呼叫）：補齊 / 正規化 m1、m2 固定孔，並把軌道 p1、p2
  // 依載板方向與 railOffset 重新擺正（軌道是載板上的一段，整組同一直線）。
  function syncSliderGeometries() {
    S.comps.filter(c => c.type === 'slider' && c.p1 && c.p2).forEach(c => {
      if (!c.m1 || !c.m2) {
        c.m1 = { id: `${c.id || 'Slider'}m1`, type: 'fixed', x: c.p1.x || 0, y: c.p1.y || 0 };
        c.m2 = { id: `${c.id || 'Slider'}m2`, type: 'fixed', x: c.p2.x || 0, y: c.p2.y || 0 };
      }
      c.m1.type = 'fixed';
      c.m2.type = 'fixed';
      const dx = (c.m2.x || 0) - (c.m1.x || 0);
      const dy = (c.m2.y || 0) - (c.m1.y || 0);
      const d = Math.hypot(dx, dy) || 1;
      const carrierLen = Math.max(railLength(c), roundMm(d));
      const ux = dx / d, uy = dy / d;
      c.m2.x = (c.m1.x || 0) + ux * carrierLen;
      c.m2.y = (c.m1.y || 0) + uy * carrierLen;
      c.carrierLen = carrierLen;
      const maxOffset = Math.max(0, carrierLen - railLength(c));
      c.railOffset = Math.max(0, Math.min(maxOffset, roundMm(c.railOffset || 0)));
      c.p1.x = (c.m1.x || 0) + ux * c.railOffset;
      c.p1.y = (c.m1.y || 0) + uy * c.railOffset;
      c.p2.x = c.p1.x + ux * railLength(c);
      c.p2.y = c.p1.y + uy * railLength(c);
    });
  }

  // 選取滑軌：屬性列顯示軌道長度（可調）＋ 翻面（換滑塊解的那一側）＋ 刪除。
  function selectSlider(id) {
    cancelMotorMode();
    deselectGear();
    const c = S.comps.find(x => x.id === id && x.type === 'slider');
    if (!c) return;
    openMobileEditPanel();
    S.selectedSliderId = id;
    S.selectedLinkId = null;
    S.selectedTriangleId = null;
    S.selectedNodeId = null;
    document.getElementById('roleEditor').style.display = 'none';
    document.getElementById('servoEditor').style.display = 'none';
    document.getElementById('strokeEditor').style.display = 'none';
    document.getElementById('lenTitle').textContent = '🟩 滑軌長度';
    setLenButtonTitles('滑軌短 1mm', '滑軌長 1mm');
    document.getElementById('triSideSelect').style.display = 'none';
    updatePlateShapeControls(null);
    document.getElementById('sliderFlipBtn').style.display = '';
    document.getElementById('sliderBaseBtn').style.display = '';
    document.getElementById('linkToRailBtn').style.display = 'none';
    setSliderDetailRows(true);
    document.getElementById('zliftRow').style.display = 'none';   // 滑軌不做疊放
    document.getElementById('lenControls').style.display = 'flex';
    document.getElementById('lenEditor').style.display = 'flex';
    renderLenEditor(railLength(c));
    renderSliderBaseButton(c);
    renderSliderDetails(c);
    draw();
  }
  function setSliderDetailRows(show) {
    const display = show ? 'flex' : 'none';
    const body = document.getElementById('sliderBodyRow');
    const carrier = document.getElementById('sliderCarrierRow');
    const railOffset = document.getElementById('sliderRailOffsetRow');
    const start = document.getElementById('sliderStartRow');
    const end = document.getElementById('sliderEndRow');
    if (body) body.style.display = display;
    if (carrier) carrier.style.display = display;
    if (railOffset) railOffset.style.display = display;
    if (start) start.style.display = display;
    if (end) end.style.display = display;
  }
  function railLength(c) {
    return Math.round(S.topo.params[c.lenParam] ||
      Math.hypot((c.p2.x || 0) - (c.p1.x || 0), (c.p2.y || 0) - (c.p1.y || 0)));
  }
  function sliderBodyLength(c) {
    return Math.max(1, roundMm(c.carriageLen || 32));
  }
  function sliderCarrierLength(c) {
    return Math.max(railLength(c), roundMm(c.carrierLen || railLength(c)));
  }
  function sliderRailOffset(c) {
    return Math.max(0, Math.min(Math.max(0, sliderCarrierLength(c) - railLength(c)), roundMm(c.railOffset || 0)));
  }
  function sliderTravelStart(c) {
    return Math.max(0, Math.min(Math.max(0, railLength(c)), roundMm(c.travelStart || 0)));
  }
  function sliderTravelEnd(c) {
    const L = Math.max(0, railLength(c));
    const fallback = Number.isFinite(Number(c.travelEnd)) ? Number(c.travelEnd) : L;
    return Math.max(sliderTravelStart(c), Math.min(L, roundMm(fallback)));
  }
  function renderSliderDetails(c) {
    const body = document.getElementById('sliderBodyVal');
    const carrier = document.getElementById('sliderCarrierVal');
    const railOffset = document.getElementById('sliderRailOffsetVal');
    const start = document.getElementById('sliderStartVal');
    const end = document.getElementById('sliderEndVal');
    if (body) body.textContent = sliderBodyLength(c);
    if (carrier) carrier.textContent = sliderCarrierLength(c);
    if (railOffset) railOffset.textContent = sliderRailOffset(c);
    if (start) start.textContent = sliderTravelStart(c);
    if (end) end.textContent = sliderTravelEnd(c);
  }
  function renderSliderBaseButton(c) {
    const btn = document.getElementById('sliderBaseBtn');
    if (!btn || !c) return;
    btn.textContent = c.baseEnd === 'p2' ? '固定端：B' : '固定端：A';
    btn.classList.toggle('lift-on', Boolean(c.isInput));
  }
  function sliderProjectedDistance(c) {
    if (!c || !c.p1 || !c.p2 || !c.p3) return 0;
    const base = c.baseEnd === 'p2' ? c.p2 : c.p1;
    const other = c.baseEnd === 'p2' ? c.p1 : c.p2;
    const dx = (other.x || 0) - (base.x || 0);
    const dy = (other.y || 0) - (base.y || 0);
    const L = Math.hypot(dx, dy) || 1;
    return Math.max(0, Math.min(L, roundMm((((c.p3.x || 0) - (base.x || 0)) * dx + ((c.p3.y || 0) - (base.y || 0)) * dy) / L)));
  }
  function normalizeSliderRange(c) {
    const L = railLength(c);
    c.carriageLen = Math.max(1, Math.min(Math.max(1, L), sliderBodyLength(c)));
    c.carrierLen = sliderCarrierLength(c);
    c.railOffset = sliderRailOffset(c);
    c.travelStart = sliderTravelStart(c);
    c.travelEnd = sliderTravelEnd(c);
  }
  // 改軌道長度：沿軌道方向伸縮，保留本體固定端不動（p3 仍在線上由 solver 接手）。
  function changeRailLen(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    const dx = (c.p2.x || 0) - (c.p1.x || 0), dy = (c.p2.y || 0) - (c.p1.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    const L = Math.max(1, Math.min(sliderCarrierLength(c) - sliderRailOffset(c), roundMm(d + delta)));
    // 用 updatePointCoordsById 更新所有共用此接點 id 的副本（見 setLen 說明；軌道端可能被 merge 共用）
    if (c.baseEnd === 'p2') {
      updatePointCoordsById(c.p1.id, (c.p2.x || 0) - dx / d * L, (c.p2.y || 0) - dy / d * L);
    } else {
      updatePointCoordsById(c.p2.id, (c.p1.x || 0) + dx / d * L, (c.p1.y || 0) + dy / d * L);
    }
    S.topo.params[c.lenParam] = L;
    normalizeSliderRange(c);
    renderLenEditor(L);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  function changeSliderBodyLen(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    c.carriageLen = Math.max(1, Math.min(Math.max(1, railLength(c)), sliderBodyLength(c) + delta));
    normalizeSliderRange(c);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  function changeSliderCarrierLen(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    const dx = (c.m2.x || 0) - (c.m1.x || 0);
    const dy = (c.m2.y || 0) - (c.m1.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    const L = Math.max(railLength(c), sliderCarrierLength(c) + delta);
    c.m2.x = (c.m1.x || 0) + dx / d * L;
    c.m2.y = (c.m1.y || 0) + dy / d * L;
    c.carrierLen = L;
    normalizeSliderRange(c);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  function changeSliderRailOffset(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    c.railOffset = sliderRailOffset(c) + delta;
    normalizeSliderRange(c);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  function changeSliderTravelStart(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    c.travelStart = Math.min(sliderTravelEnd(c), Math.max(0, sliderTravelStart(c) + delta));
    normalizeSliderRange(c);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  function changeSliderTravelEnd(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    c.travelEnd = Math.max(sliderTravelStart(c), Math.min(railLength(c), sliderTravelEnd(c) + delta));
    normalizeSliderRange(c);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  function toggleSliderBase() {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    c.baseEnd = c.baseEnd === 'p2' ? 'p1' : 'p2';
    c.travelStart = sliderProjectedDistance(c);
    c.travelEnd = Math.max(c.travelStart, railLength(c));
    normalizeSliderRange(c);
    renderSliderBaseButton(c);
    renderSliderDetails(c);
    rebuild(); draw();
  }
  // 翻面：切換滑塊解的那一側（slider-crank 組裝在錯邊時用）。
  function flipSlider() {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    pushUndo();
    c.sign = (Number(c.sign) < 0) ? 1 : -1;
    rebuild(); draw();
  }

  return {
    syncSliderGeometries, selectSlider, setSliderDetailRows,
    railLength, sliderBodyLength, sliderCarrierLength, sliderRailOffset,
    sliderTravelStart, sliderTravelEnd,
    renderSliderDetails, renderSliderBaseButton, sliderProjectedDistance, normalizeSliderRange,
    changeRailLen, changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset,
    changeSliderTravelStart, changeSliderTravelEnd, toggleSliderBase, flipSlider
  };
}
