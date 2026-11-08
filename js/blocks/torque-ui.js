// 扭力面板（懶載入）：馬達與規格、重力、負載標記、扭力–角度曲線、建議與「最吃力姿態」。
// 計算模組（required-torque／actuator-specs／load-schema）也在第一次重算時才動態載入。
// 資料：負載與重力存在 S.topo.loads／S.topo.gravity（schema.js 負責保存），規格選擇只在面板開著時記住。
import { S, activateMotor, frozenMotorAngles } from './state.js';
import { toSnapshot } from './schema.js';
import {
  LEVELS, fmtKg, pct, summaryText, noteLines, curveGeometry, pathOf, suggestions, nextLoadId, attachPoints, attachBars,
  describeAttach, loadFromForm, upsertLoad, removeLoad, motorLabel
} from './torque-model.js';

let core = null;
const loadCore = () => core ||= Promise.all([import('../core/required-torque.js'), import('../core/actuator-specs.js')])
  .then(([rt, sp]) => ({ ...rt, ...sp }));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
#torquePanel{position:fixed;right:12px;bottom:12px;z-index:40;width:min(392px,calc(100vw - 24px));max-height:min(86vh,720px);overflow:auto;box-sizing:border-box;
 background:#fff;border:1px solid #c9d6e6;border-radius:12px;box-shadow:0 8px 28px rgba(20,40,70,.28);padding:10px 12px 12px;font-size:13px;color:#2c3e50}
#torquePanel header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
#torquePanel header b{font-size:15px}#torquePanel header small{color:#60717d;flex:1}
#torquePanel button{font:inherit;min-height:36px;padding:4px 10px;border:1px solid #9fb3cc;border-radius:8px;background:#f4f8fd;color:#1f3a5a;cursor:pointer}
#torquePanel button.tq-primary{background:#2c5282;border-color:#2c5282;color:#fff;font-weight:700}
#torquePanel button.tq-close{min-width:40px;font-size:20px;line-height:1;padding:0 8px}
#torquePanel button.tq-link{min-height:28px;padding:0 6px;border:0;background:transparent;color:#2c5282;text-decoration:underline}
#torquePanel .tq-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:6px 0}
#torquePanel label{display:flex;flex-direction:column;gap:2px;font-size:12px;color:#60717d;min-width:0}
#torquePanel label.tq-inline{flex-direction:row;align-items:center;gap:4px;font-size:13px;color:#2c3e50}
#torquePanel select,#torquePanel input[type=text],#torquePanel input[type=number]{font:inherit;min-height:34px;max-width:100%;border:1px solid #b8c6d8;border-radius:6px;padding:2px 6px;background:#fff;color:#2c3e50}
#torquePanel .tq-sum{padding:7px 10px;border-left:6px solid var(--lv,#999);background:#f6f8fb;border-radius:6px;font-weight:700;line-height:1.5}
#torquePanel .tq-note{color:#60717d;font-size:12px;line-height:1.5}
#torquePanel svg{width:100%;height:auto;display:block;margin:6px 0;background:#fcfdff;border:1px solid #e1e8f0;border-radius:6px}
#torquePanel h4{margin:10px 0 4px;font-size:13px}#torquePanel ul{margin:2px 0;padding-left:18px;line-height:1.55}
#torquePanel .tq-loads li{display:flex;gap:6px;align-items:center;list-style:none;margin-left:-18px;flex-wrap:wrap}
#torquePanel .tq-form{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;padding:8px;border:1px dashed #9fb3cc;border-radius:8px;margin-top:6px}
#torquePanel .tq-form .wide{grid-column:1/-1}#torquePanel .tq-err{color:#c0392b;font-weight:700;grid-column:1/-1}
@media (max-width:700px){#torquePanel{left:8px;right:8px;width:auto;bottom:calc(66px + env(safe-area-inset-bottom,0px));max-height:56vh}}`;

let panel = null, timer = null, lastKey = '', busy = false, again = false;
const ui = { poseNote: '', motorId: null, specs: {}, editing: null, formError: '' };

const snapshot = () => toSnapshot(S.comps, S.topo, S.counter, { activeMotor: S.activeMotor, motorAngles: frozenMotorAngles(), fabrication: S.fabrication, modules: S.modules });
const modelKey = () => JSON.stringify([S.comps, S.topo.loads, S.topo.gravity, { ...S.topo.params, theta: 0 }, S.activeMotor, S.modules, ui.editing, ui.formError]);

export function closeTorque() {
  clearInterval(timer); timer = null; panel?.remove(); panel = null; lastKey = '';
}

export function openTorque(host) {
  if (panel) { closeTorque(); return; }
  if (!document.getElementById('torqueStyle')) { const st = document.createElement('style'); st.id = 'torqueStyle'; st.textContent = CSS; document.head.append(st); }
  panel = document.createElement('aside');
  panel.id = 'torquePanel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', '扭力估算');
  panel.addEventListener('click', e => onClick(e, host));
  panel.addEventListener('change', e => onChange(e, host));
  document.body.append(panel);
  panel.innerHTML = '<p class="tq-note">計算中…</p>';
  refresh(host);
  timer = setInterval(() => { if (panel && modelKey() !== lastKey) refresh(host); }, 800);
}

