/**
 * Rack and Pinion Solver
 * 齒條齒輪求解器 (穩定初始化版本)
 */

import { deg2rad, rad2deg } from '../utils.js';

/**
 * 求解特定角度下的齒條齒輪位置
 * @param {Object} params { pinionTeeth, module, thetaDeg, rackLength }
 */
export function solveRackPinion({ pinionTeeth, module, thetaDeg, rackLength = 200 }) {
    const N = Number(pinionTeeth || 20);
    const m = Number(module || 2);
    const L = Number(rackLength || 200);
    const theta = deg2rad(Number(thetaDeg || 0));

    const pitchRadius = (m * N) / 2;

    // 齒輪中心固定在 (0, pitchRadius)
    // 齒條位移 displacement = theta * R
    const displacement = theta * pitchRadius;

    // 齒條佈局優化：
    // 為了避免一開始就越界，我們讓 theta=0 時齒條中心在嚙合點 (x=0)
    // 或是稍微偏左/右。這裡我們設定為中心化佈局。
    const currentRackLeft = -L / 2 + displacement;
    const currentRackRight = L / 2 + displacement;

    // 檢測嚙合點 (x=0) 是否落在 [left, right] 之間
    const isValid = (0 >= currentRackLeft) && (0 <= currentRackRight);

    return {
        isValid,
        pinion: {
            center: { x: 0, y: pitchRadius },
            pitchRadius,
            thetaDeg: Number(thetaDeg || 0),
            m,
            N
        },
        rack: {
            displacement,
            length: L,
            left: currentRackLeft,
            right: currentRackRight,
            yBase: 0
        },
        B: { x: currentRackLeft, y: 0 }
    };
}

/**
 * 角度掃描分析
 */
export function sweepTheta(params, startDeg, endDeg, stepDeg) {
    const results = [];
    const validRanges = [];
    const invalidRanges = [];

    let currentValid = null;
    let currentInvalid = null;

    for (let th = startDeg; th <= endDeg; th += stepDeg) {
        const sol = solveRackPinion({ ...params, thetaDeg: th });
        const isValid = sol.isValid;

        results.push({
            theta: th,
            isValid,
            B: sol.B,
            sol
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
 * 軌跡統計
 */
export function calculateTrajectoryStats(results) {
    const validPoints = results.filter(r => r.isValid);
    if (validPoints.length === 0) return { rangeX: 0, rangeY: 0 };

    const bxs = validPoints.map(r => r.B.x);
    const minX = Math.min(...bxs), maxX = Math.max(...bxs);
    return {
        rangeX: maxX - minX,
        rangeY: 0
    };
}
