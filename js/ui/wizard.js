/**
 * Mechanism Wizard UI (Component-Based)
 * 機構小幫手 - 組件式建構多連桿機構
 */

import { $ } from '../utils.js';
import * as Templates from '../multilink/templates.js';
import { JANSEN_TOPOLOGY } from '../jansen/topology.js';

export class MechanismWizard {
    constructor(containerId, onUpdate) {
        this.container = $(containerId);
        this.onUpdate = onUpdate;

        // 組件化資料結構
        this.components = []; // { type: 'ground'|'bar'|'triangle', id, ...props }
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
        } else if (initialTopology && initialTopology.steps && initialTopology.steps.length > 0) {
            // 如果沒有組件資料但有拓撲，嘗試做簡單轉換 (選填，目前先清空)
            this.components = [];
        }
        this.render();
    }

    render() {
        if (!this.container) return;

        // 在右側面板中，我們將高度調整為自動，並優化佈局
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
                    <select id="templateSelect" style="font-size: 10px; padding: 1px 3px; border-radius: 4px; border: 1px solid #ccc; max-width: 100px;">
                        <option value="">-- 範本 --</option>
                        <option value="JANSEN">Jansen</option>
                        <option value="KLANN">Klann</option>
                        <option value="HOEKEN">Hoeken</option>
                    </select>
                </div>
                
                <!-- Add Buttons (Top of Right Panel) -->
                <div style="padding: 10px; background: #fff; border-bottom: 1px solid #f0f0f0; display: flex; gap: 6px;">
                    <button id="btnAddGround" style="flex: 1; background: #444; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span>📍</span> 固定點
                    </button>
                    <button id="btnAddBar" style="flex: 1; background: #3498db; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span>📏</span> 二孔桿
                    </button>
                    <button id="btnAddTriangle" style="flex: 1; background: #27ae60; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <span>📐</span> 三角桿
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
            return `<div style="text-align: center; color: #999; font-size: 10px; margin-top: 20px;">尚無組件</div>`;
        }

        return this.components.map((c, i) => {
            const isSelected = this.selectedComponentIndex === i;
            const icon = c.type === 'ground' ? '📍' : (c.type === 'bar' ? '📏' : '📐');
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
                    border: 1px solid ${isSelected ? '#3498db' : '#eee'};
                    transition: all 0.2s;
                ">
                    <span style="font-size: 12px;">${icon}</span>
                    <span style="flex: 1; font-weight: ${isSelected ? 'bold' : 'normal'}; color: ${isSelected ? '#2980b9' : '#34495e'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${c.id || (c.type + (i + 1))}
                    </span>
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
                    <div style="font-size: 40px; margin-bottom: 10px; opacity: 0.5;">👆</div>
                    <div style="font-size: 12px; font-weight: bold;">請點擊上方按鈕</div>
                </div>
            `;
        }

        const points = this.getAllPointIds();
        const icon = comp.type === 'ground' ? '📍' : (comp.type === 'bar' ? '📏' : '📐');

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #f8f9fa;">
                <h5 style="margin: 0; font-size: 14px; color: #2c3e50; display: flex; align-items: center; gap: 5px;">
                    ${icon} 編輯
                </h5>
                <button onclick="window.wizard.removeSelected()" style="background: #fff; border: 1px solid #ff7675; color: #ff7675; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;">刪除</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">名稱 (ID)</label>
                    <input type="text" value="${comp.id || ''}" oninput="window.wizard.updateCompProp('id', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">顏色</label>
                    <input type="color" value="${comp.color || '#3498db'}" oninput="window.wizard.updateCompProp('color', this.value)" style="width: 100%; height: 30px; padding: 2px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
                </div>
        `;

        if (comp.type === 'ground') {
            html += `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                        <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">X (mm)</label>
                        <input type="number" value="${comp.x || 0}" oninput="window.wizard.updateCompProp('x', parseFloat(this.value))" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                    </div>
                    <div class="form-group">
                        <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">Y (mm)</label>
                        <input type="number" value="${comp.y || 0}" oninput="window.wizard.updateCompProp('y', parseFloat(this.value))" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                    </div>
                </div>
            `;
        } else if (comp.type === 'bar') {
            html += `
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">連接點 1 (起點)</label>
                    <select onchange="window.wizard.updateCompProp('p1', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff;">
                        <option value="">-- 選擇 --</option>
                        ${points.map(p => `<option value="${p}" ${comp.p1 === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">連接點 2 (終點)</label>
                    <input type="text" value="${comp.p2 || ''}" placeholder="例如 P1" oninput="window.wizard.updateCompProp('p2', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
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
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">基準點 1</label>
                    <select onchange="window.wizard.updateCompProp('p1', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff;">
                        <option value="">-- 選擇 --</option>
                        ${points.map(p => `<option value="${p}" ${comp.p1 === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">基準點 2</label>
                    <select onchange="window.wizard.updateCompProp('p2', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff;">
                        <option value="">-- 選擇 --</option>
                        ${points.map(p => `<option value="${p}" ${comp.p2 === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">頂點名稱</label>
                    <input type="text" value="${comp.p3 || ''}" placeholder="例如 P2" oninput="window.wizard.updateCompProp('p3', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                        <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">邊長 1</label>
                        <input type="text" value="${comp.r1Param || 'L1'}" oninput="window.wizard.updateCompProp('r1Param', this.value)" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                    </div>
                    <div class="form-group">
                        <label style="display: block; font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">邊長 2</label>
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

    attachEvents() {
        const btnAddGround = $('btnAddGround');
        const btnAddBar = $('btnAddBar');
        const btnAddTriangle = $('btnAddTriangle');
        const btnReset = $('btnWizardReset');
        const btnApply = $('btnWizardApply');
        const templateSelect = $('templateSelect');
        const traceSelect = $('tracePointSelect');

        if (btnAddGround) btnAddGround.onclick = () => this.addComponent('ground');
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

    addComponent(type) {
        const count = this.components.filter(c => c.type === type).length + 1;
        const id = type === 'ground' ? `O${count * 2}` : (type === 'bar' ? `Link${count}` : `Tri${count}`);
        const newComp = { type, id, color: type === 'ground' ? '#666' : (type === 'bar' ? '#3498db' : '#27ae60') };

        if (type === 'ground') {
            newComp.x = 0;
            newComp.y = 0;
        } else if (type === 'bar') {
            newComp.p1 = '';
            newComp.p2 = '';
            newComp.lenParam = 'L' + (this.components.length + 1);
            newComp.isInput = false;
        } else if (type === 'triangle') {
            newComp.p1 = '';
            newComp.p2 = '';
            newComp.p3 = '';
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
            // 局部更新列表名稱
            const list = $('componentList');
            if (list) list.innerHTML = this.renderComponentList();
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
            if (c.type === 'ground') ids.add(c.id);
            if (c.type === 'bar' && c.p2) ids.add(c.p2);
            if (c.type === 'triangle' && c.p3) ids.add(c.p3);
        });
        return Array.from(ids);
    }

    reset() {
        if (confirm('確定要清除所有組件嗎？')) {
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
    }

    /**
     * 將組件編譯為 Solver 拓撲
     */
    compileTopology() {
        const steps = [];
        const polygons = [];
        const joints = new Set();
        const parts = [];

        // 1. 處理固定點
        this.components.filter(c => c.type === 'ground').forEach(c => {
            steps.push({ id: c.id, type: 'ground', x: c.x, y: c.y });
            joints.add(c.id);
        });

        // 2. 處理輸入桿 (Input Crank)
        this.components.filter(c => c.type === 'bar' && c.isInput).forEach(c => {
            if (c.p1 && c.p2) {
                steps.push({ id: c.p2, type: 'input_crank', center: c.p1, len_param: c.lenParam });
                joints.add(c.p1);
                joints.add(c.p2);
                parts.push({ id: `Crank(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color });
            }
        });

        // 3. 處理三角桿 (Triangle) -> 對應 Dyad Step
        this.components.filter(c => c.type === 'triangle').forEach(c => {
            if (c.p1 && c.p2 && c.p3) {
                steps.push({
                    id: c.p3,
                    type: 'dyad',
                    p1: c.p1,
                    r1_param: c.r1Param,
                    p2: c.p2,
                    r2_param: c.r2Param,
                    sign: c.sign || 1
                });

                polygons.push({
                    points: [c.p1, c.p2, c.p3],
                    color: c.color,
                    alpha: 0.3
                });

                joints.add(c.p1);
                joints.add(c.p2);
                joints.add(c.p3);

                parts.push({ id: `Tri_Edge1(${c.r1Param})`, type: 'bar', len_param: c.r1Param, color: c.color });
                parts.push({ id: `Tri_Edge2(${c.r2Param})`, type: 'bar', len_param: c.r2Param, color: c.color });
            }
        });

        // 4. 處理普通二孔桿 (Bar) -> 僅用於視覺化與零件生成
        this.components.filter(c => c.type === 'bar' && !c.isInput).forEach(c => {
            if (c.p1 && c.p2) {
                joints.add(c.p1);
                joints.add(c.p2);
                parts.push({ id: `Link(${c.lenParam})`, type: 'bar', len_param: c.lenParam, color: c.color });
            }
        });

        // 5. 生成視覺化連桿 (Links)
        const finalLinks = [];
        this.components.forEach(c => {
            if (c.type === 'bar' && c.p1 && c.p2) {
                finalLinks.push({ p1: c.p1, p2: c.p2, style: c.isInput ? 'crank' : 'normal', color: c.color });
            } else if (c.type === 'triangle' && c.p1 && c.p2 && c.p3) {
                finalLinks.push({ p1: c.p1, p2: c.p3, color: c.color });
                finalLinks.push({ p1: c.p2, p2: c.p3, color: c.color });
                finalLinks.push({ p1: c.p1, p2: c.p2, color: c.color, dash: [2, 2] }); // 底邊虛線
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
        if (confirm(`載入 ${name} 範本將會覆蓋目前所有組件，確定嗎？`)) {
            this.components = [];

            if (name === 'JANSEN') {
                this.components = [
                    { type: 'ground', id: 'O2', x: 0, y: 0, color: '#666' },
                    { type: 'ground', id: 'O4', x: 38, y: -7.8, color: '#666' },
                    { type: 'bar', id: 'Crank', p1: 'O2', p2: 'A', lenParam: 'm', isInput: true, color: '#e74c3c' },
                    { type: 'triangle', id: 'Tri1', p1: 'A', p2: 'O4', p3: 'P1', r1Param: 'j', r2Param: 'k', sign: -1, color: '#3498db' }
                ];
            } else if (name === 'HOEKEN') {
                this.components = [
                    { type: 'ground', id: 'O2', x: 0, y: 0, color: '#666' },
                    { type: 'ground', id: 'O4', x: 100, y: 0, color: '#666' },
                    { type: 'bar', id: 'Crank', p1: 'O2', p2: 'A', lenParam: 'm', isInput: true, color: '#e74c3c' },
                    { type: 'triangle', id: 'Tri1', p1: 'A', p2: 'O4', p3: 'P1', r1Param: 'L1', r2Param: 'L2', sign: 1, color: '#27ae60' }
                ];
            }

            this.selectedComponentIndex = -1;
            this.render();
            this.syncTopology();
        }
    }
}
