/**
 * Motion Analysis Helpers
 * 從 sweep / trajectoryData 提取最小可用的運動摘要
 */

import { createHealthIssue, HealthStatus } from '../validation/health-report.js';

function roundValue(value, digits = 1) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function uniqueAngles(values) {
    const seen = new Set();
    return values.filter((value) => {
        const key = String(roundValue(value, 2));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function analyzeMotionTrajectory(trajectoryData) {
    if (!trajectoryData || !Array.isArray(trajectoryData.results)) return null;

    const validResults = trajectoryData.results.filter((entry) => entry && entry.isValid && entry.B);
    if (!validResults.length) return null;

    const xs = validResults.map((entry) => Number(entry.B.x)).filter(Number.isFinite);
    const ys = validResults.map((entry) => Number(entry.B.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const totalRange = Math.hypot(rangeX, rangeY);

    let pathLength = 0;
    let minStepDistance = Infinity;
    let minStepTheta = null;
    for (let i = 1; i < validResults.length; i += 1) {
        const prev = validResults[i - 1];
        const curr = validResults[i];
        const dx = Number(curr.B.x) - Number(prev.B.x);
        const dy = Number(curr.B.y) - Number(prev.B.y);
        const stepDistance = Math.hypot(dx, dy);
        pathLength += stepDistance;
        if (stepDistance < minStepDistance) {
            minStepDistance = stepDistance;
            minStepTheta = Number(curr.theta);
        }
    }

    const avgStepDistance = validResults.length > 1 ? pathLength / (validResults.length - 1) : 0;
    const validRanges = Array.isArray(trajectoryData.validRanges) ? trajectoryData.validRanges : [];
    const invalidRanges = Array.isArray(trajectoryData.invalidRanges) ? trajectoryData.invalidRanges : [];

    const candidateAngles = uniqueAngles(
        validRanges.flatMap((range) => {
            const candidates = [];
            if (Number.isFinite(range?.start)) candidates.push(Number(range.start));
            if (Number.isFinite(range?.end)) candidates.push(Number(range.end));
            return candidates;
        })
    );

    const likelyDeadCenter = (
        invalidRanges.length > 0
        || (avgStepDistance > 0 && minStepDistance < avgStepDistance * 0.2)
    );

    return {
        validPointCount: validResults.length,
        validRangeCount: validRanges.length,
        invalidRangeCount: invalidRanges.length,
        rangeX: roundValue(rangeX, 1),
        rangeY: roundValue(rangeY, 1),
        totalRange: roundValue(totalRange, 1),
        pathLength: roundValue(pathLength, 1),
        avgStepDistance: roundValue(avgStepDistance, 3),
        minStepDistance: Number.isFinite(minStepDistance) ? roundValue(minStepDistance, 3) : null,
        minStepTheta: roundValue(minStepTheta, 1),
        candidateAngles: candidateAngles.map((angle) => roundValue(angle, 1)),
        likelyDeadCenter,
        leadText: `行程 X=${roundValue(rangeX, 1)} mm / Y=${roundValue(rangeY, 1)} mm，總包絡約 ${roundValue(totalRange, 1)} mm`
    };
}

export function buildMotionAnalysisIssues(analysis) {
    if (!analysis) return [];

    const issues = [];

    if (analysis.totalRange != null && analysis.totalRange < 5) {
        issues.push(createHealthIssue({
            status: HealthStatus.WARN,
            code: 'motion-small-range',
            title: '輸出行程偏小',
            message: `目前追蹤點的總包絡約 ${analysis.totalRange} mm，運動幅度可能不夠明顯。`,
            suggestion: '先檢查曲柄半徑、coupler 長度或 ground 距離，確認行程是否達到需求。'
        }));
    }

    if (analysis.likelyDeadCenter) {
        const angleText = analysis.candidateAngles && analysis.candidateAngles.length
            ? ` θ=${analysis.candidateAngles.slice(0, 4).join('°, ')}°`
            : '';
        issues.push(createHealthIssue({
            status: HealthStatus.WARN,
            code: 'motion-dead-center',
            title: '接近死點或可行區間邊界',
            message: `掃描顯示機構在部分角度附近可能接近死點或解切換邊界。${angleText ? `候選角度：${angleText}。` : ''}`,
            suggestion: '先觀察可行區間起迄角度，再調整曲柄、連桿或固定點距離，避免在極限附近卡住。'
        }));
    }

    return issues;
}
