/**
 * Universal Mechanism Page Loader
 * 通用機構頁面載入器
 */

import { getMechanismFromURL, generateParameterHTML, MECHANISMS } from './mechanism-config.js';
import { setupUIHandlers, updatePreview } from './ui/controls.js';
import { downloadText, downloadZip, log, calcAdaptiveGridStep } from './utils.js';
import { MechanismWizard } from './ui/wizard.js';

/**
 * 初始化機構頁面
 */
async function initMechanismPage() {
  const mech = getMechanismFromURL();

  console.log(`Loading mechanism: ${mech.name}`);

  // 設定頁面標題和圖示
  document.getElementById('pageTitle').textContent = `${mech.name} - 機構模擬工具`;
  document.getElementById('mechIcon').textContent = mech.icon;
  document.getElementById('mechName').textContent = mech.name;

  // 建立機構選擇器
  const selectorContainer = document.getElementById('mechSelectorContainer');
  if (selectorContainer) {
    let selectHTML = '<select id="mechTypeSelector" style="padding: 6px 12px; font-size: 14px; border-radius: 4px; border: 1px solid #ccc; background-color: white; cursor: pointer;">';
    for (const key in MECHANISMS) {
      const m = MECHANISMS[key];
      const isSelected = m.id === mech.id ? 'selected' : '';
      selectHTML += `<option value="${m.id}" ${isSelected}>${m.icon} ${m.name}</option>`;
    }
    selectHTML += '</select>';
    selectorContainer.innerHTML = selectHTML;

    // 監聽切換事件
    document.getElementById('mechTypeSelector').addEventListener('change', (e) => {
      const newType = e.target.value;
      const url = new URL(window.location);
      url.searchParams.set('type', newType);
      window.location.href = url.toString();
    });
  }

  // 生成參數輸入面板
  const parametersPanel = document.getElementById('parametersPanel');

  // 分離出驅動相關參數（包含掃描設定）
  const driveRelatedIds = ['motorType', 'motorRotation', 'sweepStart', 'sweepEnd', 'sweepStep', 'showTrajectory'];
  const driveParams = mech.parameters.filter(p => !p.isDynamic && driveRelatedIds.includes(p.id));
  const mechanismParams = mech.parameters.filter(p => !p.isDynamic && !driveRelatedIds.includes(p.id));

  parametersPanel.innerHTML = `
    <h3>${mech.name}參數</h3>
    ${generateParameterHTML(mechanismParams)}
    
    <div style="height:10px"></div>
    <h3>🔌 驅動與掃描設定</h3>
    ${generateParameterHTML(driveParams)}
    
    <div style="height:10px"></div>
    <h3>模擬設定</h3>
    <input id="viewRange" type="number" min="100" max="1000" step="10" value="800" style="display:none" />
    <div class="grid">
      <div>
        <label>格線解析度（mm）</label>
        <select id="gridStep">
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50" selected>50</option>
          <option value="100">100</option>
        </select>
      </div>
      <div>
        <label>
          <input type="checkbox" id="showGrid" checked /> 顯示格線
        </label>
      </div>
    </div>
  `;

  // 生成零件規格面板
  const partSpecsPanel = document.getElementById('partSpecsPanel');
  partSpecsPanel.innerHTML = generateParameterHTML(mech.partSpecs);

  // 設定模擬說明
  document.getElementById('simNotes').innerHTML = mech.simNotes;

  // 如果設定為隱藏動畫，則尋找並隱藏動畫控制區域
  if (mech.hideAnimation) {
    const headings = document.querySelectorAll('h3');
    for (const h3 of headings) {
      if (h3.textContent.includes('動畫控制')) {
        h3.style.display = 'none';
        // 隱藏接下來的控制網格
        if (h3.nextElementSibling && (h3.nextElementSibling.classList.contains('grid') || h3.nextElementSibling.classList.contains('anim-controls'))) {
          h3.nextElementSibling.style.display = 'none';
        }
      }
    }
  }

  // 動態載入機構特定的模組
  try {
    const t = Date.now();
    // 載入求解器
    const solverModule = await import(`${mech.solverModule}?t=${t}`);

    // 載入視覺化模組
    const visualizationModule = await import(`${mech.visualizationModule}?t=${t}`);

    // 載入零件生成模組
    const partsModule = await import(`${mech.partsModule}?t=${t}`);

    // 將模組掛載到全域，供 UI 控制器使用
    window.mechanismModules = {
      solver: solverModule,
      visualization: visualizationModule,
      parts: partsModule,
      config: mech
    };

    // 設定 UI 處理器 - 延遲執行確保所有元素就緒
    await new Promise(resolve => setTimeout(resolve, 150));
    setupUIHandlers();

    // 初始化精靈 (如果存在)
    const wizardContainer = document.getElementById('wizardContainer');
    if (wizardContainer) {
      const wizard = new MechanismWizard('wizardContainer', (newTopo) => {
        const topoArea = document.getElementById('topology');
        if (topoArea) {
          topoArea.value = JSON.stringify(newTopo, null, 2);
          // 觸發輸入事件以更新動態參數
          topoArea.dispatchEvent(new Event('input'));
          // 更新預覽
          updatePreview();
        }
      });
      window.wizard = wizard; // 供內嵌 HTML 調用

      setupLinkClickHandler(); // Initialize interactive link features

      const topoArea = document.getElementById('topology');
      if (topoArea && topoArea.value) {
        try {
          wizard.init(JSON.parse(topoArea.value));
        } catch (e) {
          wizard.init();
        }
      } else {
        wizard.init();
      }
    }

    console.log('Mechanism modules loaded successfully');
  } catch (error) {
    console.error('Failed to load mechanism modules:', error);
    document.getElementById('log').textContent =
      `錯誤：無法載入 ${mech.name} 模組。\n${error.message}\n\n此機構可能尚未實作。`;
  }
}

// DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMechanismPage);
} else {
  initMechanismPage();
}

/**
 * 設定連結點擊互動功能 (Add Hole)
 */
function setupLinkClickHandler() {
  const svgWrap = document.getElementById('svgWrap');
  if (!svgWrap) return;

  // --- State Machine for Drawing ---
  // State: IDLE, DRAWING_P1 (Waiting for P2), 
  let drawState = 'IDLE';
  let drawP1 = null; // { id, x, y, isNew }
  let ghostLine = null;

  // Helper to find the H3 title element
  function getTitleElement() {
    // Look for h3 with specific text
    const h3s = document.querySelectorAll('h3');
    for (let h3 of h3s) {
      if (h3.textContent.trim().includes('2D 模擬與參數調整')) {
        return h3;
      }
    }
    return null;
  }


  const titleEl = getTitleElement();

  // Add "Add Point" Button
  let addPointBtn = document.getElementById('btnAddPoint');
  if (!addPointBtn && titleEl) {
    addPointBtn = document.createElement('button');
    addPointBtn.id = 'btnAddPoint';
    addPointBtn.innerHTML = '📍 新增點位';
    addPointBtn.style.marginLeft = '15px'; // Space from title
    addPointBtn.style.border = '1px solid #aaa';

    // Insert after title
    titleEl.parentNode.insertBefore(addPointBtn, titleEl.nextSibling);

    addPointBtn.onclick = () => {
      if (drawState === 'IDLE') {
        drawState = 'ADD_POINT';
        addPointBtn.style.background = '#ffeaa7';
        addPointBtn.textContent = '點擊新增...';
        document.getElementById('svgWrap').style.cursor = 'crosshair';
      } else {
        resetDrawState();
      }
    };
  }

  // Add "Delete" Button
  let delBtn = document.getElementById('btnDelete');
  if (!delBtn && titleEl) {
    delBtn = document.createElement('button');
    delBtn.id = 'btnDelete';
    delBtn.innerHTML = '🗑️ 刪除';
    delBtn.style.marginLeft = '10px';
    delBtn.style.border = '1px solid #aaa';

    // Insert after addPointBtn if exists, else title
    const refNode = addPointBtn || titleEl;
    refNode.parentNode.insertBefore(delBtn, refNode.nextSibling);

    delBtn.onclick = () => {
      if (drawState === 'IDLE') {
        drawState = 'DELETE';
        delBtn.style.background = '#ff7675'; // Reddish
        delBtn.textContent = '點擊刪除...';
        document.getElementById('svgWrap').style.cursor = 'not-allowed'; // Or custom eraser cursor
      } else {
        resetDrawState();
      }
    };
  }

  // Add Toolbar Button for Drawing if not exists
  let drawBtn = document.getElementById('btnDrawLink');
  if (!drawBtn && titleEl) {
    drawBtn = document.createElement('button');
    drawBtn.id = 'btnDrawLink';
    drawBtn.innerHTML = '✏️ 畫桿件';
    drawBtn.style.marginLeft = '10px'; // Space from previous btn
    drawBtn.style.border = '1px solid #aaa';

    // Insert after Delete button if exists
    const refNode = delBtn || addPointBtn || titleEl;
    refNode.parentNode.insertBefore(drawBtn, refNode.nextSibling);

    drawBtn.onclick = () => {
      if (drawState === 'IDLE') {
        drawState = 'WAIT_P1';
        drawBtn.style.background = '#ffeaa7';
        drawBtn.textContent = '選取起點...';
        document.getElementById('svgWrap').style.cursor = 'crosshair';

        // Auto Enter Zen Mode? Optional.
        if (!document.body.classList.contains('zen-mode')) {
          // Check if user wants auto-zen? For now, manual.
        }
      } else {
        resetDrawState();
      }
    };
  }

  // Zen Mode Button
  let zenBtn = document.getElementById('btnZenMode');
  if (!zenBtn && titleEl) {
    zenBtn = document.createElement('button');
    zenBtn.id = 'btnZenMode';
    zenBtn.innerHTML = '⛶ 全螢幕';
    zenBtn.style.marginLeft = '10px';
    zenBtn.style.border = '1px solid #aaa';

    // Insert after draw button (which is nextSibling of title now)
    // Actually, drawBtn is inserted. So titleEl.nextSibling is drawBtn.
    // Insert after drawBtn.
    titleEl.parentNode.insertBefore(zenBtn, drawBtn.nextSibling);

    zenBtn.onclick = () => {
      document.body.classList.toggle('zen-mode');
      const isZen = document.body.classList.contains('zen-mode');
      zenBtn.innerHTML = isZen ? '↙ 恢復' : '⛶ 全螢幕';
      zenBtn.style.background = isZen ? '#fab1a0' : '';

      // Force redraw/resize
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };
  }

  function resetDrawState() {
    drawState = 'IDLE';
    drawP1 = null;
    if (drawBtn) {
      drawBtn.style.background = '';
      drawBtn.textContent = '✏️ 畫桿件';
    }
    if (addPointBtn) {
      addPointBtn.style.background = '';
      addPointBtn.textContent = '📍 新增點位';
    }
    if (delBtn) {
      delBtn.style.background = '';
      delBtn.textContent = '🗑️ 刪除';
    }
    if (ghostLine) {
      ghostLine.remove();
      ghostLine = null;
    }
    document.getElementById('svgWrap').style.cursor = 'default';
    console.log('[Draw] Canceled');
  }

  function updateGhostLine() {
    if (!ghostLine) {
      const svg = svgWrap.querySelector('svg');
      if (!svg) return;
      ghostLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ghostLine.setAttribute('stroke', '#3498db');
      ghostLine.setAttribute('stroke-width', '2');
      ghostLine.setAttribute('stroke-dasharray', '5,5');
      ghostLine.setAttribute('pointer-events', 'none'); // Let clicks pass through
      svg.appendChild(ghostLine);
    }
    // ... (rest of logic moved to _moveHandler)
  }

  // --- Fixed Grid Label Logic ---
  let gridLabel = document.getElementById('gridInfoLabel');
  if (!gridLabel) {
    gridLabel = document.createElement('div');
    gridLabel.id = 'gridInfoLabel';
    gridLabel.style.position = 'absolute';
    gridLabel.style.top = '10px';
    gridLabel.style.right = '10px';
    gridLabel.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'; // Semi-transparent
    gridLabel.style.padding = '4px 8px';
    gridLabel.style.borderRadius = '4px';
    gridLabel.style.fontSize = '12px';
    gridLabel.style.fontFamily = 'monospace';
    gridLabel.style.pointerEvents = 'none';
    gridLabel.style.color = '#333';
    gridLabel.style.zIndex = '500';

    if (getComputedStyle(svgWrap).position === 'static') {
      svgWrap.style.position = 'relative';
    }
    svgWrap.appendChild(gridLabel);
  }

  function updateFixedGridLabel() {
    const viewRange = parseFloat(document.getElementById('viewRange').value) || 800;
    const step = calcAdaptiveGridStep(viewRange);
    if (gridLabel) gridLabel.textContent = `Grid: ${step}`;
  }

  // Initial & Listeners for Grid Label
  updateFixedGridLabel();
  const vrInput = document.getElementById('viewRange');
  if (vrInput) {
    vrInput.addEventListener('input', updateFixedGridLabel);
  }

  // --- Coordinate & Snap Logic ---
  let coordTooltip = null;
  let currentSnapPoint = null; // { x, y, type: 'joint'|'grid' }

  function updateCoordTooltip(visible, clientX, clientY, worldX, worldY, type = 'raw') {
    if (!coordTooltip) {
      coordTooltip = document.createElement('div');
      coordTooltip.style.position = 'fixed';
      coordTooltip.style.background = 'rgba(0, 0, 0, 0.8)';
      coordTooltip.style.color = '#fff'; // White text
      coordTooltip.style.padding = '6px 10px';
      coordTooltip.style.borderRadius = '6px';
      coordTooltip.style.fontSize = '12px';
      coordTooltip.style.fontFamily = 'monospace';
      coordTooltip.style.pointerEvents = 'none';
      coordTooltip.style.zIndex = '1000';
      coordTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      document.body.appendChild(coordTooltip);
    }

    if (!visible) {
      coordTooltip.style.display = 'none';
      return;
    }

    coordTooltip.style.display = 'block';
    // Offset from cursor
    coordTooltip.style.left = (clientX + 15) + 'px';
    coordTooltip.style.top = (clientY + 15) + 'px';

    let text = `X: ${worldX}, Y: ${worldY}`; // Already Integers

    // Status Indicator
    let status = '';
    if (type === 'joint') {
      coordTooltip.style.border = '1px solid #3498db';
      status = ' <span style="color:#3498db">● JOINT</span>';
    } else if (type === 'grid') {
      coordTooltip.style.border = '1px solid #2ecc71';
      status = ' <span style="color:#2ecc71"># GRID</span>';
    } else {
      coordTooltip.style.border = '1px solid #7f8c8d';
    }

    coordTooltip.innerHTML = text + status;
  }

  function getSnappedCoords(rawX, rawY) {
    // 1. Grid Snap
    const viewRange = parseFloat(document.getElementById('viewRange').value) || 800;
    const step = calcAdaptiveGridStep(viewRange);

    const snapX = Math.round(rawX / step) * step;
    const snapY = Math.round(rawY / step) * step;

    // Threshold: 10% of step?
    const threshold = step * 0.25;

    let res = { x: rawX, y: rawY, type: 'raw' };

    if (Math.abs(rawX - snapX) < threshold && Math.abs(rawY - snapY) < threshold) {
      res = { x: snapX, y: snapY, type: 'grid' };
    }

    // 2. Joint Snap (Higher priority)
    // We need existing joints. Where to get?
    // From Wizard components or Topology JSON?
    // Topology is easier.
    const topoArea = document.getElementById('topology');
    if (topoArea) {
      try {
        const topo = JSON.parse(topoArea.value);
        // Need SOLVED positions. We have `lastMultilinkSolution` in controls.js
        // But we can't access it easily here.
        // Alternative: get points from wizard components?
        // Or, if we enabled "Joint Click", we know joints are there.
        // But for snapping we need their coords without clicking.
        // Actually, `mechanism-loader.js` doesn't have direct access to solution.
        // Let's implement Grid Snap first. Joint snap requires Solution state sharing.
      } catch (e) { }
    }

    return res;
  }

  // --- Recalculate Transforms (Duplicate logic from Visualization for interactivity) ---
  function getWorldCoords(clientX, clientY) {
    const svg = svgWrap.querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
    const W = vb && vb.width ? vb.width : rect.width;
    const H = vb && vb.height ? vb.height : rect.height;
    // In visualization.js: scale = min(W-2pad, H-2pad) / viewRange
    // We need to read viewRange from UI
    const viewRange = parseFloat(document.getElementById('viewRange').value) || 800;
    const pad = 50;
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;

    // Logic: tx = W/2 + x*scale => x = (tx - W/2)/scale
    // Mouse relative to SVG element (viewBox 0 0 W H)
    // We need to account that the SVG might be scaled via CSS (width:100%)

    const scaleToViewBox = Math.min(rect.width / W, rect.height / H);
    const offsetX = (rect.width - W * scaleToViewBox) / 2;
    const offsetY = (rect.height - H * scaleToViewBox) / 2;

    const relX = (clientX - rect.left - offsetX) / scaleToViewBox;
    const relY = (clientY - rect.top - offsetY) / scaleToViewBox;

    const originX = W / 2;
    const originY = H / 2;

    const worldX = (relX - originX) / scale;
    const worldY = (originY - relY) / scale; // Y is inverted in viz

    return { x: worldX, y: worldY, svgX: relX, svgY: relY };
  }


  // 移除舊的 listener (防止重複綁定，雖此模組只跑一次)
  if (svgWrap._linkClickHandler) {
    svgWrap.removeEventListener('mechanism-link-click', svgWrap._linkClickHandler);
    svgWrap.removeEventListener('mechanism-joint-click', svgWrap._jointClickHandler);
    svgWrap.removeEventListener('click', svgWrap._bgClickHandler);
    svgWrap.removeEventListener('mousemove', svgWrap._moveHandler);
  }

  // 1. Link Click Handler (Delete Link)
  svgWrap._linkClickHandler = (e) => {
    if (drawState === 'DELETE') {
      e.stopPropagation();
      const detail = e.detail; // { id, ... }
      if (confirm(`確定要刪除連桿 ${detail.id} 嗎？`)) {
        removeFromTopology(detail.id);
      }
      // resetDrawState(); // Keep delete mode active
      return;
    }

    // Existing logic for hole creation...
    if (drawState !== 'IDLE') return; // Don't add hole if drawing bar
    const detail = e.detail;
    if (!detail || !detail.p1Val || !detail.p2Val) return;

    const topoArea = document.getElementById('topology');
    if (!topoArea) return;

    const wizard = window.wizard;

    try {
      // ... existing "Add Hole" logic ...
      const topology = JSON.parse(topoArea.value);
      if (!topology.steps) topology.steps = [];

      const dx1 = detail.x - detail.p1Val.x;
      const dy1 = detail.y - detail.p1Val.y;
      const r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const dx2 = detail.x - detail.p2Val.x;
      const dy2 = detail.y - detail.p2Val.y;
      const r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const v1x = detail.p2Val.x - detail.p1Val.x;
      const v1y = detail.p2Val.y - detail.p1Val.y;
      const v2x = detail.x - detail.p1Val.x;
      const v2y = detail.y - detail.p1Val.y;
      const cross = v1x * v2y - v1y * v2x;
      const sign = cross >= 0 ? 1 : -1;

      let idx = 1;
      while (topology.steps.find(s => s.id === `H${idx}`)) idx++;
      const newId = `H${idx}`;

      const safeR1 = parseFloat(r1.toFixed(1));
      const safeR2 = parseFloat(r2.toFixed(1));

      topology.steps.push({
        id: newId, type: 'dyad', p1: detail.p1, p2: detail.p2, r1_val: safeR1, r2_val: safeR2, sign: sign
      });

      if (!topology.visualization) topology.visualization = {};
      if (!topology.visualization.joints) topology.visualization.joints = [];
      if (!topology.visualization.joints.includes(newId)) topology.visualization.joints.push(newId);

      const newJson = JSON.stringify(topology, null, 2);
      topoArea.value = newJson;
      topoArea.dispatchEvent(new Event('input', { bubbles: true }));
      if (wizard) { try { wizard.init(topology); } catch (e) { } }

      const log = document.getElementById('log');
      if (log) log.textContent = `已新增孔位 ${newId} 於連接桿 ${detail.p1}-${detail.p2}`;

    } catch (err) {
      console.error('Failed to add hole:', err);
    }
  };

  // 2. Joint Click Handler (Select Point or Delete)
  svgWrap._jointClickHandler = (e) => {
    if (drawState === 'IDLE') return;
    e.stopPropagation(); // Handled

    const detail = e.detail; // { id, x, y }
    console.log('[Draw] Clicked Joint:', detail);

    if (drawState === 'DELETE') {
      if (confirm(`確定要刪除點 ${detail.id} 及其連接的桿件嗎？`)) {
        removeFromTopology(detail.id);
      }
      return;
    }

    if (drawState === 'WAIT_P1') {
      drawP1 = { id: detail.id, isNew: false, x: detail.x, y: detail.y };
      drawState = 'WAIT_P2';
      drawBtn.textContent = `P1: ${detail.id} -> 選取終點...`;
    } else if (drawState === 'WAIT_P2') {
      // Finish
      const drawP2 = { id: detail.id, isNew: false, x: detail.x, y: detail.y };
      finishDraw(drawP1, drawP2);
    }
  };

  // 3. Background Click Handler (Select Free Point)
  svgWrap._bgClickHandler = (e) => {
    if (drawState === 'IDLE') return;

    // Ensure we are clicking on SVG (not on a button or something)
    // Note: 'click' bubbles from Joint too, but Joint stops Prop if matched?
    // Actually our Joint Click is a CustomEvent dispatched from an inner element.
    // The inner element naturally bubbles 'click' too.
    // We need to coordinate.
    // The joints have e.stopPropagation() on their 'click' listener which dispatches custom event.
    // So this _bgClickHandler (native 'click') will NOT fire if joint is clicked. Correct.

    const coords = getWorldCoords(e.clientX, e.clientY);

    // Use snapped coords if available, otherwise FORCE INTEGER ROUNDING for raw coords
    let finalX = Math.round(coords.x);
    let finalY = Math.round(coords.y);

    if (currentSnapPoint && currentSnapPoint.type !== 'raw') {
      finalX = Math.round(currentSnapPoint.x);
      finalY = Math.round(currentSnapPoint.y);
    }

    if (drawState === 'ADD_POINT') {
      addPointToTopology(finalX, finalY);
      // Don't reset state immediately? User might want to add multiple points.
      // Let's keep it active.
      // resetDrawState();
      // Just show a small visual feedback? Log?
    } else if (drawState === 'WAIT_P1') {
      drawP1 = { id: null, isNew: true, x: finalX, y: finalY };
      drawState = 'WAIT_P2';
      drawBtn.textContent = `P1: (${finalX},${finalY}) -> 選取終點...`;
    } else if (drawState === 'WAIT_P2') {
      const drawP2 = { id: null, isNew: true, x: finalX, y: finalY };
      finishDraw(drawP1, drawP2);
    }
  }

  // 4. Mouse Move (Ghost Line + Tooltip)
  svgWrap._moveHandler = (e) => {
    // Always track coords for tooltip
    const coords = getWorldCoords(e.clientX, e.clientY);
    const snapped = getSnappedCoords(coords.x, coords.y);
    currentSnapPoint = snapped;

    // Determine Display/Logic Coords (Always Integer)
    let displayX = Math.round(coords.x);
    let displayY = Math.round(coords.y);

    if (snapped.type !== 'raw') {
      displayX = Math.round(snapped.x);
      displayY = Math.round(snapped.y);
    }

    updateCoordTooltip(true, e.clientX, e.clientY, displayX, displayY, snapped.type);

    if (drawState !== 'WAIT_P2' || !drawP1) return;

    updateGhostLine();
    if (ghostLine) {
      // ... ghost line update logic using displayX/displayY or snapped ...
      // Need to re-calc svg coords for ghost line end
      const svg = svgWrap.querySelector('svg');
      // ... get scale ...
      const viewRange = parseFloat(document.getElementById('viewRange').value) || 800;
      const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
      const W = vb && vb.width ? vb.width : svg.clientWidth;
      const H = vb && vb.height ? vb.height : svg.clientHeight;
      const pad = 50;
      const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;

      const p1SvgX = (W / 2) + drawP1.x * scale;
      const p1SvgY = (H / 2) - drawP1.y * scale;

      const targetSvgX = (W / 2) + displayX * scale;
      const targetSvgY = (H / 2) - displayY * scale;

      ghostLine.setAttribute('x1', p1SvgX);
      ghostLine.setAttribute('y1', p1SvgY);
      ghostLine.setAttribute('x2', targetSvgX);
      ghostLine.setAttribute('y2', targetSvgY);
    }
  }

  // Hide tooltip on mouse leave
  svgWrap.addEventListener('mouseleave', () => updateCoordTooltip(false));

  function finishDraw(p1, p2) {
    console.log('[Draw] Finish:', p1, p2);

    // Force integer coordinates for new points
    if (p1 && p1.isNew) {
      p1.x = Math.round(p1.x);
      p1.y = Math.round(p1.y);
    }
    if (p2 && p2.isNew) {
      p2.x = Math.round(p2.x);
      p2.y = Math.round(p2.y);
    }

    if (window.wizard) {
      window.wizard.addLinkFromCanvas(p1, p2);
    }
    resetDrawState();
  }

  function addPointToTopology(x, y) {
    const topoArea = document.getElementById('topology');
    if (!topoArea) return;
    try {
      const topology = JSON.parse(topoArea.value);
      if (!topology.steps) topology.steps = [];

      // Generate ID
      let idx = 1;
      // Find max O index
      // Or just find next available O{n}
      while (topology.steps.find(s => s.id === `O${idx}`)) idx++;
      const newId = `O${idx}`;

      topology.steps.push({
        id: newId,
        type: 'ground',
        x: x,
        y: y
      });

      // Visual joints
      if (!topology.visualization) topology.visualization = {};
      if (!topology.visualization.joints) topology.visualization.joints = [];
      topology.visualization.joints.push(newId);

      const newJson = JSON.stringify(topology, null, 2);
      topoArea.value = newJson;
      topoArea.dispatchEvent(new Event('input', { bubbles: true }));

      if (window.wizard) { try { window.wizard.init(topology); } catch (e) { } }

      const log = document.getElementById('log');
      if (log) log.textContent = `已新增固定點 ${newId} (${x}, ${y})`;
    } catch (e) {
      console.error(e);
    }
  }

  function removeFromTopology(targetId) {
    const topoArea = document.getElementById('topology');
    if (!topoArea) return;
    try {
      let topology = JSON.parse(topoArea.value);
      if (!topology.steps) return;

      // Filter out the target step
      const initialLen = topology.steps.length;
      // If target is a Point, we must also remove Bars that reference this Point
      let idsToRemove = [targetId];

      // If we deleted a point, check for connected bars
      const isPoint = targetId.startsWith('O') || targetId.startsWith('H') || targetId.startsWith('P') || targetId.startsWith('J');
      // Simple heuristic: if it looks like a point ID

      if (isPoint) {
        // Find all bars that use this point as p1 or p2
        const ConnectedBars = topology.steps.filter(s =>
          s.type === 'bar' && (s.p1 === targetId || s.p2 === targetId)
        );
        ConnectedBars.forEach(b => idsToRemove.push(b.id));
      }

      topology.steps = topology.steps.filter(s => !idsToRemove.includes(s.id));

      // Cleanup visualization list
      if (topology.visualization && topology.visualization.joints) {
        topology.visualization.joints = topology.visualization.joints.filter(id => !idsToRemove.includes(id));
      }

      const newJson = JSON.stringify(topology, null, 2);
      topoArea.value = newJson;
      topoArea.dispatchEvent(new Event('input', { bubbles: true }));

      if (window.wizard) { try { window.wizard.init(topology); } catch (e) { } }

      const log = document.getElementById('log');
      if (log) log.textContent = `已刪除物件: ${idsToRemove.join(', ')}`;
    } catch (e) {
      console.error(e);
    }
  }

  svgWrap.addEventListener('mechanism-link-click', svgWrap._linkClickHandler);
  svgWrap.addEventListener('mechanism-joint-click', svgWrap._jointClickHandler);
  svgWrap.addEventListener('click', svgWrap._bgClickHandler);
  svgWrap.addEventListener('mousemove', svgWrap._moveHandler);

  // 5. Mouse Wheel Zoom Handler
  svgWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const viewRangeInput = document.getElementById('viewRange');
    if (!viewRangeInput) return;

    let currentRange = parseFloat(viewRangeInput.value) || 800;
    // Sensitivity: 1 tick = 100px? Or proportional?
    // Let's use proportional for smoother zoom
    const zoomFactor = 1.1;

    if (e.deltaY < 0) {
      // Zoom In -> Decrease Range
      currentRange /= zoomFactor;
    } else {
      // Zoom Out -> Increase Range
      currentRange *= zoomFactor;
    }

    // Clamp values
    currentRange = Math.max(50, Math.min(5000, currentRange));

    // Update Input
    viewRangeInput.value = Math.round(currentRange);

    // Update Fixed Label
    updateFixedGridLabel();

    // Update Slider if exists
    const slider = document.getElementById('viewRangeSlider');
    const sliderVal = document.getElementById('viewRangeSliderValue');
    if (slider) {
      // Ensure slider range covers this value?
      const max = parseFloat(slider.max);
      if (currentRange > max) slider.max = currentRange;
      slider.value = Math.round(currentRange);
      if (sliderVal) sliderVal.textContent = Math.round(currentRange);
    }

    // Trigger Update
    const btnUpdate = document.getElementById('btnUpdate');
    if (btnUpdate) btnUpdate.click(); // Reuse existing update flow
  }, { passive: false });
}
