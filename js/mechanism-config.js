/**
 * Mechanism Configuration System
 * 機構配置系統 - 定義每種機構的特定參數和行為
 */

import { DRIVE_COMPONENTS, getDriveOptions } from './motor-data.js';


export const MECHANISMS = {
    fourbar: {
        id: 'fourbar',
        name: '四連桿機構',
        icon: '🔗',
        description: 'Four-Bar Linkage - 擺動輸出、軌跡控制',

        // 機構特定參數
        parameters: [
            {
                id: 'a',
                label: 'Ground a (O2-O4)',
                type: 'number',
                min: 10,
                max: 250,
                step: 1,
                default: 120,
                unit: 'mm',
                color: '#666',
                isDynamic: true
            },
            {
                id: 'b',
                label: 'Input b (O2-A)',
                type: 'number',
                min: 10,
                max: 250,
                step: 1,
                default: 60,
                unit: 'mm',
                color: '#e74c3c',
                isDynamic: true
            },
            {
                id: 'c',
                label: 'Coupler c (A-B)',
                type: 'number',
                min: 10,
                max: 250,
                step: 1,
                default: 110,
                unit: 'mm',
                color: '#3498db',
                isDynamic: true
            },
            {
                id: 'd',
                label: 'Output d (B-O4)',
                type: 'number',
                min: 10,
                max: 250,
                step: 1,
                default: 80,
                unit: 'mm',
                color: '#27ae60',
                isDynamic: true
            },
            {
                id: 'assembly',
                label: '解型態',
                type: 'select',
                options: [
                    { value: 'open', label: 'open（常見）' },
                    { value: 'crossed', label: 'crossed（交叉）' }
                ],
                default: 'open'
            },
            {
                id: 'theta',
                label: '輸入角 θ',
                type: 'number',
                min: -180,
                max: 180,
                step: 1,
                default: 30,
                unit: '度'
            },
            {
                id: 'motorType',
                label: '驅動元件',
                type: 'select',
                options: getDriveOptions(),
                default: 'tt_motor'
            },
            {
                id: 'motorRotation',
                label: '驅動元件旋轉角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 5,
                default: 0,
                unit: '度'
            },
            {
                id: 'sweepStart',
                label: '起始角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 1,
                default: -180,
                unit: '度'
            },
            {
                id: 'sweepEnd',
                label: '結束角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 1,
                default: 180,
                unit: '度'
            },
            {
                id: 'sweepStep',
                label: '掃描間隔',
                type: 'number',
                min: 1,
                max: 10,
                step: 1,
                default: 1,
                unit: '度'
            },
            {
                id: 'showTrajectory',
                label: '顯示軌跡',
                type: 'checkbox',
                default: true
            }
        ],

        // 零件規格
        partSpecs: [
            {
                id: 'barW',
                label: '桿件寬 W',
                type: 'number',
                min: 6,
                max: 40,
                step: 1,
                default: 15,
                unit: 'mm'
            },
            {
                id: 'margin',
                label: '端到孔中心邊距',
                type: 'number',
                min: 4,
                max: 20,
                step: 0.5,
                default: 7,
                unit: 'mm'
            },
            {
                id: 'holeD',
                label: '孔徑',
                type: 'number',
                min: 2.5,
                max: 8,
                step: 0.1,
                default: 3.2,
                unit: 'mm'
            },
            {
                id: 'spacing',
                label: '零件間距',
                type: 'number',
                min: 2,
                max: 20,
                step: 1,
                default: 8,
                unit: 'mm'
            },
            {
                id: 'barStyle',
                label: '桿件樣式',
                type: 'select',
                options: [
                    { value: 'rect', label: '⬛ 直角矩形' },
                    { value: 'rounded', label: '💊 圓角矩形 (全圓角)' }
                ],
                default: 'rounded'
            }
        ],

        // 模擬說明
        simNotes: `
      顯示：O2（左固定點）、O4（右固定點）、A（input 端）、B（coupler/output 端）。<br/>
      若幾何無解，會提示「此角度不可行」。<br/>
      <strong style="color:#e74c3c;">紅色桿 = Input b（由馬達/舵機驅動）</strong>
    `,

        // 模組路徑及函數名稱
        solverModule: './fourbar/solver.js',
        solveFn: 'solveFourBar',
        visualizationModule: './fourbar/visualization.js',
        renderFn: 'renderFourbar',
        partsModule: './parts/generator.js',
        partsFn: 'generateParts'
    },

    crankslider: {
        id: 'crankslider',
        name: '曲柄滑塊機構',
        icon: '↔️',
        description: 'Slider-Crank - 旋轉轉直線往復',

        parameters: [
            {
                id: 'crankRadius',
                label: '曲柄半徑 r',
                type: 'number',
                min: 10,
                max: 100,
                step: 1,
                default: 30,
                unit: 'mm',
                color: '#e74c3c',
                isDynamic: true
            },
            {
                id: 'rodLength',
                label: '連桿長度 l',
                type: 'number',
                min: 50,
                max: 250,
                step: 1,
                default: 100,
                unit: 'mm',
                color: '#3498db',
                isDynamic: true
            },
            {
                id: 'theta',
                label: '曲柄角度 θ',
                type: 'number',
                min: -180,
                max: 180,
                step: 1,
                default: 30,
                unit: '度'
            },
            {
                id: 'motorType',
                label: '驅動元件',
                type: 'select',
                options: getDriveOptions(),
                default: 'tt_motor'
            },
            {
                id: 'motorRotation',
                label: '驅動元件旋轉角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 5,
                default: 0,
                unit: '度'
            },
            {
                id: 'motorRotation',
                label: '驅動元件旋轉角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 5,
                default: 0,
                unit: '度'
            },
            {
                id: 'sweepStart',
                label: '起始角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 1,
                default: -180,
                unit: '度'
            },
            {
                id: 'sweepEnd',
                label: '結束角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 1,
                default: 180,
                unit: '度'
            },
            {
                id: 'sweepStep',
                label: '掃描間隔',
                type: 'number',
                min: 1,
                max: 10,
                step: 1,
                default: 1,
                unit: '度'
            },
            {
                id: 'showTrajectory',
                label: '顯示軌跡',
                type: 'checkbox',
                default: true
            }
        ],

        partSpecs: [
            {
                id: 'crankWidth',
                label: '曲柄寬度',
                type: 'number',
                min: 10,
                max: 40,
                step: 1,
                default: 15,
                unit: 'mm'
            },
            {
                id: 'rodWidth',
                label: '連桿寬度',
                type: 'number',
                min: 10,
                max: 40,
                step: 1,
                default: 15,
                unit: 'mm'
            },
            {
                id: 'sliderWidth',
                label: '滑塊寬度',
                type: 'number',
                min: 20,
                max: 80,
                step: 1,
                default: 30,
                unit: 'mm'
            },
            {
                id: 'sliderHeight',
                label: '滑塊高度',
                type: 'number',
                min: 15,
                max: 60,
                step: 1,
                default: 20,
                unit: 'mm'
            },
            {
                id: 'holeD',
                label: '孔徑',
                type: 'number',
                min: 2.5,
                max: 8,
                step: 0.1,
                default: 3.2,
                unit: 'mm'
            },
            {
                id: 'margin',
                label: '端到孔中心邊距',
                type: 'number',
                min: 4,
                max: 20,
                step: 0.5,
                default: 7,
                unit: 'mm'
            },
            {
                id: 'barStyle',
                label: '桿件樣式',
                type: 'select',
                options: [
                    { value: 'rect', label: '⬛ 直角矩形/圓盤' },
                    { value: 'rounded', label: '💊 圓角矩形/圓盤' }
                ],
                default: 'rounded'
            }
        ],

        simNotes: `
      顯示：曲柄（紅色）、連桿（藍色）、滑塊（綠色）。<br/>
      滑塊行程 = 2 × 曲柄半徑。<br/>
      <strong style="color:#e74c3c;">注意死點位置（θ=0° 和 180°）</strong>
    `,

        solverModule: './slider-crank/solver.js',
        solveFn: 'solveSliderCrank',
        visualizationModule: './slider-crank/visualization.js',
        renderFn: 'renderSliderCrank',
        partsModule: './slider-crank/parts.js',
        partsFn: 'generateSliderCrankParts'
    },

    rackpinion: {
        id: 'rackpinion',
        name: '齒條齒輪機構',
        icon: '⚙️',
        description: 'Rack and Pinion - 旋轉與直線精準轉換',

        parameters: [
            {
                id: 'pinionTeeth',
                label: '齒輪齒數 N',
                type: 'number',
                min: 8,
                max: 60,
                step: 1,
                default: 20,
                unit: '齒',
                color: '#e74c3c',
                isDynamic: true
            },
            {
                id: 'module',
                label: '模數 m',
                type: 'number',
                min: 0.5,
                max: 10,
                step: 0.1,
                default: 2,
                unit: 'mm',
                color: '#3498db',
                isDynamic: true
            },
            {
                id: 'theta',
                label: '齒輪旋轉 θ',
                type: 'number',
                min: -720,
                max: 720,
                step: 1,
                default: 0,
                unit: '度'
            },
            {
                id: 'motorType',
                label: '驅動元件',
                type: 'select',
                options: getDriveOptions(),
                default: 'tt_motor'
            },
            {
                id: 'motorRotation',
                label: '驅動元件旋轉角度',
                type: 'number',
                min: -180,
                max: 180,
                step: 5,
                default: 0,
                unit: '度'
            },
            {
                id: 'sweepStart',
                label: '起始角度',
                type: 'number',
                min: -720,
                max: 720,
                step: 1,
                default: -360,
                unit: '度'
            },
            {
                id: 'sweepEnd',
                label: '結束角度',
                type: 'number',
                min: -720,
                max: 720,
                step: 1,
                default: 360,
                unit: '度'
            },
            {
                id: 'sweepStep',
                label: '掃描間隔',
                type: 'number',
                min: 1,
                max: 10,
                step: 1,
                default: 1,
                unit: '度'
            }
        ],

        partSpecs: [
            {
                id: 'rackLength',
                label: '齒條總長',
                type: 'number',
                min: 50,
                max: 400,
                step: 1,
                default: 200,
                unit: 'mm'
            },
            {
                id: 'rackHeight',
                label: '齒條背高',
                type: 'number',
                min: 10,
                max: 40,
                step: 1,
                default: 15,
                unit: 'mm'
            },
            {
                id: 'holeD',
                label: '連接孔徑',
                type: 'number',
                min: 2,
                max: 20,
                step: 0.1,
                default: 5,
                unit: 'mm'
            },
            {
                id: 'margin',
                label: '端到孔中心邊距',
                type: 'number',
                min: 4,
                max: 40,
                step: 0.5,
                default: 10,
                unit: 'mm'
            },
            {
                id: 'rackHoleType',
                label: '齒條連接型式',
                type: 'select',
                options: [
                    { value: 'circle', label: '⭕ 圓形孔' },
                    { value: 'slot', label: '💊 導軌長槽' }
                ],
                default: 'circle'
            },
            {
                id: 'rackSlotL',
                label: '導軌槽長度',
                type: 'number',
                min: 5,
                max: 50,
                step: 1,
                default: 20,
                unit: 'mm'
            }
        ],

        simNotes: `
      顯示：齒輪（紅色）、齒條（藍色）。<br/>
      節圓直徑 D = m × N。<br/>
      齒條位移 = θ(rad) × D / 2。
    `,

        solverModule: './rack-pinion/solver.js',
        solveFn: 'solveRackPinion',
        visualizationModule: './rack-pinion/visualization.js',
        renderFn: 'renderRackPinion',
        partsModule: './rack-pinion/parts.js',
        partsFn: 'generateRackPinionParts'
    },

    multilink: {
        id: 'multilink',
        name: '多連桿機構模擬 (Multilink)',
        icon: '🕸️',
        description: '通用多連桿模擬器 - 可自定義拓撲結構',

        parameters: [
            {
                id: 'wizardPlaceholder',
                label: '✨ 機構設計器 (Wizard)',
                type: 'custom',
                fullWidth: true,
                render: () => '<div id="wizardContainer"></div>'
            },
            {
                id: 'topology',
                label: '拓撲結構定義 (JSON)',
                type: 'textarea',
                rows: 15,
                fullWidth: true,
                default: JSON.stringify({
                    steps: [],
                    tracePoint: '',
                    visualization: { links: [], polygons: [], joints: [] },
                    parts: []
                }, null, 2)
            },
            { id: 'theta', label: '曲柄角度 θ', type: 'number', min: -360, max: 360, step: 1, default: 0, unit: '度' },
            { id: 'motorType', label: '驅動元件', type: 'select', options: getDriveOptions(), default: 'tt_motor' },
            { id: 'motorRotation', label: '驅動元件旋轉角度', type: 'number', min: -180, max: 180, step: 5, default: 0, unit: '度' },
            { id: 'sweepStart', label: '起始角度', type: 'number', min: -360, max: 360, default: -360 },
            { id: 'sweepEnd', label: '結束角度', type: 'number', min: -360, max: 360, default: 360 },
            { id: 'sweepStep', label: '掃描間隔', type: 'number', min: 1, max: 10, default: 2 },
            { id: 'showTrajectory', label: '顯示軌跡', type: 'checkbox', default: true }
        ],

        partSpecs: [
            { id: 'barW', label: '連桿寬度', type: 'number', min: 5, max: 30, default: 12, unit: 'mm' },
            { id: 'trackWidth', label: '軌道寬度', type: 'number', min: 2, max: 50, step: 0.1, default: 3.2, unit: 'mm' },
            { id: 'margin', label: '孔邊距', type: 'number', min: 3, max: 15, default: 6, unit: 'mm' },
            { id: 'holeD', label: '孔徑', type: 'number', min: 2, max: 10, default: 3.2, unit: 'mm' },
            { id: 'motorJointD', label: '馬達接頭孔徑', type: 'number', min: 3, max: 12, step: 0.1, default: 8, unit: 'mm' },
            { id: 'spacing', label: '排版間距', type: 'number', min: 2, max: 20, default: 5, unit: 'mm' },
        ],

        simNotes: ``,

        solverModule: './multilink/solver.js',
        solveFn: 'solveTopology',
        visualizationModule: './multilink/visualization.js',
        renderFn: 'renderMultilink',
        partsModule: './multilink/parts.js',
        partsFn: 'generateMultilinkParts'
    },

    bardrawer: {
        id: 'bardrawer',
        name: '桿件繪圖工具',
        icon: '✏️',
        description: 'Bar Drawer - 自定義桿件與孔位',
        hideAnimation: true,
        parameters: [
            { id: 'barL', label: '桿件長度 L', type: 'number', min: 10, max: 500, default: 100, unit: 'mm', isDynamic: true },
            { id: 'barW', label: '桿件寬度 W', type: 'number', min: 5, max: 100, default: 20, unit: 'mm', isDynamic: true },
            { id: 'holeD', label: '🎨 當前畫筆大小 (孔徑/槽寬)', type: 'number', min: 1, max: 20, step: 0.1, default: 3.2, unit: 'mm' },
            { id: 'margin', label: '孔邊距 (margin)', type: 'number', min: 2, max: 50, default: 10, unit: 'mm' },
            { id: 'extraHoles', label: '額外孔位 (x1,y1;...)', type: 'text', default: '', color: '#3498db' },
            {
                id: 'drawMode',
                label: '🎯 繪製模式',
                type: 'select',
                options: [
                    { value: 'hole', label: '⭕ 螺絲孔 (Hole)' },
                    { value: 'slot', label: '💊 導軌槽 (Slot)' }
                ],
                default: 'hole'
            },
            { id: 'slotL', label: '預設槽長度', type: 'number', min: 5, max: 100, default: 20, unit: 'mm' },
            { id: 'extraSlots', label: '額外長槽 (x,y,L;...)', type: 'text', default: '', color: '#27ae60' },
            {
                id: 'gridInterval',
                label: '輔助格線間隔',
                type: 'select',
                options: [
                    { value: '5', label: '5 mm' },
                    { value: '10', label: '10 mm (預設)' },
                    { value: '20', label: '20 mm' }
                ],
                default: '10'
            },
            { id: 'snapToGrid', label: '自動對齊格線 (Snap)', type: 'checkbox', default: true }
        ],
        partSpecs: [
            {
                id: 'barStyle',
                label: '桿件樣式',
                type: 'select',
                options: [
                    { value: 'rect', label: '⬛ 直角矩形' },
                    { value: 'rounded', label: '💊 圓角矩形 (全圓角)' }
                ],
                default: 'rounded'
            }
        ],
        simNotes: `
            <strong>💡 互動繪圖指南：</strong><br/>
            1. <b>切換模式</b>：從左側設定「繪製模式」為螺絲孔或導軌槽。<br/>
            2. <b>點擊桿件</b>：在預覽圖點擊即可新增對應元件。<br/>
            3. <b>移除元件</b>：點擊已存在的「藍色」額外孔或「綠色」導軌槽即可將其刪除。<br/>
            4. <b>自動對齊</b>：建議開啟 Snap 功能以便對齊整數位置。
        `,
        solverModule: './bardrawer/solver.js',
        solveFn: 'solveBar',
        visualizationModule: './bardrawer/visualization.js',
        renderFn: 'renderBar',
        partsModule: './bardrawer/parts.js',
        partsFn: 'generateBarParts'
    }
};

