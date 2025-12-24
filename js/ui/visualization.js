/**
 * Visualization Module
 * 視覺化模組 - 四連桿機構的 SVG 渲染
 */

import { svgEl, describeArc, deg2rad } from '../utils.js';

/**
 * 渲染四連桿機構
 * @param {Object} sol - 求解結果 {O2, O4, A, B}
 * @param {number} thetaDeg - 輸入角度
 * @param {Object} trajectoryData - 軌跡資料（可選）
 * @param {Object} viewParams - 視圖參數 {viewRange, showGrid}
 * @returns {SVGElement}
 */
export function renderFourbar(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    const W = 800,
        H = 600;
    const pad = 50;

    const viewRange = viewParams.viewRange || 400;
    const showGrid = viewParams.showGrid !== false;

    // 固定中心：將 ground link (O2-O4) 水平置中
    const groundCenterX = (sol.O2.x + sol.O4.x) / 2;
    const groundCenterY = (sol.O2.y + sol.O4.y) / 2;

    // 根據視圖範圍計算縮放
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;

    // 座標轉換：模型座標 -> 螢幕座標
    function tx(p) {
        return W / 2 + (p.x - groundCenterX) * scale;
    }
    function ty(p) {
        return H / 2 - (p.y - groundCenterY) * scale; // 翻轉 Y 軸
    }

    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

    // 背景
    svg.appendChild(
        svgEl("rect", {
            x: 0,
            y: 0,
            width: W,
            height: H,
            fill: "#fafafa",
        })
    );

    // 繪製格線
    if (showGrid) {
        drawGrid(svg, W, H, viewRange, groundCenterX, groundCenterY, tx, ty);
    }

    // 繪製軌跡（背景層）
    if (trajectoryData) {
        drawTrajectory(svg, trajectoryData, tx, ty);
    }

    // 繪製當前連桿狀態（前景層）
    drawLinkage(svg, sol, thetaDeg, tx, ty);

    // 高亮當前 B 點
    if (trajectoryData) {
        svg.appendChild(
            svgEl("circle", {
                cx: tx(sol.B),
                cy: ty(sol.B),
                r: 8,
                fill: "none",
                stroke: "#ff00ff",
                "stroke-width": 2,
            })
        );
    }

    return svg;
}

/**
 * 繪製格線
 */
function drawGrid(svg, W, H, viewRange, groundCenterX, groundCenterY, tx, ty) {
    const gridStep = 50; // mm
    const gridColor = "#e0e0e0";

    // 垂直線
    for (let x = -viewRange / 2; x <= viewRange / 2; x += gridStep) {
        const screenX = tx({ x: groundCenterX + x, y: 0 });
        svg.appendChild(
            svgEl("line", {
                x1: screenX,
                y1: 0,
                x2: screenX,
                y2: H,
                stroke: gridColor,
                "stroke-width": x === 0 ? 1.5 : 0.5,
            })
        );
    }

    // 水平線
    for (let y = -viewRange / 2; y <= viewRange / 2; y += gridStep) {
        const screenY = ty({ x: 0, y: groundCenterY + y });
        svg.appendChild(
            svgEl("line", {
                x1: 0,
                y1: screenY,
                x2: W,
                y2: screenY,
                stroke: gridColor,
                "stroke-width": y === 0 ? 1.5 : 0.5,
            })
        );
    }

    // 格線標籤
    const labelStep = 100; // mm
    for (let x = -viewRange / 2; x <= viewRange / 2; x += labelStep) {
        if (x === 0) continue;
        const screenX = tx({ x: groundCenterX + x, y: 0 });
        const label = svgEl("text", {
            x: screenX,
            y: H / 2 + 15,
            fill: "#999",
            "font-size": 9,
            "text-anchor": "middle",
        });
        label.textContent = `${x}`;
        svg.appendChild(label);
    }
    for (let y = -viewRange / 2; y <= viewRange / 2; y += labelStep) {
        if (y === 0) continue;
        const screenY = ty({ x: 0, y: groundCenterY + y });
        const label = svgEl("text", {
            x: W / 2 + 15,
            y: screenY + 3,
            fill: "#999",
            "font-size": 9,
            "text-anchor": "start",
        });
        label.textContent = `${y}`;
        svg.appendChild(label);
    }
}

/**
 * 繪製軌跡
 */
