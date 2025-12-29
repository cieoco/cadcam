/**
 * Generic Parts Generator
 * 通用零件生成器 - 讀取 Topology 定義來生成零件
 */

import { fmt } from '../utils.js';
import { JANSEN_TOPOLOGY } from './topology.js';

// Helper to solve triangle vertex C relative to A(0,0) and B(c,0)
function solveTriangleVertex(b, a, c) {
    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    return { x: b * cosA, y: b * sinA };
}

function ensureCCW(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        area += (p1.x * p2.y - p2.x * p1.y);
    }
    if (area < 0) return [...points].reverse();
    return points;
}

function offsetPolygonInward(points, offset) {
    if (!points || points.length < 3 || offset <= 0) return null;
    const pts = ensureCCW(points);
    const n = pts.length;

    const edges = [];
    for (let i = 0; i < n; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return null;
        const ux = dx / len;
        const uy = dy / len;
        // CCW polygon: inward normal is left normal (-uy, ux)
        const nx = -uy;
        const ny = ux;
        const pOffset = { x: p1.x + nx * offset, y: p1.y + ny * offset };
        edges.push({ p: pOffset, d: { x: ux, y: uy } });
    }

    const intersect = (l1, l2) => {
        const rx = l1.d.x;
        const ry = l1.d.y;
        const sx = l2.d.x;
        const sy = l2.d.y;
        const denom = rx * sy - ry * sx;
        if (Math.abs(denom) < 1e-9) return null;
        const qpx = l2.p.x - l1.p.x;
        const qpy = l2.p.y - l1.p.y;
        const t = (qpx * sy - qpy * sx) / denom;
        return { x: l1.p.x + t * rx, y: l1.p.y + t * ry };
    };

    const out = [];
    for (let i = 0; i < n; i++) {
        const lPrev = edges[(i - 1 + n) % n];
        const lCurr = edges[i];
        const p = intersect(lPrev, lCurr);
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        out.push(p);
    }

    return out;
}

export function generateJansenParts(params) {
    // 1. Determine Topology
    let topology = JANSEN_TOPOLOGY;
    if (params.topology) {
        try {
            topology = JSON.parse(params.topology);
        } catch (e) {
            console.warn("Parts: Invalid JSON", e);
        }
    }

    const {
        barW = 15, margin = 7, holeD = 3.2,
        workX, workY, spacing = 8,
        triHollow = false
    } = params;

    const parts = [];

    // Helper to get value
    const getVal = (paramName) => {
        if (typeof paramName === 'number') return paramName;
        return (params[paramName] !== undefined) ? Number(params[paramName]) : 0;
    };

    if (!topology.parts) {
        return []; // No parts defined
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
                ]
            });
        }
        else if (p.type === 'triangle') {
            // Expect len_params: [sideA, sideB, sideC]
            // We assume sideA is the base (P1-P2), sideB is P1-P3, sideC is P2-P3
            // Wait, triangle definition usually is 3 side lengths.
            // Let's assume order: Base(b), SideLeft(c), SideRight(a) in standard notation?
            // Let's stick to the solver helper: Base=c, Left=b, Right=a
            // topology.js says: ['e', 'f', 'a_len'] => P1-P3, P1-P4, P3-P4
            // So Triangle P1, P3, P4.
            // Side A = P1-P3 (e)
            // Side B = P1-P4 (f)
            // Side C = P3-P4 (a_len)
            // We can lay P1 at (0,0), P3 at (e,0). P4 is determined by f and a_len.

            const [pName1, pName2, pName3] = p.len_params;
            const len1 = getVal(pName1); // Base e
            const len2 = getVal(pName2); // Left f
            const len3 = getVal(pName3); // Right a_len

            // Solve P4 position (relative to P1)
            // Base = len1. Left = len2. Right = len3.
            // Vertex is intersection of circle(0,0,len2) and circle(len1,0,len3)
            // Using solveTriangleVertex(b=len2, a=len3, c=len1)
            const v = solveTriangleVertex(len2, len3, len1);

            // Points: (0,0), (len1,0), (v.x, v.y)
            const xs = [0, len1, v.x];
            const ys = [0, 0, v.y];
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);

            const outerR = Math.max(barW / 2, holeD / 2);
            const pad = Math.max(margin, outerR);
            const triW = (maxX - minX) + 2 * pad;
            // Height calculation
            const rawH = maxY - minY;
            const triH = Math.max(rawH + 2 * pad, barW + 2 * pad);

            const offsetX = pad - minX;
            // Center vertically if thin
            const offsetY = pad - minY + (triH - (rawH + 2 * pad)) / 2;

            const basePoints = [
                { x: 0 + offsetX, y: 0 + offsetY },
                { x: len1 + offsetX, y: 0 + offsetY },
                { x: v.x + offsetX, y: v.y + offsetY }
            ];

            const innerPoints = triHollow ? offsetPolygonInward(basePoints, barW) : null;
            const hollowEnabled = triHollow && innerPoints && innerPoints.length === 3;

            parts.push({
                id: p.id,
                type: 'plate',
                w: triW,
                h: triH,
                color: p.color || '#3498db',
                holes: [
                    { x: 0 + offsetX, y: 0 + offsetY },      // P1
                    { x: len1 + offsetX, y: 0 + offsetY },   // P3
                    { x: v.x + offsetX, y: v.y + offsetY }   // P4
                ],
                outline: [
                    { x: 0 + offsetX, y: 0 + offsetY, r: outerR },
                    { x: len1 + offsetX, y: 0 + offsetY, r: outerR },
                    { x: v.x + offsetX, y: v.y + offsetY, r: outerR }
                ],
                innerOutline: hollowEnabled ? [
                    { x: innerPoints[0].x, y: innerPoints[0].y, r: outerR },
                    { x: innerPoints[1].x, y: innerPoints[1].y, r: outerR },
                    { x: innerPoints[2].x, y: innerPoints[2].y, r: outerR }
                ] : null
            });
        }
    }

    // Layout Logic (Simple Row Packing)
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

        const placedOutline = p.outline ? p.outline.map(c => ({
            x: xCursor + c.x,
            y: yCursor + c.y,
            r: c.r
        })) : null;

        const placedInnerOutline = p.innerOutline ? p.innerOutline.map(c => ({
            x: xCursor + c.x,
            y: yCursor + c.y,
            r: c.r
        })) : null;

        out.push({
            id: p.id,
            rect: { x: xCursor, y: yCursor, w: p.w, h: p.h },
            holes: placedHoles,
            outline: placedOutline,
            innerOutline: placedInnerOutline,
            color: p.color,
            holeD,
            barStyle: p.barStyle || params.barStyle
        });

        rowH = Math.max(rowH, p.h);
        xCursor += p.w + spacing;
    }

    return out;
}
