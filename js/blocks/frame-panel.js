import {S} from './state.js';
import {editableNumber} from './numeric-input.js';
import {setFramePosition} from './input.js';
import {placeFrameEditor} from './panels.js';
export function renderFrameEditor({pointCoords,frameGroundInfo,frameSizeInfo,pointIsGround}) {
  const panel = document.getElementById('frameEditor');
  if (!panel) return;
  const roleEditor = document.getElementById('roleEditor');
  const points = pointCoords();
  const axis=frameGroundInfo?.();
  const grounds = axis?.nodes || Object.entries(points).filter(([id]) => pointIsGround?.(id)).map(([id, point]) => ({ id, ...point }));
  if (!grounds.length || !S.frameEditorOpen) { panel.style.display = 'none'; if (roleEditor) placeFrameEditor(panel, roleEditor); return; }
  const positionGrounds=[...grounds,...S.comps.filter(c=>c.frameHole&&grounds.some(p=>p.id===c.frameHole.a)).map(c=>c.p1)];
  let position=panel.querySelector?.('[data-frame-position]');
  if(panel.nodeType===1){
    if(!position){position=document.createElement('div');position.dataset.framePosition='';position.innerHTML='<label>機架中心 X <span data-x></span></label><label>Y <span data-y></span></label>';panel.append(position);}
    for(const key of ['x','y'])editableNumber(position.querySelector(`[data-${key}]`),positionGrounds.reduce((n,p)=>n+p[key],0)/positionGrounds.length,v=>setFramePosition(key,v),{label:`機架中心 ${key.toUpperCase()}（mm）`});
  }
  const sizes=frameSizeInfo?.();
  for(const key of ['lengthMm','widthMm','thicknessMm']) {
    const input=document.getElementById(`frameSize-${key}`);
    if(input && sizes) input.value=Number((sizes[key] || 0).toFixed(1));
  }
  const count = document.getElementById('frameHoleCount');
  const lengthValue = document.getElementById('frameLengthVal');
  const angleValue = document.getElementById('frameAngleVal');
  const margin = document.getElementById('frameMarginInput');
  const hole = document.getElementById('frameHoleInput');
  if (count) count.textContent = `${grounds.length+S.comps.filter(c=>c.frameHole&&grounds.some(p=>p.id===c.frameHole.a)).length} 個固定孔`;
  const base = grounds[0], target = grounds[1];
  const axisLength = target ? Math.hypot(target.x - base.x, target.y - base.y) : 0;
  const axisAngle = target ? Math.atan2(target.y - base.y, target.x - base.x) * 180 / Math.PI : 0;
  if(target)editableNumber(lengthValue,axisLength,v=>window.blocks.changeFrameGround('length',v-axisLength),{label:'固定軸距（mm）',min:0,max:2000});else if(lengthValue)lengthValue.textContent='—';
  if(target&&axisLength>1e-6)editableNumber(angleValue,axisAngle,v=>window.blocks.changeFrameGround('angle',v-axisAngle),{label:'固定軸方向（°）',min:-360,max:360});else if(angleValue)angleValue.textContent='—';
  for(const id of ['frameLengthMinus','frameLengthPlus','frameAngleMinus','frameAnglePlus']){
    const button=document.getElementById(id);if(button)button.disabled=!target||(id.includes('Angle')&&axisLength<1e-6);
  }
  const hint=document.getElementById('frameAxisHint');
  if(hint)hint.textContent=!target?'只有一個固定軸，無法調整軸距與方向。這裡不是馬達本體角度。':axisLength<1e-6?'兩個固定軸重合，請先增加軸距。':`調整 ${base.id} → ${target.id} 的方向；移動第二個固定軸，不旋轉馬達本體。`;
  if (margin) margin.value = Number(S.frameMarginMm || 18);
  if (hole) hole.value = Number(S.frameHoleDiameterMm || 5);
  panel.style.display = 'flex';
  if (roleEditor) placeFrameEditor(panel, roleEditor);
}
