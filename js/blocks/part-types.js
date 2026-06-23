/**
 * blocks / part-types
 *
 * 零件型別描述表（SDD §3.2）：把每種零件「按型別歸位」的設定集中到一處，
 * 取代散落各檔的 `c.type === '...'` 分流。資料仍是純 JSON——這裡只描述型別行為，
 * 不持有任何元件實例，也不碰 DOM。
 *
 * 設計判準（SDD §3.1）：多型分流 → 查表；純資料 → plain object。
 * 加一種新零件 = 在 PART_TYPES 加一筆（宣告它的點 key 等），不必全檔搜 `c.type`。
 *
 * 目前先涵蓋「點 key 清單」這一刀；之後可漸進把繪製 / 長度 / 角色等行為也掛進表項
 * （buildNode / updateNode / length …，見 SDD Phase 2）。
 *
 * 注意區分兩種 type：
 *   - 元件型別 c.type：bar / triangle / slider / anchor（本表的 key）。
 *   - 接點角色 point.type：fixed / floating / motor / linear / ground（不是本表範圍）。
 */

export const PART_TYPES = {
  anchor:   { pointKeys: ['p1'] },                         // 地錨：單一固定銷
  bar:      { pointKeys: ['p1', 'p2'] },                   // 連桿：兩端
  triangle: { pointKeys: ['p1', 'p2', 'p3'] },             // 三點桿：三頂點
  slider:   { pointKeys: ['p1', 'p2', 'p3', 'm1', 'm2'] }, // 滑軌：軌道兩端 + 滑塊 + 兩固定孔
};

// 所有型別點 key 的聯集。未知型別時當安全後備，行為與舊的扁平 POINT_KEYS 一致（不漏點）。
export const ALL_POINT_KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];

// 取某元件實際會用到的點 key 清單：已知型別走表；未知型別回傳聯集（零回歸後備）。
// 各呼叫端的迴圈本來就用 `if (c[k] && c[k].id ...)` 守門，回傳多算的 key 也只是被跳過。
export function pointKeysFor(c) {
  const t = c && PART_TYPES[c.type];
  return t ? t.pointKeys : ALL_POINT_KEYS;
}
