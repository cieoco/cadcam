/**
 * UI Controls
 * UI 控制器模組 - 處理使用者介面互動邏輯
 */

import { $, log, downloadText, downloadZip, fmt } from '../utils.js';
import { readInputs, validateConfig, readSweepParams, readViewParams } from '../config.js';
import { solveFourBar, sweepTheta, calculateTrajectoryStats } from '../fourbar/solver.js';
import { startAnimation, pauseAnimation, stopAnimation, setupMotorTypeHandler } from '../fourbar/animation.js';
import { generateParts } from '../parts/generator.js';
import { renderPartsLayout, renderTrajectory } from '../parts/renderer.js';
import { buildAllGcodes, generateMachiningInfo } from '../gcode/generator.js';
import { buildDXF } from '../utils/dxf-generator.js';
import { renderFourbar } from './visualization.js';

// 全域狀態資料
let currentTrajectoryData = null;
let lastMultilinkSolution = null;
let lastMultilinkTopology = null;

// 輔助函數：獲取當前活耀的機構模組
function getActiveModules() {
    return window.mechanismModules || null;
}

function collectDynamicParams() {
    const dynContainer = document.getElementById('dynamicParamsContainer');
    if (!dynContainer) return {};
    const inputs = dynContainer.querySelectorAll('input.dynamic-input');
    const params = {};
    inputs.forEach(inp => {
        const varId = inp.dataset.varId || inp.id.replace('dyn_', '');
        const num = parseFloat(inp.value);
        params[varId] = Number.isFinite(num) ? num : 0;
    });
    return params;
}

function setValueById(id, value) {
    const el = document.getElementById(id);
    if (!el || value === undefined || value === null) return;
    if (el.type === 'checkbox') {
        el.checked = Boolean(value);
        return;
    }
    el.value = value;
}

function normalizeTopologyValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch (e) {
        return String(value);
    }
}

function buildSnapshot() {
    const mods = getActiveModules();
    const { mech, partSpec, mfg } = readInputs();
    const dynamicParams = collectDynamicParams();

    return {
        version: 1,
        mechType: mods && mods.config ? mods.config.id : null,
        createdAt: new Date().toISOString(),
        data: {
            mech: { ...mech, ...dynamicParams },
            partSpec,
            mfg,
            viewParams: readViewParams(),
            dynamicParams
        }
    };
}

function applySnapshot(snapshot) {
    if (!snapshot) return;
    const payload = snapshot.data || snapshot;
    const mech = payload.mech || {};
    const partSpec = payload.partSpec || {};
    const mfg = payload.mfg || {};
    const viewParams = payload.viewParams || {};
    const dynamicParams = payload.dynamicParams || {};

    const topologyValue = normalizeTopologyValue(mech.topology);
    if (topologyValue !== undefined) {
        setValueById('topology', topologyValue);
    }

    Object.keys(mech).forEach((key) => {
        if (key === 'topology') return;
        setValueById(key, mech[key]);
    });
    Object.keys(partSpec).forEach((key) => setValueById(key, partSpec[key]));
    Object.keys(mfg).forEach((key) => setValueById(key, mfg[key]));
    Object.keys(viewParams).forEach((key) => setValueById(key, viewParams[key]));

    if (window.wizard && topologyValue) {
        try {
            window.wizard.init(JSON.parse(topologyValue));
        } catch (e) {
            console.warn('[applySnapshot] Failed to init wizard from topology', e);
        }
    }

    // 🌟 核心修正：移動到 Wizard 初始化之後，確保能抓到 Wizard 同步後的參數化 Topology
    updateDynamicParams();

    Object.keys(dynamicParams).forEach((key) => {
        setValueById(`dyn_${key}`, dynamicParams[key]);
        setValueById(`dyn_${key}_range`, dynamicParams[key]);
    });

    const svgWrap = $("svgWrap");
    if (svgWrap) svgWrap.innerHTML = "";
    lastMultilinkSolution = null;
    lastMultilinkTopology = null;

    ensureValidThetaAfterLoad();
    updatePreview();
}

