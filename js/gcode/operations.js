/**
 * G-code Operations
 * G-code 基本操作
 */

import { fmt } from '../utils.js';

/**
 * G-code 檔頭
 * @param {Object} params - 參數
 * @param {number} params.safeZ - 安全高度
 * @param {number} params.spindle - 主軸轉速（可選）
 * @returns {Array<string>} G-code 行陣列
 */
export function gcodeHeader({ safeZ, spindle }) {
    const lines = [];
    lines.push("(MVP 4-bar parts, GRBL)");
    lines.push("G21  (mm)");
    lines.push("G90  (absolute)");
    lines.push("G17  (XY plane)");
    lines.push("G94  (feed per minute)");
    lines.push(`G0 Z${fmt(safeZ)}`);
    if (Number.isFinite(spindle) && spindle > 0) {
        lines.push(`M3 S${fmt(spindle)}`);
    }
    return lines;
}

/**
 * G-code 檔尾
 * @param {Object} params - 參數
 * @param {number} params.safeZ - 安全高度
 * @param {number} params.spindle - 主軸轉速（可選）
 * @returns {Array<string>} G-code 行陣列
 */
export function gcodeFooter({ safeZ, spindle }) {
    const lines = [];
    lines.push(`G0 Z${fmt(safeZ)}`);
    if (Number.isFinite(spindle) && spindle > 0) {
        lines.push("M5");
    }
    lines.push("M2");
    return lines;
}

/**
 * 鑽孔操作
 * @param {Object} params - 參數
 * @param {Array} params.holes - 孔位陣列 [{x, y}, ...]
 * @param {number} params.safeZ - 安全高度
 * @param {number} params.drillZ - 鑽孔深度（負值）
 * @param {number} params.feedZ - Z 軸進給速度
 * @returns {Array<string>} G-code 行陣列
 */
export function drillOps({ holes, safeZ, drillZ, feedZ }) {
    const lines = [];
    lines.push("(Drill holes)");
    for (const h of holes) {
        lines.push(`G0 Z${fmt(safeZ)}`);
        lines.push(`G0 X${fmt(h.x)} Y${fmt(h.y)}`);
        lines.push(`G1 Z${fmt(drillZ)} F${fmt(feedZ)}`);
        lines.push(`G0 Z${fmt(safeZ)}`);
    }
    return lines;
}

/**
 * 矩形外形切割操作（多層）
 * @param {Object} params - 參數
 * @param {Object} params.rect - 矩形 {x, y, w, h}
 * @param {number} params.safeZ - 安全高度
 * @param {number} params.cutDepth - 總切深（負值）
 * @param {number} params.stepdown - 每層下刀深度
 * @param {number} params.feedXY - XY 進給速度
 * @param {number} params.feedZ - Z 進給速度
 * @returns {Array<string>} G-code 行陣列
 */
export function profileRectOps({
    rect,
    safeZ,
    cutDepth,
    stepdown,
    feedXY,
    feedZ,
}) {
    const lines = [];
    lines.push("(Profile rectangle)");
    const x0 = rect.x,
        y0 = rect.y,
        x1 = rect.x + rect.w,
        y1 = rect.y + rect.h;

    // 起始點：左下角
    const startX = x0;
    const startY = y0;

    // 多層 Z 深度：-stepdown, -2*stepdown, ... 直到 -cutDepth
    const zLevels = [];
    const total = Math.abs(cutDepth);
    const sd = Math.abs(stepdown);
    const n = Math.max(1, Math.ceil(total / sd));
    for (let i = 1; i <= n; i++) {
        const z = -Math.min(i * sd, total);
        zLevels.push(z);
    }

    for (const z of zLevels) {
        lines.push(`G0 Z${fmt(safeZ)}`);
        lines.push(`G0 X${fmt(startX)} Y${fmt(startY)}`);
        lines.push(`G1 Z${fmt(z)} F${fmt(feedZ)}`);

        // 逆時針繞矩形
        lines.push(`G1 X${fmt(x1)} Y${fmt(y0)} F${fmt(feedXY)}`);
        lines.push(`G1 X${fmt(x1)} Y${fmt(y1)} F${fmt(feedXY)}`);
        lines.push(`G1 X${fmt(x0)} Y${fmt(y1)} F${fmt(feedXY)}`);
        lines.push(`G1 X${fmt(x0)} Y${fmt(y0)} F${fmt(feedXY)}`);

        lines.push(`G0 Z${fmt(safeZ)}`);
    }

    return lines;
}

