/**
 * Param Constraints
 * 動態參數約束計算
 */

export async function clampDynamicParam({ mech, varId, value }) {
    const { calculateValidRange } = await import('../multilink/constraints.js');
    const range = calculateValidRange(mech, varId);
    let val = Number.isFinite(value) ? value : 0;

    if (range) {
        if (val < range.min) val = range.min;
        if (val > range.max) val = range.max;
    }

    return { value: val, range };
}
