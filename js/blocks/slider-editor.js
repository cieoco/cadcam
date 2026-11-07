import {editableNumber} from './numeric-input.js';
import {commitLegacyMountingEdit} from './mounting-review-ui.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';
/**
 * blocks / slider-editor
 *
 * 滑軌（rail + 滑塊 / 載板）域：選取與屬性列、軌道 / 本體 / 載板尺寸調整、
 * 行程範圍正規化、固定端切換、翻面，以及 rebuild 前的滑軌幾何同步。
 * 函式本體自 app.js 照搬、零行為改變；app 層以注入回呼提供重建 / 繪製 / undo / 面板能力。
 */

import { S } from './state.js';

const roundTenth = v => Number((Number(v) || 0).toFixed(1));

export function createSliderEditor({
  pushUndo, rebuild, draw, pause = () => {}, notify = () => {}, cancelMotorMode, deselectGear, openMobileEditPanel,
  updatePointCoordsById, renderLenEditor, setLenButtonTitles, updatePlateShapeControls
}) {
  document.getElementById('sliderSettings')?.addEventListener('toggle',()=>draw(),true);

  function validateMovingRailEdit(){
    if(!S.comps.some(c=>c.type==='slider'&&c.movingRail))return true;
    const result=solveTopology(compileTopology(S.comps,{params:S.topo.params},new Set()),{thetaDeg:S.theta||0});
    if(result.isValid&&!result.isUnderconstrained)return true;
    notify(result.reason||result.errorReason||'滑軌修改無法保持原有連接與孔距。');return false;
  }

  // 滑軌幾何同步（rebuild 前呼叫）：補齊 / 正規化 m1、m2 固定孔，並把軌道 p1、p2
  // 依載板方向與 railOffset 重新擺正（軌道是載板上的一段，整組同一直線）。
  function syncSliderGeometries() {
    S.comps.filter(c => c.type === 'slider' && c.p1 && c.p2).forEach(c => {
      if(c.movingRail){
        const dx=c.p2.x-c.p1.x,dy=c.p2.y-c.p1.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,offset=sliderRailOffset(c),carrier=sliderCarrierLength(c);
        c.m1={...c.m1,id:c.m1?.id||`${c.id}m1`,type:'floating',x:c.p1.x-ux*offset,y:c.p1.y-uy*offset};
        c.m2={...c.m2,id:c.m2?.id||`${c.id}m2`,type:'floating',x:c.p1.x+ux*(carrier-offset),y:c.p1.y+uy*(carrier-offset)};
        return;
      }
      if (!c.m1 || !c.m2) {
        c.m1 = { id: `${c.id || 'Slider'}m1`, type: 'fixed', x: c.p1.x || 0, y: c.p1.y || 0 };
        c.m2 = { id: `${c.id || 'Slider'}m2`, type: 'fixed', x: c.p2.x || 0, y: c.p2.y || 0 };
      }
      c.m1.type = c.movingRail ? 'floating' : 'fixed';
      c.m2.type = c.movingRail ? 'floating' : 'fixed';
      const dx = (c.m2.x || 0) - (c.m1.x || 0);
      const dy = (c.m2.y || 0) - (c.m1.y || 0);
      const d = Math.hypot(dx, dy) || 1;
      const carrierLen = Math.max(railLength(c), roundTenth(d));
      const ux = dx / d, uy = dy / d;
      c.m2.x = (c.m1.x || 0) + ux * carrierLen;
      c.m2.y = (c.m1.y || 0) + uy * carrierLen;
      c.carrierLen = carrierLen;
      const maxOffset = Math.max(0, carrierLen - railLength(c));
      c.railOffset = Math.max(0, Math.min(maxOffset, roundTenth(c.railOffset || 0)));
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
    S.frameEditorOpen = false;
    document.getElementById('frameEditor').style.display = 'none';
    document.getElementById('roleEditor').style.display = 'none';
    document.getElementById('servoEditor').style.display = 'none';
    document.getElementById('strokeEditor').style.display = 'none';
    document.getElementById('lenTitle').textContent = '🟩 可滑動長度';
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
    const settings = document.getElementById('sliderSettings');
    if (settings) {
      settings.style.display = show ? 'block' : 'none';
      if (!show) settings.querySelectorAll('details').forEach(detail => { detail.open = false; });
    }
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
    return roundTenth(S.topo.params[c.lenParam] ||
      Math.hypot((c.p2.x || 0) - (c.p1.x || 0), (c.p2.y || 0) - (c.p1.y || 0)));
  }
  function sliderBodyLength(c) {
    return Math.max(1, roundTenth(c.carriageLen || 32));
  }
  function sliderCarrierLength(c) {
    return Math.max(railLength(c), roundTenth(c.carrierLen || railLength(c)));
  }
  function sliderRailOffset(c) {
    return Math.max(0, Math.min(Math.max(0, sliderCarrierLength(c) - railLength(c)), roundTenth(c.railOffset || 0)));
  }
  function sliderTravelStart(c) {
    return Math.max(0, Math.min(Math.max(0, railLength(c)), roundTenth(c.travelStart || 0)));
  }
  function sliderTravelEnd(c) {
    const L = Math.max(0, railLength(c));
    const fallback = Number.isFinite(Number(c.travelEnd)) ? Number(c.travelEnd) : L;
    return Math.max(sliderTravelStart(c), Math.min(L, roundTenth(fallback)));
  }
  function renderSliderDetails(c) {
    syncLengthInput();
    for(const d of dimensions(c).filter(d=>d.key!=='rail'))
      editableNumber(document.getElementById(d.inputId),d.value,d.set,{label:d.label+'（mm）',min:d.min,max:d.max});
    const limit = document.getElementById('sliderLengthLimit');
    if (limit) limit.hidden = railLength(c) < dimensions(c)[0].max;
    const origin = document.getElementById('sliderRangeOrigin');
    if (origin) origin.textContent = `從軌道 ${c.baseEnd === 'p2' ? 'B' : 'A'} 端量起的允許位置（mm），不是實際往復行程。`;
    renderSliderBaseButton(c);
  }
  function renderSliderBaseButton(c) {
    const btn = document.getElementById('sliderBaseBtn');
    if (!btn || !c) return;
    btn.style.display = c.isInput ? '' : 'none';
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
    return Math.max(0, Math.min(L, roundTenth((((c.p3.x || 0) - (base.x || 0)) * dx + ((c.p3.y || 0) - (base.y || 0)) * dy) / L)));
  }
  function normalizeSliderRange(c) {
    const L = railLength(c);
    c.carriageLen = Math.max(1, Math.min(Math.max(1, L), sliderBodyLength(c)));
    c.carrierLen = sliderCarrierLength(c);
    c.railOffset = sliderRailOffset(c);
    c.travelStart = sliderTravelStart(c);
    c.travelEnd = sliderTravelEnd(c);
  }
  function syncLengthInput() {
    const input = document.getElementById('sliderLengthInput');
    if (!input) return;
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    input.style.display = c ? '' : 'none';
    if (!c) return;
    document.getElementById('lenValue').style.display = 'none';
    input.value = railLength(c);
    input.max = dimensions(c)[0].max;
  }
  function setRailLength(raw) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    const value = String(raw).trim() === '' ? NaN : Number(raw);
    const max = dimensions(c)[0].max;
    if (!Number.isFinite(value) || value < 1 || value > max) {
      notify(`可滑動長度請輸入 1～${max} mm；需要更長時，請在「外形與安裝」增加底座長度或減少軌道偏移。`);
      syncLengthInput();
      return;
    }
    const d = Math.hypot(c.p2.x - c.p1.x, c.p2.y - c.p1.y);
    changeRailLen(value - d);
  }
  // 改軌道長度：沿軌道方向伸縮，保留本體固定端不動（p3 仍在線上由 solver 接手）。
  function changeRailLen(delta) {
    const c = S.comps.find(x => x.id === S.selectedSliderId && x.type === 'slider');
    if (!c) return;
    const dx = (c.p2.x || 0) - (c.p1.x || 0), dy = (c.p2.y || 0) - (c.p1.y || 0);
    const d = Math.hypot(dx, dy) || 1;
    const L = Math.max(1, Math.min(dimensions(c)[0].max, roundTenth(d + delta)));
    if (L === railLength(c)) { syncLengthInput(); return; }
    const accepted=commitLegacyMountingEdit(S,()=>{
      const candidate=S.comps.find(x=>x.id===c.id);
      // 用 updatePointCoordsById 更新所有共用此接點 id 的副本（見 setLen 說明；軌道端可能被 merge 共用）
      if (c.baseEnd === 'p2') {
        candidate.railOffset=sliderRailOffset(c)+railLength(c)-L;
        updatePointCoordsById(c.p1.id, (c.p2.x || 0) - dx / d * L, (c.p2.y || 0) - dy / d * L);
      } else {
        updatePointCoordsById(c.p2.id, (c.p1.x || 0) + dx / d * L, (c.p1.y || 0) + dy / d * L);
      }
      S.topo.params[c.lenParam] = L;
      normalizeSliderRange(candidate);
      syncSliderGeometries();
      return validateMovingRailEdit();
    },{pushUndo,notify});
    renderLenEditor(railLength(c));
    renderSliderDetails(c);
    if(accepted){pause();rebuild();}draw();
  }
  // Numeric fields and graphical handles consume the same dimension limits and setter.
  function dimensions(c) {
    const L=railLength(c),carrier=sliderCarrierLength(c),offset=sliderRailOffset(c);
    return [
      {key:'rail',label:'軌長',value:L,min:1,max:c.baseEnd==='p2'?L+offset:carrier-offset,inputId:'sliderLengthInput',set:setRailLength},
      {key:'body',label:'滑塊長度',value:sliderBodyLength(c),min:1,max:L,inputId:'sliderBodyVal'},
      {key:'carrier',label:'底座長度',value:carrier,min:L+offset,max:1000,inputId:'sliderCarrierVal'},
      {key:'offset',label:'軌道偏移',value:offset,min:0,max:carrier-L,inputId:'sliderRailOffsetVal'},
      {key:'start',label:'行程起點',value:sliderTravelStart(c),min:0,max:sliderTravelEnd(c),inputId:'sliderStartVal'},
      {key:'end',label:'行程終點',value:sliderTravelEnd(c),min:sliderTravelStart(c),max:L,inputId:'sliderEndVal'}
    ].map(d=>({...d,step:1,set:d.set|| (v=>setDimension(d.key,v))}));
  }
  function setDimension(key,raw) {
    const c=S.comps.find(c=>c.id===S.selectedSliderId&&c.type==='slider');if(!c)return;
    const d=dimensions(c).find(d=>d.key===key),n=Number(raw);
    if(!d||!Number.isFinite(n))return;
    const value=Math.max(d.min,Math.min(d.max,roundTenth(n)));
    if(value===d.value){renderSliderDetails(c);return;}
    const accepted=commitLegacyMountingEdit(S,()=>{
      const candidate=S.comps.find(x=>x.id===c.id);
      if(key==='carrier'){
        const dx=candidate.m2.x-candidate.m1.x,dy=candidate.m2.y-candidate.m1.y,L=Math.hypot(dx,dy)||1;
        candidate.m2.x=candidate.m1.x+dx/L*value;candidate.m2.y=candidate.m1.y+dy/L*value;
      }
      candidate[{body:'carriageLen',carrier:'carrierLen',offset:'railOffset',start:'travelStart',end:'travelEnd'}[key]]=value;
      normalizeSliderRange(candidate);
      syncSliderGeometries();
      return validateMovingRailEdit();
    },{pushUndo,notify});
    renderSliderDetails(c);if(accepted){pause();rebuild();}draw();
  }
  function changeDimension(key,delta){const c=S.comps.find(c=>c.id===S.selectedSliderId&&c.type==='slider');if(c)setDimension(key,dimensions(c).find(d=>d.key===key).value+delta);}
  const changeSliderBodyLen=delta=>changeDimension('body',delta);
  const changeSliderCarrierLen=delta=>changeDimension('carrier',delta);
  const changeSliderRailOffset=delta=>changeDimension('offset',delta);
  const changeSliderTravelStart=delta=>changeDimension('start',delta);
  const changeSliderTravelEnd=delta=>changeDimension('end',delta);
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
    syncSliderGeometries, selectSlider, setSliderDetailRows, dimensions,
    railLength, sliderBodyLength, sliderCarrierLength, sliderRailOffset,
    sliderTravelStart, sliderTravelEnd,
    renderSliderDetails, renderSliderBaseButton, sliderProjectedDistance, normalizeSliderRange,
    syncLengthInput, setRailLength, changeRailLen, changeSliderBodyLen, changeSliderCarrierLen, changeSliderRailOffset,
    changeSliderTravelStart, changeSliderTravelEnd, toggleSliderBase, flipSlider
  };
}
