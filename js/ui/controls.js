/**
 * UI Controls
 * UI ?批璅∠? - ????蝙?刻??Ｖ???
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

// ?典?頠楚鞈?
let currentTrajectoryData = null;
let lastMultilinkSolution = null;
let lastMultilinkTopology = null;

// 頛?賣嚗???銵?璅∠???蝵?
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

    updateDynamicParams();

    Object.keys(dynamicParams).forEach((key) => {
        setValueById(`dyn_${key}`, dynamicParams[key]);
        setValueById(`dyn_${key}_range`, dynamicParams[key]);
    });

    if (window.wizard && topologyValue) {
        try {
            window.wizard.init(JSON.parse(topologyValue));
        } catch (e) {
            console.warn('[applySnapshot] Failed to init wizard from topology', e);
        }
    }

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
 * ???????
 */
export function updateDynamicParams() {
    const container = document.getElementById('dynamicParamsContainer');
    if (!container) {
        console.warn('[updateDynamicParams] Container not found!');
        return;
    }

    const vars = new Map(); // Map of varId -> { label, min, max, step, default }

    // 1. 敺?Mechanism Config ?脣?璅???isDynamic ????
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

    // 2. 敺?Topology JSON ??霈 (?詨捆 Multilink)
    const topoEl = document.getElementById('topology');
    if (topoEl) {
        let topology;
        try {
            topology = JSON.parse(topoEl.value);

            const scan = (obj) => {
                if (!obj || typeof obj !== 'object') return;

                // 憒??舫???風瘥?蝝?
                if (Array.isArray(obj)) {
                    obj.forEach(item => scan(item));
                    return;
                }

                // 憒??舐隞塚??風瘥
                for (const k in obj) {
                    const val = obj[k];
                    const isParamKey = k.endsWith('_param') || k === 'lenParam' || k === 'len_param';
                    if (isParamKey && typeof val === 'string') {
                        if (val && !vars.has(val)) {
                            vars.set(val, {
                                label: val,
                                min: 0,
                                max: 500,
                                step: 0.5,
                                default: 100
                            });
                        }
                    } else if (val && typeof val === 'object') {
                        scan(val);
                    }
                }
            };
            scan(topology);
        } catch (e) {
            console.warn('[updateDynamicParams] Topology JSON parse failed', e);
        }
    }

    // 閮??嗅??阡???
    const activeElement = document.activeElement;
    const activeId = activeElement ? activeElement.id : null;
    const activeValue = activeElement ? activeElement.value : null;
    const selectionStart = activeElement && activeElement.selectionStart;
    const selectionEnd = activeElement && activeElement.selectionEnd;

    // ?? 憒??阡??典????貉撓?交?嚗歲??圈?僕?曇撓??
    if (activeId && activeId.startsWith('dyn_')) {
        return;
    }

    // 3. 蝘駁撌脩?瘝?啁????
    const existingDynamic = container.querySelectorAll('.dynamic-param-wrapper');
    existingDynamic.forEach(div => {
        const id = div.dataset.varId;
        if (!vars.has(id)) {
            div.remove();
        }
    });

    // 4. ?湔?憓???
    vars.forEach((info, varId) => {
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
            container.appendChild(wrapper);

            // 蝬??臬? - 雿輻?賢??賣?踹???蝬?
            const numInput = wrapper.querySelector('input[type="number"]');
            const rangeInput = wrapper.querySelector('input[type="range"]');

            // 璅?撌脩?摰?隞?
            if (!numInput.dataset.eventsBound) {
                numInput.dataset.eventsBound = 'true';

                // 雿輻?脫?靘?蝜??
                let updateTimer;
                const debouncedUpdate = () => {
                    clearTimeout(updateTimer);
                    updateTimer = setTimeout(() => {
                        console.log('Loaded file.');
                        // 銝矽??updateDynamicParams嚗?湔?汗
                        updatePreview();
                    }, 300);
                };

                numInput.addEventListener('input', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation(); // 摰?餅迫鈭辣?單
                    console.log(`[numInput input] ${varId} = ${numInput.value}`);
                    rangeInput.value = numInput.value;
                    debouncedUpdate();
                }, true); // 雿輻??挾

                rangeInput.addEventListener('input', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    console.log(`[rangeInput input] ${varId} = ${rangeInput.value}`);
                    numInput.value = rangeInput.value;
                    debouncedUpdate();
                }, true);
            }
        } else {
            console.log('Loaded file.');
            // ?湔?暹????惇?改?雿???萄遣嚗?仃?餌暺?
            const numInput = wrapper.querySelector('input[type="number"]');
            const rangeInput = wrapper.querySelector('input[type="range"]');

            if (numInput && rangeInput) {
                // ?芸?潔????湔嚗??璅歲??
                if (numInput.step !== String(info.step)) numInput.step = info.step;
                if (rangeInput.min !== String(info.min)) rangeInput.min = info.min;
                if (rangeInput.max !== String(info.max)) rangeInput.max = info.max;
                if (rangeInput.step !== String(info.step)) rangeInput.step = info.step;
            }
        }
    });

    // ?Ｗ儔?阡?
    if (activeId && activeId.startsWith('dyn_')) {
        const elementToFocus = document.getElementById(activeId);
        if (elementToFocus) {
            console.log('Loaded file.');
            elementToFocus.focus();
            if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
                elementToFocus.setSelectionRange(selectionStart, selectionEnd);
            }
        }
    }
}

