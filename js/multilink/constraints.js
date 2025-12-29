/**
 * Predictive Geometric Constraint System
 * 預判式幾何約束系統
 * 
 * 目的：
 * 根據當前機構狀態，計算特定參數（如 L4）的幾何有效範圍 [Min, Max]。
 * 防止使用者輸入導致機構破壞 (Invalid State) 的數值。
 */

import { solveTopology } from './solver.js';

/**
 * 計算參數的有效範圍
 * @param {Object} mech 機構定義物件 (包含 topology, params 等)
 * @param {string} paramName 目標參數名稱 (例如 "L4")
 * @returns {Object|null} { min, max } 或 null (無法計算)
 */
export function calculateValidRange(mech, paramName) {
    if (!mech || !mech.topology || !paramName) return null;

    let topology = mech.topology;
    if (typeof topology === 'string') {
        try { topology = JSON.parse(topology); } catch (e) { return null; }
    }

    // 1. 找出受此參數影響的步驟 (Step)
    // 目前主要針對 Ground Point 的 dist_param (例如 L4 控制 P4)
    const targetStep = topology.steps.find(s =>
        (s.type === 'ground' && s.dist_param === paramName) ||
        (s.type === 'ground' && (s.x_param === paramName || s.y_param === paramName))
    );

    if (!targetStep) return null; // 目前只實作 Ground Bar 的約束預判

    // 2. 找出依賴此 Ground Point 的 Dyad
    // 我們需要找到一個 Dyad，它的 p1 或 p2 連接到了 targetStep.id
    // 且 Dyad 的另一端是已知點 (例如 Input Crank 的端點)
    const dyad = topology.steps.find(s =>
        s.type === 'dyad' && (s.p1 === targetStep.id || s.p2 === targetStep.id)
    );

    if (!dyad) return null; // 沒有構成 Dyad，表示沒有三角不等式約束，範圍無限

    // 3. 準備求解所需資訊
    // 我們需要計算 Dyad 另一端點 (Fixed Point, e.g., P2) 的當前座標
    // 這需要先解出 Crank 的位置。
    // 為了避免遞迴依賴，我們先用當前參數解一次 (假設當前狀態大致有效，或至少 Crank 有效)
    const sol = solveTopology(mech);

    // 確保 Crank 端點 (P2) 已解出
    const p2Id = (dyad.p1 === targetStep.id) ? dyad.p2 : dyad.p1;
    const p2 = sol.points[p2Id];

    if (!p2) return null; // Crank 端點未解，無法計算

    // 4. 建立幾何方程式
    // P4 (Ground Point) 是 param (L4) 的函數
    // P4 = Ref + U * t
    // P2 是已知點
    // 限制：|L2 - L3| <= Dist(P2, P4) <= L2 + L3

    // 取得 P4 的定義 (Ref, U)
    let refPoint = { x: 0, y: 0 };
    let ux = 0, uy = 0;

    if (targetStep.dist_param) {
        const ref = sol.points[targetStep.ref_id];
        if (!ref) return null;
        refPoint = ref;
        ux = targetStep.ux || 0;
        uy = targetStep.uy || 0;
    } else {
        // 相容舊版 x_param / y_param (雖然這會有誤差，但還是給個近似範圍)
        if (targetStep.x_param === paramName) {
            refPoint = { x: targetStep.x_offset || 0, y: targetStep.y || 0 };
            ux = 1; uy = 0;
        } else if (targetStep.y_param === paramName) {
            refPoint = { x: targetStep.x || 0, y: targetStep.y_offset || 0 };
            ux = 0; uy = 1;
        }
    }

    // 取得連桿長度 L2, L3
    const getVal = (step, key) => {
        const valDirect = step[key + '_val'];
        if (valDirect !== undefined) return Number(valDirect);
        const pName = step[key + '_param'];
        if (pName && mech[pName] !== undefined) return Number(mech[pName]);
        if (pName && topology.params && topology.params[pName] !== undefined) return Number(topology.params[pName]);
        return 100;
    };

    const r1 = getVal(dyad, 'r1');
    const r2 = getVal(dyad, 'r2');

    const R_max = r1 + r2;
    const R_min = Math.abs(r1 - r2);

    // 向量 V = Ref - P2
    const Vx = refPoint.x - p2.x;
    const Vy = refPoint.y - p2.y;

    // DistSq(t) = |V + U*t|^2 = |V|^2 + 2(V.U)t + |U|^2 * t^2
    // 因為 U 是單位向量 (或軸向量)，|U|^2 = 1
    // DistSq(t) = t^2 + 2(V.U)t + |V|^2

    const A = 1;
    const B = 2 * (Vx * ux + Vy * uy);
    const C_base = (Vx * Vx + Vy * Vy);

    // 我們需要找出 t 的範圍，使得 R_min^2 <= DistSq(t) <= R_max^2

    // 解 t^2 + Bt + (C_base - R_max^2) <= 0  (外圓內)
    const rangeOuter = solveQuadraticInequality(A, B, C_base - R_max * R_max, true);

    // 解 t^2 + Bt + (C_base - R_min^2) >= 0  (內圓外)
    // 這通常會給出兩個不相連的區間 (遠離內圓)，或者全域 (如果內圓很小)
    const rangeInner = solveQuadraticInequality(A, B, C_base - R_min * R_min, false);

    // 取交集
    const finalRange = intersectRanges(rangeOuter, rangeInner);

    // 因為 t (L4) 通常必須 > 0
    const positiveRange = intersectRanges(finalRange, [{ min: 0.1, max: Infinity }]);

    // 找到包含當前值 (或最接近當前值) 的區間
    const currentVal = mech[paramName] || 0;
    const bestRange = findBestRange(positiveRange, currentVal);

    return bestRange;
}

