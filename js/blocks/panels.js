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

// ---- 注入的查詢 helper（由 app 在啟動時提供）----
let pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount, pointIsGround, isGroundPositionUnlocked;

export function init(deps) {
  ({ pointCoords, sliderMountInfo, roleLabel, triParamFor, hasPoint, motorBarForCenter, pointUseCount, pointIsGround, isGroundPositionUnlocked } = deps);
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
  if (x) x.textContent = p ? Math.round(p.x) : '0';
  if (y) y.textContent = p ? Math.round(p.y) : '0';
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
  const bar = S.selectedNodeId && hasPoint(S.selectedNodeId) ? motorBarForCenter(S.selectedNodeId) : null;
  if (!bar || bar.motorType !== 'mg995') {
    panel.style.display = 'none';
    return;
  }
  const sv = document.getElementById('servoStartVal');
  const ev = document.getElementById('servoEndVal');
  if (sv) sv.textContent = Math.round(Number(bar.servoStart) || 0);
  if (ev) ev.textContent = Math.round(Number.isFinite(Number(bar.servoEnd)) ? Number(bar.servoEnd) : 90);
  panel.style.display = 'flex';
}

export function updateStrokeEditor() {
  const panel = document.getElementById('strokeEditor');
  if (!panel) return;
  panel.style.display = 'none';
}

// ---- 角色編輯（接點：自由 / 地錨 / 馬達）----
export function updateRoleEditor() {
  const editor = document.getElementById('roleEditor');
  if (!editor) return;
  if (!S.selectedNodeId || !hasPoint(S.selectedNodeId)) {
    editor.style.display = 'none';
    updateServoEditor();
    updateStrokeEditor();
    return;
  }
  document.getElementById('roleStatus').textContent = nodeRoleLabel(S.selectedNodeId);
  renderNodePosition(S.selectedNodeId);
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
}
