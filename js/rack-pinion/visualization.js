/**
 * Rack and Pinion Visualization
 * 齒條齒輪視覺化 (同步運動修正版)
 */

import { svgEl, fmt } from '../utils.js';
import { createGearPath, createRackPath } from '../utils/gear-geometry.js';

export function renderRackPinion(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    const W = 800, H = 600;
    const pad = 100;
    const viewRange = viewParams.viewRange || 400;
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;

    // 座標轉換 (中心點 X=0 為齒輪嚙合點)
    const tx = (x) => W / 2 + x * scale;
    const ty = (y) => H / 2 - y * scale;

    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    svg.appendChild(svgEl("rect", { width: W, height: H, fill: "#fafafa" }));

    const { isValid, pinion, rack } = sol;
    const { pitchRadius: R, m, N } = pinion;
    const L = rack.length;
    const disp = rack.displacement;

    // 1. 繪製導軌
    svg.appendChild(svgEl("line", {
        x1: 0, y1: ty(0), x2: W, y2: ty(0), stroke: "#eee", "stroke-width": 1
    }));

    // 2. 齒條 (Rack) - 同步平移
    // createRackPath 產生的齒條中心在 0，範圍 [-L/2, L/2]
    // 我們需要將它左移 L/2 到 [0, L]，然後加上位移 disp
    const rackPts = createRackPath({ length: L, height: 20, module: m });
    const rackPointsStr = rackPts.map(p => `${tx(p.x + L / 2 - disp)},${ty(p.y)}`).join(' ');

    svg.appendChild(svgEl("polygon", {
        points: rackPointsStr,
        fill: isValid ? "#3498db22" : "#e74c3c11",
        stroke: isValid ? "#3498db" : "#e74c3c",
        "stroke-width": 1.5
    }));

    // 3. 齒輪 (Pinion) - 同步旋轉
    const gearPts = createGearPath({ teeth: N, module: m });

    // 咬合角度校正：
    // 1. 標準齒輪底部是 angle=-PI/2。
    // 2. 隨 thetaDeg 旋轉。
    // 3. 增加一個小偏移使齒尖剛好落入齒條槽。
    const offsetAng = -Math.PI / 2; // 指向下方
    const phaseShift = Math.PI / N; // 旋轉半個齒距來對齊
    const ang = -(thetaDeg * Math.PI / 180) + offsetAng + phaseShift;

    const rotatedGearPts = gearPts.map(p => ({
        x: p.x * Math.cos(ang) - p.y * Math.sin(ang),
        y: p.x * Math.sin(ang) + p.y * Math.cos(ang)
    }));

    const gearPointsStr = rotatedGearPts.map(p => `${tx(p.x)},${ty(p.y + R)}`).join(' ');

    svg.appendChild(svgEl("polygon", {
        points: gearPointsStr,
        fill: "#e74c3c22",
        stroke: "#e74c3c",
        "stroke-width": 1.5
    }));

    // 軸心
    const gearCenter = { x: tx(0), y: ty(R) };
    svg.appendChild(svgEl("circle", {
        cx: gearCenter.x, cy: gearCenter.y, r: 5 * scale / (W / 400),
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
    info.textContent = `Pinion: Fixed | Travel: ${(-disp).toFixed(1)}mm ${travelDir}`;
    svg.appendChild(info);

    return svg;
}
