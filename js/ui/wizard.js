/**
 * Mechanism Wizard UI (Component-Based)
 * 機構小幫手 - 組件式建構多連桿機構
 */

import { $ } from '../utils.js';
import { updateDynamicParams } from './controls.js';
import * as Templates from '../multilink/templates.js';
import { JANSEN_TOPOLOGY } from '../jansen/topology.js';

export class MechanismWizard {
    constructor(containerId, onUpdate) {
        this.container = $(containerId);
        this.onUpdate = onUpdate;

        // 組件化資料結構
        this.components = []; // { type: 'bar'|'triangle', id, ...props }
        this.selectedComponentIndex = -1;

        // 最終生成的拓撲 (供 Solver 使用)
        this.topology = {
            steps: [],
            tracePoint: '',
            visualization: { links: [], polygons: [], joints: [] },
            parts: []
        };
    }

    init(initialTopology) {
        // 嘗試從拓撲中恢復組件資料 (如果存在)
        if (initialTopology && initialTopology._wizard_data) {
            this.components = JSON.parse(JSON.stringify(initialTopology._wizard_data));
        } else {
            this.components = [];
        }
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="wizard-card" style="border: 1px solid #e0e0e0; border-radius: 12px; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; height: 600px; font-family: system-ui, -apple-system, sans-serif; margin-bottom: 15px;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: #f8f9fa; border-bottom: 1px solid #eee;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <h4 style="margin: 0; color: #2c3e50; font-size: 14px; display: flex; align-items: center; gap: 5px;">
                            <span style="font-size: 16px;">🛠️</span> 機構設計器
                        </h4>
                        <button id="btnWizardReset" style="background: #fff; border: 1px solid #ff7675; color: #ff7675; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">🗑️ 重置</button>
                    </div>
                    <select id="templateSelect" style="font-size: 10px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; max-width: 150px;">
                        <option value="">-- 範本 --</option>
                        <option value="CRANK_ROCKER">曲柄搖桿</option>
                        <option value="CHEBYSHEV">直線機構</option>
                    </select>
                </div>
                
                <!-- Add Buttons (Top of Right Panel) -->
                <div style="padding: 10px; background: #fff; border-bottom: 1px solid #f0f0f0; display: flex; gap: 6px;">
                    <button id="btnAddBar" style="flex: 1; background: #3498db; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span>📏</span> 新增二孔桿
                    </button>
                    <button id="btnAddTriangle" style="flex: 1; background: #27ae60; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span>📐</span> 新增三角桿
                    </button>
                </div>

                <!-- Main Content (Two Columns) -->
                <div style="display: flex; flex: 1; overflow: hidden;">
                    <!-- Left: Component List -->
                    <div style="width: 140px; border-right: 1px solid #eee; display: flex; flex-direction: column; background: #fcfcfc;">
                        <div id="componentList" style="flex: 1; overflow-y: auto; padding: 5px;">
                            ${this.renderComponentList()}
                        </div>
                    </div>

                    <!-- Right: Property Editor -->
                    <div id="propertyEditor" style="flex: 1; padding: 15px; overflow-y: auto; background: #fff;">
                        ${this.renderPropertyEditor()}
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding: 8px 15px; background: #f8f9fa; border-top: 1px solid #eee; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <label style="font-size: 11px; color: #555;">追蹤點：</label>
                            <select id="tracePointSelect" style="font-size: 11px; padding: 2px 5px; border-radius: 4px; border: 1px solid #ccc;">
                                <option value="">-- 無 --</option>
                                ${this.getAllPointIds().map(p => `<option value="${p}" ${this.topology.tracePoint === p ? 'selected' : ''}>${p}</option>`).join('')}
                            </select>
                        </div>
                        <button id="btnWizardApply" class="btn-primary" style="padding: 5px 15px; font-size: 12px; font-weight: bold; border-radius: 4px;">🚀 套用更新</button>
                    </div>
                </div>
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
            const icon = c.type === 'bar' ? '📏' : '📐';
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
                    ${!isSolved ? '<span title="此桿件目前無法求解（點位未定義或斷開）" style="color: #ff7675; font-size: 10px;">⚠️</span>' : ''}
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

        const icon = comp.type === 'bar' ? '📏' : '📐';
        const solvedPoints = this.getSolvedPointIds();
        const isSolved = this.isComponentSolved(comp, solvedPoints);

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #f8f9fa;">
                <h5 style="margin: 0; font-size: 14px; color: #2c3e50; display: flex; align-items: center; gap: 5px;">
                    ${icon} 編輯桿件 ${!isSolved ? '<span style="color: #ff7675; font-size: 12px;">(⚠️ 未求解)</span>' : ''}
                </h5>
                <button onclick="window.wizard.removeSelected()" style="background: #fff; border: 1px solid #ff7675; color: #ff7675; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">刪除</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">桿件名稱 (ID)</label>
                    <input type="text" value="${comp.id || ''}" oninput="window.wizard.updateCompProp('id', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">顏色</label>
                    <input type="color" value="${comp.color || '#3498db'}" oninput="window.wizard.updateCompProp('color', this.value)" style="width: 100%; height: 30px; padding: 2px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
                </div>
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
            `;
        } else if (comp.type === 'triangle') {
            html += `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">基準點 1 (P1)</label>
                    ${this.renderPointEditor(comp, 'p1')}
                </div>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 8px; border-bottom: 1px solid #ddd;">基準點 2 (P2)</label>
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
                    <select onchange="window.wizard.updatePointProp('${pointKey}', 'type', this.value)" style="flex: 1; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="fixed" ${pt.type === 'fixed' ? 'selected' : ''}>📍 固定 (Fixed)</option>
                        <option value="existing" ${pt.type === 'existing' ? 'selected' : ''}>🔗 現有 (Existing)</option>
                        <option value="floating" ${pt.type === 'floating' ? 'selected' : ''}>☁️ 浮動 (Floating)</option>
                    </select>
                </div>

                ${pt.type === 'existing' ? `
                    <select onchange="window.wizard.updatePointProp('${pointKey}', 'id', this.value)" style="width: 100%; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                        <option value="">-- 選擇點位 --</option>
                        ${existingPoints.map(id => `<option value="${id}" ${pt.id === id ? 'selected' : ''}>${id}</option>`).join('')}
                    </select>
                ` : `
                    <input type="text" value="${pt.id || ''}" placeholder="點位名稱 (如 O2)" oninput="window.wizard.updatePointProp('${pointKey}', 'id', this.value)" style="width: 100%; padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                `}

                ${pt.type === 'fixed' ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                        <input type="text" value="${pt.x || 0}" placeholder="X" oninput="window.wizard.updatePointProp('${pointKey}', 'x', this.value)" style="padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
                        <input type="text" value="${pt.y || 0}" placeholder="Y" oninput="window.wizard.updatePointProp('${pointKey}', 'y', this.value)" style="padding: 4px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px;">
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
        const traceSelect = $('tracePointSelect');

        if (btnAddBar) btnAddBar.onclick = () => this.addComponent('bar');
        if (btnAddTriangle) btnAddTriangle.onclick = () => this.addComponent('triangle');
        if (btnReset) btnReset.onclick = () => this.reset();
        if (btnApply) btnApply.onclick = () => this.syncTopology();

        if (templateSelect) {
            templateSelect.onchange = (e) => {
                if (e.target.value) this.loadTemplate(e.target.value);
                e.target.value = ''; // 重置選擇器
            };
        }

        if (traceSelect) {
            traceSelect.onchange = (e) => {
                this.topology.tracePoint = e.target.value;
            };
        }
    }

    /**
     * API: 供畫布互動呼叫，建立連桿
     * @param {Object} p1Data - { id, x, y, isNew }
     * @param {Object} p2Data - { id, x, y, isNew }
     */
    addLinkFromCanvas(p1Data, p2Data) {
        const count = this.components.filter(c => c.type === 'bar').length + 1;
        const id = `Link${count}`;

        const newComp = {
            type: 'bar',
            id,
            color: '#3498db',
            lenParam: 'L' + (this.components.length + 1),
            isInput: false
        };

        // 設定 P1
        if (p1Data.isNew) {
            // 空白處 -> Fixed Ground
            newComp.p1 = { id: `O${this.components.length * 2 + 1}`, type: 'fixed', x: Math.round(p1Data.x), y: Math.round(p1Data.y) };
        } else {
            // 現有點 -> Existing
            newComp.p1 = { id: p1Data.id, type: 'existing', x: 0, y: 0 };
        }

        // 設定 P2
        if (p2Data.isNew) {
            // 空白處 -> Fixed Ground
            // 如果 P1 也是 Ground，這就是一根固定的棒子(沒有意義但合法)
            // 如果 P1 是 Existing，P2 是 Ground，這是一根接地桿
            newComp.p2 = { id: `O${this.components.length * 2 + 2}`, type: 'fixed', x: Math.round(p2Data.x), y: Math.round(p2Data.y) };
            newComp.color = '#7f8c8d'; // Ground Link color
        } else {
            // P2 是現有點 -> Existing
            newComp.p2 = { id: p2Data.id, type: 'existing', x: 0, y: 0 };
        }

        // 自動判斷是否為 Input (如果是第一個建立的 Ground -> Existing)
        // 或是簡單規則：若連接 Ground 和 Floating/New，或許是 Input?
        // 這裡先保持預設為 False，讓使用者自己勾選 "馬達驅動"
        // 但如果只有單邊接 Ground，通常可以當 Input
        if ((newComp.p1.type === 'fixed' && newComp.p2.type !== 'fixed') ||
            (newComp.p1.type !== 'fixed' && newComp.p2.type === 'fixed')) {
            // 可能是 Input，標記一下顏色，但不強制設為 True (避免破壞邏輯)
            newComp.color = '#e74c3c';
        }

        this.components.push(newComp);
        this.selectedComponentIndex = this.components.length - 1;
        this.render();
        this.syncTopology();
    }

    addComponent(type) {
        const count = this.components.filter(c => c.type === type).length + 1;
        const id = type === 'bar' ? `Link${count}` : `Tri${count}`;
        const newComp = { type, id, color: type === 'bar' ? '#3498db' : '#27ae60' };

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
            if (prop === 'type') {
                this.render();
            }
        }
    }

