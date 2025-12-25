/**
 * Bar Drawer Visualization - Perfect Individual Size Memory
 */
import { svgEl, $ } from '../utils.js';

export function renderBar(sol, theta, trajectory, viewParams) {
    // 1. 取得基礎參數
    const L = Number(sol.barL) || 100;
    const W = Number(sol.barW) || 20;
    const currentBrushD = Number(sol.holeD) || 3.2; // 作為新繪製的預設大小
    const margin = Number(sol.margin) || 10;

    // 格線設定
    const gridInt = Number(sol.gridInterval) || 10;
    const snap = sol.snapToGrid === true;

    // 2. 畫布標竿設定
    const SVG_W = 800;
    const SVG_H = 600;
    const viewRange = Number(viewParams.viewRange) || 400;
    const showGrid = viewParams.showGrid !== false;
    const scale = Math.min(SVG_W - 50, SVG_H - 50) / viewRange;

    function tx(x) { return SVG_W / 2 + (x - L / 2) * scale; }
    function ty(y) { return SVG_H / 2 + (y - W / 2) * scale; }

    const svg = svgEl('svg', {
        width: SVG_W,
        height: SVG_H,
        viewBox: `0 0 ${SVG_W} ${SVG_H}`,
        style: 'background: #f8f9fa; cursor: crosshair; user-select: none; border-radius: 8px;',
        id: 'barSvg'
    });

    // 3. 背景格線
    if (showGrid) {
        const gridGroup = svgEl('g', { stroke: '#e9ecef', 'stroke-width': 0.5 });
        const startVal = Math.floor(-viewRange / 2 / gridInt) * gridInt;
        const endVal = Math.ceil(viewRange / 2 / gridInt) * gridInt;
        for (let gv = startVal; gv <= endVal; gv += gridInt) {
            const sx = SVG_W / 2 + gv * scale;
            gridGroup.appendChild(svgEl('line', { x1: sx, y1: 0, x2: sx, y2: SVG_H }));
            const sy = SVG_H / 2 + gv * scale;
            gridGroup.appendChild(svgEl('line', { x1: 0, y1: sy, x2: SVG_W, y2: sy }));
        }
        svg.appendChild(gridGroup);
    }

    // 4. 桿件主體
    const r = sol.barStyle === 'rounded' ? (W / 2) * scale : 0;
    svg.appendChild(svgEl('rect', {
        x: tx(0), y: ty(0), width: L * scale, height: W * scale,
        rx: r, ry: r, fill: 'rgba(52, 152, 219, 0.15)', stroke: '#2c3e50', 'stroke-width': 1.5
    }));

    // 5. 標註說明
    const labelStyle = 'font-size: 13px; fill: #7f8c8d; font-family: sans-serif; font-weight: bold; pointer-events: none;';
    svg.appendChild(svgEl('text', { x: tx(0), y: ty(0) - 12, style: labelStyle, 'text-anchor': 'middle' })).textContent = "0";
    svg.appendChild(svgEl('text', { x: tx(L), y: ty(0) - 12, style: labelStyle, 'text-anchor': 'middle' })).textContent = L.toFixed(0);

    // 6. 渲染孔位 (支援完全獨立尺寸)
    const extraHolesInput = sol.extraHoles || "";
    // 固定孔位：一旦初始渲染就不應隨 globalHoleD 改變，但為了簡化，我們先讓它們獨立顯示
    // 如果想要固定孔也獨立，可以在這裡寫死或從 params 傳入
    // 目前邏輯：固定孔位仍使用 currentBrushD，除非我們引入針對固定孔的參數
    // 但使用者提到的「連動」通常是指額外孔位。
    // 為了徹底斷開，我們可以把 margin 孔也視為「可編輯」的，或者給它們單獨的參數。
    // 在此我們維持固定孔使用全域 D，但額外孔強制鎖定。

    const holes = [
        { x: margin, y: W / 2, d: currentBrushD, fixed: true, id: 'FIX_L' },
        { x: L - margin, y: W / 2, d: currentBrushD, fixed: true, id: 'FIX_R' }
    ];

    if (extraHolesInput) {
        const parts = extraHolesInput.split(';');

        parts.forEach((p, idx) => {
            const c = p.split(',').map(s => parseFloat(s.trim()));
            if (c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
                let d;
                if (c.length >= 3 && !isNaN(c[2])) {
                    d = c[2]; // 已有鎖定尺寸
                } else {
                    // 舊數據沒有尺寸，使用當前尺寸並標記需要更新
                    d = currentBrushD;
                }
                holes.push({ x: c[0], y: c[1], d: d, fixed: false, raw: p.trim() }); // 使用原始 trim 字串來做刪除索引
            }
        });
    }

    holes.forEach(h => {
        const hGroup = svgEl('g', { style: 'cursor: pointer' });
        hGroup.appendChild(svgEl('circle', {
            cx: tx(h.x), cy: ty(h.y), r: (h.d / 2) * scale,
            fill: h.fixed ? '#e74c3c' : '#3498db', stroke: '#fff', 'stroke-width': 1
        }));
        const t = svgEl('text', { x: tx(h.x), y: ty(h.y) + (h.d / 2) * scale + 14, style: 'font-size: 9px; fill: #2c3e50; font-family: monospace; font-weight: bold;', 'text-anchor': 'middle' });
        t.textContent = `Ø${h.d.toFixed(1)}`;
        hGroup.appendChild(t);
        if (!h.fixed) hGroup.onclick = (e) => { e.stopPropagation(); removeElement('hole', h.raw); };
        svg.appendChild(hGroup);
    });

    // 7. 渲染導軌槽 (支援完全獨立寬度)
    // 同樣的邏輯適用於槽
    const extraSlotsInput = sol.extraSlots || "";
    const slots = [];
    if (extraSlotsInput) {
        extraSlotsInput.split(';').forEach(p => {
            const c = p.split(',').map(s => parseFloat(s.trim()));
            if (c.length >= 3 && !isNaN(c[0]) && !isNaN(c[1]) && !isNaN(c[2])) {
                const w = (c.length >= 4 && !isNaN(c[3])) ? c[3] : currentBrushD;
                slots.push({ x: c[0], y: c[1], len: c[2], w: w, raw: p.trim() });
            }
        });
    }
    slots.forEach(s => {
        const sGroup = svgEl('g', { style: 'cursor: pointer' });
        const sw = s.len * scale;
        const sh = s.w * scale;
        sGroup.appendChild(svgEl('rect', {
            x: tx(s.x - s.len / 2), y: ty(s.y - s.w / 2), width: sw, height: sh,
            rx: sh / 2, ry: sh / 2, fill: 'rgba(39, 174, 96, 0.85)', stroke: '#fff', 'stroke-width': 1
        }));
        const t = svgEl('text', { x: tx(s.x), y: ty(s.y) + sh / 2 + 14, style: 'font-size: 9px; fill: #27ae60; font-family: monospace; font-weight: bold;', 'text-anchor': 'middle' });
        t.textContent = `W:${s.w.toFixed(1)}`;
        sGroup.appendChild(t);
        sGroup.onclick = (e) => { e.stopPropagation(); removeElement('slot', s.raw); };
        svg.appendChild(sGroup);
    });

    // 8. 座標與互動
    const cursorLabel = svgEl('text', { x: 0, y: 0, style: 'font-size: 13px; fill: #e67e22; font-family: monospace; font-weight: bold; pointer-events: none; visibility: hidden; filter: drop-shadow(0 0 2px white);', id: 'cursor-label' });
    svg.appendChild(cursorLabel);

    function getModelCoords(e) {
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const local = pt.matrixTransform(svg.getScreenCTM().inverse());
        let bx = ((local.x - SVG_W / 2) / scale + L / 2);
        let by = ((local.y - SVG_H / 2) / scale + W / 2);
        if (snap) { bx = Math.round(bx / gridInt) * gridInt; by = Math.round(by / gridInt) * gridInt; }
        else { bx = Math.round(bx * 10) / 10; by = Math.round(by * 10) / 10; }
        return { bx, by, lx: local.x, ly: local.y };
    }

    svg.onmousemove = (e) => {
        const { bx, by, lx, ly } = getModelCoords(e);
        const currentMode = $('drawMode')?.value || 'hole';
        const currentSlotL = $('slotL')?.value || 20;
        const currentD = $('holeD')?.value || 3.2;

        if (bx >= 0 && bx <= L && by >= 0 && by <= W) {
            cursorLabel.style.visibility = 'visible'; cursorLabel.setAttribute('x', lx + 12); cursorLabel.setAttribute('y', ly - 12);
            const modeName = currentMode === 'hole' ? `新增 Ø${currentD} 孔` : `新增 W:${currentD} 槽`;
            cursorLabel.textContent = `${modeName}: (${bx}, ${by})`;
        } else { cursorLabel.style.visibility = 'hidden'; }
    };

    svg.onclick = (e) => {
        const { bx, by } = getModelCoords(e);
        if (bx >= 0 && bx <= L && by >= 0 && by <= W) {
            const currentMode = $('drawMode')?.value || 'hole';
            const currentSlotL = $('slotL')?.value || 20;
            const currentD = $('holeD')?.value || 3.2;
            addElement(currentMode, bx, by, currentSlotL, currentD);
        }
    };

    return svg;
}

function addElement(mode, x, y, len, d) {
    const id = mode === 'hole' ? 'extraHoles' : 'extraSlots';
    const input = $(id); if (!input) return;
    let val = input.value.trim();
    // 強制將目前尺寸寫入字串，實現「凍結」
    const newData = mode === 'hole' ? `${x},${y},${d}` : `${x},${y},${len},${d}`;
    input.value = val ? `${val}; ${newData}` : newData;
    $('btnUpdate').click();
}

function removeElement(mode, rawString) {
    const id = mode === 'hole' ? 'extraHoles' : 'extraSlots';
    const input = $(id); if (!input) return;
    let parts = input.value.split(';').map(p => p.trim()).filter(p => p !== '');
    // 直接比對原始字串進行刪除，最為精確
    parts = parts.filter(p => p !== rawString.trim());
    input.value = parts.join('; ');
    $('btnUpdate').click();
}
