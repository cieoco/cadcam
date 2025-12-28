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
            // 第一根桿件的第一個點預設為固定，之後的新點預設為浮動
            const isFirst = this.components.length === 0;
            newComp.p1 = {
                id: `P${this.components.length * 2 + 1}`,
                type: isFirst ? 'fixed' : 'floating',
                x: Math.round(p1Data.x),
                y: Math.round(p1Data.y)
            };
        } else {
            // 現有點 -> Existing
            newComp.p1 = { id: p1Data.id, type: 'existing', x: Math.round(Number(p1Data.x) || 0), y: Math.round(Number(p1Data.y) || 0) };
        }

        // 設定 P2
        if (p2Data.isNew) {
            // 新點預設為浮動關節 (Lego 邏輯)
            newComp.p2 = {
                id: `P${this.components.length * 2 + 2}`,
                type: 'floating',
                x: Math.round(p2Data.x),
                y: Math.round(p2Data.y)
            };
            newComp.color = '#3498db';
        } else {
            // P2 是現有點 -> Existing
            newComp.p2 = { id: p2Data.id, type: 'existing', x: Math.round(Number(p2Data.x) || 0), y: Math.round(Number(p2Data.y) || 0) };
        }

        // 自動判斷顏色
        if (newComp.p1.type === 'existing' && newComp.p2.type === 'existing') {
            newComp.color = '#9b59b6'; // 連結兩個現有點的桿件 (閉環)
        } else if (newComp.p1.type === 'fixed' || newComp.p2.type === 'fixed') {
            newComp.color = '#e74c3c'; // 接地桿件 (潛在馬達桿)
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
        const allPoints = new Map(); // id -> type ('fixed' | 'floating' | 'existing')

        // 1. 彙整所有點位的類型資訊
        this.components.forEach(c => {
            ['p1', 'p2', 'p3'].forEach(k => {
                const pt = c[k];
                if (pt && pt.id) {
                    const currentType = allPoints.get(pt.id);
                    // 優先級：fixed > floating > existing
                    if (pt.type === 'fixed') allPoints.set(pt.id, 'fixed');
                    else if (pt.type === 'floating' && currentType !== 'fixed') allPoints.set(pt.id, 'floating');
                    else if (!allPoints.has(pt.id)) allPoints.set(pt.id, 'existing');
                }
            });
        });

        // 2. 初始已解點為所有 fixed 點
        allPoints.forEach((type, id) => {
            if (type === 'fixed') solved.add(id);
        });

        // 3. 迭代求解其餘點位
        let changed = true;
        while (changed) {
            changed = false;

            // 建立連桿連接地圖
            const pointConnections = new Map();
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
                    if (c.p1?.id && c.p2?.id && solved.has(c.p1.id) && !solved.has(c.p2.id)) {
                        solved.add(c.p2.id);
                        changed = true;
                    }
                } else if (c.type === 'triangle') {
                    if (c.p1?.id && c.p2?.id && c.p3?.id &&
                        solved.has(c.p1.id) && solved.has(c.p2.id) && !solved.has(c.p3.id)) {
                        solved.add(c.p3.id);
                        changed = true;
                    }
                }
            });

            // 自動偵測 (Dyad): 若一個非固定點連接到兩個已解點
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

        // 2. 彙整所有點位的類型資訊，並判斷 Ground Points
        const allPointsMap = new Map(); // id -> { type, x, y, component, role }

        this.components.forEach(c => {
            ['p1', 'p2', 'p3'].forEach(k => {
                const pt = c[k];
                if (!pt || !pt.id) return;

                const existing = allPointsMap.get(pt.id);
                // 優先級：fixed > floating > existing
                if (!existing || pt.type === 'fixed' || (pt.type === 'floating' && existing.type === 'existing')) {
                    allPointsMap.set(pt.id, {
                        type: pt.type,
                        x: pt.x,
                        y: pt.y,
                        component: c,
                        role: k
                    });
                }
            });
        });

        // 3. 處理 Ground Points (所有被判定為 fixed 的點，或孤立的 existing 點)
        allPointsMap.forEach((info, id) => {
            if (info.type === 'fixed') {
                const step = { id, type: 'ground' };
                const comp = info.component;

                // 🎯 關鍵邏輯：處理參數化連桿的第二個接地點 (p2)
                if (comp.type === 'bar' && comp.lenParam && info.role === 'p2' && comp.p1) {
                    const p1 = comp.p1;
                    const p2 = comp.p2;
                    const dx = parseFloat(p2.x) - parseFloat(p1.x);
                    const dy = parseFloat(p2.y) - parseFloat(p1.y);

                    if (Math.abs(dy) < 0.01) {
                        step.x_param = dx > 0 ? comp.lenParam : `-${comp.lenParam}`;
                        step.x_offset = parseFloat(p1.x);
                        step.y = parseFloat(p1.y);
                    } else if (Math.abs(dx) < 0.01) {
                        step.x = parseFloat(p1.x);
                        step.y_param = dy > 0 ? comp.lenParam : `-${comp.lenParam}`;
                        step.y_offset = parseFloat(p1.y);
                    } else {
                        step.x = parseFloat(p2.x);
                        step.y = parseFloat(p2.y);
                    }
                } else {
                    step.x = parseFloat(info.x) || 0;
                    step.y = parseFloat(info.y) || 0;
                }

                steps.push(step);
                joints.add(id);
            }
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
        // 5. 處理所有點位，確保未解點也能顯示 (為 LEGO 模式優化)
        allPointsMap.forEach((info, id) => {
            // 如果這個點還沒出現在 steps 裡 (不是 ground, input_crank, dyad)，就加一個 joint step
            if (!steps.find(s => s.id === id)) {
                steps.push({
                    id,
                    type: 'joint',
                    x: Number(info.x) || 0,
                    y: Number(info.y) || 0
                });
            }
            joints.add(id);
        });

        // 6. 生成視覺化連桿 (Links) - 移除 solvedPoints 限制，讓繪圖即時顯示
        const finalLinks = [];
        this.components.forEach(c => {
            if (c.type === 'bar' && c.p1?.id && c.p2?.id) {
                finalLinks.push({
                    id: c.id,
                    p1: c.p1.id,
                    p2: c.p2.id,
                    style: c.isInput ? 'crank' : 'normal',
                    color: c.color,
                    lenParam: c.lenParam // 傳給 solver 自動推導使用
                });
            } else if (c.type === 'triangle' && c.p1?.id && c.p2?.id && c.p3?.id) {
                finalLinks.push({ id: c.id, p1: c.p1.id, p2: c.p3.id, color: c.color });
                finalLinks.push({ p1: c.p2.id, p2: c.p3.id, color: c.color });
                finalLinks.push({ p1: c.p1.id, p2: c.p2.id, color: c.color, style: 'dashed' });
            }
        });

        // 7. 生成零件表
        this.components.forEach(c => {
            if (c.type === 'bar') {
                parts.push({ id: `${c.id}(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color });
            } else if (c.type === 'triangle') {
                parts.push({ id: `Tri_${c.id}_E1`, type: 'bar', len_param: c.r1Param, color: c.color });
                parts.push({ id: `Tri_${c.id}_E2`, type: 'bar', len_param: c.r2Param, color: c.color });
            }
        });

        // 預設追蹤點 (如果沒設，選最後一個點)
        if (!this.topology.tracePoint || !joints.has(this.topology.tracePoint)) {
            this.topology.tracePoint = Array.from(joints).pop() || '';
        }

        // 🎯 自動生成 params 物件
        const params = {};

        // 從組件中收集點位座標，優先使用 fixed 點的座標
        const pointCoords = new Map();

        // 第一輪：收集所有明確定義座標的點 (fixed)
        this.components.forEach(c => {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].id && c[k].type === 'fixed') {
                    const x = Number(c[k].x);
                    const y = Number(c[k].y);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        pointCoords.set(c[k].id, { x, y });
                    }
                }
            });
        });

        // 第二輪：收集其他點位（如 floating 或 existing 的初始座標）
        this.components.forEach(c => {
            ['p1', 'p2', 'p3'].forEach(k => {
                if (c[k] && c[k].id && !pointCoords.has(c[k].id)) {
                    const x = Number(c[k].x);
                    const y = Number(c[k].y);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        pointCoords.set(c[k].id, { x, y });
                    }
                }
            });
        });

        // 根據座標計算連桿初始長度並填入 params
        this.components.forEach(c => {
            if (c.type === 'bar' && c.lenParam && c.p1 && c.p2) {
                const p1 = pointCoords.get(c.p1.id);
                const p2 = pointCoords.get(c.p2.id);
                if (p1 && p2) {
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const length = Math.round(Math.sqrt(dx * dx + dy * dy));
                    params[c.lenParam] = length;
                } else if (params[c.lenParam] === undefined) {
                    params[c.lenParam] = 100;
                }
            } else if (c.type === 'triangle') {
                // 三角桿邊長目前預設為 100，或可擴充為從點位計算
                if (c.r1Param && params[c.r1Param] === undefined) params[c.r1Param] = 100;
                if (c.r2Param && params[c.r2Param] === undefined) params[c.r2Param] = 100;
            }
        });


        // 確保 theta 參數存在（用於驅動馬達）
        if (!params.theta) params.theta = 0;

        this.topology = {
            steps,
            tracePoint: this.topology.tracePoint,
            visualization: { links: finalLinks, polygons, joints: Array.from(joints) },
            parts,
            params,  // ← 加入 params
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
