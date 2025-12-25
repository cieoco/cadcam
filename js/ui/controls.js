/**
 * UI Controls
 * UI 控制模組 - 處理所有使用者介面互動
 */

import { $, log, downloadText, fmt } from '../utils.js';
import { readInputs, validateConfig, readSweepParams, readViewParams } from '../config.js';
import { solveFourBar, sweepTheta, calculateTrajectoryStats } from '../fourbar/solver.js';
import { startAnimation, pauseAnimation, stopAnimation, setupMotorTypeHandler } from '../fourbar/animation.js';
import { generateParts } from '../parts/generator.js';
import { renderPartsLayout, renderTrajectory } from '../parts/renderer.js';
import { buildAllGcodes, generateMachiningInfo } from '../gcode/generator.js';
import { renderFourbar } from './visualization.js';

// 全域軌跡資料
let currentTrajectoryData = null;

// 輔助函數：獲取當前運行的模組和配置
function getActiveModules() {
    return window.mechanismModules || null;
}

/**
 * 更新預覽
 */
export function updatePreview() {
    try {
        const mods = getActiveModules();
        if (!mods) return; // 還沒載入完

        const { mech, partSpec, mfg } = readInputs();
        const viewParams = readViewParams();
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
        for (const f of files) {
            const btn = document.createElement("button");
            btn.textContent = `下載 ${f.name}`;
            btn.className = "btn-download";
            btn.onclick = () => downloadText(f.name, f.text);
            dl.appendChild(btn);
        }

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

    // 注意：原本的 controls.js 有處理 trajectoryWrap，但模板中可能沒有單獨的 DIV
    // 這裡我們主要靠 updatePreview 疊加渲染
}

/**
 * 設定所有 UI 事件處理器
 */
export function setupUIHandlers() {
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

    // 某些機構可能有特定的 handler
    const mods = getActiveModules();
    if (mods && mods.solver.setupMotorTypeHandler) {
        mods.solver.setupMotorTypeHandler();
    } else {
        setupMotorTypeHandler();
    }

    // 初始渲染
    updatePreview();
}
