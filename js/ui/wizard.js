/**
 * Mechanism Wizard UI (Component-Based)
 * 機構小幫手 - 組件式建構多連桿機構
 */

import { $ } from '../utils.js';
import { updateDynamicParams } from './controls.js';
import * as Templates from '../multilink/templates.js';
import { EXAMPLE_TEMPLATES } from '../examples/index.js';
import { compileTopology } from '../core/topology.js';
import { getSolvedPointIds as coreGetSolvedPointIds, isComponentSolved as coreIsComponentSolved, getUnsolvedSummary as coreGetUnsolvedSummary } from '../core/solver-status.js';

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
        if (window.DEBUG_WIZARD) {
            console.log('[Wizard] Adding component from canvas:', points);
        }

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
        if (window.DEBUG_WIZARD) {
            console.log('[Wizard] Adding link from canvas:', p1Data, p2Data);
        }

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
                if (c.holes) {
                    c.holes.forEach(h => { if (h.id) ids.add(h.id); });
                }
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
        return coreGetSolvedPointIds(this.components);
    }

    getUnsolvedSummary() {
        return coreGetUnsolvedSummary(this.components);
    }

    isComponentSolved(comp, solvedPoints) {
        return coreIsComponentSolved(comp, solvedPoints);
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
        this.topology = compileTopology(this.components, this.topology, this.getSolvedPointIds());
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
