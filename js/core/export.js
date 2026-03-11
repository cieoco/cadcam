/**
 * Export Core
 * DXF 匯出整理
 */

import { validateConfig } from '../config.js';
import { buildDXF } from '../utils/dxf-generator.js';

export function buildExportBundle({ mods, mech, partSpec, mfg, dynamicParams }) {
    if (!mods || !mods.config) return { files: [], dxfText: '', machiningInfo: '' };

    const mergedMech = { ...mech, ...(dynamicParams || {}) };
    validateConfig(mergedMech, partSpec, mfg);

    const solveFn = mods.solver[mods.config.solveFn];
    const sol = solveFn ? solveFn(mergedMech) : null;
    if (!sol || sol.isValid === false) {
        throw new Error("Invalid parameters, adjust values.");
    }

    const partsFn = mods.parts[mods.config.partsFn];
    const parts = partsFn ? partsFn({ ...mergedMech, ...partSpec }) : [];

    const dxfText = buildDXF(parts);
    const machiningInfo = `Linkage export ready.\n- 零件數量：${parts.length}\n- 輸出格式：DXF`;

    return { files: [], dxfText, machiningInfo };
}
