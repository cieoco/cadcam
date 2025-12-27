/**
 * Motor and Servo Data
 * 定義馬達與舵機的規格與外型尺寸
 */

import { svgEl } from './utils.js';

export const DRIVE_COMPONENTS = {
    'none': {
        id: 'none',
        name: '隱藏 / 無',
        type: 'motor_continuous',
        category: 'none',
        color: 'transparent',
        draw: null
    },
    'tt_motor': {
        id: 'tt_motor',
        name: 'TT 減速馬達 (1:48)',
        type: 'motor_continuous',
        category: 'dc_motor',
        specs: {
            voltage: '3V ~ 6V',
            speed_no_load: '200 RPM @ 6V',
            torque: '0.8 kg.cm @ 6V',
            weight: '30g'
        },
        shape: {
            color: '#f1c40f',
            opacity: 0.3,
            type: 'group',
            elements: [
                { type: 'rect', x: -11, y: -11, w: 37, h: 22, color: '#f1c40f' },
                { type: 'rect', x: 26, y: -10, w: 25, h: 20, color: '#bdc3c7' },
                { type: 'circle', cx: -6, cy: 0, r: 1.5, color: '#fff' }
            ]
        }
    },
    'sg90': {
        id: 'sg90',
        name: 'SG90 9g 舵機 (180°)',
        type: 'servo_180',
        category: 'servo',
        specs: {
            voltage: '4.8V ~ 6V',
            speed: '0.12 sec/60°',
            torque: '1.6 kg.cm',
            range: '180°',
            weight: '9g'
        },
        shape: {
            color: '#3498db',
            opacity: 0.3,
            type: 'group',
            elements: [
                { type: 'rect', x: -6, y: -6, w: 23, h: 12, rx: 1, color: '#3498db' },
                { type: 'rect', x: -10, y: -6, w: 4, h: 12, color: '#3498db' },
                { type: 'rect', x: 17, y: -6, w: 4, h: 12, color: '#3498db' },
                { type: 'rect', x: -6, y: -6, w: 23, h: 12, rx: 2, color: '#2980b9' }
            ]
        }
    },
    'mg995': {
        id: 'mg995',
        name: 'MG995 舵機 (180°)',
        type: 'servo_180',
        category: 'servo',
        specs: {
            voltage: '4.8V ~ 7.2V',
            speed: '0.20 sec/60°',
            torque: '13 kg.cm',
            range: '180°',
            weight: '55g'
        },
        shape: {
            color: '#2c3e50',
            opacity: 0.3,
            type: 'group',
            elements: [
                { type: 'rect', x: -10, y: -10, w: 41, h: 20, rx: 2, color: '#2c3e50' },
                { type: 'rect', x: -18, y: -10, w: 8, h: 20, color: '#2c3e50' },
                { type: 'rect', x: 31, y: -10, w: 8, h: 20, color: '#2c3e50' }
            ]
        }
    },
    'mg995_360': {
        id: 'mg995_360',
        name: 'MG995 舵機 (360° 連續)',
        type: 'motor_continuous',
        category: 'servo',
        specs: {
            voltage: '4.8V ~ 7.2V',
            speed: '50-60 RPM',
            torque: '13 kg.cm',
            range: 'Continuous',
            weight: '55g'
        },
        shape: {
            color: '#27ae60',
            opacity: 0.3,
            type: 'group',
            elements: [
                { type: 'rect', x: -10, y: -10, w: 41, h: 20, rx: 2, color: '#27ae60' },
                { type: 'rect', x: -18, y: -10, w: 8, h: 20, color: '#27ae60' },
                { type: 'rect', x: 31, y: -10, w: 8, h: 20, color: '#27ae60' }
            ]
        }
    },
    'c20_motor': {
        id: 'c20_motor',
        name: 'N20 減速馬達',
        type: 'motor_continuous',
        category: 'dc_motor',
        specs: {
            voltage: '6V',
            speed_no_load: '30~1000 RPM',
            torque: 'varies',
            weight: '10g'
        },
        shape: {
            color: '#7f8c8d',
            opacity: 0.3,
            type: 'group',
            elements: [
                { type: 'rect', x: -5, y: -6, w: 25, h: 12, color: '#bdc3c7' },
                { type: 'rect', x: -14, y: -6, w: 9, h: 12, color: '#f39c12' }
            ]
        }
    }
};

/**
 * 獲取馬達選項列表 (for Select UI)
 */
export function getDriveOptions() {
    return Object.values(DRIVE_COMPONENTS).map(c => ({
        value: c.id,
        label: c.name
    }));
}

/**
 * 建立驅動元件的 SVG 元素 (Group)
 * @param {string} componentId - 元件 ID
 * @param {number} centerX - 中心 X (軸心) (Screen Coords)
 * @param {number} centerY - 中心 Y (軸心) (Screen Coords)
 * @param {number} scale - 縮放比例 (Pixels per Unit)
 * @param {number} rotationDeg - 旋轉角度（度）
 * @returns {SVGElement|null} SVG Group 元素
 */
export function createDriveComponent(componentId, centerX, centerY, scale = 1.0, rotationDeg = 0) {
    const component = DRIVE_COMPONENTS[componentId];
    if (!component || !component.shape) return null;

    const shape = component.shape;
    const g = svgEl('g', {
        transform: `translate(${centerX}, ${centerY}) rotate(${rotationDeg}) scale(${scale})`
    });

    // Apply group opacity
    if (shape.opacity) g.setAttribute('opacity', shape.opacity);

    if (shape.type === 'group' && shape.elements) {
        for (const el of shape.elements) {
            if (el.type === 'rect') {
                g.appendChild(svgEl('rect', {
                    x: el.x, y: el.y, width: el.w, height: el.h,
                    fill: el.color, rx: el.rx || 0
                }));
            } else if (el.type === 'circle') {
                g.appendChild(svgEl('circle', {
                    cx: el.cx, cy: el.cy, r: el.r,
                    fill: el.color
                }));
            }
        }
    }
    return g;
}
