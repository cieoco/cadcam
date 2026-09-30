/**
 * blocks / module-drag
 *
 * D9 拖曳安裝（SDD-ASSEMBLY-MODULES §4.3b）：選取「未安裝、有 base」的模組時，在 base 畫一個
 * 模組移動把手；拖把手＝整組模組剛體平移（不旋轉），base 進入其他模組輸出端 at 的吸附半徑
 * 就顯示綠色吸附環，放開即呼叫既有 mountModule 安裝；沒吸附就只是搬位置。
 * 只用 svg 的 capture 階段監聽（同 jaw-tip-handle.js）；純計算在 module-ops.js。
 * 取消（Esc／pointercancel／lostpointercapture／另一指按下）還原作品且不記 undo；
 * 另一指按下時不攔截該事件，讓雙指縮放照常接手。整段手勢只記一筆 undo。
 */
import { S } from './state.js';
import { translateModule, mountTargets, nearestMountTarget, mountModule } from './module-ops.js';

// mountModule 回傳的 reason → 簡短提示（拖曳放開時失敗用）。
const REASON_HINTS = {
  'no-module': '找不到這個模組。',
  'already-mounted': '這個模組已經裝好了。',
  'no-base': '模組沒有固定點，無法安裝。',
  'no-target': '請先靠近要安裝的輸出端。',
  'cycle': '不能裝到自己或子模組上。',
  'no-host': '找不到宿主模組。',
  'no-output': '宿主沒有這個輸出端。',
  'unsolved': '目前姿態解不出來，換個角度再試。',
  'no-position': '算不出安裝位置。',
  'no-ref-pose': '算不出輸出端姿態。'
};
const hintOf = reason => REASON_HINTS[reason] || '安裝失敗。';

const NS = 'http://www.w3.org/2000/svg';
const MOVE_THRESHOLD_PX = 3;

