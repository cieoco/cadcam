/**
 * Parts Renderer
 * 零件渲染器 - 負責 SVG 視覺化
 */

import { svgEl } from '../utils.js';

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

    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

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

        // 矩形外框
        svg.appendChild(
            svgEl("rect", {
                x: tx(r.x),
                y: ty(r.y + r.h),
                width: r.w * scale,
                height: r.h * scale,
                fill: p.color ? `${p.color}10` : "rgba(0,0,0,0.03)",
                stroke: p.color || "#111",
                "stroke-width": 1.5,
            })
        );

        // 孔洞
        for (const h of p.holes) {
            svg.appendChild(
                svgEl("circle", {
                    cx: tx(h.x),
                    cy: ty(h.y),
                    r: (p.holeD / 2) * scale,
                    fill: "none",
                    stroke: "#111",
                    "stroke-width": 1,
                })
            );
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
