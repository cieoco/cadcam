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
function solveIntersectionOptions(p1, r1, p2, r2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);

    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return [];

    const a_dist = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a_dist * a_dist));

    const x2 = p1.x + a_dist * (dx / d);
    const y2 = p1.y + a_dist * (dy / d);

    const rx = -dy * (h / d);
    const ry = dx * (h / d);

    const pPlus = { x: x2 + rx, y: y2 + ry };
    const pMinus = { x: x2 - rx, y: y2 - ry };
    return [pPlus, pMinus];
}

/**
 * 通用求解函數
 * @param {Object|string} topologyOrParams - 機構定義或參數物件
 * @param {Object} [params] - 當前參數 (如果第一個參數是拓撲)
 */
export function solveTopology(topologyOrParams, params) {
    let topology, actualParams;

    // 支援兩種呼叫方式：
    // 1. solveTopology(topology, params)
    // 2. solveTopology(params) -> 其中 params.topology 是 JSON 字串或物件
    if (params) {
        topology = topologyOrParams;
        actualParams = params;
    } else {
        actualParams = topologyOrParams || {};
        topology = actualParams.topology;
        if (typeof topology === 'string') {
            try {
                topology = JSON.parse(topology);
            } catch (e) {
                console.error("Solver: Invalid Topology JSON", e);
                return { isValid: false, errorType: 'invalid_topology' };
            }
        }
    }

    if (!topology || !topology.steps) {
        return { isValid: true, points: {}, B: undefined }; // 空拓撲也是有效的
    }

    const points = {};
const autoDyadFromLinks = (topo) => {
    if (!topo || !topo.steps) return topo;
    const steps = topo.steps.slice();
    const barLinks = [];
    const lenParamByLinkId = new Map();
    if (Array.isArray(topo._wizard_data)) {
        topo._wizard_data.forEach(w => {
            if (w.type === 'bar' && w.id && w.lenParam) {
                lenParamByLinkId.set(w.id, w.lenParam);
            }
        });
    }


    const vis = topo.visualization;
    if (vis && Array.isArray(vis.links)) {
        vis.links.forEach(l => {
            if (!l.p1 || !l.p2) return;
            const mapped = lenParamByLinkId.get(l.id);
            barLinks.push({ p1: l.p1, p2: l.p2, len_param: l.len_param || l.lenParam || mapped || l.id });
        });
    }

    if (Array.isArray(topo._wizard_data)) {
        topo._wizard_data.forEach(w => {
            if (w.type !== 'bar') return;
            if (w.p1?.id && w.p2?.id) {
                barLinks.push({ p1: w.p1.id, p2: w.p2.id, len_param: w.lenParam });
            }
        });
    }

    if (Array.isArray(topo.parts)) {
        topo.parts.forEach(p => {
            if (p.type !== 'bar') return;
            if (p.p1 && p.p2) {
                barLinks.push({ p1: p.p1, p2: p.p2, len_param: p.len_param || p.lenParam || p.id });
            }
        });
    }

    const solved = new Set();
    steps.forEach(s => {
        if (s.type === 'ground') solved.add(s.id);
        if (s.type === 'input_crank') {
            if (s.center) solved.add(s.center);
            solved.add(s.id);
        }
    });

    let changed = true;
    while (changed) {
        changed = false;
        const connections = new Map(); // pointId -> Array of { neighborId, lenParam }

        barLinks.forEach(l => {
            if (!l.p1 || !l.p2) return;
            const id1 = l.p1;
            const id2 = l.p2;
            if (solved.has(id1)) {
                if (!connections.has(id2)) connections.set(id2, []);
                connections.get(id2).push({ neighborId: id1, lenParam: l.len_param || l.lenParam });
            }
            if (solved.has(id2)) {
                if (!connections.has(id1)) connections.set(id1, []);
                connections.get(id1).push({ neighborId: id2, lenParam: l.len_param || l.lenParam });
            }
        });

        connections.forEach((conns, pointId) => {
            if (solved.has(pointId)) return;
            if (conns.length < 2) return;
            const c1 = conns[0];
            const c2 = conns[1];
            const step = {
                id: pointId,
                type: 'dyad',
                p1: c1.neighborId,
                r1_param: c1.lenParam,
                p2: c2.neighborId,
                r2_param: c2.lenParam,
                sign: 1
            };

topology = autoDyadFromLinks(topology);

    const theta = deg2rad(actualParams.thetaDeg || actualParams.theta || 0);


            steps.push(step);
            stepMap.set(pointId, step);
            solved.add(pointId);
            changed = true;
        });
    }

    return { ...topo, steps };
};


    // Helper to get value: either direct number or from params
    const getVal = (step, key) => {
        // Try 'len_val' or 'r1_val' etc
        const valDirect = step[key + '_val'];
        if (valDirect !== undefined) return Number(valDirect);

        // Try 'len_param' or 'r1_param'
        const paramName = step[key + '_param'];
        if (paramName && actualParams[paramName] !== undefined) return Number(actualParams[paramName]);

        return 100; // 預設長度改為 100，避免 0 導致無解
    };

    // 1. 處理所有步驟
    for (const step of topology.steps) {
        try {
            if (step.type === 'ground') {
                // 支援參數化的固定點座標
                // 支援三種模式：
                // 1. 直接座標：x: 100, y: 50
                // 2. 參數座標：x_param: "L1", y_param: "H1"
                // 3. 偏移座標：x_param: "L1", x_offset: 0 → x = 0 + L1
                let x, y;
                
                if (step.x_param) {
                    const paramValue = actualParams[step.x_param] || 100;
                    const offset = step.x_offset || 0;
                    x = offset + paramValue;
                } else {
                    x = step.x || 0;
                }
                
                if (step.y_param) {
                    const paramValue = actualParams[step.y_param] || 100;
                    const offset = step.y_offset || 0;
                    y = offset + paramValue;
                } else {
                    y = step.y || 0;
                }
                
                points[step.id] = { x: Number(x), y: Number(y) };
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
                const options = solveIntersectionOptions(p1, r1, p2, r2);
                if (!options.length) {
                    return { isValid: false, errorStep: step.id, errorType: 'no_intersection' };
                }
                let chosen = null;
                const prevPoints = actualParams && actualParams._prevPoints;
                const prev = prevPoints ? prevPoints[step.id] : null;
                if (prev) {
                    const d0 = Math.hypot(options[0].x - prev.x, options[0].y - prev.y);
                    const d1 = Math.hypot(options[1].x - prev.x, options[1].y - prev.y);
                    chosen = d0 <= d1 ? options[0] : options[1];
                } else {
                    chosen = step.sign === -1 ? options[1] : options[0];
                }
                points[step.id] = chosen;
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
    let prevPoints = null;

    for (let th = startDeg; th <= endDeg; th += stepDeg) {
        const sol = solveTopology(topology, { ...params, thetaDeg: th, _prevPoints: prevPoints });
        const isValid = sol.isValid;

        results.push({
            theta: th,
            isValid,
            B: isValid ? sol.B : null,
            points: isValid ? sol.points : null
        });

        if (isValid) {
            prevPoints = sol.points;
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
