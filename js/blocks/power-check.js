import {scopedLoads} from './load-schema.js';
// 製作包的「動力檢查」一節（Q4）：每顆馬達的規格、最大需求扭力、使用率與燈號、行程時間、峰值電流與假設。
// 第一次下載製作包且作品有馬達時才動態載入（見 app.js 的 saveBuildPack），不進啟動。全部是靜態估算。
import { requiredTorque, evaluateActuator, findMotors, DEFAULT_EFFICIENCY } from '../core/required-torque.js';
import { getActuatorSpec, defaultSpecIdForMotorType } from '../core/actuator-specs.js';
import { strokeEstimate } from '../core/actuator-speed.js';
import { LEVELS, fmtKg, pct, speedRows, noteLines, motorLabel } from './torque-model.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MARKER = '<h2>CNC 注意事項</h2>';

/**
 * @param snapshot Blocks 作品快照（含 loads／gravity）
 * @param specIds 每顆馬達選的規格 {motorId: specId}；沒有就用該馬達型號的預設規格
 * @returns {string} HTML；作品沒有可估算的馬達時回傳空字串
 */
export function powerCheckSection(snapshot, { specIds = {} } = {}) {
  const motors = findMotors(snapshot?.comps || []);
  if (!motors.length) return '';
  const rows = [], notes = new Set(), skipped = [];
  for (const m of motors) {
    if (m.motorType === 'linear') { skipped.push(`${motorLabel(m)}：線性致動器需要的是推力，未估算扭力。`); continue; }
    const chosen = specIds[m.id], spec = getActuatorSpec(chosen) || getActuatorSpec(defaultSpecIdForMotorType(m.motorType));
    const result = requiredTorque(snapshot, { motorId: m.id }), ev = evaluateActuator(result, spec), est = strokeEstimate(result, spec);
    const specCell = `${esc(spec.label)}（${fmtKg(spec.stallTorqueNmm)} kgf·cm）${getActuatorSpec(chosen) ? '' : '<br><small>預設規格</small>'}`;
    if (!ev.ok) { rows.push(`<tr><td>${esc(motorLabel(m))}</td><td>${specCell}</td><td colspan="4">${esc(result.reason || ev.reason || '無法估算')}</td></tr>`); continue; }
    const lv = LEVELS[ev.level], sr = speedRows(est, spec);
    rows.push(`<tr><td>${esc(motorLabel(m))}</td><td>${specCell}</td><td>${fmtKg(result.summary.maxAbsNmm)} kgf·cm @ ${Math.round(result.summary.worstTheta * 10) / 10}°</td>`
      + `<td style="color:${lv.color};font-weight:700">${pct(ev.utilization)} ${lv.label}（${esc(lv.hint)}）</td>`
      + `<td>${esc(sr.find(r => r.key === 'time')?.text || '')}</td><td>${esc(sr.find(r => r.key === 'current')?.text || '')}</td></tr>`);
    for (const n of noteLines(result)) notes.add(n);
    if (spec.note) notes.add(`${spec.label}：${spec.note}`);
    notes.add(spec.measured ? '規格為使用者實測值。' : '規格是廠商標示值，市售品常較弱，建議實測後再信任。');
  }
  if (!rows.length) return '';
  const loads = Array.isArray(snapshot.loads) ? snapshot.loads.length : 0;
  return `<h2 id="powerCheck">動力檢查</h2>
<p class="muted">靜態估算（不含摩擦、慣量與衝擊），重力方向：${snapshot.gravity === 'flat' ? '平放' : '直立'}；負載標記 ${loads} 個；齒輪每級效率預設 ${Math.round(DEFAULT_EFFICIENCY * 100)}%。燈號：綠＝夠用、黃＝勉強、紅＝不夠或太吃力。規格若沒在「⚖ 扭力」面板改選，這裡用該馬達型號的預設規格。</p>
<table id="powerCheckTable"><thead><tr><th>馬達</th><th>動力規格</th><th>最大需求扭力</th><th>使用率</th><th>行程時間</th><th>峰值電流</th></tr></thead><tbody>${rows.join('')}</tbody></table>
<p class="muted">假設與略過：</p>
<ul>${[...notes, ...skipped].map(n => `<li>${esc(n)}</li>`).join('')}</ul>
`;
}

/** 插在 CNC 注意事項之前；沒有馬達或估算失敗就原樣回傳。 */
export async function addPowerCheckToBuildPack(html, S) {
  try {
    const {toSnapshot}=await import('./schema.js');
    const specIds=S.specIds||{};
    const snap = toSnapshot(S.comps, {...S.topo,loads:scopedLoads(S.topo.loads,S.allComps||S.comps,S.comps)}, S.counter, { activeMotor: S.activeMotor, motorAngles: S.motorAngles||{}, fabrication: S.fabrication, modules: S.modules });
    const sec = powerCheckSection(snap, { specIds });
    if (!sec) return html;
    return html.includes(MARKER) ? html.replace(MARKER, sec + MARKER) : html.replace('</body>', sec + '</body>');
  } catch (e) {
    console.warn('動力檢查未加入製作包：', e);
    return html;
  }
}
