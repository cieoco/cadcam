/**
 * Mechanism Engine Facade
 * 封裝核心計算入口，便於 UI 與測試共用
 */

import { computePreviewState } from './preview-state.js';
import { computeViewState } from './view-state.js';
import { computeSweepState } from './sweep-state.js';
import { buildExportBundle } from './export.js';
import { clampDynamicParam } from './param-constraints.js';

export function computeEnginePreview({
    mods,
    mech,
    partSpec,
    mfg,
    dynamicParams,
    lastState,
    showTrajectory,
    sweepParams,
    view
}) {
    const previewState = computePreviewState({
        mods,
        mech,
        partSpec,
        mfg,
        dynamicParams,
        lastSolution: lastState ? lastState.lastSolution : null,
        lastTopology: lastState ? lastState.lastTopology : null,
        showTrajectory,
        sweepParams
    });

    const viewState = computeViewState({
        previewState,
        showPartsPreview: view ? view.showPartsPreview : true,
        expandedHeight: view ? view.expandedHeight : null,
        hasSvgChild: view ? view.hasSvgChild : false
    });

    return {
        previewState,
        viewState,
        lastState: {
            lastSolution: previewState.lastSolution,
            lastTopology: previewState.lastTopology
        }
    };
}

export function computeEngineSweep({ mods, mech, partSpec, mfg, dynamicParams, sweepParams, motorTypeText }) {
    return computeSweepState({
        mods,
        mech,
        partSpec,
        mfg,
        dynamicParams,
        sweepParams,
        motorTypeText
    });
}

export function computeEngineExport({ mods, mech, partSpec, mfg, dynamicParams }) {
    return buildExportBundle({ mods, mech, partSpec, mfg, dynamicParams });
}

export function clampEngineParam({ mech, varId, value }) {
    return clampDynamicParam({ mech, varId, value });
}
