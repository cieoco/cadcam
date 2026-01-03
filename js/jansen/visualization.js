/**
 * Jansen Visualization - Uses Generic Engine
 */

import { svgEl, drawGridCompatible, describeArc, deg2rad, rad2deg } from '../utils.js';
import { createDriveComponent } from '../motor-data.js';
import { JANSEN_TOPOLOGY } from './topology.js';
import { renderTopology } from '../multilink/visualization.js';

export function renderJansen(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    // 1. Determine Topology (Logic duplicated from solver wrapper, ideally passed in sol? No sol is result)
    // Visualization needs topology for layout (lines/polygons). 
    // Solver result `sol` only has points.
    // We need to parse topology here too if we want dynamic visualization.

    let topology = JANSEN_TOPOLOGY;
    // viewParams contains config params? `config.js` passes `mech` into `updatePreview`.
    // Actually `updatePreview` calls `renderFn(sol, theta, traj, viewParams)`.
    // And `viewParams` receives `readViewParams()` + `readInputs()`.
    // `readInputs` returns `{ topology: string }`.

    if (viewParams.topology) {
        try {
            topology = JSON.parse(viewParams.topology);
        } catch (e) {
            console.warn("Viz: Invalid Topology JSON");
        }
    }

    const W = viewParams.width || 800;
    const H = viewParams.height || 600;
    const viewRange = viewParams.viewRange || 800;
    const pad = 50;

    // Scale setup
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;
    const tx = (p) => W / 2 + p.x * scale;
    const ty = (p) => H / 2 - p.y * scale;

    const panX = viewParams.panX || 0;
    const panY = viewParams.panY || 0;

    const svg = svgEl("svg", {
        width: "100%",
        height: "100%",
        viewBox: `${-panX} ${-panY} ${W} ${H}`,
        preserveAspectRatio: "xMidYMid meet",
        style: "display:block; width:100%; height:100%;"
    });

    // Background
    svg.appendChild(svgEl("rect", { width: W, height: H, fill: "#fafafa" }));

    // Grid (lines only; labels handled by HTML overlay)
    if (viewParams.showGrid !== false) {
        drawGridCompatible(svg, W, H, viewRange, 0, 0, tx, ty, viewParams.gridStep, panX, panY, false, true);
    }

    if (!sol || !sol.isValid) {
        const errorText = sol && sol.errorStep ? `Error at ${sol.errorStep}` : "Invalid Geometry";
        svg.appendChild(svgEl("text", {
            x: W / 2, y: H / 2, "text-anchor": "middle", fill: "#999"
        })).textContent = `此參數無解 (${errorText})`;
        return svg;
    }

    // 1. Draw Trajectory
    if (trajectoryData && trajectoryData.results) {
        const pts = trajectoryData.results
            .filter(r => r.isValid && r.B)
            .map(r => `${tx(r.B)},${ty(r.B)}`)
            .join(' ');
        if (pts) {
            svg.appendChild(svgEl('polyline', {
                points: pts, fill: 'none', stroke: '#9b59b6', 'stroke-width': 2, 'stroke-opacity': 0.4
            }));
        }
    }

    // 2. Drive Components (all input_crank centers)
    if (viewParams.motorType && topology.steps) {
        const crankSteps = topology.steps.filter(s => s.type === 'input_crank');
        if (crankSteps.length) {
            const motorRotation = viewParams.motorRotation || 0;
            crankSteps.forEach((crankStep) => {
                const O_id = crankStep.center || 'O';
                const O = sol.points[O_id] || { x: 0, y: 0 };
                const motor = createDriveComponent(viewParams.motorType, tx(O), ty(O), scale, motorRotation);
                if (motor) svg.appendChild(motor);
            });
        }
    }

    // 2.5 Motor Angle Labels (input cranks)
    if (topology.steps) {
        const crankSteps = topology.steps.filter(s => s.type === 'input_crank');
        crankSteps.forEach((crankStep) => {
            const centerId = crankStep.center || 'O';
            const tipId = crankStep.id;
            const center = sol.points[centerId];
            const tip = sol.points[tipId];
            if (!center || !tip) return;
            const dx = tip.x - center.x;
            const dy = tip.y - center.y;
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
            if (dx * dx + dy * dy < 1e-6) return;

            const angleModel = rad2deg(Math.atan2(dy, dx));
            const motorId = String(crankStep.physical_motor || crankStep.physicalMotor || '1');
            const angleDeg = angleModel;

            const angleScreen = -angleDeg;
            const cx = tx(center);
            const cy = ty(center);
            const arcR = Math.max(18, Math.min(32, scale * 12 + 10));
            const color = '#e74c3c';

            const baseline = svgEl('line', {
                x1: cx,
                y1: cy,
                x2: cx + arcR,
                y2: cy,
                stroke: color,
                'stroke-width': 1,
                'stroke-dasharray': '2,3',
                'stroke-linecap': 'round'
            });
            svg.appendChild(baseline);

            const arcPath = describeArc(cx, cy, arcR, 0, angleScreen);
            svg.appendChild(svgEl('path', {
                d: arcPath,
                fill: 'none',
                stroke: color,
                'stroke-width': 1.2
            }));

            const midAngle = angleScreen / 2;
            const labelR = arcR + 10;
            const labelX = cx + labelR * Math.cos(deg2rad(midAngle));
            const labelY = cy + labelR * Math.sin(deg2rad(midAngle));
            const label = svgEl('text', {
                x: labelX,
                y: labelY,
                fill: color,
                'font-size': '11px',
                'font-family': 'sans-serif',
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                'pointer-events': 'none'
            });
            label.textContent = `M${motorId}=${Math.round(angleDeg)} deg`;
            svg.appendChild(label);
        });
    }

    // 3. Render Topology using Generic Engine
    renderTopology(svg, topology, sol, viewParams, scale, tx, ty);

    return svg;
}
