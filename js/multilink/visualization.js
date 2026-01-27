/**
 * Generic Visualization Engine for Multilink
 */
import { svgEl, drawGridCompatible, describeArc, deg2rad, rad2deg } from '../utils.js';
import { createDriveComponent } from '../motor-data.js';

export function renderTopology(svg, topology, sol, viewParams, scale, tx, ty) {
    if (!sol || sol.isValid === false) return;

    if (!topology || !topology.visualization) return;
    const { links, polygons, joints } = topology.visualization;
    const pts = sol.points || {};
    const bodies = sol.bodies || [];

    const fallbackPoints = new Map();
    if (topology && Array.isArray(topology.steps)) {
        topology.steps.forEach(step => {
            if (!step || !step.id) return;
            if (Number.isFinite(step.x) && Number.isFinite(step.y)) {
                fallbackPoints.set(step.id, { x: Number(step.x), y: Number(step.y) });
            }
        });
    }
    if (topology && Array.isArray(topology._wizard_data)) {
        topology._wizard_data.forEach(c => {
            if (!c) return;
            if (c.type === 'polygon' && Array.isArray(c.points)) {
                c.points.forEach(p => {
                    if (p && p.id && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                        fallbackPoints.set(p.id, { x: Number(p.x), y: Number(p.y) });
                    }
                });
                return;
            }
            ['p1', 'p2', 'p3'].forEach(k => {
                const pt = c[k];
                if (pt && pt.id && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
                    fallbackPoints.set(pt.id, { x: Number(pt.x), y: Number(pt.y) });
                }
            });
        });
    }
    const getPoint = (id) => pts[id] || fallbackPoints.get(id) || null;

    const renderBody = (body) => {
        if (!body || !body.localPoints || !body.worldPoints) return;
        const ids = Object.keys(body.localPoints);
        if (ids.length < 2) return;

        const originId = ids[0];
        const worldOrigin = body.worldPoints[originId];
        if (!worldOrigin) return;

        const localOrigin = body.localPoints[originId];
        const worldX = (x) => worldOrigin.x + (x - localOrigin.x);
        const worldY = (y) => worldOrigin.y + (y - localOrigin.y);

        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = body.worldPoints[ids[i]];
                const b = body.worldPoints[ids[j]];
                if (!a || !b) continue;
                svg.appendChild(svgEl('line', {
                    x1: tx(a), y1: ty(a),
                    x2: tx(b), y2: ty(b),
                    stroke: '#7f8c8d',
                    'stroke-width': 2,
                    'stroke-dasharray': '2,4'
                }));
            }
        }
    };

    // 1. Polygons (Background Plates)
    if (polygons) {
        for (const poly of polygons) {
            const pointsStr = poly.points
                .map(id => getPoint(id))
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

    // 1.5 Render Bodies (rigid plates)
    if (bodies.length) {
        for (const body of bodies) {
            if (body.type === 'triangle') {
                const ids = Object.keys(body.worldPoints);
                if (ids.length >= 3) {
                    const pointsStr = ids
                        .map(id => body.worldPoints[id])
                        .filter(p => p)
                        .map(p => `${tx(p)},${ty(p)}`)
                        .join(' ');
                    svg.appendChild(svgEl('polygon', {
                        points: pointsStr,
                        fill: '#27ae60',
                        'fill-opacity': 0.15,
                        stroke: '#27ae60',
                        'stroke-width': 1.5
                    }));
                }
            } else {
                renderBody(body);
            }
        }
    }

    // 2. Links
    if (links) {
        for (const link of links) {
            if (link.hidden) continue;
            const p1 = getPoint(link.p1);
            const p2 = getPoint(link.p2);
            if (!p1 || !p2) {
                // console.warn(`Viz: Missing point for link ${link.p1}-${link.p2}`, { p1, p2 });
                continue;
            }

            // 「機敏預警」顏色計算
            let strokeColor = link.color || '#333';
            let filter = 'none';
            if (sol.dyadQualities) {
                const q1 = sol.dyadQualities[link.p1] ?? 1.0;
                const q2 = sol.dyadQualities[link.p2] ?? 1.0;
                const quality = Math.min(q1, q2); // 取傳動最差的一端

                if (quality < 0.4) { // 低於 23 度左右
                    const r = 255;
                    const g = Math.round(200 * (quality / 0.4));
                    strokeColor = `rgb(${r},${g},0)`;

                    // 「機敏情境語句」：不再顯示冷冰冰的數字，而是直覺的狀態
                    let hintMsg = `⚠️ 運作吃力`;

                    if (quality < 0.15) { // 極度危險
                        strokeColor = '#ff4d4d'; // 更亮的紅色
                        filter = 'drop-shadow(0 0 4px #ff0000)';
                        hintMsg = `❌ 即將卡死`;
                    }

                    // 在連桿中心點繪製提示語 (加強視覺化：白底黑字或發亮文字)
                    const midX = (tx(p1) + tx(p2)) / 2;
                    const midY = (ty(p1) + ty(p2)) / 2;

                    // 背景底色標籤感 (使用 rect + text)
                    const textEl = svgEl('text', {
                        x: midX, y: midY + 22,
                        fill: strokeColor,
                        'font-size': '11px',
                        'font-weight': '900',
                        'text-anchor': 'middle',
                        'pointer-events': 'none',
                        style: 'text-shadow: 0px 0px 4px rgba(255,255,255,0.9); font-family: "Noto Sans TC", sans-serif;'
                    });
                    textEl.textContent = hintMsg;
                    svg.appendChild(textEl);
                }
            }

            if (link.style === 'piston') {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const currentL = Math.hypot(dx, dy);
                const ux = dx / currentL;
                const uy = dy / currentL;

                // Track (Background dashed line)
                svg.appendChild(svgEl('line', {
                    x1: tx(p1) - ux * 500 * scale, y1: ty(p1) + uy * 500 * scale,
                    x2: tx(p1) + ux * 500 * scale, y2: ty(p1) - uy * 500 * scale,
                    stroke: '#ecf0f1',
                    'stroke-width': 1,
                    'stroke-dasharray': '5,5'
                }));

                // Cylinder (Fixed part, thick) - Use specific tubeLen from link info if available, else fallback
                // We need to access the link's tubeLen. The visualization link object comes from topology.js
                // topology.js needs to ensure `tubeLen` is passed into visualization.links.

                let cylLen = currentL * 0.65; // Default fallback
                if (link.tubeLen) {
                    cylLen = Number(link.tubeLen);
                }

                // Clamp cylinder length to not exceed current total length (physically impossible but good for viz stability)
                if (cylLen > currentL) cylLen = currentL;

                const cylTip = { x: p1.x + ux * cylLen, y: p1.y + uy * cylLen };

                svg.appendChild(svgEl('line', {
                    x1: tx(p1), y1: ty(p1),
                    x2: tx(cylTip), y2: ty(cylTip),
                    stroke: '#2c3e50',
                    'stroke-width': 12,
                    'stroke-linecap': 'butt'
                }));
                // Piston Rod (Moving part, thin)
                svg.appendChild(svgEl('line', {
                    x1: tx(cylTip), y1: ty(cylTip),
                    x2: tx(p2), y2: ty(p2),
                    stroke: '#bdc3c7',
                    'stroke-width': 4,
                    'stroke-linecap': 'round'
                }));
                continue;
            }

            const attrs = {
                x1: tx(p1), y1: ty(p1),
                x2: tx(p2), y2: ty(p2),
                stroke: strokeColor,
                'stroke-width': link.width || 4,
                'stroke-linecap': 'round',
                filter: filter
            };

            if (link.style === 'track') {
                attrs['stroke-dasharray'] = '6,4';
                attrs['stroke-width'] = link.width || 2;
            }

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
            const p = getPoint(jId);
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
    if (viewParams && viewParams.topology) {
        try {
            if (typeof viewParams.topology === 'string' && viewParams.topology.trim()) {
                topology = JSON.parse(viewParams.topology);
            } else if (typeof viewParams.topology === 'object') {
                topology = viewParams.topology;
            }
        } catch (e) {
            console.warn("Viz: Invalid Topology JSON", e);
        }
    }

    const W = viewParams.width || 800;
    const H = viewParams.height || 600;
    const viewRange = viewParams.viewRange || 800;
    const pad = 50;

    const scale = Math.max(0.01, Math.min(W - 2 * pad, H - 2 * pad) / viewRange);
    // Pan Logic: We shift the ViewBox (Camera), not the objects (World)
    // But wait, existing code used object shift. Let's switch to ViewBox shift for consistency with mouse drag.
    // If Pan is +100 (Right), Camera moves Left (-100).
    const panX = viewParams.panX || 0;
    const panY = viewParams.panY || 0;

    const tx = (p) => W / 2 + p.x * scale;
    const ty = (p) => H / 2 - p.y * scale;

    const svg = svgEl("svg", {
        width: "100%",
        height: "100%",
        viewBox: `${-panX} ${-panY} ${W} ${H}`,
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
    // Background (Make it huge to cover pan area)
    svg.appendChild(svgEl("rect", { x: -50000, y: -50000, width: 100000, height: 100000, fill: "#fafafa" }));

    // Grid
    if (viewParams.showGrid !== false) {
        // Grid Range: Make it huge to cover panning
        const gridRange = 20000; // Covers +/- 10000 units
        drawGridCompatible(svg, W, H, gridRange * 1.2, 0, 0, tx, ty, viewParams.gridStep, panX, panY, false, true);
    }

    if (!sol || !sol.isValid) {
        const errorText = sol && sol.errorStep ? `Error at ${sol.errorStep}` : "Invalid Geometry";
        svg.appendChild(svgEl("text", {
            x: W / 2, y: H / 2, "text-anchor": "middle", fill: "#999", "font-size": "14px"
        })).textContent = `此參數無解 (${errorText})`;
        return svg;
    }

    // 1. Draw Trajectories (Ghost Paths) for all points
    if (trajectoryData && trajectoryData.results && trajectoryData.results.length > 0) {
        // Collect all point IDs found in the results
        const firstValid = trajectoryData.results.find(r => r.isValid && r.points);
        if (firstValid && firstValid.points) {
            const allPointIds = Object.keys(firstValid.points);

            allPointIds.forEach(ptId => {
                // Skip ground points (they don't move)
                const isGround = ptId.startsWith('O');
                if (isGround) return;

                const results = trajectoryData.results;
                let currentSegment = [];
                let currentValid = null;

                for (let i = 0; i < results.length; i++) {
                    const r = results[i];
                    const p = r.points ? r.points[ptId] : null;
                    if (!p) {
                        // If no point, break segment
                        renderSegment(currentSegment, currentValid, ptId);
                        currentSegment = [];
                        currentValid = null;
                        continue;
                    }

                    if (currentValid === null) {
                        currentValid = r.isValid;
                    } else if (currentValid !== r.isValid) {
                        // State changed, render previous segment
                        renderSegment(currentSegment, currentValid, ptId);
                        currentSegment = [p];
                        currentValid = r.isValid;
                        continue;
                    }
                    currentSegment.push(p);
                }
                renderSegment(currentSegment, currentValid, ptId);
            });
        }
    }

    function renderSegment(points, isValid, ptId) {
        if (points.length < 2) return;
        const ptsString = points.map(p => `${tx(p)},${ty(p)}`).join(' ');
        const isTrace = ptId === (topology.tracePoint || '');

        svg.appendChild(svgEl('polyline', {
            points: ptsString,
            fill: 'none',
            stroke: isValid ? (isTrace ? '#9b59b6' : '#bdc3c7') : '#e74c3c',
            'stroke-width': isTrace ? 2.5 : 1,
            'stroke-opacity': isValid ? (isTrace ? 0.8 : 0.4) : 0.6,
            'stroke-dasharray': isValid ? (isTrace ? 'none' : '4,4') : '2,2',
            class: isValid ? 'ghost-trajectory' : 'invalid-trajectory'
        }));
    }

    // 2. Drive Components
    if (topology.steps) {
        const crankSteps = topology.steps.filter(s => s.type === 'input_crank');
        if (crankSteps.length) {
            const motorType = viewParams.motorType || 'tt_motor';
            const motorRotation = viewParams.motorRotation || 0;
            crankSteps.forEach((crankStep) => {
                const O_id = crankStep.center || 'O1';
                const O = sol.points[O_id] || { x: 0, y: 0 };
                const motor = createDriveComponent(motorType, tx(O), ty(O), scale, motorRotation);
                if (motor) svg.appendChild(motor);
            });
        }
    }

    // 2.5 Motor Labels (input cranks & linear actuators)
    if (topology.steps) {
        // --- Crank Labels ---
        const crankSteps = topology.steps.filter(s => s.type === 'input_crank');
        crankSteps.forEach((crankStep) => {
            const centerId = crankStep.center || 'O1';
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

        // --- Linear Labels ---
        const linearSteps = topology.steps.filter(s => s.type === 'input_linear');
        linearSteps.forEach((linStep) => {
            const p1 = sol.points[linStep.p1];
            const p3 = sol.points[linStep.id];
            if (!p1 || !p3) return;

            const motorId = String(linStep.physical_motor || '1');
            const dist = Math.hypot(p3.x - p1.x, p3.y - p1.y) - (linStep.baseDist || 0);

            const cx = tx(p3);
            const cy = ty(p3);
            const color = '#3498db';

            const label = svgEl('text', {
                x: cx + 12,
                y: cy - 12,
                fill: color,
                'font-size': '11px',
                'font-weight': 'bold',
                'font-family': 'sans-serif',
                'pointer-events': 'none'
            });
            label.textContent = `M${motorId}(Lin)=${Math.round(dist)} mm`;
            svg.appendChild(label);

            // Optional: Draw a small indicator for linear displacement
            svg.appendChild(svgEl('circle', {
                cx, cy, r: 4, fill: 'none', stroke: color, 'stroke-width': 1.5
            }));
        });
    }
    // 3. Render Topology
    renderTopology(svg, topology, sol, viewParams, scale, tx, ty);

    return svg;
}
