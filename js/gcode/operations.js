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
 * 圓形外形切割操作（多層）- 預留給未來擴展
 * @param {Object} params - 參數
 * @returns {Array<string>} G-code 行陣列
 */
export function profileCircleOps(params) {
    // TODO: 實作圓形切割
    return ["(Circle profile - not implemented yet)"];
}
