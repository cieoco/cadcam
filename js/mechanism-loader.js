/**
 * Universal Mechanism Page Loader
 * 通用機構頁面載入器
 */

import { getMechanismFromURL, generateParameterHTML, MECHANISMS } from './mechanism-config.js';
import { setupUIHandlers, updatePreview } from './ui/controls.js';
import { downloadText, downloadZip, log, calcAdaptiveGridStep } from './utils.js';
import { MechanismWizard } from './ui/wizard.js?v=debug_1';

const topologyHistory = [];

function pushTopologyHistory() {
  const topoArea = document.getElementById('topology');
  if (!topoArea) return;
  const current = topoArea.value || '';
  if (!current) return;
  const last = topologyHistory[topologyHistory.length - 1];
  if (last !== current) {
    topologyHistory.push(current);
  }
  refreshUndoButtonState();
}

function applyTopologyValue(value) {
  const topoArea = document.getElementById('topology');
  if (!topoArea) return;
  topoArea.value = value;
  topoArea.dispatchEvent(new Event('input', { bubbles: true }));
  updatePreview();
}

function undoTopology() {
  if (!topologyHistory.length) return;
  const previous = topologyHistory.pop();
  applyTopologyValue(previous);
  refreshUndoButtonState();
}

function refreshUndoButtonState() {
  const btn = document.getElementById('btnUndo');
  if (!btn) return;
  btn.disabled = topologyHistory.length === 0;
}

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
    <input id="viewRange" type="number" min="50" max="2000" step="10" value="800" style="display:none" />
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
          const nextValue = JSON.stringify(newTopo, null, 2);
          if (topoArea.value !== nextValue) {
            pushTopologyHistory();
          }
          topoArea.value = nextValue;
          // 觸發輸入事件以更新動態參數
          topoArea.dispatchEvent(new Event('input', { bubbles: true }));
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

    // 🌟 核心修正：主動觸發第一次預覽繪圖，確保畫面不留白
    setTimeout(() => {
      updatePreview();
    }, 200);

  } catch (error) {
    console.error('Failed to load mechanism modules:', error);
    document.getElementById('log').textContent =
      `錯誤：無法載入 ${mech.name}模組。\n${error.message}\n\n此機構可能尚未實作。`;
  }
}

// 🌟 核心修正：監聽視窗縮放，自動調整畫布大小
window.addEventListener('resize', () => {
  if (window._resizeTimer) clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(() => {
    updatePreview();
  }, 150);
});

// DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMechanismPage);
} else {
  initMechanismPage();
}

// 🌟 暴露給全域 (供非模組腳本或主控台使用)
window.initMechanismPage = initMechanismPage;
window.updatePreview = updatePreview;
window.pushTopologyHistory = pushTopologyHistory;
window.undoTopology = undoTopology;

/**
 * 設定連結點擊互動功能 (Add Hole)
 */