/**
 * 圓角矩形外形切割（多層）
 */
export function profileRoundedRectOps({
    rect,
    safeZ,
    cutDepth,
    stepdown,
    feedXY,
    feedZ,
}) {
    const lines = [];
    lines.push("(Profile rounded rectangle)");
    const { x: x0, y: y0, w, h } = rect;
    const r = h / 2;
    const x1 = x0 + w;
    const y1 = y0 + h;

    const zLevels = [];
    const total = Math.abs(cutDepth);
    const sd = Math.abs(stepdown);
    const n = Math.max(1, Math.ceil(total / sd));
    for (let i = 1; i <= n; i++) {
        zLevels.push(-Math.min(i * sd, total));
    }

    for (const z of zLevels) {
        lines.push(`G0 Z${fmt(safeZ)}`);
        // 起點：底部直線的開始
        lines.push(`G0 X${fmt(x0 + r)} Y${fmt(y0)}`);
        lines.push(`G1 Z${fmt(z)} F${fmt(feedZ)}`);

        // 1. 底部直線
        lines.push(`G1 X${fmt(x1 - r)} Y${fmt(y0)} F${fmt(feedXY)}`);
        // 2. 右側半圓 (G3 CCW, I,J 為起點到中心的位移)
        // 起點 (x1-r, y0), 中心 (x1-r, y0+r) -> I=0, J=r
        lines.push(`G3 X${fmt(x1 - r)} Y${fmt(y1)} I${fmt(0)} J${fmt(r)} F${fmt(feedXY)}`);
        // 3. 頂部直線
        lines.push(`G1 X${fmt(x0 + r)} Y${fmt(y1)} F${fmt(feedXY)}`);
        // 4. 左側半圓
        // 起點 (x0+r, y1), 中心 (x0+r, y0+r) -> I=0, J=-r
        lines.push(`G3 X${fmt(x0 + r)} Y${fmt(y0)} I${fmt(0)} J${fmt(-r)} F${fmt(feedXY)}`);

        lines.push(`G0 Z${fmt(safeZ)}`);
    }

    return lines;
}

/**
 * 圓形外形切割操作（多層）
 */
export function profileCircleOps({
    cx,
    cy,
    diameter,
    safeZ,
    cutDepth,
    stepdown,
    feedXY,
    feedZ,
}) {
    const lines = [];
    lines.push("(Profile circle)");
    const r = diameter / 2;

    const zLevels = [];
    const total = Math.abs(cutDepth);
    const sd = Math.abs(stepdown);
    const n = Math.max(1, Math.ceil(total / sd));
    for (let i = 1; i <= n; i++) {
        zLevels.push(-Math.min(i * sd, total));
    }

    for (const z of zLevels) {
        lines.push(`G0 Z${fmt(safeZ)}`);
        // 起點：圓的最右側 (cx + r, cy)
        lines.push(`G0 X${fmt(cx + r)} Y${fmt(cy)}`);
        lines.push(`G1 Z${fmt(z)} F${fmt(feedZ)}`);

        // 使用 G3 逆時針繞一整圈
        // 起點 (cx + r, cy), 切回 (cx + r, cy), 中心偏移 I=-r, J=0
        lines.push(`G3 X${fmt(cx + r)} Y${fmt(cy)} I${fmt(-r)} J${fmt(0)} F${fmt(feedXY)}`);

        lines.push(`G0 Z${fmt(safeZ)}`);
    }

    return lines;
}

/**
 * 任意點陣列路徑切割操作 (多層)
 * @param {Object} params - 參數
 * @param {Array<{x, y}>} params.points - 封閉路徑的點陣列
 * @param {number} params.safeZ - 安全高度
 * @param {number} params.cutDepth - 總切深
 * @param {number} params.stepdown - 每層下刀
 * @param {number} params.feedXY - XY 進給
 * @param {number} params.feedZ - Z 進給
 */
