/**
 * Standalone Mechanism Validator
 * 獨立機構驗收員 (D2)
 *
 * 目的：給一份機構 JSON（字串或物件），回一張機器可讀的判決。
 * 這是「地基」的把關器，未來 AI 生成機構時，由它判定 PASS / WARN / FAIL。
 *
 * 設計重點：
 * - 純函式，不依賴 window / DOM（可在瀏覽器以 module 直接呼叫，亦不綁預覽流程）。
 * - 結構檢查以 `steps` 為主（solver 真正吃的是 steps），補足現有以 _wizard_data 為主的檢查。
 * - 數值可行性：直接呼叫既有 solver，重用其幾何求解，不重寫數學。
 * - 輸出沿用 health-report 格式，與 diagnostics panel 一致。
 */

import {
    createHealthReport,
    addHealthIssue,
    buildSanitySummary,
    HealthStatus
} from './health-report.js';
import { solveTopology } from '../../multilink/solver.js';

// 目前 solver 實際支援的 8 種 step type（來源：multilink/solver.js）
export const KNOWN_STEP_TYPES = [
    'ground',
    'input_crank',
    'input_linear',
    'dyad',
    'rigid_triangle',
    'slider',
    'point_on_link',
    'joint'
];

// 每種 type 會「參照其他點 id」的欄位（ground 的 ref_id 僅在 dist_param 存在時才需要）
const REF_FIELDS = {
    ground: [],
    input_crank: ['center'],
    input_linear: ['p1'],
    dyad: ['p1', 'p2'],
    rigid_triangle: ['p1', 'p2'],
    slider: ['p1', 'line_p1', 'line_p2'],
    point_on_link: ['p1', 'p2'],
    joint: []
};

// 每種 type 結構上「必須能取得的長度/座標」對應的 getVal key（會檢查 *_param 或 *_val）
const REQUIRED_VALS = {
    input_crank: ['len'],
    input_linear: ['len'],
    dyad: ['r1', 'r2'],
    rigid_triangle: ['r1', 'r2'],
    slider: ['r'],
    point_on_link: ['dist']
};

function parseInput(input) {
    if (input == null) return { topology: null, parseError: 'empty' };
    if (typeof input === 'object') return { topology: input, parseError: null };
    if (typeof input !== 'string') return { topology: null, parseError: 'must be string or object' };
    const trimmed = input.trim();
    if (!trimmed) return { topology: null, parseError: 'empty' };
    try {
        return { topology: JSON.parse(trimmed), parseError: null };
    } catch (e) {
        return { topology: null, parseError: e && e.message ? e.message : 'invalid JSON' };
    }
}

// 某個值名是否可解析（在 params 中、或本身是數字字串）
function paramResolvable(topology, name) {
    if (name == null) return false;
    if (topology.params && topology.params[String(name)] !== undefined) return true;
    return !isNaN(parseFloat(name));
}

// step 是否能取得某個 val（直接 *_val，或可解析的 *_param）
function valResolvable(topology, step, key) {
    if (step[`${key}_val`] !== undefined) return true;
    const paramName = step[`${key}_param`];
    if (paramName === undefined) return false;
    return paramResolvable(topology, paramName);
}

/**
 * 驗收一份機構 JSON。
 * @param {string|object} input 機構 JSON
 * @param {object} [opts]
 * @param {boolean} [opts.runSolver=true] 是否跑 solver 做數值可行性檢查
 * @returns {{status, issues, counts, sanitySummary}}
 */
