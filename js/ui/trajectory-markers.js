/**
 * Trajectory Markers
 * 在 SVG 軌跡上標示極值點與死點候選
 */

import { svgEl } from '../utils.js';

function getValidTraceResults(trajectoryData) {
    if (!trajectoryData || !Array.isArray(trajectoryData.results)) return [];
    return trajectoryData.results.filter((entry) => entry && entry.isValid && entry.B);
}

function findResultByAngle(results, targetAngle) {
    if (!Number.isFinite(targetAngle)) return null;
    let best = null;
    let bestDelta = Infinity;

    results.forEach((entry) => {
        const theta = Number(entry.theta);
        if (!Number.isFinite(theta)) return;
        const delta = Math.abs(theta - targetAngle);
        if (delta < bestDelta) {
            best = entry;
            bestDelta = delta;
        }
    });

    return best;
}

function appendMarker(svg, point, tx, ty, label, color, options = {}) {
    if (!svg || !point) return;
    const cx = tx(point);
    const cy = ty(point);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

    const radius = options.radius || 5;
    const textDx = options.textDx ?? 8;
    const textDy = options.textDy ?? -8;

    svg.appendChild(svgEl('circle', {
        cx,
        cy,
        r: radius,
        fill: '#fff',
        stroke: color,
        'stroke-width': 2
    }));

    const text = svgEl('text', {
        x: cx + textDx,
        y: cy + textDy,
        fill: color,
        'font-size': 10,
        'font-weight': 'bold'
    });
    text.textContent = label;
    svg.appendChild(text);
}

export function renderTrajectoryMarkers(svg, trajectoryData, tx, ty) {
    const results = getValidTraceResults(trajectoryData);
    if (!results.length) return;

    const analysis = trajectoryData && trajectoryData.analysis ? trajectoryData.analysis : null;
    const points = results.map((entry) => entry.B);

    const minXPoint = points.reduce((best, point) => (best == null || point.x < best.x ? point : best), null);
    const maxXPoint = points.reduce((best, point) => (best == null || point.x > best.x ? point : best), null);
    const minYPoint = points.reduce((best, point) => (best == null || point.y < best.y ? point : best), null);
    const maxYPoint = points.reduce((best, point) => (best == null || point.y > best.y ? point : best), null);

    appendMarker(svg, minXPoint, tx, ty, 'Xmin', '#16a34a', { textDx: -34, textDy: -10 });
    appendMarker(svg, maxXPoint, tx, ty, 'Xmax', '#2563eb', { textDx: 8, textDy: -10 });
    appendMarker(svg, minYPoint, tx, ty, 'Ymin', '#7c3aed', { textDx: 8, textDy: 16 });
    appendMarker(svg, maxYPoint, tx, ty, 'Ymax', '#db2777', { textDx: 8, textDy: -10 });

    const candidateAngles = analysis && Array.isArray(analysis.candidateAngles)
        ? analysis.candidateAngles.slice(0, 4)
        : [];

    candidateAngles.forEach((angle, index) => {
        const result = findResultByAngle(results, Number(angle));
        if (!result || !result.B) return;
        appendMarker(
            svg,
            result.B,
            tx,
            ty,
            `θ ${Math.round(Number(angle))}°`,
            '#d97706',
            { radius: 4, textDx: 10, textDy: index % 2 === 0 ? -12 : 18 }
        );
    });
}