/**
 * 根據 URL 參數獲取機構類型
 */
export function getMechanismFromURL() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const type = params.get('type');

    // 如果是 Wizard 模式，且未指定具體類型，強制預設為 multilink
    if (mode === 'wizard' && !type) {
        return MECHANISMS.multilink;
    }

    const mechType = type || 'fourbar';
    return MECHANISMS[mechType] || MECHANISMS.fourbar;
}

/**
 * 生成參數輸入 HTML
 */
export function generateParameterHTML(params) {
    let html = '<div class="grid">';

    for (const param of params) {
        if (param.id === 'theta') {
            html += `<input id="theta" type="number" style="display:none" `;
            if (param.min !== undefined) html += `min="${param.min}" `;
            if (param.max !== undefined) html += `max="${param.max}" `;
            if (param.step !== undefined) html += `step="${param.step}" `;
            if (param.default !== undefined) html += `value="${param.default}" `;
            html += `/>`;
            continue;
        }
        if (param.type === 'checkbox') {
            const checked = param.default ? 'checked' : '';
            html += `<div class="checkbox-row">`;
            html += `<input id="${param.id}" type="checkbox" ${checked} />`;
            html += `<label for="${param.id}">${param.label}</label>`;
            html += `</div>`;
        } else {
            const fullWidth = param.fullWidth ? 'grid-column: 1 / -1;' : '';
            html += `<div style="${fullWidth}">`;
            html += `<label>`;
            if (param.color) {
                html += `<span style="color:${param.color}; font-weight:bold;">${param.label}</span>`;
            } else {
                html += param.label;
            }
            if (param.unit) {
                html += ` (${param.unit})`;
            }
            html += `</label>`;

            if (param.type === 'select') {
                html += `<select id="${param.id}">`;
                for (const opt of param.options) {
                    const selected = opt.value === param.default ? 'selected' : '';
                    html += `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
                }
                html += `</select>`;
            } else if (param.type === 'textarea') {
                html += `<textarea id="${param.id}" rows="${param.rows || 10}" style="width:100%; font-family:monospace; font-size:12px; white-space:pre;">${param.default || ''}</textarea>`;
            } else if (param.type === 'custom') {
                html += param.render();
            } else {
                html += `<input id="${param.id}" type="${param.type}" `;
                if (param.min !== undefined) html += `min="${param.min}" `;
                if (param.max !== undefined) html += `max="${param.max}" `;
                if (param.step !== undefined) html += `step="${param.step}" `;
                if (param.default !== undefined) html += `value="${param.default}" `;
                html += `/>`;
            }
            html += '</div>';
        }
    }

    html += '</div>';
    return html;
}
