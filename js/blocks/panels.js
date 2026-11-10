import {localHoles} from '../core/local-holes.js';
import {partDisplayName} from './display-labels.js';
import {editableNumber} from './numeric-input.js';
import {setPointPosition,setPointAngle} from './input.js';
import {pointRotation} from './model.js';
/**
 * blocks / panels
 *
 * 編輯面板的呈現層：把目前選取狀態（S.selected* / S.topo …）反映到右側／上方的
 * 各個面板 DOM——角色、伺服角度、行程、三角邊長、疊放、長度顯示。
 *
 * 只負責「讀 S + 寫 DOM」，不改機構資料、不觸發重繪（那些是 app 的控制器動作）。
 * 跨檔的查詢 helper 用 init() 注入，避免與 app 互相 import：
 *   pointCoords / sliderMountInfo / roleLabel / triParamFor / hasPoint / motorBarForCenter
 */

import { S } from './state.js';
import { servoInputAt } from './motor-tools.js';

// ---- 注入的查詢 helper（由 app 在啟動時提供）----
let pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount, pointIsGround, isGroundPositionUnlocked, frameSizeInfo, frameGroundInfo;

export function init(deps) {
  ({ pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount, pointIsGround, isGroundPositionUnlocked, frameSizeInfo, frameGroundInfo } = deps);
}

// 更新長度顯示（用上方的 − / + 以 8mm 為單位調整）
export function renderLenEditor(len) {
  const valEl = document.getElementById('lenValue');
  if (valEl) valEl.textContent = len;
}

export function setLenButtonTitles(minusTitle, plusTitle) {
  const minus = document.getElementById('lenMinusBtn');
  const plus = document.getElementById('lenPlusBtn');
  if (minus) minus.title = minusTitle;
  if (plus) plus.title = plusTitle;
}

function nodeRoleLabel(id) {
  const mount = sliderMountInfo(id);
  if (mount) return `${mount.label} 滑軌固定孔`;
  return roleLabel(id);
}

function renderNodePosition(id) {
  const p = pointCoords()[id];
  const x = document.getElementById('nodeXVal');
  const y = document.getElementById('nodeYVal');
  editableNumber(x,p?.x??0,v=>setPointPosition('x',v),{label:'接點 X（mm）'});
  editableNumber(y,p?.y??0,v=>setPointPosition('y',v),{label:'接點 Y（mm）'});
}

export function renderTriValue() {
  const c = S.comps.find(x => x.id === S.selectedTriangleId);
  if (c) renderLenEditor(Math.round(S.topo.params[triParamFor(c)] || 0));
}

// 反映目前選取件的 zlift 狀態到「移到最上/最下」按鈕的高亮
export function updateZliftButtons() {
  const id = S.selectedLinkId || S.selectedTriangleId;
  const c = id ? S.comps.find(x => x.id === id) : null;
  const z = c ? (c.zlift || 0) : 0;
  const up = document.getElementById('liftUpBtn');
  const dn = document.getElementById('liftDownBtn');
  if (up) up.classList.toggle('lift-on', z > 0);
  if (dn) dn.classList.toggle('lift-on', z < 0);
}

// 選到 MG995 伺服的接點時，跳出起始/結束角面板；其餘情況收起。
export function updateServoEditor() {
  const panel = document.getElementById('servoEditor');
  if (!panel) return;
  const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? servoInputAt(S.comps, S.selectedNodeId) : null;
  if (!bar || bar.motorType !== 'mg995') {
    panel.style.display = 'none';
    return;
  }
  const sv = document.getElementById('servoStartVal');
  const ev = document.getElementById('servoEndVal');
  editableNumber(sv,Number(bar.servoStart)||0,v=>window.blocks.changeServoAngle('start',v-(Number(bar.servoStart)||0)),{label:'舵機起始角度',min:-360,max:360});
  const end=Number.isFinite(Number(bar.servoEnd))?Number(bar.servoEnd):90;
  editableNumber(ev,end,v=>window.blocks.changeServoAngle('end',v-end),{label:'舵機結束角度',min:-360,max:360});
  panel.style.display = 'flex';
}

export function updateStrokeEditor() {
  const panel = document.getElementById('strokeEditor');
  if (!panel) return;
  panel.style.display = 'none';
}

