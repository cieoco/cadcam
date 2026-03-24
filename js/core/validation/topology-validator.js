/**
 * Topology Validator
 * 第二階段檢核：機構拓樸與 wizard 組件結構
 */

import {
    addHealthIssue,
    buildSanitySummary,
    createHealthReport,
    HealthStatus
} from './health-report.js';

function countGroundedPoints(components = []) {
    const grounded = new Set();
    components.forEach((component) => {
        ['p1', 'p2', 'p3'].forEach((key) => {
            const point = component && component[key];
            if (!point || !point.id) return;
            if (point.type === 'fixed' || point.type === 'motor' || point.type === 'linear') {
                grounded.add(point.id);
            }
        });
        if (component && component.type === 'polygon' && Array.isArray(component.points)) {
            component.points.forEach((point) => {
                if (!point || !point.id) return;
                if (point.type === 'fixed' || point.type === 'motor' || point.type === 'linear') {
                    grounded.add(point.id);
                }
            });
        }
    });
    return grounded.size;
}

function validateWizardComponents(report, components = []) {
    if (!Array.isArray(components) || components.length === 0) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'TOPOLOGY_EMPTY',
            title: '尚未建立機構',
            message: '目前沒有任何桿件或構件，尚無法形成可檢查的拓樸。',
            suggestion: '請先載入範本，或從設計器新增第一個機構元件。',
            targets: ['topology._wizard_data']
        });
        return report;
    }

    const groundedCount = countGroundedPoints(components);
    if (groundedCount === 0) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'NO_GROUNDED_POINTS',
            title: '機構沒有基準點',
            message: '目前元件中沒有 fixed / motor / linear 類型的基準點，無法建立穩定拓樸。',
            suggestion: '請至少指定一組固定點或驅動基座，作為機構的參考地面。',
            targets: ['topology._wizard_data']
        });
    } else if (groundedCount === 1) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'LIMITED_GROUNDED_POINTS',
            title: '基準點數量偏少',
            message: '目前只有一個 grounded point，部分閉環機構可能難以形成穩定約束。',
            suggestion: '若要建立閉環或滑塊機構，建議補足第二個固定參考點。',
            targets: ['topology._wizard_data']
        });
    }

    components.forEach((component) => {
        if (!component || !component.type) {
            addHealthIssue(report, {
                status: HealthStatus.FAIL,
                code: 'COMPONENT_TYPE_MISSING',
                title: '元件類型缺失',
                message: '有元件缺少 type，無法判斷其幾何角色。',
                suggestion: '請重新建立該元件，或確認匯入資料格式。',
                targets: [component && component.id ? component.id : 'unknown_component']
            });
            return;
        }

        const requiredKeys = component.type === 'bar'
            ? ['p1', 'p2']
            : (component.type === 'triangle' || component.type === 'slider' ? ['p1', 'p2', 'p3'] : []);

        requiredKeys.forEach((key) => {
            const point = component[key];
            if (!point || !point.id) {
                addHealthIssue(report, {
                    status: HealthStatus.FAIL,
                    code: 'COMPONENT_POINT_MISSING',
                    title: '元件點位未指定',
                    message: `${component.id || component.type} 缺少 ${key.toUpperCase()} 定義。`,
                    suggestion: '請在設計器中補上該點位，或重新套用範本。',
                    targets: [component.id || component.type, key]
                });
            }
        });
    });

    return report;
}

function validateCompiledTopology(report, topology) {
    if (!topology) return report;

    if (Array.isArray(topology.steps) && topology.steps.length === 0) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'TOPOLOGY_STEPS_EMPTY',
            title: '拓樸步驟尚未建立',
            message: '目前 topology.steps 為空，尚未形成可求解的步驟序列。',
            suggestion: '請先更新 / 預覽一次，或檢查 wizard 是否成功編譯拓樸。',
            targets: ['topology.steps']
        });
    }

    if (topology.tracePoint && Array.isArray(topology.steps)) {
        const stepIds = new Set(topology.steps.map((step) => step && step.id).filter(Boolean));
        if (!stepIds.has(topology.tracePoint)) {
            addHealthIssue(report, {
                status: HealthStatus.WARN,
                code: 'TRACE_POINT_NOT_IN_STEPS',
                title: '追蹤點未包含在求解步驟中',
                message: `tracePoint "${topology.tracePoint}" 目前沒有對應到 topology.steps 的任何節點。`,
                suggestion: '請確認追蹤點是否為可求解節點，或重新指定觀察點。',
                targets: [topology.tracePoint]
            });
        }
    }

    return report;
}

export function validateTopologyState({ mods, topology } = {}) {
    const report = createHealthReport();

    if (!mods || !mods.config || mods.config.id !== 'multilink') {
        return {
            report,
            sanitySummary: buildSanitySummary(report)
        };
    }

    if (!topology) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'TOPOLOGY_UNAVAILABLE',
            title: '拓樸資料尚未提供',
            message: '目前沒有 topology 可供進一步檢查。',
            suggestion: '請先載入範本或在設計器建立機構。',
            targets: ['topology']
        });
        return {
            report,
            sanitySummary: buildSanitySummary(report)
        };
    }

    validateCompiledTopology(report, topology);
    validateWizardComponents(report, topology._wizard_data);

    return {
        report,
        sanitySummary: buildSanitySummary(report)
    };
}

