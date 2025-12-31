/**
 * Parts Renderer
 * 零件渲染器 - 負責 SVG 視覺化
 */

import { svgEl } from '../utils.js';

function rotatePoints90(points, cx, cy) {
    return points.map(pt => ({
        x: cx - (pt.y - cy),
        y: cy + (pt.x - cx)
    }));
}

function rotatePoints(points, cx, cy, angleRad) {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    return points.map(pt => {
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        return {
            x: cx + dx * cosA - dy * sinA,
            y: cy + dx * sinA + dy * cosA
        };
    });
}

function buildDoubleDPoints(cx, cy, d, flat, flatAxis = 'y', segments = 12) {
    const r = d / 2;
    if (!Number.isFinite(r) || r <= 0) return [];
    const halfFlatRaw = flat / 2;
    const halfFlat = Math.max(0, Math.min(halfFlatRaw, r - 0.0001));
    const y = Math.sqrt(Math.max(0, r * r - halfFlat * halfFlat));
    const startA = Math.acos(halfFlat / r);
    const endA = Math.PI - startA;
    const pts = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = startA + (endA - startA) * t;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    pts.push({ x: cx - halfFlat, y: cy - y });

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = Math.PI + startA + (2 * Math.PI - 2 * startA) * t;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    pts.push({ x: cx + halfFlat, y: cy + y });

    if (flatAxis === 'x') {
        return rotatePoints90(pts, cx, cy);
    }
    return pts;
}

function buildDoubleFlatPointsTB(cx, cy, d, flat, segments = 12) {
    const r = d / 2;
    if (!Number.isFinite(r) || r <= 0) return [];
    const halfFlatRaw = flat / 2;
    const halfFlat = Math.max(0, Math.min(halfFlatRaw, r - 0.0001));
    const x = Math.sqrt(Math.max(0, r * r - halfFlat * halfFlat));
    const angle = Math.asin(halfFlat / r);
    const pts = [];

    pts.push({ x: cx - x, y: cy + halfFlat });
    pts.push({ x: cx + x, y: cy + halfFlat });

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const a = angle + (-2 * angle) * t;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    pts.push({ x: cx - x, y: cy - halfFlat });

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const a = Math.PI + angle + (-2 * angle) * t;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }

    return pts;
}

/**
 * 渲染零件排版圖
 * @param {Array} parts - 零件陣列
 * @param {number} workX - 工作範圍 X
 * @param {number} workY - 工作範圍 Y
 * @returns {SVGElement}
 */