// 機架面板與節點面板同為 inspector-panel：手機底部抽屜與桌機右上角都會疊在一起，
// 所以節點面板顯示時把機架面板收進去當最後一段（模組列仍在最底），關閉時放回原位。
export function placeFrameEditor(frameEl, roleEl) {
  if (roleEl.style.display !== 'none') {
    const moduleRow = Array.from(roleEl.children).find(child => child.id === 'moduleEditor');
    if (frameEl.parentNode !== roleEl || (moduleRow ? frameEl.nextSibling !== moduleRow : frameEl.nextSibling !== null)) {
      if (moduleRow) roleEl.insertBefore(frameEl, moduleRow);
      else roleEl.appendChild(frameEl);
    }
    frameEl.dataset.embedded = 'true';
  } else {
    if (roleEl.parentNode && (frameEl.parentNode !== roleEl.parentNode || roleEl.nextSibling !== frameEl)) {
      roleEl.parentNode.insertBefore(frameEl, roleEl.nextSibling);
    }
    delete frameEl.dataset.embedded;
  }
}

let framePanel;
export function updateFrameEditor() {
  const panel=document.getElementById('frameEditor');if(!panel)return;
  if(!S.frameEditorOpen){panel.style.display='none';const role=document.getElementById('roleEditor');if(role)placeFrameEditor(panel,role);return;}
  const deps={pointCoords,frameGroundInfo,frameSizeInfo,pointIsGround};
  if(framePanel)return framePanel(deps);
  return import('./frame-panel.js').then(m=>{framePanel=m.renderFrameEditor;framePanel(deps);globalThis.window?.blocks?.draw();});
}

