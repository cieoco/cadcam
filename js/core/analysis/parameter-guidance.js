/**
 * Parameter Guidance Helpers
 * 根據機構型態、範本與運動分析，給出最小可用的調參建議
 */

function pushSuggestion(target, id, reason, label = '') {
    if (!id || !reason) return;
    if (!target.some((entry) => entry.id === id && entry.reason === reason)) {
        target.push({
            id: String(id),
            label: String(label || id),
            reason: String(reason)
        });
    }
}

function normalizeTemplateParams(topology) {
    return topology && topology.params && typeof topology.params === 'object'
        ? topology.params
        : {};
}

function buildLeadText(suggestions) {
    if (!suggestions.length) return '';
    const ids = [];
    suggestions.forEach((entry) => {
        if (!ids.includes(entry.id)) ids.push(entry.id);
    });
    return ids.length ? `建議先調：${ids.join(' / ')}` : '';
}

function addFourbarGuidance(suggestions, mech, motionAnalysis) {
    const a = Number(mech.a);
    const b = Number(mech.b);
    const c = Number(mech.c);
    const d = Number(mech.d);

    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && b < a * 0.45) {
        pushSuggestion(suggestions, 'b', 'Input b 相對 ground a 偏小，輸出擺幅可能不夠。', 'Input b');
    }
    if (Number.isFinite(c) && Number.isFinite(a) && Number.isFinite(d) && c <= Math.abs(a - d) + 5) {
        pushSuggestion(suggestions, 'c', 'Coupler c 偏短，閉環容易在極限附近失效。', 'Coupler c');
    }
    if (motionAnalysis && motionAnalysis.likelyDeadCenter) {
        pushSuggestion(suggestions, 'a', 'Ground a 會直接影響可行區間，若常卡極限可先調整它。', 'Ground a');
        pushSuggestion(suggestions, 'd', 'Output d 也會影響死點位置，可和 a / c 一起微調。', 'Output d');
    }
}

function addSliderCrankGuidance(suggestions, mech, motionAnalysis) {
    const crankRadius = Number(mech.crankRadius);
    const rodLength = Number(mech.rodLength);

    if (Number.isFinite(crankRadius) && Number.isFinite(rodLength) && rodLength < crankRadius * 2.2) {
        pushSuggestion(suggestions, 'rodLength', '連桿長度 rodLength 偏短，容易在極限附近接近死點。', 'rodLength');
    }
    if (motionAnalysis && motionAnalysis.totalRange != null && motionAnalysis.totalRange < 15) {
        pushSuggestion(suggestions, 'crankRadius', '目前行程偏小，最直接可先增加 crankRadius。', 'crankRadius');
    }
    if (motionAnalysis && motionAnalysis.likelyDeadCenter) {
        pushSuggestion(suggestions, 'rodLength', '若掃描常卡邊界，可先增加 rodLength。', 'rodLength');
    }
}

function addRackPinionGuidance(suggestions, mech, motionAnalysis) {
    if (motionAnalysis && motionAnalysis.totalRange != null && motionAnalysis.totalRange < 15) {
        pushSuggestion(suggestions, 'pinionTeeth', '位移偏小時，可先調整 pinionTeeth。', 'pinionTeeth');
        pushSuggestion(suggestions, 'module', 'module 也會影響齒輪節徑與齒條位移。', 'module');
    }
}

function addTemplateGuidance(suggestions, topology, motionAnalysis) {
    const templateId = topology && topology._templateId ? String(topology._templateId) : '';
    const params = normalizeTemplateParams(topology);

    if (templateId === 'parallel-fourbar') {
        const r = Number(params.R);
        const l = Number(params.L);
        if (Number.isFinite(r) && Number.isFinite(l) && r < l * 0.45) {
            pushSuggestion(suggestions, 'R', 'R 相對 L 偏小時，平行四連桿的擺動量通常不明顯。', 'R');
        }
        pushSuggestion(suggestions, 'L', 'L 會直接影響 coupler 姿態與平移感，可和 R 一起調整。', 'L');
    }

    if (templateId === 'gripper') {
        const crank = Number(params.L_Crank);
        const coupler = Number(params.L_Coupler);
        const base = Number(params.L_FingerBase);
        const tip = Number(params.L_FingerTip);
        const side = Number(params.L_FingerSide);

        if (Number.isFinite(crank) && Number.isFinite(coupler) && crank < coupler * 0.45) {
            pushSuggestion(suggestions, 'L_Crank', 'L_Crank 偏小時，夾爪開合幅度通常會不明顯。', 'L_Crank');
        }
        if (Number.isFinite(base) && Number.isFinite(tip) && Number.isFinite(side) && base + tip <= side) {
            pushSuggestion(suggestions, 'L_FingerSide', 'Finger 三角形接近無法閉合，請先調整三角形邊長比例。', 'L_FingerSide');
            pushSuggestion(suggestions, 'L_FingerTip', 'FingerTip 與 FingerBase 的比例也可能需要一起修正。', 'L_FingerTip');
        }
        if (motionAnalysis && motionAnalysis.totalRange != null && motionAnalysis.totalRange < 20) {
            pushSuggestion(suggestions, 'L_Coupler', '若指尖行程不夠，通常可以先觀察 L_Coupler。', 'L_Coupler');
        }
    }

    if (templateId === 'slider-track') {
        const l1 = Number(params.L1);
        const l3 = Number(params.L3);
        if (Number.isFinite(l1) && Number.isFinite(l3) && l3 < l1 * 2) {
            pushSuggestion(suggestions, 'L3', 'L3 偏短時，滑塊在極限附近較容易失效。', 'L3');
        }
        pushSuggestion(suggestions, 'L1', '若行程不足，通常先從 L1 著手最直觀。', 'L1');
        pushSuggestion(suggestions, 'L2', 'L2 會影響滑軌基準與整體幾何比例。', 'L2');
    }
}

export function buildParameterGuidance({ mechId, mech = {}, topology = null, motionAnalysis = null } = {}) {
    const suggestions = [];

    if (mechId === 'fourbar') {
        addFourbarGuidance(suggestions, mech, motionAnalysis);
    } else if (mechId === 'crankslider') {
        addSliderCrankGuidance(suggestions, mech, motionAnalysis);
    } else if (mechId === 'rackpinion') {
        addRackPinionGuidance(suggestions, mech, motionAnalysis);
    }

    if (mechId === 'multilink') {
        addTemplateGuidance(suggestions, topology, motionAnalysis);
    }

    return {
        leadText: buildLeadText(suggestions),
        suggestedParams: suggestions.slice(0, 5)
    };
}
