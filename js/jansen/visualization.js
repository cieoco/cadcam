/**
 * Jansen Visualization - Uses Generic Engine
 */

import { svgEl, drawGridCompatible } from '../utils.js';
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

    const svg = svgEl("svg", {
        width: "100%",
        height: "100%",
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: "xMidYMid meet",
        style: "display:block; width:100%; height:100%;"
    });

    // Background
    svg.appendChild(svgEl("rect", { width: W, height: H, fill: "#fafafa" }));

    // Grid
    if (viewParams.showGrid !== false) {
        drawGridCompatible(svg, W, H, viewRange, 0, 0, tx, ty, viewParams.gridStep);
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

    // 2. Drive Component
    // Try to find input crank center.
    if (viewParams.motorType) {
        // Find 'input_crank' step
        const crankStep = topology.steps.find(s => s.type === 'input_crank');
        const O_id = crankStep ? crankStep.center : 'O';
        const O = sol.points[O_id] || { x: 0, y: 0 };

        const motorRotation = viewParams.motorRotation || 0;
        const motor = createDriveComponent(viewParams.motorType, tx(O), ty(O), scale, motorRotation);
        if (motor) svg.appendChild(motor);
    }

    // 3. Render Topology using Generic Engine
    renderTopology(svg, topology, sol, viewParams, scale, tx, ty);

    return svg;
}
