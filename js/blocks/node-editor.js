import {commitLegacyMountingEdit} from './mounting-review-ui.js';
import {localHoles} from '../core/local-holes.js';
import {fusionAtPoint} from '../core/bar-fusion.js';
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
import { displayPoint, LEGO_FRAME_STEP as LEGO_STEP } from './model.js';
import { servoInputAt } from './motor-tools.js';

export function createNodeEditor({
  pushUndo, pause, rebuild, draw, setBanner, transient, scheduleAutosave, setPointPosition,
  hasPoint, pointCoords, pointIsGround, updatePointCoordsById, snapFramePoint, syncGearMeshAnchoredAt,
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
    const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? servoInputAt(S.comps, S.selectedNodeId) : null;
    if (!bar || bar.motorType !== 'mg995') return;
    pushUndo();
    const field = (which === 'end') ? 'servoEnd' : 'servoStart';
    const cur = Number(bar[field]);
    const base = Number.isFinite(cur) ? cur : (field === 'servoEnd' ? 90 : 0);
    bar[field] = Math.max(-360, Math.min(360, Math.round(base + delta)));   // 相對角，可為負
    Panels.updateServoEditor();
    scheduleAutosave();
  }
  function setNodeRole(type) {
    const local=S.comps.some(c=>localHoles(c).some(h=>h.id===S.selectedNodeId));
    if(type==='fixed'&&local){const home=pointCoords()[S.selectedNodeId],shown=displayPoint(S.comps,S.compiled,S.theta,S.selectedNodeId,{...S.motorAngles,[String(S.activeMotor)]:S.theta});if(!home||!shown||Math.hypot(home.x-shown.x,home.y-shown.y)>.0001){transient('請先回到板材的初始姿態，再固定局部孔；這次未改變作品。');return;}}
    if(type==='motor'&&S.comps.some(c=>localHoles(c).some(h=>h.id===S.selectedNodeId))){transient('這個是剛體局部孔；可連接或固定，馬達請使用致動元件安裝。');return;}
    if(type==='floating'&&S.comps.some(c=>c.frameHole&&[c.frameHole.a,c.frameHole.b].includes(S.selectedNodeId))){transient('這個基準孔仍有機架孔依附，請先刪除附屬孔再取消固定。');return;}
    if(S.comps.some(c=>c.frameHole&&c.p1.id===S.selectedNodeId)){transient('這是機架上的孔；要移動請調整距基準孔。');return;}
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    if (sliderMountInfo(S.selectedNodeId) && type !== 'fixed') {
      setBanner('滑軌固定孔需要維持固定；可用 X/Y 或拖曳調整位置');
      return;
    }
    const mutate=()=>{
    if (type === 'floating') removeMotorAtPoint(S.selectedNodeId);
    if (type === 'fixed') removeMotorAtPoint(S.selectedNodeId);
    if (type === 'fixed') freezePointAtDisplay(S.selectedNodeId);
    setPointType(S.selectedNodeId, type);
    // Promoting a joint to the frame is an explicit manufacturing decision;
    // immediately place it on the 8 mm hole grid (always on since G4a).
    if (type === 'fixed' && !local) {
      const p = pointCoords()[S.selectedNodeId];
      if (p) {
        const q = snapFramePoint(p);
        updatePointCoordsById(S.selectedNodeId, q.x, q.y);
        // 齒輪中心昇格機架點：8mm 格點吸附會破壞圓心距（＝兩節圓半徑和）。
        // 把此中心當作驅動側釘在格點，讓嚙合夥伴跟隨移動以維持咬合（方向 B）。
        syncGearMeshAnchoredAt?.(S.selectedNodeId);
      }
    }
    if (type === 'floating') removeAnchorsAtPoint(S.selectedNodeId);
    };
    if(S.comps.some(c=>c.standardBlank?.mountHoles)){pause();if(!commitLegacyMountingEdit(S,mutate,{pushUndo,notify:transient}))return;}else{pushUndo();pause();mutate();}
    rebuild(); draw();
  }
  function changeNodePos(axis, delta) {
    const p=pointCoords()[S.selectedNodeId];if(!p)return;
    const step=pointIsGround(S.selectedNodeId)?Math.sign(delta||1)*LEGO_STEP:delta;
    setPointPosition(axis,p[axis]+step);
  }
  function removeNodeMotor() {
    if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) return;
    pause();
    if(!commitLegacyMountingEdit(S,()=>{
      removeMotorAtPoint(S.selectedNodeId);
      // 線性致動器：把驅動該滑塊的設定一併拿掉，滑塊回到被動（可由連桿推動）。
      const sl = sliderInputForPoint(S.selectedNodeId);
      if (sl) { delete sl.isInput; delete sl.physicalMotor; delete sl.strokeMin; delete sl.strokeMax; }
    },{pushUndo,notify:transient}))return;
    rebuild(); draw();
    Panels.updateRoleEditor();
  }
  // 分離：把鎖在同一點（共用同一 id）的多個端點拆開，各給新 id 並向外稍微散開，方便個別拖曳。
  // 保留非桿件（地錨／馬達座）或第一個端點維持原 id，其餘分出去並轉為自由點。
  function splitNode() {
    if(fusionAtPoint(S.comps,S.selectedNodeId)){transient('請先解除合成，再修改孔位。');return;}
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
