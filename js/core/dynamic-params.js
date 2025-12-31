/**
 * Dynamic Params Collector
 * 動態參數掃描/分組
 */

export function collectDynamicParamSpec(modsConfig, topologyObj) {
    const vars = new Map();

    if (modsConfig && Array.isArray(modsConfig.parameters)) {
        modsConfig.parameters.forEach(p => {
            if (p.isDynamic) {
                vars.set(p.id, {
                    label: p.label,
                    min: p.min ?? 0,
                    max: p.max ?? 300,
                    step: p.step ?? 0.1,
                    default: p.default ?? 50
                });
            }
        });
    }

    if (topologyObj) {
        const topology = topologyObj;

        const scan = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                obj.forEach(item => scan(item));
                return;
            }
            for (const k in obj) {
                const val = obj[k];
                const isParamKey = k.endsWith('_param') || k === 'lenParam' || k === 'len_param' || k === 'r1Param' || k === 'r2Param' || k === 'angleParam' || k === 'distParam' || k === 'dist_param';
                if (isParamKey && typeof val === 'string') {
                    if (val && !vars.has(val)) {
                        const actualVal = (topology.params && topology.params[val] !== undefined) ? topology.params[val] : 100;
                        vars.set(val, {
                            label: val,
                            min: 0,
                            max: 500,
                            step: 0.5,
                            default: actualVal
                        });
                    }
                } else if (val && typeof val === 'object') {
                    scan(val);
                }
            }
        };
        scan(topology);

        if (topology.params) {
            Object.keys(topology.params).forEach(k => {
                if (k === 'theta' || k === 'thetaDeg') return;
                if (!vars.has(k)) {
                    vars.set(k, {
                        label: k,
                        min: 0,
                        max: 500,
                        step: 1,
                        default: topology.params[k] || 100
                    });
                }
            });
        }
    }

    const groups = [];
    if (topologyObj && Array.isArray(topologyObj._wizard_data)) {
        topologyObj._wizard_data.forEach(comp => {
            if (comp.type !== 'triangle' && comp.type !== 'slider' && comp.type !== 'bar') return;
            let params = [];
            if (comp.type === 'triangle') {
                params = [comp.r1Param, comp.r2Param, comp.gParam];
            } else if (comp.type === 'slider') {
                params = [comp.lenParam, comp.trackLenParam, comp.trackOffsetParam];
            } else if (comp.type === 'bar' && comp.holes && comp.holes.length) {
                params = [comp.lenParam, ...comp.holes.map(h => h.distParam)];
            }
            params = params.filter(p => p && vars.has(p));
            if (params.length) {
                groups.push({ id: comp.id, params });
            }
        });
    }

    return { vars, groups };
}
