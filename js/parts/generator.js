/**
 * Parts Generator
 * 零件生成器
 */

import { fmt } from '../utils.js';

/**
 * 生成四連桿的 4 根桿件
 * 每根桿件為矩形，兩端有孔
 * 
 * @param {Object} params - 參數物件
 * @param {number} params.a - Ground link length
 * @param {number} params.b - Input link length
 * @param {number} params.c - Coupler link length
 * @param {number} params.d - Output link length
 * @param {number} params.barW - 桿件寬度
 * @param {number} params.margin - 端到孔中心邊距
 * @param {number} params.holeD - 孔徑
 * @param {number} params.spacing - 零件間距
 * @param {number} params.workX - 工作範圍 X
 * @param {number} params.workY - 工作範圍 Y
 * @returns {Array} 零件陣列
 */
export function generateParts({
    a,
    b,
    c,
    d,
    barW,
    margin,
    holeD,
    spacing,
    barStyle = 'rect',
    workX,
    workY,
}) {
    const parts = [
        { id: "ground", L: a, color: "#666" },
        { id: "input", L: b, color: "#e74c3c" },
        { id: "coupler", L: c, color: "#3498db" },
        { id: "output", L: d, color: "#27ae60" },
    ];

    // 排版：從左到右放置桿件，必要時換行
    let xCursor = 10;
    let yCursor = 10;
    let rowH = 0;

    const out = [];
    for (const p of parts) {
        const rectL = p.L + 2 * margin;
        const rectW = barW;

        const w = rectL;
        const h = rectW;

        // 檢查是否需要換行
        if (xCursor + w + 10 > workX) {
            xCursor = 10;
            yCursor += rowH + spacing;
            rowH = 0;
        }
        rowH = Math.max(rowH, h);

        const x0 = xCursor;
        const y0 = yCursor;

        // 檢查是否超出工作範圍
        if (x0 < 0 || y0 < 0 || x0 + w > workX || y0 + h > workY) {
            throw new Error(
                `零件 ${p.id} 排版超出工作範圍：需要 (${fmt(x0 + w)}, ${fmt(
                    y0 + h
                )})，但工作區是 (${workX}, ${workY})`
            );
        }

        const cx = x0 + w / 2;
        const cy = y0 + h / 2;

        // 孔位置：沿 x 軸（桿件長度方向），y 在中心
        const hole1 = { x: x0 + margin, y: cy };
        const hole2 = { x: x0 + margin + p.L, y: cy };

        out.push({
            id: p.id,
            L: p.L,
            color: p.color,
            rect: { x: x0, y: y0, w, h },
            holes: [hole1, hole2],
            holeD,
            barStyle,
        });

        xCursor += w + spacing;
    }

    return out;
}

/**
 * 驗證零件是否在工作範圍內
 * @param {Array} parts - 零件陣列
 * @param {number} workX - 工作範圍 X
 * @param {number} workY - 工作範圍 Y
 * @returns {boolean} 是否全部在範圍內
 */
export function validatePartsLayout(parts, workX, workY) {
    for (const part of parts) {
        const { x, y, w, h } = part.rect;
        if (x < 0 || y < 0 || x + w > workX || y + h > workY) {
            return false;
        }
    }
    return true;
}

/**
 * 計算零件佔用的總面積
 * @param {Array} parts - 零件陣列
 * @returns {{width: number, height: number, area: number}}
 */
export function calculatePartsArea(parts) {
    if (parts.length === 0) {
        return { width: 0, height: 0, area: 0 };
    }

    let maxX = 0;
    let maxY = 0;

    for (const part of parts) {
        const { x, y, w, h } = part.rect;
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    }

    return {
        width: maxX,
        height: maxY,
        area: maxX * maxY,
    };
}
