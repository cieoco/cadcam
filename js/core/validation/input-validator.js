/**
 * Input Validator
 * 第一階段輸入檢核：基礎參數與 topology 格式
 */

import { validateConfig } from '../../config.js';
import {
    addHealthIssue,
    buildSanitySummary,
    createHealthReport,
    HealthStatus
} from './health-report.js';

function parseTopology(rawTopology) {
    if (!rawTopology) return { topology: null, parseError: null };
    if (typeof rawTopology === 'object') {
        return { topology: rawTopology, parseError: null };
    }
    if (typeof rawTopology !== 'string') {
        return { topology: null, parseError: 'Topology must be a string or object.' };
    }

    const trimmed = rawTopology.trim();
    if (!trimmed) return { topology: null, parseError: null };

    try {
        return { topology: JSON.parse(trimmed), parseError: null };
    } catch (error) {
        return { topology: null, parseError: error && error.message ? error.message : 'Invalid JSON.' };
    }
}

function collectDuplicateIds(components = []) {
    const seen = new Set();
    const duplicates = new Set();

    components.forEach((component, index) => {
        const id = component && component.id ? String(component.id).trim() : `__missing_${index}`;
        if (!id) return;
        if (seen.has(id)) duplicates.add(id);
        seen.add(id);
    });

    return Array.from(duplicates).sort();
}

function validateMultilinkTopology(report, topology, rawTopology) {
    const hasRawTopology = typeof rawTopology === 'string'
        ? rawTopology.trim().length > 0
        : Boolean(rawTopology);

    if (!hasRawTopology && !topology) {
        return report;
    }

    if (!topology || typeof topology !== 'object') {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'INVALID_TOPOLOGY_SHAPE',
            title: '拓樸格式無效',
            message: '目前 topology 不是有效物件，無法進行機構求解。',
            suggestion: '請重新載入範本，或檢查 topology JSON 格式。',
            targets: ['topology']
        });
        return report;
    }

    if (topology.steps !== undefined && !Array.isArray(topology.steps)) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'INVALID_TOPOLOGY_STEPS',
            title: '拓樸步驟格式無效',
            message: 'topology.steps 必須是陣列。',
            suggestion: '請確認拓樸編譯輸出是否正常。',
            targets: ['topology.steps']
        });
    }

    if (topology._wizard_data !== undefined && !Array.isArray(topology._wizard_data)) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'INVALID_WIZARD_DATA',
            title: '設計器資料格式無效',
            message: 'topology._wizard_data 必須是陣列。',
            suggestion: '請確認 wizard 匯出資料沒有損壞。',
            targets: ['topology._wizard_data']
        });
    }

    if (Array.isArray(topology._wizard_data)) {
        const duplicateIds = collectDuplicateIds(topology._wizard_data);
        if (duplicateIds.length) {
            addHealthIssue(report, {
                status: HealthStatus.FAIL,
                code: 'DUPLICATE_COMPONENT_ID',
                title: '元件 ID 重複',
                message: `以下元件 ID 重複：${duplicateIds.join(', ')}`,
                suggestion: '請為每個桿件或零件指定唯一名稱。',
                targets: duplicateIds
            });
        }
    }

    if (topology.tracePoint && Array.isArray(topology._wizard_data)) {
        const pointIds = new Set();
        topology._wizard_data.forEach((component) => {
            ['p1', 'p2', 'p3'].forEach((key) => {
                const pointId = component && component[key] && component[key].id;
                if (pointId) pointIds.add(pointId);
            });
            if (component && component.type === 'polygon' && Array.isArray(component.points)) {
                component.points.forEach((point) => {
                    if (point && point.id) pointIds.add(point.id);
                });
            }
        });
        if (!pointIds.has(topology.tracePoint)) {
            addHealthIssue(report, {
                status: HealthStatus.WARN,
                code: 'TRACE_POINT_NOT_FOUND',
                title: '追蹤點未對應到元件',
                message: `目前 tracePoint "${topology.tracePoint}" 沒有出現在 wizard 元件資料中。`,
                suggestion: '請確認追蹤點名稱，或重新指定要觀察的 joint。',
                targets: [topology.tracePoint]
            });
        }
    }

    return report;
}

export function validatePreviewInputs({ mods, mech, partSpec, mfg } = {}) {
    const report = createHealthReport();

    if (!mods || !mods.config) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'MISSING_MECHANISM_MODULE',
            title: '機構模組未載入',
            message: '目前沒有可用的機構模組設定。',
            suggestion: '請重新選擇機構類型，或重新整理頁面。',
            targets: ['mods.config']
        });
        return {
            report,
            sanitySummary: buildSanitySummary(report),
            topology: null
        };
    }

    try {
        validateConfig(mech || {}, partSpec || {}, mfg || {});
    } catch (error) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'INVALID_CONFIG',
            title: '基礎參數無效',
            message: error && error.message ? error.message : '配置參數不合法。',
            suggestion: '請先修正加工或零件規格參數，再重新預覽。',
            targets: ['config']
        });
    }

    const { topology, parseError } = parseTopology(mech && mech.topology);
    if (parseError) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'TOPOLOGY_JSON_PARSE_FAILED',
            title: '拓樸 JSON 解析失敗',
            message: `topology JSON 無法解析：${parseError}`,
            suggestion: '請檢查 JSON 語法，或重新載入範本。',
            targets: ['topology']
        });
    } else if (mods.config.id === 'multilink') {
        validateMultilinkTopology(report, topology, mech && mech.topology);
    }

    return {
        report,
        sanitySummary: buildSanitySummary(report),
        topology
    };
}