    removeSelected() {
        if (this.selectedComponentIndex >= 0) {
            this.components.splice(this.selectedComponentIndex, 1);
            this.selectedComponentIndex = -1;
            this.render();
        }
    }

    getAllPointIds() {
        const ids = new Set();
        this.components.forEach(c => {
            if (c.p1 && c.p1.id) ids.add(c.p1.id);
            if (c.p2 && c.p2.id) ids.add(c.p2.id);
            if (c.p3 && c.p3.id) ids.add(c.p3.id);
        });
        return Array.from(ids);
    }

    getSolvedPointIds() {
        const solved = new Set();

        // 1. Collect all Fixed points
        this.components.forEach(c => {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].type === 'fixed' && c[k].id) {
                    solved.add(c[k].id);
                }
            });
        });

        // 2. Iteratively solve for Crank, Triangle, and Auto-Dyad points
        let changed = true;
        while (changed) {
            changed = false;

            // Build a map of point connections for auto-dyad detection
            const pointConnections = new Map(); // pointId -> Set of solved neighbor pointIds
            this.components.forEach(c => {
                if (c.type === 'bar' && !c.isInput) {
                    const id1 = c.p1?.id;
                    const id2 = c.p2?.id;
                    if (id1 && id2) {
                        if (solved.has(id1)) {
                            if (!pointConnections.has(id2)) pointConnections.set(id2, new Set());
                            pointConnections.get(id2).add(id1);
                        }
                        if (solved.has(id2)) {
                            if (!pointConnections.has(id1)) pointConnections.set(id1, new Set());
                            pointConnections.get(id1).add(id2);
                        }
                    }
                }
            });

            this.components.forEach(c => {
                if (c.type === 'bar' && c.isInput) {
                    // Crank: if p1 is solved, p2 is solved
                    if (c.p1?.id && c.p2?.id && solved.has(c.p1.id) && !solved.has(c.p2.id)) {
                        solved.add(c.p2.id);
                        changed = true;
                    }
                } else if (c.type === 'triangle') {
                    // Triangle: if p1 and p2 are solved, p3 is solved
                    if (c.p1?.id && c.p2?.id && c.p3?.id &&
                        solved.has(c.p1.id) && solved.has(c.p2.id) && !solved.has(c.p3.id)) {
                        solved.add(c.p3.id);
                        changed = true;
                    }
                }
            });

            // Auto-Dyad Detection: if a floating point is connected to TWO solved points
            pointConnections.forEach((neighbors, pointId) => {
                if (!solved.has(pointId) && neighbors.size >= 2) {
                    solved.add(pointId);
                    changed = true;
                }
            });
        }
        return solved;
    }

    isComponentSolved(comp, solvedPoints) {
        if (comp.type === 'bar') {
            if (comp.isInput) return comp.p1?.id && solvedPoints.has(comp.p1.id);
            // A non-input bar is "solved" if both its points are eventually solved
            return comp.p1?.id && comp.p2?.id && solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id);
        }
        if (comp.type === 'triangle') {
            return comp.p1?.id && comp.p2?.id && solvedPoints.has(comp.p1.id) && solvedPoints.has(comp.p2.id);
        }
        return false;
    }

    reset() {
        if (confirm('確定要清除所有桿件嗎？')) {
            this.components = [];
            this.selectedComponentIndex = -1;
            this.render();
            this.syncTopology();
        }
    }

    syncTopology() {
        this.compileTopology();
        if (this.onUpdate) {
            this.onUpdate(this.topology);
        }
        // 觸發動態參數更新
        updateDynamicParams();
    }

    /**
     * 將組件編譯為 Solver 拓撲
     */
    compileTopology() {
        const solvedPoints = this.getSolvedPointIds();
        const steps = [];
        const polygons = [];
        const joints = new Set();
        const parts = [];
        const groundPoints = new Map(); // id -> {x, y, component, role}
        const barComponents = new Map(); // 儲存 bar component 資訊

        // 1. 先收集所有 bar component，判斷哪些點應該參數化
        this.components.forEach(c => {
            if (c.type === 'bar' && !c.isInput && c.lenParam) {
                // 這是一個有參數的固定桿
                barComponents.set(c.id, c);
            }
        });

        // 2. Collect all Fixed points as Grounds
        this.components.forEach(c => {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].type === 'fixed' && c[k].id) {
                    if (!groundPoints.has(c[k].id)) {
                        groundPoints.set(c[k].id, {
                            x: c[k].x || 0,
                            y: c[k].y || 0,
                            component: c,
                            role: k  // 記錄是 p1 還是 p2
                        });
                    }
                }
            });
        });

        // 3. 處理 ground points，智能判斷是否需要參數化
        groundPoints.forEach((info, id) => {
            const step = { id, type: 'ground' };
            const pos = info;
            const comp = info.component;

            // 🎯 關鍵邏輯：如果這個點屬於一個有 lenParam 的 bar，且是 p2（第二個點）
            // 則根據 p1 和 p2 的初始座標計算角度，並使用參數化座標
            if (comp.type === 'bar' && comp.lenParam && info.role === 'p2' && comp.p1) {
                const p1 = comp.p1;
                const p2 = comp.p2;

                // 計算初始角度
                const dx = parseFloat(p2.x) - parseFloat(p1.x);
                const dy = parseFloat(p2.y) - parseFloat(p1.y);
                const angle = Math.atan2(dy, dx);
                const initialLength = Math.sqrt(dx * dx + dy * dy);

                console.log(`[Wizard] Bar ${comp.id}: p1=(${p1.x},${p1.y}), p2=(${p2.x},${p2.y}), angle=${angle}, len=${initialLength}`);

                // 使用極座標：x = p1.x + L * cos(angle), y = p1.y + L * sin(angle)
                // 但我們需要更簡單的方式...

                // 如果是水平桿（dy ≈ 0）
                if (Math.abs(dy) < 0.01) {
                    const p1X = parseFloat(p1.x);
                    const p1Y = parseFloat(p1.y);

                    if (dx > 0) {
                        // 向右延伸
                        step.x_param = comp.lenParam;
                        step.x_offset = p1X;  // x = p1.x + lenParam
                        step.y = p1Y;
                    } else {
                        // 向左延伸
                        step.x_param = `-${comp.lenParam}`;
                        step.x_offset = p1X;
                        step.y = p1Y;
                    }
                }
                // 如果是垂直桿（dx ≈ 0）
                else if (Math.abs(dx) < 0.01) {
                    const p1X = parseFloat(p1.x);
                    const p1Y = parseFloat(p1.y);

                    step.x = p1X;
                    if (dy > 0) {
                        // 向上延伸
                        step.y_param = comp.lenParam;
                        step.y_offset = p1Y;
                    } else {
                        // 向下延伸
                        step.y_param = `-${comp.lenParam}`;
                        step.y_offset = p1Y;
                    }
                }
                // 斜向桿 - 使用參數化（但需要 solver 支援）
                else {
                    // 暫時：直接用參數當作 x，保持簡單
                    const p1X = parseFloat(p1.x) || 0;
                    step.x_param = comp.lenParam;
                    step.x_offset = p1X;
                    step.y = parseFloat(p2.y);
                }
            } else {
                // 一般的固定點，直接用座標
                if (typeof pos.x === 'number') {
                    step.x = pos.x;
                } else if (!isNaN(parseFloat(pos.x))) {
                    step.x = parseFloat(pos.x);
                } else {
                    step.x_param = pos.x;
                }

                if (typeof pos.y === 'number') {
                    step.y = pos.y;
                } else if (!isNaN(parseFloat(pos.y))) {
                    step.y = parseFloat(pos.y);
                } else {
                    step.y_param = pos.y;
                }
            }

            steps.push(step);
            joints.add(id);
        });

        // 2. 處理輸入桿 (Input Crank)
        this.components.filter(c => c.type === 'bar' && c.isInput).forEach(c => {
            if (c.p1?.id && c.p2?.id && solvedPoints.has(c.p1.id)) {
                steps.push({ id: c.p2.id, type: 'input_crank', center: c.p1.id, len_param: c.lenParam });
                joints.add(c.p1.id);
                joints.add(c.p2.id);
                parts.push({ id: `Crank(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color });
            }
        });

        // 3. 處理三角桿 (Triangle) -> 對應 Dyad Step
        this.components.filter(c => c.type === 'triangle').forEach(c => {
            if (c.p1?.id && c.p2?.id && c.p3?.id && solvedPoints.has(c.p1.id) && solvedPoints.has(c.p2.id)) {
                steps.push({
                    id: c.p3.id,
                    type: 'dyad',
                    p1: c.p1.id,
                    r1_param: c.r1Param,
                    p2: c.p2.id,
                    r2_param: c.r2Param,
                    sign: c.sign || 1
                });

                polygons.push({
                    points: [c.p1.id, c.p2.id, c.p3.id],
                    color: c.color,
                    alpha: 0.3
                });

                joints.add(c.p1.id);
                joints.add(c.p2.id);
                joints.add(c.p3.id);

                parts.push({ id: `Tri_Edge1(${c.r1Param})`, type: 'bar', len_param: c.r1Param, color: c.color });
                parts.push({ id: `Tri_Edge2(${c.r2Param})`, type: 'bar', len_param: c.r2Param, color: c.color });
            }
        });

        // 4. 自動偵測兩根桿件形成的 Dyad
        // 找出所有尚未透過 Triangle 定義，但連接了兩根桿件到已求解點的浮動點
        const solvedBySteps = new Set(steps.map(s => s.id));
        const floatingPointConnections = new Map(); // pointId -> Array of { neighborId, lenParam }

        this.components.forEach(c => {
            if (c.type === 'bar' && !c.isInput) {
                const id1 = c.p1?.id;
                const id2 = c.p2?.id;
                if (id1 && id2) {
                    if (solvedPoints.has(id1)) {
                        if (!floatingPointConnections.has(id2)) floatingPointConnections.set(id2, []);
                        floatingPointConnections.get(id2).push({ neighborId: id1, lenParam: c.lenParam });
                    }
                    if (solvedPoints.has(id2)) {
                        if (!floatingPointConnections.has(id1)) floatingPointConnections.set(id1, []);
                        floatingPointConnections.get(id1).push({ neighborId: id2, lenParam: c.lenParam });
                    }
                }
            }
        });

        floatingPointConnections.forEach((conns, pointId) => {
            if (!solvedBySteps.has(pointId) && conns.length >= 2) {
                // 找到前兩個連接點作為 Dyad 的基準
                const c1 = conns[0];
                const c2 = conns[1];
                steps.push({
                    id: pointId,
                    type: 'dyad',
                    p1: c1.neighborId,
                    r1_param: c1.lenParam,
                    p2: c2.neighborId,
                    r2_param: c2.lenParam,
                    sign: 1 // 預設正向
                });
                solvedBySteps.add(pointId);
                joints.add(pointId);
                joints.add(c1.neighborId);
                joints.add(c2.neighborId);
            }
        });

        // 5. 處理普通二孔桿 (Bar) -> 僅用於視覺化與零件生成
        this.components.filter(c => c.type === 'bar' && !c.isInput).forEach(c => {
            if (c.p1?.id && c.p2?.id && solvedPoints.has(c.p1.id) && solvedPoints.has(c.p2.id)) {
                joints.add(c.p1.id);
                joints.add(c.p2.id);
                parts.push({ id: `Link(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color });
            }
        });

        // 6. 生成視覺化連桿 (Links)
        const finalLinks = [];
        this.components.forEach(c => {
            if (c.type === 'bar' && c.p1?.id && c.p2?.id && solvedPoints.has(c.p1.id) && solvedPoints.has(c.p2.id)) {
                finalLinks.push({ id: c.id, p1: c.p1.id, p2: c.p2.id, style: c.isInput ? 'crank' : 'normal', color: c.color });
            } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id && solvedPoints.has(c.p1.id) && solvedPoints.has(c.p2.id)) {
                finalLinks.push({ id: c.id, p1: c.p1.id, p2: c.p3.id, color: c.color });
                finalLinks.push({ p1: c.p2.id, p2: c.p3.id, color: c.color });
                finalLinks.push({ p1: c.p1.id, p2: c.p2.id, color: c.color, style: 'dashed' }); // 底邊虛線
            }
        });

        // 預設追蹤點 (如果沒設，選最後一個點)
        if (!this.topology.tracePoint || !joints.has(this.topology.tracePoint)) {
            this.topology.tracePoint = Array.from(joints).pop() || '';
        }

        this.topology = {
            steps,
            tracePoint: this.topology.tracePoint,
            visualization: { links: finalLinks, polygons, joints: Array.from(joints) },
            parts,
            _wizard_data: this.components // 儲存原始組件資料以便恢復
        };
    }

    loadTemplate(name) {
        if (confirm(`載入 ${name} 範本將會覆蓋目前所有桿件，確定嗎？`)) {
            this.components = [];

            if (name === 'CRANK_ROCKER') {
                // 曲柄搖桿機構 (Crank-Rocker) - 可360度連續旋轉
                // 滿足 Grashof 條件：s + l ≤ p + q
                // 桿長: a=40, b=80, c=60, d=80 → 40+80 ≤ 60+80 ✓
                this.components = [
                    // 1. 輸入曲柄 (Input Crank) - 最短桿，可360度旋轉
                    {
                        type: 'bar', id: 'Crank', color: '#e74c3c', isInput: true, lenParam: 'a',
                        p1: { id: 'O2', type: 'fixed', x: 0, y: 0 },
                        p2: { id: 'A', type: 'floating' }
                    },
                    // 2. 連桿 (Coupler Link)
                    {
                        type: 'bar', id: 'Coupler', color: '#3498db', lenParam: 'b',
                        p1: { id: 'A', type: 'existing' },
                        p2: { id: 'B', type: 'floating' }
                    },
                    // 3. 輸出搖桿 (Output Rocker) - 擺動輸出
                    {
                        type: 'bar', id: 'Rocker', color: '#27ae60', lenParam: 'd',
                        p1: { id: 'O4', type: 'fixed', x: 60, y: 0 },
                        p2: { id: 'B', type: 'existing' }
                    },
                    // 4. 底座 (Ground Link)
                    {
                        type: 'bar', id: 'Ground', color: '#95a5a6', lenParam: 'c',
                        p1: { id: 'O2', type: 'existing' },
                        p2: { id: 'O4', type: 'existing' }
                    }
                ];
            } else if (name === 'CHEBYSHEV') {
                // Chebyshev 直線機構 - 產生近似直線運動
                // 經典桿長比例: a:b:c:d = 1:2.5:4:2.5
                // 追蹤點在連桿 B 上會產生近似直線
                this.components = [
                    // 1. 驅動曲柄
                    {
                        type: 'bar', id: 'Crank', color: '#e74c3c', isInput: true, lenParam: 'a',
                        p1: { id: 'O2', type: 'fixed', x: 0, y: 0 },
                        p2: { id: 'A', type: 'floating' }
                    },
                    // 2. 主連桿
                    {
                        type: 'bar', id: 'Coupler', color: '#3498db', lenParam: 'b',
                        p1: { id: 'A', type: 'existing' },
                        p2: { id: 'B', type: 'floating' }
                    },
                    // 3. 搖桿 (與主連桿等長)
                    {
                        type: 'bar', id: 'Rocker', color: '#27ae60', lenParam: 'd',
                        p1: { id: 'O4', type: 'fixed', x: 80, y: 0 },
                        p2: { id: 'B', type: 'existing' }
                    },
                    // 4. 底座
                    {
                        type: 'bar', id: 'Ground', color: '#95a5a6', lenParam: 'c',
                        p1: { id: 'O2', type: 'existing' },
                        p2: { id: 'O4', type: 'existing' }
                    }
                ];
            }

            this.selectedComponentIndex = -1;
            this.render();
            this.syncTopology();
        }
    }
}
