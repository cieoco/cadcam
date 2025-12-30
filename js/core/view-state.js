/**
 * View State
 * UI 顯示狀態計算（不依賴 DOM）
 */

export function computeViewState({ previewState, showPartsPreview, expandedHeight, hasSvgChild }) {
    const showParts = Boolean(showPartsPreview);

    return {
        warningVisible: Boolean(previewState && previewState.isInvalid),
        thetaVisible: Boolean(previewState && previewState.showThetaSlider),
        fatalInvalid: Boolean(previewState && previewState.fatalInvalid),
        showInvalidPlaceholder: Boolean(previewState && previewState.fatalInvalid && !hasSvgChild),
        parts: {
            show: showParts,
            panelHeight: showParts ? (expandedHeight || '540px') : 'auto',
            bodyDisplay: showParts ? 'flex' : 'none'
        },
        dxfPreviewEnabled: Boolean(previewState && previewState.dxfPreviewText)
    };
}