/**
 * ?湔?汗
 */
export function updatePreview() {
    try {
        const mods = getActiveModules();
        if (!mods) return; // ??頛摰?

        const { mech, partSpec, mfg } = readInputs(); // ??霈??document.getElementById ?潘????????
        // readInputs ?航?芾???config 摰儔???詻???閬????鋆?mech??

        // 鋆?霈??dynamicParams
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
        }

        const viewParams = readViewParams();
        viewParams.motorType = mech.motorType;
        viewParams.motorRotation = mech.motorRotation || 0;
        viewParams.topology = mech.topology;

        // Force update dimensions from actual container
        const sw = document.getElementById("svgWrap");
        if (sw) {
            // Use clientWidth/Height directly
            viewParams.width = sw.clientWidth || 800;
            viewParams.height = sw.clientHeight || 600;
        }

        validateConfig(mech, partSpec, mfg);

        // 雿輻??璅∠???閫?
        const solveFn = mods.solver[mods.config.solveFn];
        const sol = solveFn(mech);

        const svgWrap = $("svgWrap");
        const isInvalid = !sol || sol.isValid === false;
        if (isInvalid) {
            log(`${mods.config.name}: invalid parameters, adjust values.`);
            if (!svgWrap.firstChild) {
                svgWrap.textContent = "(invalid)";
                $("partsWrap").innerHTML = "";
                $("dlButtons").innerHTML = "";
            }
            return;
        }
        if (mods.config && mods.config.id === 'multilink') {
            lastMultilinkSolution = sol;

            // Auto-sweep for trajectory if showTrajectory is enabled
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

        // 雿輻??璅∠??葡?
        const renderFn = mods.visualization[mods.config.renderFn];
        svgWrap.appendChild(
            renderFn(sol, mech.thetaDeg || mech.theta, currentTrajectoryData, viewParams)
        );

        // 雿輻??璅∠??隞嗥??
        const partsFn = mods.parts[mods.config.partsFn];
        const parts = partsFn({ ...mech, ...partSpec });

        $("partsWrap").innerHTML = "";
        $("partsWrap").appendChild(
            renderPartsLayout(parts, partSpec.workX, partSpec.workY)
        );

        // 憿舐內??
        const cutDepth = mfg.thickness + mfg.overcut;
        const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));
        log(
            [
                `${mods.config.name}閫??嚗K`,
                `?極嚗蜇?楛=${fmt(cutDepth)}mm嚗tepdown=${fmt(mfg.stepdown)}mm ??撅斗??{layers}`,
                `撌乩??嚗?{partSpec.workX} x ${partSpec.workY} (mm)`,
            ].join("\n")
        );

        $("dlButtons").innerHTML = "";
    } catch (e) {
        log(`?航炊嚗?{e.message}`);
        console.error(e);
        $("svgWrap").innerHTML = "";
        $("partsWrap").innerHTML = "";
        $("dlButtons").innerHTML = "";
    }
}

