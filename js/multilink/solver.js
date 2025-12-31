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
    const eps = 1e-6;

    // 檢查是否有解
    if (d > r1 + r2 + eps || d < Math.abs(r1 - r2) - eps || d === 0) return [];

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

function solveLineCircleIntersection(a, b, center, r) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];

    const ux = dx / len;
    const uy = dy / len;
    const acx = center.x - a.x;
    const acy = center.y - a.y;
    const proj = acx * ux + acy * uy;
    const dist2 = acx * acx + acy * acy - proj * proj;

    const r2 = r * r;
    if (dist2 > r2) return [];

    const offset = Math.sqrt(Math.max(0, r2 - dist2));
    const t1 = proj - offset;
    const t2 = proj + offset;

    const pts = [];
    if (t1 >= 0 && t1 <= len) {
        pts.push({ x: a.x + ux * t1, y: a.y + uy * t1 });
    }
    if (t2 >= 0 && t2 <= len) {
        pts.push({ x: a.x + ux * t2, y: a.y + uy * t2 });
    }

    return pts;
}


function solveBodyJointTopology(topology, params) {
    const components = topology && topology._wizard_data ? topology._wizard_data : [];
    if (!components.length) {
        return { isValid: false, points: {}, B: null };
    }

    const actualParams = params || {};
    const points = {};
    const triangles = new Map();
    const constraints = [];
    const lineConstraints = [];
    const pointIds = new Set();

    const getParamVal = (name, fallback = 0) => {
        if (!name) return fallback;
        if (actualParams[name] !== undefined) return Number(actualParams[name]);
        if (topology && topology.params && topology.params[name] !== undefined) {
            return Number(topology.params[name]);
        }
        const parsed = Number(name);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const addPointId = (pt) => {
        if (pt && pt.id) pointIds.add(pt.id);
    };

    const getInitialPoint = (id) => {
        if (!id) return null;
        for (const c of components) {
            if (c.type === 'polygon' && c.points) {
                const hit = c.points.find(p => p.id === id && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
                if (hit) return { x: Number(hit.x), y: Number(hit.y) };
                continue;
            }
            for (const key of ['p1', 'p2', 'p3']) {
                const pt = c[key];
                if (pt && pt.id === id && Number.isFinite(Number(pt.x)) && Number.isFinite(Number(pt.y))) {
                    return { x: Number(pt.x), y: Number(pt.y) };
                }
            }
        }
        return null;
    };

    if (topology && Array.isArray(topology.steps)) {
        topology.steps.forEach(step => {
            if (step.type !== 'ground') return;
            if (step.x !== undefined && step.y !== undefined) {
                points[step.id] = { x: Number(step.x), y: Number(step.y) };
            }
        });

        topology.steps.forEach(step => {
            if (step.type !== 'ground' || !step.dist_param || !step.ref_id) return;
            const ref = points[step.ref_id];
            if (!ref) return;
            const dist = getParamVal(step.dist_param, 0);
            points[step.id] = {
                x: ref.x + (step.ux || 0) * dist,
                y: ref.y + (step.uy || 0) * dist
            };
        });
    }

    const fixedIds = new Set();
    if (topology && Array.isArray(topology.steps)) {
        topology.steps.forEach(step => {
            if (step.type === 'ground' && step.id) fixedIds.add(step.id);
        });
    }

    components.forEach((c) => {
        if (c.type === 'polygon' && c.points) {
            c.points.forEach(p => {
                addPointId(p);
                if (p.type === 'fixed') {
                    points[p.id] = { x: Number(p.x || 0), y: Number(p.y || 0) };
                    fixedIds.add(p.id);
                }
            });
            return;
        }

        ['p1', 'p2', 'p3'].forEach(k => addPointId(c[k]));

        if (c.p1 && c.p1.type === 'fixed' && !points[c.p1.id]) {
            points[c.p1.id] = { x: Number(c.p1.x || 0), y: Number(c.p1.y || 0) };
            fixedIds.add(c.p1.id);
        }
        if (c.p2 && c.p2.type === 'fixed' && !points[c.p2.id]) {
            points[c.p2.id] = { x: Number(c.p2.x || 0), y: Number(c.p2.y || 0) };
            fixedIds.add(c.p2.id);
        }
        if (c.p3 && c.p3.type === 'fixed' && !points[c.p3.id]) {
            points[c.p3.id] = { x: Number(c.p3.x || 0), y: Number(c.p3.y || 0) };
            fixedIds.add(c.p3.id);
        }
    });

    const theta = actualParams.thetaDeg !== undefined
        ? deg2rad(actualParams.thetaDeg)
        : deg2rad(actualParams.theta || 0);

    components.forEach((c) => {
        if (c.type === 'bar' && c.p1?.id && c.p2?.id) {
            const len = getParamVal(c.lenParam, 0);
            constraints.push({ a: c.p1.id, b: c.p2.id, len, type: 'bar' });

            if (c.isInput) {
                const p1 = points[c.p1.id];
                const p2 = points[c.p2.id];
                const ang = theta + deg2rad(c.phaseOffset || 0);

                if (p1 && !p2) {
                    points[c.p2.id] = {
                        x: p1.x + len * Math.cos(ang),
                        y: p1.y + len * Math.sin(ang)
                    };
                } else if (p2 && !p1) {
                    points[c.p1.id] = {
                        x: p2.x - len * Math.cos(ang),
                        y: p2.y - len * Math.sin(ang)
                    };
                }
            }
        } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
            const g = getParamVal(c.gParam, 0);
            const r1 = getParamVal(c.r1Param, 0);
            const r2 = getParamVal(c.r2Param, 0);
            const triId = c.id || c.p3.id;
            triangles.set(triId, { p1: c.p1.id, p2: c.p2.id, p3: c.p3.id, sign: c.sign || 1 });
            constraints.push({ a: c.p1.id, b: c.p2.id, len: g, type: 'tri', role: 'g', triId });
            constraints.push({ a: c.p1.id, b: c.p3.id, len: r1, type: 'tri', role: 'r1', triId });
            constraints.push({ a: c.p2.id, b: c.p3.id, len: r2, type: 'tri', role: 'r2', triId });
        } else if (c.type === 'slider' && c.p1?.id && c.p2?.id) {
            const len = getParamVal(c.lenParam, 0);
            if (len > 0) {
                constraints.push({ a: c.p1.id, b: c.p2.id, len, type: 'slider' });
            }
            if (c.p3?.id) {
                lineConstraints.push({
                    id: c.p3.id,
                    line_p1: c.p1.id,
                    line_p2: c.p2.id,
                    sign: c.sign || 1
                });
            }
        }
    });

    // Allow ground bars (fixed-fixed) to follow their length parameter.
    components.forEach((c) => {
        if (c.type !== 'bar' || c.isInput) return;
        if (!c.p1?.id || !c.p2?.id || !c.lenParam) return;
        if (!fixedIds.has(c.p1.id) || !fixedIds.has(c.p2.id)) return;
        const p1 = points[c.p1.id];
        const p2 = points[c.p2.id];
        if (!p1 || !p2) return;
        const targetLen = getParamVal(c.lenParam, 0);
        if (!Number.isFinite(targetLen) || targetLen <= 0) return;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;

        // Anchor the endpoint that has a ground step if available.
        const p1Ground = topology?.steps?.some(s => s.type === 'ground' && s.id === c.p1.id);
        const p2Ground = topology?.steps?.some(s => s.type === 'ground' && s.id === c.p2.id);
        if (p1Ground && !p2Ground) {
            points[c.p2.id] = { x: p1.x + ux * targetLen, y: p1.y + uy * targetLen };
        } else if (p2Ground && !p1Ground) {
            points[c.p1.id] = { x: p2.x - ux * targetLen, y: p2.y - uy * targetLen };
        } else {
            points[c.p2.id] = { x: p1.x + ux * targetLen, y: p1.y + uy * targetLen };
        }
    });

    const prevPoints = actualParams && actualParams._prevPoints;
    let infeasible = false;
    let changed = true;
    let guard = 0;
    while (changed && guard < 50) {
        changed = false;
        guard += 1;

        for (const pid of pointIds) {
            if (points[pid]) continue;

            const related = constraints
                .filter(c => c.a === pid || c.b === pid)
                .map(c => {
                    const otherId = c.a === pid ? c.b : c.a;
                    return { ...c, otherId };
                })
                .filter(c => points[c.otherId]);

            if (related.length < 2) continue;

            const c1 = related[0];
            const c2 = related[1];
            const p1 = points[c1.otherId];
            const p2 = points[c2.otherId];
            const options = solveIntersectionOptions(p1, c1.len, p2, c2.len);
            if (!options.length) {
                infeasible = true;
                continue;
            }

            let chosen = null;
            const triKey = c1.triId && c1.triId === c2.triId ? c1.triId : null;
            if (triKey && triangles.has(triKey)) {
                const tri = triangles.get(triKey);
                if (pid === tri.p3 && ((c1.role === 'r1' && c2.role === 'r2') || (c1.role === 'r2' && c2.role === 'r1'))) {
                    chosen = tri.sign === -1 && options[1] ? options[1] : options[0];
                }
            }

            if (!chosen) {
                const prev = prevPoints ? prevPoints[pid] : null;
                if (prev) {
                    const d0 = Math.hypot(options[0].x - prev.x, options[0].y - prev.y);
                    const d1 = options[1] ? Math.hypot(options[1].x - prev.x, options[1].y - prev.y) : Infinity;
                    chosen = d0 <= d1 ? options[0] : options[1];
                } else {
                    chosen = options[0];
                }
            }

            if (chosen) {
                points[pid] = chosen;
                changed = true;
            }
        }
    }

    if (lineConstraints.length) {
        let lineChanged = true;
        let lineGuard = 0;
        while (lineChanged && lineGuard < 20) {
            lineChanged = false;
            lineGuard += 1;

            for (const lc of lineConstraints) {
                const a = points[lc.line_p1] || getInitialPoint(lc.line_p1);
                const b = points[lc.line_p2] || getInitialPoint(lc.line_p2);
                if (!a || !b) continue;

                const distConstraint = constraints.find(c => {
                    if (c.a === lc.id) return points[c.b];
                    if (c.b === lc.id) return points[c.a];
                    return false;
                });
                if (!distConstraint) continue;

                const otherId = distConstraint.a === lc.id ? distConstraint.b : distConstraint.a;
                const center = points[otherId];
                const r = distConstraint.len || 0;
                if (!center || r <= 0) continue;

                const options = solveLineCircleIntersection(a, b, center, r);
                if (!options.length) continue;

                let chosen = null;
                const prev = (prevPoints && prevPoints[lc.id]) || points[lc.id] || null;
                if (prev) {
                    const d0 = Math.hypot(options[0].x - prev.x, options[0].y - prev.y);
                    const d1 = options[1] ? Math.hypot(options[1].x - prev.x, options[1].y - prev.y) : Infinity;
                    chosen = d0 <= d1 ? options[0] : options[1];
                } else {
                    chosen = lc.sign === -1 && options[1] ? options[1] : options[0];
                }

                if (chosen) {
                    points[lc.id] = chosen;
                    lineChanged = true;
                }
            }
        }
    }

    let allResolved = true;
    for (const pid of pointIds) {
        if (!points[pid]) {
            allResolved = false;
            break;
        }
    }

    if (!infeasible) {
        for (const pid of pointIds) {
            if (points[pid]) continue;
            const related = constraints
                .filter(c => c.a === pid || c.b === pid)
                .map(c => {
                    const otherId = c.a === pid ? c.b : c.a;
                    return { ...c, otherId };
                })
                .filter(c => points[c.otherId]);

            if (!related.length) continue;
            const pick = related[0];
            const other = points[pick.otherId];
            const len = pick.len || 0;
            const seed = getInitialPoint(pid) || { x: other.x + len, y: other.y };
            let dx = seed.x - other.x;
            let dy = seed.y - other.y;
            const d = Math.hypot(dx, dy);
            if (d === 0) {
                dx = len;
                dy = 0;
            } else {
                dx = (dx / d) * len;
                dy = (dy / d) * len;
            }
            points[pid] = { x: other.x + dx, y: other.y + dy };
        }
    }

    const seedPoint = (pt) => {
        if (!pt || !pt.id || points[pt.id]) return;
        const x = Number(pt.x);
        const y = Number(pt.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            points[pt.id] = { x, y };
        }
    };

    components.forEach((c) => {
        if (c.type !== 'slider') return;
        seedPoint(c.p1);
        seedPoint(c.p2);
        seedPoint(c.p3);
    });

    return {
        isValid: !infeasible,
        isUnderconstrained: !infeasible && !allResolved,
        points,
        B: points[topology.tracePoint]
    };
}

/**
 * 自動從連桿關係推導 Dyad 步驟
 * 當使用者只定義了連桿 (Link) 而沒定義 Dyad 步驟時，此函數會自動補足。
 */
function autoDyadFromLinks(topo, params) {
    if (!topo || !topo.steps) return topo;

    const steps = [...topo.steps];
    const solved = new Set();
    const stepMap = new Map();

    // 初始化已解點 (Ground & Input Crank)
    steps.forEach(s => {
        solved.add(s.id);
        stepMap.set(s.id, s);
    });

    // 收集連桿資訊 (優先從 visualization.links 獲取，因為 Wizard 會把 bar 放到這裡)
    const barLinks = [];
    if (topo.visualization && Array.isArray(topo.visualization.links)) {
        topo.visualization.links.forEach(l => {
            if (l.p1 && l.p2) {
                // 嘗試尋找長度參數
                // 優先序：l.len_param -> l.lenParam -> topo.params[l.id]? -> l.id
                let lenParam = l.len_param || l.lenParam;
                if (!lenParam && topo.params && topo.params[l.id] !== undefined) lenParam = l.id;
                if (!lenParam) return;

                barLinks.push({ p1: l.p1, p2: l.p2, len_param: lenParam });
            }
        });
    }

    // 迭代求解所有點位
    let changed = true;
    while (changed) {
        changed = false;

        // 找出所有「未解」但連接到「兩個已解點」的點
        const candidateConnections = new Map(); // pointId -> Array of { neighborId, lenParam }

        barLinks.forEach(l => {
            const id1 = l.p1;
            const id2 = l.p2;

            // 如果 id1 已解且 id2 未解
            if (solved.has(id1) && !solved.has(id2)) {
                if (!candidateConnections.has(id2)) candidateConnections.set(id2, []);
                candidateConnections.get(id2).push({ neighborId: id1, lenParam: l.len_param });
            }
            // 如果 id2 已解且 id1 未解
            if (solved.has(id2) && !solved.has(id1)) {
                if (!candidateConnections.has(id1)) candidateConnections.set(id1, []);
                candidateConnections.get(id1).push({ neighborId: id2, lenParam: l.len_param });
            }
        });

        candidateConnections.forEach((conns, pointId) => {
            if (conns.length >= 2) {
                // 自動生成一個 dyad 步驟
                const step = {
                    id: pointId,
                    type: 'dyad',
                    p1: conns[0].neighborId,
                    r1_param: conns[0].lenParam,
                    p2: conns[1].neighborId,
                    r2_param: conns[1].lenParam,
                    sign: 1, // 預設正向
                    isAutoGenerated: true
                };
                steps.push(step);
                solved.add(pointId);
                changed = true;
            }
        });
    }

    return { ...topo, steps };
}

/**
 * Infer ground distance parameters from links between ground points.
 * This allows fixed ground bars to be driven by len_param (e.g., L4).
 */
function autoGroundDistFromLinks(topo) {
    if (!topo || !topo.steps || !topo.visualization || !Array.isArray(topo.visualization.links)) {
        return topo;
    }

    const steps = topo.steps.map(s => ({ ...s }));
    const stepMap = new Map(steps.map(s => [s.id, s]));

    topo.visualization.links.forEach((link) => {
        if (!link || !link.p1 || !link.p2) return;
        const lenParam = link.len_param || link.lenParam;
        if (!lenParam) return;

        const s1 = stepMap.get(link.p1);
        const s2 = stepMap.get(link.p2);
        if (!s1 || !s2) return;
        if (s1.type !== 'ground' || s2.type !== 'ground') return;
        if (s1.dist_param || s2.dist_param) return;
        if (s1.x === undefined || s1.y === undefined || s2.x === undefined || s2.y === undefined) return;

        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0) return;

        s2.dist_param = lenParam;
        s2.ref_id = s1.id;
        s2.ux = dx / dist;
        s2.uy = dy / dist;
    });

    return { ...topo, steps };
}

