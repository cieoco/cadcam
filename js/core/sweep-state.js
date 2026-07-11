/**
 * Sweep Analysis Core
 * 掃描分析資料整理
 */

import { validateConfig } from '../config.js';

export function computeSweepState({ mods, mech, partSpec, mfg, dynamicParams, sweepParams, motorTypeText }) {
    if (!mods || !mods.config) return null;

    const mergedMech = { ...mech, ...(dynamicParams || {}) };
    validateConfig(mergedMech, partSpec, mfg);

    if (!sweepParams) {
        throw new Error("Missing sweep params.");
    }
    if (sweepParams.sweepStart >= sweepParams.sweepEnd) {
        throw new Error("掃描起始度需小於結束角度。");
    }
    if (sweepParams.sweepStep <= 0) {
        throw new Error("掃描間隔需大於 0。");
    }

    // 不再靜默改用 fourbar 的 sweepTheta：拿別的機構數學掃描會回傳看似合法的錯誤結果
    const sweepFn = mods.solver.sweepTheta;
    if (!sweepFn) {
        throw new Error(`${mods.config.name || mods.config.id}: solver 未提供 sweepTheta，無法執行掃描分析。`);
    }
    const { results, validRanges, invalidRanges } = sweepFn(
        mergedMech,
        sweepParams.sweepStart,
        sweepParams.sweepEnd,
        sweepParams.sweepStep
    );

    const validBPoints = results.filter((r) => r.isValid && r.B).map((r) => r.B);
    return {
        results,
        validRanges,
        invalidRanges,
        validBPoints,
        motorType: motorTypeText || "motor",
    };
}
