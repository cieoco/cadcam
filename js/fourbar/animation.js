/**
 * Animation Controller
 * 動畫控制器
 */

import { $, fmt } from '../utils.js';
import { DRIVE_COMPONENTS } from '../motor-data.js';


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
    isContinuous: false,
    targetRpm: 0,
};

function syncThetaValue(value) {
    const thetaInput = $("theta");
    if (!thetaInput) return;
    thetaInput.value = value;
    thetaInput.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 開始動畫
 * @param {Function} updateCallback - 更新回調函數
 */
export function startAnimation(updateCallback, rpmOverride = null) {
    if (animationState.isPlaying && rpmOverride === null) return;

    const motorId = $("motorType").value;
    const speed = rpmOverride !== null ? rpmOverride : Number($("animSpeed").value); // RPM
    animationState.targetRpm = speed;

    const component = DRIVE_COMPONENTS[motorId];
    const isContinuous = component ? component.type === 'motor_continuous' : (motorId === 'motor360');
    animationState.isContinuous = isContinuous;

    // 根據馬達類型設定範圍
    if (isContinuous) {
        animationState.rangeStart = -180;
        animationState.rangeEnd = 180;
    } else {
        switch (motorId) {
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
            default:
                animationState.rangeStart = 0;
                animationState.rangeEnd = 180;
        }
    }

    const sweepData = window.currentTrajectoryData;
    const validRanges = sweepData && Array.isArray(sweepData.validRanges) ? sweepData.validRanges : [];
    if (validRanges.length) {
        const currentTheta = Number($("theta").value);
        const inRange = validRanges.find(r => currentTheta >= r.start && currentTheta <= r.end);
        const baseStart = animationState.rangeStart;
        const baseEnd = animationState.rangeEnd;
        const candidates = validRanges
            .map(r => ({
                start: Math.max(baseStart, r.start),
                end: Math.min(baseEnd, r.end)
            }))
            .filter(r => r.end > r.start);

        const chosen = inRange
            ? { start: Math.max(baseStart, inRange.start), end: Math.min(baseEnd, inRange.end) }
            : candidates[0];

        if (chosen && chosen.end > chosen.start) {
            animationState.rangeStart = chosen.start;
            animationState.rangeEnd = chosen.end;
        }
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

    animationState.direction = speed >= 0 ? 1 : -1;
    animationState.isPlaying = true;
    syncThetaValue(Math.round(animationState.currentTheta));

    // 計算動畫間隔
    // degrees_per_second = RPM * 360 / 60
    // degrees_per_frame = degrees_per_second / frameRate
    const absSpeed = Math.abs(speed);
    const degreesPerSecond = (absSpeed * 360) / 60;
    const frameRate = 30; // frames per second
    const degreesPerFrame = degreesPerSecond / frameRate;
    const interval = 1000 / frameRate; // ms per frame

    animationState.intervalId = setInterval(() => {
        // 1. 執行更新並獲取結果 (預期 updateCallback 回傳 solver 結果)
        const result = updateCallback ? updateCallback() : null;

        // 2. 傳入結果給 animateFrame 判斷是否撞牆
        animateFrame(degreesPerFrame, motorId, result);
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
    syncThetaValue(animationState.rangeStart);
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
 * @param {Object} lastResult - 上一幀的計算結果 (用於碰撞檢測)
 */
function animateFrame(degreesPerFrame, motorType, lastResult) {
    const { rangeStart, rangeEnd } = animationState;

    // 🌟 死點偵測 (Dead Point Detection) 🌟
    // 如果上一幀計算結果顯示「機構無解 (isValid: false)」，表示撞牆了
    if (lastResult && lastResult.isValid === false) {
        // 反轉方向 (Ping-Pong)
        animationState.direction *= -1;

        // 退回一步，避免卡死在牆裡
        animationState.currentTheta += degreesPerFrame * animationState.direction * 2;

        console.log("撞到機構極限，自動反轉！");
    } else {
        // 正常前進
        // 如果是連續旋轉，方向由 targetRpm 決定
        if (animationState.isContinuous) {
            animationState.direction = animationState.targetRpm >= 0 ? 1 : -1;
        }
        animationState.currentTheta += degreesPerFrame * animationState.direction;
    }

    // 處理邊界條件
    if (animationState.isContinuous) {
        // 連續旋轉 - 循環 (除非撞牆反彈模式被激活)
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

    // 更新 UI (注意：updateCallback 由 loop 呼叫，這裡只負責通知 UI input 值改變，觸發渲染)
    // 但在 loop 中我們是先 call updateCallback (畫上一幀結果) -> 再 call animateFrame (算下一幀位置)
    // 為了讓畫面動起來，必須觸發 UI 事件。
    // 所以這裡其實只是更新 input.value，真正觸發渲染的是 control.js 監聽 input 事件
    syncThetaValue(Math.round(animationState.currentTheta));
}

/**
 * 設定馬達類型變更處理
 */
export function setupMotorTypeHandler() {
    const motorType = $("motorType");
    if (!motorType) return;

    motorType.addEventListener("change", (e) => {
        const motorId = e.target.value;
        const component = DRIVE_COMPONENTS[motorId];
        const isContinuous = component ? component.type === 'motor_continuous' : (motorId === 'motor360');
        const sweepStart = $("sweepStart");
        const sweepEnd = $("sweepEnd");
        if (!sweepStart || !sweepEnd) return;

        if (isContinuous) {
            sweepStart.value = -180;
            sweepEnd.value = 180;
            sweepStart.disabled = true;
            sweepEnd.disabled = true;
        } else {
            switch (motorId) {
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
                default:
                    sweepStart.value = 0;
                    sweepEnd.value = 180;
                    sweepStart.disabled = true;
                    sweepEnd.disabled = true;
            }
        }
    });

    // 初始化
    motorType.dispatchEvent(new Event("change"));
}
