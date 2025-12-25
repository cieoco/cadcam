/**
 * Mechanism Configuration System
 * 機構配置系統 - 定義每種機構的特定參數和行為
 */

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
                color: '#666'
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
                color: '#e74c3c'
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
                color: '#3498db'
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
                color: '#27ae60'
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
                label: '驅動類型',
                type: 'select',
                options: [
                    { value: 'motor360', label: '🔄 馬達（360°）' },
                    { value: 'servo180', label: '↔️ 舵機（180°）' },
                    { value: 'servo270', label: '↔️ 舵機（270°）' },
                    { value: 'custom', label: '⚙️ 自訂範圍' }
                ],
                default: 'motor360'
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
        visualizationModule: './ui/visualization.js',
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
                color: '#e74c3c'
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
                color: '#3498db'
            },
            {
                id: 'theta',
                label: '曲柄角度 θ',
                type: 'number',
                min: 0,
                max: 360,
                step: 1,
                default: 0,
                unit: '度'
            }
        ],

        partSpecs: [
            {
                id: 'crankDiameter',
                label: '曲柄盤直徑',
                type: 'number',
                min: 40,
                max: 150,
                step: 1,
                default: 80,
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
                min: 30,
                max: 80,
                step: 1,
                default: 40,
                unit: 'mm'
            },
            {
                id: 'sliderHeight',
                label: '滑塊高度',
                type: 'number',
                min: 20,
                max: 60,
                step: 1,
                default: 30,
                unit: 'mm'
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
    }
};

/**
 * 根據 URL 參數獲取機構類型
 */
export function getMechanismFromURL() {
    const params = new URLSearchParams(window.location.search);
    const mechType = params.get('type') || 'fourbar';
    return MECHANISMS[mechType] || MECHANISMS.fourbar;
}

/**
 * 生成參數輸入 HTML
 */
export function generateParameterHTML(params) {
    let html = '<div class="grid">';

    for (const param of params) {
        html += '<div>';
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
        } else if (param.type === 'checkbox') {
            const checked = param.default ? 'checked' : '';
            html += `<input id="${param.id}" type="checkbox" ${checked} />`;
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

    html += '</div>';
    return html;
}
