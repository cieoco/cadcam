/**
 * Slider-Crank Mechanism Parts Generator
 * 曲柄滑塊機構零件生成模組
 */

/**
 * 生成各零件的幾何規格
 * @param {Object} combinedParams 結合了 mech 與 partSpec 的物件
 */
export function generateSliderCrankParts({
    crankRadius,
    rodLength,
    crankWidth = 15,
    rodWidth = 15,
    sliderWidth = 40,
    sliderHeight = 20,
    holeD = 3.2,
    margin = 7,
    spacing = 10,
    barStyle = 'rounded',
    workX = 300,
    workY = 180
}) {
    const parts = [];

    // 1. 曲柄 (Crank Link) - 現在也是一個桿件
    const crankL = Number(crankRadius);
    const crankW = Number(crankWidth);
    parts.push({
        id: 'crank',
        name: '曲柄桿 (Crank Link)',
        barStyle: barStyle,
        L: crankL,
        width: crankW,
        rect: { x: 0, y: 0, w: crankL + 2 * margin, h: crankW },
        holes: [
            { x: margin, y: crankW / 2 },          // 中心旋轉孔
            { x: margin + crankL, y: crankW / 2 } // 連結連桿孔
        ],
        holeD: Number(holeD),
        color: '#e74c3c'
    });

    // 2. 連桿 (Rod)
    const rodL = Number(rodLength);
    const rodW = Number(rodWidth);
    parts.push({
        id: 'rod',
        name: '連桿 (Connecting Rod)',
        barStyle: barStyle,
        L: rodL,
        width: rodW,
        rect: { x: 0, y: 0, w: rodL + 2 * margin, h: rodW },
        holes: [
            { x: margin, y: rodW / 2 },
            { x: margin + rodL, y: rodW / 2 }
        ],
        holeD: Number(holeD),
        color: '#3498db'
    });

    // 3. 滑塊 (Slider) - 桿件化形狀，中心一孔
    const sW = Number(sliderWidth);
    const sH = Number(sliderHeight);
    parts.push({
        id: 'slider',
        name: '滑塊件 (Slider)',
        barStyle: barStyle, // 滑塊也跟隨桿件樣式 (Rounded or Rect)
        width: sW,
        height: sH,
        rect: { x: 0, y: 0, w: sW, h: sH },
        holes: [
            { x: sW / 2, y: sH / 2 }
        ],
        holeD: Number(holeD),
        color: '#27ae60'
    });

    // --- 簡單排版邏輯 ---
    let xCursor = 10;
    let yCursor = 10;
    let rowH = 0;

    for (const p of parts) {
        if (xCursor + p.rect.w + spacing > workX) {
            xCursor = 10;
            yCursor += rowH + spacing;
            rowH = 0;
        }

        // 更新零件座標
        const moveX = xCursor - p.rect.x;
        const moveY = yCursor - p.rect.y;

        p.rect.x += moveX;
        p.rect.y += moveY;
        for (const h of p.holes) {
            h.x += moveX;
            h.y += moveY;
        }

        rowH = Math.max(rowH, p.rect.h);
        xCursor += p.rect.w + spacing;

        if (yCursor + p.rect.h > workY) {
            console.warn(`零件 ${p.id} 超出工作區範圍！`);
        }
    }

    return parts;
}
