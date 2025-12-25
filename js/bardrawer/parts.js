/**
 * Bar Drawer Parts Generator - Support for Holes and Slots with Individual Diameters
 */
export function generateBarParts(params) {
    const { barL, barW, holeD, margin, extraHoles, extraSlots, barStyle } = params;

    // 1. 基礎孔位 (兩端對稱孔使用全域孔徑)
    const holes = [
        { x: margin, y: barW / 2, d: holeD },
        { x: barL - margin, y: barW / 2, d: holeD }
    ];

    if (extraHoles) {
        extraHoles.split(';').forEach(p => {
            const c = p.split(',').map(s => parseFloat(s.trim()));
            if (c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
                // 如果座標中有第三個值則為該孔獨立直徑，否則回退到全局直徑
                const d = c.length >= 3 ? c[2] : holeD;
                holes.push({ x: c[0], y: c[1], d: d });
            }
        });
    }

    // 2. 導軌槽 (Slots)
    const slots = [];
    if (extraSlots) {
        extraSlots.split(';').forEach(p => {
            const c = p.split(',').map(s => parseFloat(s.trim()));
            if (c.length >= 3 && !isNaN(c[0]) && !isNaN(c[1]) && !isNaN(c[2])) {
                // c[3] 為該長槽獨立寬度，否則回退到全局孔徑
                const w = c.length >= 4 ? c[3] : holeD;
                slots.push({
                    x: c[0] - c[2] / 2,
                    y: c[1] - w / 2,
                    w: c[2],
                    h: w
                });
            }
        });
    }

    // 排版基準點
    const xCursor = 20, yCursor = 20;

    return [
        {
            id: "custom_bar",
            L: barL,
            barStyle: barStyle,
            rect: { x: xCursor, y: yCursor, w: barL, h: barW },
            // 這裡需要注意：目前 G-code 生成器對單一零件的 holes 陣列通常預設它是同一種大小
            // 如果 G-code 生成器不支援個別孔徑，我們至少在資料結構上準備好
            holes: holes.map(h => ({ x: xCursor + h.x, y: yCursor + h.y })),
            slots: slots.map(s => ({
                x: xCursor + s.x,
                y: yCursor + s.y,
                w: s.w,
                h: s.h
            })),
            holeD: holeD // 全域孔徑作為預設，或引導鑽孔用
        }
    ];
}
