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
                <h4 style="margin: 0; font-size: 14px; color: #34495e; display: flex; align-items: center; gap: 5px;">
                    🛠️ 機構設計器 <button id="btnWizardReset" style="font-size: 10px; padding: 2px 6px; cursor: pointer; background: #fff; border: 1px solid #ddd; border-radius: 4px; color: #e74c3c;">🗑️ 重置</button>
                </h4>
                <select id="templateSelect" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid #ddd;">
                    <option value="">-- 載入範本 --</option>
                    ${optionsHtml}
                </select>
            </div>
            
            <div style="display: flex; gap: 10px; padding: 10px; background: #fff;">
                <button id="btnAddBar" style="flex: 1; padding: 8px; background: #3498db; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    📏 新增二孔桿
                </button>
                <button id="btnAddTriangle" style="flex: 1; padding: 8px; background: #27ae60; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    📐 新增三角桿
                </button>
            </div>

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
            const icon = c.type === 'bar' ? '📏' : (c.type === 'triangle' ? '📐' : '⚪');
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

        const icon = comp.type === 'bar' ? '📏' : (comp.type === 'triangle' ? '📐' : '⚪');
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
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">解方向</label>
                    <select onchange="window.wizard.updateCompProp('sign', parseInt(this.value))" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff;">
                        <option value="1" ${comp.sign === 1 ? 'selected' : ''}>正向 (+1)</option>
                        <option value="-1" ${comp.sign === -1 ? 'selected' : ''}>反向 (-1)</option>
                    </select>
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
        const btnAddBar = $('btnAddBar');
        const btnAddTriangle = $('btnAddTriangle');
        const btnReset = $('btnWizardReset');
        const btnApply = $('btnWizardApply');
        const templateSelect = $('templateSelect');

        if (btnAddBar) btnAddBar.onclick = () => this.addComponent('bar');
        if (btnAddTriangle) btnAddTriangle.onclick = () => this.addComponent('triangle');
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
        let id = type === 'bar' ? `Link${count}` : (type === 'triangle' ? `Tri${count}` : `H${count}`);
        const newComp = { type, id, color: type === 'bar' ? '#3498db' : (type === 'triangle' ? '#27ae60' : '#2d3436') };

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
            newComp.sign = 1;
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

    updatePointProp(pointKey, prop, val) {
        if (this.selectedComponentIndex >= 0) {
            const comp = this.components[this.selectedComponentIndex];
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
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].id) ids.add(c[k].id);
            });
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
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].type === 'fixed' && c[k].id) solved.add(c[k].id);
            });
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

    isComponentSolved(comp, solvedPoints) {
        if (comp.type === 'bar') {
            return solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id);
        } else if (comp.type === 'triangle') {
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
        });

        // 1. Ground 步驟
        allPointsMap.forEach((info, id) => {
            if (info.type === 'fixed') {
                steps.push({ id, type: 'ground', x: parseFloat(info.x) || 0, y: parseFloat(info.y) || 0 });
                joints.add(id);
            }
        });

        // 2. Input Crank 步驟
        this.components.filter(c => c.type === 'bar' && c.isInput).forEach(c => {
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
        const bars = this.components.filter(c => c.type === 'bar' && !c.isInput);
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
            if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
                steps.push({
                    id: c.p3.id, type: 'dyad', p1: c.p1.id, p2: c.p2.id,
                    r1_param: c.r1Param, r2_param: c.r2Param, sign: c.sign || 1
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
                visualization.links.push({ id: c.id, p1: c.p1.id, p2: c.p2.id, color: c.color, style: c.isInput ? 'crank' : 'normal', lenParam: c.lenParam });
            } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
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
            } else if (c.type === 'triangle') {
                if (c.r1Param && params[c.r1Param] === undefined) params[c.r1Param] = 100;
                if (c.r2Param && params[c.r2Param] === undefined) params[c.r2Param] = 100;
            }
        });

        this.topology = {
            steps,
            tracePoint: this.topology.tracePoint || Array.from(joints)[0] || '',
            visualization: { links: visualization.links, polygons, joints: Array.from(joints) },
            parts: this.components.filter(c => c.type === 'bar').map(c => ({ id: `${c.id}(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color })),
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