export function renderPartsLayout(parts, workX, workY) {
    const W = 800,
        H = 450,
        pad = 10;
    const scale = Math.min((W - 2 * pad) / workX, (H - 2 * pad) / workY);

    function tx(x) {
        return pad + x * scale;
    }
    function ty(y) {
        return H - (pad + y * scale);
    }

    const svg = svgEl("svg", {
        width: "100%",
        height: "100%",
        viewBox: `0 0 ${W} ${H}`
    });

    // 工作區邊框
    svg.appendChild(
        svgEl("rect", {
            x: tx(0),
            y: ty(workY),
            width: workX * scale,
            height: workY * scale,
            fill: "none",
            stroke: "#111",
            "stroke-width": 1,
        })
    );

    // 繪製每個零件
    for (const p of parts) {
        const r = p.rect;

        // 優先使用 Outline (Tangent Hull)
        if (p.outline && p.outline.length >= 2) {
            const validOutline = p.outline.every(c =>
                Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.r) && c.r > 0
            );
            if (!validOutline) {
                continue;
            }
            console.log('Rendering outline for', p.id, p.outline);
            const pathData = computeTangentHullPath(p.outline, tx, ty, scale);
            console.log('Path data:', pathData);
            let combinedPath = pathData;
            let fillRule = undefined;
            if (p.innerOutline && p.innerOutline.length >= 2) {
                const innerPath = computeTangentHullPath(p.innerOutline, tx, ty, scale);
                if (innerPath) {
                    combinedPath = `${pathData} ${innerPath}`;
                    fillRule = "evenodd";
                }
            }
            const pathAttrs = {
                d: combinedPath,
                fill: p.color ? `${p.color}15` : "rgba(0,0,0,0.03)",
                stroke: p.color || "#111",
                "stroke-width": 1.5,
                "stroke-linejoin": "round"
            };
            if (fillRule) pathAttrs["fill-rule"] = fillRule;
            svg.appendChild(svgEl("path", pathAttrs));
        }
        // 舊的繪製邏輯 (Rect/Circle/Polygon)
        else if (p.barStyle === 'disk') {
            const r = p.rect;
            svg.appendChild(
                svgEl("circle", {
                    cx: tx(r.x + r.w / 2),
                    cy: ty(r.y + r.h / 2),
                    r: (p.diameter / 2) * scale,
                    fill: p.color ? `${p.color}15` : "rgba(0,0,0,0.03)",
                    stroke: p.color || "#111",
                    "stroke-width": 1.5,
                })
            );
        } else if (p.barStyle === 'path' && p.points) {
            // 繪製任意多邊形路徑
            const pointsStr = p.points.map(pt => `${tx(pt.x)},${ty(pt.y)}`).join(' ');
            svg.appendChild(
                svgEl("polygon", {
                    points: pointsStr,
                    fill: p.color ? `${p.color}15` : "rgba(0,0,0,0.03)",
                    stroke: p.color || "#111",
                    "stroke-width": 1.5,
                })
            );
        } else {
            const rectAttrs = {
                x: tx(r.x),
                y: ty(r.y + r.h),
                width: r.w * scale,
                height: r.h * scale,
                fill: p.color ? `${p.color}15` : "rgba(0,0,0,0.03)",
                stroke: p.color || "#111",
                "stroke-width": 1.5,
            };

            if (p.barStyle === 'rounded') {
                rectAttrs.rx = (r.h / 2) * scale;
                rectAttrs.ry = (r.h / 2) * scale;
            }

            svg.appendChild(svgEl("rect", rectAttrs));
        }

        // 孔洞
        for (const h of p.holes) {
            if (h.shape === 'doubleFlat') {
                const holeD = Number.isFinite(h.d) ? h.d : p.holeD;
                const flat = Number.isFinite(h.flat) ? h.flat : holeD * 0.6667;
                const pts = buildDoubleFlatPointsTB(h.x, h.y, holeD, flat);
                if (pts.length >= 3) {
                    const path = pts
                        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${tx(pt.x)} ${ty(pt.y)}`)
                        .join(' ') + ' Z';
                    svg.appendChild(
                        svgEl("path", {
                            d: path,
                            fill: "none",
                            stroke: "#111",
                            "stroke-width": 1,
                        })
                    );
                    continue;
                }
            }
            if (h.shape === 'doubleD') {
                const holeD = Number.isFinite(h.d) ? h.d : p.holeD;
                const flat = Number.isFinite(h.flat) ? h.flat : holeD * 0.6667;
                const pts = buildDoubleDPoints(h.x, h.y, holeD, flat, h.flatAxis || 'y');
                if (pts.length >= 3) {
                    const path = pts
                        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${tx(pt.x)} ${ty(pt.y)}`)
                        .join(' ') + ' Z';
                    svg.appendChild(
                        svgEl("path", {
                            d: path,
                            fill: "none",
                            stroke: "#111",
                            "stroke-width": 1,
                        })
                    );
                    continue;
                }
            }
            const holeD = Number.isFinite(h.d) ? h.d : p.holeD;
            svg.appendChild(
                svgEl("circle", {
                    cx: tx(h.x),
                    cy: ty(h.y),
                    r: (holeD / 2) * scale,
                    fill: "none",
                    stroke: "#111",
                    "stroke-width": 1,
                })
            );
        }

        // 導軌槽 (Slots)
        if (p.slots) {
            for (const s of p.slots) {
                svg.appendChild(
                    svgEl("rect", {
                        x: tx(s.x),
                        y: ty(s.y + s.h),
                        width: s.w * scale,
                        height: s.h * scale,
                        rx: (s.h / 2) * scale,
                        ry: (s.h / 2) * scale,
                        fill: "none",
                        stroke: "#111",
                        "stroke-width": 1,
                    })
                );
            }
        }

        // 標籤
        const t = svgEl("text", {
            x: tx(r.x + 2),
            y: ty(r.y + r.h - 2),
            fill: p.color || "#111",
            "font-size": 12,
            "font-weight": "bold",
        });
        t.textContent = p.id;
        svg.appendChild(t);
    }

    return svg;
}

