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
