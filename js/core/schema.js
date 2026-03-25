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
    lastTopology: 'string | null',
    validationReport: 'HealthReport',
    sanitySummary: 'HealthSummary',
    templateGuidance: 'TemplateGuidance | null',
    motionAnalysis: 'MotionAnalysis | null'
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

export const HealthReport = {
    status: '"pass" | "warn" | "fail"',
    issues: 'HealthIssue[]',
    counts: '{ pass, warn, fail }'
};

export const HealthIssue = {
    status: '"pass" | "warn" | "fail"',
    code: 'string',
    title: 'string',
    message: 'string',
    suggestion: 'string',
    severity: 'number',
    targets: 'string[]'
};

export const HealthSummary = {
    status: '"pass" | "warn" | "fail"',
    issueCount: 'number',
    counts: '{ pass, warn, fail }',
    leadCode: 'string | null',
    leadMessage: 'string'
};

export const TemplateGuidance = {
    templateId: 'string',
    templateName: 'string',
    learningGoal: 'string',
    keyParams: 'string[]',
    commonFailure: 'string',
    nextStep: 'string',
    focusText: 'string',
    issueHint: 'string'
};

export const MotionAnalysis = {
    validPointCount: 'number',
    validRangeCount: 'number',
    invalidRangeCount: 'number',
    rangeX: 'number | null',
    rangeY: 'number | null',
    totalRange: 'number | null',
    pathLength: 'number | null',
    avgStepDistance: 'number | null',
    minStepDistance: 'number | null',
    minStepTheta: 'number | null',
    candidateAngles: 'number[]',
    likelyDeadCenter: 'boolean',
    leadText: 'string'
};
