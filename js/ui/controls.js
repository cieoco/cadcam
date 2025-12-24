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

/**
 * 更新預覽
 */
export function updatePreview() {
    try {
        const { mech, partSpec, mfg } = readInputs();
        const viewParams = readViewParams();
        validateConfig(mech, partSpec, mfg);

        const sol = solveFourBar(mech);
        const svgWrap = $("svgWrap");
        svgWrap.innerHTML = "";

        if (!sol) {
            log("四連桿：此角度不可行（兩圓不相交/無解）。請改 θ 或改 a,b,c,d。");
            svgWrap.textContent = "（無解）";
            $("partsWrap").innerHTML = "";
            $("dlButtons").innerHTML = "";
            return;
        }

        // 渲染四連桿（含軌跡疊加）
        svgWrap.appendChild(
            renderFourbar(sol, mech.thetaDeg, currentTrajectoryData, viewParams)
        );

        // 渲染零件排版
        const parts = generateParts(partSpec);
        $("partsWrap").innerHTML = "";
        $("partsWrap").appendChild(
            renderPartsLayout(parts, partSpec.workX, partSpec.workY)
        );

        // 顯示摘要
        const cutDepth = mfg.thickness + mfg.overcut;
        const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));
        log(
            [
                `四連桿解算：OK（${mech.assembly}），θ=${mech.thetaDeg}°`,
                `桿件：ground=${mech.a} / input=${mech.b} / coupler=${mech.c} / output=${mech.d} (mm)`,
                `加工：總切深=${fmt(cutDepth)}mm，stepdown=${fmt(
                    mfg.stepdown
                )}mm → 層數≈${layers}`,
                `工作區：${partSpec.workX} x ${partSpec.workY} (mm)`,
            ].join("\n")
        );

        $("dlButtons").innerHTML = "";
    } catch (e) {
        log(`錯誤：${e.message}`);
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
        const { mech, partSpec, mfg } = readInputs();
        validateConfig(mech, partSpec, mfg);

        const sol = solveFourBar(mech);
        if (!sol) throw new Error("此 θ 無解：請先讓模擬可行，再輸出零件。");

        const parts = generateParts(partSpec);
        const files = buildAllGcodes(parts, mfg);

        // 建立下載按鈕
        const dl = $("dlButtons");
        dl.innerHTML = "";
        for (const f of files) {
            const btn = document.createElement("button");
            btn.textContent = `下載 ${f.name}`;
            btn.onclick = () => downloadText(f.name, f.text);
            dl.appendChild(btn);
        }

        const machiningInfo = generateMachiningInfo(mfg, parts.length);
        log($("log").textContent + "\n\n" + machiningInfo + "\n\n已生成 4 份 G-code（每根桿件各一份）。");
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
        const { mech, partSpec, mfg } = readInputs();
        validateConfig(mech, partSpec, mfg);

        const sweepParams = readSweepParams();
        const motorTypeText = $("motorType").selectedOptions[0].textContent;

        if (sweepParams.sweepStart >= sweepParams.sweepEnd) {
            throw new Error("起始角度必須小於結束角度");
        }
        if (sweepParams.sweepStep <= 0) {
            throw new Error("掃描間隔必須大於 0");
        }

        // 執行掃描
        const { results, validRanges, invalidRanges } = sweepTheta(
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
            `θ 掃描完成：${sweepParams.sweepStart}° → ${sweepParams.sweepEnd}°（每 ${sweepParams.sweepStep}°）\n` +
            `可行區間 ${validRanges.length} 個，不可行區間 ${invalidRanges.length} 個\n` +
            `軌跡已疊加在 2D 模擬圖上`
        );
    } catch (e) {
        log(`錯誤：${e.message}`);
    }
}

/**
 * 顯示掃描結果
 */
function displaySweepResults(results, validRanges, invalidRanges, showTrajectory, motorTypeText) {
    // 文字摘要（如果有對應的 UI 元素）
    const resultDiv = document.getElementById("sweepResult");
    if (resultDiv) {
        resultDiv.innerHTML = "";

        const summary = document.createElement("div");
        summary.innerHTML = `<strong>【${motorTypeText || '掃描分析'}】結果：</strong><br/>`;

        if (validRanges.length > 0) {
            summary.innerHTML += `<span style="color:#080;">✓ 可行角度區間（${validRanges.length} 個）：</span><br/>`;
            for (const r of validRanges) {
                summary.innerHTML += `<span style="color:#080; margin-left:16px;">• ${fmt(
                    r.start
                )}° → ${fmt(r.end)}° （範圍：${fmt(r.end - r.start)}°）</span><br/>`;
            }
        } else {
            summary.innerHTML += `<span style="color:#a00;">✗ 無可行角度區間</span><br/>`;
        }

        if (invalidRanges.length > 0) {
            summary.innerHTML += `<span style="color:#a00;">✗ 不可行角度區間（${invalidRanges.length} 個）：</span><br/>`;
            for (const r of invalidRanges) {
                summary.innerHTML += `<span style="color:#a00; margin-left:16px;">• ${fmt(
                    r.start
                )}° → ${fmt(r.end)}° （範圍：${fmt(r.end - r.start)}°）</span><br/>`;
            }
        }

        // 計算 B 點軌跡統計
        const stats = calculateTrajectoryStats(results);
        if (stats) {
            summary.innerHTML += `<br/><strong>B 點軌跡範圍：</strong><br/>`;
            summary.innerHTML += `X: ${fmt(stats.minBx)} → ${fmt(stats.maxBx)} mm （行程：${fmt(
                stats.rangeX
            )} mm）<br/>`;
            summary.innerHTML += `Y: ${fmt(stats.minBy)} → ${fmt(stats.maxBy)} mm （行程：${fmt(
                stats.rangeY
            )} mm）<br/>`;
            summary.innerHTML += `總行程：${fmt(stats.totalRange)} mm<br/>`;
        }

        resultDiv.appendChild(summary);
    }

    // 軌跡視覺化
    const trajectoryDiv = document.getElementById("trajectoryWrap");
    if (trajectoryDiv) {
        if (showTrajectory) {
            trajectoryDiv.innerHTML = "";
            const trajSvg = renderTrajectory(results, validRanges, invalidRanges);
            if (trajSvg) {
                trajectoryDiv.appendChild(trajSvg);
            }
        } else {
            trajectoryDiv.innerHTML = "";
        }
    }
}

/**
 * 設定所有 UI 事件處理器
 */
export function setupUIHandlers() {
    // 更新預覽按鈕
    $("btnUpdate").addEventListener("click", updatePreview);

    // 生成 G-code 按鈕
    $("btnGen").addEventListener("click", generateGcodes);

    // 動畫控制按鈕
    $("btnPlayAnim").addEventListener("click", () => startAnimation(updatePreview));
    $("btnPauseAnim").addEventListener("click", pauseAnimation);
    $("btnStopAnim").addEventListener("click", () => stopAnimation(updatePreview));

    // 馬達類型選擇器
    setupMotorTypeHandler();

    // 初始化
    updatePreview();
}
