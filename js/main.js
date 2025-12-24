/**
 * Main Application Entry Point
 * 主程式入口
 */

import { setupUIHandlers } from './ui/controls.js';

/**
 * 初始化應用程式
 */
function init() {
    console.log('4-Bar Linkage CAD/CAM System - Modular Version');
    console.log('Initializing...');

    // 設定所有 UI 處理器
    setupUIHandlers();

    console.log('Application ready!');
}

// DOM 載入完成後初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
