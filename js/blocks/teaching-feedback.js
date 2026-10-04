/** 教學用的下一步提示；只解讀現有證據，不把求解失敗推斷成特定零件故障。 */
import { pointKeysFor } from './part-types.js';
import { unsolvedMovingPoints } from './solve-health.js';

export function getTeachingFeedback({ comps = [], sol = null, compiled = null, hasDrive = false, gearWarning = false, dof } = {}) {
  const result = (message, pointIds = []) => ({ message, pointIds });
  if (!comps.length) return result('先選一個入門範例，按播放看動作，再試著改一根桿的長度。');
  if (gearWarning) return result('先選有警示的齒輪，檢查嚙合對象與兩輪位置；每次只改一項，再試播。');
  if (sol?.isValid === false || (hasDrive && compiled?.steps?.length && sol === null)) {
    return result('目前角度解不出動作。若剛改了長度或接點，先按「復原」比較；再小幅調整角度重試。');
  }
  const missing = unsolvedMovingPoints(comps, sol);
  if (missing.length) {
    const names = missing.slice(0, 4).join('、') + (missing.length > 4 ? '…' : '');
    return result(`接點 ${names} 尚未解出位置。先檢查這些孔是否接到相鄰零件，再一次修改一處；也可能是目前求解器不支援的接法。`, missing);
  }
  const mobility = typeof dof === 'number' ? dof : dof?.dof;
  if (mobility < 0) return result('自由度估算顯示限制可能過多。檢查是否多固定了一個接點；每次只解除一處，再試播。');
  if (mobility === 0) return result('目前估算為固定結構。若想讓它動，先檢查哪些接點設為固定，再試著解除一處。');
  if (!hasDrive) return result('先選預定的轉軸，放上動力來源，再按播放。若還不動，檢查孔與孔是否接好。');
  if (typeof dof === 'object' && dof && dof.inputs < mobility) return result('還有未控制的活動部分。先檢查連接，再決定是否需要另一組動力。');
  return result('先預測：改長一根桿，觀察點會走得更遠嗎？改一項、試播，再按「復原」比較。');
}

/**
 * point id → 繁中角色標籤。觀察點是使用者指定的量測位置，並非自動判定的機械輸出。
 * 共用孔可同時是固定點、動力輸入及觀察點，因此保留所有適用角色。
 */
export function teachingRoles(comps = [], tracePoint = '') {
  const roles = new Map();
  const add = (id, label) => {
    if (!id) return;
    if (!roles.has(id)) roles.set(id, new Set());
    roles.get(id).add(label);
  };
  for (const c of comps) {
    if (!c || c.type === 'workpiece') continue;
    for (const key of pointKeysFor(c)) {
      const p = c[key];
      if (!p?.id) continue;
      add(p.id, null);
      if (p.type === 'fixed') add(p.id, '固定');
      if (p.type === 'motor' || p.type === 'linear' || p.physicalMotor || p.physical_motor) add(p.id, '輸入');
    }
    if (c.motorMount?.center) add(c.motorMount.center, '輸入');
    if (c.type === 'slider' && (c.isInput || c.physicalMotor)) add(c.p3?.id, '輸入');
    if (['gear', 'pulley'].includes(c.type) && c.physicalMotor) add(c.p1?.id, '輸入');
    if (c.type === 'bar' && c.isInput && !c.motorMount?.center) {
      const center = [c.p1, c.p2].find(p => p && (p.type === 'motor' || p.type === 'linear' || p.physicalMotor || p.physical_motor))
        || [c.p1, c.p2].find(p => p?.type === 'fixed');
      if (center) add(center.id, '輸入');
    }
  }
  if (tracePoint && roles.has(tracePoint)) add(tracePoint, '輸出觀察點');
  return Object.fromEntries([...roles].map(([id, labels]) => [id, [...labels].filter(Boolean).join('／')]).filter(([, label]) => label));
}