function ensureValidThetaAfterLoad() {
    const mods = getActiveModules();
    if (!mods || !mods.config || mods.config.id !== 'multilink') return;

    const { mech } = readInputs();
    const dynamicParams = collectDynamicParams();
    Object.assign(mech, dynamicParams);

    const solveFn = mods.solver[mods.config.solveFn];
    const sol = solveFn(mech);
    if (sol && sol.isValid !== false) return;

    const sweepParams = readSweepParams();
    const sweepFn = mods.solver.sweepTheta || sweepTheta;
    const sweep = sweepFn(
        mech,
        sweepParams.sweepStart,
        sweepParams.sweepEnd,
        sweepParams.sweepStep || 5
    );
    const firstValid = sweep.results.find(r => r.isValid);
    if (!firstValid) return;

    setValueById('theta', firstValid.theta);
    const thetaInput = $("theta");
    if (thetaInput) {
        thetaInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

function downloadSnapshot() {
    const snapshot = buildSnapshot();
    const fileName = `${snapshot.mechType || 'mechanism'}_${Date.now()}.json`;
    downloadText(fileName, JSON.stringify(snapshot, null, 2));
}

function handleOpenSnapshot(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const snapshot = JSON.parse(String(reader.result || ''));
            applySnapshot(snapshot);
            log('Loaded file.');
        } catch (e) {
            log(`Load failed: ${e.message}`);
        }
    };
    reader.onerror = () => {
        log('Load failed: Unable to read file.');
    };
    reader.readAsText(file);
}

/**
 * 更新動態參數控制面板
 */
