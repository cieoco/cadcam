/**
 * UI Controls
 * UI 控制器模組 - 處理使用者介面互動邏輯
 */

import { $, log, downloadText, downloadZip, fmt, calcAdaptiveGridStep } from '../utils.js';
import { readInputs, readSweepParams, readViewParams } from '../config.js';
import { sweepTheta, calculateTrajectoryStats } from '../fourbar/solver.js';
import { startAnimation, pauseAnimation, stopAnimation, setupMotorTypeHandler } from '../fourbar/animation.js';
import { renderPartsLayout, renderPartsOverlayLayer } from '../parts/renderer.js';
import { computeEnginePreview, computeEngineSweep, computeEngineExport, clampEngineParam } from '../core/mechanism-engine.js';
import { collectDynamicParamSpec } from '../core/dynamic-params.js';

// 全域狀態資料
let currentTrajectoryData = null;
let lastMultilinkSolution = null;
let lastMultilinkTopology = null;
let lastMotorAngleKey = '';
let motorAngleUpdateTimer = null;

// 輔助函數：獲取當前活耀的機構模組
function getActiveModules() {
    return window.mechanismModules || null;
}


function parseTopologySafe(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }
    if (typeof raw === 'object') return raw;
    return null;
}

function renderGridLabelOverlay(viewParams) {
    const wrap = $("svgWrap");
    if (!wrap) return;
    let overlay = document.getElementById('gridLabelOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gridLabelOverlay';
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.fontSize = '9px';
        overlay.style.color = '#999';
        overlay.style.fontFamily = 'sans-serif';
        overlay.style.zIndex = '5';
        if (getComputedStyle(wrap).position === 'static') {
            wrap.style.position = 'relative';
        }
        wrap.appendChild(overlay);
    }

    overlay.innerHTML = '';
    if (!viewParams || viewParams.showGrid === false) return;

    const W = viewParams.width || 800;
    const H = viewParams.height || 600;
    const viewRange = viewParams.viewRange || 800;
    const pad = 50;
    const scale = Math.max(0.01, Math.min(W - 2 * pad, H - 2 * pad) / viewRange);
    const panX = viewParams.panX || 0;
    const panY = viewParams.panY || 0;

    let step = 50;
    if (viewParams.gridStep && viewParams.gridStep !== 'auto') {
        step = Number(viewParams.gridStep) || step;
    } else {
        const effectiveViewRange = Math.min(W, H) / scale;
        step = calcAdaptiveGridStep(effectiveViewRange);
    }

    const minModelX = (0 - W / 2 - panX) / scale;
    const maxModelX = (W - W / 2 - panX) / scale;
    const maxModelY = (H / 2 + panY - 0) / scale;
    const minModelY = (H / 2 + panY - H) / scale;

    const startX = Math.floor(minModelX / step) * step;
    const startY = Math.floor(minModelY / step) * step;

    const frag = document.createDocumentFragment();

    for (let modelX = startX; modelX <= maxModelX + step; modelX += step) {
        if (Math.abs(modelX) <= step / 10) continue;
        const screenX = W / 2 + modelX * scale + panX;
        if (screenX < 0 || screenX > W) continue;
        const bottom = document.createElement('div');
        bottom.textContent = Math.round(modelX);
        bottom.style.position = 'absolute';
        bottom.style.left = `${screenX}px`;
        bottom.style.top = `${H - 12}px`;
        bottom.style.transform = 'translateX(-50%)';
        frag.appendChild(bottom);
    }

    for (let modelY = startY; modelY <= maxModelY + step; modelY += step) {
        if (Math.abs(modelY) <= step / 10) continue;
        const screenY = H / 2 - modelY * scale + panY;
        if (screenY < 0 || screenY > H) continue;
        const right = document.createElement('div');
        right.textContent = Math.round(modelY);
        right.style.position = 'absolute';
        right.style.left = `${W - 4}px`;
        right.style.top = `${screenY}px`;
        right.style.transform = 'translate(-100%, -50%)';
        frag.appendChild(right);
    }

    overlay.appendChild(frag);
}

function getMotorIdsFromTopology(topology) {
    if (!topology || !Array.isArray(topology.steps)) return [];
    const ids = topology.steps
        .filter(s => s.type === 'input_crank')
        .map(s => String(s.physical_motor || '1'));
    const uniq = Array.from(new Set(ids));
    return uniq.sort((a, b) => Number(a) - Number(b));
}

