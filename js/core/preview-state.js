/**
 * Preview State Pipeline
 * 預覽狀態整理（求解/軌跡/訊息）
 */

import { fmt } from '../utils.js';
import { computeSolution, computeParts } from './preview.js';
import { getUnsolvedSummary } from './solver-status.js';

function parseTopology(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }
    if (typeof raw === 'object') return raw;
    return null;
}

function buildPreviewLog(mods, partSpec, mfg, topologyObj) {
    const cutDepth = mfg.thickness + mfg.overcut;
    const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));
    const baseLog = [
        `${mods.config.name} 預覽：OK`,
        `加工資訊：切割深度=${fmt(cutDepth)}mm, Stepdown=${fmt(mfg.stepdown)}mm, 總層數=${layers}`,
        `工作範圍：${partSpec.workX} x ${partSpec.workY} (mm)`,
    ].join("\n");

    const components = topologyObj && Array.isArray(topologyObj._wizard_data)
        ? topologyObj._wizard_data
        : [];
    const unsolvedSummary = components.length ? getUnsolvedSummary(components) : '';
    return unsolvedSummary ? `${baseLog}\n\n${unsolvedSummary}` : baseLog;
}

export function computePreviewState({
    mods,
    mech,
    partSpec,
    mfg,
    dynamicParams,
    lastSolution,
    lastTopology,
    showTrajectory,
    sweepParams
}) {
    const result = {
        solution: null,
        parts: [],
        trajectoryData: null,
        isInvalid: false,
        fatalInvalid: false,
        statusMessage: '',
        previewLog: '',
        restore: null,
        lastSolution,
        lastTopology
    };

    if (!mods || !mods.config) return result;

    const topologyObj = parseTopology(mech.topology);
    if (mods.config.id === 'multilink') {
        const topoKey = typeof mech.topology === 'string'
            ? mech.topology
            : JSON.stringify(mech.topology || '');
        if (topoKey !== lastTopology) {
            result.lastTopology = topoKey;
            result.lastSolution = null;
        }
        if (result.lastSolution && result.lastSolution.points) {
            mech._prevPoints = result.lastSolution.points;
        }
    }

    let sol = computeSolution(mods, mech, partSpec, mfg);
    const isInvalid = !sol || sol.isValid === false;
    result.isInvalid = isInvalid;

    if (isInvalid) {
        if (result.lastSolution && result.lastSolution.isValid) {
            result.statusMessage = `${mods.config.name}: limit reached, holding position.`;
            result.restore = {
                theta: result.lastSolution.inputTheta,
                dynamicParams: result.lastSolution.dynamicParams || {}
            };
            sol = result.lastSolution;
        } else {
            result.statusMessage = `${mods.config.name}: invalid parameters, adjust values.`;
            result.fatalInvalid = true;
            result.solution = sol;
            return result;
        }
    } else if (mods.config.id === 'multilink') {
        sol.inputTheta = mech.theta;
        sol.dynamicParams = dynamicParams || {};
        result.lastSolution = sol;
    }

    if (mods.config.id === 'multilink' && showTrajectory) {
        const sweepFn = mods.solver.sweepTopology || mods.solver.sweepTheta;
        if (sweepFn && sweepParams) {
            let sweepResult;
            if (mods.solver.sweepTopology) {
                if (topologyObj) {
                    sweepResult = sweepFn(topologyObj, mech, sweepParams.sweepStart, sweepParams.sweepEnd, sweepParams.sweepStep);
                }
            } else {
                sweepResult = sweepFn(mech, sweepParams.sweepStart, sweepParams.sweepEnd, sweepParams.sweepStep);
            }
            if (sweepResult && sweepResult.results) {
                result.trajectoryData = {
                    results: sweepResult.results,
                    validRanges: sweepResult.validRanges,
                    invalidRanges: sweepResult.invalidRanges,
                    validBPoints: sweepResult.results.filter((r) => r.isValid && r.B).map((r) => r.B)
                };
            }
        }
    }

    result.solution = sol;
    result.parts = computeParts(mods, mech, partSpec, sol);
    result.previewLog = buildPreviewLog(mods, partSpec, mfg, topologyObj);

    return result;
}