/**
 * 解一元二次不等式 At^2 + Bt + C <= 0 (isLess=true) 或 >= 0 (isLess=false)
 * 假設 A > 0
 */
function solveQuadraticInequality(A, B, C, isLess) {
    const delta = B * B - 4 * A * C;

    if (delta < 0) {
        // 無實根
        // 函數曲線整個在 X 軸上方 (因為 A=1 > 0)
        // 如果求 <= 0，則無解
        // 如果求 >= 0，則全域有解
        return isLess ? [] : [{ min: -Infinity, max: Infinity }];
    }

    const sqrtDelta = Math.sqrt(delta);
    const t1 = (-B - sqrtDelta) / (2 * A);
    const t2 = (-B + sqrtDelta) / (2 * A);
    // t1 <= t2

    if (isLess) {
        // 求 <= 0，區間在兩根之間 [t1, t2]
        return [{ min: t1, max: t2 }];
    } else {
        // 求 >= 0，區間在兩根之外 (-inf, t1] U [t2, inf)
        return [
            { min: -Infinity, max: t1 },
            { min: t2, max: Infinity }
        ];
    }
}

function intersectRanges(ranges1, ranges2) {
    const result = [];
    for (const r1 of ranges1) {
        for (const r2 of ranges2) {
            const min = Math.max(r1.min, r2.min);
            const max = Math.min(r1.max, r2.max);
            if (min <= max) {
                result.push({ min, max });
            }
        }
    }
    return result;
}

function findBestRange(ranges, currentVal) {
    if (!ranges || ranges.length === 0) return null;

    // 1. 如果當前值在某個區間內，就回傳該區間 (這是最常見的情況)
    for (const r of ranges) {
        if (currentVal >= r.min && currentVal <= r.max) return r;
    }

    // 2. 如果不在任何區間內，找最近的區間
    let best = null;
    let minDist = Infinity;

    for (const r of ranges) {
        const d = Math.min(Math.abs(currentVal - r.min), Math.abs(currentVal - r.max));
        if (d < minDist) {
            minDist = d;
            best = r;
        }
    }
    return best;
}
