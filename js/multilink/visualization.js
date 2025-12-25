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
            if (!p1 || !p2) continue;

            const attrs = {
                x1: tx(p1), y1: ty(p1),
                x2: tx(p2), y2: ty(p2),
                stroke: link.color || '#333',
                'stroke-width': link.width || 4,
                'stroke-linecap': 'round'
            };

            if (link.style === 'dashed') {
                attrs['stroke-dasharray'] = '5,5';
                attrs['stroke-width'] = 2; // Thinner
            }

            svg.appendChild(svgEl('line', attrs));
        }
    }

    // 3. Joints
    if (joints) {
        for (const jId of joints) {
            const p = pts[jId];
            if (p) {
                svg.appendChild(svgEl('circle', {
                    cx: tx(p), cy: ty(p),
                    r: 4,
                    fill: '#fff',
                    stroke: '#2c3e50',
                    'stroke-width': 1.5
                }));
            }
        }
    }
}
