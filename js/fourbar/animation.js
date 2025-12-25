/**
 * Animation Controller
 * 動畫控制器
 */

import { $, fmt } from '../utils.js';

/**
 * 動畫狀態
 */
export const animationState = {
    isPlaying: false,
    intervalId: null,
    currentTheta: 0,
    direction: 1, // 1 for forward, -1 for backward
    rangeStart: -180,
    rangeEnd: 180,
};

/**
 * 開始動畫
 * @param {Function} updateCallback - 更新回調函數
 */
export function startAnimation(updateCallback) {
    if (animationState.isPlaying) return;

    const motorType = $("motorType").value;
    const speed = Number($("animSpeed").value); // RPM

    // 根據馬達類型設定範圍
    switch (motorType) {
        case "motor360":
            animationState.rangeStart = -180;
            animationState.rangeEnd = 180;
            break;
        case "servo180":
            animationState.rangeStart = 0;
            animationState.rangeEnd = 180;
            break;
        case "servo270":
            animationState.rangeStart = -135;
            animationState.rangeEnd = 135;
            break;
        case "custom":
            animationState.rangeStart = Number($("sweepStart").value);
            animationState.rangeEnd = Number($("sweepEnd").value);
            break;
    }

    // 初始化 theta 到起始位置
    const currentTheta = Number($("theta").value);
    if (
        currentTheta < animationState.rangeStart ||
        currentTheta > animationState.rangeEnd
    ) {
        animationState.currentTheta = animationState.rangeStart;
    } else {
        animationState.currentTheta = currentTheta;
    }

    animationState.direction = 1;
    animationState.isPlaying = true;

    // 計算動畫間隔
    // degrees_per_second = RPM * 360 / 60
    // degrees_per_frame = degrees_per_second / frameRate
    const degreesPerSecond = (speed * 360) / 60;
    const frameRate = 30; // frames per second
    const degreesPerFrame = degreesPerSecond / frameRate;
    const interval = 1000 / frameRate; // ms per frame

    animationState.intervalId = setInterval(() => {
        animateFrame(degreesPerFrame, motorType, updateCallback);
    }, interval);

    // 更新 UI
    $("btnPlayAnim").disabled = true;
    $("btnPauseAnim").disabled = false;
    $("btnStopAnim").disabled = false;

    console.log(`動畫播放中... (${speed} RPM)`);
}

/**
 * 暫停動畫
 */
export function pauseAnimation() {
    if (!animationState.isPlaying) return;

    clearInterval(animationState.intervalId);
    animationState.isPlaying = false;

    // 更新 UI
    $("btnPlayAnim").disabled = false;
    $("btnPauseAnim").disabled = true;
    $("btnStopAnim").disabled = false;

    console.log(`動畫已暫停於 θ=${fmt(animationState.currentTheta)}°`);
}

/**
 * 停止動畫
 * @param {Function} updateCallback - 更新回調函數
 */
export function stopAnimation(updateCallback) {
    if (animationState.intervalId) {
        clearInterval(animationState.intervalId);
    }

    animationState.isPlaying = false;
    animationState.currentTheta = animationState.rangeStart;

    // 重置到起始位置
    $("theta").value = animationState.rangeStart;
    if (updateCallback) updateCallback();

    // 更新 UI
    $("btnPlayAnim").disabled = false;
    $("btnPauseAnim").disabled = true;
    $("btnStopAnim").disabled = true;

    console.log(`動畫已停止`);
}

/**
 * 動畫幀更新
 * @param {number} degreesPerFrame - 每幀角度變化
 * @param {string} motorType - 馬達類型
 * @param {Function} updateCallback - 更新回調函數
 */
function animateFrame(degreesPerFrame, motorType, updateCallback) {
    const { rangeStart, rangeEnd } = animationState;

    // 更新 theta
    animationState.currentTheta += degreesPerFrame * animationState.direction;

    // 處理邊界條件
    if (motorType === "motor360") {
        // 連續旋轉 - 循環
        if (animationState.currentTheta > rangeEnd) {
            animationState.currentTheta =
                rangeStart + (animationState.currentTheta - rangeEnd);
        } else if (animationState.currentTheta < rangeStart) {
            animationState.currentTheta =
                rangeEnd - (rangeStart - animationState.currentTheta);
        }
    } else {
        // 舵機 - 來回擺動
        if (animationState.currentTheta >= rangeEnd) {
            animationState.currentTheta = rangeEnd;
            animationState.direction = -1;
        } else if (animationState.currentTheta <= rangeStart) {
            animationState.currentTheta = rangeStart;
            animationState.direction = 1;
        }
    }

    // 更新 UI
    $("theta").value = Math.round(animationState.currentTheta);
    if (updateCallback) updateCallback();
}

/**
 * 設定馬達類型變更處理
 */
export function setupMotorTypeHandler() {
    const motorType = $("motorType");
    if (!motorType) return;

    motorType.addEventListener("change", (e) => {
        const type = e.target.value;
        const sweepStart = $("sweepStart");
        const sweepEnd = $("sweepEnd");

        if (!sweepStart || !sweepEnd) return;

        switch (type) {
            case "motor360":
                sweepStart.value = -180;
                sweepEnd.value = 180;
                sweepStart.disabled = true;
                sweepEnd.disabled = true;
                break;
            case "servo180":
                sweepStart.value = 0;
                sweepEnd.value = 180;
                sweepStart.disabled = true;
                sweepEnd.disabled = true;
                break;
            case "servo270":
                sweepStart.value = -135;
                sweepEnd.value = 135;
                sweepStart.disabled = true;
                sweepEnd.disabled = true;
                break;
            case "custom":
                sweepStart.disabled = false;
                sweepEnd.disabled = false;
                break;
        }
    });

    // 初始化
    motorType.dispatchEvent(new Event("change"));
}
