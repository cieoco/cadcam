/**
 * Rack and Pinion Visualization
 * 齒條齒輪視覺化 (同步運動修正版)
 */

import { svgEl, fmt } from '../utils.js';
import { createGearPath, createRackPath } from '../utils/gear-geometry.js';

export function renderRackPinion(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    const W = 800, H = 600;
    const pad = 100;
    const viewRange = Number(viewParams.viewRange) || 400;
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;

    // 座標轉換 (中心點 X=0 為齒輪嚙合點)
    const tx = (x) => W / 2 + x * scale;
    const ty = (y) => H / 2 - y * scale;

    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    svg.appendChild(svgEl("rect", { width: W, height: H, fill: "#fafafa" }));

    const { isValid, pinion, rack } = sol;
    const { pitchRadius: R, m, N } = pinion;
    const L = Number(rack.length) || 200;
    const disp = Number(rack.displacement) || 0;

    // 1. 繪製導軌
    svg.appendChild(svgEl("line", {
        x1: 0, y1: ty(0), x2: W, y2: ty(0), stroke: "#eee", "stroke-width": 1
    }));

    // 2. 齒條 (Rack) - 同步平移
    const rackPts = createRackPath({ length: L, height: 20, module: m });
    
    // 確保有有效的點
    if (rackPts && rackPts.length > 0) {
        const rackPointsStr = rackPts
            .map(p => {
                const px = p.x - disp;
                const py = p.y;
                return `${tx(px)},${ty(py)}`;
            })
            .filter(s => !s.includes('NaN'))
            .join(' ');

        if (rackPointsStr) {
            svg.appendChild(svgEl("polygon", {
                points: rackPointsStr,
                fill: isValid ? "#3498db22" : "#e74c3c11",
                stroke: isValid ? "#3498db" : "#e74c3c",
                "stroke-width": 1.5
            }));
        }
    }

    // 3. 齒輪 (Pinion) - 同步旋轉
    const gearPts = createGearPath({ teeth: N, module: m });

    if (gearPts && gearPts.length > 0) {
        const offsetAng = -Math.PI / 2;
        const phaseShift = Math.PI / N;
        const ang = -(Number(thetaDeg) * Math.PI / 180) + offsetAng + phaseShift;

        const rotatedGearPts = gearPts.map(p => ({
            x: p.x * Math.cos(ang) - p.y * Math.sin(ang),
            y: p.x * Math.sin(ang) + p.y * Math.cos(ang)
        }));

        const gearPointsStr = rotatedGearPts
            .map(p => `${tx(p.x)},${ty(p.y + R)}`)
            .filter(s => !s.includes('NaN'))
            .join(' ');

        if (gearPointsStr) {
            svg.appendChild(svgEl("polygon", {
                points: gearPointsStr,
                fill: "#e74c3c22",
                stroke: "#e74c3c",
                "stroke-width": 1.5
            }));
        }
    }

    // 軸心
    const gearCenter = { x: tx(0), y: ty(R) };
    svg.appendChild(svgEl("circle", {
        cx: gearCenter.x, cy: gearCenter.y, r: 5,
        fill: "#fff", stroke: "#111", "stroke-width": 1
    }));

    // 4. 狀態與標註
    if (!isValid) {
        const warn = svgEl("text", { x: W / 2, y: H / 2 - 80, fill: "#e74c3c", "font-weight": "bold", "font-size": 22, "text-anchor": "middle" });
        warn.textContent = "⚠ 齒條脫離傳動範圍";
        svg.appendChild(warn);
    }

    const info = svgEl("text", { x: 20, y: 30, fill: "#333", "font-size": 13, "font-family": "monospace" });
    const travelDir = disp > 0 ? ">>>" : "<<<";
    info.textContent = `Pinion: Fixed | Travel: ${fmt(-disp)}mm ${travelDir}`;
    svg.appendChild(info);

    return svg;
}
