/**
 * UI Controls
 * UI 控制模組 - 處理所有使用者介面互動
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

// 全域軌跡資料
let currentTrajectoryData = null;

// 輔助函數：獲取當前運行的模組和配置
function getActiveModules() {
    return window.mechanismModules || null;
}

/**
 * 處理動態參數生成
 */
export function updateDynamicParams() {
    const container = document.getElementById('dynamicParamsContainer');
    if (!container) {
        console.warn('[updateDynamicParams] Container not found!');
        return;
    }

    const vars = new Map(); // Map of varId -> { label, min, max, step, default }

    // 1. 從 Mechanism Config 獲取標記為 isDynamic 的參數
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

    // 2. 從 Topology JSON 掃描變數 (相容 Multilink)
    const topoEl = document.getElementById('topology');
    if (topoEl) {
        let topology;
        try {
            topology = JSON.parse(topoEl.value);

            const scan = (obj) => {
                if (!obj || typeof obj !== 'object') return;

                // 如果是陣列，遍歷每個元素
                if (Array.isArray(obj)) {
                    obj.forEach(item => scan(item));
                    return;
                }

                // 如果是物件，遍歷每個鍵
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

    // 記住當前焦點元素
    const activeElement = document.activeElement;
    const activeId = activeElement ? activeElement.id : null;
    const activeValue = activeElement ? activeElement.value : null;
    const selectionStart = activeElement && activeElement.selectionStart;
    const selectionEnd = activeElement && activeElement.selectionEnd;

    // ⚠️ 如果焦點在動態參數輸入框，跳過更新避免干擾輸入
    if (activeId && activeId.startsWith('dyn_')) {
        return;
    }

    // 3. 移除已經沒用到的動態參數
    const existingDynamic = container.querySelectorAll('.dynamic-param-wrapper');
    existingDynamic.forEach(div => {
        const id = div.dataset.varId;
        if (!vars.has(id)) {
            div.remove();
        }
    });

    // 4. 更新或新增參數
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

            // 綁定聯動 - 使用命名函數避免重複綁定
            const numInput = wrapper.querySelector('input[type="number"]');
            const rangeInput = wrapper.querySelector('input[type="range"]');

            // 標記已綁定事件
            if (!numInput.dataset.eventsBound) {
                numInput.dataset.eventsBound = 'true';
                
                // 使用防抖來避免頻繁更新
                let updateTimer;
                const debouncedUpdate = () => {
                    clearTimeout(updateTimer);
                    updateTimer = setTimeout(() => {
                        console.log('[debouncedUpdate] Updating preview for:', varId);
                        // 不調用 updateDynamicParams，只更新預覽
                        updatePreview();
                    }, 300);
                };

                numInput.addEventListener('input', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation(); // 完全阻止事件傳播
                    console.log(`[numInput input] ${varId} = ${numInput.value}`);
                    rangeInput.value = numInput.value;
                    debouncedUpdate();
                }, true); // 使用捕獲階段
                
                rangeInput.addEventListener('input', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    console.log(`[rangeInput input] ${varId} = ${rangeInput.value}`);
                    numInput.value = rangeInput.value;
                    debouncedUpdate();
                }, true);
            }
        } else {
            console.log('[updateDynamicParams] Updating existing param:', varId);
            // 更新現有元素的屬性（但不重新創建，避免失去焦點）
            const numInput = wrapper.querySelector('input[type="number"]');
            const rangeInput = wrapper.querySelector('input[type="range"]');
            
            if (numInput && rangeInput) {
                // 只在值不同時更新（避免光標跳動）
                if (numInput.step !== String(info.step)) numInput.step = info.step;
                if (rangeInput.min !== String(info.min)) rangeInput.min = info.min;
                if (rangeInput.max !== String(info.max)) rangeInput.max = info.max;
                if (rangeInput.step !== String(info.step)) rangeInput.step = info.step;
            }
        }
    });

    // 恢復焦點
    if (activeId && activeId.startsWith('dyn_')) {
        const elementToFocus = document.getElementById(activeId);
        if (elementToFocus) {
            console.log('[updateDynamicParams] Restoring focus to:', activeId);
            elementToFocus.focus();
            if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
                elementToFocus.setSelectionRange(selectionStart, selectionEnd);
            }
        }
    }
}

/**
 * 更新預覽
 */