export function profilePathOps({
    points,
    safeZ,
    cutDepth,
    stepdown,
    feedXY,
    feedZ
}) {
    if (!points || points.length < 2) return [];

    const lines = [];
    lines.push("(Profile arbitrary path)");

    const zLevels = [];
    const total = Math.abs(cutDepth);
    const sd = Math.abs(stepdown);
    const n = Math.max(1, Math.ceil(total / sd));
    for (let i = 1; i <= n; i++) {
        zLevels.push(-Math.min(i * sd, total));
    }

    const startX = points[0].x;
    const startY = points[0].y;

    for (const z of zLevels) {
        lines.push(`G0 Z${fmt(safeZ)}`);
        lines.push(`G0 X${fmt(startX)} Y${fmt(startY)}`);
        lines.push(`G1 Z${fmt(z)} F${fmt(feedZ)}`);

        // 沿點陣列移動
        for (let j = 1; j < points.length; j++) {
            lines.push(`G1 X${fmt(points[j].x)} Y${fmt(points[j].y)} F${fmt(feedXY)}`);
        }

        // 確保路徑閉合：回到起點
        const lastP = points[points.length - 1];
        if (lastP.x !== startX || lastP.y !== startY) {
            lines.push(`G1 X${fmt(startX)} Y${fmt(startY)} F${fmt(feedXY)}`);
        }

        lines.push(`G0 Z${fmt(safeZ)}`);
    }

    return lines;
}

/**
 * Tangent-hull outline for equal-radius circles (outer boundary).
 * @param {Object} params
 * @param {Array<{x:number,y:number,r:number}>} params.circles
 * @param {number} params.safeZ
 * @param {number} params.cutDepth
 * @param {number} params.stepdown
 * @param {number} params.feedXY
 * @param {number} params.feedZ
 */
export function profileTangentHullOps({
    circles,
    safeZ,
    cutDepth,
    stepdown,
    feedXY,
    feedZ,
}) {
    if (!circles || circles.length < 2) return [];

    const getTangent = (c1, c2) => {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return null;
        const nx = dy / dist;
        const ny = -dx / dist;
        return {
            start: { x: c1.x + nx * c1.r, y: c1.y + ny * c1.r },
            end: { x: c2.x + nx * c2.r, y: c2.y + ny * c2.r }
        };
    };

    const tangents = [];
    const n = circles.length;
    for (let i = 0; i < n; i++) {
        const t = getTangent(circles[i], circles[(i + 1) % n]);
        if (!t) return [];
        tangents.push(t);
    }

    const zLevels = [];
    const total = Math.abs(cutDepth);
    const sd = Math.abs(stepdown);
    const steps = Math.max(1, Math.ceil(total / sd));
    for (let i = 1; i <= steps; i++) {
        zLevels.push(-Math.min(i * sd, total));
    }

    const lines = [];
    lines.push("(Profile tangent hull)");

    const cross = (ax, ay, bx, by) => ax * by - ay * bx;

    for (const z of zLevels) {
        const first = tangents[0].start;
        lines.push(`G0 Z${fmt(safeZ)}`);
        lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)}`);
        lines.push(`G1 Z${fmt(z)} F${fmt(feedZ)}`);

        for (let i = 0; i < n; i++) {
            const curr = tangents[i];
            const next = tangents[(i + 1) % n];
            const cNext = circles[(i + 1) % n];

            lines.push(`G1 X${fmt(curr.end.x)} Y${fmt(curr.end.y)} F${fmt(feedXY)}`);

            const v1x = curr.end.x - cNext.x;
            const v1y = curr.end.y - cNext.y;
            const v2x = next.start.x - cNext.x;
            const v2y = next.start.y - cNext.y;
            const ccw = cross(v1x, v1y, v2x, v2y) > 0;
            const cmd = ccw ? "G3" : "G2";
            const iOff = cNext.x - curr.end.x;
            const jOff = cNext.y - curr.end.y;
            lines.push(
                `${cmd} X${fmt(next.start.x)} Y${fmt(next.start.y)} I${fmt(iOff)} J${fmt(jOff)} F${fmt(feedXY)}`
            );
        }

        lines.push(`G0 Z${fmt(safeZ)}`);
    }

    return lines;
}
