/**
 * Slider-Crank Mechanism Solver
 * 曲柄滑塊機構求解器
 */

import { deg2rad, rad2deg } from '../utils.js';

/**
 * 求解特定角度下的曲柄滑塊位置
 */
export function solveSliderCrank({ crankRadius, rodLength, thetaDeg }) {
    const r = Number(crankRadius);
    const l = Number(rodLength);
    const theta = deg2rad(Number(thetaDeg));

    // A 點 (曲柄末端)
    const ax = r * Math.cos(theta);
    const ay = r * Math.sin(theta);

    // 檢查幾何可行性 (連桿必須能跨越 A 點到軌道的垂直距離)
    const sinTheta = Math.sin(theta);
    const h = r * sinTheta;

    if (Math.abs(h) > l) {
        return null; // 無解
    }

    // 計算滑塊 B 點的 x 座標 (y 固定為 0)
    // l^2 = (bx - ax)^2 + (0 - ay)^2
    // bx = ax + sqrt(l^2 - ay^2)
    const bx = ax + Math.sqrt(l * l - ay * ay);

    const sol = {
        isValid: true,
        points: {
            O: { x: 0, y: 0 },
            A: { x: ax, y: ay },
            B: { x: bx, y: 0 }
        },
        B: { x: bx, y: 0 } // 為相容性保留頂層 B
    };
    return sol;
}

/**
 * 掃描角度範圍並分析可行性 (API 格式對齊)
 */
export function sweepTheta(params, startDeg, endDeg, stepDeg) {
    const results = [];
    const validRanges = [];
    const invalidRanges = [];

    let currentValid = null;
    let currentInvalid = null;

    for (let th = startDeg; th <= endDeg; th += stepDeg) {
        const sol = solveSliderCrank({ ...params, thetaDeg: th });
        const isValid = sol !== null;

        results.push({
            theta: th,
            isValid,
            B: isValid ? sol.B : null,
            points: isValid ? sol.points : null
        });

        if (isValid) {
            if (currentInvalid) { invalidRanges.push(currentInvalid); currentInvalid = null; }
            if (!currentValid) currentValid = { start: th, end: th };
            else currentValid.end = th;
        } else {
            if (currentValid) { validRanges.push(currentValid); currentValid = null; }
            if (!currentInvalid) currentInvalid = { start: th, end: th };
            else currentInvalid.end = th;
        }
    }

    if (currentValid) validRanges.push(currentValid);
    if (currentInvalid) invalidRanges.push(currentInvalid);

    return { results, validRanges, invalidRanges };
}

/**
 * 計算軌跡統計資料
 */
export function calculateTrajectoryStats(results) {
    const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
    if (validBPoints.length === 0) return null;

    const bxs = validBPoints.map((b) => b.x);
    const bys = validBPoints.map((b) => b.y);

    const minX = Math.min(...bxs), maxX = Math.max(...bxs);
    const minY = Math.min(...bys), maxY = Math.max(...bys);

    return {
        minBx: minX, maxBx: maxX,
        minBy: minY, maxBy: maxY,
        rangeX: maxX - minX,
        rangeY: maxY - minY
    };
}
