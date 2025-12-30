/**
 * Sweep Analysis Core
 * 掃描分析資料整理
 */

import { validateConfig } from '../config.js';
import { sweepTheta } from '../fourbar/solver.js';

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

    const sweepFn = mods.solver.sweepTheta || sweepTheta;
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
