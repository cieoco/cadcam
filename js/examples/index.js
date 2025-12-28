/**
 * Mechanism Templates Registry
 * 定義所有可用的機構範本與其對應的 JSON 檔案路徑
 */

export const EXAMPLE_TEMPLATES = [
    {
        id: 'parallel-fourbar',
        name: '四連桿 (平行)',
        file: './js/examples/parallel-fourbar.json' // 相對於 HTML 根目錄的路徑
    },
    {
        id: 'gripper',
        name: '夾爪機構 (Gripper)',
        file: './js/examples/gripper.json'
    },
    {
        id: 'crank-slider',
        name: '曲柄滑塊 (模擬)',
        file: './js/examples/crank-slider.json'
    }
    // 您可以在這裡新增更多範本，例如：
    // { id: 'jansen', name: 'Theo Jansen 仿生獸', file: './js/examples/jansen.json' }
];
