/**
 * Preview State Pipeline
 * 預覽狀態整理（求解/軌跡/訊息）
 */

import { fmt } from '../utils.js';
import { computeSolution, computeParts } from './preview.js';
import { getUnsolvedSummary } from './solver-status.js';
import { buildDXF } from '../utils/dxf-generator.js';
import { ErrorCodes, toUserMessage } from './errors.js';
import { buildSanitySummary, createHealthReport, HealthStatus, mergeHealthReports } from './validation/health-report.js';
import { validatePreviewInputs } from './validation/input-validator.js';
import { validateTopologyState } from './validation/topology-validator.js';
import { validateSolveState } from './validation/solve-validator.js';
import { analyzeMotionTrajectory, buildMotionAnalysisIssues } from './analysis/motion-analysis.js';

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
    const baseLog = [
        `${mods.config.name} 預覽：OK`,
        `工作範圍：${partSpec.workX} x ${partSpec.workY} (mm)`,
        `零件輸出：DXF preview ready`,
    ].join("\n");

    const components = topologyObj && Array.isArray(topologyObj._wizard_data)
        ? topologyObj._wizard_data
        : [];
    const unsolvedSummary = components.length ? getUnsolvedSummary(components) : '';
    return unsolvedSummary ? `${baseLog}\n\n${unsolvedSummary}` : baseLog;
}

function buildTemplateGuidance(topologyObj, validationReport) {
    if (!topologyObj || typeof topologyObj !== 'object') return null;

    const templateId = topologyObj._templateId || '';
    const meta = topologyObj._templateMeta && typeof topologyObj._templateMeta === 'object'
        ? topologyObj._templateMeta
        : null;

    if (!templateId && !meta) return null;

    const keyParams = Array.isArray(meta?.keyParams)
        ? meta.keyParams.filter(Boolean).map((param) => String(param))
        : [];
    const leadIssue = validationReport && Array.isArray(validationReport.issues)
        ? (validationReport.issues.find((issue) => issue.status === HealthStatus.FAIL)
            || validationReport.issues.find((issue) => issue.status === HealthStatus.WARN)
            || null)
        : null;

    return {
        templateId: String(templateId || ''),
        templateName: String(meta?.name || templateId || '目前範本'),
        learningGoal: String(meta?.learningGoal || ''),
        keyParams,
        commonFailure: String(meta?.commonFailure || ''),
        nextStep: String(meta?.nextStep || ''),
        focusText: keyParams.length ? `建議先改：${keyParams.join(' / ')}` : '',
        issueHint: leadIssue
            ? String(leadIssue.suggestion || leadIssue.message || leadIssue.title || '')
            : ''
    };
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
        showThetaSlider: false,
        dxfPreviewText: '',
        dxfError: null,
        errorType: null,
        restore: null,
        lastSolution,
        lastTopology,
        validationReport: createHealthReport(),
        sanitySummary: buildSanitySummary(createHealthReport()),
        templateGuidance: null,
        motionAnalysis: null
    };

    if (!mods || !mods.config) return result;

    let topologyObj = parseTopology(mech.topology);
    const validationState = validatePreviewInputs({ mods, mech, partSpec, mfg });
    result.validationReport = validationState.report;
    result.sanitySummary = validationState.sanitySummary;
    if (validationState.topology) {
        topologyObj = validationState.topology;
    }

    const topologyState = validateTopologyState({ mods, topology: topologyObj });
    result.validationReport = mergeHealthReports(result.validationReport, topologyState.report);
    result.sanitySummary = buildSanitySummary(result.validationReport);
    result.templateGuidance = buildTemplateGuidance(topologyObj, result.validationReport);

    if (result.validationReport.status === HealthStatus.FAIL) {
        const leadIssue = result.validationReport.issues.find((issue) => issue.status === HealthStatus.FAIL)
            || result.validationReport.issues[0];
        result.isInvalid = true;
        result.fatalInvalid = true;
        result.errorType = ErrorCodes.INVALID_PARAMS;
        result.statusMessage = leadIssue
            ? (leadIssue.message || leadIssue.title)
            : toUserMessage(ErrorCodes.INVALID_PARAMS);
        result.previewLog = buildPreviewLog(mods, partSpec, mfg, topologyObj);
        return result;
    }

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

        // 判斷是否顯示角度滑桿：檢查拓撲結構中是否有驅動元件
        const hasInputs = topologyObj && Array.isArray(topologyObj.steps) &&
            topologyObj.steps.some(s => s.type === 'input_crank' || s.type === 'input_linear');
        result.showThetaSlider = Boolean(hasInputs);
    } else {
        // 其他內建機構 (如四連桿) 預設開啟角度滑桿
        result.showThetaSlider = true;
    }

    let sol = null;
    try {
        sol = computeSolution(mods, mech, partSpec, mfg);
    } catch (e) {
        result.fatalInvalid = true;
        result.errorType = ErrorCodes.INVALID_PARAMS;
        result.statusMessage = e && e.message ? e.message : toUserMessage(ErrorCodes.INVALID_PARAMS);
        return result;
    }
    const isInvalid = !sol || sol.isValid === false;
    result.isInvalid = isInvalid;

    const solveState = validateSolveState({
        mods,
        topology: topologyObj,
        solution: sol
    });
    result.validationReport = mergeHealthReports(result.validationReport, solveState.report);
    result.sanitySummary = buildSanitySummary(result.validationReport);
    result.templateGuidance = buildTemplateGuidance(topologyObj, result.validationReport);

    if (isInvalid) {
        const noSteps = mods.config.id === 'multilink'
            && topologyObj
            && Array.isArray(topologyObj.steps)
            && topologyObj.steps.length === 0;
        if (noSteps) {
            result.statusMessage = '';
            result.isInvalid = false;
            result.fatalInvalid = false;
            result.solution = { isValid: true, points: {} };
            result.lastSolution = null;
            return result;
        }
        if (result.lastSolution && result.lastSolution.isValid) {
            result.statusMessage = `${mods.config.name}: limit reached, holding position.`;
            result.restore = {
                theta: result.lastSolution.inputTheta,
                dynamicParams: result.lastSolution.dynamicParams || {}
            };
            sol = result.lastSolution;
        } else {
            result.errorType = ErrorCodes.INFEASIBLE;
            const reason = sol && sol.errorReason ? ` (${sol.errorReason})` : '';
            result.statusMessage = `${mods.config.name}: ${toUserMessage(ErrorCodes.INFEASIBLE)}${reason}`;
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
                result.motionAnalysis = analyzeMotionTrajectory(result.trajectoryData);
                if (result.motionAnalysis) {
                    result.trajectoryData.analysis = result.motionAnalysis;
                    result.validationReport = mergeHealthReports(
                        result.validationReport,
                        createHealthReport({ issues: buildMotionAnalysisIssues(result.motionAnalysis) })
                    );
                    result.sanitySummary = buildSanitySummary(result.validationReport);
                    result.templateGuidance = buildTemplateGuidance(topologyObj, result.validationReport);
                }
            }
        }
    }

    result.solution = sol;
    result.parts = computeParts(mods, mech, partSpec, sol);
    try {
        result.dxfPreviewText = buildDXF(result.parts);
    } catch (e) {
        result.dxfError = e;
    }
    result.previewLog = buildPreviewLog(mods, partSpec, mfg, topologyObj);

    return result;
}
