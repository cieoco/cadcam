/**
 * Preview Core
 * 預覽核心邏輯 - 解耦 UI 與求解/零件生成
 */

import { validateConfig } from '../config.js';

export function computeSolution(mods, mech, partSpec, mfg) {
    if (!mods || !mods.config || !mods.solver) return null;
    validateConfig(mech, partSpec, mfg);
    const solveFn = mods.solver[mods.config.solveFn];
    return solveFn ? solveFn(mech) : null;
}

export function computeParts(mods, mech, partSpec, sol) {
    if (!mods || !mods.config || !mods.parts) return [];
    const partsFn = mods.parts[mods.config.partsFn];
    return partsFn ? partsFn({ ...mech, ...partSpec, ...(sol ? sol.dynamicParams : {}) }) : [];
}