export function updatePreview() {
    try {
        const mods = getActiveModules();
        if (!mods) return; // 還沒載入完

        const { mech, partSpec, mfg } = readInputs(); // 這會讀取 document.getElementById 的值，包含動態生成的
        // readInputs 可能只讀取 config 定義的參數。我們需要把動態參數補進 mech。

        // 補充讀取 dynamicParams
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input.dynamic-input');
            inputs.forEach(inp => {
                const varId = inp.id.replace('dyn_', '');
                mech[varId] = parseFloat(inp.value) || 0;
            });
        }

        const viewParams = readViewParams();
        viewParams.motorType = mech.motorType;
        viewParams.topology = mech.topology; // 傳遞拓撲字串供視覺化使用

        validateConfig(mech, partSpec, mfg);

        // 使用動態模組的求解器
        const solveFn = mods.solver[mods.config.solveFn];
        const sol = solveFn(mech);

        const svgWrap = $("svgWrap");
        svgWrap.innerHTML = "";

        if (!sol) {
            log(`${mods.config.name}：此角度不可行。請調整參數。`);
            svgWrap.textContent = "（無解）";
            $("partsWrap").innerHTML = "";
            $("dlButtons").innerHTML = "";
            return;
        }

        // 使用動態模組的渲染器
        const renderFn = mods.visualization[mods.config.renderFn];
        svgWrap.appendChild(
            renderFn(sol, mech.thetaDeg || mech.theta, currentTrajectoryData, viewParams)
        );

        // 使用動態模組的零件生成器
        const partsFn = mods.parts[mods.config.partsFn];
        const parts = partsFn({ ...mech, ...partSpec });

        $("partsWrap").innerHTML = "";
        $("partsWrap").appendChild(
            renderPartsLayout(parts, partSpec.workX, partSpec.workY)
        );

        // 顯示摘要
        const cutDepth = mfg.thickness + mfg.overcut;
        const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));
        log(
            [
                `${mods.config.name}解算：OK`,
                `加工：總切深=${fmt(cutDepth)}mm，stepdown=${fmt(mfg.stepdown)}mm → 層數≈${layers}`,
                `工作區：${partSpec.workX} x ${partSpec.workY} (mm)`,
            ].join("\n")
        );

        $("dlButtons").innerHTML = "";
    } catch (e) {
        log(`錯誤：${e.message}`);
        console.error(e);
        $("svgWrap").innerHTML = "";
        $("partsWrap").innerHTML = "";
        $("dlButtons").innerHTML = "";
    }
}

/**
 * 生成 G-code
 */
export function generateGcodes() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();
        // 補充 dynamic params logic duplicated (should factor out but simplicity for now)
        const dynContainer = document.getElementById('dynamicParamsContainer');
        if (dynContainer) {
            const inputs = dynContainer.querySelectorAll('input[type="number"]');
            inputs.forEach(inp => {
                mech[inp.id] = parseFloat(inp.value) || 0;
            });
        }

        validateConfig(mech, partSpec, mfg);

        // 確保目前參數是有解的
        const solveFn = mods.solver[mods.config.solveFn];
        const sol = solveFn(mech);
        if (!sol) throw new Error("目前的參數無解，請先調整模擬至可行狀態。");

        // 生成零件
        const partsFn = mods.parts[mods.config.partsFn];
        const parts = partsFn({ ...mech, ...partSpec });

        // 生成 G-code
        const files = buildAllGcodes(parts, mfg);

        // 建立下載按鈕
        const dl = $("dlButtons");
        dl.innerHTML = "";

        // 1. 各零件 G-code 下載
        for (const f of files) {
            const btn = document.createElement("button");
            btn.textContent = `下載 ${f.name}`;
            btn.className = "btn-download";
            btn.onclick = () => downloadText(f.name, f.text);
            dl.appendChild(btn);
        }

        // 2. 所有零件 DXF 下載 (CAD 匯出)
        const dxfText = buildDXF(parts);
        const dxfBtn = document.createElement("button");
        dxfBtn.textContent = `匯出 DXF (所有零件)`;
        dxfBtn.className = "btn-download";
        dxfBtn.style.backgroundColor = "#6a1b9a"; // 特殊顏色標註 DXF
        dxfBtn.onclick = () => downloadText("linkage_parts.dxf", dxfText);
        dl.appendChild(dxfBtn);

        // 3. 一鍵打包 ZIP
        const zipBtn = document.createElement("button");
        zipBtn.textContent = `📦 打包下載所有元件 (ZIP)`;
        zipBtn.className = "btn-download";
        zipBtn.style.backgroundColor = "#2e7d32"; // 綠色標註
        zipBtn.onclick = () => {
            const allFiles = [...files, { name: "linkage_parts.dxf", text: dxfText }];
            downloadZip("mechanism_cnc_files.zip", allFiles);
        };
        dl.appendChild(zipBtn);

        const machiningInfo = generateMachiningInfo(mfg, parts.length);
        log($("log").textContent + "\n\n" + machiningInfo + "\n\n已完成 G-code 生成。");
    } catch (e) {
        log(`錯誤：${e.message}`);
        $("dlButtons").innerHTML = "";
    }
}