function setupLinkClickHandler() {
  const svgWrap = document.getElementById('svgWrap');
  // 🌟 全域視圖偏移量 (Pan Offset)
  if (!window.mechanismViewOffset) window.mechanismViewOffset = { x: 0, y: 0 };

  // Pan State
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let initialPanOffset = { x: 0, y: 0 };
  let lastMiddleClickTime = 0;
  let lastMiddleClickX = 0;
  let lastMiddleClickY = 0;

  // 1. Middle Mouse Button Pan (Mousedown)
  svgWrap.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle Button
      e.preventDefault();

      // Double Click Detection (Reset View)
      const now = Date.now();
      const dist = Math.abs(e.clientX - lastMiddleClickX) + Math.abs(e.clientY - lastMiddleClickY);

      if (now - lastMiddleClickTime < 300 && dist < 10) {
        console.log('[View] Reset to Center');
        window.mechanismViewOffset = { x: 0, y: 0 };
        const btnUpdate = document.getElementById('btnUpdate');
        if (btnUpdate) btnUpdate.click();
        return;
      }
      lastMiddleClickTime = now;
      lastMiddleClickX = e.clientX;
      lastMiddleClickY = e.clientY;

      // Start Pan
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      initialPanOffset = { ...window.mechanismViewOffset };
      svgWrap.style.cursor = 'grabbing';
    }
  });

  // 2. Mouse Move (Unified Handler for Pan)
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    e.preventDefault();

    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    const currentPanX = initialPanOffset.x + dx;
    const currentPanY = initialPanOffset.y + dy;

    const svg = svgWrap.querySelector('svg');
    if (svg && svg.viewBox && svg.viewBox.baseVal) {
      const vb = svg.viewBox.baseVal;
      // Shift ViewBox: Camera moves opposite to Pan
      // ViewBox Origin = -(PanOffset)
      if (typeof vb.width === 'number') {
        svg.setAttribute('viewBox', `${-currentPanX} ${-currentPanY} ${vb.width} ${vb.height}`);
      }
    }
  });

  // 3. Mouse Up (Commit Pan)
  window.addEventListener('mouseup', (e) => {
    if (isPanning && e.button === 1) {
      isPanning = false;
      svgWrap.style.cursor = '';

      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;

      // Commit to Global State
      window.mechanismViewOffset.x = initialPanOffset.x + dx;
      window.mechanismViewOffset.y = initialPanOffset.y + dy;

      // ⛔️ No Re-render needed! The SVG viewBox is already in the correct state.
      // Future re-renders (e.g., param change) will pick up window.mechanismViewOffset via renderMultilink.
    }
  });

  // 4. Mouse Wheel Zoom
  svgWrap.addEventListener('wheel', (e) => {
    e.preventDefault();

    const viewRangeInput = document.getElementById('viewRange');
    const viewRangeSlider = document.getElementById('viewRangeSlider');
    if (!viewRangeInput || !viewRangeSlider) return;

    let currentRange = parseFloat(viewRangeInput.value) || 800;

    // Zoom factor: 1.1 for zoom out, 0.9 for zoom in
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    let newRange = currentRange * factor;

    // Constrain range (similar to slider min/max but can be slightly more flexible)
    newRange = Math.max(50, Math.min(2000, newRange));

    if (newRange !== currentRange) {
      viewRangeInput.value = Math.round(newRange);
      viewRangeSlider.value = Math.round(newRange);

      // Update Label
      const label = document.getElementById('viewRangeSliderValue');
      if (label) label.textContent = Math.round(newRange);

      // Trigger re-render
      updatePreview();
      updateFixedGridLabel();
    }
  }, { passive: false });


  // --- State Machine for Drawing ---
  // State: IDLE, DRAWING_P1 (Waiting for P2), 
  let drawState = 'IDLE';
  let drawP1 = null; // { id, x, y, isNew }
  let ghostLine = null;
  let lastPointer = { x: 0, y: 0 };

  // Helper to find the H3 title element
  function getTitleElement() {
    const h3s = document.querySelectorAll('h3');
    for (let h3 of h3s) {
      if (h3.textContent.includes('2D')) {
        return h3;
      }
    }
    const wrap = document.getElementById('svgWrap');
    if (wrap) {
      const card = wrap.closest('.card');
      if (card) {
        return card.querySelector('h3');
      }
    }
    return null;
  }

  const titleEl = getTitleElement();
  const titleParent = titleEl ? titleEl.parentNode : null;

  // Add "Add Point" Button
  let addPointBtn = document.getElementById('btnAddPoint');
  if (!addPointBtn && titleEl && titleParent) {
    addPointBtn = document.createElement('button');
    addPointBtn.id = 'btnAddPoint';
    addPointBtn.innerHTML = '新增點位';
    addPointBtn.style.marginLeft = '15px'; // Space from title
    addPointBtn.style.border = '1px solid #aaa';

    // Insert after title
    titleParent.insertBefore(addPointBtn, titleEl.nextSibling);

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

  // Add "Select" Button
  let selectBtn = document.getElementById('btnSelect');
  if (!selectBtn && titleEl && titleParent) {
    selectBtn = document.createElement('button');
    selectBtn.id = 'btnSelect';
    selectBtn.innerHTML = '選取';
    selectBtn.style.marginLeft = '10px';
    selectBtn.style.border = '1px solid #aaa';

    const refNode = addPointBtn || titleEl;
    refNode.parentNode.insertBefore(selectBtn, refNode.nextSibling);

    selectBtn.onclick = () => {
      if (drawState === 'IDLE') {
        drawState = 'SELECT';
        selectBtn.style.background = '#dfe6e9';
        selectBtn.textContent = '選取...';
        document.getElementById('svgWrap').style.cursor = 'pointer';
      } else {
        resetDrawState();
      }
    };
  }

  // Add "Undo" Button
  let undoBtn = document.getElementById('btnUndo');
  if (!undoBtn && titleEl && titleParent) {
    undoBtn = document.createElement('button');
    undoBtn.id = 'btnUndo';
    undoBtn.innerHTML = '回復上一步';
    undoBtn.style.marginLeft = '10px';
    undoBtn.style.border = '1px solid #aaa';
    undoBtn.disabled = true;

    const refNode = selectBtn || addPointBtn || titleEl;
    refNode.parentNode.insertBefore(undoBtn, refNode.nextSibling);

    undoBtn.onclick = () => {
      undoTopology();
    };
  }

  refreshUndoButtonState();

  // Add Toolbar Button for Drawing if not exists
  let drawBtn = document.getElementById('btnDrawLink');
  if (!drawBtn && titleEl && titleParent) {
    drawBtn = document.createElement('button');
    drawBtn.id = 'btnDrawLink';
    drawBtn.innerHTML = '畫桿件';
    drawBtn.style.marginLeft = '10px'; // Space from previous btn
    drawBtn.style.border = '1px solid #aaa';

    // Insert after Select button if exists
    const refNode = selectBtn || addPointBtn || titleEl;
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
  if (!zenBtn && titleEl && titleParent) {
    zenBtn = document.createElement('button');
    zenBtn.id = 'btnZenMode';
    zenBtn.innerHTML = '全螢幕';
    zenBtn.style.marginLeft = '10px';
    zenBtn.style.border = '1px solid #aaa';

    // Insert after draw button (which is nextSibling of title now)
    // Actually, drawBtn is inserted. So titleEl.nextSibling is drawBtn.
    // Insert after drawBtn.
    titleParent.insertBefore(zenBtn, drawBtn.nextSibling);

    zenBtn.onclick = () => {
      document.body.classList.toggle('zen-mode');
      const isZen = document.body.classList.contains('zen-mode');
      zenBtn.innerHTML = isZen ? '恢復' : '全螢幕';
      zenBtn.style.background = isZen ? '#fab1a0' : '';

      // Force redraw/resize
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };
  }

  function resetDrawState(isCancel = true) {
    drawState = 'IDLE';
    drawP1 = null;
    if (drawBtn) {
      drawBtn.style.background = '';
      drawBtn.textContent = '畫桿件';
    }
    if (addPointBtn) {
      addPointBtn.style.background = '';
      addPointBtn.textContent = '新增點位';
    }
    if (selectBtn) {
      selectBtn.style.background = '';
      selectBtn.textContent = '選取';
    }
    if (ghostLine) {
      ghostLine.remove();
      ghostLine = null;
    }
    hideContextMenu();
    document.getElementById('svgWrap').style.cursor = 'default';
    if (isCancel) console.log('[Draw] Canceled');
  }

  let contextMenu = null;

  function ensureContextMenu() {
    if (contextMenu) return contextMenu;
    contextMenu = document.createElement('div');
    contextMenu.id = 'contextMenu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.background = '#fff';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.borderRadius = '6px';
    contextMenu.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
    contextMenu.style.padding = '6px 0';
    contextMenu.style.zIndex = '9999';
    contextMenu.style.minWidth = '140px';
    contextMenu.style.fontSize = '14px';
    contextMenu.style.display = 'none';
    document.body.appendChild(contextMenu);
    return contextMenu;
  }

  function showContextMenu(items, clientX, clientY) {
    const menu = ensureContextMenu();
    menu.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.padding = '8px 12px';
      btn.style.border = '0';
      btn.style.background = 'transparent';
      btn.style.textAlign = 'left';
      btn.style.cursor = 'pointer';
      btn.onmouseenter = () => { btn.style.background = '#f1f2f6'; };
      btn.onmouseleave = () => { btn.style.background = 'transparent'; };
      btn.onclick = () => {
        hideContextMenu();
        item.action();
      };
      menu.appendChild(btn);
    });
    menu.style.display = 'block';
    const rect = menu.getBoundingClientRect();
    const pad = 8;
    const maxX = window.innerWidth - rect.width - pad;
    const maxY = window.innerHeight - rect.height - pad;
    const left = Math.min(clientX, maxX);
    const top = Math.min(clientY, maxY);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function hideContextMenu() {
    if (!contextMenu) return;
    contextMenu.style.display = 'none';
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
    if (!svg) return null;
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

  // 1. Link Click Handler (Select/Snap Link)
  svgWrap._linkClickHandler = (e) => {
    e.preventDefault();
    e.stopPropagation(); // 停止冒泡，防止觸發 _bgClickHandler 產生 O 點

    const detail = e.detail || {};
    const id = detail.id;
    const wizard = window.wizard;

    if (drawState === 'SELECT') {
      const items = [{ label: '刪除桿件', action: () => id && removeFromTopology(id) }];
      openPropertySheet(items, `桿件 ${id || ''} 屬性`, id);
      return;
    }

    // --- 智慧加孔邏輯 (對接 Wizard) ---
    if (!wizard || !detail.p1Val || !detail.p2Val) return;

    // 1. 計算座標與初始距離
    const r1 = Math.round(Math.sqrt(Math.pow(detail.x - detail.p1Val.x, 2) + Math.pow(detail.y - detail.p1Val.y, 2)));
    const r2 = Math.round(Math.sqrt(Math.pow(detail.x - detail.p2Val.x, 2) + Math.pow(detail.y - detail.p2Val.y, 2)));

    // 2. 呼叫 Wizard API 建立孔位 (這會自動處理參數、清單同步、與右側滑桿產出)
    pushTopologyHistory();
    wizard.addHoleFromCanvas(id, detail.p1, detail.p2, r1, r2, detail.x, detail.y);

    // 🌟 修正：加孔後立即結束繪圖狀態，防止產生「幽靈雜點」
    drawState = 'IDLE';
    drawP1 = null;
    drawBtn.textContent = '點擊新增...';
    drawBtn.classList.remove('active');

    // 隱藏屬性面板 (如果有的話)
    hideContextMenu();
  };



  // 2. Joint Click Handler (Select Point)
  svgWrap._jointClickHandler = (e) => {
    if (drawState === 'IDLE') return;

    if (drawState === 'SELECT') {
      e.stopPropagation();
      const detail = e.detail || {};
      const id = detail.id;
      const label = id && String(id).startsWith('H') ? '刪除孔位' : '刪除關節';
      const items = [
        { label, action: () => id && removeFromTopology(id) }
      ];
      openPropertySheet(items, `節點 ${id || ''} 屬性`, id);

      return;
    }

    e.stopPropagation(); // Handled

    const detail = e.detail; // { id, x, y }
    console.log('[Draw] Clicked Joint:', detail);

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

    if (drawState === 'SELECT') {
      hideContextMenu();
      return;
    }

    // Ensure we are clicking on SVG (not on a button or something)
    // Note: 'click' bubbles from Joint too, but Joint stops Prop if matched?
    // Actually our Joint Click is a CustomEvent dispatched from an inner element.
    // The inner element naturally bubbles 'click' too.
    // We need to coordinate.
    // The joints have e.stopPropagation() on their 'click' listener which dispatches custom event.
    // So this _bgClickHandler (native 'click') will NOT fire if joint is clicked. Correct.

    const coords = getWorldCoords(e.clientX, e.clientY);
    if (!coords) return;

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
    lastPointer = { x: e.clientX, y: e.clientY };
    // Always track coords for tooltip
    const coords = getWorldCoords(e.clientX, e.clientY);
    if (!coords) {
      updateCoordTooltip(false);
      return;
    }
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
    resetDrawState(false);
  }

  function addPointToTopology(x, y) {
    const topoArea = document.getElementById('topology');
    if (!topoArea) return;
    pushTopologyHistory();
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
      if (log) log.textContent = `已新增點位 ${newId} (${x}, ${y})`;
    } catch (e) {
      console.error(e);
    }
  }

  function removeFromTopology(targetId) {
    if (!targetId) return;
    const targetStr = String(targetId);
    const topoArea = document.getElementById('topology');
    if (!topoArea) return;
    pushTopologyHistory();
    try {
      let topology = JSON.parse(topoArea.value);
      if (!topology.steps) return;

      // Filter out the target step
      const initialLen = topology.steps.length;
      // If target is a Point, we must also remove Bars that reference this Point
      let idsToRemove = [targetStr];

      // If we deleted a point, check for connected bars
      const isPoint = targetStr.startsWith('O') || targetStr.startsWith('H') || targetStr.startsWith('P') || targetStr.startsWith('J');
      // Simple heuristic: if it looks like a point ID

      if (isPoint) {
        // Find all bars that use this point as p1 or p2
        const ConnectedBars = topology.steps.filter(s =>
          s.type === 'bar' && (s.p1 === targetStr || s.p2 === targetStr)
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
  // 5. Mouse Wheel Zoom Handler (Center-Invariant)
  svgWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const viewRangeInput = document.getElementById('viewRange');
    if (!viewRangeInput) return;

    let oldRange = parseFloat(viewRangeInput.value) || 800;
    const zoomFactor = 1.1;
    let newRange = oldRange;

    if (e.deltaY < 0) {
      // Zoom In -> Decrease Range
      newRange /= zoomFactor;
    } else {
      // Zoom Out -> Increase Range
      newRange *= zoomFactor;
    }

    // Clamp values
    newRange = Math.max(50, Math.min(5000, newRange));

    // 🌟 Center-Invariant Zoom Logic 🌟
    // Calculate Zoom Ratio (How much the world scaled up/down)
    // Scale is inversely proportional to Range.
    // If Range gets smaller (Zoom In), Scale gets bigger.
    // Ratio = ScaleNew / ScaleOld = OldRange / NewRange
    const ratio = oldRange / newRange;

    // Adjust Pan Offset to keep the center stationary
    if (window.mechanismViewOffset) {
      window.mechanismViewOffset.x *= ratio;
      window.mechanismViewOffset.y *= ratio;
    }

    // Update Input
    viewRangeInput.value = Math.round(newRange);

    // Update Fixed Label
    updateFixedGridLabel();

    // Update Slider if exists
    const slider = document.getElementById('viewRangeSlider');
    const sliderVal = document.getElementById('viewRangeSliderValue');
    if (slider) {
      const max = parseFloat(slider.max);
      if (newRange > max) slider.max = newRange;
      slider.value = Math.round(newRange);
      if (sliderVal) sliderVal.textContent = Math.round(newRange);
    }

    // Trigger Update
    const btnUpdate = document.getElementById('btnUpdate');
    if (btnUpdate) btnUpdate.click();
  }, { passive: false });
}

/**
 * Property Sheet Logic (Mobile/Overlay)
 */
function openPropertySheet(items, title, selectedId) {
  const sheet = document.getElementById('propertySheet');
  const sheetContent = document.getElementById('sheetContent');
  if (!sheet || !sheetContent) return;

  const hasInputCrank = (topology) =>
    Boolean(topology && Array.isArray(topology.steps) && topology.steps.some(s => s.type === 'input_crank'));

  // 1. Update Title
  const header = sheet.querySelector('.sheet-header h4');
  if (header) header.textContent = title || '屬性控制';

  // 2. Configure Delete Button
  const btnDelete = document.getElementById('btnDeleteLink');
  const delItem = items.find(i => i.label && i.label.includes('刪除'));
  if (btnDelete) {
    if (delItem) {
      btnDelete.style.display = 'block';
      const newBtn = btnDelete.cloneNode(true);
      btnDelete.parentNode.replaceChild(newBtn, btnDelete);
      newBtn.onclick = () => {
        if (confirm(`確定要${delItem.label}?`)) {
          delItem.action();
          closePropertySheet();
        }
      };
    } else {
      btnDelete.style.display = 'none';
    }
  }

  // 3. Populate Content
  const emptyMsg = document.getElementById('emptyPropMsg');
  if (emptyMsg) emptyMsg.style.display = 'none';

  Array.from(sheetContent.children).forEach(child => {
    if (child.id !== 'emptyPropMsg') child.remove();
  });

  // 🌟 特殊模式偵測：如果 items 包含多個帶有 action 的項目（且不僅僅是刪除），
  // 則切換為「選單模式」，直接渲染按鈕列表。
  const menuItems = items.filter(i => i.action && (!i.label || !i.label.includes('刪除')));
  if (menuItems.length > 0) {
    const menuContainer = document.createElement('div');
    menuContainer.style.display = 'flex';
    menuContainer.style.flexDirection = 'column';
    menuContainer.style.gap = '10px';
    menuContainer.style.padding = '10px 0';

    menuItems.forEach(item => {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.className = 'btn-secondary'; // 使用現有樣式
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.padding = '12px';
      btn.onclick = () => {
        item.action();
        // 如果是導航行為則不關閉，否則關閉
        if (!item.keepOpen) closePropertySheet();
      };
      menuContainer.appendChild(btn);
    });
    sheetContent.appendChild(menuContainer);

    // 顯示 Sheet
    sheet.classList.add('active');
    const overlay = document.getElementById('sheetOverlay');
    if (overlay) overlay.classList.add('active');
    return; // ⛔️ 結束函式，不執行後面的屬性編輯器邏輯
  }

  const topoArea = document.getElementById('topology');

  if (typeof selectedId === 'string' && selectedId.startsWith('link-')) {
    // --- 桿件/參數 處理 ---
    const parts = selectedId.split('-');
    if (parts.length >= 3) {
      const paramName = parts[1];
      const originalInput = document.getElementById(`dyn_${paramName}`);
      const originalWrapper = originalInput ? originalInput.closest('.dynamic-param-wrapper') : null;
      if (originalWrapper) {
        const clone = originalWrapper.cloneNode(true);
        clone.style.marginBottom = '0';
        sheetContent.appendChild(clone);
        const origNum = originalWrapper.querySelector('input[type="number"]');
        const origRange = originalWrapper.querySelector('input[type="range"]');
        const cloneNum = clone.querySelector('input[type="number"]');
        const cloneRange = clone.querySelector('input[type="range"]');
        const triggerOriginal = () => {
          if (origNum) {
            origNum.dispatchEvent(new Event('input', { bubbles: true }));
            origNum.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        if (cloneNum && origNum) {
          cloneNum.id = ''; cloneNum.value = origNum.value;
          cloneNum.oninput = (e) => {
            origNum.value = e.target.value;
            if (origRange) origRange.value = e.target.value;
            if (cloneRange) cloneRange.value = e.target.value;
            triggerOriginal();
          };
        }
        if (cloneRange && origRange) {
          cloneRange.id = ''; cloneRange.value = origRange.value;
          cloneRange.oninput = (e) => {
            origRange.value = e.target.value;
            if (origNum) origNum.value = e.target.value;
            if (cloneNum) cloneNum.value = e.target.value;
            triggerOriginal();
          };
        }
      }
    }
  } else if (typeof selectedId === 'string' && (selectedId.startsWith('O') || selectedId.startsWith('P') || selectedId.startsWith('J'))) {
    // --- 🎨 節點行為設定 (LEGO 邏輯) ---
    if (topoArea && topoArea.value) {
      try {
        const topology = JSON.parse(topoArea.value);
        if (!topology.steps) topology.steps = [];
        let step = topology.steps.find(s => s.id === selectedId);
        if (!step) step = { id: selectedId, type: 'joint' };

        const behaviorWrapper = document.createElement('div');
        behaviorWrapper.className = 'dynamic-param-wrapper';
        behaviorWrapper.style.padding = '10px';
        behaviorWrapper.style.background = '#f1f2f6';
        behaviorWrapper.style.border = '1px solid #dfe4ea';
        behaviorWrapper.style.borderRadius = '8px';

        const currentType = step.type || 'joint';
        behaviorWrapper.innerHTML = `
          <div style="font-weight:bold; margin-bottom:10px; color:#2f3542; font-size:14px; display:flex; align-items:center; gap:5px;">
             <span>⚙️</span> 節點角色設定
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
             <button id="btnSetGround" title="固定在地的支點" style="padding:10px 5px; cursor:pointer; font-weight:bold; font-size:12px; background:${currentType === 'ground' ? '#2f3542' : '#ffffff'}; color:${currentType === 'ground' ? '#fff' : '#2f3542'}; border:2px solid #2f3542; border-radius:6px; transition:all 0.2s;">固定 (地)</button>
             <button id="btnSetMotor" title="由馬達驅動的旋轉臂端點" style="padding:10px 5px; cursor:pointer; font-weight:bold; font-size:12px; background:${currentType === 'input_crank' ? '#e67e22' : '#ffffff'}; color:${currentType === 'input_crank' ? '#fff' : '#e67e22'}; border:2px solid #e67e22; border-radius:6px; transition:all 0.2s;">馬達 (轉)</button>
             <button id="btnSetJoint" title="隨桿件運動的自由關節" style="padding:10px 5px; cursor:pointer; font-weight:bold; font-size:12px; background:${currentType === 'joint' ? '#3742fa' : '#ffffff'}; color:${currentType === 'joint' ? '#fff' : '#3742fa'}; border:2px solid #3742fa; border-radius:6px; transition:all 0.2s;">浮動 (點)</button>
          </div>
        `;

        const saveAndRefresh = () => {
          // 1. 同步到 steps (先移除舊的，再加入新的，避免重複)
          topology.steps = (topology.steps || []).filter(s => s.id !== selectedId);
          topology.steps.push(step);

          // 2. 同步到 _wizard_data (讓小幫手 UI 也更新)
          if (topology._wizard_data && Array.isArray(topology._wizard_data)) {
            topology._wizard_data.forEach(w => {
              const types = { 'ground': 'fixed', 'input_crank': 'input', 'joint': 'joint' };
              const wizardType = types[step.type] || 'joint';
              if (w.p1 && w.p1.id === selectedId) w.p1.type = wizardType;
              if (w.p2 && w.p2.id === selectedId) w.p2.type = wizardType;
              if (w.p3 && w.p3.id === selectedId) w.p3.type = wizardType;
            });
          }

          topoArea.value = JSON.stringify(topology, null, 2);
          topoArea.dispatchEvent(new Event('input', { bubbles: true }));
          if (window.wizard) window.wizard.init(topology);
          setTimeout(() => openPropertySheet(items, title, selectedId), 100);
        };

        behaviorWrapper.querySelector('#btnSetGround').onclick = () => {
          step.type = 'ground';
          const detail = items.find(i => i.id === selectedId) || {};
          step.x = step.x ?? (detail.x || 0);
          step.y = step.y ?? (detail.y || 0);
          delete step.center; delete step.len_param;
          saveAndRefresh();
        };

        behaviorWrapper.querySelector('#btnSetJoint').onclick = () => {
          step.type = 'joint';
          delete step.x; delete step.y; delete step.center; delete step.len_param;
          saveAndRefresh();
        };

        behaviorWrapper.querySelector('#btnSetMotor').onclick = () => {
          const wizardData = topology._wizard_data || [];
          const connections = wizardData.filter(w => w.type === 'bar' && (w.p1.id === selectedId || w.p2.id === selectedId));

          if (connections.length === 0) {
            alert('馬達點必須連接至少一根連桿！');
            return;
          }

          // 定義馬達設定邏輯 (封裝以便重複使用)
          const setMotorLogic = (targetLink) => {
            // 1. 設定本點為固定 (Fixed) (透過 Wizard Data 修改)
            const targetWizardLink = wizardData.find(w => w.id === targetLink.id);
            if (!targetWizardLink) return;

            const myPointProp = (targetWizardLink.p1.id === selectedId) ? 'p1' : 'p2';
            const otherPointProp = (targetWizardLink.p1.id === selectedId) ? 'p2' : 'p1';

            // 更新所有連接此點的桿件端點屬性為 fixed (物理連結)
            connections.forEach(conn => {
              if (conn.p1.id === selectedId) conn.p1.type = 'fixed';
              if (conn.p2.id === selectedId) conn.p2.type = 'fixed';
              conn.isInput = false; // 先清除所有 Input 標記
            });

            // 2. 設定選定的桿件為 Input Crank
            targetWizardLink.isInput = true;

            // 3. 設定另一端為 Floating (因為它必須繞著馬達轉)
            targetWizardLink[otherPointProp].type = 'floating';

            // 立即儲存並刷新
            if (window.wizard) {
              window.wizard.components = wizardData;
              window.wizard.syncTopology();
              alert(`已將 ${selectedId} 設為馬達轉軸，並指定 ${targetLink.id} 為驅動曲柄 (L=${targetWizardLink.lenParam})。`);
            }
          };

          // 如果只有一條連桿，直接設定
          if (connections.length === 1) {
            setMotorLogic(connections[0]);
            return;
          }

          // 如果有多條，顯示選單讓使用者選擇「哪一條是用來轉的？」
          const linkItems = connections.map(link => ({
            label: `使用 ${link.id} (L=${link.lenParam || '?'}) 作為曲柄`,
            action: () => setMotorLogic(link)
          }));

          linkItems.push({ label: '❌ 取消', action: () => openPropertySheet(items, title, selectedId) }); // 返回上一層

          openPropertySheet(linkItems, `請選擇連接 ${selectedId} 的驅動連桿`, selectedId);
        };

        sheetContent.appendChild(behaviorWrapper);

        // --- 孔位專屬：剛體距離調整 (Rigid Body Offsets) ---
        if (currentType === 'dyad') {
          const dyadGroup = document.createElement('div');
          dyadGroup.style.marginTop = '15px';
          dyadGroup.style.padding = '10px';
          dyadGroup.style.background = '#f1f2f6';
          dyadGroup.style.borderRadius = '8px';
          dyadGroup.innerHTML = `
            <div style="font-weight:bold; margin-bottom:8px; font-size:13px; color:#57606f;">📏 孔位定位 (相對於端點 ${step.p1} 與 ${step.p2})</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <div style="background:#fff; padding:6px; border-radius:6px; border:1px solid #ddd;">
                    <div style="font-size:11px; color:#a4b0be; font-weight:bold;">距 ${step.p1}</div>
                    <input type="number" id="inR1" value="${step.r1_val || 0}" style="width:100%; border:0; outline:none; font-family:monospace; font-weight:bold;" />
                </div>
                <div style="background:#fff; padding:6px; border-radius:6px; border:1px solid #ddd;">
                    <div style="font-size:11px; color:#a4b0be; font-weight:bold;">距 ${step.p2}</div>
                    <input type="number" id="inR2" value="${step.r2_val || 0}" style="width:100%; border:0; outline:none; font-family:monospace; font-weight:bold;" />
                </div>
            </div>
            <div style="margin-top:8px; font-size:11px; color:#747d8c;">* 調整數值可讓孔位沿桿件滑動 (或偏離桿件形成三角架)。</div>
          `;
          dyadGroup.querySelector('#inR1').onchange = (e) => {
            step.r1_val = parseFloat(e.target.value) || 0;
            saveAndRefresh();
          };
          dyadGroup.querySelector('#inR2').onchange = (e) => {
            step.r2_val = parseFloat(e.target.value) || 0;
            saveAndRefresh();
          };
          sheetContent.appendChild(dyadGroup);
        }

        if (currentType === 'ground') {
          const coordGroup = document.createElement('div');
          coordGroup.style.display = 'flex'; coordGroup.style.gap = '8px'; coordGroup.style.marginTop = '8px';
          ['x', 'y'].forEach(axis => {
            const wrapper = document.createElement('div');
            wrapper.style.flex = '1'; wrapper.style.padding = '6px';
            wrapper.style.background = '#fff'; wrapper.style.border = '1px solid #ddd'; wrapper.style.borderRadius = '6px';
            wrapper.innerHTML = `<div style="display:flex; align-items:center; gap:6px;"><span style="font-weight:bold; color:#747d8c;">${axis.toUpperCase()}</span><input type="number" value="${Math.round(step[axis])}" style="width:100%; border:0; outline:none; font-family:monospace; font-size:14px;" /></div>`;
            wrapper.querySelector('input').onchange = (e) => {
              step[axis] = parseFloat(e.target.value) || 0;
              topoArea.value = JSON.stringify(topology, null, 2);
              topoArea.dispatchEvent(new Event('input', { bubbles: true }));
            };
            coordGroup.appendChild(wrapper);
          });
          sheetContent.appendChild(coordGroup);
        }

        const featureBox = document.createElement('div');
        featureBox.style.marginTop = '12px'; featureBox.style.padding = '8px'; featureBox.style.background = '#fff'; featureBox.style.border = '1px solid #eee'; featureBox.style.borderRadius = '8px';
        const isTraced = topology.visualization?.trace?.includes(selectedId);
        const traceDiv = document.createElement('div');
        traceDiv.innerHTML = `<label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:bold; padding:4px 0;"><input type="checkbox" ${isTraced ? 'checked' : ''} style="width:20px; height:20px;"> 追蹤路徑 (Trace)</label>`;
        traceDiv.querySelector('input').onchange = (e) => {
          if (!topology.visualization) topology.visualization = {};
          if (!topology.visualization.trace) topology.visualization.trace = [];
          if (e.target.checked) { if (!topology.visualization.trace.includes(selectedId)) topology.visualization.trace.push(selectedId); }
          else { topology.visualization.trace = topology.visualization.trace.filter(id => id !== selectedId); }
          topoArea.value = JSON.stringify(topology, null, 2);
          topoArea.dispatchEvent(new Event('input', { bubbles: true }));
        };
        featureBox.appendChild(traceDiv);
        sheetContent.appendChild(featureBox);

      } catch (e) { console.error('Sheet populate error:', e); }
    }
  } else {
    if (emptyMsg) {
      emptyMsg.textContent = `節點 ${selectedId}`;
      emptyMsg.style.display = 'block';
    }
  }

  // 4. Show Sheet
  sheet.style.display = 'flex';
  setTimeout(() => sheet.classList.add('open'), 10);
}

function closePropertySheet() {
  const sheet = document.getElementById('propertySheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  setTimeout(() => sheet.style.display = 'none', 300);
}