// ---- 角色編輯（接點：自由 / 地錨 / 馬達）----
export function updateRoleEditor() {
  const editor = document.getElementById('roleEditor');
  if (!editor) return;
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) {
    editor.style.display = 'none';
    const motorMountRow = document.getElementById('motorMountRow');
    if (motorMountRow) motorMountRow.style.display = 'none';
    updateServoEditor();
    updateStrokeEditor();
    updateFrameEditor();
    return;
  }
  const frameHole=S.comps.find(c=>c.frameHole&&c.p1?.id===S.selectedNodeId);
  editor.classList?.toggle('frame-hole-selection',!!frameHole);
  if(frameHole){editor.style.display='flex';updateFrameEditor();import('./frame-hole-editor.js').then(m=>m.renderFrameHoleEditor());return;}
  delete editor.dataset.selectionSummary;
  document.getElementById('roleStatus').textContent = nodeRoleLabel(S.selectedNodeId);
  const advanced = document.getElementById('nodeAdvanced');
  if (advanced && editor.dataset.nodeId !== S.selectedNodeId) advanced.open = false;
  editor.dataset.nodeId = S.selectedNodeId;
  const powerRow=document.getElementById('nodePowerRow');
  if(powerRow)powerRow.style.display=S.comps.some(c=>
    (['gear','motor'].includes(c.type) && c.p1?.id===S.selectedNodeId && c.p1.physicalMotor) ||
    (c.type==='bar' && c.isInput && [c.p1,c.p2].some(p=>p?.id===S.selectedNodeId && p.physicalMotor)))?'flex':'none';
  renderNodePosition(S.selectedNodeId);
  const local=S.comps.some(c=>localHoles(c).some(h=>h.id===S.selectedNodeId));let notice=document.getElementById('localHoleNotice');if(!notice){notice=document.createElement('p');notice.id='localHoleNotice';editor.append(notice);}notice.hidden=!local;notice.textContent='此孔隨桿件／板材移動，可接桿或在初始姿態固定；獨立移孔請沿特殊孔位／外形繪圖。';for(const key of ['nodeXVal','nodeYVal']){const field=document.getElementById(key)?.querySelector('input');if(field)field.disabled=local;}
  let angleRow=document.getElementById('nodeDirection');
  if(!angleRow){angleRow=document.createElement('label');angleRow.id='nodeDirection';angleRow.innerHTML='方向（°，水平為 0） <span></span>';editor.insertBefore(angleRow,advanced);}
  const rotation=pointRotation(S.comps,S.topo.params,S.selectedNodeId);
  angleRow.hidden=!rotation;
  if(rotation&&angleRow.nodeType===1)editableNumber(angleRow.querySelector('span'),rotation.angle,v=>setPointAngle(S.selectedNodeId,v),{label:'連桿方向角度',min:-360,max:360});
  const motorMountRow = document.getElementById('motorMountRow');
  const motorMountStatus = document.getElementById('motorMountStatus');
  const motorBar = motorBarForCenter(S.selectedNodeId) || S.comps.find(c=>['gear','motor'].includes(c.type)&&c.p1?.id===S.selectedNodeId&&c.p1.physicalMotor);
  const powered = !!motorBar || S.comps.some(c=>c.type==='slider'&&c.isInput&&c.p3?.id===S.selectedNodeId);
  const fixedBtn = document.getElementById('nodeFixedBtn');
  if (fixedBtn) {
    const ground = pointIsGround?.(S.selectedNodeId), mount = sliderMountInfo(S.selectedNodeId);
    fixedBtn.style.display = powered ? 'none' : '';
    fixedBtn.dataset.role = ground ? 'floating' : 'fixed';
    fixedBtn.textContent = mount ? '滑軌固定孔' : ground ? '取消固定' : '固定在底座';
    fixedBtn.disabled = !!mount;
  }
  const adjustBtn = document.getElementById('nodeMotorAdjustBtn');
  if (adjustBtn) adjustBtn.style.display = motorBar ? '' : 'none';
  const removeBtn = document.getElementById('nodeRemoveMotorBtn');
  if (removeBtn) {removeBtn.style.display = powered ? '' : 'none';removeBtn.textContent=motorBar?(motorBar.motorType==='mg995'?'刪除舵機':'刪除馬達'):'移除動力';removeBtn.title=motorBar?.type==='motor'?'刪除這個動力零件，可復原':'只移除動力，保留桿件與其他連接，可復原';}
  if (motorMountRow) {
    motorMountRow.style.display = motorBar ? 'flex' : 'none';
    motorMountRow.dataset.nodeId = S.selectedNodeId;
  }
  if (motorMountStatus && motorBar) {
    const mount = motorBar.motorMount || {};
    const frameBody = mount.frameBody || motorBar.motorCarrier;
    const orientation = mount.orientation || (frameBody ? 'follow-frame' : 'horizontal');
    const effectiveOrientation = orientation === 'follow-frame' && !frameBody ? 'horizontal' : orientation;
    const orientationLabel = effectiveOrientation === 'horizontal' ? '水平' : effectiveOrientation === 'vertical' ? '垂直' : '沿機架';
    motorMountStatus.textContent = `${frameBody ? `承載：${partDisplayName(S.comps,frameBody)}` : '承載：自動機架'}・${mount.face==='front'?'正面':'背面'}・${orientationLabel} → ${motorBar.type==='motor'?'尚未連接輸出':partDisplayName(S.comps,motorBar.id)}`;
  }
  const traceBtn = document.getElementById('traceBtn');
  if (traceBtn) {
    const traceIds = new Set([...(S.topo.tracePoints || []), ...(S.topo.tracePoint ? [S.topo.tracePoint] : [])]);
    const isTrace = traceIds.has(S.selectedNodeId);
    const hasOneWorkPoint = traceIds.size === 1;
    const hasPair = traceIds.size >= 2;
    traceBtn.textContent = isTrace ? '取消工作點' : (hasOneWorkPoint ? '加入夾持點' : (hasPair ? '改為工作點' : '設工作點'));
    traceBtn.classList.toggle('trace-on', isTrace);
    traceBtn.title = isTrace ? '停止量測這個工作點' : (hasOneWorkPoint
      ? '加入第二點，量出兩點間可夾的尺寸'
      : (hasPair ? '以這個接點開始新的單點量測' : '選擇此接點，自動量出它的工作範圍'));
  }
  const referenceBtn = document.getElementById('referenceBtn');
  if (referenceBtn) {
    const isReference = S.topo.referencePoint === S.selectedNodeId;
    referenceBtn.textContent = isReference ? '取消量測基準' : '設量測基準';
    referenceBtn.classList.toggle('trace-on', isReference);
    referenceBtn.style.display = pointIsGround?.(S.selectedNodeId) ? '' : 'none';
  }
  const lockBtn = document.getElementById('positionLockBtn');
  if (lockBtn) {
    const ground = pointIsGround?.(S.selectedNodeId), unlocked = ground && isGroundPositionUnlocked?.(S.selectedNodeId);
    lockBtn.style.display = ground ? '' : 'none'; lockBtn.textContent = unlocked ? '重新鎖定位置' : '解除位置鎖定';
    lockBtn.classList.toggle('trace-on', Boolean(unlocked));
  }
  // 「分離」只在此接點被多個端點共用（兩桿件鎖在同一點）時出現
  const splitBtn = document.getElementById('splitBtn');
  if (splitBtn) {
    splitBtn.style.display = (pointUseCount && pointUseCount(S.selectedNodeId) >= 2) ? '' : 'none';
  }
  editor.style.display = 'flex';
  updateServoEditor();
  updateStrokeEditor();
  updateFrameEditor();
}
