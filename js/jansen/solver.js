/**
 * Jansen Mechanism - Uses Generic Multilink Solver
 */

import { solveTopology, sweepTopology, calculateTrajectoryStats } from '../multilink/solver.js';
import { buildBodiesFromSolution } from '../body-joint/solver.js';
import { JANSEN_TOPOLOGY } from './topology.js';

export function solveJansen(params) {
    let topology = JANSEN_TOPOLOGY;

    // 如果有自定義拓撲 JSON，嘗試解析
    if (params.topology) {
        try {
            topology = JSON.parse(params.topology);
        } catch (e) {
            console.warn("Invalid Topology JSON, using default.", e);
        }
    }

    const sol = solveTopology(topology, params);
    if (!sol || !sol.isValid) return sol;
    sol.bodies = buildBodiesFromSolution(topology, params, sol.points || {});
    return sol;
}

export function sweepTheta(params, startDeg, endDeg, stepDeg) {
    let topology = JANSEN_TOPOLOGY;
    if (params.topology) {
        try { topology = JSON.parse(params.topology); } catch (e) { }
    }
    return sweepTopology(topology, params, startDeg, endDeg, stepDeg);
}

export { calculateTrajectoryStats };
