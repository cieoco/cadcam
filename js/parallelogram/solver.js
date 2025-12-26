/**
 * Parallelogram Mechanism Solver
 * 平行四邊形機構求解器
 */

import { deg2rad } from '../utils.js';

/**
 * 求解平行四邊形機構
 * 
 * @param {Object} params - 參數物件
 * @param {number} params.a - 長邊 (Ground/Coupler)
 * @param {number} params.b - 短邊 (Input/Output)
 * @param {number} params.thetaDeg - 輸入角度
 * @returns {{O2: Point, O4: Point, A: Point, B: Point}|null}
 */
export function solveParallelogram({ a, b, thetaDeg }) {
    const th = deg2rad(thetaDeg);
    const A_val = Number(a);
    const B_val = Number(b);

    // 固定點
    const O2 = { x: 0, y: 0 };
    const O4 = { x: A_val, y: 0 };

    // A 點 (Input)
    const A = {
        x: B_val * Math.cos(th),
        y: B_val * Math.sin(th),
    };

    // B 點 (Output) - 平行四邊形特性：B = O4 + (A - O2)
    const B = {
        x: O4.x + A.x,
        y: O4.y + A.y,
    };

    return { O2, O4, A, B };
}

/**
 * 掃描角度範圍
 */
export function sweepTheta(mech, sweepStart, sweepEnd, sweepStep) {
    const results = [];
    const validRanges = [{ start: sweepStart, end: sweepEnd }];
    const invalidRanges = [];

    for (let theta = sweepStart; theta <= sweepEnd; theta += sweepStep) {
        const sol = solveParallelogram({ ...mech, thetaDeg: theta });
        results.push({
            theta,
            isValid: true,
            B: sol.B,
        });
    }

    return { results, validRanges, invalidRanges };
}

/**
 * 計算軌跡統計資訊
 */
export function calculateTrajectoryStats(results) {
    const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
    if (validBPoints.length === 0) return null;

    const bxs = validBPoints.map((b) => b.x);
    const bys = validBPoints.map((b) => b.y);
    const minBx = Math.min(...bxs);
    const maxBx = Math.max(...bxs);
    const minBy = Math.min(...bys);
    const maxBy = Math.max(...bys);

    return {
        minBx,
        maxBx,
        minBy,
        maxBy,
        rangeX: maxBx - minBx,
        rangeY: maxBy - minBy,
        totalRange: Math.hypot(maxBx - minBx, maxBy - minBy),
    };
}
