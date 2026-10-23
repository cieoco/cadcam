/**
 * blocks / chain-editor
 *
 * 鏈輪＋#25 鏈條的互動層：放置（點兩處）、選取鏈輪的面板、改齒數、對齊整數鏈節、刪除。
 * 計算全在 chain-tools.js（純函式）；這裡只接 DOM、狀態與 undo。
 * 本模組第一次用到才動態載入（app.js 的 withChainEditor），不佔啟動時的 JS。
 */
import { S, activateMotor } from './state.js';
import { placeChainDrive, setSprocketTeeth, alignChainLinks } from './chain-tools.js';
import { checkChainDrive, pitchDiameter, wrapAngle, centerForLinks, TEETH_MIN, TEETH_MAX } from '../core/chain-drive.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID = 8;
const TAP_PX = 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createChainEditor({
  svg, pushUndo, pause, rebuild, draw, setBanner, clearBanner, promptText, notify,
  cancelMotorMode, exitDrawTools, deselectLink, openMobileEditPanel, closeMobileEditPanel, hideEditorPanels,
  worldFromEvent, pointCoords, displayCoords, nearestDisplayToPoint, projectWorld, fitView
}) {
  const $ = id => document.getElementById(id);
  const sprockets = () => S.comps.filter(c => c.type === 'pulley' && c.kind === 'sprocket');
  const sprocketById = id => sprockets().find(c => c.id === id) || null;
  const chainFor = id => S.comps.find(c => c.type === 'belt' && c.kind === 'chain' && (c.driver === id || c.driven === id)) || null;
  const at = p => (pointCoords()[p.id] || p);

  function applyResult(r) {
    S.comps = r.comps;
    Object.keys(S.topo.params).forEach(k => { if (!(k in r.params)) delete S.topo.params[k]; });
    Object.assign(S.topo.params, r.params);
  }

  // ---------- 放置：點主動輪中心、再點從動輪中心 ----------
  let listeners = null;
  const placing = () => S.placingChain;

  // 點到既有孔就用孔的位置，否則對齊 8 mm 格點。
  function snapTap(world) {
    const id = nearestDisplayToPoint(world);
    const p = id && displayCoords()[id];
    if (p) return { x: p.x, y: p.y };
    return { x: Math.round(world.x / GRID) * GRID, y: Math.round(world.y / GRID) * GRID };
  }

  function start() {
    if (placing()) { cancel(); return; }
    pause();
    cancelMotorMode();
    exitDrawTools();
    deselectLink();
    deselectSprocket();
    S.placingChain = { first: null, hover: null };
    svg.style.cursor = 'crosshair';
    setPrompt();
    attach();
    draw();
  }
  function setPrompt() {
    const first = placing()?.first;
    setBanner(first
      ? promptText('點從動鏈輪的位置（會自動對齊鏈節）；Esc 取消', '再點從動鏈輪的位置')
      : promptText('鏈輪＋鏈條：點主動鏈輪（馬達）的位置；Esc 取消', '點主動鏈輪（馬達）的位置'));
    const banner = $('modeBanner');
    if (banner) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = '取消'; btn.style.cssText = 'margin-left:10px;min-height:32px;padding:0 10px;pointer-events:auto;';
      btn.addEventListener('click', cancel);
      banner.appendChild(btn);
    }
  }
  function cancel() {
    if (!placing()) return;
    S.placingChain = null;
    detach();
    svg.style.cursor = '';
    clearBanner();
    draw();
  }

  function attach() {
    if (listeners) return;
    let tap = null, hoverRaf = 0;
    const active = new Set();
    const onDown = e => {
      if (!placing()) return;
      if (S.drawingLink || S.drawingTriangle || S.drawingPolygon || S.placingMotor || S.pickBars) { cancel(); return; }
      if (!svg.contains(e.target) && e.target !== svg) return;
      active.add(e.pointerId);
      if (active.size > 1) { tap = null; return; }   // 雙指：交給縮放手勢
      if (e.button !== undefined && e.button !== 0) return;
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      // 按在零件或接點上時擋掉原本的選取／拖曳；按在空白處照常讓平移運作。
      if (e.target !== svg && e.target.closest?.('[data-id],[data-motor-hit],[data-pick-component]')) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    };
    const onUp = e => {
      active.delete(e.pointerId);
      if (!tap || tap.id !== e.pointerId || !placing()) { tap = null; return; }
      const t = tap; tap = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_PX || performance.now() - t.t > 800) return;
      const w = worldFromEvent(e);
      if (w) handleTap(snapTap(w));
    };
    const onCancel = e => { active.delete(e.pointerId); tap = null; };
    const onMove = e => {
      if (!placing()?.first || hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (!placing()) return;
        const w = worldFromEvent(e);
        if (w) { placing().hover = snapTap(w); draw(); }
      });
    };
    const onKey = e => { if (e.key === 'Escape' && placing()) { e.preventDefault(); cancel(); } };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('keydown', onKey, true);
    listeners = () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('keydown', onKey, true);
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
    };
  }
  function detach() { if (listeners) { listeners(); listeners = null; } }

  function handleTap(point) {
    const state = placing();
    if (!state) return;
    if (!state.first) {
      state.first = point;
      setPrompt();
      draw();
      return;
    }
    const r = placeChainDrive(S.comps, S.topo.params, state.first, point, {});
    if (!r.ok) {   // 太近等：留在放置模式，提示消失後恢復放置說明，再點一次
      notify(r.message);
      setTimeout(() => { if (placing() && !$('modeBanner')?.textContent) setPrompt(); }, 1800);
      return;
    }
    const wasBlank = S.comps.length === 0;
    pushUndo();
    S.placingChain = null;
    detach();
    svg.style.cursor = '';
    clearBanner();
    applyResult(r);
    S.counter += 3;
    activateMotor(r.motor);
    rebuild(); draw();
    if (wasBlank) fitView();   // 空白設計放第一組時置中放大，才看得清楚
    notify('已放好：12 齒帶 24 齒，按 ▶ 播放；點鏈輪可改齒數');
  }

  // 放置中的預覽：第一個鏈輪與（滑鼠／手指移動時）對齊後的第二個鏈輪。
  function drawPreview() {
    const state = placing();
    if (!state?.first) return;
    const scale = projectWorld.scale();
    const circle = (c, r, dash) => {
      const el = document.createElementNS(SVG_NS, 'circle');
      const p = projectWorld.point(c);
      el.setAttribute('cx', p.x); el.setAttribute('cy', p.y); el.setAttribute('r', Math.max(2, r * scale));
      el.setAttribute('fill', '#2c6fbb22'); el.setAttribute('stroke', '#2c6fbb'); el.setAttribute('stroke-width', 2);
      if (dash) el.setAttribute('stroke-dasharray', '6 4');
      el.style.pointerEvents = 'none';
      svg.appendChild(el);
    };
    circle(state.first, pitchDiameter(12) / 2, false);
    if (state.hover) {
      const r = placeChainDrive([], {}, state.first, state.hover, {});
      if (r.ok) {
        const B = r.comps.find(c => c.id.startsWith('SprocketB'));
        circle(B.p1, pitchDiameter(24) / 2, true);
      } else {
        circle(state.hover, pitchDiameter(24) / 2, true);
      }
    }
  }

  // ---------- 選取與面板 ----------
  function deselectSprocket() {
    S.selectedSprocketId = null;
    const panel = $('sprocketEditor');
    if (panel) panel.style.display = 'none';
  }
  function selectSprocket(id) {
    if (placing()) return;
    const spr = sprocketById(id);
    if (!spr) return;
    cancelMotorMode();
    openMobileEditPanel();
    deselectLink();   // 收掉連桿／三點桿／滑軌／齒輪選取與其面板
    S.selectedNodeId = null;
    S.selectedSprocketId = id;
    hideEditorPanels();
    updatePanel();
    draw();
  }
  function selectedChainInfo() {
    const spr = S.selectedSprocketId && sprocketById(S.selectedSprocketId);
    if (!spr) return null;
    const chain = chainFor(spr.id);
    const a = chain && sprocketById(chain.driver), b = chain && sprocketById(chain.driven);
    return { spr, chain, a, b };
  }
  function updatePanel() {
    const panel = $('sprocketEditor');
    if (!panel) return;
    const info = selectedChainInfo();
    if (!info) { panel.style.display = 'none'; return; }
    const { spr, chain, a, b } = info;
    if (panel.dataset.selected !== spr.id) {
      const more = $('sprocketMore'); if (more) more.open = false;
      panel.dataset.selected = spr.id;
    }
    const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setText('sprocketTeethVal', spr.teeth);
    setText('sprocketPitchVal', pitchDiameter(spr.teeth).toFixed(1));
    const row = $('sprocketChainRow'), btn = $('sprocketAlignBtn'), text = $('sprocketChainText');
    let issuesText = '';
    if (chain && a && b) {
      const C = dist(at(a.p1), at(b.p1));
      const check = checkChainDrive({ center: C, teeth1: a.teeth, teeth2: b.teeth });
      const aligned = Math.abs(check.deviationMm) <= 0.05 && !check.issues.some(i => i.code === 'odd-links');
      row.style.display = '';
      text.textContent = `鏈條 #25：${check.links} 節，中心距 ${C.toFixed(1)} mm` + (aligned ? '' : `（差 ${check.deviationMm >= 0 ? '+' : ''}${check.deviationMm.toFixed(2)} mm）`);
      btn.style.background = aligned ? '' : '#fde68a';
      btn.style.borderColor = aligned ? '' : '#d97706';
      btn.style.fontWeight = aligned ? '' : '700';
      btn.style.color = aligned ? '' : '#7c2d12';
      btn.textContent = aligned ? '已對齊整數鏈節' : '對齊整數鏈節';
      setText('sprocketWrapVal', `${wrapAngle(C, a.teeth, b.teeth).toFixed(0)}°（小鏈輪）`);
      setText('sprocketDevVal', `${check.deviationMm >= 0 ? '+' : ''}${check.deviationMm.toFixed(2)} mm`);
      const suggest = centerForLinks(check.links, a.teeth, b.teeth);
      setText('sprocketSuggestVal', `${suggest.toFixed(2)} mm（${check.links} 節）`);
      const driver = a.p1.physicalMotor ? `${(a.motorType === 'mg995' ? 'MG995' : 'TT')} 馬達在主動鏈輪（${a.teeth} 齒）` : '主動鏈輪還沒裝馬達';
      setText('sprocketPowerVal', driver);
      issuesText = check.issues.filter(i => i.code !== 'not-integer' && i.code !== 'odd-links').map(i => i.message).join(' ');
    } else {
      row.style.display = 'none';
      ['sprocketWrapVal', 'sprocketDevVal', 'sprocketSuggestVal', 'sprocketPowerVal'].forEach(id => setText(id, '-'));
    }
    const issues = $('sprocketIssues');
    if (issues) { issues.textContent = issuesText; issues.style.display = issuesText ? '' : 'none'; }
    panel.style.display = 'flex';
  }

  function changeTeeth(delta) {
    const info = selectedChainInfo();
    if (!info) return;
    const next = info.spr.teeth + delta;
    if (next < TEETH_MIN || next > TEETH_MAX) { notify(`鏈輪齒數要在 ${TEETH_MIN}～${TEETH_MAX} 之間`); return; }
    pause();
    const r = setSprocketTeeth(S.comps, S.topo.params, info.spr.id, next);
    if (!r.ok) { notify(r.message); return; }
    pushUndo();
    applyResult(r);
    rebuild(); draw(); updatePanel();
    if (r.message) notify(r.message);
  }
  function align() {
    const info = selectedChainInfo();
    if (!info?.chain) return;
    pause();
    const r = alignChainLinks(S.comps, S.topo.params, info.chain.id);
    if (!r.ok) { notify(r.message); return; }
    pushUndo();
    applyResult(r);
    rebuild(); draw(); updatePanel();
    notify(r.message);
  }
  function deleteDrive() {
    const info = selectedChainInfo();
    if (!info) return;
    pause();
    pushUndo();
    const ids = new Set([info.spr.id]);
    if (info.chain) { ids.add(info.chain.id); ids.add(info.chain.driver); ids.add(info.chain.driven); }
    S.comps.filter(c => ids.has(c.id)).forEach(c => { if (c.radiusParam) delete S.topo.params[c.radiusParam]; });
    S.comps = S.comps.filter(c => !ids.has(c.id));
    deselectSprocket();
    closeMobileEditPanel();
    rebuild(); draw();
  }

  return { start, cancel, drawPreview, selectSprocket, deselectSprocket, updatePanel, changeTeeth, align, deleteDrive, isPlacing: () => Boolean(placing()) };
}