export function updateDynamicParams() {
    const container = document.getElementById('dynamicParamsContainer');
    if (!container) {
        console.warn('[updateDynamicParams] Container not found!');
        return;
    }

    const vars = new Map(); // Map of varId -> { label, min, max, step, default }

    // 1. 從 Mechanism Config 讀取設定好的 isDynamic 參數
    const mods = getActiveModules();
    if (mods && mods.config && mods.config.parameters) {
        mods.config.parameters.forEach(p => {
            if (p.isDynamic) {
                vars.set(p.id, {
                    label: p.label,
                    min: p.min ?? 0,
                    max: p.max ?? 300,
                    step: p.step ?? 0.1,
                    default: p.default ?? 50
                });
            }
        });
    }

    // 2. 從 Topology JSON 自動掃描參數名 (針對 Multilink)
    const topoEl = document.getElementById('topology');
    let topologyObj = null; // Store parsed topology for grouping

    if (topoEl) {
        try {
            topologyObj = JSON.parse(topoEl.value);
            const topology = topologyObj;

            const scan = (obj) => {
                if (!obj || typeof obj !== 'object') return;

                if (Array.isArray(obj)) {
                    obj.forEach(item => scan(item));
                    return;
                }

                for (const k in obj) {
                    const val = obj[k];
                    // 擴展掃描關鍵字，包含孔位的 r1Param, r2Param 以及新的 distParam
                    const isParamKey = k.endsWith('_param') || k === 'lenParam' || k === 'len_param' || k === 'r1Param' || k === 'r2Param' || k === 'angleParam' || k === 'distParam' || k === 'dist_param';
                    if (isParamKey && typeof val === 'string') {
                        if (val && !vars.has(val)) {
                            // 🌟 修正：優先使用 topology.params 裡面的實測數值，而非死板的 100
                            const actualVal = (topology.params && topology.params[val] !== undefined) ? topology.params[val] : 100;
                            vars.set(val, {
                                label: val,
                                min: 0,
                                max: 500,
                                step: 0.5,
                                default: actualVal
                            });
                        }
                    } else if (val && typeof val === 'object') {
                        scan(val);
                    }
                }
            };
            scan(topology);

            // 3. 補強：掃描 params 物件中的所有鍵 (確保 Wizard 定義的 r1, r2 也能變成滑桿)
            if (topology.params) {
                Object.keys(topology.params).forEach(k => {
                    if (k === 'theta' || k === 'thetaDeg') return;
                    if (!vars.has(k)) {
                        vars.set(k, {
                            label: k,
                            min: 0,
                            max: 500,
                            step: 1,
                            default: topology.params[k] || 100
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('[updateDynamicParams] Topology JSON parse failed', e);
        }
    }

    // 紀錄當前焦點位置
    const activeElement = document.activeElement;
    const activeId = activeElement ? activeElement.id : null;
    const activeValue = activeElement ? activeElement.value : null;
    const selectionStart = activeElement && activeElement.selectionStart;
    const selectionEnd = activeElement && activeElement.selectionEnd;

    // 如果當前正在輸入動態參數，則跳過更新（避免閃爍或失去焦點）
    if (activeId && activeId.startsWith('dyn_')) {
        return;
    }

    // 3. 移除舊的動態參數 (Remove params that no longer exist)
    const existingDynamic = container.querySelectorAll('.dynamic-param-wrapper');
    existingDynamic.forEach(div => {
        const id = div.dataset.varId;
        if (!vars.has(id)) {
            div.remove();
        }
    });

    // Remove empty groups
    const existingGroups = container.querySelectorAll('.param-group');
    existingGroups.forEach(group => {
        if (group.querySelectorAll('.dynamic-param-wrapper').length === 0) {
            group.remove();
        }
    });

    // Helper to create/get wrapper
    const getOrCreateWrapper = (varId, info) => {
        let wrapper = container.querySelector(`.dynamic-param-wrapper[data-var-id="${varId}"]`);
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'dynamic-param-wrapper';
            wrapper.dataset.varId = varId;
            wrapper.style.marginBottom = '8px';
            wrapper.style.padding = '4px 8px';
            wrapper.style.background = '#fff';
            wrapper.style.border = '1px solid #eee';
            wrapper.style.borderRadius = '4px';

            wrapper.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px;">
                    <label style="width:60px; font-size:11px; font-weight:bold; color:#2c3e50; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${info.label}">${info.label}</label>
                    <input type="number" id="dyn_${varId}" value="${info.default}" step="${info.step}" style="width:55px; padding:2px; font-size:11px; border:1px solid #ddd; border-radius:3px;" class="dynamic-input" data-var-id="${varId}">
                    <input type="range" id="dyn_${varId}_range" value="${info.default}" min="${info.min}" max="${info.max}" step="${info.step}" style="flex:1; height:14px; margin:0; cursor:pointer;">
                </div>
            `;

            // Bind events (same as before)
            const numInput = wrapper.querySelector('input[type="number"]');
            const rangeInput = wrapper.querySelector('input[type="range"]');
            bindParamEvents(numInput, rangeInput, varId);
        } else {
            // Update existing wrapper values if needed (optional, but good for sync)
            // We don't overwrite value if user is editing, but here we are not editing.
            // Actually, we should respect current value if it exists? 
            // The original code didn't overwrite value if wrapper existed.
        }
        return wrapper;
    };

    const bindParamEvents = (numInput, rangeInput, varId) => {
        if (numInput.dataset.eventsBound) return;
        numInput.dataset.eventsBound = 'true';

        let updateTimer;
        const debouncedUpdate = () => {
            clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                updatePreview();
            }, 300);
        };

        numInput.addEventListener('input', (e) => {
            e.stopPropagation();
            handleParamInput(varId, numInput, rangeInput, debouncedUpdate);
        }, true);

        rangeInput.addEventListener('input', (e) => {
            e.stopPropagation();
            handleParamInput(varId, numInput, rangeInput, debouncedUpdate, true);
        }, true);
    };

    const handleParamInput = (varId, numInput, rangeInput, callback, isRange = false) => {
        const mods = getActiveModules();
        if (mods && mods.config && mods.config.id === 'multilink') {
            const { mech } = readInputs();
            const dynContainer = document.getElementById('dynamicParamsContainer');
            if (dynContainer) {
                const inputs = dynContainer.querySelectorAll('input.dynamic-input');
                inputs.forEach(inp => {
                    const vId = inp.dataset.varId;
                    if (vId !== varId) {
                        mech[vId] = parseFloat(inp.value) || 0;
                    }
                });
            }

            import('../multilink/constraints.js').then(({ calculateValidRange }) => {
                const range = calculateValidRange(mech, varId);
                let val = parseFloat(isRange ? rangeInput.value : numInput.value) || 0;

                if (range) {
                    if (val < range.min) val = range.min;
                    if (val > range.max) val = range.max;

                    if (isRange) {
                        if (val !== parseFloat(rangeInput.value)) rangeInput.value = val;
                    } else {
                        if (val !== parseFloat(numInput.value)) numInput.value = val;
                    }
                }

                if (isRange) numInput.value = val;
                else rangeInput.value = val;

                callback();
            });
        } else {
            if (isRange) numInput.value = rangeInput.value;
            else rangeInput.value = numInput.value;
            callback();
        }
    };

    const renderedVars = new Set();
    if (topologyObj && topologyObj._wizard_data) {
        topologyObj._wizard_data.forEach(comp => {
            if (comp.type === 'triangle' || comp.type === 'slider') {
                let params = [];
                if (comp.type === 'triangle') {
                    params = [comp.r1Param, comp.r2Param, comp.gParam];
                } else if (comp.type === 'slider') {
                    params = [comp.lenParam, comp.trackLenParam, comp.trackOffsetParam];
                }
                params = params.filter(p => p && vars.has(p));

                if (params.length > 0) {
                    // Create Group Container
                    let group = container.querySelector(`.param-group[data-comp-id="${comp.id}"]`);
                    if (!group) {
                        group = document.createElement('div');
                        group.className = 'param-group';
                        group.dataset.compId = comp.id;
                        group.style.border = '1px solid #ddd';
                        group.style.borderRadius = '4px';
                        group.style.padding = '8px';
                        group.style.marginBottom = '8px';
                        group.style.background = '#f9f9f9';

                        const title = document.createElement('div');
                        title.style.fontSize = '12px';
                        title.style.fontWeight = 'bold';
                        title.style.marginBottom = '6px';
                        title.style.color = '#555';
                        title.style.display = 'flex';
                        title.style.justifyContent = 'space-between';
                        title.innerHTML = `<span>${comp.id}</span>`;
                        group.appendChild(title);

                        container.appendChild(group);
                    }

                    // Render params inside group
                    params.forEach(varId => {
                        const wrapper = getOrCreateWrapper(varId, vars.get(varId));
                        group.appendChild(wrapper); // Move to group
                        renderedVars.add(varId);
                    });
                }
            }
        });
    }

    // 5. Render remaining params (flat)
    vars.forEach((info, varId) => {
        if (!renderedVars.has(varId)) {
            const wrapper = getOrCreateWrapper(varId, info);
            container.appendChild(wrapper); // Move to main container (if not already there)
        }
    });

    // 恢復焦點
    if (activeId && activeId.startsWith('dyn_')) {
        const elementToFocus = document.getElementById(activeId);
        if (elementToFocus) {
            elementToFocus.focus();
            if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
                elementToFocus.setSelectionRange(selectionStart, selectionEnd);
            }
        }
    }
}

/**
 * 更新預覽畫面
 */
export function updatePreview() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();

        // 併入動態參數
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input.dynamic-input');
            inputs.forEach(inp => {
                const varId = inp.id.replace('dyn_', '');
                mech[varId] = parseFloat(inp.value) || 0;
            });
        }

        if (mods.config && mods.config.id === 'multilink') {
            const topoKey = mech.topology || '';
            if (topoKey !== lastMultilinkTopology) {
                lastMultilinkTopology = topoKey;
                lastMultilinkSolution = null;
            }
            if (lastMultilinkSolution && lastMultilinkSolution.points) {
                mech._prevPoints = lastMultilinkSolution.points;
            }

            const thetaContainer = $("thetaSliderContainer");
            if (thetaContainer) {
                let topology = mech.topology;
                if (typeof topology === 'string') {
                    try { topology = JSON.parse(topology); } catch (e) { topology = null; }
                }
                const hasInput = topology && Array.isArray(topology.steps) &&
                    topology.steps.some(s => s.type === 'input_crank');
                thetaContainer.style.display = hasInput ? 'block' : 'none';
            }
        }

        const viewParams = readViewParams();
        viewParams.motorType = mech.motorType;
        viewParams.motorRotation = mech.motorRotation || 0;
        viewParams.topology = mech.topology;
        if (window.mechanismViewOffset) {
            viewParams.panX = window.mechanismViewOffset.x;
            viewParams.panY = window.mechanismViewOffset.y;
        }

        const sw = document.getElementById("svgWrap");
        if (sw) {
            const styles = getComputedStyle(sw);
            const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
            const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
            const innerW = sw.clientWidth - (Number.isFinite(padX) ? padX : 0);
            const innerH = sw.clientHeight - (Number.isFinite(padY) ? padY : 0);
            viewParams.width = Math.max(0, innerW) || 800;
            viewParams.height = Math.max(0, innerH) || 600;
        }

        validateConfig(mech, partSpec, mfg);

        const solveFn = mods.solver[mods.config.solveFn];
        let sol = solveFn(mech);

        const svgWrap = $("svgWrap");
        const isInvalid = !sol || sol.isValid === false;

        // 🌟 顯示警告橫幅 (不論是否在阻力模式)
        const warning = document.getElementById('invalidWarning');
        if (warning) {
            warning.style.display = isInvalid ? 'block' : 'none';
        }

        // 🌟 阻力模式 (Resistance Mode) 🌟
        // 當使用者拖曳滑桿碰到死點時，強制回彈
        if (isInvalid) {
            if (lastMultilinkSolution && lastMultilinkSolution.isValid) {
                // 1. 還原解 (凍結畫面)
                // sol = lastMultilinkSolution; // 為了安全起見，我們不直接替換 sol 變數，而是下面直接用舊的 sol 畫圖

                // 2. 還原滑桿數值 (產生阻力感)
                const thetaInput = $("theta");
                if (thetaInput && lastMultilinkSolution.inputTheta !== undefined) {
                    thetaInput.value = lastMultilinkSolution.inputTheta;
                    // 注意：這裡不觸發 event，避免無窮迴圈
                }

                // 🌟 還原動態參數滑桿 (例如 L4)
                if (lastMultilinkSolution.dynamicParams) {
                    for (const [varId, val] of Object.entries(lastMultilinkSolution.dynamicParams)) {
                        const inp = document.getElementById(`dyn_${varId}`);
                        const range = document.getElementById(`dyn_${varId}_range`);
                        if (inp) inp.value = val;
                        if (range) range.value = val;
                    }
                }

                // 繼續執行，用舊的有效解來繪圖
                sol = lastMultilinkSolution;
                log(`${mods.config.name}: limit reached, holding position.`);
            } else {
                // 如果連一個有效解都沒有 (剛載入就是壞的)，那就只好顯示錯誤
                log(`${mods.config.name}: invalid parameters, adjust values.`);

                if (!svgWrap.firstChild) {
                    svgWrap.textContent = "(invalid)";
                    $("partsWrap").innerHTML = "";
                    $("dlButtons").innerHTML = "";
                }
                return;
            }
        } else {
            // 如果是有效解，記住它，以此作為下一次的回退點
            if (mods.config && mods.config.id === 'multilink') {
                sol.inputTheta = mech.theta; // 記錄對應的輸入角度
                sol.dynamicParams = collectDynamicParams(); // 🌟 記錄動態參數
                lastMultilinkSolution = sol;
            }
        }

        if (mods.config && mods.config.id === 'multilink') {
            // lastMultilinkSolution = sol; // 🌟 移除冗餘且可能造成問題的賦值

            const showTrajectory = $("showTrajectory")?.checked;
            if (showTrajectory) {
                const sweepParams = readSweepParams();
                const sweepFn = mods.solver.sweepTopology || mods.solver.sweepTheta;
                if (sweepFn) {
                    let sweepResult;
                    if (mods.solver.sweepTopology) {
                        let topology = mech.topology;
                        if (typeof topology === 'string') {
                            try { topology = JSON.parse(topology); } catch (e) { }
                        }
                        sweepResult = sweepFn(topology, mech, sweepParams.sweepStart, sweepParams.sweepEnd, sweepParams.sweepStep);
                    } else {
                        sweepResult = sweepFn(mech, sweepParams.sweepStart, sweepParams.sweepEnd, sweepParams.sweepStep);
                    }
                    currentTrajectoryData = {
                        results: sweepResult.results,
                        validRanges: sweepResult.validRanges,
                        invalidRanges: sweepResult.invalidRanges,
                        validBPoints: sweepResult.results.filter((r) => r.isValid && r.B).map((r) => r.B)
                    };
                }
            } else {
                currentTrajectoryData = null;
            }
        }

        svgWrap.innerHTML = "";
        const renderFn = mods.visualization[mods.config.renderFn];
        svgWrap.appendChild(
            renderFn(sol, mech.thetaDeg || mech.theta, currentTrajectoryData, viewParams)
        );

        const partsFn = mods.parts[mods.config.partsFn];
        const parts = partsFn({ ...mech, ...partSpec, ...(sol ? sol.dynamicParams : {}) });

        $("partsWrap").innerHTML = "";
        $("partsWrap").appendChild(
            renderPartsLayout(parts, partSpec.workX, partSpec.workY)
        );

        const cutDepth = mfg.thickness + mfg.overcut;
        const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));
        log(
            [
                `${mods.config.name} 預覽：OK`,
                `加工資訊：切割深度=${fmt(cutDepth)}mm, Stepdown=${fmt(mfg.stepdown)}mm, 總層數=${layers}`,
                `工作範圍：${partSpec.workX} x ${partSpec.workY} (mm)`,
            ].join("\n")
        );

        // 🌟 自動生成 DXF 下載按鈕 (同步預覽)
        const dl = $("dlButtons");
        dl.innerHTML = ""; // Clear previous buttons

        try {
            const dxfText = buildDXF(parts);
            const dxfBtn = document.createElement("button");
            dxfBtn.textContent = `下載 DXF 零件檔 (預覽)`;
            dxfBtn.className = "btn-download";
            dxfBtn.style.backgroundColor = "#6a1b9a";
            dxfBtn.style.width = "100%"; // Make it prominent
            dxfBtn.style.marginBottom = "5px";
            dxfBtn.onclick = () => downloadText("mechanism_parts.dxf", dxfText);
            dl.appendChild(dxfBtn);
        } catch (e) {
            console.warn("Auto-DXF generation failed:", e);
        }

    } catch (e) {
        log(`更新失敗：${e.message}`);
        console.error(e);
        $("svgWrap").innerHTML = "";
        $("partsWrap").innerHTML = "";
        $("dlButtons").innerHTML = "";
    }
}

/**
 * 生成 G-code 檔案
 */
export function generateGcodes() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input.dynamic-input');
            inputs.forEach(inp => {
                const varId = inp.id.replace('dyn_', '');
                mech[varId] = parseFloat(inp.value) || 0;
            });
        }

        validateConfig(mech, partSpec, mfg);

        const solveFn = mods.solver[mods.config.solveFn];
        const sol = solveFn(mech);
        if (!sol || sol.isValid === false) throw new Error("Invalid parameters, adjust values.");

        const partsFn = mods.parts[mods.config.partsFn];
        const parts = partsFn({ ...mech, ...partSpec });

        const files = buildAllGcodes(parts, mfg);

        const dl = $("dlButtons");
        dl.innerHTML = "";

        for (const f of files) {
            const btn = document.createElement("button");
            btn.textContent = `下載 ${f.name}`;
            btn.className = "btn-download";
            btn.onclick = () => downloadText(f.name, f.text);
            dl.appendChild(btn);
        }

        const dxfText = buildDXF(parts);
        const dxfBtn = document.createElement("button");
        dxfBtn.textContent = `下載 DXF 零件檔`;
        dxfBtn.className = "btn-download";
        dxfBtn.style.backgroundColor = "#6a1b9a";
        dxfBtn.onclick = () => downloadText("mechanism_parts.dxf", dxfText);
        dl.appendChild(dxfBtn);

        const zipBtn = document.createElement("button");
        zipBtn.textContent = `下載所有檔案 (ZIP)`;
        zipBtn.className = "btn-download";
        zipBtn.style.backgroundColor = "#2e7d32";
        zipBtn.onclick = () => {
            const allFiles = [...files, { name: "mechanism_parts.dxf", text: dxfText }];
            downloadZip("mechanism_cnc_files.zip", allFiles);
        };
        dl.appendChild(zipBtn);

        const machiningInfo = generateMachiningInfo(mfg, parts.length);
        log($("log").textContent + "\n\n" + machiningInfo + "\n\nG-code generated.");
    } catch (e) {
        log(`生成失敗：${e.message}`);
        $("dlButtons").innerHTML = "";
    }
}

/**
 * 執行掃描分析
 */
export function performSweepAnalysis() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input.dynamic-input');
            inputs.forEach(inp => {
                const varId = inp.id.replace('dyn_', '');
                mech[varId] = parseFloat(inp.value) || 0;
            });
        }

        validateConfig(mech, partSpec, mfg);

        const sweepParams = readSweepParams();
        const motorTypeEl = $("motorType");
        const motorTypeText = motorTypeEl ? motorTypeEl.selectedOptions[0].textContent : "motor";

        if (sweepParams.sweepStart >= sweepParams.sweepEnd) {
            throw new Error("掃描起始度需小於結束角度。");
        }
        if (sweepParams.sweepStep <= 0) {
            throw new Error("掃描間隔需大於 0。");
        }

        const sweepFn = mods.solver.sweepTheta || sweepTheta;
        const { results, validRanges, invalidRanges } = sweepFn(
            mech,
            sweepParams.sweepStart,
            sweepParams.sweepEnd,
            sweepParams.sweepStep
        );

        const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
        currentTrajectoryData = {
            results,
            validRanges,
            invalidRanges,
            validBPoints,
            motorType: motorTypeText,
        };

        displaySweepResults(results, validRanges, invalidRanges, sweepParams.showTrajectory, motorTypeText);
        updatePreview();

        log(
            `分析完成 (${motorTypeText})\n` +
            `範圍: ${sweepParams.sweepStart}° 到 ${sweepParams.sweepEnd}°\n` +
            `有效區間: ${validRanges.length}, 無效區間: ${invalidRanges.length}`
        );
    } catch (e) {
        log(`錯誤：${e.message}`);
    }
}

function displaySweepResults(results, validRanges, invalidRanges, showTrajectory, motorTypeText) {
    const resultDiv = document.getElementById("log");
    if (!resultDiv) return;

    let html = `<strong>分析結果 (${motorTypeText})：</strong><br/>`;

    if (validRanges.length > 0) {
        html += `<span style="color:#27ae60;">可運行範圍：</span><br/>`;
        for (const r of validRanges) {
            html += `<span style="color:#27ae60; margin-left:12px;">從 ${fmt(r.start)}° 到 ${fmt(r.end)}°</span><br/>`;
        }
    } else {
        html += `<span style="color:#e74c3c;">無任何可運行區間</span><br/>`;
    }

    const statsFn = getActiveModules().solver.calculateTrajectoryStats || calculateTrajectoryStats;
    const stats = statsFn(results);
    if (stats) {
        html += `<br/><strong>軌跡範圍：</strong> X: ${fmt(stats.rangeX)} mm, Y: ${fmt(stats.rangeY)} mm<br/>`;
    }
}

/**
 * 初始化 UI 事件
 */
export function setupUIHandlers() {
    console.log('Setup UI Handlers');

    const btnUpdate = $("btnUpdate");
    if (btnUpdate) btnUpdate.onclick = updatePreview;

    const thetaSlider = $("thetaSlider");
    const thetaSliderValue = $("thetaSliderValue");
    const thetaInput = $("theta");
    if (thetaSlider && thetaSliderValue) {
        if (thetaInput) {
            const syncThetaFromInput = () => {
                const val = Number(thetaInput.value || 0);
                thetaSlider.value = String(val);
                thetaSliderValue.textContent = `${val}°`;
            };
            const syncThetaFromSlider = () => {
                thetaInput.value = thetaSlider.value;
                thetaSliderValue.textContent = `${thetaSlider.value}°`;
                updatePreview();
            };

            const updateThetaSliderRange = () => {
                const sweepStart = $("sweepStart");
                const sweepEnd = $("sweepEnd");
                const thetaSliderMin = $("thetaSliderMin");
                const thetaSliderMax = $("thetaSliderMax");

                if (sweepStart && sweepEnd) {
                    const minVal = Number(sweepStart.value || -360);
                    const maxVal = Number(sweepEnd.value || 360);
                    thetaSlider.min = String(minVal);
                    thetaSlider.max = String(maxVal);
                    if (thetaSliderMin) thetaSliderMin.textContent = `${minVal}°`;
                    if (thetaSliderMax) thetaSliderMax.textContent = `${maxVal}°`;
                }
            };

            syncThetaFromInput();
            updateThetaSliderRange();

            thetaInput.addEventListener('input', syncThetaFromInput);
            thetaSlider.addEventListener('input', syncThetaFromSlider);

            const sweepStart = $("sweepStart");
            const sweepEnd = $("sweepEnd");
            if (sweepStart) sweepStart.addEventListener('change', updateThetaSliderRange);
            if (sweepEnd) sweepEnd.addEventListener('change', updateThetaSliderRange);
        } else {
            thetaSlider.disabled = true;
            thetaSliderValue.textContent = '--';
        }
    }

    const viewRangeSlider = $("viewRangeSlider");
    const viewRangeSliderValue = $("viewRangeSliderValue");
    const viewRangeInput = $("viewRange");
    if (viewRangeSlider && viewRangeSliderValue) {
        if (viewRangeInput) {
            const syncRangeFromInput = () => {
                const val = Number(viewRangeInput.value || 0);
                viewRangeSlider.value = String(val);
                viewRangeSliderValue.textContent = String(val);
            };
            const syncRangeFromSlider = () => {
                viewRangeInput.value = viewRangeSlider.value;
                viewRangeSliderValue.textContent = viewRangeSlider.value;
                updatePreview();
            };
            syncRangeFromInput();
            viewRangeInput.addEventListener('input', syncRangeFromInput);
            viewRangeSlider.addEventListener('input', syncRangeFromSlider);
        }
    }

    const btnNewConfig = $("btnNewConfig");
    if (btnNewConfig) {
        btnNewConfig.onclick = () => {
            if (confirm('確定要建立新檔嗎？未儲存的變更將消失。')) {
                window.location.reload();
            }
        };
    }

    const btnOpenConfig = $("btnOpenConfig");
    const fileInput = $("configFileInput");
    if (btnOpenConfig && fileInput) {
        btnOpenConfig.onclick = () => {
            fileInput.value = '';
            fileInput.click();
        };
        fileInput.addEventListener('change', () => {
            const file = fileInput.files && fileInput.files[0];
            handleOpenSnapshot(file);
        });
    }

    const btnSaveConfig = $("btnSaveConfig");
    if (btnSaveConfig) {
        btnSaveConfig.onclick = downloadSnapshot;
    }

    const btnGen = $("btnGen");
    if (btnGen) btnGen.onclick = generateGcodes;

    const btnPlay = $("btnPlayAnim");
    if (btnPlay) btnPlay.onclick = () => startAnimation(updatePreview);

    const btnPause = $("btnPauseAnim");
    if (btnPause) btnPause.onclick = pauseAnimation;

    const btnStop = $("btnStopAnim");
    if (btnStop) btnStop.onclick = () => stopAnimation(updatePreview);

    const topologyArea = document.getElementById('topology');
    if (topologyArea) {
        let topologyUpdateTimer;
        topologyArea.addEventListener('input', (e) => {
            clearTimeout(topologyUpdateTimer);
            topologyUpdateTimer = setTimeout(() => {
                updateDynamicParams();
                updatePreview();
            }, 1000);
        });
    }

    // 🌟 核心修正：確保所有機構載入時都能顯示動態滑桿
    updateDynamicParams();
}

// 🌟 暴露給全域
window.updateDynamicParams = updateDynamicParams;
window.setupUIHandlers = setupUIHandlers;
