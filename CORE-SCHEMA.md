# Core Engine Schema

This document summarizes the core engine inputs/outputs used by UI and tests.

## Engine Preview

Input
- mods: mechanism modules (config, solver, parts, visualization)
- mech: mechanism parameters (includes topology)
- partSpec: part layout config
- mfg: manufacturing config
- dynamicParams: map of dynamic values
- lastState: { lastSolution, lastTopology }
- showTrajectory: boolean
- sweepParams: { sweepStart, sweepEnd, sweepStep } or null
- view: { showPartsPreview, expandedHeight, hasSvgChild }

Output
- previewState: see PreviewState
- viewState: see ViewState
- lastState: { lastSolution, lastTopology }

## PreviewState

Fields
- solution: solve result or null
- parts: array of part geometry
- trajectoryData: sweep result or null
- isInvalid: boolean
- fatalInvalid: boolean
- statusMessage: string
- previewLog: string
- showThetaSlider: boolean
- dxfPreviewText: string (empty if unavailable)
- dxfError: error or null
- errorType: string or null
- restore: { theta, dynamicParams } or null
- lastSolution: cached valid solution or null
- lastTopology: cached topology key or null

## ViewState

Fields
- warningVisible: boolean
- thetaVisible: boolean
- fatalInvalid: boolean
- showInvalidPlaceholder: boolean
- parts: { show, panelHeight, bodyDisplay }
- dxfPreviewEnabled: boolean

## SweepState

Fields
- results: array of sweep points
- validRanges: array of { start, end }
- invalidRanges: array of { start, end }
- validBPoints: array of points
- motorType: string

## ExportBundle

Fields
- files: array of { name, text }
- dxfText: string
- machiningInfo: string

## Blocks body-joint diagnostics

`solveTopology` 的 body-joint 結果增加選配 `unresolvedPointIds: string[]`，記錄 fallback 補畫之前仍無解的接點。`solveAssembly` 合併各模組的此清單；接點 ID 沿用原作品全域 ID。這是暫態診斷，不存入 Blocks snapshot，不改既有有效性／幾何求解規則。僅在 `isUnderconstrained` 時用來指出未受約束零件；fallback 有座標不等於已被約束。
