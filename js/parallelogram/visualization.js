/**
 * Parallelogram Mechanism Visualization
 * 平行四邊形機構視覺化
 */

import { renderFourbar } from '../ui/visualization.js';

/**
 * 渲染平行四邊形機構
 * 複用四連桿的渲染邏輯，因為平行四邊形本質上是特殊的四連桿
 */
export function renderParallelogram(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    // 平行四邊形在視覺上與四連桿一致，直接調用通用四連桿渲染器
    return renderFourbar(sol, thetaDeg, trajectoryData, viewParams);
}
