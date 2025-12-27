/**
 * Generic Visualization Engine for Multilink
 */
import { svgEl, drawGridCompatible } from '../utils.js';
import { createDriveComponent } from '../motor-data.js';

export function renderTopology(svg, topology, sol, viewParams, scale, tx, ty) {
    if (!sol || !sol.isValid) return;

    const { links, polygons, joints } = topology.visualization;
    const pts = sol.points;

    // 1. Polygons (Background Plates)
    if (polygons) {
        for (const poly of polygons) {
            const pointsStr = poly.points
                .map(id => pts[id])
                .filter(p => p)
                .map(p => `${tx(p)},${ty(p)}`)
                .join(' ');

            if (pointsStr) {
                svg.appendChild(svgEl('polygon', {
                    points: pointsStr,
                    fill: poly.fill || '#3498db',
                    'fill-opacity': 0.3,
                    stroke: poly.stroke || 'none',
                    'stroke-width': 1
                }));
            }
        }
    }

    // 2. Links
    if (links) {
        for (const link of links) {
            const p1 = pts[link.p1];
            const p2 = pts[link.p2];
            if (!p1 || !p2) {
                console.warn(`Viz: Missing point for link ${link.p1}-${link.p2}`, { p1, p2 });
                continue;
            }

            const attrs = {
                x1: tx(p1), y1: ty(p1),
                x2: tx(p2), y2: ty(p2),
                stroke: link.color || '#333',
                'stroke-width': link.width || 4,
                'stroke-linecap': 'round'
            };

            if (link.style === 'dashed' || link.dash) {
                attrs['stroke-dasharray'] = link.dash ? link.dash.join(',') : '5,5';
                attrs['stroke-width'] = link.width || 2;
            }

            // Enhance with interactivity attributes
            attrs['data-link-p1'] = link.p1;
            attrs['data-link-p2'] = link.p2;
            attrs['class'] = 'mechanism-link';
            attrs['style'] = (attrs['style'] || '') + '; cursor: crosshair; pointer-events: stroke;';

            const lineEl = svgEl('line', attrs);

            // Add click interaction
            lineEl.addEventListener('click', (e) => {
                // Prevent bubbling if needed, but we want it to bubble to wrapper? 
                // No, we dispatch a custom event that bubbles.

                const rect = svg.getBoundingClientRect();
                const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
                const vbW = vb && vb.width ? vb.width : rect.width;
                const vbH = vb && vb.height ? vb.height : rect.height;
                const scaleToViewBox = Math.min(rect.width / vbW, rect.height / vbH);
                const offsetX = (rect.width - vbW * scaleToViewBox) / 2;
                const offsetY = (rect.height - vbH * scaleToViewBox) / 2;
                const clickX = (e.clientX - rect.left - offsetX) / scaleToViewBox;
                const clickY = (e.clientY - rect.top - offsetY) / scaleToViewBox;

                // Inverse transform to world coordinates
                // We use (0,0) transforming to find origin offset
                const originX = tx({ x: 0, y: 0 });
                const originY = ty({ x: 0, y: 0 });

                const worldX = (clickX - originX) / scale;
                // ty = H/2 - y*scale => y = (H/2 - ty)/scale = (originY - clickY)/scale
                const worldY = (originY - clickY) / scale;

                const event = new CustomEvent('mechanism-link-click', {
                    bubbles: true,
                    detail: {
                        p1: link.p1,
                        p2: link.p2,
                        p1Val: pts[link.p1],
                        p2Val: pts[link.p2],
                        x: worldX,
                        y: worldY
                    }
                });
                lineEl.dispatchEvent(event);
            });

            svg.appendChild(lineEl);
        }
    }

    // Add styles for the link hover effect
    const styleEl = svgEl('style', {});
    styleEl.textContent = `
        .mechanism-link:hover {
            stroke-opacity: 0.8;
            stroke-width: 6px !important;
            transition: stroke-width 0.1s;
        }
    `;
    svg.appendChild(styleEl);

    // 3. Joints & Labels
    if (joints) {
        for (const jId of joints) {
            const p = pts[jId];
            if (p) {
                // Joint Circle
                svg.appendChild(svgEl('circle', {
                    cx: tx(p), cy: ty(p),
                    r: 4,
                    fill: '#fff',
                    stroke: '#2c3e50',
                    'stroke-width': 1.5
                }));

                // Point ID Label
                const text = svgEl('text', {
                    x: tx(p) + 6,
                    y: ty(p) - 6,
                    fill: '#2c3e50',
                    'font-size': '10px',
                    'font-weight': 'bold',
                    'font-family': 'monospace',
                    'pointer-events': 'none'
                });
                text.textContent = jId;

                // Add white halo for readability
                text.style.textShadow = '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff';
                svg.appendChild(text);

                // Added: Interaction Target (Large invisible circle)
                const hitTarget = svgEl('circle', {
                    cx: tx(p), cy: ty(p),
                    r: 10,
                    fill: 'transparent',
                    stroke: 'none',
                    style: 'cursor: pointer; pointer-events: all;'
                });
                hitTarget.setAttribute('data-joint-id', jId);
                hitTarget.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent canvas click
                    const event = new CustomEvent('mechanism-joint-click', {
                        bubbles: true,
                        detail: {
                            id: jId,
                            x: p.x,
                            y: p.y
                        }
                    });
                    hitTarget.dispatchEvent(event);
                });
                // Add hover effect via JS or CSS class
                hitTarget.addEventListener('mouseenter', () => {
                    // Find the visible circle and highlight it?
                    // Simplified: just change cursor
                });
                svg.appendChild(hitTarget);
            }
        }
    }

    // 4. Link Name Labels
    if (links) {
        for (const link of links) {
            if (!link.id) continue;
            const p1 = pts[link.p1];
            const p2 = pts[link.p2];
            if (p1 && p2) {
                const midX = (tx(p1) + tx(p2)) / 2;
                const midY = (ty(p1) + ty(p2)) / 2;

                const text = svgEl('text', {
                    x: midX,
                    y: midY - 5,
                    fill: link.color || '#666',
                    'font-size': '9px',
                    'font-family': 'sans-serif',
                    'text-anchor': 'middle',
                    'pointer-events': 'none'
                });
                text.textContent = link.id;
                text.style.textShadow = '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff';
                svg.appendChild(text);
            }
        }
    }
}

