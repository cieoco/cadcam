/**
 * Minimal Body-Joint Solver (Revolute + Input)
 * Builds rigid bodies from point-based solutions.
 */

import { deg2rad } from '../utils.js';
import { solveTopology } from '../multilink/solver.js';

function solveCircleIntersection(p1, r1, p2, r2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return [];

    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const x2 = p1.x + a * (dx / d);
    const y2 = p1.y + a * (dy / d);
    const rx = -dy * (h / d);
    const ry = dx * (h / d);

    return [
        { x: x2 + rx, y: y2 + ry },
        { x: x2 - rx, y: y2 - ry }
    ];
}

function getParamVal(params, topology, name, fallback = 0) {
    if (!name) return fallback;
    if (params && params[name] !== undefined) return Number(params[name]);
    if (topology && topology.params && topology.params[name] !== undefined) {
        return Number(topology.params[name]);
    }
    const parsed = Number(name);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function computeBarBody(component, points) {
    const p1 = points[component.p1.id];
    const p2 = points[component.p2.id];
    if (!p1 || !p2) return null;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const L = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    return {
        id: component.id,
        type: 'bar',
        pose: { x: p1.x, y: p1.y, theta },
        localPoints: {
            [component.p1.id]: { x: 0, y: 0 },
            [component.p2.id]: { x: L, y: 0 }
        },
        worldPoints: {
            [component.p1.id]: { ...p1 },
            [component.p2.id]: { ...p2 }
        }
    };
}

function computeTriangleBody(component, points, params, topology) {
    const p1 = points[component.p1.id];
    const p2 = points[component.p2.id];
    const p3 = points[component.p3.id];
    if (!p1 || !p2 || !p3) return null;

    const base = getParamVal(params, topology, component.gParam, Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const r1 = getParamVal(params, topology, component.r1Param, Math.hypot(p3.x - p1.x, p3.y - p1.y));
    const r2 = getParamVal(params, topology, component.r2Param, Math.hypot(p3.x - p2.x, p3.y - p2.y));

    const localP1 = { x: 0, y: 0 };
    const localP2 = { x: base, y: 0 };
    const options = solveCircleIntersection(localP1, r1, localP2, r2);
    if (!options.length) return null;
    const localP3 = (component.sign === -1) ? options[1] : options[0];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const theta = Math.atan2(dy, dx);

    return {
        id: component.id,
        type: 'triangle',
        pose: { x: p1.x, y: p1.y, theta },
        localPoints: {
            [component.p1.id]: localP1,
            [component.p2.id]: localP2,
            [component.p3.id]: localP3
        },
        worldPoints: {
            [component.p1.id]: { ...p1 },
            [component.p2.id]: { ...p2 },
            [component.p3.id]: { ...p3 }
        }
    };
}

export function buildBodiesFromSolution(topology, params, points) {
    const components = topology && topology._wizard_data ? topology._wizard_data : [];
    const bodies = [];
    for (const c of components) {
        if (c.type === 'bar' && c.p1?.id && c.p2?.id) {
            const body = computeBarBody(c, points);
            if (body) bodies.push(body);
        } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
            const body = computeTriangleBody(c, points, params, topology);
            if (body) bodies.push(body);
        }
    }
    return bodies;
}

export function solveBodyJoint(topology, params) {
    const sol = solveTopology(topology, params);
    if (!sol || !sol.isValid) {
        return { ...sol, bodies: [] };
    }
    const bodies = buildBodiesFromSolution(topology, params, sol.points || {});
    return { ...sol, bodies };
}
