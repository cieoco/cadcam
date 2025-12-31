/**
 * Core Schemas
 * Engine I/O contracts (lightweight, non-validating)
 */

export const EnginePreviewInput = {
    mods: 'MechanismModules',
    mech: 'MechanismParams',
    partSpec: 'PartSpec',
    mfg: 'ManufacturingSpec',
    dynamicParams: 'Record<string, number>',
    lastState: '{ lastSolution, lastTopology }',
    showTrajectory: 'boolean',
    sweepParams: 'SweepParams | null',
    view: '{ showPartsPreview, expandedHeight, hasSvgChild }'
};

export const EnginePreviewOutput = {
    previewState: 'PreviewState',
    viewState: 'ViewState',
    lastState: '{ lastSolution, lastTopology }'
};

export const PreviewState = {
    solution: 'SolveResult | null',
    parts: 'Part[]',
    trajectoryData: 'TrajectoryData | null',
    isInvalid: 'boolean',
    fatalInvalid: 'boolean',
    statusMessage: 'string',
    previewLog: 'string',
    showThetaSlider: 'boolean',
    dxfPreviewText: 'string',
    dxfError: 'Error | null',
    errorType: 'string | null',
    restore: '{ theta, dynamicParams } | null',
    lastSolution: 'SolveResult | null',
    lastTopology: 'string | null'
};

export const ViewState = {
    warningVisible: 'boolean',
    thetaVisible: 'boolean',
    fatalInvalid: 'boolean',
    showInvalidPlaceholder: 'boolean',
    parts: '{ show, panelHeight, bodyDisplay }',
    dxfPreviewEnabled: 'boolean'
};

export const SweepState = {
    results: 'SweepPoint[]',
    validRanges: 'Range[]',
    invalidRanges: 'Range[]',
    validBPoints: 'Point[]',
    motorType: 'string'
};

export const ExportBundle = {
    files: 'Array<{ name, text }>',
    dxfText: 'string',
    machiningInfo: 'string'
};
