/**
 * Rack and Pinion Parts Generator
 * 齒條齒輪零件生成 - 支援孔位型式與導軌槽
 */

import { fmt } from '../utils.js';
import { createGearPath, createRackPath } from '../utils/gear-geometry.js';

export function generateRackPinionParts({
    pinionTeeth,
    module,
    rackLength = 200,
    rackHeight = 15,
    holeD = 5,
    margin = 10,
    rackHoleType = 'circle', // 'circle' 或 'slot'
    rackSlotL = 20,
    spacing = 10,
    workX = 300,
    workY = 180
}) {
    const N = Number(pinionTeeth);
    const m = Number(module);
    const mgn = Number(margin);
    const rH_back = Number(rackHeight);

    const parts = [];

    // 1. 漸開線齒輪 (Pinion)
    const gearPoints = createGearPath({ teeth: N, module: m });
    const gearXs = gearPoints.map(p => p.x), gearYs = gearPoints.map(p => p.y);
    const gearW = Math.max(...gearXs) - Math.min(...gearXs);
    const gearH = Math.max(...gearYs) - Math.min(...gearYs);

    parts.push({
        id: 'pinion_gear',
        name: `漸開線齒輪 (N=${N})`,
        barStyle: 'path',
        points: gearPoints.map(p => ({ x: p.x + gearW / 2, y: p.y + gearH / 2 })),
        rect: { x: 0, y: 0, w: gearW, h: gearH },
        holes: [{ x: gearW / 2, y: gearH / 2 }],
        holeD: Number(holeD),
        color: '#e74c3c'
    });

    // 2. 梯形齒條 (Rack)
    const rL = Number(rackLength);
    const rackPoints = createRackPath({ length: rL, height: rH_back, module: m });
    const rxs = rackPoints.map(p => p.x), rys = rackPoints.map(p => p.y);
    const rminX = Math.min(...rxs), rminY = Math.min(...rys);
    const rackW = Math.max(...rxs) - rminX;
    const rackH = Math.max(...rys) - rminY;

    // 孔位/槽位避讓邏輯
    const dedendum = 1.25 * m;
    const holeY_local = -dedendum - (rH_back / 2);
    const holeY_part = holeY_local - rminY;

    const rackPart = {
        id: 'rack_gear',
        name: `梯形齒條 (L=${rL})`,
        barStyle: 'path',
        points: rackPoints.map(p => ({ x: p.x - rminX, y: p.y - rminY })),
        rect: { x: 0, y: 0, w: rackW, h: rackH },
        holes: [],
        slots: [],
        holeD: Number(holeD),
        color: '#3498db'
    };

    if (rackHoleType === 'slot') {
        const slotL = Number(rackSlotL);
        // 槽位起點 (左下角)
        rackPart.slots.push({
            x: mgn - holeD / 2,
            y: holeY_part - holeD / 2,
            w: slotL,
            h: holeD
        });
        rackPart.slots.push({
            x: rackW - mgn - slotL + holeD / 2,
            y: holeY_part - holeD / 2,
            w: slotL,
            h: holeD
        });
    } else {
        rackPart.holes.push({ x: mgn, y: holeY_part });
        rackPart.holes.push({ x: rackW - mgn, y: holeY_part });
    }

    parts.push(rackPart);

    // --- 自動排版邏輯 ---
    let xCursor = 10, yCursor = 10, rowH = 0;
    for (const p of parts) {
        if (xCursor + p.rect.w + spacing > workX) {
            xCursor = 10;
            yCursor += rowH + spacing;
            rowH = 0;
        }

        const moveX = xCursor;
        const moveY = yCursor;

        if (p.points) {
            p.points = p.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY }));
        }
        for (const h of p.holes) {
            h.x += moveX;
            h.y += moveY;
        }
        if (p.slots) {
            for (const s of p.slots) {
                s.x += moveX;
                s.y += moveY;
            }
        }
        p.rect.x = xCursor;
        p.rect.y = yCursor;

        rowH = Math.max(rowH, p.rect.h);
        xCursor += p.rect.w + spacing;
    }

    return parts;
}
