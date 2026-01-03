/**
 * Solver Status Helpers
 * 求解狀態判斷
 */

export function getAllPointIds(components) {
    const ids = new Set();
    components.forEach(c => {
        if (c.type === 'polygon' && c.points) {
            c.points.forEach(p => { if (p.id) ids.add(p.id); });
        } else {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].id) ids.add(c[k].id);
            });
        }
    });
    return Array.from(ids).sort();
}

export function getSolvedPointIds(components) {
    const solved = new Set();
    components.forEach(c => {
        if (c.type === 'polygon' && c.points) {
            c.points.forEach(p => { if (p.type === 'fixed' && p.id) solved.add(p.id); });
        } else {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].type === 'fixed' && c[k].id) solved.add(c[k].id);
            });
        }
    });

    let changed = true;
    while (changed) {
        changed = false;
        components.forEach(c => {
            if (c.type === 'bar' && c.isInput) {
                if (c.p1?.id && solved.has(c.p1.id) && c.p2?.id && !solved.has(c.p2.id)) {
                    solved.add(c.p2.id);
                    changed = true;
                }
            }
            if (c.type === 'triangle' || c.type === 'hole') {
                const p3Id = c.type === 'triangle' ? c.p3?.id : c.id;
                if (c.p1?.id && c.p2?.id && p3Id && solved.has(c.p1.id) && solved.has(c.p2.id) && !solved.has(p3Id)) {
                    solved.add(p3Id);
                    changed = true;
                }
            }
            if (c.type === 'slider') {
                const p1Id = c.p1?.id;
                const p2Id = c.p2?.id;
                const p3Id = c.p3?.id;
                if (p1Id && p2Id && p3Id && solved.has(p1Id) && solved.has(p2Id) && !solved.has(p3Id)) {
                    const driver = components.find(b => b.type === 'bar' && ((b.p1?.id === p3Id && solved.has(b.p2?.id)) || (b.p2?.id === p3Id && solved.has(b.p1?.id))));
                    if (driver) {
                        solved.add(p3Id);
                        changed = true;
                    }
                }
            }
            if (c.type === 'polygon' && c.points) {
                const solvedCount = c.points.filter(p => p.id && solved.has(p.id)).length;
                if (solvedCount >= 2) {
                    c.points.forEach(p => {
                        if (p.id && !solved.has(p.id)) {
                            solved.add(p.id);
                            changed = true;
                        }
                    });
                }
            }
        });

        const allPointIds = getAllPointIds(components);
        allPointIds.forEach(jId => {
            if (solved.has(jId)) return;
            const relatedBars = components.filter(c => c.type === 'bar' && !c.isInput && (c.p1.id === jId || c.p2.id === jId));
            const solvableConnections = relatedBars.filter(b => {
                const otherId = (b.p1.id === jId ? b.p2.id : b.p1.id);
                return solved.has(otherId);
            });
            if (solvableConnections.length >= 2) {
                solved.add(jId);
                changed = true;
            }
        });
    }
    return solved;
}

export function isComponentSolved(comp, solvedPoints) {
    if (comp.type === 'bar') {
        return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id);
    } else if (comp.type === 'triangle') {
        return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id) && solvedPoints.has(comp.p3?.id);
    } else if (comp.type === 'slider') {
        return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id) && solvedPoints.has(comp.p3?.id);
    }
    return false;
}

export function getUnsolvedSummary(components) {
    const solved = getSolvedPointIds(components);
    const lines = [];

    components.forEach(c => {
        if (c.type !== 'bar' && c.type !== 'triangle' && c.type !== 'slider') return;
        if (isComponentSolved(c, solved)) return;

        const pointKeys = c.type === 'bar' ? ['p1', 'p2'] : ['p1', 'p2', 'p3'];
        const missing = [];
        pointKeys.forEach(key => {
            const pt = c[key];
            if (!pt || !pt.id) {
                missing.push(`${key.toUpperCase()}未指定`);
                return;
            }
            if (!solved.has(pt.id)) {
                missing.push(pt.id);
            }
        });

        if (missing.length) {
            lines.push(`- ${c.id || c.type}: 缺少點位 ${missing.join(', ')}`);
        }
    });

    if (!lines.length) return '';
    return `未求解原因:\n${lines.join('\n')}`;
}