/**
 * 計算多圓的外切輪廓路徑 (Tangent Hull)
 * @param {Array} circles - Array of {x, y, r}
 * @param {Function} tx - Transform X
 * @param {Function} ty - Transform Y
 * @param {number} scale - Scale factor
 * @returns {string} SVG Path 'd' attribute
 */
function computeTangentHullPath(circles, tx, ty, scale) {
    if (!circles || circles.length < 2) return "";

    console.log('computeTangentHullPath input:', circles);

    // Helper: Get tangent points between two circles
    // Assumes equal radii for now (simplification for this use case)
    // Returns { p1: {x,y}, p2: {x,y} } for the "outer" tangent on the Right side (CCW)
    const getTangent = (c1, c2) => {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) {
            console.warn('Circles coincide:', c1, c2);
            return null;
        }

        // Normal vector (Right side for CCW traversal)
        // Vec (dx, dy) -> Right Normal (dy, -dx)
        const nx = dy / dist;
        const ny = -dx / dist;

        const r1 = c1.r;
        const r2 = c2.r; // Should be equal

        return {
            start: { x: c1.x + nx * r1, y: c1.y + ny * r1 },
            end: { x: c2.x + nx * r2, y: c2.y + ny * r2 }
        };
    };

    let d = "";
    const n = circles.length;

    // Special case for 2 circles (Bar)
    if (n === 2) {
        const c1 = circles[0];
        const c2 = circles[1];

        // Tangent 1 (Right side P1->P2)
        const t1 = getTangent(c1, c2);
        // Tangent 2 (Right side P2->P1) -> effectively Left side P1->P2
        const t2 = getTangent(c2, c1);

        if (!t1 || !t2) return "";

        // Start at T1 start
        d += `M ${tx(t1.start.x)} ${ty(t1.start.y)} `;
        // Line to T1 end
        d += `L ${tx(t1.end.x)} ${ty(t1.end.y)} `;
        // Arc around C2 to T2 start
        // Sweep flag 0 (CCW in SVG coords? No, SVG Y is down. ty inverts Y.)
        // In Math coords (Y up), we go CCW.
        // In SVG coords (Y down), ty inverts Y, so CCW becomes CW visually?
        // Let's check ty: H - (pad + y*scale). Yes, Y is inverted.
        // So Math CCW = SVG CW.
        // Arc from T1.end to T2.start around C2.
        // We want the "outer" arc.
        d += `A ${c2.r * scale} ${c2.r * scale} 0 1 0 ${tx(t2.start.x)} ${ty(t2.start.y)} `;

        // Line to T2 end
        d += `L ${tx(t2.end.x)} ${ty(t2.end.y)} `;

        // Arc around C1 to T1 start
        d += `A ${c1.r * scale} ${c1.r * scale} 0 1 0 ${tx(t1.start.x)} ${ty(t1.start.y)} `;

        d += "Z";
        return d;
    }

    // General case for N >= 3 (Polygon)
    // Assume circles are ordered CCW (or at least consistent perimeter)
    const tangents = [];
    for (let i = 0; i < n; i++) {
        const c1 = circles[i];
        const c2 = circles[(i + 1) % n];
        const t = getTangent(c1, c2);
        if (t) tangents.push(t);
        else console.warn('Failed to get tangent for', i, c1, c2);
    }

    if (tangents.length !== n) {
        console.warn('Not enough tangents:', tangents);
        return "";
    }

    d = "";
    for (let i = 0; i < n; i++) {
        const curr = tangents[i];
        const next = tangents[(i + 1) % n];
        const cNext = circles[(i + 1) % n];

        if (i === 0) {
            d += `M ${tx(curr.start.x)} ${ty(curr.start.y)} `;
        }

        // Line for current tangent
        d += `L ${tx(curr.end.x)} ${ty(curr.end.y)} `;

        // Arc around cNext from curr.end to next.start
        // Sweep flag 0 (SVG CW) for convex outer corner
        d += `A ${cNext.r * scale} ${cNext.r * scale} 0 0 0 ${tx(next.start.x)} ${ty(next.start.y)} `;
    }

    d += "Z";
    console.log('Hull Path:', d);
    return d;
}

