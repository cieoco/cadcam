/**
 * Bar Drawer Visualization - Perfect Individual Size Memory
 */
import { svgEl, $ } from '../utils.js';

const holeSizeCache = new Map();
const slotWidthCache = new Map();
const fixedHoleSizeCache = new Map();

function normalizeCoord(value) {
    if (!Number.isFinite(value)) return '';
    return value.toFixed(3).replace(/\.?0+$/, '');
}

function holeKey(x, y) {
    return `${normalizeCoord(x)},${normalizeCoord(y)}`;
}

export function renderBar(sol, theta, trajectory, viewParams) {
    // 1. ?ñÂ??∫Á??ÉÊï∏
    const L = Number(sol.barL) || 100;
    const W = Number(sol.barW) || 20;
    const currentBrushD = Number(sol.holeD) || 3.2; // ‰ΩúÁÇ∫?∞Áπ™Ë£ΩÁ??êË®≠Â§ßÂ?
    const margin = Number(sol.margin) || 10;

    // ?ºÁ?Ë®≠Â?
    const gridInt = Number(sol.gridInterval) || 10;
    const snap = sol.snapToGrid === true;

    // 2. ?´Â?Ê®ôÁ´øË®≠Â?
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

    // 3. ?åÊôØ?ºÁ?
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

    // 4. Ê°ø‰ª∂‰∏ªÈ?
    const r = sol.barStyle === 'rounded' ? (W / 2) * scale : 0;
    svg.appendChild(svgEl('rect', {
        x: tx(0), y: ty(0), width: L * scale, height: W * scale,
        rx: r, ry: r, fill: 'rgba(52, 152, 219, 0.15)', stroke: '#2c3e50', 'stroke-width': 1.5
    }));

    // 5. Ê®ôË®ªË™™Ê?
    const labelStyle = 'font-size: 13px; fill: #7f8c8d; font-family: sans-serif; font-weight: bold; pointer-events: none;';
    svg.appendChild(svgEl('text', { x: tx(0), y: ty(0) - 12, style: labelStyle, 'text-anchor': 'middle' })).textContent = "0";
    svg.appendChild(svgEl('text', { x: tx(L), y: ty(0) - 12, style: labelStyle, 'text-anchor': 'middle' })).textContent = L.toFixed(0);

    // 6. Ê∏≤Ê?Â≠î‰? (?ØÊè¥ÂÆåÂÖ®?®Á?Â∞∫ÂØ∏)
    const extraHolesInput = sol.extraHoles || "";
    // ?∫Â?Â≠î‰?Ôºö‰??¶Â?ÂßãÊ∏≤?ìÂ∞±‰∏çÊ???globalHoleD ?πË?Ôºå‰??∫‰?Á∞°Â?ÔºåÊ??ëÂ?ËÆìÂ??ëÁç®Á´ãÈ°ØÁ§?
    // Â¶ÇÊ??≥Ë??∫Â?Â≠î‰??®Á?ÔºåÂèØ‰ª•Âú®?ôË£°ÂØ´Ê≠ª?ñÂ? params ?≥ÂÖ•
    // ?ÆÂ??èËºØÔºöÂõ∫ÂÆöÂ?‰Ωç‰?‰ΩøÁî® currentBrushDÔºåÈô§?ûÊ??ëÂ??•È?Â∞çÂõ∫ÂÆöÂ??ÑÂ???
    // ‰ΩÜ‰Ωø?®ËÄÖÊ??∞Á??åÈÄ???çÈÄöÂ∏∏?ØÊ?È°çÂ?Â≠î‰???
    // ?∫‰?ÂæπÂ??∑È?ÔºåÊ??ëÂèØ‰ª•Ê? margin Â≠î‰?Ë¶ñÁÇ∫?åÂèØÁ∑®ËºØ?çÁ?ÔºåÊ??ÖÁµ¶ÂÆÉÂÄëÂñÆ?®Á??ÉÊï∏??
    // ?®Ê≠§?ëÂÄëÁ∂≠?ÅÂõ∫ÂÆöÂ?‰ΩøÁî®?®Â? DÔºå‰?È°çÂ?Â≠îÂº∑?∂È?ÂÆö„Ä?

    const leftKey = holeKey(margin, W / 2);
    const rightKey = holeKey(L - margin, W / 2);
    const leftD = fixedHoleSizeCache.has(leftKey) ? fixedHoleSizeCache.get(leftKey) : currentBrushD;
    const rightD = fixedHoleSizeCache.has(rightKey) ? fixedHoleSizeCache.get(rightKey) : currentBrushD;
    if (!fixedHoleSizeCache.has(leftKey)) fixedHoleSizeCache.set(leftKey, leftD);
    if (!fixedHoleSizeCache.has(rightKey)) fixedHoleSizeCache.set(rightKey, rightD);

    const holes = [
        { x: margin, y: W / 2, d: leftD, fixed: true, id: 'FIX_L' },
        { x: L - margin, y: W / 2, d: rightD, fixed: true, id: 'FIX_R' }
    ];
    if (extraHolesInput) {
    const parts = extraHolesInput.split(';');

    parts.forEach((p) => {
        const c = p.split(',').map(s => parseFloat(s.trim()));
        if (c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
            const key = holeKey(c[0], c[1]);
            let d;
            if (c.length >= 3 && !isNaN(c[2])) {
                d = c[2];
                holeSizeCache.set(key, d);
            } else if (holeSizeCache.has(key)) {
                d = holeSizeCache.get(key);
            } else {
                d = currentBrushD;
                holeSizeCache.set(key, d);
            }
            holes.push({ x: c[0], y: c[1], d: d, fixed: false, raw: p.trim() });
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
        t.textContent = `?${h.d.toFixed(1)}`;
        hGroup.appendChild(t);
        if (!h.fixed) hGroup.onclick = (e) => { e.stopPropagation(); removeElement('hole', h.raw); };
        svg.appendChild(hGroup);
    });

    // 7. Ê∏≤Ê?Â∞éË?Êß?(?ØÊè¥ÂÆåÂÖ®?®Á?ÂØ¨Â∫¶)
    // ?åÊ®£?ÑÈ?ËºØÈÅ©?®ÊñºÊß?
    const extraSlotsInput = sol.extraSlots || "";
    const slots = [];
    if (extraSlotsInput) {
    extraSlotsInput.split(';').forEach(p => {
        const c = p.split(',').map(s => parseFloat(s.trim()));
        if (c.length >= 3 && !isNaN(c[0]) && !isNaN(c[1]) && !isNaN(c[2])) {
            const key = holeKey(c[0], c[1]);
            let w;
            if (c.length >= 4 && !isNaN(c[3])) {
                w = c[3];
                slotWidthCache.set(key, w);
            } else if (slotWidthCache.has(key)) {
                w = slotWidthCache.get(key);
            } else {
                w = currentBrushD;
                slotWidthCache.set(key, w);
            }
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

    // 8. Â∫ßÊ??á‰???
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
            const modeName = currentMode === 'hole' ? `?∞Â? ?${currentD} Â≠î` : `?∞Â? W:${currentD} ÊßΩ`;
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
    // Âº∑Â^∂Â∞?Á>Æ?çÂ∞∫ÂØ∏ÂØ´?•Â?‰∏≤Ô?ÂØ¶Áèæ?OÂ?Áµê„??
    const newData = mode === 'hole' ? `${x},${y},${d}` : `${x},${y},${len},${d}`;
    input.value = val ? `${val}; ${newData}` : newData;
    $('btnUpdate').click();
}

function removeElement(mode, rawString) {
    const id = mode === 'hole' ? 'extraHoles' : 'extraSlots';
    const input = $(id); if (!input) return;
    const raw = rawString.trim();
    const c = raw.split(',').map(s => parseFloat(s.trim()));
    if (c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])) {
        const key = holeKey(c[0], c[1]);
        if (mode === 'hole') {
            holeSizeCache.delete(key);
        } else {
            slotWidthCache.delete(key);
        }
    }
    let parts = input.value.split(';').map(p => p.trim()).filter(p => p !== '');
    // ?¥Êé•ÊØîÂ??üÂ?Â≠ó‰∏≤?≤Ë??™Èô§ÔºåÊ??∫Á≤æÁ¢?
    parts = parts.filter(p => p !== raw);
    input.value = parts.join('; ');
    $('btnUpdate').click();
}

