/**
 * Generic Multilink Solver Engine
 * 通用多連桿求解核心
 * 
 * 核心概念：
 * 使用 "Constructive Geometry" (建構幾何) 方法。
 * 按照定義順序，逐步計算節點座標。這適用於單自由度且無冗餘約束的機構。
 */

import { deg2rad } from '../utils.js';

/**
 * 兩圓交點 (Dyad Solver)
 */
function solveIntersection(p1, r1, p2, r2, sign) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);

    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;

    const a_dist = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a_dist * a_dist));

    const x2 = p1.x + a_dist * (dx / d);
    const y2 = p1.y + a_dist * (dy / d);

    const rx = -dy * (h / d);
    const ry = dx * (h / d);

    return {
        x: x2 + sign * rx,
        y: y2 + sign * ry
    };
}

/**
 * 通用求解函數
 * @param {Object} topology - 機構定義
 * @param {Object} params - 當前參數 (包含角度、桿長)
 */
export function solveTopology(topology, params) {
    const points = {};
    const theta = deg2rad(params.thetaDeg || 0);

    // Helper to get value: either direct number or from params
    const getVal = (step, key) => {
        // Try 'len_val' or 'r1_val' etc
        const valDirect = step[key + '_val'];
        if (valDirect !== undefined) return Number(valDirect);

        // Try 'len_param' or 'r1_param'
        const paramName = step[key + '_param'];
        if (paramName && params[paramName] !== undefined) return Number(params[paramName]);

        return 0;
    };

    // 1. 處理所有步驟
    for (const step of topology.steps) {
        try {
            if (step.type === 'ground') {
                points[step.id] = { x: step.x, y: step.y };
            }
            else if (step.type === 'input_crank') {
                const center = points[step.center];
                const r = getVal(step, 'len');
                const ang = theta + (deg2rad(step.phase_offset || 0));

                points[step.id] = {
                    x: center.x + r * Math.cos(ang),
                    y: center.y + r * Math.sin(ang)
                };
            }
            else if (step.type === 'dyad') {
                const p1 = points[step.p1];
                const p2 = points[step.p2];
                if (!p1 || !p2) {
                    return { isValid: false, errorStep: step.id, errorType: 'missing_points' };
                }
                const r1 = getVal(step, 'r1');
                const r2 = getVal(step, 'r2');

                const pt = solveIntersection(p1, r1, p2, r2, step.sign);
                if (!pt) {
                    return { isValid: false, errorStep: step.id, errorType: 'no_intersection' };
                }
                points[step.id] = pt;
            }
        } catch (e) {
            console.error("Solver Error at step", step.id, e);
            return { isValid: false, errorStep: step.id };
        }
    }

    // 2. 獲取追蹤點
    const B = points[topology.tracePoint];

    return {
        isValid: true,
        points,
        B
    };
}

/**
 * 掃描 Helper
 */
export function sweepTopology(topology, params, startDeg, endDeg, stepDeg) {
    const results = [];
    const validRanges = [];
    const invalidRanges = [];
    let currentValid = null;
    let currentInvalid = null;

    for (let th = startDeg; th <= endDeg; th += stepDeg) {
        const sol = solveTopology(topology, { ...params, thetaDeg: th });
        const isValid = sol.isValid;

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
    const validPoints = results.filter(r => r.isValid && r.B).map(r => r.B);
    if (validPoints.length === 0) return null;

    const xs = validPoints.map(p => p.x);
    const ys = validPoints.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    return {
        rangeX: maxX - minX,
        rangeY: maxY - minY,
        totalRange: Math.hypot(maxX - minX, maxY - minY)
    };
}
