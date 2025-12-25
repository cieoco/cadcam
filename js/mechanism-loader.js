/**
 * Universal Mechanism Page Loader
 * 通用機構頁面載入器
 */

import { getMechanismFromURL, generateParameterHTML } from './mechanism-config.js';
import { setupUIHandlers } from './ui/controls.js';

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

  // 生成參數輸入面板
  const parametersPanel = document.getElementById('parametersPanel');
  parametersPanel.innerHTML = `
    <h3>① ${mech.name}參數</h3>
    ${generateParameterHTML(mech.parameters)}
    
    <div style="height:10px"></div>
    <h3>模擬設定</h3>
    <div class="grid">
      <div>
        <label>模擬圖範圍（mm）</label>
        <input id="viewRange" type="number" min="100" max="1000" step="10" value="400" />
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
