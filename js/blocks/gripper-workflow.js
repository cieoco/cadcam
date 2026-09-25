/** FTC 夾爪第一輪：用既有 solver 規劃對稱圓頭夾爪的開合範圍。純計算。 */
import { compileTopology } from '../core/topology.js';
import { solveTopology } from '../multilink/solver.js';
import { DEFAULT_PLATE_RADIUS_WORLD, jawCenterline } from './plate-geometry.js';

export function gripperTips(comps, points) {
  const ends = ['LeftJaw', 'RightJaw'].map(id => {
    const c = comps.find(item => item.id === id);
    return c && jawCenterline(['p1', 'p2', 'p3'].map(key => points?.[c[key]?.id]), c.jawTurnSign, c.jawTipLength)?.at(-1);
  });
  const [left, right] = ends;
  if (!left || !right || ![left.x, left.y, right.x, right.y].every(Number.isFinite)) return null;
  return { left, right, gap: right.x - left.x - 2 * DEFAULT_PLATE_RADIUS_WORLD,
    center: { x: (right.x + left.x) / 2, y: (right.y + left.y) / 2 } };
}

export function planGripper(comps, params) {
  const fail = message => ({ ok: false, message });
  const width = Number(params.gripperObjectWidth);
  const clearance = Number(params.gripperClearance);
  if (!Number.isFinite(width) || width < 10 || width > 150 || !Number.isFinite(clearance) || clearance < 2 || clearance > 40)
    return fail('物件寬度請填 10–150 mm；單側餘量請填 2–40 mm。');
  const byId = Object.fromEntries(comps.map(c => [c.id, c]));
  const plainJaw = c => !c?.vertices || (c.vertices.length === 3 && c.vertices.every((v, i) => v.solve && v.ref === ['p1', 'p2', 'p3'][i]));
  const a = byId.GearA, b = byId.GearB, left = byId.LeftJaw, right = byId.RightJaw;
  if (left?.jawTurnSign === -1 && right?.jawTurnSign === 1)
    return fail('這是舊版外彎夾爪，作品已保留；請從範例載入「雙齒輪夾爪：抓取物件」使用新版任務。');
  if (comps.length !== 4 || a?.type !== 'gear' || b?.type !== 'gear' || left?.type !== 'triangle' || right?.type !== 'triangle' ||
      a.mesh || b.mesh !== a.id || a.teeth !== b.teeth || a.module !== b.module || !a.p1?.physicalMotor || b.p1?.physicalMotor ||
      left.shape !== 'jaw' || right.shape !== 'jaw' || left.shapeMode !== 'polyline' || right.shapeMode !== 'polyline' ||
      left.jawTurnSign !== 1 || right.jawTurnSign !== -1 ||
      !plainJaw(left) || !plainJaw(right) || left.p1?.id !== a.p1?.id || right.p1?.id !== b.p1?.id ||
      left.p2?.id !== a.p2?.id || right.p2?.id !== b.p2?.id ||
      !['fixed', 'motor'].includes(a.p1?.type) || !['fixed', 'motor'].includes(b.p1?.type))
    return fail('這份開合規劃適用於原始對稱雙齒輪夾爪；結構已改造，請重新檢查機構。');
  const spacing = Math.hypot(b.p1.x - a.p1.x, b.p1.y - a.p1.y);
  const pitchA = a.teeth * a.module / 2, pitchB = b.teeth * b.module / 2;
  if (![spacing, pitchA, pitchB, Number(params[a.radiusParam]), Number(params[b.radiusParam])].every(v => Number.isFinite(v) && v > 0) ||
      Math.abs(Number(params[a.radiusParam]) - pitchA) > 0.1 || Math.abs(Number(params[b.radiusParam]) - pitchB) > 0.1 ||
      Math.abs(spacing - pitchA - pitchB) > 0.1)
    return fail('齒輪中心距不符合嚙合距離，請先調整。');
  let topo;
  const motor = String(a.p1.physicalMotor);
  const radius = DEFAULT_PLATE_RADIUS_WORLD;
  function sample(theta) {
    const sol = solveTopology(topo, { thetaDeg: theta, motorAngles: { [motor]: theta } });
    if (!sol || sol.isValid === false) return null;
    // p3 是夾爪折彎點；實際板形還會延伸一段。使用 2D／3D／匯出的共用中心線末端。
    const tips = gripperTips(comps, sol.points);
    if (!tips || Math.abs(tips.left.y - tips.right.y) > 0.15) return null;
    return { theta, gap: tips.gap, center: tips.center };
  }
  try {
    topo = compileTopology(comps, { params: { ...params } }, new Set());
    const start = sample(0);
    if (!start || Math.abs(a.p1.y - b.p1.y) > 0.1) return fail('目前夾爪不是水平對稱配置，無法規劃方形物件開口。');
    const targetOpen = width + 2 * clearance;
    if (targetOpen > start.gap) return fail(`需要 ${targetOpen.toFixed(1)} mm 開口，超過此夾爪約 ${start.gap.toFixed(1)} mm；請縮小物件／餘量，或改造爪臂。`);
    let previous = start;
    let bracket = null;
    for (let theta = 0.5; theta <= 90; theta += 0.5) {
      const current = sample(theta);
      if (!current || current.gap > previous.gap + 0.05) break;
      if (current.gap <= width) { bracket = theta; break; }
      previous = current;
    }
    if (bracket === null) return fail('目前幾何無法在連續閉合區間內到達物件寬度。');
    const atGap = target => {
      let lo = 0, hi = bracket;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (sample(mid).gap > target) lo = mid; else hi = mid;
      }
      return sample((lo + hi) / 2);
    };
    const open = atGap(targetOpen), closed = atGap(width);
    return { ok: true, width, clearance, radius, motor, open, closed,
      range: { lo: open.theta, hi: closed.theta },
      message: `預估淨開口 ${closed.gap.toFixed(1)}–${open.gap.toFixed(1)} mm` };
  } catch (_) { return fail('求解未完成，請檢查夾爪接點與尺寸。'); }
}