export function validateMechanismJSON(input, opts = {}) {
    const runSolver = opts.runSolver !== false;
    const report = createHealthReport();

    // ── 階段 0：解析 ──────────────────────────────────────────
    const { topology, parseError } = parseInput(input);
    if (parseError) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'TOPOLOGY_JSON_PARSE_FAILED',
            title: '機構 JSON 無法解析',
            message: `輸入不是有效的機構 JSON：${parseError}`,
            suggestion: '請確認 JSON 格式正確、且為非空物件。',
            targets: ['topology']
        });
        return finish(report);
    }
    if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'INVALID_TOPOLOGY_SHAPE',
            title: '機構格式無效',
            message: '機構 JSON 必須是一個物件。',
            suggestion: '請確認頂層是 { steps, params, tracePoint, ... } 結構。',
            targets: ['topology']
        });
        return finish(report);
    }

    // ── 階段 1：steps 結構 ────────────────────────────────────
    const steps = topology.steps;
    if (steps === undefined) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'TOPOLOGY_STEPS_MISSING',
            title: '缺少 steps',
            message: '機構 JSON 沒有 steps 欄位，無法求解。',
            suggestion: '請提供 steps 陣列，定義每個點如何被算出。',
            targets: ['topology.steps']
        });
        return finish(report);
    }
    if (!Array.isArray(steps)) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'INVALID_TOPOLOGY_STEPS',
            title: 'steps 格式無效',
            message: 'topology.steps 必須是陣列。',
            suggestion: '請確認 steps 是一個陣列。',
            targets: ['topology.steps']
        });
        return finish(report);
    }
    if (steps.length === 0) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'TOPOLOGY_STEPS_EMPTY',
            title: 'steps 為空',
            message: '目前沒有任何求解步驟。',
            suggestion: '請先建立至少一個 ground 與一個驅動步驟。',
            targets: ['topology.steps']
        });
        return finish(report);
    }

    // 收集 id，檢查缺 id / 重複 id / 未知 type
    const idSet = new Set();
    const duplicates = new Set();
    let groundCount = 0;

    steps.forEach((step, i) => {
        const where = `steps[${i}]`;
        if (!step || typeof step !== 'object') {
            addHealthIssue(report, {
                status: HealthStatus.FAIL,
                code: 'STEP_NOT_OBJECT',
                title: '步驟格式錯誤',
                message: `${where} 不是物件。`,
                suggestion: '每個 step 都必須是物件。',
                targets: [where]
            });
            return;
        }
        if (!step.id) {
            addHealthIssue(report, {
                status: HealthStatus.FAIL,
                code: 'STEP_ID_MISSING',
                title: '步驟缺少 id',
                message: `${where} 沒有 id。`,
                suggestion: '請為每個 step 指定唯一 id。',
                targets: [where]
            });
        } else {
            if (idSet.has(step.id)) duplicates.add(step.id);
            idSet.add(step.id);
        }
        if (!step.type) {
            addHealthIssue(report, {
                status: HealthStatus.FAIL,
                code: 'STEP_TYPE_MISSING',
                title: '步驟缺少 type',
                message: `${step.id || where} 沒有 type。`,
                suggestion: `type 必須是 ${KNOWN_STEP_TYPES.join(' / ')} 之一。`,
                targets: [step.id || where]
            });
        } else if (!KNOWN_STEP_TYPES.includes(step.type)) {
            addHealthIssue(report, {
                status: HealthStatus.FAIL,
                code: 'STEP_TYPE_UNKNOWN',
                title: '未知的步驟類型',
                message: `${step.id || where} 的 type "${step.type}" 不在支援清單中。`,
                suggestion: `type 必須是 ${KNOWN_STEP_TYPES.join(' / ')} 之一。`,
                targets: [step.id || where]
            });
        }
        if (step.type === 'ground') groundCount += 1;
    });

    if (duplicates.size) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'DUPLICATE_ID',
            title: '步驟 id 重複',
            message: `以下 id 重複：${Array.from(duplicates).sort().join(', ')}`,
            suggestion: '請為每個 step 指定唯一 id。',
            targets: Array.from(duplicates)
        });
    }

    // 沒有基準點
    if (groundCount === 0) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'NO_GROUNDED_POINTS',
            title: '機構沒有基準點',
            message: '至少需要一個 type:"ground" 的固定點作為參考地面。',
            suggestion: '請加入至少一個 ground 步驟。',
            targets: ['topology.steps']
        });
    }

    // ── 階段 2：欄位與參照完整性 ──────────────────────────────
    steps.forEach((step, i) => {
        if (!step || !step.type || !KNOWN_STEP_TYPES.includes(step.type)) return;
        const tag = step.id || `steps[${i}]`;

        // 參照的點 id 必須存在
        const refFields = [...(REF_FIELDS[step.type] || [])];
        if (step.type === 'ground' && step.dist_param) refFields.push('ref_id');
        refFields.forEach((field) => {
            const refId = step[field];
            if (refId === undefined) {
                addHealthIssue(report, {
                    status: HealthStatus.FAIL,
                    code: 'STEP_FIELD_MISSING',
                    title: '步驟缺少必填欄位',
                    message: `${tag} (${step.type}) 缺少 "${field}"。`,
                    suggestion: `${step.type} 需要 ${field} 指向另一個點。`,
                    targets: [tag, field]
                });
            } else if (!idSet.has(refId)) {
                addHealthIssue(report, {
                    status: HealthStatus.FAIL,
                    code: 'UNKNOWN_REF',
                    title: '參照到不存在的點',
                    message: `${tag} (${step.type}) 的 ${field} 指向 "${refId}"，但沒有這個 id。`,
                    suggestion: '請確認被參照的點存在於 steps 中。',
                    targets: [tag, refId]
                });
            }
        });

        // 必須能取得的長度值
        (REQUIRED_VALS[step.type] || []).forEach((key) => {
            if (!valResolvable(topology, step, key)) {
                addHealthIssue(report, {
                    status: HealthStatus.WARN,
                    code: 'PARAM_NOT_DEFINED',
                    title: '參數無法解析',
                    message: `${tag} (${step.type}) 的 ${key} 取不到值（缺少 ${key}_param/${key}_val，或 params 沒定義）。`,
                    suggestion: `請在 params 中定義對應參數，或提供 ${key}_val。`,
                    targets: [tag, `${key}_param`]
                });
            }
        });

        // input_crank 需要 center（已在 refFields）與 len；joint/ground 座標檢查
        if (step.type === 'ground' && !step.dist_param) {
            const hasXY = step.x !== undefined || step.y !== undefined
                || step.x_param !== undefined || step.y_param !== undefined;
            if (!hasXY) {
                addHealthIssue(report, {
                    status: HealthStatus.WARN,
                    code: 'GROUND_NO_COORD',
                    title: 'ground 沒有座標',
                    message: `${tag} 沒有 x/y，將被視為原點 (0,0)。`,
                    suggestion: '請給定 x/y，或用 dist_param + ref_id 定義相對位置。',
                    targets: [tag]
                });
            }
        }
    });

    // ── 階段 3：tracePoint ────────────────────────────────────
    if (topology.tracePoint && !idSet.has(topology.tracePoint)) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'TRACE_POINT_NOT_IN_STEPS',
            title: '追蹤點不在 steps 中',
            message: `tracePoint "${topology.tracePoint}" 沒有對應到任何 step id。`,
            suggestion: '請指定一個存在的 step id 作為追蹤點。',
            targets: [topology.tracePoint]
        });
    }

    // 若已有結構 FAIL，不必再跑 solver（避免拿壞結構去算）
    if (report.counts.fail > 0 || !runSolver) {
        return finish(report);
    }

    // ── 階段 4：數值可行性（呼叫既有 solver）────────────────────
    let solution = null;
    try {
        const thetaDeg = Number(topology.params && topology.params.theta != null ? topology.params.theta : 0);
        solution = solveTopology(topology, { thetaDeg });
    } catch (e) {
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: 'SOLVER_THREW',
            title: '求解時發生例外',
            message: `solver 拋出錯誤：${e && e.message ? e.message : e}`,
            suggestion: '請檢查步驟順序與參照是否形成可建構的幾何。',
            targets: ['solution']
        });
        return finish(report);
    }

    if (!solution || solution.isValid === false) {
        const invalidTopo = solution && solution.errorType === 'invalid_topology';
        addHealthIssue(report, {
            status: HealthStatus.FAIL,
            code: invalidTopo ? 'INVALID_TOPOLOGY' : 'INFEASIBLE_GEOMETRY',
            title: invalidTopo ? '拓樸無法求解' : '幾何無解（機構卡死）',
            message: solution && solution.errorReason
                ? `求解失敗：${solution.errorReason}`
                : '目前的桿長/配置無法形成有效解，機構在此角度卡死或閉不起來。',
            suggestion: '請調整桿長比例、固定點距離或驅動方式，使各步驟都能求出交點。',
            targets: ['solution']
        });
        return finish(report);
    }

    // 解出來了，但追蹤點沒被算出來
    if (topology.tracePoint && solution.points && solution.points[topology.tracePoint] === undefined) {
        addHealthIssue(report, {
            status: HealthStatus.WARN,
            code: 'TRACE_POINT_UNRESOLVED',
            title: '追蹤點未被求解',
            message: `tracePoint "${topology.tracePoint}" 在求解結果中沒有座標。`,
            suggestion: '請確認追蹤點是可被建構出來的節點。',
            targets: [topology.tracePoint]
        });
    }

    return finish(report);
}

function finish(report) {
    return {
        status: report.status,
        issues: report.issues,
        counts: report.counts,
        sanitySummary: buildSanitySummary(report)
    };
}
