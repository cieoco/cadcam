/**
 * Generic Multilink Parts Generator
 * 通用多連桿零件生成器
 */

import { fmt } from '../utils.js';

// Helper to solve triangle vertex C relative to A(0,0) and B(c,0)
function solveTriangleVertex(b, a, c) {
    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    return { x: b * cosA, y: b * sinA };
}

export function generateMultilinkParts(params) {
    let topology = { parts: [] };
    if (params.topology) {
        try {
            topology = JSON.parse(params.topology);
        } catch (e) {
            console.warn("Parts: Invalid JSON", e);
        }
    }

    const {
        barW = 15, margin = 7, holeD = 3.2,
        workX = 800, workY = 600, spacing = 8
    } = params;

    const parts = [];

    // Helper to get value
    const getVal = (paramName) => {
        if (typeof paramName === 'number') return paramName;
        const v = (params[paramName] !== undefined) ? Number(params[paramName]) : 0;
        return v || 100; // 預設長度改為 100
    };

    if (!topology.parts || !Array.isArray(topology.parts)) {
        return [];
    }

    for (const p of topology.parts) {
        if (p.type === 'bar') {
            const L = getVal(p.len_param);
            parts.push({
                id: p.id,
                type: 'bar',
                L: L,
                w: L + 2 * margin,
                h: barW,
                color: p.color || '#34495e',
                holes: [
                    { x: margin, y: barW / 2 },
                    { x: margin + L, y: barW / 2 }
                ],
                outline: [
                    { x: margin, y: barW / 2, r: holeD / 2 + margin },
                    { x: margin + L, y: barW / 2, r: holeD / 2 + margin }
                ]
            });
        }
        else if (p.type === 'triangle') {
            if (!p.len_params || p.len_params.length < 3) continue;

            const [pName1, pName2, pName3] = p.len_params;
            const len1 = getVal(pName1); // Base
            const len2 = getVal(pName2); // Left
            const len3 = getVal(pName3); // Right

            console.log(`Triangle ${p.id}: len1=${len1}, len2=${len2}, len3=${len3}, margin=${margin}, holeD=${holeD}`);


            const v = solveTriangleVertex(len2, len3, len1);

            const xs = [0, len1, v.x];
            const ys = [0, 0, v.y];
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);

            const triW = (maxX - minX) + 2 * margin;
            const rawH = maxY - minY;
            const triH = Math.max(rawH + 2 * margin, barW + 2 * margin);

            const offsetX = margin - minX;
            const offsetY = margin - minY + (triH - (rawH + 2 * margin)) / 2;

            parts.push({
                id: p.id,
                type: 'plate',
                w: triW,
                h: triH,
                color: p.color || '#3498db',
                holes: [
                    { x: 0 + offsetX, y: 0 + offsetY },
                    { x: len1 + offsetX, y: 0 + offsetY },
                    { x: v.x + offsetX, y: v.y + offsetY }
                ],
                outline: [
                    { x: 0 + offsetX, y: 0 + offsetY, r: holeD / 2 + margin },
                    { x: len1 + offsetX, y: 0 + offsetY, r: holeD / 2 + margin },
                    { x: v.x + offsetX, y: v.y + offsetY, r: holeD / 2 + margin }
                ]
            });
        }
    }

    // Layout Logic
    let xCursor = 10, yCursor = 10, rowH = 0;
    const out = [];

    for (const p of parts) {
        if (xCursor + p.w + 10 > workX) {
            xCursor = 10;
            yCursor += rowH + spacing;
            rowH = 0;
        }

        const placedHoles = p.holes.map(h => ({
            x: xCursor + h.x,
            y: yCursor + h.y
        }));

        // Transform outline to absolute coords
        let placedOutline = null;
        if (p.outline) {
            placedOutline = p.outline.map(c => ({
                x: xCursor + c.x,
                y: yCursor + c.y,
                r: c.r
            }));
        }

        out.push({
            id: p.id,
            rect: { x: xCursor, y: yCursor, w: p.w, h: p.h },
            holes: placedHoles,
            outline: placedOutline,
            color: p.color,
            holeD,
            barStyle: params.barStyle
        });

        rowH = Math.max(rowH, p.h);
        xCursor += p.w + spacing;
    }

    return out;
}