export function gripperBuildRecord(plan, snapshot) {
  const angle = x => x.toFixed(2);
  return [
    '# 夾爪原型製作記錄', '',
    '此記錄使用現有雙齒輪夾爪幾何；尚未完成 FTC 實際硬體選型及實物驗證。', '',
    '## 任務與幾何', '',
    `- 方形物件寬度：${plan.width} mm`,
    `- 單側放入餘量：${plan.clearance} mm`,
    `- 圓頭半徑假設：${plan.radius} mm（沿用 2D／加工板形）`,
    `- 預估淨開口：${plan.closed.gap.toFixed(2)}–${plan.open.gap.toFixed(2)} mm`,
    `- 模擬輸入角：張開 ${angle(plan.open.theta)}°；閉合 ${angle(plan.closed.theta)}°`,
    '- 角度為模型座標，不能直接當成真實伺服命令。', '',
    '## 零件與製作', '',
    '- 2 片夾爪板：LeftJaw、RightJaw。',
    ...snapshot.comps.filter(c => c.type === 'gear').map(c => `- ${c.id}：${c.teeth} 齒，模數 ${c.module}，1 片。`),
    '- 機架固定板：使用上方匯出功能取得目前板形與孔位。',
    '- 馬達、軸／軸承、隔套、螺絲、夾持墊、材料與板厚：待選型。',
    '- 加工前需確認軸與齒輪／夾爪的傳扭固定方式；目前共孔關係不代表已設計好固定件。', '',
    '## 驗收', '',
    '- [x] 求解器找到連續、對稱的目標開合區間。',
    '- [ ] 全部板件掃掠與物件碰撞檢查（目前僅圓頭橫向淨距）。',
    '- [ ] 孔位、板厚、疊放與實際硬體核對。',
    '- [ ] 馬達扭矩、速度、限位及夾持力確認。',
    '- [ ] 實際加工、組裝，量測開口並試夾。', '',
    '## 可重現的作品資料', '', '另存下方 JSON 為 blocks.json，可由專案開啟。', '',
    '```json', JSON.stringify(snapshot, null, 2), '```', ''
  ].join('\n');
}
