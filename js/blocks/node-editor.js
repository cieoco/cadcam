/**
 * blocks / node-editor
 *
 * 節點角色域：接點角色（自由 / 固定）、X/Y 微調、拆除馬達、分離合併點、
 * 軌跡點 / 量測基準切換、固定點位置鎖，以及選到輸入源時的伺服角度 / 行程面板調整。
 * 函式本體自 app.js 照搬、零行為改變；app 層以注入回呼提供重建 / 繪製 / undo /
 * 滑軌域 / 馬達域能力（見 createNodeEditor(deps)）。
 */

import { S } from './state.js';
import * as Panels from './panels.js';
import { LEGO_FRAME_STEP as LEGO_STEP } from './model.js';

export function createNodeEditor({
  pushUndo, pause, rebuild, draw, setBanner, transient, scheduleAutosave,
  hasPoint, pointCoords, pointIsGround, updatePointCoordsById, snapFramePoint,
  sliderMountInfo, removeMotorAtPoint, removeAnchorsAtPoint, setPointType, freezePointAtDisplay, pointRefs,
  motorBarForCenter, sliderTravelStart, sliderTravelEnd, railLength, normalizeSliderRange,
  traceIds, invalidateTrajectory
}) {
  let unlockedGroundPointId = '';

  // 選到被線性致動器驅動的滑塊點時，跳出行程面板；其餘情況收起。
  function sliderInputForPoint(id) {
    return (id && hasPoint(id))
      ? S.comps.find(c => c.type === 'slider' && c.isInput && c.p3 && c.p3.id === id) || null
      : null;
  }
  function changeStroke(which, delta) {
    const sl = sliderInputForPoint(S.selectedNodeId);
    if (!sl) return;
    pushUndo();
    if (which === 'end') {
      sl.travelEnd = Math.max(sliderTravelStart(sl), Math.min(railLength(sl), sliderTravelEnd(sl) + delta));
    } else {
      sl.travelStart = Math.min(sliderTravelEnd(sl), Math.max(0, sliderTravelStart(sl) + delta));
    }
    normalizeSliderRange(sl);
    Panels.updateStrokeEditor();
    rebuild(); draw();
  }
  function changeServoAngle(which, delta) {
    const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? motorBarForCenter(S.selectedNodeId) : null;
    if (!bar || bar.motorType !== 'mg995') return;
    pushUndo();
    const field = (which === 'end') ? 'servoEnd' : 'servoStart';
    const cur = Number(bar[field]);
    const base = Number.isFinite(cur) ? cur : (field === 'servoEnd' ? 90 : 0);
    bar[field] = Math.max(0, Math.min(360, Math.round(base + delta)));
    Panels.updateServoEditor();
    scheduleAutosave();
  }
  function setNodeRole(type) {
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    if (sliderMountInfo(S.selectedNodeId) && type !== 'fixed') {
      setBanner('滑軌固定孔需要維持固定；可用 X/Y 或拖曳調整位置');
      return;
    }
    pushUndo();
    pause();
    if (type === 'floating') removeMotorAtPoint(S.selectedNodeId);
    if (type === 'fixed') removeMotorAtPoint(S.selectedNodeId);
    if (type === 'fixed') freezePointAtDisplay(S.selectedNodeId);
    setPointType(S.selectedNodeId, type);
    // Promoting a joint to the frame is an explicit manufacturing decision;
    // immediately place it on the active 8 mm hole grid when locking is on.
    if (type === 'fixed') {
      const p = pointCoords()[S.selectedNodeId];
      if (p) {
        const q = snapFramePoint(p);
        updatePointCoordsById(S.selectedNodeId, q.x, q.y);
      }
    }
    if (type === 'floating') removeAnchorsAtPoint(S.selectedNodeId);
    rebuild(); draw();
  }
  function changeNodePos(axis, delta) {
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    const p = pointCoords()[S.selectedNodeId];
    if (!p) return;
    pushUndo();
    const step = (S.lockFrameHoles && pointIsGround(S.selectedNodeId)) ? Math.sign(delta || 1) * LEGO_STEP : delta;
    const next = { x: axis === 'x' ? p.x + step : p.x, y: axis === 'y' ? p.y + step : p.y };
    const q = pointIsGround(S.selectedNodeId) ? snapFramePoint(next) : next;
    updatePointCoordsById(S.selectedNodeId, q.x, q.y);
    rebuild(); draw();
    Panels.updateRoleEditor();
  }
  function removeNodeMotor() {
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    pushUndo();
    pause();
    removeMotorAtPoint(S.selectedNodeId);
    // 線性致動器：把驅動該滑塊的設定一併拿掉，滑塊回到被動（可由連桿推動）。
    const sl = sliderInputForPoint(S.selectedNodeId);
    if (sl) { delete sl.isInput; delete sl.physicalMotor; delete sl.strokeMin; delete sl.strokeMax; }
    rebuild(); draw();
    Panels.updateRoleEditor();
  }
  // 分離：把鎖在同一點（共用同一 id）的多個端點拆開，各給新 id 並向外稍微散開，方便個別拖曳。
  // 保留非桿件（地錨／馬達座）或第一個端點維持原 id，其餘分出去並轉為自由點。
  function splitNode() {
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    const id = S.selectedNodeId;
    const refs = pointRefs(id);
    if (refs.length < 2) return;                 // 沒有合併，無從分離
    pushUndo();
    pause();
    const p = pointCoords()[id] || { x: 0, y: 0 };
    const OFFSET = 16;                            // 分出來的端點向外位移量（mm），給視覺回饋也方便點選
    refs.sort((a, b) => (a.comp.type === 'bar' ? 1 : 0) - (b.comp.type === 'bar' ? 1 : 0));
    const detach = refs.slice(1);                 // 第一個（優先地錨/非桿件）留原 id，其餘分出去
    detach.forEach((ref, i) => {
      const ang = (i / detach.length) * Math.PI * 2 + 0.6;
      ref.point.id = 'P' + (++S.counter) + 's';
      ref.point.type = 'floating';
      ref.point.x = (p.x || 0) + Math.cos(ang) * OFFSET;
      ref.point.y = (p.y || 0) + Math.sin(ang) * OFFSET;
    });
    S.selectedNodeId = null;                       // 原合併點已拆，取消選取
    rebuild(); draw();
    Panels.updateRoleEditor();
  }
  function toggleTracePoint() {
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    pushUndo();
    pause();
    const ids = traceIds();
    const currentIndex = ids.indexOf(S.selectedNodeId);
    S.topo.tracePoint = '';
    // 第一點量單點範圍；第二點自然切換成夾持距離。第三點則開始新的量測，畫面不會堆滿軌跡。
    if (currentIndex >= 0) ids.splice(currentIndex, 1);
    else if (ids.length >= 2) ids.splice(0, ids.length, S.selectedNodeId);
    else ids.push(S.selectedNodeId);
    S.topo.tracePoints = ids;
    invalidateTrajectory();   // 軌跡點換了：清手動軌跡並讓軌跡快取失效（geomVersion++）
    Panels.updateRoleEditor();
    draw();
  }
  function toggleMeasurementReference() {
    const id=S.selectedNodeId; if(!id||!hasPoint(id))return;
    const point=pointCoords()[id]; if(!point)return;
    if(!pointIsGround(id)){ transient('量測基準必須是固定於機架或地面的接點'); return; }
    pushUndo(); S.topo.referencePoint=S.topo.referencePoint===id?'':id; rebuild(); draw(); Panels.updateRoleEditor(); scheduleAutosave();
    transient(S.topo.referencePoint ? `📐 已將 ${id} 設為量測基準` : '已取消量測基準');
  }
  function toggleGroundPositionLock() {
    const id=S.selectedNodeId; if(!id||!pointIsGround(id)){ transient('只有固定點或馬達軸心需要位置鎖'); return; }
    unlockedGroundPointId=unlockedGroundPointId===id?'':id; Panels.updateRoleEditor();
    transient(unlockedGroundPointId ? '🔓 固定點已解除鎖定，可拖曳一次' : '🔒 固定點已鎖定');
  }
  const isGroundPositionUnlocked = id => unlockedGroundPointId === id;
  function relockGroundPosition(id) { if(unlockedGroundPointId===id) unlockedGroundPointId=''; Panels.updateRoleEditor(); }

  return {
    sliderInputForPoint, changeStroke, changeServoAngle,
    setNodeRole, changeNodePos, removeNodeMotor, splitNode,
    toggleTracePoint, toggleMeasurementReference,
    toggleGroundPositionLock, isGroundPositionUnlocked, relockGroundPosition
  };
}
