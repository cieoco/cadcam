/**
 * Four-Bar Linkage Solver
 * 四連桿機構求解器
 */

import { deg2rad } from '../utils.js';

/**
 * 求解四連桿機構
 * 使用兩圓相交法求解 B 點位置
 * 
 * @param {Object} params - 參數物件
 * @param {number} params.a - Ground link length (O2-O4)
 * @param {number} params.b - Input link length (O2-A)
 * @param {number} params.c - Coupler link length (A-B)
 * @param {number} params.d - Output link length (B-O4)
 * @param {number} params.thetaDeg - Input angle in degrees
 * @param {string} params.assembly - "open" or "crossed"
 * @returns {{O2: Point, O4: Point, A: Point, B: Point}|null} 解算結果或 null（無解）
 */
export function solveFourBar({ a, b, c, d, thetaDeg, assembly }) {
    const th = deg2rad(thetaDeg);

    // 固定點
    const O2 = { x: 0, y: 0 };
    const O4 = { x: a, y: 0 };

    // A 點：在以 O2 為圓心、半徑 b 的圓上，角度為 theta
    const A = {
        x: b * Math.cos(th),
        y: b * Math.sin(th),
    };

    // B 點：兩圓相交
    // 圓1：圓心 A，半徑 c
    // 圓2：圓心 O4，半徑 d
    const x0 = A.x,
        y0 = A.y,
        r0 = c;
    const x1 = O4.x,
        y1 = O4.y,
        r1 = d;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const D = Math.hypot(dx, dy);

    // 檢查是否有解
    if (D > r0 + r1) return null; // 兩圓距離太遠
    if (D < Math.abs(r0 - r1)) return null; // 一圓包含另一圓
    if (D === 0 && r0 === r1) return null; // 兩圓重合

    // 兩圓相交計算
    const aSeg = (r0 * r0 - r1 * r1 + D * D) / (2 * D);
    const hSq = r0 * r0 - aSeg * aSeg;
    if (hSq < 0) return null;
    const h = Math.sqrt(hSq);

    const xm = x0 + (aSeg * dx) / D;
    const ym = y0 + (aSeg * dy) / D;

    // 兩個交點
    const rx = (-dy * h) / D;
    const ry = (dx * h) / D;

    const P1 = { x: xm + rx, y: ym + ry };
    const P2 = { x: xm - rx, y: ym - ry };

    // 根據 assembly 模式選擇交點
    // open: 選擇 y 較大的點
    // crossed: 選擇 y 較小的點
    let B;
    if (assembly === "open") {
        B = P1.y >= P2.y ? P1 : P2;
    } else {
        B = P1.y < P2.y ? P1 : P2;
    }

    return { O2, O4, A, B };
}

/**
 * 掃描角度範圍，分析可行性
 * @param {Object} mech - 機構參數（不含 thetaDeg）
 * @param {number} sweepStart - 起始角度
 * @param {number} sweepEnd - 結束角度
 * @param {number} sweepStep - 掃描間隔
 * @returns {{results: Array, validRanges: Array, invalidRanges: Array}}
 */
export function sweepTheta(mech, sweepStart, sweepEnd, sweepStep) {
    const results = [];
    const validRanges = [];
    const invalidRanges = [];
    let currentValid = null;
    let currentInvalid = null;

    // 掃描角度範圍
    for (let theta = sweepStart; theta <= sweepEnd; theta += sweepStep) {
        const sol = solveFourBar({ ...mech, thetaDeg: theta });
        const isValid = sol !== null;

        results.push({
            theta,
            isValid,
            B: isValid ? sol.B : null,
        });

        // 追蹤可行/不可行區間
        if (isValid) {
            if (currentInvalid) {
                invalidRanges.push(currentInvalid);
                currentInvalid = null;
            }
            if (!currentValid) {
                currentValid = { start: theta, end: theta };
            } else {
                currentValid.end = theta;
            }
        } else {
            if (currentValid) {
                validRanges.push(currentValid);
                currentValid = null;
            }
            if (!currentInvalid) {
                currentInvalid = { start: theta, end: theta };
            } else {
                currentInvalid.end = theta;
            }
        }
    }

    // 關閉最後的區間
    if (currentValid) validRanges.push(currentValid);
    if (currentInvalid) invalidRanges.push(currentInvalid);

    return { results, validRanges, invalidRanges };
}

/**
 * 計算 B 點軌跡的統計資訊
 * @param {Array} results - 掃描結果
 * @returns {{minBx: number, maxBx: number, minBy: number, maxBy: number, rangeX: number, rangeY: number, totalRange: number}|null}
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
    const rangeX = maxBx - minBx;
    const rangeY = maxBy - minBy;
    const totalRange = Math.hypot(rangeX, rangeY);

    return {
        minBx,
        maxBx,
        minBy,
        maxBy,
        rangeX,
        rangeY,
        totalRange,
    };
}