export function createModuleDrag(deps) {
  const { svg, project, worldFromEvent, snapRadiusWorld, pause, pushUndo, rebuild, draw, notify,
          currentModuleId, points, motorState } = deps;
  let drag = null;   // { id, moduleId, startX, startY, startWorld, base0, orig, targets, moved, target, delta }

  const stop = e => { e.preventDefault?.(); e.stopImmediatePropagation?.(); };
  const isTouchLike = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches;

  function restore() {
    if (drag) S.comps = drag.orig;
  }
  // 先清 drag 再釋放 capture：就算 lostpointercapture 同步觸發，也不會把已完成的結果還原。
  function end(pointerId) {
    drag = null;
    try { svg.releasePointerCapture(pointerId); } catch (_) {}
  }
  // 取消：還原作品、不記 undo。
  function cancel() {
    if (!drag) return;
    const id = drag.id;
    restore(); end(id);
    rebuild(); draw();
  }

  svg.addEventListener('pointerdown', e => {
    if (drag) {
      // 另一指按下：取消並還原，事件不攔截（交給雙指縮放）。
      if (e.pointerId !== drag.id) cancel();
      return;
    }
    if (!e.target?.closest?.('[data-module-handle]') || (e.button !== undefined && e.button !== 0)) return;
    const moduleId = currentModuleId();
    const mod = moduleId && (S.modules || []).find(m => m.id === moduleId);
    if (!mod || mod.mount || !mod.base) return;
    stop(e);
    const pts = points() || {};
    const base0 = pts[mod.base];
    const startWorld = worldFromEvent(e);
    if (!base0 || !Number.isFinite(base0.x) || !Number.isFinite(base0.y) || !startWorld) return;
    pause();
    drag = {
      id: e.pointerId, moduleId, startX: e.clientX, startY: e.clientY, startWorld,
      base0: { x: base0.x, y: base0.y }, orig: S.comps, targets: mountTargets(S.comps, S.modules, moduleId, pts),
      moved: false, target: null, delta: { x: 0, y: 0 }
    };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  }, true);

  svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    stop(e);
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < MOVE_THRESHOLD_PX) return;
    const w = worldFromEvent(e);
    if (!w) return;
    drag.moved = true;
    const dx = w.x - drag.startWorld.x, dy = w.y - drag.startWorld.y;
    drag.delta = { x: dx, y: dy };
    S.comps = translateModule(drag.orig, drag.moduleId, dx, dy);
    drag.target = nearestMountTarget(drag.targets, { x: drag.base0.x + dx, y: drag.base0.y + dy }, snapRadiusWorld());
    rebuild(); draw();
  }, true);

  function finish(e) {
    if (!drag || e.pointerId !== drag.id) return;
    stop(e);
    const d = drag;
    const moved = S.comps;   // 釋放 capture 之前先取得平移後的作品
    end(d.id);
    if (!d.moved) { S.comps = d.orig; return; }   // 點一下：不改作品、不記 undo
    let note = null;
    if (d.target) {
      const r = mountModule(d.orig, S.modules, d.moduleId, d.target, S.topo.params, motorState());
      S.comps = d.orig;
      if (r && r.ok) {
        pushUndo();
        S.comps = r.comps; S.modules = r.modules;
        note = `已安裝到 ${d.target.label}`;
      } else {
        note = hintOf(r && r.reason);
      }
    } else {
      S.comps = d.orig; pushUndo(); S.comps = moved;
    }
    rebuild(); draw();
    if (note) notify(note);
  }
  svg.addEventListener('pointerup', finish, true);
  svg.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) { stop(e); cancel(); } }, true);
  svg.addEventListener('lostpointercapture', e => { if (drag && e.pointerId === drag.id) cancel(); }, true);
  document.addEventListener('keydown', e => {
    if (drag && e.key === 'Escape') { stop(e); cancel(); }
  }, true);

  function circle(parent, radius, fill, stroke, strokeWidth, unit) {
    const node = document.createElementNS(NS, 'circle');
    node.setAttribute('r', radius * unit); node.setAttribute('fill', fill);
    if (stroke) { node.setAttribute('stroke', stroke); node.setAttribute('stroke-width', strokeWidth * unit); }
    parent.appendChild(node); return node;
  }

  // 每次 draw() 呼叫：畫吸附環（拖曳中且已吸附）與 base 上的移動把手；回傳每幀更新座標的函式（無把手回 null）。
  function drawHandle(pts) {
    const unit = 1 / (svg.getScreenCTM?.()?.a || 1);   // 螢幕 px → svg user units
    if (drag && drag.target) {
      const t = project({ x: drag.target.x, y: drag.target.y });
      const ring = document.createElementNS(NS, 'g');
      ring.setAttribute('data-module-snap', drag.target.module); ring.style.pointerEvents = 'none';
      const rz = Math.abs(project({ x: drag.target.x + snapRadiusWorld(), y: drag.target.y }).x - t.x);
      const zone = circle(ring, 1, 'rgba(46,204,113,0.12)', '#2ecc71', 1.5, unit);
      zone.setAttribute('r', rz); zone.setAttribute('stroke-dasharray', `${4 * unit} ${3 * unit}`);
      const inner = circle(ring, 15, 'none', '#16a34a', 4, unit);
      [zone, inner].forEach(n => { n.setAttribute('cx', t.x); n.setAttribute('cy', t.y); });
      const title = document.createElementNS(NS, 'title'); title.textContent = `放開安裝到 ${drag.target.label}`; ring.appendChild(title);
      svg.appendChild(ring);
    }
    const moduleId = drag ? drag.moduleId : currentModuleId();
    const mod = moduleId && (S.modules || []).find(m => m.id === moduleId);
    const at = mod && !mod.mount && mod.base && pts && pts[mod.base];
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-module-handle', mod.id); group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `拖曳移動模組 ${mod.name || ''}，靠近其他模組輸出端放開即安裝`);
    group.style.cursor = 'grab'; group.style.touchAction = 'none';
    // 把手畫在 base 右上方 (+24, -24) 螢幕 px，不蓋住 base 節點（否則點不到節點）；base→把手畫一條細連線。
    const off = 24 * unit;
    const tether = document.createElementNS(NS, 'line');
    tether.setAttribute('stroke', '#0e7490'); tether.setAttribute('stroke-width', 1.5 * unit);
    tether.setAttribute('stroke-dasharray', `${3 * unit} ${2 * unit}`); tether.style.pointerEvents = 'none';
    group.appendChild(tether);
    const hit = circle(group, isTouchLike() ? 26 : 20, 'transparent', null, 0, unit);
    const ring = circle(group, 11, 'rgba(255,255,255,0.85)', '#0e7490', 2, unit);
    const cross = document.createElementNS(NS, 'path');
    const a = 5 * unit;
    cross.setAttribute('fill', 'none'); cross.setAttribute('stroke', '#0e7490'); cross.setAttribute('stroke-width', 1.5 * unit);
    const title = document.createElementNS(NS, 'title');
    title.textContent = '拖曳移動整組模組；靠近其他模組的輸出端放開即安裝，Esc 取消。';
    group.appendChild(title);
    group.appendChild(cross);
    const update = current => {
      const p0 = current && current[mod.base];
      const ok = p0 && Number.isFinite(p0.x) && Number.isFinite(p0.y);
      group.style.display = ok ? '' : 'none';
      if (!ok) return;
      const b0 = project(p0), p = { x: b0.x + off, y: b0.y - off };
      [hit, ring].forEach(n => { n.setAttribute('cx', p.x); n.setAttribute('cy', p.y); });
      tether.setAttribute('x1', b0.x); tether.setAttribute('y1', b0.y);
      tether.setAttribute('x2', p.x); tether.setAttribute('y2', p.y);
      cross.setAttribute('d', `M${p.x - a} ${p.y}H${p.x + a}M${p.x} ${p.y - a}V${p.y + a}`);
    };
    svg.appendChild(group); update(pts); return update;
  }

  return {
    draw: drawHandle,
    cancel,
    state: () => ({ dragging: !!drag, moduleId: drag ? drag.moduleId : null, target: drag ? drag.target : null })
  };
}
