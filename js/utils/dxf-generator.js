/**
 * DXF Generator
 * DXF 檔案生成器 - 支援基本幾何圖形輸出
 */

/**
 * 生成 DXF 文字串
 * @param {Array} parts - 零件陣列
 * @returns {string} DXF 內容
 */
export function buildDXF(parts) {
    const lines = [];

    // DXF Header
    lines.push("  0", "SECTION", "  2", "ENTITIES");

    for (const p of parts) {
        const { x, y, w, h } = p.rect;

        // 優先使用 Outline (Tangent Hull)
        if (p.outline && p.outline.length >= 2) {
            const hull = computeTangentHullDXF(p.outline);
            for (const seg of hull) {
                if (seg.type === 'line') {
                    addLine(lines, seg.x1, seg.y1, seg.x2, seg.y2);
                } else if (seg.type === 'arc') {
                    addArc(lines, seg.x, seg.y, seg.r, seg.startAngle, seg.endAngle);
                }
            }
        }
        else if (p.barStyle === 'disk') {
            // 圓形
            addCircle(lines, x + w / 2, y + h / 2, p.diameter / 2);
        } else if (p.barStyle === 'rounded') {
            // 圓角矩形 (全圓角)：由兩條直線和兩個半圓組成
            const r = h / 2;

            // 兩條水平線
            addLine(lines, x + r, y, x + w - r, y); // 下邊
            addLine(lines, x + r, y + h, x + w - r, y + h); // 上邊

            // 兩個半圓 (DXF ARC: 0=右, 90=上, 180=左, 270=下)
            addArc(lines, x + r, y + r, r, 90, 270); // 左側半圓
            addArc(lines, x + w - r, y + r, r, 270, 90); // 右側半圓
        } else if (p.barStyle === 'path' && p.points) {
            // 任意封閉路徑 (齒輪/齒條齒形)
            const pts = p.points;
            for (let i = 0; i < pts.length; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                addLine(lines, p1.x, p1.y, p2.x, p2.y);
            }
        } else {
            // 直角矩形
            addLine(lines, x, y, x + w, y);
            addLine(lines, x + w, y, x + w, y + h);
            addLine(lines, x + w, y + h, x, y + h);
            addLine(lines, x, y + h, x, y);
        }

        // 導軌槽
        if (p.slots) {
            for (const s of p.slots) {
                const { x, y, w, h } = s;
                const r = h / 2;
                addLine(lines, x + r, y, x + w - r, y);
                addLine(lines, x + r, y + h, x + w - r, y + h);
                addArc(lines, x + r, y + r, r, 90, 270);
                addArc(lines, x + w - r, y + r, r, 270, 90);
            }
        }

        // 孔洞
        for (const hole of p.holes) {
            const holeD = Number.isFinite(hole.d) ? hole.d : p.holeD;
            addCircle(lines, hole.x, hole.y, holeD / 2);
        }
    }

    // DXF Footer
    lines.push("  0", "ENDSEC", "  0", "EOF");

    return lines.join("\n");
}

/**
 * 添加直線
 */
function addLine(lines, x1, y1, x2, y2) {
    lines.push("  0", "LINE", "  8", "0"); // 圖層 0
    lines.push(" 10", x1.toFixed(4)); // X1
    lines.push(" 20", y1.toFixed(4)); // Y1
    lines.push(" 11", x2.toFixed(4)); // X2
    lines.push(" 21", y2.toFixed(4)); // Y2
}

/**
 * 添加圓形
 */
function addCircle(lines, x, y, r) {
    lines.push("  0", "CIRCLE", "  8", "0");
    lines.push(" 10", x.toFixed(4)); // Center X
    lines.push(" 20", y.toFixed(4)); // Center Y
    lines.push(" 40", r.toFixed(4)); // Radius
}

/**
 * 添加圓弧
 * @param {Array} lines 
 * @param {number} x 中心 X
 * @param {number} y 中心 Y
 * @param {number} r 半徑
 * @param {number} startAngle 起始角度 (度)
 * @param {number} endAngle 結束角度 (度)
 */
function addArc(lines, x, y, r, startAngle, endAngle) {
    lines.push("  0", "ARC", "  8", "0");
    lines.push(" 10", x.toFixed(4));
    lines.push(" 20", y.toFixed(4));
    lines.push(" 40", r.toFixed(4));
    lines.push(" 50", startAngle.toFixed(4));
    lines.push(" 51", endAngle.toFixed(4));
}

/**
 * 計算多圓的外切輪廓 (Tangent Hull) 並轉換為 DXF 線段
 * @param {Array} circles - Array of {x, y, r}
 * @returns {Array} Array of segments {type: 'line'|'arc', ...}
 */
function computeTangentHullDXF(circles) {
    if (!circles || circles.length < 2) return [];

    const getTangent = (c1, c2) => {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return null;

        const nx = dy / dist;
        const ny = -dx / dist;

        const r1 = c1.r;
        const r2 = c2.r;

        return {
            start: { x: c1.x + nx * r1, y: c1.y + ny * r1 },
            end: { x: c2.x + nx * r2, y: c2.y + ny * r2 },
            angle: Math.atan2(ny, nx) * 180 / Math.PI // Normal angle
        };
    };

    const segments = [];
    const n = circles.length;
    const tangents = [];

    // Calculate all tangents first
    for (let i = 0; i < n; i++) {
        const c1 = circles[i];
        const c2 = circles[(i + 1) % n];
        tangents.push(getTangent(c1, c2));
    }

    // Generate segments (Line -> Arc -> Line -> Arc ...)
    for (let i = 0; i < n; i++) {
        const curr = tangents[i];
        if (!curr) continue;

        // 1. Line Segment
        segments.push({
            type: 'line',
            x1: curr.start.x, y1: curr.start.y,
            x2: curr.end.x, y2: curr.end.y
        });

        // 2. Arc Segment (to connect to next tangent start)
        const next = tangents[(i + 1) % n];
        const cNext = circles[(i + 1) % n];
        if (!next) continue;

        // Calculate angles for DXF Arc (CCW)
        // Current tangent end normal angle
        let startAngle = curr.angle;
        // Next tangent start normal angle
        let endAngle = next.angle;

        // DXF Arcs are always CCW.
        // We are traversing the hull CCW (if circles are ordered CCW).
        // The normal points OUT.
        // So we go from curr.angle to next.angle.

        // Normalize angles to 0-360
        if (startAngle < 0) startAngle += 360;
        if (endAngle < 0) endAngle += 360;

        // Ensure we go the "short way" around the outside?
        // Actually, for a convex hull, we always turn left (CCW).
        // So endAngle should be > startAngle (modulo 360).
        // Wait, if we turn left, the normal rotates CCW.
        // So yes, simple CCW arc from start to end.

        // Handle wrap-around
        // If end < start, it means we crossed 0/360.
        // DXF handles this fine if we just give start and end?
        // No, DXF ARC is drawn CCW from start to end.
        // If start=350, end=10, it draws 350->360->10 (20 degrees). Correct.
        // If start=10, end=350, it draws 10->...->350 (340 degrees). Incorrect (inner arc).
        // We want the outer arc.
        // Since we are traversing CCW, the change in angle should be positive.

        segments.push({
            type: 'arc',
            x: cNext.x, y: cNext.y, r: cNext.r,
            startAngle: startAngle,
            endAngle: endAngle
        });
    }

    return segments;
}