function computeTangentHullPathQuiet(circles, tx, ty, scale) {
    if (!circles || circles.length < 2) return "";

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
            end: { x: c2.x + nx * r2, y: c2.y + ny * r2 }
        };
    };

    let d = "";
    const n = circles.length;

    if (n === 2) {
        const c1 = circles[0];
        const c2 = circles[1];
        const t1 = getTangent(c1, c2);
        const t2 = getTangent(c2, c1);
        if (!t1 || !t2) return "";

        d += `M ${tx(t1.start.x)} ${ty(t1.start.y)} `;
        d += `L ${tx(t1.end.x)} ${ty(t1.end.y)} `;
        d += `A ${c2.r * scale} ${c2.r * scale} 0 1 0 ${tx(t2.start.x)} ${ty(t2.start.y)} `;
        d += `L ${tx(t2.end.x)} ${ty(t2.end.y)} `;
        d += `A ${c1.r * scale} ${c1.r * scale} 0 1 0 ${tx(t1.start.x)} ${ty(t1.start.y)} `;
        d += "Z";
        return d;
    }

    const tangents = [];
    for (let i = 0; i < n; i++) {
        const c1 = circles[i];
        const c2 = circles[(i + 1) % n];
        const t = getTangent(c1, c2);
        if (t) tangents.push(t);
    }

    if (tangents.length !== n) return "";

    d = "";
    for (let i = 0; i < n; i++) {
        const curr = tangents[i];
        const next = tangents[(i + 1) % n];
        const cNext = circles[(i + 1) % n];

        if (i === 0) {
            d += `M ${tx(curr.start.x)} ${ty(curr.start.y)} `;
        }
        d += `L ${tx(curr.end.x)} ${ty(curr.end.y)} `;
        d += `A ${cNext.r * scale} ${cNext.r * scale} 0 0 0 ${tx(next.start.x)} ${ty(next.start.y)} `;
    }
    d += "Z";
    return d;
}