/**
 * Generic Multilink Renderer Wrapper
 * 通用多連桿渲染包裝器 - 負責建立 SVG、格線與呼叫核心渲染引擎
 */
export function renderMultilink(sol, thetaDeg, trajectoryData = null, viewParams = {}) {
    let topology = { steps: [], visualization: { links: [], polygons: [], joints: [] } };
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
    // Scale is based on the logic: viewRange fits into the smaller dimension of the screen
    // This keeps the "Zoom Level" consistent regardless of aspect ratio
    const scale = Math.min(W - 2 * pad, H - 2 * pad) / viewRange;

    // Center logic: (0,0) is at center of screen
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
        // We want the grid to cover the WHOLE area
        // viewRange only specifies the "min visible size".
        // Calculate effective range for grid spanning
        // Max dimension / scale gives the model units needed to cover screen
        const maxDim = Math.max(W, H);
        const gridRange = maxDim / scale;

        drawGridCompatible(svg, W, H, gridRange * 1.2, 0, 0, tx, ty, viewParams.gridStep);
    }

    if (!sol || !sol.isValid) {
        const errorText = sol && sol.errorStep ? `Error at ${sol.errorStep}` : "Invalid Geometry";
        svg.appendChild(svgEl("text", {
            x: W / 2, y: H / 2, "text-anchor": "middle", fill: "#999", "font-size": "14px"
        })).textContent = `此參數無解 (${errorText})`;
        return svg;
    }

    // 1. Draw Trajectory
    if (trajectoryData && trajectoryData.results) {
        let traceId = topology.tracePoint;
        if (!traceId) {
            const firstValid = trajectoryData.results.find(r => r.isValid && r.points);
            if (firstValid && firstValid.points) {
                if (firstValid.points.B) traceId = 'B';
                else if (firstValid.points.b) traceId = 'b';
                else {
                    const ids = Object.keys(firstValid.points);
                    traceId = ids.length ? ids[ids.length - 1] : null;
                }
            }
        }

        if (traceId) {
            const pts = trajectoryData.results
                .filter(r => r.isValid && r.points && r.points[traceId])
                .map(r => `${tx(r.points[traceId])},${ty(r.points[traceId])}`)
                .join(' ');
            if (pts) {
                svg.appendChild(svgEl('polyline', {
                    points: pts, fill: 'none', stroke: '#9b59b6', 'stroke-width': 2, 'stroke-opacity': 0.6
                }));
            }
        }
    }

    // 2. Drive Component
    if (viewParams.motorType && topology.steps) {
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