/**
 * ?? G-code
 */
export function generateGcodes() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();
        // 鋆? dynamic params logic duplicated (should factor out but simplicity for now)
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input[type="number"]');
            inputs.forEach(inp => {
                mech[inp.id] = parseFloat(inp.value) || 0;
            });
        }

        validateConfig(mech, partSpec, mfg);

        // 蝣箔??桀???舀?閫??
        const solveFn = mods.solver[mods.config.solveFn];
        const sol = solveFn(mech);
        if (!sol) throw new Error("Invalid parameters, adjust values.");

        // ???嗡辣
        const partsFn = mods.parts[mods.config.partsFn];
        const parts = partsFn({ ...mech, ...partSpec });

        // ?? G-code
        const files = buildAllGcodes(parts, mfg);

        // 撱箇?銝???
        const dl = $("dlButtons");
        dl.innerHTML = "";

        // 1. ?隞?G-code 銝?
        for (const f of files) {
            const btn = document.createElement("button");
            btn.textContent = `Download ${f.name}`;
            btn.className = "btn-download";
            btn.onclick = () => downloadText(f.name, f.text);
            dl.appendChild(btn);
        }

        // 2. ??隞?DXF 銝? (CAD ?臬)
        const dxfText = buildDXF(parts);
        const dxfBtn = document.createElement("button");
        dxfbtn.textContent = `Download ${f.name}`;
        dxfBtn.className = "btn-download";
        dxfBtn.style.backgroundColor = "#6a1b9a"; // ?寞?憿璅酉 DXF
        dxfBtn.onclick = () => downloadText("linkage_parts.dxf", dxfText);
        dl.appendChild(dxfBtn);

        // 3. 銝?菜???ZIP
        const zipBtn = document.createElement("button");
        zipbtn.textContent = `Download ${f.name}`;
        zipBtn.className = "btn-download";
        zipBtn.style.backgroundColor = "#2e7d32"; // 蝬璅酉
        zipBtn.onclick = () => {
            const allFiles = [...files, { name: "linkage_parts.dxf", text: dxfText }];
            downloadZip("mechanism_cnc_files.zip", allFiles);
        };
        dl.appendChild(zipBtn);

        const machiningInfo = generateMachiningInfo(mfg, parts.length);
        log($("log").textContent + "\n\n" + machiningInfo + "\n\nG-code generated.");
    } catch (e) {
        log(`?航炊嚗?{e.message}`);
        $("dlButtons").innerHTML = "";
    }
}

/**
 * ?? Theta ??
 */
export function performSweepAnalysis() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input[type="number"]');
            inputs.forEach(inp => {
                mech[inp.id] = parseFloat(inp.value) || 0;
            });
        }

        validateConfig(mech, partSpec, mfg);

        const sweepParams = readSweepParams();
        const motorTypeEl = $("motorType");
        const motorTypeText = motorTypeEl ? motorTypeEl.selectedOptions[0].textContent : "motor";

        if (sweepParams.sweepStart >= sweepParams.sweepEnd) {
            throw new Error("Sweep start must be less than end.");
        }
        if (sweepParams.sweepStep <= 0) {
            throw new Error("Sweep step must be > 0.");
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
            `Sweep (${motorTypeText})\n` +
            `Theta: ${sweepParams.sweepStart} to ${sweepParams.sweepEnd}\n` +
            `Valid ranges: ${validRanges.length}, Invalid ranges: ${invalidRanges.length}`
        );
    } catch (e) {
        log(`Error: ${e.message}`);
    }
}
/**
 * 憿舐內??蝯?
 */
