/**
 * Health Report Helpers
 * 統一檢核/分析/警告輸出格式
 */

export const HealthStatus = {
    PASS: 'pass',
    WARN: 'warn',
    FAIL: 'fail'
};

const STATUS_WEIGHT = {
    [HealthStatus.PASS]: 0,
    [HealthStatus.WARN]: 1,
    [HealthStatus.FAIL]: 2
};

function normalizeStatus(status) {
    if (status === HealthStatus.FAIL) return HealthStatus.FAIL;
    if (status === HealthStatus.WARN) return HealthStatus.WARN;
    return HealthStatus.PASS;
}

export function createHealthIssue({
    status = HealthStatus.WARN,
    code = 'unknown',
    title = '',
    message = '',
    suggestion = '',
    severity = null,
    targets = []
} = {}) {
    const normalizedStatus = normalizeStatus(status);
    return {
        status: normalizedStatus,
        code: String(code || 'unknown'),
        title: String(title || ''),
        message: String(message || ''),
        suggestion: String(suggestion || ''),
        severity: severity == null ? STATUS_WEIGHT[normalizedStatus] + 1 : Number(severity),
        targets: Array.isArray(targets) ? targets.filter(Boolean) : []
    };
}

export function createHealthReport(seed = {}) {
    const issues = Array.isArray(seed.issues) ? seed.issues.map((issue) => createHealthIssue(issue)) : [];
    const report = {
        status: HealthStatus.PASS,
        issues,
        counts: {
            pass: 0,
            warn: 0,
            fail: 0
        }
    };
    return finalizeHealthReport(report);
}

export function addHealthIssue(report, issue) {
    if (!report || !Array.isArray(report.issues)) return report;
    report.issues.push(createHealthIssue(issue));
    return finalizeHealthReport(report);
}

export function mergeHealthReports(...reports) {
    const merged = createHealthReport();
    reports.forEach((report) => {
        if (!report || !Array.isArray(report.issues)) return;
        report.issues.forEach((issue) => {
            merged.issues.push(createHealthIssue(issue));
        });
    });
    return finalizeHealthReport(merged);
}

export function finalizeHealthReport(report) {
    const counts = {
        pass: 0,
        warn: 0,
        fail: 0
    };
    let status = HealthStatus.PASS;

    (report.issues || []).forEach((issue) => {
        const normalizedStatus = normalizeStatus(issue.status);
        issue.status = normalizedStatus;
        counts[normalizedStatus] += 1;
        if (STATUS_WEIGHT[normalizedStatus] > STATUS_WEIGHT[status]) {
            status = normalizedStatus;
        }
    });

    report.status = status;
    report.counts = counts;
    return report;
}

export function buildSanitySummary(report) {
    const safeReport = report && Array.isArray(report.issues) ? report : createHealthReport();
    const leadIssue = safeReport.issues.find((issue) => issue.status === HealthStatus.FAIL)
        || safeReport.issues.find((issue) => issue.status === HealthStatus.WARN)
        || null;

    return {
        status: safeReport.status,
        issueCount: safeReport.issues.length,
        counts: safeReport.counts,
        leadCode: leadIssue ? leadIssue.code : null,
        leadMessage: leadIssue ? (leadIssue.message || leadIssue.title) : ''
    };
}