function drawTrajectory(svg, trajectoryData, tx, ty) {
    const { results, invalidRanges } = trajectoryData;

    // 繪製 B 點軌跡
    const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
    if (validBPoints.length > 1) {
        const points = validBPoints.map((b) => `${tx(b)},${ty(b)}`).join(" ");

        svg.appendChild(
            svgEl("polyline", {
                points,
                fill: "none",
                stroke: "#0066cc",
                "stroke-width": 2,
                "stroke-opacity": 0.4,
                "stroke-linejoin": "round",
            })
        );

        // 標記軌跡點
        const step = Math.max(1, Math.floor(validBPoints.length / 12));
        validBPoints.forEach((b, idx) => {
            if (idx % step === 0) {
                svg.appendChild(
                    svgEl("circle", {
                        cx: tx(b),
                        cy: ty(b),
                        r: 2,
                        fill: "#0066cc",
                        opacity: 0.5,
                    })
                );
            }
        });

        // 標記起點和終點
        const firstB = validBPoints[0];
        const lastB = validBPoints[validBPoints.length - 1];

        svg.appendChild(
            svgEl("circle", {
                cx: tx(firstB),
                cy: ty(firstB),
                r: 4,
                fill: "#00aa00",
                stroke: "#fff",
                "stroke-width": 1.5,
            })
        );

        svg.appendChild(
            svgEl("circle", {
                cx: tx(lastB),
                cy: ty(lastB),
                r: 4,
                fill: "#cc0000",
                stroke: "#fff",
                "stroke-width": 1.5,
            })
        );
    }

    // 不可行區間指示
    if (invalidRanges && invalidRanges.length > 0) {
        const legendY = 15;
        const legend = svgEl("text", {
            x: 10,
            y: legendY,
            fill: "#a00",
            "font-size": 10,
            opacity: 0.7,
        });
        legend.textContent = `✗ 不可行區間：${invalidRanges.length}個`;
        svg.appendChild(legend);
    }
}

/**
 * 繪製連桿機構
 */
function drawLinkage(svg, sol, thetaDeg, tx, ty) {
    // 繪製參考線（水平線，用於顯示 theta 角度）
    const refLineEnd = {
        x: sol.O2.x + Math.abs(sol.A.x - sol.O2.x) + 20,
        y: sol.O2.y,
    };
    svg.appendChild(
        svgEl("line", {
            x1: tx(sol.O2),
            y1: ty(sol.O2),
            x2: tx(refLineEnd),
            y2: ty(refLineEnd),
            stroke: "#999",
            "stroke-width": 1,
            "stroke-dasharray": "4,2",
        })
    );

    // 繪製 theta 角度弧線
    const arcRadius = 30; // pixels
    const theta = deg2rad(thetaDeg);
    const startAngle = 0; // 參考線是水平的
    const endAngle = -theta; // 負值因為螢幕 Y 軸翻轉

    const arcPath = describeArc(
        tx(sol.O2),
        ty(sol.O2),
        arcRadius,
        (startAngle * 180) / Math.PI,
        (endAngle * 180) / Math.PI
    );

    svg.appendChild(
        svgEl("path", {
            d: arcPath,
            fill: "none",
            stroke: "#ff6600",
            "stroke-width": 2,
        })
    );

    // Theta 標籤
    const labelAngle = -theta / 2; // 弧線中點
    const labelRadius = arcRadius + 15;
    const labelX = tx(sol.O2) + labelRadius * Math.cos(labelAngle);
    const labelY = ty(sol.O2) + labelRadius * Math.sin(labelAngle);

    const thetaLabel = svgEl("text", {
        x: labelX,
        y: labelY,
        fill: "#ff6600",
        "font-size": 13,
        "font-weight": "bold",
        "text-anchor": "middle",
    });
    thetaLabel.textContent = `θ=${thetaDeg}°`;
    svg.appendChild(thetaLabel);

    // 繪製連桿（帶顏色）
    const links = [
        { p1: sol.O2, p2: sol.A, color: "#e74c3c", label: "b" }, // Input (紅)
        { p1: sol.A, p2: sol.B, color: "#3498db", label: "c" }, // Coupler (藍)
        { p1: sol.B, p2: sol.O4, color: "#27ae60", label: "d" }, // Output (綠)
        { p1: sol.O2, p2: sol.O4, color: "#666", label: "a" }, // Ground (灰)
    ];

    for (const link of links) {
        svg.appendChild(
            svgEl("line", {
                x1: tx(link.p1),
                y1: ty(link.p1),
                x2: tx(link.p2),
                y2: ty(link.p2),
                stroke: link.color,
                "stroke-width": 3,
            })
        );

        // 連桿長度標籤
        const midX = (tx(link.p1) + tx(link.p2)) / 2;
        const midY = (ty(link.p1) + ty(link.p2)) / 2;
        const labelBg = svgEl("rect", {
            x: midX - 10,
            y: midY - 8,
            width: 20,
            height: 14,
            fill: "#fff",
            opacity: 0.8,
        });
        svg.appendChild(labelBg);
        const linkLabel = svgEl("text", {
            x: midX,
            y: midY + 4,
            fill: link.color,
            "font-size": 11,
            "font-weight": "bold",
            "text-anchor": "middle",
        });
        linkLabel.textContent = link.label;
        svg.appendChild(linkLabel);
    }

    // 繪製關節點
    const pts = [sol.O2, sol.O4, sol.A, sol.B];
    const jointStyle = { fill: "#fff", stroke: "#111", "stroke-width": 2 };
    for (const p of pts) {
        svg.appendChild(
            svgEl("circle", { cx: tx(p), cy: ty(p), r: 6, ...jointStyle })
        );
    }

    // 關節標籤
    const labels = [
        ["O2", sol.O2],
        ["O4", sol.O4],
        ["A", sol.A],
        ["B", sol.B],
    ];
    for (const [name, p] of labels) {
        const t = svgEl("text", {
            x: tx(p) + 8,
            y: ty(p) - 8,
            fill: "#111",
            "font-size": 12,
        });
        t.textContent = name;
        svg.appendChild(t);
    }
}