/**
 * 掃描 Theta 分析
 */
export function performSweepAnalysis() {
    try {
        const mods = getActiveModules();
        if (!mods) return;

        const { mech, partSpec, mfg } = readInputs();
        // Dynamic params injection
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
        const motorTypeText = motorTypeEl ? motorTypeEl.selectedOptions[0].textContent : "手動掃描";

        if (sweepParams.sweepStart >= sweepParams.sweepEnd) {
            throw new Error("起始角度必須小於結束角度");
        }
        if (sweepParams.sweepStep <= 0) {
            throw new Error("掃描間隔必須大於 0");
        }

        // 執行掃描 (目前 solver 模組必須具備 sweepTheta)
        const sweepFn = mods.solver.sweepTheta || sweepTheta;
        const { results, validRanges, invalidRanges } = sweepFn(
            mech,
            sweepParams.sweepStart,
            sweepParams.sweepEnd,
            sweepParams.sweepStep
        );

        // 儲存軌跡資料
        const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
        currentTrajectoryData = {
            results,
            validRanges,
            invalidRanges,
            validBPoints,
            motorType: motorTypeText,
        };

        // 顯示結果
        displaySweepResults(results, validRanges, invalidRanges, sweepParams.showTrajectory, motorTypeText);

        // 更新主 2D 模擬圖以顯示軌跡疊加
        updatePreview();

        log(
            `【${motorTypeText}】\n` +
            `θ 掃描完成：${sweepParams.sweepStart}° → ${sweepParams.sweepEnd}°\n` +
            `可行區間 ${validRanges.length} 個，不可行區間 ${invalidRanges.length} 個`
        );
    } catch (e) {
        log(`錯誤：${e.message}`);
    }
}

/**
 * 顯示掃描結果
 */
function displaySweepResults(results, validRanges, invalidRanges, showTrajectory, motorTypeText) {
    const resultDiv = document.getElementById("log"); // 統一顯示在 log
    if (!resultDiv) return;

    let html = `<strong>【${motorTypeText}】掃描結果：</strong><br/>`;

    if (validRanges.length > 0) {
        html += `<span style="color:#27ae60;">✓ 可行區間：</span><br/>`;
        for (const r of validRanges) {
            html += `<span style="color:#27ae60; margin-left:12px;">• ${fmt(r.start)}° → ${fmt(r.end)}°</span><br/>`;
        }
    } else {
        html += `<span style="color:#e74c3c;">✗ 無可行角度</span><br/>`;
    }

    // 軌跡統計 (目前 solver 模組必須具備 calculateTrajectoryStats)
    const statsFn = getActiveModules().solver.calculateTrajectoryStats || calculateTrajectoryStats;
    const stats = statsFn(results);
    if (stats) {
        html += `<br/><strong>軌跡行程：</strong> X: ${fmt(stats.rangeX)} mm, Y: ${fmt(stats.rangeY)} mm<br/>`;
    }
}

/**
 * 設定所有 UI 事件處理器
 */
export function setupUIHandlers() {
    console.log('Setting up UI handlers...');

    // 按鈕綁定
    const btnUpdate = $("btnUpdate");
    if (btnUpdate) btnUpdate.onclick = updatePreview;

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
        // 使用防抖避免頻繁重新掃描
        let topologyUpdateTimer;
        
        topologyArea.addEventListener('input', (e) => {
            clearTimeout(topologyUpdateTimer);
            // 增加到 1000ms，讓用戶有足夠時間輸入
            topologyUpdateTimer = setTimeout(() => {
                updateDynamicParams();
            }, 1000);
        });
        
        // 失去焦點時立即更新
        topologyArea.addEventListener('blur', () => {
            clearTimeout(topologyUpdateTimer);
            updateDynamicParams();
        });
    }

    // Initial scan for all mechanisms
    updateDynamicParams();

    // 某些機構可能有特定的 handler
    const mods = getActiveModules();
    if (mods && mods.solver.setupMotorTypeHandler) {
        mods.solver.setupMotorTypeHandler();
    } else {
        setupMotorTypeHandler();
    }

    // 初始渲染 - 立即執行
    console.log('Calling initial updatePreview...');
    try {
        updatePreview();
    } catch (e) {
        console.error('Initial preview failed:', e);
        // 如果失敗，再試一次
        setTimeout(() => {
            console.log('Retrying updatePreview...');
            updatePreview();
        }, 200);
    }

    // 為新版動畫按鈕添加懸停縮放效果
    ['btnPlayAnim', 'btnPauseAnim', 'btnStopAnim'].forEach(id => {
        const btn = $(id);
        if (btn) {
            btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.transform = 'scale(1.05)'; });
            btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
        }
    });
}