function orderCirclesCCW(circles) {
    if (!circles || circles.length < 3) return circles;
    const cx = circles.reduce((sum, c) => sum + c.x, 0) / circles.length;
    const cy = circles.reduce((sum, c) => sum + c.y, 0) / circles.length;
    return circles
        .slice()
        .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

export function renderPartsOverlayLayer(sol, topology, partSpec, viewParams = {}) {
    if (!sol || sol.isValid === false || !sol.points || !topology || !Array.isArray(topology._wizard_data)) return null;

    const W = viewParams.width || 800;
    const H = viewParams.height || 600;
    const pad = 50;
    const viewRange = viewParams.viewRange || 800;
    const scale = Math.max(0.01, Math.min(W - 2 * pad, H - 2 * pad) / viewRange);

    const txNum = (x) => W / 2 + x * scale;
    const tyNum = (y) => H / 2 - y * scale;
    const tx = (p) => txNum(p.x);
    const ty = (p) => tyNum(p.y);

    const layer = svgEl('g', { id: 'partsOverlayLayer' });

    const radius = (partSpec.holeD / 2) + partSpec.margin;
    const holeD = partSpec.holeD;
    const getParamVal = (name, fallback = 0) => {
        if (typeof name === 'number') return name;
        if (topology && topology.params && topology.params[name] !== undefined) {
            return Number(topology.params[name]);
        }
        const parsed = Number(name);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    topology._wizard_data.forEach(comp => {
        if (!comp || !comp.type) return;
        if (comp.type !== 'bar' && comp.type !== 'triangle' && comp.type !== 'slider') return;

        const color = comp.color || '#111';
        const strokeAttrs = {
            fill: color,
            'fill-opacity': 0.12,
            stroke: color,
            'stroke-opacity': 0.55,
            'stroke-width': 1.2,
            'stroke-linejoin': 'round'
        };

        if (comp.type === 'bar' || comp.type === 'slider') {
            const p1 = sol.points[comp.p1?.id];
            const p2 = sol.points[comp.p2?.id];
            if (!p1 || !p2) return;

            const circles = [
                { x: p1.x, y: p1.y, r: radius },
                { x: p2.x, y: p2.y, r: radius }
            ];
            const path = computeTangentHullPathQuiet(circles, txNum, tyNum, scale);
            if (path) {
                layer.appendChild(svgEl('path', { d: path, ...strokeAttrs }));
            }

            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const drawHole = (pt, isInputHole) => {
                if (isInputHole) {
                    const pts = buildDoubleFlatPointsTB(pt.x, pt.y, holeD, holeD * 0.6667);
                    if (pts.length >= 3) {
                        const rotated = rotatePoints(pts, pt.x, pt.y, angle);
                        const pathData = rotated
                            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${txNum(p.x)} ${tyNum(p.y)}`)
                            .join(' ') + ' Z';
                        layer.appendChild(svgEl('path', {
                            d: pathData,
                            fill: 'none',
                            stroke: color,
                            'stroke-width': 1
                        }));
                        return;
                    }
                }

                layer.appendChild(svgEl('circle', {
                    cx: tx(pt),
                    cy: ty(pt),
                    r: (holeD / 2) * scale,
                    fill: 'none',
                    stroke: color,
                    'stroke-width': 1
                }));
            };

            drawHole(p1, Boolean(comp.isInput));
            drawHole(p2, false);
            if (comp.holes && comp.holes.length) {
                comp.holes.forEach(h => {
                    const holePt = sol.points[h.id];
                    if (!holePt) return;
                    layer.appendChild(svgEl('circle', {
                        cx: tx(holePt),
                        cy: ty(holePt),
                        r: (holeD / 2) * scale,
                        fill: 'none',
                        stroke: color,
                        'stroke-width': 1
                    }));
                });
            }

            if (comp.type === 'slider' && comp.trackLenParam) {
                const trackLen = getParamVal(comp.trackLenParam, 0);
                const trackOffset = getParamVal(comp.trackOffsetParam, partSpec.margin || 0);
                const trackWidth = getParamVal(topology?.params?.trackWidth, holeD);
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const len = Math.hypot(dx, dy);

                    if (len > 0 && trackLen > 0) {
                        const dirX = dx / len;
                        const dirY = dy / len;
                        const startDist = Math.max(0, Math.min(trackOffset, len));
                        const slotLen = Math.max(0.1, Math.min(trackLen, len - startDist));
                        const s = {
                        x: p1.x + dirX * startDist,
                        y: p1.y + dirY * startDist
                        };
                        const e = {
                        x: p1.x + dirX * (startDist + slotLen),
                        y: p1.y + dirY * (startDist + slotLen)
                        };

                    layer.appendChild(svgEl('line', {
                        x1: tx(s),
                        y1: ty(s),
                        x2: tx(e),
                        y2: ty(e),
                        stroke: color,
                        'stroke-opacity': 0.8,
                        'stroke-width': Math.max(1, trackWidth * scale),
                        'stroke-linecap': 'round'
                    }));
                }
            }
            return;
        }

        if (comp.type === 'triangle') {
            const p1 = sol.points[comp.p1?.id];
            const p2 = sol.points[comp.p2?.id];
            const p3 = sol.points[comp.p3?.id];
            if (!p1 || !p2 || !p3) return;

            const circles = orderCirclesCCW([
                { x: p1.x, y: p1.y, r: radius },
                { x: p2.x, y: p2.y, r: radius },
                { x: p3.x, y: p3.y, r: radius }
            ]);
            const path = computeTangentHullPathQuiet(circles, txNum, tyNum, scale);
            if (path) {
                layer.appendChild(svgEl('path', { d: path, ...strokeAttrs }));
            }

            [p1, p2, p3].forEach(pt => {
                layer.appendChild(svgEl('circle', {
                    cx: tx(pt),
                    cy: ty(pt),
                    r: (holeD / 2) * scale,
                    fill: 'none',
                    stroke: color,
                    'stroke-width': 1
                }));
            });
        }
    });

    return layer;
}

/**
 * 渲染軌跡圖
 * @param {Array} results - 掃描結果
 * @param {Array} validRanges - 可行區間
 * @param {Array} invalidRanges - 不可行區間
 * @returns {SVGElement|HTMLElement}
 */
export function renderTrajectory(results, validRanges, invalidRanges) {
    const W = 800,
        H = 600,
        pad = 50;

    // 收集所有有效的 B 點
    const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
    if (validBPoints.length === 0) {
        const msg = document.createElement("div");
        msg.textContent = "無可行解，無法繪製軌跡";
        msg.style.color = "#a00";
        return msg;
    }

    const xs = validBPoints.map((b) => b.x);
    const ys = validBPoints.map((b) => b.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);

    const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);

    function tx(x) {
        return pad + (x - minX) * scale;
    }
    function ty(y) {
        return H - (pad + (y - minY) * scale);
    }

    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

    // 標題
    const title = svgEl("text", {
        x: W / 2,
        y: 20,
        fill: "#111",
        "font-size": 14,
        "text-anchor": "middle",
        "font-weight": "bold",
    });
    title.textContent = "B 點軌跡曲線";
    svg.appendChild(title);

    // 繪製軌跡為折線
    const points = results
        .filter((r) => r.isValid && r.B)
        .map((r) => `${tx(r.B.x)},${ty(r.B.y)}`)
        .join(" ");

    if (points) {
        svg.appendChild(
            svgEl("polyline", {
                points,
                fill: "none",
                stroke: "#0066cc",
                "stroke-width": 2,
                "stroke-linejoin": "round",
            })
        );

        // 標記起點和終點
        const firstValid = results.find((r) => r.isValid && r.B);
        const lastValid = [...results].reverse().find((r) => r.isValid && r.B);

        if (firstValid && firstValid.B) {
            svg.appendChild(
                svgEl("circle", {
                    cx: tx(firstValid.B.x),
                    cy: ty(firstValid.B.y),
                    r: 5,
                    fill: "#00aa00",
                    stroke: "#fff",
                    "stroke-width": 2,
                })
            );
            const startLabel = svgEl("text", {
                x: tx(firstValid.B.x) + 10,
                y: ty(firstValid.B.y) - 10,
                fill: "#00aa00",
                "font-size": 11,
                "font-weight": "bold",
            });
            startLabel.textContent = `起點 (θ=${firstValid.theta.toFixed(0)}°)`;
            svg.appendChild(startLabel);
        }

        if (lastValid && lastValid.B) {
            svg.appendChild(
                svgEl("circle", {
                    cx: tx(lastValid.B.x),
                    cy: ty(lastValid.B.y),
                    r: 5,
                    fill: "#cc0000",
                    stroke: "#fff",
                    "stroke-width": 2,
                })
            );
            const endLabel = svgEl("text", {
                x: tx(lastValid.B.x) + 10,
                y: ty(lastValid.B.y) + 15,
                fill: "#cc0000",
                "font-size": 11,
                "font-weight": "bold",
            });
            endLabel.textContent = `終點 (θ=${lastValid.theta.toFixed(0)}°)`;
            svg.appendChild(endLabel);
        }

        // 標記中間點
        const step = Math.max(1, Math.floor(validBPoints.length / 8));
        results
            .filter((r) => r.isValid && r.B)
            .forEach((r, idx) => {
                if (idx % step === 0 && idx !== 0) {
                    svg.appendChild(
                        svgEl("circle", {
                            cx: tx(r.B.x),
                            cy: ty(r.B.y),
                            r: 3,
                            fill: "#0066cc",
                            stroke: "#fff",
                            "stroke-width": 1,
                        })
                    );
                }
            });
    }

    // 繪製座標軸
    svg.appendChild(
        svgEl("line", {
            x1: pad,
            y1: ty(0),
            x2: W - pad,
            y2: ty(0),
            stroke: "#ccc",
            "stroke-width": 1,
            "stroke-dasharray": "4,2",
        })
    );
    svg.appendChild(
        svgEl("line", {
            x1: tx(0),
            y1: pad,
            x2: tx(0),
            y2: H - pad,
            stroke: "#ccc",
            "stroke-width": 1,
            "stroke-dasharray": "4,2",
        })
    );

    // 不可行區間圖例
    if (invalidRanges.length > 0) {
        const legendY = H - 10;
        const legend = svgEl("text", {
            x: 10,
            y: legendY,
            fill: "#a00",
            "font-size": 11,
        });
        legend.textContent = `不可行區間：${invalidRanges
            .map((r) => `${r.start.toFixed(0)}°~${r.end.toFixed(0)}°`)
            .join(", ")}`;
        svg.appendChild(legend);
    }

    return svg;
}
