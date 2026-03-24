/**
 * Diagnostics Panel Renderer
 * 將 validationReport / sanitySummary 顯示為簡潔診斷面板
 */

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getStatusMeta(status) {
    if (status === 'fail') {
        return {
            label: 'FAIL',
            color: '#ff4d4d',
            bg: '#fff5f5',
            border: '#ffc9c9'
        };
    }
    if (status === 'warn') {
        return {
            label: 'WARN',
            color: '#b7791f',
            bg: '#fffaf0',
            border: '#fbd38d'
        };
    }
    return {
        label: 'PASS',
        color: '#1f7a4d',
        bg: '#f0fff4',
        border: '#9ae6b4'
    };
}

export function renderDiagnosticsPanel(container, validationReport, sanitySummary) {
    if (!container) return;

    const summary = sanitySummary || {
        status: 'pass',
        issueCount: 0,
        counts: { pass: 0, warn: 0, fail: 0 },
        leadMessage: ''
    };
    const report = validationReport || { issues: [] };
    const meta = getStatusMeta(summary.status);
    const issues = Array.isArray(report.issues) ? report.issues.slice(0, 6) : [];

    const issueHtml = issues.length
        ? issues.map((issue) => {
            const issueMeta = getStatusMeta(issue.status);
            const suggestion = issue.suggestion
                ? `<div style="margin-top:4px; color:#666;">建議：${escapeHtml(issue.suggestion)}</div>`
                : '';
            return `
                <div style="padding:8px 10px; border:1px solid ${issueMeta.border}; border-radius:8px; background:${issueMeta.bg}; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
                        <strong style="font-size:12px; color:${issueMeta.color};">${escapeHtml(issue.title || issue.code)}</strong>
                        <span style="font-size:10px; font-weight:bold; color:${issueMeta.color};">${issueMeta.label}</span>
                    </div>
                    <div style="margin-top:4px; font-size:12px; color:#333; line-height:1.45;">
                        ${escapeHtml(issue.message || '')}
                    </div>
                    ${suggestion}
                </div>
            `;
        }).join('')
        : `<div style="font-size:12px; color:#666;">目前沒有檢核問題。</div>`;

    const leadText = summary.leadMessage
        ? escapeHtml(summary.leadMessage)
        : '目前沒有明顯檢核異常。';

    container.innerHTML = `
        <div class="card" style="padding:10px; background:#fff; border:1px solid ${meta.border};">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                <h3 style="margin:0; border:none; padding:0; font-size:14px;">設計檢核</h3>
                <span style="font-size:11px; font-weight:bold; color:${meta.color}; background:${meta.bg}; border:1px solid ${meta.border}; border-radius:999px; padding:3px 8px;">
                    ${meta.label}
                </span>
            </div>

            <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:6px; margin-bottom:10px;">
                <div style="padding:6px 8px; border:1px solid #eee; border-radius:6px; background:#fafafa; text-align:center;">
                    <div style="font-size:10px; color:#777;">Pass</div>
                    <div style="font-size:16px; font-weight:bold; color:#1f7a4d;">${summary.counts?.pass ?? 0}</div>
                </div>
                <div style="padding:6px 8px; border:1px solid #eee; border-radius:6px; background:#fafafa; text-align:center;">
                    <div style="font-size:10px; color:#777;">Warn</div>
                    <div style="font-size:16px; font-weight:bold; color:#b7791f;">${summary.counts?.warn ?? 0}</div>
                </div>
                <div style="padding:6px 8px; border:1px solid #eee; border-radius:6px; background:#fafafa; text-align:center;">
                    <div style="font-size:10px; color:#777;">Fail</div>
                    <div style="font-size:16px; font-weight:bold; color:#c53030;">${summary.counts?.fail ?? 0}</div>
                </div>
            </div>

            <div style="font-size:12px; color:#444; line-height:1.45; margin-bottom:10px;">
                <strong>摘要：</strong> ${leadText}
            </div>

            <div>
                ${issueHtml}
            </div>
        </div>
    `;
}

