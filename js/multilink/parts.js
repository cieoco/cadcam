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
    const inputIds = new Set();
    if (topology && Array.isArray(topology._wizard_data)) {
        topology._wizard_data.forEach(c => {
            if (c && c.type === 'bar' && c.isInput && c.id) {
                inputIds.add(String(c.id));
            }
        });
    }

    const {
        barW = 15, margin = 7, holeD = 3.2,
        workX = 800, workY = 600, spacing = 8
    } = params;
    const motorShaftD = 5.4;
    const motorShaftFlat = 3.6;

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
            const isInput = Boolean(p.isInput) || Array.from(inputIds).some(id => String(p.id || '').startsWith(`${id}(`) || String(p.id || '') === id);

            // 🌟 支援自定義軌道長度與偏移
            const totalLen = p.total_len_param ? getVal(p.total_len_param) : null;
            const trackOffset = p.offset_param ? getVal(p.offset_param) : margin;

            // 🌟 支援軌道寬度 (若為軌道零件)
            const isTrack = Boolean(p.isTrack || p.track || (p.id && p.id.endsWith('_Track')));
            const currentBarW = barW;

            // 如果有指定總長，則使用總長作為 w，否則使用 L + 2*margin
            // 如果有指定偏移，則第一孔位置為 offset，第二孔為 offset + L
            const w = isTrack ? (L + 2 * margin) : (totalLen ? totalLen : (L + 2 * margin));
            const hole1X = isTrack ? margin : (p.offset_param ? trackOffset : margin);
            const hole2X = isTrack ? (margin + L) : (hole1X + L);

            // 🌟 軌道專用：生成長槽 (Slot)
            const slots = [];
            if (isTrack) {
                // 槽寬度預設=孔徑，可用 trackWidth 覆蓋，但不可大於桿件寬度
                const rawSlotH = Number.isFinite(Number(params.trackWidth)) ? Number(params.trackWidth) : holeD;
                const slotInset = Math.max(0.5, Math.min(2, currentBarW * 0.15));
                const maxSlotH = Math.max(0.5, currentBarW - 2 * slotInset);
                const slotH = Math.min(Math.max(0.5, rawSlotH), maxSlotH);
                // 槽長度 = 總長 - 2*margin
                // 槽起始 x = margin
                // 槽起始 y = (barH - slotH) / 2
                const rawSlotW = totalLen ? totalLen : Math.max(slotH, w - 2 * trackOffset);
                const slotW = Math.max(slotH, Math.min(rawSlotW, w - 2 * trackOffset));
                const slotX = Math.max(0, Math.min(w - slotW, hole1X + trackOffset));

                slots.push({
                    x: slotX,
                    y: (currentBarW - slotH) / 2,
                    w: slotW,
                    h: slotH
                });
            }

            const hole1 = { x: hole1X, y: currentBarW / 2 };
            if (isInput) {
                hole1.shape = 'doubleFlat';
                hole1.d = motorShaftD;
                hole1.flat = motorShaftFlat;
            }

            const extraHoles = [];
            if (p.holes && p.holes.length) {
                p.holes.forEach(h => {
                    const distParam = h.dist_param || h.distParam;
                    const distValRaw = getVal(distParam);
                    const distVal = Math.max(0, Math.min(distValRaw, L));
                    if (distVal > 0.001 && distVal < L - 0.001) {
                        extraHoles.push({ x: hole1X + distVal, y: currentBarW / 2 });
                    }
                });
            }

            parts.push({
                id: p.id,
                type: 'bar',
                L: L,
                w: w,
                h: currentBarW,
                color: p.color || '#34495e',
                holes: [
                    hole1,
                    { x: hole2X, y: currentBarW / 2 },
                    ...extraHoles
                ],
                slots: slots, // 🌟 加入槽
                outline: [
                    { x: hole1X, y: currentBarW / 2, r: holeD / 2 + margin },
                    { x: hole2X, y: currentBarW / 2, r: holeD / 2 + margin }
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
            ...h,
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

        // Transform slots to absolute coords
        let placedSlots = null;
        if (p.slots) {
            placedSlots = p.slots.map(s => ({
                x: xCursor + s.x,
                y: yCursor + s.y,
                w: s.w,
                h: s.h
            }));
        }

        out.push({
            id: p.id,
            rect: { x: xCursor, y: yCursor, w: p.w, h: p.h },
            holes: placedHoles,
            slots: placedSlots, // 🌟 Include slots in output
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
