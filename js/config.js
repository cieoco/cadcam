/**
 * Configuration Management
 * 配置管理模組
 */

import { $ } from './utils.js';

/**
 * 從 UI 讀取所有輸入參數
 * @returns {{mech: Object, partSpec: Object, mfg: Object}}
 */
export function readInputs() {
    // 讀取所有可能的機構參數
    const mech = {
        // 四連桿
        a: Number($("a")?.value || 120),
        b: Number($("b")?.value || 60),
        c: Number($("c")?.value || 110),
        d: Number($("d")?.value || 80),
        assembly: $("assembly")?.value || "open",

        // 曲柄滑塊
        crankRadius: Number($("crankRadius")?.value || 30),
        rodLength: Number($("rodLength")?.value || 100),

        // 通用
        thetaDeg: Number($("theta")?.value || 30),
    };

    // 零件規格參數
    const partSpec = {
        barW: Number($("barW")?.value || 15),     // 桿件寬度
        margin: Number($("margin")?.value || 7),  // 端到孔邊距
        holeD: Number($("holeD")?.value || 3.2),  // 孔徑
        spacing: Number($("spacing")?.value || 8), // 零件間距
        barStyle: $("barStyle")?.value || "rounded", // 桿件樣式
        workX: Number($("workX")?.value || 300),  // 工作範圍 X
        workY: Number($("workY")?.value || 180),  // 工作範圍 Y

        // 曲柄滑塊規格
        crankWidth: Number($("crankWidth")?.value || 15),
        rodWidth: Number($("rodWidth")?.value || 15),
        sliderWidth: Number($("sliderWidth")?.value || 30),
        sliderHeight: Number($("sliderHeight")?.value || 20),
    };

    // 加工參數
    const spindleEl = $("spindle");
    const spindleRaw = spindleEl ? spindleEl.value.trim() : "";
    const mfg = {
        toolD: Number($("toolD")?.value || 3.0),       // 刀徑
        thickness: Number($("thickness")?.value || 3.0), // 材料厚度
        overcut: Number($("overcut")?.value || 0.5),   // 穿透餘量
        stepdown: Number($("stepdown")?.value || 0.5), // 每層下刀深度
        safeZ: Number($("safeZ")?.value || 5),         // 安全高度
        feedXY: Number($("feedXY")?.value || 400),     // XY 進給速度
        feedZ: Number($("feedZ")?.value || 100),       // Z 進給速度
        spindle: spindleRaw === "" ? NaN : Number(spindleRaw), // 主軸轉速
    };

    return { mech, partSpec, mfg };
}

/**
 * 驗證配置參數
 * @param {Object} mech - 機構參數
 * @param {Object} partSpec - 零件規格
 * @param {Object} mfg - 加工參數
 * @throws {Error} 參數無效時拋出錯誤
 */
export function validateConfig(mech, partSpec, mfg) {
    // 檢查加工參數 (必填)
    const mfgNums = [
        ["toolD", mfg.toolD],
        ["thickness", mfg.thickness],
        ["overcut", mfg.overcut],
        ["stepdown", mfg.stepdown],
        ["safeZ", mfg.safeZ],
        ["feedXY", mfg.feedXY],
        ["feedZ", mfg.feedZ],
    ];

    for (const [k, v] of mfgNums) {
        if (!Number.isFinite(v) || v <= 0) {
            throw new Error(`加工參數 ${k} 無效：${v}`);
        }
    }

    // 檢查零件基礎參數
    if (!Number.isFinite(partSpec.holeD) || partSpec.holeD <= 0) {
        throw new Error(`孔徑 holeD 無效`);
    }

    // 檢查孔徑必須大於刀徑
    if (partSpec.holeD <= mfg.toolD) {
        throw new Error(
            `孔徑 holeD(${partSpec.holeD}) 需大於刀徑 toolD(${mfg.toolD})`
        );
    }

    // 檢查 stepdown 不應大於總切深
    if (mfg.stepdown > mfg.thickness + mfg.overcut) {
        throw new Error(`stepdown 不應大於總切深（厚度+穿透餘量）`);
    }
}

/**
 * 讀取動畫掃描參數
 */
export function readSweepParams() {
    return {
        sweepStart: Number($("sweepStart")?.value || -180),
        sweepEnd: Number($("sweepEnd")?.value || 180),
        sweepStep: Number($("sweepStep")?.value || 1),
        showTrajectory: $("showTrajectory")?.checked || false,
        motorType: $("motorType")?.value || "motor360",
    };
}

/**
 * 讀取視圖參數
 */
export function readViewParams() {
    return {
        viewRange: Number($("viewRange")?.value) || 400,
        showGrid: $("showGrid")?.checked || false,
    };
}

/**
 * 讀取動畫速度參數
 */
export function readAnimSpeed() {
    return {
        speed: Number($("animSpeed")?.value || 30), // RPM
    };
}
