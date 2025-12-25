/**
 * Gear Geometry Utility
 * 齒輪幾何計算工具 - 產生漸開線齒廓與齒條齒形
 */

/**
 * 產生齒輪的頂點路徑 (封閉多邊形)
 * @param {Object} params 
 * @param {number} params.teeth 齒數
 * @param {number} params.module 模數
 * @param {number} params.pressureAngle 壓力角 (度, 預設 20)
 * @param {number} params.segmentsPerTooth 每個齒的採樣點數
 * @returns {Array<{x, y}>} 頂點陣列
 */
export function createGearPath({
    teeth,
    module,
    pressureAngle = 20,
    segmentsPerTooth = 10
}) {
    const N = teeth;
    const m = module;
    const alpha = (pressureAngle * Math.PI) / 180;

    const pitchR = (m * N) / 2;
    const baseR = pitchR * Math.cos(alpha);
    const addendum = m;
    const dedendum = 1.25 * m;
    const outerR = pitchR + addendum;
    const rootR = pitchR - dedendum;

    const angleStep = (2 * Math.PI) / N;
    const points = [];

    for (let i = 0; i < N; i++) {
        const centerAngle = i * angleStep;

        // 1. 齒根段
        const rootAngleStart = centerAngle - angleStep / 4;
        const rootAngleEnd = centerAngle + angleStep / 4;

        // 2. 漸開線與齒頂
        // 簡單化實作：計算每個齒的關鍵點
        // 為了讓 G-code 好切，這裡我們產生一個精確的多邊形

        // 齒寬在節圓處為 p/2 = PI * m / 2
        // 對應的角度為 (PI * m / 2) / pitchR = PI / N
        const halfToothThicknessAngle = Math.PI / (2 * N);

        // 計算漸開線在節圓處的展開角 (inv alpha)
        const invAlpha = Math.tan(alpha) - alpha;

        // 每個齒的角度範圍
        const angles = [];
        const numSamples = segmentsPerTooth;

        // 右側漸開線 (從 rootR 到 outerR)
        for (let j = 0; j <= numSamples; j++) {
            const r = rootR + (outerR - rootR) * (j / numSamples);
            if (r < baseR) {
                // 基礎圓以下用直線/徑向線替代
                const a = centerAngle - halfToothThicknessAngle - invAlpha;
                angles.push({ r, a });
            } else {
                const phi = Math.acos(baseR / r);
                const invPhi = Math.tan(phi) - phi;
                const a = centerAngle - (halfToothThicknessAngle + invAlpha - invPhi);
                angles.push({ r, a });
            }
        }

        // 左側漸開線 (從 outerR 回到 rootR)
        for (let j = numSamples; j >= 0; j--) {
            const r = rootR + (outerR - rootR) * (j / numSamples);
            if (r < baseR) {
                const a = centerAngle + halfToothThicknessAngle + invAlpha;
                angles.push({ r, a });
            } else {
                const phi = Math.acos(baseR / r);
                const invPhi = Math.tan(phi) - phi;
                const a = centerAngle + (halfToothThicknessAngle + invAlpha - invPhi);
                angles.push({ r, a });
            }
        }

        // 轉換為 XY 座標
        for (const p of angles) {
            points.push({
                x: p.r * Math.cos(p.a),
                y: p.r * Math.sin(p.a)
            });
        }
    }

    return points;
}

/**
 * 產生齒條的頂點路徑
 * @param {Object} params
 */
export function createRackPath({
    length,
    height,
    module,
    pressureAngle = 20
}) {
    const m = module;
    const L = length;
    const H = height; // 被高
    const alpha = (pressureAngle * Math.PI) / 180;

    const pitch = Math.PI * m;
    const addendum = m;
    const dedendum = 1.25 * m;

    const points = [];

    // 齒條從 x = -L/2 到 L/2
    // 節線在 y = 0
    // 所以頂部齒尖在 y = addendum，齒底部在 y = -dedendum
    // 總高度還包含背高 H，所以底部在 y = -dedendum - H

    // 1. 產生齒部 (Top)
    const numTeeth = Math.ceil(L / pitch) + 2;
    const startX = - (numTeeth * pitch) / 2;

    for (let i = 0; i < numTeeth; i++) {
        const xOuter = startX + i * pitch;

        // 基本梯形齒形：
        // 齒頂寬 = p/2 - 2 * addendum * tan(alpha)
        const topWidth = (pitch / 2) - 2 * addendum * Math.tan(alpha);

        const p1 = { x: xOuter - pitch / 4 - addendum * Math.tan(alpha), y: addendum };
        const p2 = { x: xOuter + pitch / 4 + addendum * Math.tan(alpha), y: addendum }; // 這裡算錯了，重修
    }

    // 重新實作簡易版本：直接輸出頂點
    const gearPoints = [];
    const halfP = pitch / 2;
    const dx = addendum * Math.tan(alpha);

    for (let x = -L / 2 - pitch; x <= L / 2 + pitch; x += pitch) {
        // 梯形齒關鍵點：
        // 1. 齒根左 (x - p/4 - dx, -dedendum)
        // 2. 齒頂左 (x - p/4 + dx, addendum)
        // 3. 齒頂右 (x + p/4 - dx, addendum)
        // 4. 齒根右 (x + p/4 + dx, -dedendum)

        gearPoints.push({ x: x - pitch / 4 - dx, y: -dedendum });
        gearPoints.push({ x: x - pitch / 4 + dx, y: addendum });
        gearPoints.push({ x: x + pitch / 4 - dx, y: addendum });
        gearPoints.push({ x: x + pitch / 4 + dx, y: -dedendum });
    }

    // 過濾超出長度的點並閉合基座
    const finalPoints = gearPoints.filter(p => p.x >= -L / 2 && p.x <= L / 2);

    // 加上基座四個角
    finalPoints.push({ x: L / 2, y: -dedendum - H });
    finalPoints.push({ x: -L / 2, y: -dedendum - H });

    return finalPoints;
}
