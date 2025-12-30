/**
 * Mechanism Wizard UI (Component-Based)
 * 機構小幫手 - 組件式建構多連桿機構
 */

import { $ } from '../utils.js';
import { updateDynamicParams } from './controls.js';
import * as Templates from '../multilink/templates.js';
import { EXAMPLE_TEMPLATES } from '../examples/index.js';

export class MechanismWizard {
    constructor(containerId, onUpdate) {
        this.container = $(containerId);
        this.onUpdate = onUpdate;

        // 組件化資料結構
        this.components = []; // { type: 'bar'|'triangle', id, ...props }
        this.selectedComponentIndex = -1;
        this.topology = { steps: [], visualization: { links: [], polygons: [], joints: [] }, parts: [] };

        this.init();
    }

    init(initialTopology) {
        if (initialTopology && initialTopology._wizard_data) {
            this.components = initialTopology._wizard_data;
            this.topology = initialTopology;
        }
        this.render();
    }

    render() {
        if (!this.container) return;

        const optionsHtml = EXAMPLE_TEMPLATES.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        this.container.innerHTML = `
            <div class="wizard-header" style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; border-radius: 8px 8px 0 0;">
                <h4 style="margin: 0; font-size: 14px; color: #34495e; display: flex; align-items: center; gap: 5px; white-space: nowrap">
                    🛠️ 機構設計器
                </h4>
                <select id="templateSelect" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid #ddd;">
                    <option value="">-- 載入範本 --</option>
                    ${optionsHtml}
                </select>
            </div>
            
            <div style="height: 6px;"></div>

            <div class="wizard-content" style="display: grid; grid-template-columns: 120px 1fr; gap: 10px; height: 350px; overflow: hidden; padding: 0 10px 10px 10px;">
                <!-- 左側：組件列表 -->
                <div id="componentList" style="border: 1px solid #eee; border-radius: 8px; padding: 5px; overflow-y: auto; background: #fdfdfd;">
                    ${this.renderComponentList()}
                </div>

                <!-- 右側：屬性編輯器 -->
                <div id="propertyEditor" style="border: 1px solid #eee; border-radius: 8px; padding: 12px; overflow-y: auto; background: #fff; box-shadow: inset 0 0 5px rgba(0,0,0,0.02);">
                    ${this.renderPropertyEditor()}
                </div>
            </div>

            <div class="wizard-footer" style="padding: 10px; border-top: 1px solid #eee; display: flex; gap: 10px; align-items: center; background: #f8f9fa; border-radius: 0 0 8px 8px;">
                <div style="flex: 1; font-size: 11px; color: #7f8c8d;">
                    追蹤點: 
                    <select id="tracePointSelect" style="font-size: 11px; padding: 2px; border-radius: 4px; border: 1px solid #ddd; max-width: 60px;">
                        <option value="">--</option>
                        ${this.getAllPointIds().map(id => `<option value="${id}" ${this.topology.tracePoint === id ? 'selected' : ''}>${id}</option>`).join('')}
                    </select>
                </div>
                <button id="btnWizardApply" style="padding: 8px 20px; background: #2c3e50; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    更新 / 預覽
                </button>
            </div>
        `;

        this.attachEvents();
    }

    renderComponentList() {
        if (this.components.length === 0) {
            return `<div style="text-align: center; color: #999; font-size: 10px; margin-top: 20px;">尚無桿件</div>`;
        }

        const solvedPoints = this.getSolvedPointIds();

        return this.components.map((c, i) => {
            const isSelected = this.selectedComponentIndex === i;
            const isSolved = this.isComponentSolved(c, solvedPoints);
            const icon = c.type === 'bar' ? '📏' : (c.type === 'triangle' ? '📐' : (c.type === 'slider' ? 'S' : '⚪'));
            const color = c.color || '#333';

            return `
                <div class="comp-item" onclick="window.wizard.selectComponent(${i})" style="
                    padding: 6px 8px; 
                    margin-bottom: 4px; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    gap: 6px;
                    font-size: 11px;
                    background: ${isSelected ? '#e3f2fd' : '#fff'};
                    border: 1px solid ${isSelected ? '#3498db' : (isSolved ? '#eee' : '#ff7675')};
                    transition: all 0.2s;
                    opacity: ${isSolved ? 1 : 0.7};
                ">
                    <span style="font-size: 12px;">${icon}</span>
                    <span style="flex: 1; font-weight: ${isSelected ? 'bold' : 'normal'}; color: ${isSelected ? '#2980b9' : '#34495e'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${c.id || (c.type + (i + 1))}
                    </span>
                    ${!isSolved ? '<span title="此桿件目前無法求解" style="color: #ff7675; font-size: 10px;">⚠️</span>' : ''}
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; border: 1px solid rgba(0,0,0,0.1);"></div>
                </div>
            `;
        }).join('');
    }