/**
 * 通用求解函數
 * @param {Object|string} topologyOrParams - 機構定義或參數物件
 * @param {Object} [params] - 當前參數 (如果第一個參數是拓撲)
 */
export function solveTopology(topologyOrParams, params) {
    let topology, actualParams;

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
    if (topology && topology._wizard_data && topology.bodyJoint !== false) {
        return solveBodyJointTopology(topology, actualParams);
    }



    if (!topology || !topology.steps) {
        return { isValid: true, points: {}, B: undefined };
    }

    // Auto-infer ground distance parameters from links (for fixed ground bars).
    topology = autoGroundDistFromLinks(topology);

    // 自動補足缺失的 Dyad 步驟
    topology = autoDyadFromLinks(topology, actualParams);

    const points = {};
    const theta = deg2rad(actualParams.thetaDeg || actualParams.theta || 0);

    // Helper to get value: either direct number or from params
    const getVal = (step, key) => {
        // 1. 直接數值 (r1_val, len_val)
        const valDirect = step[key + '_val'];
        if (valDirect !== undefined) return Number(valDirect);

        // 2. 參數名稱 (r1_param, len_param)
        const paramName = step[key + '_param'];

        // 優先從 actualParams 找 (即 Slider 傳入的值)
        if (paramName && actualParams[paramName] !== undefined) return Number(actualParams[paramName]);

        // 次之從 topology.params 找 (即預設參數值)
        if (paramName && topology.params && topology.params[paramName] !== undefined) return Number(topology.params[paramName]);

        // 3. 回退方案：如果參數名剛好是數字字串
        if (paramName && !isNaN(parseFloat(paramName))) return Number(paramName);

        return 100; // 預設 100
    };

    // --- 自動任務排序 (確保 Ground > Crank > Others) ---
    // 這樣使用者在 JSON 中不論順序如何，計算都不會因為依賴點未解而掛掉
    const sortedSteps = [...topology.steps].sort((a, b) => {
        const order = { 'ground': 0, 'input_crank': 1, 'dyad': 2, 'rigid_triangle': 2, 'slider': 2, 'joint': 3 };
        const oa = order[a.type] ?? 99;
        const ob = order[b.type] ?? 99;
        if (oa !== ob) return oa - ob;

        // For ground points, resolve absolute points before dependent (ref_id) points.
        if (a.type === 'ground' && b.type === 'ground') {
            const aDep = Boolean(a.dist_param && a.ref_id);
            const bDep = Boolean(b.dist_param && b.ref_id);
            if (aDep !== bDep) return aDep ? 1 : -1;
        }

        return 0;
    });

    // 處理所有步驟
    for (const step of sortedSteps) {
        try {
            if (step.type === 'ground') {
                let x, y;

                if (step.dist_param) {
                    const dist = getVal(step, 'dist');
                    const ref = points[step.ref_id];
                    if (ref) {
                        x = ref.x + (step.ux || 0) * dist;
                        y = ref.y + (step.uy || 0) * dist;
                    } else {
                        x = step.x || 0;
                        y = step.y || 0;
                    }
                } else {
                    if (step.x_param) {
                        x = (step.x_offset || 0) + getVal(step, 'x');
                    } else {
                        x = step.x || 0;
                    }

                    if (step.y_param) {
                        y = (step.y_offset || 0) + getVal(step, 'y');
                    } else {
                        y = step.y || 0;
                    }
                }

                points[step.id] = { x: Number(x), y: Number(y) };
            }
            else if (step.type === 'input_crank') {
                const center = points[step.center];
                if (!center) throw new Error(`Missing center point ${step.center}`);

                const r = getVal(step, 'len');
                const ang = theta + (deg2rad(step.phase_offset || 0));

                points[step.id] = {
                    x: center.x + r * Math.cos(ang),
                    y: center.y + r * Math.sin(ang)
                };
            }
            else if (step.type === 'rigid_triangle') {
                const p1 = points[step.p1];
                const p2 = points[step.p2];
                if (!p1 || !p2) {
                    continue;
                }

                const baseLen = getVal(step, 'g') || Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const r1 = getVal(step, 'r1');
                const r2 = getVal(step, 'r2');

                const localOptions = solveIntersectionOptions({ x: 0, y: 0 }, r1, { x: baseLen, y: 0 }, r2);
                if (!localOptions.length) {
                    continue;
                }

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const actualBase = Math.hypot(dx, dy);
                if (actualBase <= 0) {
                    continue;
                }

                if (Math.abs(actualBase - baseLen) > 1e-3) {
                    continue;
                }

                const ux = dx / actualBase;
                const uy = dy / actualBase;
                const local = step.sign === -1 ? localOptions[1] : localOptions[0];

                points[step.id] = {
                    x: p1.x + (ux * local.x - uy * local.y),
                    y: p1.y + (uy * local.x + ux * local.y)
                };
            }
            else if (step.type === 'slider') {
                const p1 = points[step.p1];
                const a = points[step.line_p1];
                const b = points[step.line_p2];
                if (!p1 || !a || !b) {
                    continue;
                }

                const r = getVal(step, 'r');
                const options = solveLineCircleIntersection(a, b, p1, r);
                if (!options.length) {
                    continue;
                }

                let chosen = null;
                const prevPoints = actualParams && actualParams._prevPoints;
                const prev = prevPoints ? prevPoints[step.id] : null;
                if (prev) {
                    const d0 = Math.hypot(options[0].x - prev.x, options[0].y - prev.y);
                    const d1 = options[1] ? Math.hypot(options[1].x - prev.x, options[1].y - prev.y) : Infinity;
                    chosen = d0 <= d1 ? options[0] : options[1];
                } else {
                    chosen = step.sign === -1 && options[1] ? options[1] : options[0];
                }
                if (chosen) points[step.id] = chosen;
            }
            else if (step.type === 'dyad') {
                const p1 = points[step.p1];
                const p2 = points[step.p2];
                if (!p1 || !p2) {
                    // console.warn(`Solver: Missing points for dyad ${step.id}`);
                    continue; // Best effort
                }
                const r1 = getVal(step, 'r1');
                const r2 = getVal(step, 'r2');
                const options = solveIntersectionOptions(p1, r1, p2, r2);

                if (!options.length) {
                    // console.warn(`Solver: No intersection for dyad ${step.id}`);
                    continue; // Best effort
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
            else if (step.type === 'point_on_link') {
                const p1 = points[step.p1];
                const p2 = points[step.p2];
                if (!p1 || !p2) continue;

                const dist = getVal(step, 'dist');
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const L = Math.hypot(dx, dy);

                if (L > 0) {
                    points[step.id] = {
                        x: p1.x + (dx / L) * dist,
                        y: p1.y + (dy / L) * dist
                    };
                } else {
                    points[step.id] = { ...p1 };
                }
            }
            else if (step.type === 'joint') {
                // Static point (typically for visualization of unsolved parts)
                if (points[step.id] === undefined) {
                    points[step.id] = { x: Number(step.x || 0), y: Number(step.y || 0) };
                }
            }
        } catch (e) {
            console.error("Solver Error at step", step.id, e);
        }
    }

    // 獲取追蹤點
    const B = points[topology.tracePoint];

    // 嚴格驗證機制：檢查所有關鍵步驟是否都有解
    // 如果有 Dyad 或 Crank 解不出來 (undefined/NaN)，則視為機構卡死
    let allResolved = true;
    for (const s of topology.steps) {
        if ((s.type === 'dyad' || s.type === 'rigid_triangle' || s.type === 'slider' || s.type === 'input_crank') && !points[s.id]) {
            allResolved = false;
            break;
        }
    }

    return {
        isValid: allResolved,
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