async function refresh(host) {
  if (busy) { again = true; return; }
  busy = true;
  try { await render(host); } catch (e) { console.error(e); if (panel) panel.innerHTML = `<header><b>扭力估算</b><small></small><button class="tq-close" data-act="close" aria-label="關閉">×</button></header><p class="tq-note">估算失敗：${esc(e.message || e)}</p>`; }
  busy = false;
  if (again) { again = false; refresh(host); }
}

async function render(host) {
  if (!panel) return;
  const c = await loadCore();
  lastKey = modelKey();
  const snap = snapshot(), motors = c.findMotors(snap.comps);
  const head = `<header><b>⚖ 扭力估算</b><small>靜態估算，不含摩擦與慣量</small><button class="tq-close" data-act="close" aria-label="關閉">×</button></header>`;
  if (!motors.length) { panel.innerHTML = head + '<p class="tq-note">作品中還沒有馬達或舵機。先從「新增 → 專用機件」加入動力，這裡才會估算。</p>'; return; }
  const motor = motors.find(m => m.id === ui.motorId) || motors[0]; ui.motorId = motor.id;
  const specId = ui.specs[motor.id] || c.defaultSpecIdForMotorType(motor.motorType), spec = c.getActuatorSpec(specId) || c.getActuatorSpec(c.defaultSpecIdForMotorType('tt'));
  const gravity = S.topo.gravity === 'flat' ? 'flat' : 'vertical';
  const specs = c.listActuatorSpecs();
  let body = `<div class="tq-row"><label>馬達<select data-f="motor">${motors.map(m => `<option value="${esc(m.id)}"${m.id === motor.id ? ' selected' : ''}>${esc(motorLabel(m))}</option>`).join('')}</select></label>
   <label>動力規格<select data-f="spec">${specs.map(s => `<option value="${s.id}"${s.id === spec.id ? ' selected' : ''}>${esc(s.label)}（${fmtKg(s.stallTorqueNmm)} kgf·cm）</option>`).join('')}</select></label></div>
   <div class="tq-row" role="radiogroup" aria-label="重力方向">重力：
    <label class="tq-inline"><input type="radio" name="tqG" value="vertical"${gravity === 'vertical' ? ' checked' : ''}>直立（重力朝畫面下）</label>
    <label class="tq-inline"><input type="radio" name="tqG" value="flat"${gravity === 'flat' ? ' checked' : ''}>平放（重力不計）</label></div>`;
  if (motor.motorType === 'linear') {
    panel.innerHTML = head + body + '<p class="tq-note">線性致動器需要的是推力（N），這裡的扭力估算只適用旋轉的馬達與舵機。</p>' + loadsHtml(c, snap);
    return;
  }
  const result = c.requiredTorque(snap, { motorId: motor.id, activeAngle: S.theta });
  const ev = c.evaluateActuator(result, spec);
  let flatPeak = null;
  if (ev.ok && ev.level !== 'green' && gravity === 'vertical') {
    const flat = c.requiredTorque(snap, { motorId: motor.id, gravity: 'flat', activeAngle: S.theta });
    if (flat.ok) flatPeak = flat.summary.maxAbsNmm;
  }
  ui.last = { result, ev, motor, spec };
  const lv = ev.ok ? LEVELS[ev.level] : null;
  body += `<div class="tq-sum" style="--lv:${lv ? lv.color : '#999'}" role="status">${esc(summaryText(result, ev))}${lv ? `<br><span class="tq-note">${lv.label}：${lv.hint}</span>` : ''}</div>`;
  const geo = curveGeometry(result, spec, ev);
  if (geo) body += curveSvg(geo, motor);
  if (result.ok) body += `<div class="tq-row"><button class="tq-primary" data-act="worst">顯示最吃力姿態</button><span class="tq-note" data-pose-note>${esc(ui.poseNote || (motor.id === String(S.activeMotor) ? '' : '會改成控制這顆馬達'))}</span></div>`;
  const tips = suggestions(result, ev, spec, { specs, flatPeakNmm: flatPeak });
  if (ev.ok) body += `<h4>${ev.level === 'green' ? '判定' : '建議（估算）'}</h4><ul>${ev.level === 'green' ? '<li>目前在綠燈範圍，不需要調整。</li>' : tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  body += `<p class="tq-note">${esc(spec.measured ? '規格為使用者實測值。' : '規格是廠商標示值，市售品常較弱，建議實測後再信任。')}${spec.note ? esc(' ' + spec.note) : ''}</p>`;
  body += loadsHtml(c, snap);
  const notes = noteLines(result);
  body += `<details open><summary><b>假設與略過（${notes.length}）</b></summary><ul>${notes.map(n => `<li>${esc(n)}</li>`).join('') || '<li>無</li>'}</ul></details>`;
  panel.innerHTML = head + body;
}

function curveSvg(g, motor) {
  const t = (x, y, s, extra = '') => `<text x="${x}" y="${y}" font-size="10" fill="#60717d" ${extra}>${s}</text>`;
  let s = `<svg viewBox="0 0 ${g.w} ${g.h}" role="img" aria-label="需求扭力對輸入角度曲線">`;
  for (const b of g.bands) s += `<rect x="${g.plot.l}" y="${b.y1.toFixed(1)}" width="${g.plot.r - g.plot.l}" height="${Math.max(0, b.y2 - b.y1).toFixed(1)}" fill="${b.color}" opacity=".10"/>`;
  for (const k of g.yTicks) s += `<line x1="${g.plot.l}" x2="${g.plot.r}" y1="${k.y.toFixed(1)}" y2="${k.y.toFixed(1)}" stroke="#e1e8f0"/>` + t(g.plot.l - 4, (k.y + 3).toFixed(1), k.label, 'text-anchor="end"');
  for (const k of g.xTicks) s += t(k.x.toFixed(1), g.h - 12, k.label + '°', 'text-anchor="middle"');
  for (const l of g.lines) s += `<line x1="${g.plot.l}" x2="${g.plot.r}" y1="${l.y.toFixed(1)}" y2="${l.y.toFixed(1)}" stroke="${l.color}" stroke-width="1.5"${l.dashed ? ' stroke-dasharray="4 3"' : ''}/>` + `<text x="${g.plot.r - 2}" y="${(l.y - 2).toFixed(1)}" font-size="9" text-anchor="end" fill="${l.color}">${esc(l.label)}</text>`;
  for (const seg of g.segments) s += seg.length > 1 ? `<path d="${pathOf(seg)}" fill="none" stroke="#2c5282" stroke-width="2"/>` : `<circle cx="${seg[0].x.toFixed(1)}" cy="${seg[0].y.toFixed(1)}" r="2" fill="#2c5282"/>`;
  for (const m of g.marks) s += m.kind === 'dead'
    ? `<path d="M${m.x.toFixed(1)},${(m.y - 5).toFixed(1)}l5,5l-5,5l-5,-5z" fill="#fff" stroke="#8e44ad" stroke-width="1.5"><title>${m.theta}° 接近死點</title></path>`
    : `<path d="M${(m.x - 4).toFixed(1)},${(m.y - 4).toFixed(1)}l8,8m0,-8l-8,8" stroke="#c0392b" stroke-width="2"><title>${m.theta}° 奇異點／無解</title></path>`;
  if (g.worst) s += `<circle cx="${g.worst.x.toFixed(1)}" cy="${g.worst.y.toFixed(1)}" r="4.5" fill="#fff" stroke="#c0392b" stroke-width="2"><title>最吃力 ${g.worst.theta}°</title></circle>`;
  s += t(g.plot.l, 9, 'kgf·cm（取絕對值）') + t(g.plot.r, g.h - 1, '輸入角（°）', 'text-anchor="end"');
  return s + '</svg><p class="tq-note">◇ 接近死點　✕ 奇異點或無解　○ 最吃力角度</p>';
}

function loadsHtml(c, snap) {
  const loads = Array.isArray(S.topo.loads) ? S.topo.loads : [];
  let h = `<h4>負載標記（${loads.length}）</h4><ul class="tq-loads">${loads.map(l => `<li><span>${esc(l.name || l.id)}：${l.massG} g @ ${esc(describeAttach(l))}${l.force ? `，外力 (${l.force.x}, ${l.force.y}) N` : ''}</span>
    <button class="tq-link" data-act="edit" data-id="${esc(l.id)}">編輯</button><button class="tq-link" data-act="del" data-id="${esc(l.id)}">移除</button></li>`).join('') || '<li class="tq-note">還沒有。手臂末端夾的物品、托盤上的重物，請在這裡加。</li>'}</ul>`;
  if (!ui.editing) return h + '<button data-act="add">＋ 新增負載</button>';
  const cur = ui.editing.load || {}, isBar = !!cur.at?.compId, pts = attachPoints(snap.comps), bars = attachBars(snap.comps);
  h += `<div class="tq-form" data-form="${esc(ui.editing.id)}">
   <label>名稱（選填）<input type="text" data-k="name" maxlength="24" value="${esc(cur.name || '')}"></label>
   <label>質量（g）<input type="number" data-k="massG" min="0" step="any" value="${cur.massG ?? 50}"></label>
   <label class="wide">掛在<select data-k="mode"><option value="point"${isBar ? '' : ' selected'}>機構接點（孔）</option><option value="bar"${isBar ? ' selected' : ''}>零件上的位置</option></select></label>
   <label class="wide">接點<select data-k="pointId">${pts.map(p => `<option value="${esc(p.id)}"${cur.at?.pointId === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
   <label>零件<select data-k="compId">${bars.map(p => `<option value="${esc(p.id)}"${cur.at?.compId === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
   <label>沿桿 u（mm）<input type="number" data-k="u" step="any" value="${cur.at?.u ?? 0}"></label>
   <label>垂直 v（mm）<input type="number" data-k="v" step="any" value="${cur.at?.v ?? 0}"></label>
   <label>外力 Fx（N，選填）<input type="number" data-k="fx" step="any" value="${cur.force?.x ?? ''}"></label>
   <label>外力 Fy（N，向上為正）<input type="number" data-k="fy" step="any" value="${cur.force?.y ?? ''}"></label>
   ${ui.formError ? `<div class="tq-err" role="alert">${esc(ui.formError)}</div>` : ''}
   <div class="wide tq-row"><button class="tq-primary" data-act="save">儲存</button><button data-act="cancel">取消</button></div></div>`;
  return h;
}

function commit(host, mutate) {
  host.pushUndo(); mutate(); host.scheduleAutosave(); refresh(host);
}

function onChange(e, host) {
  const t = e.target;
  ui.poseNote = '';
  if (t.dataset.f === 'motor') { ui.motorId = t.value; refresh(host); }
  else if (t.dataset.f === 'spec') { ui.specs[ui.motorId] = t.value; refresh(host); }
  else if (t.name === 'tqG') commit(host, () => { if (t.value === 'flat') S.topo.gravity = 'flat'; else delete S.topo.gravity; });
}

function onClick(e, host) {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act, loads = Array.isArray(S.topo.loads) ? S.topo.loads : [];
  if (act === 'close') closeTorque();
  else if (act === 'worst') showWorst(host);
  else if (act === 'add') { ui.formError = ''; ui.editing = { id: nextLoadId(loads), load: null }; refresh(host); }
  else if (act === 'edit') { ui.formError = ''; ui.editing = { id: b.dataset.id, load: loads.find(l => l.id === b.dataset.id) || null }; refresh(host); }
  else if (act === 'cancel') { ui.editing = null; ui.formError = ''; refresh(host); }
  else if (act === 'del') commit(host, () => { const next = removeLoad(loads, b.dataset.id); if (next.length) S.topo.loads = next; else delete S.topo.loads; });
  else if (act === 'save') {
    const form = {}; for (const el of panel.querySelectorAll('.tq-form [data-k]')) form[el.dataset.k] = el.value;
    const r = loadFromForm({ ...form, id: ui.editing.id });
    if (r.error) { ui.formError = r.error; refresh(host); return; }
    ui.editing = null; ui.formError = '';
    commit(host, () => { S.topo.loads = upsertLoad(loads, r.load); });
  }
}

/** 把機構轉到最吃力的輸入角，並選取馬達軸讓它在畫布上醒目。 */
function showWorst(host) {
  const last = ui.last;
  if (!last?.result?.ok) return;
  const theta = last.result.summary.worstTheta, id = last.motor.id;
  if (document.getElementById('playBtn')?.classList.contains('playing')) host.togglePlay();
  if (String(S.activeMotor) !== id) activateMotor(id, theta); else S.theta = theta;
  S.topo.params.theta = theta;
  const tv = document.getElementById('thetaVal'); if (tv) tv.textContent = Math.round(theta);
  S.selectedNodeId = last.motor.shaftPointId; S.selectedLinkId = S.selectedTriangleId = S.selectedGearId = null;
  host.draw();
  ui.poseNote = `已轉到最吃力姿態：${Math.round(theta * 10) / 10}°`;
  const note = panel?.querySelector('[data-pose-note]'); if (note) note.textContent = ui.poseNote;
}