    renderPropertyEditor() {
        const comp = this.components[this.selectedComponentIndex];
        if (!comp) {
            return `
                <div style="height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #bdc3c7; text-align: center;">
                    <div style="font-size: 40px; margin-bottom: 10px; opacity: 0.5;">📏</div>
                    <div style="font-size: 12px; font-weight: bold;">請新增桿件</div>
                </div>
            `;
        }

        const icon = comp.type === 'bar' ? '📏' : (comp.type === 'triangle' ? '📐' : (comp.type === 'slider' ? 'S' : '⚪'));
        const driver = comp.type === 'slider'
            ? (comp.driverId
                ? this.components.find(c => c.id === comp.driverId && c.type === 'bar')
                : this.components.find(c => c.type === 'bar' && c.lenParam && (c.p1?.id === comp.p3?.id || c.p2?.id === comp.p3?.id)))
            : null;
        const solvedPoints = this.getSolvedPointIds();
        const isSolved = this.isComponentSolved(comp, solvedPoints);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #f8f9fa;">
                <h5 style="margin: 0; font-size: 14px; color: #2c3e50; display: flex; align-items: center; gap: 5px;">
                    ${icon} 編輯 ${comp.type === 'hole' ? '孔位' : '桿件'} ${!isSolved ? '<span style="color: #ff7675; font-size: 12px;">(⚠️ 未求解)</span>' : ''}
                </h5>
                <button onclick="window.wizard.removeSelected()" style="background: #fff; border: 1px solid #ff7675; color: #ff7675; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">刪除</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">名稱 (ID)</label>
                    <input type="text" value="${comp.id || ''}" oninput="window.wizard.updateCompProp('id', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </div>
                ${comp.type !== 'hole' ? `
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">顏色</label>
                    <input type="color" value="${comp.color || '#3498db'}" oninput="window.wizard.updateCompProp('color', this.value)" style="width: 100%; height: 30px; padding: 2px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
                </div>
                ` : ''}
        `;

        if (comp.type === 'bar') {
            html += `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">點位 1 (P1)</label>
                    ${this.renderPointEditor(comp, 'p1')}
                </div>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">點位 2 (P2)</label>
                    ${this.renderPointEditor(comp, 'p2')}
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">桿長參數</label>
                    <input type="text" value="${comp.lenParam || 'L'}" oninput="window.wizard.updateCompProp('lenParam', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #2c3e50; cursor: pointer; padding: 6px; background: #f8f9fa; border-radius: 4px;">
                        <input type="checkbox" ${comp.isInput ? 'checked' : ''} onchange="window.wizard.updateCompProp('isInput', this.checked)" style="width: 14px; height: 14px;"> 馬達驅動
                    </label>
                </div>

                <div class="form-group">
                    <button onclick="window.wizard.convertSelectedBarToSlider()" style="width: 100%; padding: 8px; background: #8e44ad; color: #fff; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
                        Convert to Slider
                    </button>
                </div>

                <!-- 🌟 巢狀孔位管理區區塊 -->
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px;">📍 桿件孔位管理</label>
                    <div id="nestedHoleList" style="display: flex; flex-direction: column; gap: 8px;">
                        ${(comp.holes || []).map((h, hIdx) => `
                            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 8px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <span style="font-size: 11px; font-weight: bold; color: #34495e;">孔位 ${h.id}</span>
                                    <button onclick="window.wizard.removeNestedHole('${comp.id}', '${h.id}')" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:10px;">✕ 刪除</button>
                                </div>
                                <div class="form-group" style="margin:0;">
                                    <label style="display: block; font-size: 9px; color: #7f8c8d; margin-bottom: 2px;">距離 P1 參數名</label>
                                    <input type="text" value="${h.distParam || ''}" 
                                        oninput="window.wizard.updateNestedHoleProp('${comp.id}', ${hIdx}, 'distParam', this.value)" 
                                        style="width: 100%; padding: 4px; border: 1px solid #eee; border-radius: 3px; font-size: 11px;">
                                </div>
                            </div>
                        `).join('')}
                        ${!(comp.holes && comp.holes.length) ? '<div style="font-size: 10px; color: #bdc3c7; text-align: center; padding: 10px; border: 1px dashed #eee; border-radius: 6px;">在畫面上點擊桿件即可加孔</div>' : ''}
                    </div>
                </div>
            `;
        } else if (comp.type === 'triangle') {
            html += `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">端點 1 (P1)</label>
                    ${this.renderPointEditor(comp, 'p1')}
                </div>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">端點 2 (P2)</label>
                    ${this.renderPointEditor(comp, 'p2')}
                </div>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">頂點 (P3)</label>
                    ${this.renderPointEditor(comp, 'p3')}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                        <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">邊長 1 (P1-P3)</label>
                        <input type="text" value="${comp.r1Param || 'L1'}" oninput="window.wizard.updateCompProp('r1Param', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                    </div>
                    <div class="form-group">
                        <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">邊長 2 (P2-P3)</label>
                        <input type="text" value="${comp.r2Param || 'L2'}" oninput="window.wizard.updateCompProp('r2Param', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                    </div>
                </div>

                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">底邊 (P1-P2)</label>
                    <input type="text" value="${comp.gParam || 'G'}" oninput="window.wizard.updateCompProp('gParam', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </div>

                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">解方向</label>
                    <select onchange="window.wizard.updateCompProp('sign', parseInt(this.value))" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff;">
                        <option value="1" ${comp.sign === 1 ? 'selected' : ''}>正向 (+1)</option>
                        <option value="-1" ${comp.sign === -1 ? 'selected' : ''}>反向 (-1)</option>
                    </select>
                </div>
            `;
        } else if (comp.type === 'slider') {
            html += `
                <div style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
                    <div style="background: #f1f2f6; padding: 6px 10px; font-size: 11px; font-weight: bold; color: #555; border-bottom: 1px solid #ddd;">
                        🛤️ 軌道設定 (Track)
                    </div>
                    <div style="padding: 10px; background: #fff;">
                        <div style="margin-bottom: 8px;">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #2c3e50; margin-bottom: 4px;">起點 (P1)</label>
                            ${this.renderPointEditor(comp, 'p1')}
                        </div>
                        <div style="margin-bottom: 8px; border-top: 1px dashed #eee; padding-top: 8px;">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #2c3e50; margin-bottom: 4px;">終點 (P2)</label>
                            ${this.renderPointEditor(comp, 'p2')}
                        </div>
                        <div class="form-group" style="margin-top: 8px; border-top: 1px dashed #eee; padding-top: 8px;">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #555; margin-bottom: 2px;">軌道總長參數 (Track Length)</label>
                            <input type="text" value="${comp.trackLenParam || ''}" oninput="window.wizard.updateCompProp('trackLenParam', this.value)" placeholder="例如: 200 或 L_track" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                        </div>
                        <div class="form-group" style="margin-top: 4px;">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #555; margin-bottom: 2px;">P1 偏移參數 (P1 Offset)</label>
                            <input type="text" value="${comp.trackOffsetParam || ''}" oninput="window.wizard.updateCompProp('trackOffsetParam', this.value)" placeholder="例如: 20 或 Offset" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                        </div>
                        ${driver ? `
                        <div class="form-group" style="margin-top: 8px; border-top: 1px dashed #eee; padding-top: 8px;">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #555; margin-bottom: 2px;">驅動桿長參數</label>
                            <input type="text" value="${driver.lenParam || ''}" oninput="window.wizard.updateSliderDriverParam('${driver.id}', this.value)" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
                    <div style="background: #f1f2f6; padding: 6px 10px; font-size: 11px; font-weight: bold; color: #555; border-bottom: 1px solid #ddd;">
                        🔲 滑塊設定 (Slider Block)
                    </div>
                    <div style="padding: 10px; background: #fff;">
                        <div style="margin-bottom: 8px;">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #2c3e50; margin-bottom: 4px;">滑塊點 (P3)</label>
                            ${this.renderPointEditor(comp, 'p3')}
                        </div>
                        <div class="form-group">
                            <label style="display: block; font-size: 10px; font-weight: bold; color: #555; margin-bottom: 2px;">解方向 (Sign)</label>
                            <select onchange="window.wizard.updateCompProp('sign', parseInt(this.value))" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; background: #fff;">
                                <option value="1" ${comp.sign === 1 ? 'selected' : ''}>+1</option>
                                <option value="-1" ${comp.sign === -1 ? 'selected' : ''}>-1</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;

        }

        html += `</div>`;
        return html;
    }

    renderPointEditor(comp, pointKey) {
        const pt = comp[pointKey] || { id: '', type: 'floating', x: 0, y: 0 };
        const existingPoints = this.getAllPointIds();

        return `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; gap: 5px; align-items: center;">
                    <select onchange="window.wizard.updatePointProp('${pointKey}', 'type', this.value)" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px; background: #fff;">
                        <option value="fixed" ${pt.type === 'fixed' ? 'selected' : ''}>📍 固定 (Fixed)</option>
                        <option value="existing" ${pt.type === 'existing' ? 'selected' : ''}>🔗 現有 (Existing)</option>
                        <option value="floating" ${pt.type === 'floating' ? 'selected' : ''}>☁️ 浮動 (Floating)</option>
                    </select>
                </div>

                ${pt.type === 'existing' ? `
                    <select onchange="window.wizard.updatePointProp('${pointKey}', 'id', this.value)" style="width: 100%; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px; background: #fff;">
                        <option value="">-- 選擇點位 --</option>
                        ${existingPoints.map(id => `<option value="${id}" ${pt.id === id ? 'selected' : ''}>${id}</option>`).join('')}
                    </select>
                ` : `
                    <input type="text" value="${pt.id || ''}" placeholder="點位名稱" oninput="window.wizard.updatePointProp('${pointKey}', 'id', this.value)" style="width: 100%; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                `}

                ${pt.type === 'fixed' ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                        <input type="number" value="${pt.x || 0}" placeholder="X" oninput="window.wizard.updatePointProp('${pointKey}', 'x', this.value)" style="padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                        <input type="number" value="${pt.y || 0}" placeholder="Y" oninput="window.wizard.updatePointProp('${pointKey}', 'y', this.value)" style="padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                ` : ''}
            </div>
        `;
    }

    attachEvents() {
        const btnReset = $('btnWizardReset');
        const btnApply = $('btnWizardApply');
        const templateSelect = $('templateSelect');

        if (btnReset) btnReset.onclick = () => this.reset();
        if (btnApply) btnApply.onclick = () => this.syncTopology();

        if (templateSelect) templateSelect.onchange = (e) => {
            if (e.target.value) this.loadTemplate(e.target.value);
        };

        const traceSelect = $('tracePointSelect');
        if (traceSelect) traceSelect.onchange = (e) => {
            this.topology.tracePoint = e.target.value;
            this.syncTopology();
        };
    }

    addComponentFromCanvas(points) {
        console.log('[Wizard] Adding component from canvas:', points);

        if (!points || points.length < 2) return;

        // 1. Ensure all points have IDs
        const allPointIds = this.getAllPointIds();
        let nextP = 1;
        const getNextPId = () => {
            while (allPointIds.includes(`P${nextP}`)) nextP++;
            const id = `P${nextP}`;
            allPointIds.push(id);
            return id;
        };

        points.forEach(p => {
            if (!p.id) p.id = getNextPId();
        });

        // 2. If 2 points, use existing Bar logic
        if (points.length === 2) {
            this.addLinkFromCanvas(points[0], points[1]);
            return;
        }

        // 3. If 3 points, create Triangle (to support SAS mode)
        if (points.length === 3) {
            let count = 1;
            while (this.components.find(c => c.id === `Tri${count}`)) count++;
            const id = `Tri${count}`;

            // 🌟 核心修正：如果是第一個組件，將前兩個點設為固定 (Ground)，確保有解
            const isFirst = this.components.length === 0;

            const newTri = {
                type: 'triangle',
                id,
                color: '#27ae60',
                p1: { id: points[0].id, type: (isFirst) ? 'fixed' : (points[0].isNew ? 'floating' : 'existing'), x: points[0].x, y: points[0].y },
                p2: { id: points[1].id, type: (isFirst) ? 'fixed' : (points[1].isNew ? 'floating' : 'existing'), x: points[1].x, y: points[1].y },
                p3: { id: points[2].id, type: (points[2].isNew ? 'floating' : 'existing'), x: points[2].x, y: points[2].y },
                r1Param: 'R1_' + (this.components.length + 1),
                r2Param: 'R2_' + (this.components.length + 1),
                gParam: 'G_' + (this.components.length + 1),
                sign: 1,
                isInput: false
            };

            this.components.push(newTri);
            this.selectedComponentIndex = this.components.length - 1;
            this.render();
            this.syncTopology();
            return;
        }

        // 4. If > 3 points, create generic Polygon
        let count = 1;
        while (this.components.find(c => c.id === `Poly${count}`)) count++;
        const id = `Poly${count}`;

        // 🌟 核心修正：如果是第一個組件，將前兩個點設為固定 (Ground)，確保有解
        const isFirst = this.components.length === 0;

        const newPoly = {
            type: 'polygon',
            id,
            color: '#e67e22', // Orange for polygons
            points: points.map((p, idx) => ({
                id: p.id,
                type: (isFirst && idx < 2) ? 'fixed' : (p.isNew ? 'floating' : 'existing'),
                x: p.x,
                y: p.y
            })),
            isInput: false
        };

        this.components.push(newPoly);
        this.selectedComponentIndex = this.components.length - 1;
        this.render();
        this.syncTopology();
    }

    addLinkFromCanvas(p1Data, p2Data) {
        console.log('[Wizard] Adding link from canvas:', p1Data, p2Data);

        // 1. 確保點位有 ID (如果是畫布點擊產生的新點可能沒 ID)
        const allPointIds = this.getAllPointIds();
        let nextP = 1;
        const getNextPId = () => {
            while (allPointIds.includes(`P${nextP}`)) nextP++;
            const id = `P${nextP}`;
            allPointIds.push(id);
            return id;
        };

        if (!p1Data.id) p1Data.id = getNextPId();
        if (!p2Data.id) p2Data.id = getNextPId();

        // 2. 生成連桿 ID
        let count = 1;
        while (this.components.find(c => c.id === `Link${count}`)) count++;
        const id = `Link${count}`;

        const newBar = {
            type: 'bar', id, color: '#3498db',
            p1: { id: p1Data.id, type: p1Data.isNew ? 'floating' : 'existing', x: p1Data.x, y: p1Data.y },
            p2: { id: p2Data.id, type: p2Data.isNew ? 'floating' : 'existing', x: p2Data.x, y: p2Data.y },
            lenParam: `L${count}`,
            isInput: false
        };

        // 🎯 核心修正：如果是第一根桿件，且 P1 是起始點 (不管是新點還是既有的 O 點)，將其設為固定點
        if (this.components.length === 0) {
            newBar.p1.type = 'fixed';
            newBar.isInput = true;

            // 🌟 核心修正：計算繪製時的角度偏移，防止自動「變平」
            const dx = p2Data.x - p1Data.x;
            const dy = p2Data.y - p1Data.y;
            const rad = Math.atan2(dy, dx);
            newBar.phaseOffset = Math.round((rad * 180) / Math.PI); // 轉為角度存入

            if (p1Data.id === 'O') {
                newBar.p1.x = 0;
                newBar.p1.y = 0;
            }
        }

        this.components.push(newBar);

        // 🌟 核心修正：每當畫出新桿件，確保長度參數立刻被重新計算，不被舊值 100 蓋過
        if (this.topology.params) {
            delete this.topology.params[newBar.lenParam];
        }

        this.selectedComponentIndex = this.components.length - 1;
        this.render();
        this.syncTopology();
    }

    addHoleFromCanvas(linkId, p1Id, p2Id, r1, r2, x, y) {
        const bar = this.components.find(c => c.id === linkId);
        if (!bar) return;

        if (!bar.holes) bar.holes = [];
        const holeCount = this.components.reduce((acc, c) => acc + (c.holes ? c.holes.length : 0), 0) + 1;
        const holeId = 'H' + holeCount;

        const newHole = {
            id: holeId,
            distParam: holeId + '_dist',
        };

        bar.holes.push(newHole);

        // 初始化參數
        if (!this.topology.params) this.topology.params = {};
        this.topology.params[newHole.distParam] = Math.round(r1);

        this.render();
        this.syncTopology();
    }

    addComponent(type) {
        const count = this.components.filter(c => c.type === type).length + 1;
        let id = type === 'bar' ? `Link${count}` : (type === 'triangle' ? `Tri${count}` : (type === 'slider' ? `Slider${count}` : (type === 'polygon' ? `Poly${count}` : `H${count}`)));
        const newComp = { type, id, color: type === 'bar' ? '#3498db' : (type === 'triangle' ? '#27ae60' : (type === 'slider' ? '#8e44ad' : (type === 'polygon' ? '#e67e22' : '#2d3436'))) };

        if (type === 'bar') {
            newComp.p1 = { id: '', type: 'fixed', x: 0, y: 0 };
            newComp.p2 = { id: '', type: 'floating', x: 0, y: 0 };
            newComp.lenParam = 'L' + (this.components.length + 1);
            newComp.isInput = false;
        } else if (type === 'triangle') {
            newComp.p1 = { id: '', type: 'existing', x: 0, y: 0 };
            newComp.p2 = { id: '', type: 'existing', x: 0, y: 0 };
            newComp.p3 = { id: '', type: 'floating', x: 0, y: 0 };
            newComp.r1Param = 'R1_' + (this.components.length + 1);
            newComp.r2Param = 'R2_' + (this.components.length + 1);
            newComp.paramMode = 'SSS'; // Default: Side-Side-Side
            newComp.angleParam = 'Ang_' + (this.components.length + 1); // For SAS mode
            newComp.sign = 1;
        } else if (type === 'slider') {
            newComp.p1 = { id: '', type: 'fixed', x: 0, y: 0 };
            newComp.p2 = { id: '', type: 'fixed', x: 100, y: 0 };
            newComp.p3 = { id: '', type: 'floating', x: 50, y: 0 };
            newComp.sign = 1;
        } else if (type === 'polygon') {
            newComp.points = []; // Empty initially
            newComp.isInput = false;
        } else if (type === 'hole') {
            newComp.p1 = { id: '', type: 'existing' };
            newComp.p2 = { id: '', type: 'existing' };
            newComp.r1Param = id + '_r1';
            newComp.r2Param = id + '_r2';
            newComp.sign = -1;
        }

        this.components.push(newComp);
        this.selectedComponentIndex = this.components.length - 1;
        this.render();
    }

    selectComponent(index) {
        this.selectedComponentIndex = index;
        this.render();
    }

    updateCompProp(prop, val) {
        if (this.selectedComponentIndex >= 0) {
            this.components[this.selectedComponentIndex][prop] = val;
            const list = $('componentList');
            if (list) list.innerHTML = this.renderComponentList();
        }
    }

    convertSelectedBarToSlider() {
        if (this.selectedComponentIndex < 0) return;
        const bar = this.components[this.selectedComponentIndex];
        if (!bar || bar.type !== 'bar') return;

        const findPointCoords = (pointId) => {
            if (!pointId) return { x: 0, y: 0 };
            for (const comp of this.components) {
                if (comp.type === 'polygon' && comp.points) {
                    const hit = comp.points.find(p => p.id === pointId);
                    if (hit && Number.isFinite(Number(hit.x)) && Number.isFinite(Number(hit.y))) {
                        return { x: Number(hit.x), y: Number(hit.y) };
                    }
                    continue;
                }
                for (const key of ['p1', 'p2', 'p3']) {
                    const pt = comp[key];
                    if (pt && pt.id === pointId && Number.isFinite(Number(pt.x)) && Number.isFinite(Number(pt.y))) {
                        return { x: Number(pt.x), y: Number(pt.y) };
                    }
                }
            }
            return { x: 0, y: 0 };
        };

        const ids = new Set(this.getAllPointIds());
        let sIdx = 1;
        while (ids.has(`S${sIdx}`)) sIdx++;
        const sliderPointId = `S${sIdx}`;

        // 🌟 核心修正：直接使用原桿件的 P1, P2 作為軌道端點
        // 這樣可以保留原有的幾何設定與參數關聯
        const p1 = bar.p1;
        const p2 = bar.p2;

        // 計算中點作為滑塊初始位置
        const p1Coords = findPointCoords(p1.id);
        const p2Coords = findPointCoords(p2.id);
        const midX = (p1Coords.x + p2Coords.x) / 2;
        const midY = (p1Coords.y + p2Coords.y) / 2;
        const midLen = Math.hypot(midX - p1Coords.x, midY - p1Coords.y);

        const sliderComp = {
            type: 'slider',
            id: `Slider${sIdx}`,
            color: '#8e44ad',
            p1: { ...p1 }, // Copy P1
            p2: { ...p2 }, // Copy P2
            p3: { id: sliderPointId, type: 'floating', x: midX, y: midY },
            sign: 1,
            lenParam: bar.lenParam, // 保留長度參數，用於生成實體桿件
            trackLenParam: bar.lenParam ? `${bar.lenParam}_track` : '',
            trackOffsetParam: bar.lenParam ? `${bar.lenParam}_offset` : ''
        };

        // 如果原桿件有長度參數，確保它被保留在 topology.params 中
        if (bar.lenParam) {
            // 這裡其實不需要特別做什麼，因為 compileTopology 會處理
            // 但為了保險起見，我們確認一下
            if (!this.topology.params) this.topology.params = { theta: 0 };
            // 如果參數不存在，才初始化 (避免覆蓋使用者設定)
            if (this.topology.params[bar.lenParam] === undefined) {
                const fullLen = Math.hypot(p2Coords.x - p1Coords.x, p2Coords.y - p1Coords.y);
                this.topology.params[bar.lenParam] = Math.round(fullLen);
            }

            const fullLen = Math.hypot(p2Coords.x - p1Coords.x, p2Coords.y - p1Coords.y);
            const totalLenVal = Math.round(fullLen * 0.5);
            const holeD = Number.isFinite(Number(this.topology?.params?.holeD))
                ? Number(this.topology.params.holeD)
                : 3.2;
            const offsetVal = Math.max(1, Math.round(holeD * 3));

            if (sliderComp.trackLenParam && this.topology.params[sliderComp.trackLenParam] === undefined) {
                this.topology.params[sliderComp.trackLenParam] = totalLenVal;
            }
            if (sliderComp.trackOffsetParam && this.topology.params[sliderComp.trackOffsetParam] === undefined) {
                this.topology.params[sliderComp.trackOffsetParam] = offsetVal;
            }
        }

        this.components.splice(this.selectedComponentIndex, 1, sliderComp);
        // this.selectedComponentIndex remains the same as we replaced the item at that index
        this.render();
        this.syncTopology();
    }

    convertBarToSliderById(barId) {
        const idx = this.components.findIndex(c => c.id === barId && c.type === 'bar');
        if (idx < 0) return;
        this.selectedComponentIndex = idx;
        this.convertSelectedBarToSlider();
    }

    updateSliderDriverParam(driverId, val) {
        const driver = this.components.find(c => c.id === driverId && c.type === 'bar');
        if (!driver) return;
        driver.lenParam = val;
        const list = $('componentList');
        if (list) list.innerHTML = this.renderComponentList();
    }

    updatePointProp(pointKey, prop, val) {
        if (this.selectedComponentIndex >= 0) {
            const comp = this.components[this.selectedComponentIndex];
            if (comp.type === 'polygon') {
                // Handle polygon point update
                const idx = parseInt(pointKey.replace('p', ''));
                if (comp.points && comp.points[idx]) {
                    comp.points[idx][prop] = val;
                    if (prop === 'type') this.render();
                }
                return;
            }

            if (!comp[pointKey]) comp[pointKey] = { id: '', type: 'floating', x: 0, y: 0 };
            comp[pointKey][prop] = val;
            if (prop === 'type') this.render();
        }
    }

    removeSelected() {
        if (this.selectedComponentIndex >= 0) {
            this.components.splice(this.selectedComponentIndex, 1);
            this.selectedComponentIndex = -1;
            this.render();
            this.syncTopology();
        }
    }

    getAllPointIds() {
        const ids = new Set();
        this.components.forEach(c => {
            if (c.type === 'polygon' && c.points) {
                c.points.forEach(p => { if (p.id) ids.add(p.id); });
            } else {
                ['p1', 'p2', 'p3'].forEach(k => {
                    if (c[k] && c[k].id) ids.add(c[k].id);
                });
            }
        });
        return Array.from(ids).sort();
    }

    updateNestedHoleProp(linkId, holeIdx, prop, val) {
        const bar = this.components.find(c => c.id === linkId);
        if (bar && bar.holes && bar.holes[holeIdx]) {
            bar.holes[holeIdx][prop] = val;
            this.syncTopology();
        }
    }

    removeNestedHole(linkId, holeId) {
        const bar = this.components.find(c => c.id === linkId);
        if (bar && bar.holes) {
            bar.holes = bar.holes.filter(h => h.id !== holeId);
            this.render();
            this.syncTopology();
        }
    }

    getSolvedPointIds() {
        const solved = new Set();
        // 1. 固定點
        this.components.forEach(c => {
            if (c.type === 'polygon' && c.points) {
                c.points.forEach(p => { if (p.type === 'fixed' && p.id) solved.add(p.id); });
            } else {
                ['p1', 'p2', 'p3'].forEach(k => {
                    if (c[k] && c[k].type === 'fixed' && c[k].id) solved.add(c[k].id);
                });
            }
        });

        // 2. 迭代求解其餘點 (含馬達與智慧連桿推導)
        let changed = true;
        while (changed) {
            changed = false;
            this.components.forEach(c => {
                // 馬達帶動
                if (c.type === 'bar' && c.isInput) {
                    if (c.p1?.id && solved.has(c.p1.id) && c.p2?.id && !solved.has(c.p2.id)) {
                        solved.add(c.p2.id); changed = true;
                    }
                }
                // 三角形或孔位
                if (c.type === 'triangle' || c.type === 'hole') {
                    const p3Id = c.type === 'triangle' ? c.p3?.id : c.id;
                    if (c.p1?.id && c.p2?.id && p3Id && solved.has(c.p1.id) && solved.has(c.p2.id) && !solved.has(p3Id)) {
                        solved.add(p3Id); changed = true;
                    }
                }
                // Polygon Rigid Body Logic
                if (c.type === 'polygon' && c.points) {
                    // If any 2 points are solved, the whole rigid body is solved (in 2D)
                    const solvedCount = c.points.filter(p => p.id && solved.has(p.id)).length;
                    if (solvedCount >= 2) {
                        c.points.forEach(p => {
                            if (p.id && !solved.has(p.id)) {
                                solved.add(p.id); changed = true;
                            }
                        });
                    }
                }
            });

            // 智慧連桿推導：任何點若連帶著兩根「另一端已解」的桿件，則該點已解
            const allPointIds = this.getAllPointIds();
            allPointIds.forEach(jId => {
                if (solved.has(jId)) return;
                const relatedBars = this.components.filter(c => c.type === 'bar' && !c.isInput && (c.p1.id === jId || c.p2.id === jId));
                const solvableConnections = relatedBars.filter(b => {
                    const otherId = (b.p1.id === jId ? b.p2.id : b.p1.id);
                    return solved.has(otherId);
                });
                if (solvableConnections.length >= 2) {
                    solved.add(jId);
                    changed = true;
                }
            });
        }
        return solved;
    }

    getUnsolvedSummary() {
        const solved = this.getSolvedPointIds();
        const lines = [];

        this.components.forEach(c => {
            if (c.type !== 'bar' && c.type !== 'triangle' && c.type !== 'slider') return;
            if (this.isComponentSolved(c, solved)) return;

            const pointKeys = c.type === 'bar' ? ['p1', 'p2'] : ['p1', 'p2', 'p3'];
            const missing = [];
            pointKeys.forEach(key => {
                const pt = c[key];
                if (!pt || !pt.id) {
                    missing.push(`${key.toUpperCase()}未指定`);
                    return;
                }
                if (!solved.has(pt.id)) {
                    missing.push(pt.id);
                }
            });

            if (missing.length) {
                lines.push(`- ${c.id || c.type}: 缺少點位 ${missing.join(', ')}`);
            }
        });

        if (!lines.length) return '';
        return `未求解原因:\n${lines.join('\n')}`;
    }

    isComponentSolved(comp, solvedPoints) {
        if (comp.type === 'bar') {
            return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id);
        } else if (comp.type === 'triangle') {
            return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id) && solvedPoints.has(comp.p3?.id);
        } else if (comp.type === 'slider') {
            return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id) && solvedPoints.has(comp.p3?.id);
        }
        return false;
    }

    reset() {
        if (confirm('確定要重置所有設計嗎？')) {
            this.components = [];
            this.selectedComponentIndex = -1;
            this.topology.params = { theta: 0 }; // 🌟 徹底清空參數
            this.render();
            this.syncTopology();
        }
    }

    syncTopology() {
        this.compileTopology();
        if (this.onUpdate) this.onUpdate(this.topology);
    }

    compileTopology() {
        const steps = [];
        const visualization = { links: [], polygons: [], joints: [] };
        const parts = [];
        const params = this.topology.params || { theta: 0 };
        const joints = new Set();
        const polygons = [];
        const solvedPoints = this.getSolvedPointIds();
        const allPointsMap = new Map();

        // 收集座標與屬性 (智慧合併：fixed/input 優先權高於 existing)
        this.components.forEach(c => {
            if (c.type === 'polygon' && c.points) {
                c.points.forEach(p => {
                    if (p.id) {
                        const existing = allPointsMap.get(p.id);
                        const isStronger = (p.type === 'fixed');
                        const isEmpty = !existing || existing.type === 'existing';

                        if (isStronger || isEmpty || (p.x !== undefined && existing?.x === undefined)) {
                            allPointsMap.set(p.id, {
                                x: p.x ?? existing?.x,
                                y: p.y ?? existing?.y,
                                type: (isStronger ? p.type : (existing?.type || p.type))
                            });
                        }
                    }
                });
            } else {
                ['p1', 'p2', 'p3'].forEach(k => {
                    if (c[k] && c[k].id) {
                        const existing = allPointsMap.get(c[k].id);
                        // 只有當新屬性更「強」(例如 fixed) 或者舊屬性是空的/existing 時，才更新
                        const isStronger = (c[k].type === 'fixed' || (c[k].type === 'input' && (!existing || existing.type !== 'fixed')));
                        const isEmpty = !existing || existing.type === 'existing';

                        if (isStronger || isEmpty || (c[k].x !== undefined && existing?.x === undefined)) {
                            allPointsMap.set(c[k].id, {
                                x: c[k].x ?? existing?.x,
                                y: c[k].y ?? existing?.y,
                                type: (isStronger ? c[k].type : (existing?.type || c[k].type))
                            });
                        }
                    }
                });
            }
        });

        // 1. Ground 步驟
        allPointsMap.forEach((info, id) => {
            if (info.type === 'fixed') {
                const step = { id, type: 'ground', x: parseFloat(info.x) || 0, y: parseFloat(info.y) || 0 };

                // 🌟 核心增強：支援固定桿 (Ground Bar) 動態調整
                // 檢查是否有連桿連接此固定點與另一個「已處理過」的固定點
                // 1. Check for Bar
                let groundLink = this.components.find(c => {
                    if (c.type !== 'bar' || !c.lenParam) return false;
                    if (c.p1.id !== id && c.p2.id !== id) return false; // 🌟 必須連接到當前點
                    const otherId = (c.p1.id === id) ? c.p2.id : c.p1.id;
                    const otherPt = allPointsMap.get(otherId);
                    return otherPt && otherPt.type === 'fixed' && steps.find(s => s.id === otherId);
                });

                // 2. Check for Triangle Base (P1-P2)
                if (!groundLink) {
                    groundLink = this.components.find(c => {
                        if (c.type !== 'triangle' || !c.gParam) return false;
                        // Triangle base is P1-P2
                        if (c.p1.id !== id && c.p2.id !== id) return false;
                        const otherId = (c.p1.id === id) ? c.p2.id : c.p1.id;
                        // Ensure we are talking about P1-P2 edge
                        if ((c.p1.id === id && c.p2.id === otherId) || (c.p2.id === id && c.p1.id === otherId)) {
                            const otherPt = allPointsMap.get(otherId);
                            return otherPt && otherPt.type === 'fixed' && steps.find(s => s.id === otherId);
                        }
                        return false;
                    });
                }

                // 3. Check for Slider Track (P1-P2)
                if (!groundLink) {
                    groundLink = this.components.find(c => {
                        if (c.type !== 'slider' || !c.lenParam) return false;
                        if (c.p1.id !== id && c.p2.id !== id) return false;
                        const otherId = (c.p1.id === id) ? c.p2.id : c.p1.id;
                        const otherPt = allPointsMap.get(otherId);
                        return otherPt && otherPt.type === 'fixed' && steps.find(s => s.id === otherId);
                    });
                }

                if (groundLink) {
                    const otherId = (groundLink.p1.id === id) ? groundLink.p2.id : groundLink.p1.id;
                    const otherPt = allPointsMap.get(otherId);
                    if (otherPt) {
                        const dx = info.x - otherPt.x;
                        const dy = info.y - otherPt.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist > 0) {
                        // Use lenParam for Bar/Slider, gParam for Triangle
                        step.dist_param = (groundLink.type === 'triangle') ? groundLink.gParam : groundLink.lenParam;
                            step.ref_id = otherId;
                            step.ux = dx / dist; // 單位向量 X
                            step.uy = dy / dist; // 單位向量 Y
                            delete step.x;
                            delete step.y;
                        }
                    }
                }

                steps.push(step);
                joints.add(id);
            }
        });

        // 🌟 Prepare Virtual Components for Polygons
        // Decompose polygons into bars for the solver
        const virtualComponents = [...this.components];
        this.components.forEach(c => {
            if (c.type === 'polygon' && c.points && c.points.length >= 3) {
                // 1. Perimeter
                for (let i = 0; i < c.points.length; i++) {
                    const p1 = c.points[i];
                    const p2 = c.points[(i + 1) % c.points.length];
                    virtualComponents.push({
                        type: 'bar',
                        id: `${c.id}_edge_${i}`,
                        p1: p1,
                        p2: p2,
                        lenParam: `${c.id}_L${i + 1}`, // e.g. Poly1_L1
                        isVirtual: true
                    });
                }
                // 2. Triangulation (Fan from P0)
                // Connect P0 to P2, P3... P(n-2)
                for (let i = 2; i < c.points.length - 1; i++) {
                    const p1 = c.points[0];
                    const p2 = c.points[i];
                    virtualComponents.push({
                        type: 'bar',
                        id: `${c.id}_diag_${i}`,
                        p1: p1,
                        p2: p2,
                        lenParam: `${c.id}_D${i}`, // e.g. Poly1_D2
                        isVirtual: true
                    });
                }

                // Add to visualization
                polygons.push({
                    points: c.points.map(p => p.id),
                    color: c.color || '#e67e22'
                });
            }
        });

        // 2. Input Crank 步驟
        virtualComponents.filter(c => c.type === 'bar' && c.isInput).forEach(c => {
            if (c.p1?.id && c.p2?.id && solvedPoints.has(c.p1.id)) {
                steps.push({
                    id: c.p2.id,
                    type: 'input_crank',
                    center: c.p1.id,
                    len_param: c.lenParam,
                    phase_offset: c.phaseOffset || 0 // 🌟 帶入角度偏移
                });
                joints.add(c.p2.id);
            }
        });

        // 🎯 智慧連桿自動解法 (Auto-Dyad Inference)
        // 針對那些只是普通 Bar 連接而成的關節點，自動產生 dyad 步
        // 🌟 Use virtualComponents to include polygon edges
        const bars = virtualComponents.filter(c => c.type === 'bar' && !c.isInput);
        const unsolvedJoints = Array.from(allPointsMap.keys()).filter(id => !steps.find(s => s.id === id));

        unsolvedJoints.forEach(jId => {
            // 找連到這個點的所有桿件
            const relatedBars = bars.filter(b => b.p1.id === jId || b.p2.id === jId);
            if (relatedBars.length >= 2) {
                // 如果有至少兩根連桿的另一端是已解的，這就是一個 Dyad
                const solvableConnections = relatedBars.filter(b => {
                    const otherId = (b.p1.id === jId ? b.p2.id : b.p1.id);
                    return steps.find(s => s.id === otherId);
                });

                if (solvableConnections.length >= 2) {
                    const b1 = solvableConnections[0];
                    const b2 = solvableConnections[1];
                    const p1Id = (b1.p1.id === jId ? b1.p2.id : b1.p1.id);
                    const p2Id = (b2.p1.id === jId ? b2.p2.id : b2.p1.id);

                    // 檢查是否已經有這個 Dyad 了
                    if (!steps.find(s => s.id === jId)) {
                        steps.push({
                            id: jId,
                            type: 'dyad',
                            p1: p1Id, r1_param: b1.lenParam,
                            p2: p2Id, r2_param: b2.lenParam,
                            sign: 1 // 這裡方向可能需要智慧判定，暫設 1
                        });
                        joints.add(jId);
                    }
                }
            }
        });

        // 3. Dyad 步驟 (Triangle) & Nested Holes
        this.components.forEach(c => {
            if (c.type === 'slider' && c.p1?.id && c.p2?.id && c.p3?.id) {
                const sliderId = c.p3.id;
                const driver = c.driverId ? this.components.find(b => b.id === c.driverId && b.type === 'bar') : this.components.find(b => b.type === 'bar' && b.lenParam && (b.p1?.id === sliderId || b.p2?.id === sliderId));
                if (driver) {
                    const otherId = driver.p1.id === sliderId ? driver.p2.id : driver.p1.id;
                    steps.push({
                        id: sliderId,
                        type: 'slider',
                        p1: otherId,
                        r_param: driver.lenParam,
                        line_p1: c.p1.id,
                        line_p2: c.p2.id,
                        sign: c.sign || 1
                    });
                    joints.add(sliderId);
                } else {
                    steps.push({ id: sliderId, type: 'joint', x: Number(c.p3.x || 0), y: Number(c.p3.y || 0) });
                    joints.add(sliderId);
                }
                visualization.links.push({
                    id: `${c.id}_track`,
                    p1: c.p1.id,
                    p2: c.p2.id,
                    color: c.color || '#8e44ad',
                    style: 'track'
                });
            }
            if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
                steps.push({
                    id: c.p3.id, type: 'rigid_triangle', p1: c.p1.id, p2: c.p2.id,
                    r1_param: c.r1Param, r2_param: c.r2Param, g_param: c.gParam, sign: c.sign || 1
                });
                polygons.push({ points: [c.p1.id, c.p2.id, c.p3.id], color: c.color, alpha: 0.3 });
                joints.add(c.p3.id);
            }

            // 🌟 處理桿件內部的孔位
            if (c.type === 'bar' && c.holes) {
                c.holes.forEach(h => {
                    steps.push({
                        id: h.id, type: 'point_on_link', p1: c.p1.id, p2: c.p2.id,
                        dist_param: h.distParam
                    });
                    joints.add(h.id);
                });
            }
        });

        // 4. 其他點位 (靜態顯示)
        // 🌟 修正：只顯示確實被組件使用的點，不顯示暫存產生的雜點
        allPointsMap.forEach((info, id) => {
            const isUsed = Array.from(joints).includes(id) ||
                this.components.some(c => (c.p1?.id === id || c.p2?.id === id || c.p3?.id === id));

            if (isUsed && !steps.find(s => s.id === id)) {
                steps.push({ id, type: 'joint', x: Number(info.x) || 0, y: Number(info.y) || 0 });
                joints.add(id);
            }
        });

        // 5. Links 視覺化
        this.components.forEach(c => {
            if (c.type === 'bar' && c.p1?.id && c.p2?.id) {
                visualization.links.push({
                    id: c.id,
                    p1: c.p1.id,
                    p2: c.p2.id,
                    color: c.color,
                    style: c.isInput ? 'crank' : 'normal',
                    lenParam: c.lenParam,
                    hidden: Boolean(c.hidden)
                });
            } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
                if (c.gParam) {
                    visualization.links.push({
                        id: `${c.id}_base`,
                        p1: c.p1.id,
                        p2: c.p2.id,
                        color: c.color,
                        lenParam: c.gParam,
                        hidden: true
                    });
                }
                visualization.links.push({ p1: c.p1.id, p2: c.p3.id, color: c.color });
                visualization.links.push({ p1: c.p2.id, p2: c.p3.id, color: c.color });
                visualization.links.push({ p1: c.p1.id, p2: c.p2.id, color: c.color, style: 'dashed' });
            }
        });

        // 6. 參數收集
        this.components.forEach(c => {
            if (c.type === 'bar') {
                if (c.lenParam && params[c.lenParam] === undefined) {
                    const p1 = allPointsMap.get(c.p1.id);
                    const p2 = allPointsMap.get(c.p2.id);
                    params[c.lenParam] = (p1 && p2) ? Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)) : 100;
                }
                // 收集巢狀孔位參數
                if (c.holes) {
                    c.holes.forEach(h => {
                        if (params[h.distParam] === undefined) params[h.distParam] = 50;
                    });
                }
            } else if (c.type === 'slider') {
                // 🌟 收集 Slider 軌道參數
                if (c.trackLenParam && params[c.trackLenParam] === undefined) {
                    // 預設長度：計算 P1-P2 距離
                    const p1 = allPointsMap.get(c.p1.id);
                    const p2 = allPointsMap.get(c.p2.id);
                    params[c.trackLenParam] = (p1 && p2) ? Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)) : 200;
                }
                if (c.trackOffsetParam && params[c.trackOffsetParam] === undefined) {
                    // 預設偏移：10
                    params[c.trackOffsetParam] = 10;
                }
            } else if (c.type === 'triangle') {
                // 🌟 Initialize parameters from geometry if undefined
                if (c.r1Param && params[c.r1Param] === undefined) {
                    const p1 = allPointsMap.get(c.p1.id);
                    const p3 = allPointsMap.get(c.p3.id);
                    params[c.r1Param] = (p1 && p3) ? Math.round(Math.sqrt((p3.x - p1.x) ** 2 + (p3.y - p1.y) ** 2)) : 100;
                }
                if (c.r2Param && params[c.r2Param] === undefined) {
                    const p2 = allPointsMap.get(c.p2.id);
                    const p3 = allPointsMap.get(c.p3.id);
                    params[c.r2Param] = (p2 && p3) ? Math.round(Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2)) : 100;
                }
                if (c.gParam && params[c.gParam] === undefined) {
                    const p1 = allPointsMap.get(c.p1.id);
                    const p2 = allPointsMap.get(c.p2.id);
                    params[c.gParam] = (p1 && p2) ? Math.round(Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)) : 100;
                }
            }
        });

        this.topology = {
            steps,
            tracePoint: this.topology.tracePoint || Array.from(joints)[0] || '',
            visualization: { links: visualization.links, polygons, joints: Array.from(joints) },
            parts: this.components.map(c => {
                if (c.skipPart) return null;
                if (c.type === 'bar') {
                    return { id: `${c.id}(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color };
                } else if (c.type === 'triangle') {
                    return { id: c.id, type: 'triangle', len_params: [c.gParam, c.r1Param, c.r2Param], color: c.color };
                } else if (c.type === 'slider') {
                    // 🌟 核心修正：Slider 組件也生成實體 Bar 零件 (作為軌道)
                    let lenVal = c.lenParam;

                    // 如果沒有參數，則直接計算長度
                    if (!lenVal && c.p1 && c.p2) {
                        const p1 = allPointsMap.get(c.p1.id);
                        const p2 = allPointsMap.get(c.p2.id);
                        if (p1 && p2) {
                            lenVal = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                        }
                    }

                    if (lenVal) {
                        return {
                            id: `${c.id}_Track`,
                            type: 'bar',
                            len_param: lenVal,
                            total_len_param: c.trackLenParam,
                            offset_param: c.trackOffsetParam,
                            isTrack: true,
                            color: c.color
                        };
                    }
                }
                return null;
            }).filter(p => p),
            params,
            _wizard_data: this.components
        };
    }

    async loadTemplate(id) {
        const template = EXAMPLE_TEMPLATES.find(t => t.id === id);
        if (!template) return;

        try {
            const resp = await fetch(template.file);
            if (!resp.ok) throw new Error(`Failed to load template: ${resp.statusText}`);
            const topo = await resp.json();

            if (topo) {
                // Deep copy to avoid reference issues
                this.components = JSON.parse(JSON.stringify(topo._wizard_data || []));
                this.topology = JSON.parse(JSON.stringify(topo));
                this.render();
                this.syncTopology();
            }
        } catch (e) {
            console.error('Template Load Error:', e);
            alert('無法載入範本，請檢查檔案是否存在。');
        }
    }
}