function getMotorAngleZeroOffset(motorId) {
    const offsets = window.motorAngleZeroOffsets || {};
    const val = offsets[String(motorId)];
    return Number.isFinite(Number(val)) ? Number(val) : 0;
}

function setMotorAngleActualValue(motorId, actualValue, options = {}) {
    const id = String(motorId);
    const actual = Number(actualValue) || 0;
    const offset = getMotorAngleZeroOffset(id);
    const display = actual - offset;

    if (!window.motorAngles) window.motorAngles = {};
    window.motorAngles[id] = actual;

    const slider = document.getElementById(`motorAngle_M${id}`);
    const label = document.getElementById(`motorAngleValue_M${id}`);
    if (slider) slider.value = String(display);
    if (label) label.textContent = `${Math.round(display)}°`;

    if (id === '1') {
        const thetaInput = document.getElementById('theta');
        if (thetaInput) {
            thetaInput.value = String(display);
            if (!options.silent) {
                thetaInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
}

function setMotorAngleValue(motorId, value, options = {}) {
    const id = String(motorId);
    const display = Number(value) || 0;
    const offset = getMotorAngleZeroOffset(id);
    const actual = display + offset;

    if (!window.motorAngles) window.motorAngles = {};
    window.motorAngles[id] = actual;

    const slider = document.getElementById(`motorAngle_M${id}`);
    const label = document.getElementById(`motorAngleValue_M${id}`);
    if (slider) slider.value = String(display);
    if (label) label.textContent = `${Math.round(display)}°`;

    if (id === '1') {
        const thetaInput = document.getElementById('theta');
        if (thetaInput) {
            thetaInput.value = String(display);
            if (!options.silent) {
                thetaInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
}


function collectMotorAnglesFromUI() {
    const container = document.getElementById('motorAngleContainer');
    if (!container || container.style.display === 'none') return {};
    const inputs = container.querySelectorAll('input[type="range"][data-motor-id]');
    const angles = {};
    inputs.forEach(inp => {
        const id = inp.dataset.motorId;
        angles[id] = Number(inp.value || 0);
    });
    return angles;
}

function updateMotorAngleControls(topology) {
    const mods = getActiveModules();
    if (!mods || !mods.config || mods.config.id !== 'multilink') return;

    const container = document.getElementById('thetaSliderContainer');
    const motorContainer = document.getElementById('motorAngleContainer');
    const thetaBlock = document.getElementById('thetaSliderBlock');
    if (!container || !motorContainer) return;

    const motorIds = getMotorIdsFromTopology(topology);
    if (!motorIds.length) {
        motorContainer.style.display = 'none';
        if (thetaBlock) thetaBlock.style.display = 'none';
        return;
    }

    motorContainer.style.display = 'block';
    if (thetaBlock) thetaBlock.style.display = 'none';

    const key = motorIds.join(',');
    if (key !== lastMotorAngleKey) {
        motorContainer.innerHTML = '';
        motorIds.forEach((motorId) => {
            const row = document.createElement('div');
            row.style.marginBottom = '6px';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; pointer-events: auto;">
                    <label style="font-size:12px; color:#555; white-space:nowrap; font-weight:600;">M${motorId}</label>
                    <input id="motorAngle_M${motorId}" data-motor-id="${motorId}" type="range" min="-360" max="360" step="1" value="0" style="width:200px;" />
                    <span id="motorAngleValue_M${motorId}" style="font-size:12px; color:#333; font-weight:600; min-width:40px; text-align:center;">0°</span>
                </div>
            `;
            motorContainer.appendChild(row);

            const slider = row.querySelector('input[type="range"]');
            const label = row.querySelector(`#motorAngleValue_M${motorId}`);
            if (slider && label) {
                slider.addEventListener('input', () => {
                    const val = Number(slider.value || 0);
                    label.textContent = `${Math.round(val)}°`;
                    setMotorAngleValue(motorId, val, { silent: true });

                    clearTimeout(motorAngleUpdateTimer);
                    motorAngleUpdateTimer = setTimeout(() => {
                        updatePreview();
                    }, 120);
                });
            }
        });
        lastMotorAngleKey = key;
    }

    const sweepStart = document.getElementById('sweepStart');
    const sweepEnd = document.getElementById('sweepEnd');
    const minVal = sweepStart ? Number(sweepStart.value || -360) : -360;
    const maxVal = sweepEnd ? Number(sweepEnd.value || 360) : 360;
    motorContainer.querySelectorAll('input[type="range"][data-motor-id]').forEach(inp => {
        inp.min = String(minVal);
        inp.max = String(maxVal);
    });

    const currentAngles = collectMotorAnglesFromUI();
    motorIds.forEach(id => {
        if (currentAngles[id] === undefined) {
            const fallback = window.motorAngles && window.motorAngles[id] !== undefined
                ? window.motorAngles[id]
                : 0;
            setMotorAngleActualValue(id, fallback, { silent: true });
        }
    });
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


function syncDynamicParamsToTopology(dynamicParams) {
    const topoEl = document.getElementById('topology');
    if (!topoEl) return;
    const topology = parseTopologySafe(topoEl.value);
    if (!topology || typeof topology !== 'object') return;
    if (!topology.params || typeof topology.params !== 'object') {
        topology.params = {};
    }

    let changed = false;
    Object.entries(dynamicParams || {}).forEach(([key, val]) => {
        if (topology.params[key] !== val) {
            topology.params[key] = val;
            changed = true;
        }
    });

    if (changed) {
        topoEl.value = JSON.stringify(topology, null, 2);
        topoEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
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

    setMotorAngleValue('1', firstValid.theta, { silent: true });
    const thetaInput = $("theta");
    if (thetaInput) {
        thetaInput.value = String(firstValid.theta);
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

    const mods = getActiveModules();
    const topoEl = document.getElementById('topology');
    let topologyObj = null;
    if (topoEl) {
        try {
            topologyObj = JSON.parse(topoEl.value);
        } catch (e) {
            console.warn('[updateDynamicParams] Topology JSON parse failed', e);
        }
    }

    const { vars, groups } = collectDynamicParamSpec(mods ? mods.config : null, topologyObj);

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
            wrapper.style.background = 'transparent';
            wrapper.style.border = '1px solid rgba(0,0,0,0.08)';
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

            const rawVal = parseFloat(isRange ? rangeInput.value : numInput.value);
            clampEngineParam({ mech, varId, value: rawVal }).then(({ value, range }) => {
                if (range) {
                    if (isRange) {
                        if (value !== parseFloat(rangeInput.value)) rangeInput.value = value;
                    } else {
                        if (value !== parseFloat(numInput.value)) numInput.value = value;
                    }
                }

                if (isRange) numInput.value = value;
                else rangeInput.value = value;

                syncDynamicParamsToTopology(collectDynamicParams());
                callback();
            });
        } else {
            if (isRange) numInput.value = rangeInput.value;
            else rangeInput.value = numInput.value;
            syncDynamicParamsToTopology(collectDynamicParams());
            callback();
        }
    };

    const renderedVars = new Set();
    if (groups.length) {
        groups.forEach(groupSpec => {
            let group = container.querySelector(`.param-group[data-comp-id="${groupSpec.id}"]`);
            if (!group) {
                group = document.createElement('div');
                group.className = 'param-group';
                group.dataset.compId = groupSpec.id;
                group.style.border = '1px solid #ddd';
                group.style.borderRadius = '4px';
                group.style.padding = '8px';
                group.style.marginBottom = '8px';
                group.style.background = 'transparent';

                const title = document.createElement('div');
                title.style.fontSize = '12px';
                title.style.fontWeight = 'bold';
                title.style.marginBottom = '6px';
                title.style.color = '#555';
                title.style.display = 'flex';
                title.style.justifyContent = 'space-between';
                title.innerHTML = `<span>${groupSpec.id}</span>`;
                group.appendChild(title);

                container.appendChild(group);
            }

            groupSpec.params.forEach(varId => {
                const wrapper = getOrCreateWrapper(varId, vars.get(varId));
                group.appendChild(wrapper);
                renderedVars.add(varId);
            });
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
        const dynamicParams = collectDynamicParams();
        Object.keys(dynamicParams).forEach((key) => {
            mech[key] = dynamicParams[key];
        });

        const remoteSync = window.remoteSyncInstance;
        const isSyncing = Boolean(remoteSync && remoteSync.isSyncing);

        let topologyObj = null;
        if (mods.config && mods.config.id === 'multilink') {
            topologyObj = parseTopologySafe(mech.topology);
            updateMotorAngleControls(topologyObj);
            const uiAngles = collectMotorAnglesFromUI();
            if (Object.keys(uiAngles).length && !isSyncing) {
                if (!window.motorAngles) window.motorAngles = {};
                Object.entries(uiAngles).forEach(([id, display]) => {
                    const actual = Number(display) + getMotorAngleZeroOffset(id);
                    window.motorAngles[id] = Number.isFinite(actual) ? actual : 0;
                });
            }
            if (window.motorAngles && Object.keys(window.motorAngles).length) {
                mech.motorAngles = { ...window.motorAngles };
            }
        }

        const viewParams = readViewParams();
        viewParams.motorType = mech.motorType;
        viewParams.motorRotation = mech.motorRotation || 0;
        viewParams.topology = mech.topology;
        if (!Number.isFinite(viewParams.viewRange)) {
            const viewRangeSlider = $("viewRangeSlider");
            const sliderVal = viewRangeSlider ? Number(viewRangeSlider.value) : NaN;
            viewParams.viewRange = Number.isFinite(sliderVal) ? sliderVal : 800;
        }
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

        const showTrajectory = $("showTrajectory")?.checked;
        const sweepParams = showTrajectory ? readSweepParams() : null;
        const svgWrap = $("svgWrap");
        const showPartsPreview = $("showPartsPreview") ? $("showPartsPreview").checked : true;
        const partsPanel = $("partsPreviewPanel");
        const engineState = computeEnginePreview({
            mods,
            mech,
            partSpec,
            mfg,
            dynamicParams,
            lastState: {
                lastSolution: lastMultilinkSolution,
                lastTopology: lastMultilinkTopology
            },
            showTrajectory: Boolean(showTrajectory),
            sweepParams,
            view: {
                showPartsPreview,
                expandedHeight: partsPanel ? partsPanel.dataset.expandedHeight : null,
                hasSvgChild: Boolean(svgWrap.firstChild)
            }
        });
        const previewState = engineState.previewState;
        const viewState = engineState.viewState;

        lastMultilinkSolution = engineState.lastState.lastSolution;
        lastMultilinkTopology = engineState.lastState.lastTopology;
        currentTrajectoryData = previewState.trajectoryData;
        window.currentTrajectoryData = currentTrajectoryData;

        const warning = document.getElementById('invalidWarning');
        if (warning) {
            warning.style.display = viewState.warningVisible ? 'block' : 'none';
        }

        const thetaContainer = $("thetaSliderContainer");
        if (thetaContainer) {
            thetaContainer.style.display = viewState.thetaVisible ? 'block' : 'none';
        }

        if (previewState.statusMessage) {
            log(previewState.statusMessage);
        }

        if (previewState.solution && previewState.solution.autoParams) {
            for (const [varId, val] of Object.entries(previewState.solution.autoParams)) {
                const inp = document.getElementById(`dyn_${varId}`);
                const range = document.getElementById(`dyn_${varId}_range`);
                if (inp) inp.value = val;
                if (range) range.value = val;
            }
        }

        // Keep user-entered values even when preview holds last valid state.

        if (viewState.fatalInvalid) {
            if (viewState.showInvalidPlaceholder) {
                svgWrap.textContent = '(invalid)';
                $("partsWrap").innerHTML = "";
                $("dlButtons").innerHTML = "";
            }
            return;
        }

        svgWrap.innerHTML = "";
        const renderFn = mods.visualization[mods.config.renderFn];
        const renderTheta = (mods.config && mods.config.id === 'multilink' && mech.motorAngles && mech.motorAngles['1'] !== undefined)
            ? mech.motorAngles['1']
            : (mech.thetaDeg || mech.theta);
        svgWrap.appendChild(
            renderFn(previewState.solution, renderTheta, currentTrajectoryData, viewParams)
        );

        if (mods.config && mods.config.id === 'multilink') {
            renderGridLabelOverlay(viewParams);
        }

        const parts = previewState.parts;

        const partsBody = $("partsPreviewBody");
        if (partsPanel) {
            partsPanel.style.height = viewState.parts.panelHeight;
        }
        if (partsBody) partsBody.style.display = viewState.parts.bodyDisplay;
        if (viewState.parts.show) {
            $("partsWrap").innerHTML = "";
            $("partsWrap").appendChild(
                renderPartsLayout(parts, partSpec.workX, partSpec.workY)
            );
        } else {
            $("partsWrap").innerHTML = "";
        }

        const overlayToggle = $("showPartsOverlay");
        const overlaySvg = svgWrap ? svgWrap.querySelector('svg') : null;
        if (overlaySvg) {
            const existingLayer = overlaySvg.querySelector('#partsOverlayLayer');
            if (existingLayer) existingLayer.remove();
        }
        if (overlayToggle && overlayToggle.checked && mods.config && mods.config.id === 'multilink') {
            const overlayTopology = topologyObj || parseTopologySafe(mech.topology);
            if (overlaySvg) {
                const layer = renderPartsOverlayLayer(previewState.solution, overlayTopology, partSpec, viewParams);
                if (layer) overlaySvg.appendChild(layer);
            }
        }

        if (previewState.previewLog) {
            log(previewState.previewLog);
        }
        // 🌟 自動生成 DXF 下載按鈕 (同步預覽)
        const dl = $("dlButtons");
        dl.innerHTML = ""; // Clear previous buttons

        if (viewState.dxfPreviewEnabled) {
            const dxfBtn = document.createElement("button");
            dxfBtn.textContent = `下載 DXF 零件檔 (預覽)`;
            dxfBtn.className = "btn-download";
            dxfBtn.style.backgroundColor = "#6a1b9a";
            dxfBtn.style.width = "100%"; // Make it prominent
            dxfBtn.style.marginBottom = "5px";
            dxfBtn.onclick = () => downloadText("mechanism_parts.dxf", previewState.dxfPreviewText);
            dl.appendChild(dxfBtn);
        } else if (previewState.dxfError) {
            console.warn("Auto-DXF generation failed:", previewState.dxfError);
        }

        return previewState.solution;

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
        const dynamicParams = collectDynamicParams();
        Object.keys(dynamicParams).forEach((key) => {
            mech[key] = dynamicParams[key];
        });

        const { files, dxfText, machiningInfo } = computeEngineExport({
            mods,
            mech,
            partSpec,
            mfg,
            dynamicParams
        });

        const dl = $("dlButtons");
        dl.innerHTML = "";

        for (const f of files) {
            const btn = document.createElement("button");
            btn.textContent = `下載 ${f.name}`;
            btn.className = "btn-download";
            btn.onclick = () => downloadText(f.name, f.text);
            dl.appendChild(btn);
        }

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
        const dynamicParams = collectDynamicParams();
        Object.keys(dynamicParams).forEach((key) => {
            mech[key] = dynamicParams[key];
        });

        const sweepParams = readSweepParams();
        const motorTypeEl = $("motorType");
        const motorTypeText = motorTypeEl ? motorTypeEl.selectedOptions[0].textContent : "motor";

        const sweepState = computeEngineSweep({
            mods,
            mech,
            partSpec,
            mfg,
            dynamicParams,
            sweepParams,
            motorTypeText
        });
        if (!sweepState) return;
        currentTrajectoryData = sweepState;

        displaySweepResults(
            sweepState.results,
            sweepState.validRanges,
            sweepState.invalidRanges,
            sweepParams.showTrajectory,
            motorTypeText
        );
        updatePreview();

        log(
            `分析完成 (${motorTypeText})\n` +
            `範圍: ${sweepParams.sweepStart}° 到 ${sweepParams.sweepEnd}°\n` +
            `有效區間: ${sweepState.validRanges.length}, 無效區間: ${sweepState.invalidRanges.length}`
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
    const thetaBlock = document.getElementById('thetaSliderBlock');
    if (thetaSlider && thetaSliderValue) {
        const mods = getActiveModules();
        const isMultilink = mods && mods.config && mods.config.id === 'multilink';
        if (isMultilink) {
            if (thetaBlock) thetaBlock.style.display = 'none';
        } else if (thetaInput) {
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

    const showPartsPreview = $("showPartsPreview");
    if (showPartsPreview) {
        showPartsPreview.addEventListener('change', () => {
            updatePreview();
        });
    }

    const showPartsOverlay = $("showPartsOverlay");
    if (showPartsOverlay) {
        showPartsOverlay.addEventListener('change', () => {
            updatePreview();
        });
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
            }, 200);
        });
    }

    // 🌟 核心修正：確保所有機構載入時都能顯示動態滑桿
    updateDynamicParams();
}

// 🌟 暴露給全域
window.updateDynamicParams = updateDynamicParams;
window.setupUIHandlers = setupUIHandlers;
window.startAnimation = startAnimation;
window.pauseAnimation = pauseAnimation;
window.stopAnimation = stopAnimation;

