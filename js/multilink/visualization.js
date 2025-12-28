/**
 * Generic Visualization Engine for Multilink
 */
import { svgEl, drawGridCompatible } from '../utils.js';
import { createDriveComponent } from '../motor-data.js';

export function renderTopology(svg, topology, sol, viewParams, scale, tx, ty) {
    if (!sol || !sol.isValid) return;

    if (!topology || !topology.visualization) return;
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
                // console.warn(`Viz: Missing point for link ${link.p1}-${link.p2}`, { p1, p2 });
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
            attrs['id'] = link.id;
            attrs['class'] = 'mechanism-link';
            attrs['style'] = (attrs['style'] || '') + '; cursor: crosshair; pointer-events: stroke;';

            const lineEl = svgEl('line', attrs);

            // Add click interaction
            lineEl.addEventListener('click', (e) => {
                const rect = svg.getBoundingClientRect();
                const vb = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal : null;
                const vbW = vb && vb.width ? vb.width : rect.width;
                const vbH = vb && vb.height ? vb.height : rect.height;
                const scaleToViewBox = Math.min(rect.width / vbW, rect.height / vbH);
                const offsetX = (rect.width - vbW * scaleToViewBox) / 2;
                const offsetY = (rect.height - vbH * scaleToViewBox) / 2;
                const clickX = (e.clientX - rect.left - offsetX) / scaleToViewBox;
                const clickY = (e.clientY - rect.top - offsetY) / scaleToViewBox;

                const originX = tx({ x: 0, y: 0 });
                const originY = ty({ x: 0, y: 0 });
                const worldX = (clickX - originX) / scale;
                const worldY = (originY - clickY) / scale;

                const event = new CustomEvent('mechanism-link-click', {
                    bubbles: true,
                    detail: {
                        id: link.id,
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

    // 3. Joints & Labels
    if (joints) {
        for (const jId of joints) {
            const p = pts[jId];
            if (p) {
                // Find point type from steps
                const step = (topology.steps || []).find(s => s.id === jId);
                const type = step ? step.type : 'joint';

                let fill = '#fff';
                let stroke = '#2c3e50';
                let radius = 4;
                let strokeWidth = 1.5;

                if (type === 'ground') {
                    fill = '#2c3e50'; // Solid dark for ground
                    radius = 5.5;
                } else if (type === 'input_crank') {
                    fill = '#e74c3c'; // Red for motor/crank
                    stroke = '#c0392b';
                    radius = 5.5;
                } else if (jId && jId.startsWith('H')) {
                    fill = '#f1c40f'; // Yellow for holes
                }

                // Joint Circle
                svg.appendChild(svgEl('circle', {
                    cx: tx(p), cy: ty(p),
                    r: radius,
                    fill: fill,
                    stroke: stroke,
                    'stroke-width': strokeWidth,
                    class: 'mechanism-joint'
                }));

                // Interaction Target (Large invisible circle for easier clicking)
                const hitTarget = svgEl('circle', {
                    cx: tx(p), cy: ty(p),
                    r: 12,
                    fill: 'transparent',
                    stroke: 'none',
                    style: 'cursor: pointer; pointer-events: all;'
                });
                hitTarget.setAttribute('data-joint-id', jId);
                hitTarget.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const event = new CustomEvent('mechanism-joint-click', {
                        bubbles: true,
                        detail: { id: jId, x: p.x, y: p.y }
                    });
                    hitTarget.dispatchEvent(event);
                });
                svg.appendChild(hitTarget);

                // Point ID Label (Only for non-hole points)
                if (!jId.startsWith('H')) {
                    const text = svgEl('text', {
                        x: tx(p) + 8,
                        y: ty(p) - 8,
                        fill: '#2c3e50',
                        'font-size': '10px',
                        'font-weight': 'bold',
                        'font-family': 'monospace',
                        'pointer-events': 'none'
                    });
                    text.textContent = jId;
                    text.style.textShadow = '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff';
                    svg.appendChild(text);
                }
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
                    y: midY - 6,
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

    const scale = Math.max(0.01, Math.min(W - 2 * pad, H - 2 * pad) / viewRange);
    const tx = (p) => W / 2 + p.x * scale;
    const ty = (p) => H / 2 - p.y * scale;

    const svg = svgEl("svg", {
        width: "100%",
        height: "100%",
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: "xMidYMid meet",
        style: "display:block; width:100%; height:100%;"
    });

    // Styles
    const styleEl = svgEl('style', {});
    styleEl.textContent = `
        .mechanism-link:hover { stroke-opacity: 0.8; stroke-width: 6px !important; transition: stroke-width 0.1s; }
        .mechanism-joint:hover { stroke-width: 3px; }
    `;
    svg.appendChild(styleEl);

    // Background
    svg.appendChild(svgEl("rect", { width: W, height: H, fill: "#fafafa" }));

    // Grid
    if (viewParams.showGrid !== false) {
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
                const ids = Object.keys(firstValid.points);
                traceId = ids.length ? ids[ids.length - 1] : null;
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
        if (crankStep) {
            const O_id = crankStep.center || 'O1';
            const O = sol.points[O_id] || { x: 0, y: 0 };
            const motorRotation = viewParams.motorRotation || 0;
            const motor = createDriveComponent(viewParams.motorType, tx(O), ty(O), scale, motorRotation);
            if (motor) svg.appendChild(motor);
        }
    }

    // 3. Render Topology
    renderTopology(svg, topology, sol, viewParams, scale, tx, ty);

    return svg;
}
