/**
 * G-code Generator
 * G-code 生成器
 */

import {
    gcodeHeader,
    gcodeFooter,
    drillOps,
    profileRectOps,
} from './operations.js';

/**
 * 為單個零件生成 G-code
 * @param {Object} part - 零件物件
 * @param {Object} mfg - 加工參數
 * @returns {string} G-code 文字
 */
export function buildPartGcode(part, mfg) {
    const { safeZ, feedXY, feedZ, thickness, overcut, stepdown, spindle } = mfg;

    const cutDepth = -(thickness + overcut); // 負值
    const drillZ = cutDepth; // 鑽孔深度與切深相同

    const lines = [];
    lines.push(...gcodeHeader({ safeZ, spindle }));
    lines.push(`(Part: ${part.id}, link L=${part.L.toFixed(3)}mm)`);
    lines.push(...drillOps({ holes: part.holes, safeZ, drillZ, feedZ }));
    lines.push(
        ...profileRectOps({ rect: part.rect, safeZ, cutDepth, stepdown, feedXY, feedZ })
    );
    lines.push(...gcodeFooter({ safeZ, spindle }));
    return lines.join("\n") + "\n";
}

/**
 * 為所有零件生成 G-code 檔案
 * @param {Array} parts - 零件陣列
 * @param {Object} mfg - 加工參數
 * @returns {Array<{name: string, text: string}>} 檔案陣列
 */
export function buildAllGcodes(parts, mfg) {
    const files = [];
    for (const p of parts) {
        const g = buildPartGcode(p, mfg);
        files.push({ name: `${p.id}.gcode`, text: g });
    }
    return files;
}

/**
 * 生成加工摘要資訊
 * @param {Object} mfg - 加工參數
 * @param {number} partCount - 零件數量
 * @returns {string} 摘要文字
 */
export function generateMachiningInfo(mfg, partCount) {
    const cutDepth = mfg.thickness + mfg.overcut;
    const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));

    const info = [];
    info.push(`加工參數摘要：`);
    info.push(`- 零件數量：${partCount}`);
    info.push(`- 材料厚度：${mfg.thickness.toFixed(2)} mm`);
    info.push(`- 總切深：${cutDepth.toFixed(2)} mm`);
    info.push(`- 每層下刀：${mfg.stepdown.toFixed(2)} mm`);
    info.push(`- 切割層數：${layers}`);
    info.push(`- 刀徑：${mfg.toolD.toFixed(2)} mm`);
    info.push(`- XY 進給：${mfg.feedXY.toFixed(0)} mm/min`);
    info.push(`- Z 進給：${mfg.feedZ.toFixed(0)} mm/min`);
    if (Number.isFinite(mfg.spindle) && mfg.spindle > 0) {
        info.push(`- 主軸轉速：${mfg.spindle.toFixed(0)} RPM`);
    }

    return info.join('\n');
}
