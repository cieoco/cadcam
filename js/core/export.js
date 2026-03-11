/**
 * Export Core
 * DXF / mechanism.json 匯出整理
 */

import { validateConfig } from '../config.js';
import { buildDXF } from '../utils/dxf-generator.js';

function parseTopology(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }
    if (typeof raw === 'object') return raw;
    return null;
}

function cloneForJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function buildLinkageParts(topologyObj) {
    if (!topologyObj || !Array.isArray(topologyObj.parts)) return [];
    return topologyObj.parts.map((part, index) => ({
        id: part.id || `part_${index + 1}`,
        type: part.type || 'unknown',
        lenParam: part.len_param || null,
        lenParams: Array.isArray(part.len_params) ? [...part.len_params] : [],
        color: part.color || null
    }));
}

function buildMarkerHints(topologyObj) {
    if (!topologyObj || !Array.isArray(topologyObj._wizard_data)) return [];
    return topologyObj._wizard_data.map((item) => {
        if (item.type === 'bar') {
            return {
                componentId: item.id,
                type: 'bar',
                proximalJoint: item.p1?.id || null,
                distalJoint: item.p2?.id || null,
                lenParam: item.lenParam || null,
                isDriver: Boolean(item.isInput)
            };
        }
        if (item.type === 'triangle') {
            return {
                componentId: item.id,
                type: 'triangle',
                joints: [item.p1?.id || null, item.p2?.id || null, item.p3?.id || null].filter(Boolean),
                lenParams: [item.gParam || null, item.r1Param || null, item.r2Param || null].filter(Boolean),
                sign: item.sign ?? null
            };
        }
        return {
            componentId: item.id || null,
            type: item.type || 'unknown'
        };
    });
}

export function buildMechanismDocument({ mods, mech, partSpec, dynamicParams, solution, parts }) {
    if (!mods || !mods.config) return null;

    const mergedMech = { ...mech, ...(dynamicParams || {}) };
    const topologyObj = parseTopology(mergedMech.topology);
    const params = topologyObj && topologyObj.params
        ? { ...topologyObj.params, ...(dynamicParams || {}) }
        : { ...(dynamicParams || {}) };

    if (mergedMech.theta !== undefined && params.theta === undefined) {
        params.theta = Number(mergedMech.theta);
    }

    const mechanismDoc = {
        schema: 'com.tool.linkage.mechanism@1',
        source: {
            tool: 'linkage',
            mechanismId: mods.config.id,
            mechanismName: mods.config.name
        },
        units: 'mm',
        mechanism: {
            id: mods.config.id,
            name: mods.config.name,
            description: mods.config.description || ''
        },
        parameters: {
            motion: cloneForJson(params),
            partSpec: cloneForJson(partSpec || {}),
            driver: {
                thetaDeg: Number(mergedMech.theta ?? params.theta ?? 0),
                motorType: mergedMech.motorType || null,
                motorRotationDeg: Number(mergedMech.motorRotation || 0)
            }
        },
        topology: topologyObj ? {
            tracePoint: topologyObj.tracePoint || null,
            steps: cloneForJson(topologyObj.steps || []),
            visualization: cloneForJson(topologyObj.visualization || {}),
            parts: buildLinkageParts(topologyObj),
            wizardData: cloneForJson(topologyObj._wizard_data || [])
        } : null,
        generatedParts: cloneForJson(parts || []),
        solution: solution ? {
            isValid: solution.isValid !== false,
            points: cloneForJson(solution.points || {}),
            inputThetaDeg: Number(solution.inputTheta ?? mergedMech.theta ?? params.theta ?? 0),
            errorReason: solution.errorReason || null
        } : null,
        armHints: {
            intendedConsumer: 'arm',
            topologyType: mods.config.id,
            markerHints: buildMarkerHints(topologyObj)
        }
    };

    return mechanismDoc;
}

export function buildExportBundle({ mods, mech, partSpec, mfg, dynamicParams }) {
    if (!mods || !mods.config) return { files: [], dxfText: '', machiningInfo: '' };

    const mergedMech = { ...mech, ...(dynamicParams || {}) };
    validateConfig(mergedMech, partSpec, mfg);

    const solveFn = mods.solver[mods.config.solveFn];
    const sol = solveFn ? solveFn(mergedMech) : null;
    if (!sol || sol.isValid === false) {
        throw new Error("Invalid parameters, adjust values.");
    }

    const partsFn = mods.parts[mods.config.partsFn];
    const parts = partsFn ? partsFn({ ...mergedMech, ...partSpec }) : [];

    const dxfText = buildDXF(parts);
    const mechanismDoc = buildMechanismDocument({
        mods,
        mech,
        partSpec,
        dynamicParams,
        solution: sol,
        parts
    });
    const mechanismText = mechanismDoc ? JSON.stringify(mechanismDoc, null, 2) : '';
    const machiningInfo = `Linkage export ready.\n- 零件數量：${parts.length}\n- 輸出格式：DXF`;

    return { files: [], dxfText, mechanismDoc, mechanismText, machiningInfo };
}
