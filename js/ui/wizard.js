/**
 * Mechanism Wizard UI
 * 機構小幫手 - 引導式建構多連桿機構
 */

import { $ } from '../utils.js';
import * as Templates from '../multilink/templates.js';
import { JANSEN_TOPOLOGY } from '../jansen/topology.js';

export class MechanismWizard {
    constructor(containerId, onUpdate) {
        this.container = $(containerId);
        this.onUpdate = onUpdate;
        this.topology = {
            steps: [],
            tracePoint: '',
            visualization: { links: [], polygons: [], joints: [] },
            parts: []
        };
        this.currentStep = 1; // 1: Ground, 2: Input, 3: Dyads, 4: Trace
    }

    init(initialTopology) {
        if (initialTopology) {
            this.topology = JSON.parse(JSON.stringify(initialTopology));
        }
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="wizard-card" style="border: 1px solid #e0e0e0; padding: 20px; border-radius: 12px; background: #ffffff; margin-top: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <h4 style="margin: 0; color: #2c3e50; font-size: 16px;">🛠️ 機構建構精靈</h4>
                    <div style="font-size: 12px; font-weight: bold; color: #3498db; background: #ebf5fb; padding: 2px 8px; border-radius: 10px;">步驟 ${this.currentStep} / 4</div>
                </div>
                
                <div id="wizardStepContent" style="min-height: 200px;">
                    ${this.renderStepContent()}
                </div>

                <div style="margin-top: 25px; display: flex; justify-content: space-between; gap: 10px;">
                    <button id="btnWizardPrev" class="btn-secondary" style="flex: 1; padding: 8px;" ${this.currentStep === 1 ? 'disabled' : ''}>上一步</button>
                    <button id="btnWizardNext" class="btn-primary" style="flex: 1; padding: 8px;">${this.currentStep === 4 ? '完成並關閉' : '下一步'}</button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    renderStepContent() {
        switch (this.currentStep) {
            case 1: return this.renderGroundStep();
            case 2: return this.renderInputStep();
            case 3: return this.renderDyadStep();
            case 4: return this.renderTraceStep();
            default: return '';
        }
    }

    renderGroundStep() {
        const grounds = this.topology.steps.filter(s => s.type === 'ground');
        return `
            <div style="margin-bottom: 20px; padding: 12px; background: #f0f7ff; border-radius: 8px; border: 1px dashed #3498db;">
                <label style="font-size: 13px; font-weight: bold; color: #2980b9; display: block; margin-bottom: 8px;">🚀 快速開始：載入範本</label>
                <select id="templateSelect" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #bdc3c7;">
                    <option value="">-- 選擇經典機構範本 --</option>
                    <option value="JANSEN">Jansen (仿生獸)</option>
                    <option value="KLANN">Klann (六連桿步進)</option>
                    <option value="HOEKEN">Hoeken (直線機構)</option>
                </select>
            </div>
            <p style="font-size: 14px; color: #34495e; margin-bottom: 15px;"><strong>第一步：定義固定點 (Ground)</strong><br/><span style="font-size: 12px; color: #7f8c8d;">設定機構在空間中不動的支點。</span></p>
            <div id="groundList" style="display: flex; flex-direction: column; gap: 10px;">
                ${grounds.map((g, i) => `
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr 1.5fr auto; gap: 8px; align-items: center; background: #f8f9fa; padding: 8px; border-radius: 6px;">
                        <input type="text" value="${g.id}" placeholder="ID" style="width: 100%; padding: 4px;" onchange="window.wizard.updatePointId('ground', ${i}, this.value)">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-size: 12px; color: #999;">X</span>
                            <input type="number" value="${g.x}" style="width: 100%; padding: 4px;" onchange="window.wizard.updatePointCoord('ground', ${i}, 'x', this.value)">
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-size: 12px; color: #999;">Y</span>
                            <input type="number" value="${g.y}" style="width: 100%; padding: 4px;" onchange="window.wizard.updatePointCoord('ground', ${i}, 'y', this.value)">
                        </div>
                        <button onclick="window.wizard.removePoint('ground', ${i})" style="padding: 4px 8px; background: #ff7675; color: white; border: none; border-radius: 4px; cursor: pointer;">×</button>
                    </div>
                `).join('')}
            </div>
            <button id="btnAddGround" style="margin-top: 15px; width: 100%; padding: 8px; font-size: 13px; background: #fff; border: 1px solid #3498db; color: #3498db; border-radius: 6px; cursor: pointer;">+ 新增固定點</button>
        `;
    }

    renderInputStep() {
        const grounds = this.topology.steps.filter(s => s.type === 'ground');
        const input = this.topology.steps.find(s => s.type === 'input_crank');
        return `
            <p style="font-size: 14px; color: #34495e; margin-bottom: 15px;"><strong>第二步：定義輸入曲柄 (Input)</strong><br/><span style="font-size: 12px; color: #7f8c8d;">設定由馬達帶動旋轉的桿件。</span></p>
            <div style="display: flex; flex-direction: column; gap: 15px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <div>
                    <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">曲柄節點名稱</label>
                    <input type="text" id="inputCrankId" value="${input ? input.id : 'P0'}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div>
                    <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">旋轉中心 (從固定點選擇)</label>
                    <select id="inputCrankCenter" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        ${grounds.map(g => `<option value="${g.id}" ${input && input.center === g.id ? 'selected' : ''}>${g.id}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">桿長參數名稱 (如 m, r)</label>
                    <input type="text" id="inputCrankLenParam" value="${input ? input.len_param : 'm'}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
            </div>
        `;
    }

    renderDyadStep() {
        const points = this.topology.steps.map(s => s.id);
        const dyads = this.topology.steps.filter(s => s.type === 'dyad');
        return `
            <p style="font-size: 14px; color: #34495e; margin-bottom: 15px;"><strong>第三步：建立二連桿組 (Dyads)</strong><br/><span style="font-size: 12px; color: #7f8c8d;">利用兩個已知點與兩段長度確定一個新點。</span></p>
            <div id="dyadList" style="display: flex; flex-direction: column; gap: 12px;">
                ${dyads.map((d, i) => `
                    <div style="border: 1px solid #e0e0e0; padding: 12px; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: bold; color: #2c3e50;">節點:</span>
                                <input type="text" value="${d.id}" style="width: 50px; padding: 2px 5px; border: 1px solid #ddd; border-radius: 4px;" onchange="window.wizard.updateDyadId(${i}, this.value)">
                            </div>
                            <button onclick="window.wizard.removePoint('dyad', ${i})" style="background: #ff7675; color: white; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">刪除</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <span style="color: #888;">連接點 1</span>
                                <select style="padding: 4px; border-radius: 4px; border: 1px solid #ddd;" onchange="window.wizard.updateDyadParam(${i}, 'p1', this.value)">
                                    ${points.filter(p => p !== d.id).map(p => `<option value="${p}" ${d.p1 === p ? 'selected' : ''}>${p}</option>`).join('')}
                                </select>
                                <span style="color: #888; margin-top: 4px;">桿長參數 1</span>
                                <input type="text" value="${d.r1_param}" style="padding: 4px; border-radius: 4px; border: 1px solid #ddd;" onchange="window.wizard.updateDyadParam(${i}, 'r1_param', this.value)">
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <span style="color: #888;">連接點 2</span>
                                <select style="padding: 4px; border-radius: 4px; border: 1px solid #ddd;" onchange="window.wizard.updateDyadParam(${i}, 'p2', this.value)">
                                    ${points.filter(p => p !== d.id).map(p => `<option value="${p}" ${d.p2 === p ? 'selected' : ''}>${p}</option>`).join('')}
                                </select>
                                <span style="color: #888; margin-top: 4px;">桿長參數 2</span>
                                <input type="text" value="${d.r2_param}" style="padding: 4px; border-radius: 4px; border: 1px solid #ddd;" onchange="window.wizard.updateDyadParam(${i}, 'r2_param', this.value)">
                            </div>
                        </div>
                        <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: #666;">
                            <span>幾何解方向:</span>
                            <select style="padding: 2px 5px; border-radius: 4px; border: 1px solid #ddd;" onchange="window.wizard.updateDyadParam(${i}, 'sign', parseInt(this.value))">
                                <option value="1" ${d.sign === 1 ? 'selected' : ''}>正向 (+1)</option>
                                <option value="-1" ${d.sign === -1 ? 'selected' : ''}>反向 (-1)</option>
                            </select>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button id="btnAddDyad" style="margin-top: 15px; width: 100%; padding: 10px; font-size: 13px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(52, 152, 219, 0.2);">+ 新增節點 (Dyad)</button>
        `;
    }

    renderTraceStep() {
        const points = this.topology.steps.map(s => s.id);
        return `
            <p style="font-size: 14px; color: #34495e;"><strong>第四步：設定追蹤點 (Trace)</strong><br/>選擇要觀察運動軌跡的點。</p>
            <select id="tracePointSelect" style="width: 100%; padding: 8px;">
                ${points.map(p => `<option value="${p}" ${this.topology.tracePoint === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
            <p style="font-size: 12px; color: #7f8c8d; margin-top: 10px;">完成後，系統會自動生成視覺化連桿與零件清單。</p>
        `;
    }

    attachEvents() {
        const btnNext = $('btnWizardNext');
        const btnPrev = $('btnWizardPrev');
        const btnAddGround = $('btnAddGround');
        const btnAddDyad = $('btnAddDyad');

        if (btnNext) btnNext.onclick = () => this.nextStep();
        if (btnPrev) btnPrev.onclick = () => this.prevStep();
        if (btnAddGround) btnAddGround.onclick = () => this.addGround();
        if (btnAddDyad) btnAddDyad.onclick = () => this.addDyad();

        const templateSelect = $('templateSelect');
        if (templateSelect) {
            templateSelect.onchange = (e) => this.loadTemplate(e.target.value);
        }

        // Input step specific
        if (this.currentStep === 2) {
            const idInput = $('inputCrankId');
            const centerSelect = $('inputCrankCenter');
            const lenInput = $('inputCrankLenParam');

            const updateInput = () => {
                let input = this.topology.steps.find(s => s.type === 'input_crank');
                if (!input) {
                    input = { type: 'input_crank' };
                    this.topology.steps.push(input);
                }
                input.id = idInput.value;
                input.center = centerSelect.value;
                input.len_param = lenInput.value;
                this.syncTopology();
            };

            idInput.onchange = updateInput;
            centerSelect.onchange = updateInput;
            lenInput.onchange = updateInput;
        }

        // Trace step specific
        if (this.currentStep === 4) {
            const select = $('tracePointSelect');
            select.onchange = () => {
                this.topology.tracePoint = select.value;
                this.syncTopology();
            };
        }
    }

    nextStep() {
        if (this.currentStep < 4) {
            this.currentStep++;
            this.render();
        } else {
            this.finish();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.render();
        }
    }

    addGround() {
        const id = `O${this.topology.steps.filter(s => s.type === 'ground').length + 1}`;
        this.topology.steps.push({ id, type: 'ground', x: 0, y: 0 });
        this.render();
        this.syncTopology();
    }

    addDyad() {
        const id = `P${this.topology.steps.filter(s => s.type !== 'ground').length}`;
        const points = this.topology.steps.map(s => s.id);
        this.topology.steps.push({
            id,
            type: 'dyad',
            p1: points[0] || '',
            r1_param: 'L1',
            p2: points[1] || '',
            r2_param: 'L2',
            sign: 1
        });
        this.render();
        this.syncTopology();
    }

    removePoint(type, index) {
        const filteredSteps = this.topology.steps.filter(s => s.type === type);
        const stepToRemove = filteredSteps[index];
        this.topology.steps = this.topology.steps.filter(s => s !== stepToRemove);
        this.render();
        this.syncTopology();
    }

    updatePointId(type, index, val) {
        const filteredSteps = this.topology.steps.filter(s => s.type === type);
        filteredSteps[index].id = val;
        this.syncTopology();
    }

    updatePointCoord(type, index, axis, val) {
        const filteredSteps = this.topology.steps.filter(s => s.type === type);
        filteredSteps[index][axis] = parseFloat(val);
        this.syncTopology();
    }

    updateDyadId(index, val) {
        const dyads = this.topology.steps.filter(s => s.type === 'dyad');
        dyads[index].id = val;
        this.syncTopology();
    }

    updateDyadParam(index, key, val) {
        const dyads = this.topology.steps.filter(s => s.type === 'dyad');
        dyads[index][key] = val;
        this.syncTopology();
    }

    syncTopology() {
        // 自動生成視覺化與零件 (簡單邏輯)
        this.autoGenerateVizAndParts();

        if (this.onUpdate) {
            this.onUpdate(this.topology);
        }
    }

    autoGenerateVizAndParts() {
        const links = [];
        const joints = [];
        const parts = [];

        for (const step of this.topology.steps) {
            joints.push(step.id);
            if (step.type === 'input_crank') {
                links.push({ p1: step.center, p2: step.id, style: 'crank', color: '#e74c3c' });
                parts.push({ id: `Crank(${step.len_param})`, type: 'bar', len_param: step.len_param, color: '#e74c3c' });
            } else if (step.type === 'dyad') {
                links.push({ p1: step.p1, p2: step.id, color: '#34495e' });
                links.push({ p1: step.p2, p2: step.id, color: '#34495e' });
                parts.push({ id: `Link(${step.r1_param})`, type: 'bar', len_param: step.r1_param });
                parts.push({ id: `Link(${step.r2_param})`, type: 'bar', len_param: step.r2_param });
            }
        }

        this.topology.visualization = { links, polygons: [], joints };
        this.topology.parts = parts;
    }

    finish() {
        alert('機構建構完成！您可以繼續在參數面板調整細節。');
    }

    loadTemplate(name) {
        if (!name) return;
        let topo;
        if (name === 'JANSEN') topo = JANSEN_TOPOLOGY;
        else if (name === 'KLANN') topo = Templates.KLANN_TOPOLOGY;
        else if (name === 'HOEKEN') topo = Templates.HOEKEN_TOPOLOGY;

        if (topo) {
            this.topology = JSON.parse(JSON.stringify(topo));
            this.render();
            this.syncTopology();
        }
    }
}
