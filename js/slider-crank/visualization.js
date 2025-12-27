/**
 * Slider-Crank Mechanism Visualization
 * 曲柄滑塊機構視覺化模組
 */

import { svgEl, fmt, drawGridCompatible } from '../utils.js';
import { createDriveComponent } from '../motor-data.js';

/**
 * 渲染曲柄滑塊機構
 * @param {Object} sol - 求解結果 {points: {O, A, B}, isValid}
 * @param {number} thetaDeg - 角度
 * @param {Object} trajectoryData - 軌跡資料
 * @param {Object} viewParams - 視圖參數
 * @returns {SVGElement}
 */
export function renderSliderCrank(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    const W = 800, H = 600;
    const pad = 50;
    const viewRange = viewParams.viewRange || 400;

    // 縮放與座標轉換
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;
    const tx = (p) => W / 2 + p.x * scale;
    const ty = (p) => H / 2 - p.y * scale;

    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const showGrid = viewParams.showGrid !== false;

    // 背景
    svg.appendChild(svgEl("rect", { width: W, height: H, fill: "#fafafa" }));

    // 格線
    if (showGrid) {
        drawGridCompatible(svg, W, H, viewRange, 0, 0, tx, ty, viewParams.gridStep);
    }

    if (!sol || !sol.isValid) {
        const msg = svgEl("text", { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: '#999' });
        msg.textContent = "（無解）";
        svg.appendChild(msg);
        return svg;
    }

    const { O, A, B } = sol.points;

    // 繪製驅動元件 (Background)
    if (viewParams.motorType) {
        const motorRotation = viewParams.motorRotation || 0;
        const motorEl = createDriveComponent(viewParams.motorType, tx(O), ty(O), scale, motorRotation);
        if (motorEl) svg.appendChild(motorEl);
    }

    // 1. 繪製導軌
    svg.appendChild(svgEl('line', {
        x1: 0, y1: ty({ y: 0 }), x2: W, y2: ty({ y: 0 }),
        stroke: '#eee', 'stroke-width': 1, 'stroke-dasharray': '5,5'
    }));

    // 2. 繪製軌跡 (若有)
    if (trajectoryData && trajectoryData.results) {
        const pts = trajectoryData.results
            .filter(r => r.isValid && r.B)
            .map(r => `${tx(r.B)},${ty(r.B)}`)
            .join(' ');
        if (pts) {
            svg.appendChild(svgEl('polyline', {
                points: pts, fill: 'none', stroke: '#3498db', 'stroke-width': 2, 'stroke-opacity': 0.2
            }));
        }
    }

    // 3. 繪製連桿 (A-B)
    svg.appendChild(svgEl('line', {
        x1: tx(A), y1: ty(A), x2: tx(B), y2: ty(B),
        stroke: '#3498db', 'stroke-width': 8 * scale / (W / 400), 'stroke-linecap': 'round', 'stroke-opacity': 0.8
    }));

    // 4. 繪製曲柄桿 (O-A) - 桿件化
    svg.appendChild(svgEl('line', {
        x1: tx(O), y1: ty(O), x2: tx(A), y2: ty(A),
        stroke: '#e74c3c', 'stroke-width': 10 * scale / (W / 400), 'stroke-linecap': 'round', 'stroke-opacity': 0.9
    }));

    // 5. 繪製滑塊 (Slider) - 桿件化的長方形
    const sw = 40 * scale;
    const sh = 20 * scale;
    svg.appendChild(svgEl('rect', {
        x: tx(B) - sw / 2, y: ty(B) - sh / 2,
        width: sw, height: sh,
        fill: '#27ae60', rx: 4, stroke: '#1b5e20', 'stroke-width': 1, 'fill-opacity': 0.8
    }));

    // 6. 關節與孔洞 (Joints)
    const joints = [
        { p: O, r: 6, fill: '#666', label: 'O' },
        { p: A, r: 5, fill: '#fff', stroke: '#111', label: 'A' },
        { p: B, r: 4, fill: '#fff', stroke: '#111', label: 'B' }
    ];

    for (const j of joints) {
        svg.appendChild(svgEl('circle', {
            cx: tx(j.p), cy: ty(j.p),
            r: j.r * scale / (W / 400),
            fill: j.fill || 'none',
            stroke: j.stroke || 'none',
            'stroke-width': 1.5
        }));

        // 標註
        const lbl = svgEl('text', {
            x: tx(j.p), y: ty(j.p) - 15 * scale,
            'font-size': 10, fill: '#111', 'text-anchor': 'middle'
        });
        lbl.textContent = j.label;
        svg.appendChild(lbl);
    }

    return svg;
}
