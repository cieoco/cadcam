/**
 * Parallelogram Mechanism Parts Generator
 * 平行四邊形機構零件生成
 */

export function generateParallelogramParts({
    a,
    b,
    barW = 15,
    margin = 7,
    holeD = 3.2,
    spacing = 10,
    barStyle = 'rounded',
    workX = 300,
    workY = 180
}) {
    const parts = [];
    const A_val = Number(a);
    const B_val = Number(b);
    const W_val = Number(barW);
    const M_val = Number(margin);
    const D_val = Number(holeD);
    const S_val = Number(spacing);

    // 1. 長邊桿 (a) - 2 根 (Ground 雖然通常是底座，但這裡也生成一根作為參考或實際零件)
    // 一根是 Coupler (上方)，一根是 Ground (下方，如果需要實體化)
    for (let i = 0; i < 2; i++) {
        parts.push({
            id: `bar_a_${i}`,
            name: i === 0 ? '連動長桿 (Coupler a)' : '底座長桿 (Ground a)',
            barStyle: barStyle,
            L: A_val,
            width: W_val,
            rect: { x: 0, y: 0, w: A_val + 2 * M_val, h: W_val },
            holes: [
                { x: M_val, y: W_val / 2 },
                { x: M_val + A_val, y: W_val / 2 }
            ],
            holeD: D_val,
            color: '#3498db'
        });
    }

    // 2. 短邊桿 (b) - 2 根 (Input 與 Output)
    for (let i = 0; i < 2; i++) {
        parts.push({
            id: `bar_b_${i}`,
            name: i === 0 ? '輸入短桿 (Input b)' : '輸出短桿 (Output b)',
            barStyle: barStyle,
            L: B_val,
            width: W_val,
            rect: { x: 0, y: 0, w: B_val + 2 * M_val, h: W_val },
            holes: [
                { x: M_val, y: W_val / 2 },
                { x: M_val + B_val, y: W_val / 2 }
            ],
            holeD: D_val,
            color: '#e74c3c'
        });
    }

    // --- 自動排版邏輯 ---
    let xCursor = 10;
    let yCursor = 10;
    let rowH = 0;

    for (const p of parts) {
        if (xCursor + p.rect.w + S_val > workX) {
            xCursor = 10;
            yCursor += rowH + S_val;
            rowH = 0;
        }

        const moveX = xCursor - p.rect.x;
        const moveY = yCursor - p.rect.y;

        p.rect.x += moveX;
        p.rect.y += moveY;
        for (const h of p.holes) {
            h.x += moveX;
            h.y += moveY;
        }

        rowH = Math.max(rowH, p.rect.h);
        xCursor += p.rect.w + S_val;

        if (yCursor + p.rect.h > workY) {
            console.warn(`零件 ${p.id} 超出工作區範圍！`);
        }
    }

    return parts;
}
