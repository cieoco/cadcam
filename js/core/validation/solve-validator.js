/**
 * Solve Validator
 * 第三階段檢核：求解結果與求解狀態摘要
 */

import {
    addHealthIssue,
    buildSanitySummary,
    createHealthReport,
    HealthStatus
} from './health-report.js';
import { getUnsolvedSummary } from '../solver-status.js';

export function validateSolveState({ mods, topology, solution } = {}) {
    const report = createHealthReport();

    if (!solution) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'SOLUTION_MISSING',
            title: '求解結果不存在',
            message: '目前沒有可用的求解結果。',
            suggestion: '請確認機構參數與拓樸是否完整，然後重新預覽。',
            targets: ['solution']
        });
        return {
            report,
            sanitySummary: buildSanitySummary(report)
        };
    }

    if (solution.isValid === false) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: solution.errorType === 'invalid_topology' ? 'INVALID_TOPOLOGY' : 'INFEASIBLE_GEOMETRY',
            title: solution.errorType === 'invalid_topology' ? '拓樸無法求解' : '目前幾何無解',
            message: solution.errorReason
                ? `目前參數組合無法求解：${solution.errorReason}`
                : '目前參數組合無法形成有效解。',
            suggestion: '請先調整桿長、固定點配置或驅動方式，再重新預覽。',
            targets: ['solution']
        });
        return {
            report,
            sanitySummary: buildSanitySummary(report)
        };
    }

    if (solution.isUnderconstrained) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'UNDERCONSTRAINED_MECHANISM',
            title: '機構約束不足',
            message: '目前雖然能產生部分結果，但整體約束仍不足，解可能不穩定。',
            suggestion: '請補強固定點、連接關係或閉環條件。',
            targets: ['solution']
        });
    }

    if (mods && mods.config && mods.config.id === 'multilink' && topology && Array.isArray(topology._wizard_data)) {
        const unsolvedSummary = getUnsolvedSummary(topology._wizard_data);
        if (unsolvedSummary) {
            addHealthIssue(report, {
                status: HealthStatus.WARN,
                code: 'PARTIAL_COMPONENTS_UNSOLVED',
                title: '部分元件尚未完整求解',
                message: unsolvedSummary,
                suggestion: '請檢查未解點位是否有足夠的連接與約束。',
                targets: ['topology._wizard_data']
            });
        }
    }

    return {
        report,
        sanitySummary: buildSanitySummary(report)
    };
}