function displaySweepResults(results, validRanges, invalidRanges, showTrajectory, motorTypeText) {
    const resultDiv = document.getElementById("log"); // 蝯曹?憿舐內??log
    if (!resultDiv) return;

    let html = `<strong>??{motorTypeText}??????</strong><br/>`;

    if (validRanges.length > 0) {
        html += `<span style="color:#27ae60;">???航????</span><br/>`;
        for (const r of validRanges) {
            html += `<span style="color:#27ae60; margin-left:12px;">??${fmt(r.start)}簞 ??${fmt(r.end)}簞</span><br/>`;
        }
    } else {
        html += `<span style="color:#e74c3c;">???∪銵?摨?/span><br/>`;
    }

    // 頠楚蝯梯? (?桀? solver 璅∠?敹??瑕? calculateTrajectoryStats)
    const statsFn = getActiveModules().solver.calculateTrajectoryStats || calculateTrajectoryStats;
    const stats = statsFn(results);
    if (stats) {
        html += `<br/><strong>頠楚銵?嚗?/strong> X: ${fmt(stats.rangeX)} mm, Y: ${fmt(stats.rangeY)} mm<br/>`;
    }
}

/**
 * 閮剖????UI 鈭辣????
 */
export function setupUIHandlers() {
    console.log('Loaded file.');

    // ??蝬?
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

            // 同步掃描範圍到 theta slider
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

                    // 更新顯示的範圍標籤
                    if (thetaSliderMin) thetaSliderMin.textContent = `${minVal}°`;
                    if (thetaSliderMax) thetaSliderMax.textContent = `${maxVal}°`;
                }
            };

            syncThetaFromInput();
            updateThetaSliderRange();

            thetaInput.addEventListener('input', syncThetaFromInput);
            thetaSlider.addEventListener('input', syncThetaFromSlider);

            // 監聽掃描範圍改變
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
        } else {
            viewRangeSlider.disabled = true;
            viewRangeSliderValue.textContent = '--';
        }
    }

    const btnNewConfig = $("btnNewConfig");
    if (btnNewConfig) {
        btnNewConfig.onclick = () => {
            if (confirm('Create new file? Unsaved changes will be lost.')) {
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

    const viewRange = $("viewRange");
    if (viewRange) {
        viewRange.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                updatePreview();
            }
        });
    }

    // Dynamic params listener
    const topologyArea = document.getElementById('topology');
    if (topologyArea) {
        // 雿輻?脫??踹??餌????
        let topologyUpdateTimer;

        topologyArea.addEventListener('input', (e) => {
            clearTimeout(topologyUpdateTimer);
            // 憓???1000ms嚗??冽?雲憭??撓??
            topologyUpdateTimer = setTimeout(() => {
                updateDynamicParams();
            }, 1000);
        });

        // 憭勗?阡????單??
        topologyArea.addEventListener('blur', () => {
            clearTimeout(topologyUpdateTimer);
            updateDynamicParams();
        });
    }

    // Initial scan for all mechanisms
    updateDynamicParams();
    // 為所有參數輸入框添加 change 事件監聽器（自動更新預覽）
    const paramInputs = document.querySelectorAll('#parametersPanel input, #parametersPanel select, #partSpecsPanel input, #partSpecsPanel select');
    paramInputs.forEach(input => {
        // 跳過已經有特殊處理的元素
        if (input.id === 'theta' || input.id === 'viewRange' || input.id === 'topology') return;

        input.addEventListener('change', () => {
            updatePreview();
        });
    });
    // ??璈??航?摰? handler
    const mods = getActiveModules();
    if (mods && mods.solver.setupMotorTypeHandler) {
        mods.solver.setupMotorTypeHandler();
    } else {
        setupMotorTypeHandler();
    }

    // ??皜脫? - 蝡?瑁?
    console.log('Loaded file.');
    try {
        updatePreview();
    } catch (e) {
        console.error('Initial preview failed:', e);
        // 憒?憭望?嚗?閰虫?甈?
        setTimeout(() => {
            console.log('Loaded file.');
            updatePreview();
        }, 200);
    }

    // ?箸???急??溶??葬?暹???
    ['btnPlayAnim', 'btnPauseAnim', 'btnStopAnim'].forEach(id => {
        const btn = $(id);
        if (btn) {
            btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.transform = 'scale(1.05)'; });
            btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
        }
    });

    // Resize Observer / Window Resize
    window.addEventListener('resize', () => {
        // Debounce slightly
        clearTimeout(window._resizeTimer);
        window._resizeTimer = setTimeout(() => {
            updatePreview();
        }, 100);
    });
}
