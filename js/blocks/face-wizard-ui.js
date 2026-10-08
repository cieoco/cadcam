import { APP_VERSION } from '../version.js?v=20261008_edgefit';
import { faceBracketPlan } from './face-bracket-extras.js';
import { planFaceBrackets } from './face-bracket-geometry.js?v=20261008_edgefit';
/** 正式組立台的隔離選面草稿。確認前不改作品。 */
import { buildMountSurfaces } from './mount-surfaces.js';
import { buildFacePlacement } from './face-placement.js';
import { mountFacePlacement } from './face-mount.js';
import { pointCoords } from './model.js';
import { inspectLinkExport, inspectPlateExport } from './exporters.js?v=20261007_9';
import { connectionSelection } from './connection-selection.js';

function reference(surface, name, parts = []) {
  const axes = ['x', 'y', 'z'];
  const center = Object.fromEntries(axes.map(k => [k, (surface.box.min[k] + surface.box.max[k]) / 2]));
  const relative = p => ({ ...p, x: p.x - center.x, y: p.y - center.y });
  return { name, detail: surface.kind === 'frame' ? '固定底座' : '活動承接位置', surface,
    parts: parts.map(p => ({ ...p, points: p.points.map(relative) })),
    box: { min: Object.fromEntries(axes.map(k => [k, surface.box.min[k] - center[k]])), max: Object.fromEntries(axes.map(k => [k, surface.box.max[k] - center[k]])) },
    outlines: (surface.outlines || [surface.outline]).map(r => r.map(relative)),
    holes: (surface.holes || []).map(relative), cutouts: (surface.cutouts || []).map(c => ({ ...c, points: c.points.map(relative) })) };
}

export function openFaceWizard({ comps, modules, params, childId, exportSettings, stockMm, isCurrent, commit, say, wizard = false, initialMount = null, startAtPlacement = false }) {
  const child = modules.find(m => m.id === childId);
  if (!child || child.mount || !child.base) { say('請選尚未安裝且有底座的機構。'); return; }
  const surfaces = id => buildMountSurfaces({ comps, modules, params, moduleId: id, exportSettings, thicknessMm: stockMm, drilling: true }).surfaces || [];
  // 唯讀機構輪廓隨接合板一起移動，選面時保留完整機構的空間脈絡。
  const parts = id => {
    const own = comps.filter(c => c.moduleId === id), pts = pointCoords(own), result = [];
    for (const s of surfaces(id)) if (s.kind === 'frame') for (const points of s.outlines) result.push({ points, color: '#8799aa' });
    for (const c of own) {
      const a = pts[c.p1?.id] || c.p1, b = pts[c.p2?.id] || c.p2;
      if (!a) continue;
      let rings = [];
      if (c.type === 'bar' && b) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 0) rings = (inspectLinkExport(c, len, exportSettings).outlines || []).map(r => r.map(p => ({ x: a.x + (p.x * (b.x - a.x) - p.y * (b.y - a.y)) / len, y: a.y + (p.x * (b.y - a.y) + p.y * (b.x - a.x)) / len })));
      } else if (c.type === 'triangle') {
        const ps = [c.p1, c.p2, c.p3].map(p => pts[p?.id] || p);
        if (ps.every(Boolean)) rings = inspectPlateExport(c, ps, exportSettings).outlines || [];
      } else if (c.type === 'gear') {
        const r = Number(params[c.radiusParam]) || Number(c.r) || Number(c.radius) || 15;
        rings = [Array.from({ length: 32 }, (_, i) => ({ x: a.x + r * Math.cos(i * Math.PI / 16), y: a.y + r * Math.sin(i * Math.PI / 16) }))];
      }
      for (const points of rings) result.push({ points, color: c.color || '#578cab' });
    }
    return result;
  };
  const childSelection = connectionSelection(child, 'child');
  const chosenAttach = childSelection?.part;
  const attachComp = comps.find(c => c.moduleId === childId && c.id === chosenAttach && c.type === 'bar' && [c.p1, c.p2].every(p => p && (p.type === 'fixed' || p.type === 'motor')));
  if (chosenAttach && chosenAttach !== 'frame' && !attachComp) { say('這個接合面在活動桿上；請把它作為承接機構，另一個機構選固定桿的面。'); return; }
  const childSurfaces = attachComp ? buildMountSurfaces({ comps, modules: modules.map(m => m.id === childId ? { ...m, outputs: [{ id: 'face-attach', name: attachComp.name || attachComp.id, at: attachComp.p1.id, body: { kind: 'bar', id: attachComp.id } }] } : m), params, moduleId: childId, exportSettings, thicknessMm: stockMm, drilling: true }).surfaces || [] : surfaces(childId);
  const childSurface = childSurfaces.find(s => attachComp ? s.outputId === 'face-attach' : s.kind === 'frame');
  const eligible = m => {
    if (m.mount && !m.mount.face) return false;
    const visited = new Set();
    for (let p = m; p; p = modules.find(x => x.id === p.mount?.to?.module)) {
      if (p.id === childId || visited.has(p.id)) return false;
      visited.add(p.id);
    }
    return true;
  };
  const hosts = modules.filter(eligible).flatMap(m => { const selected = connectionSelection(m, 'host'); return surfaces(m.id).filter(s => s.kind === 'output' && (!selected || s.compId === selected.part)).map(s => reference(s, `${m.name} · ${s.name}`, parts(m.id))); });
  if (!childSurface || !hosts.length) { say('需要另一個有承接板的機構，以及安裝端的固定底板。'); return; }
  const children = [reference(childSurface, `${child.name} · ${attachComp ? attachComp.name || attachComp.id : '固定桿／底板'}`, parts(childId))];
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '接合預覽');
  dialog.style.cssText = 'width:min(960px,100vw);height:94dvh;max-width:100vw;max-height:100dvh;padding:0;border:0;border-radius:14px;';
  const close = document.createElement('button'); close.textContent = '關閉'; close.setAttribute('aria-label', '關閉組立精靈');
  close.style.cssText = 'height:44px;min-width:64px;float:right;';
  const frame = document.createElement('iframe'); frame.title = '選面與尺寸';
  const frameUrl = new URL('../../assembly-wizard-prototype.html', import.meta.url);
  frameUrl.searchParams.set('integrated', '1');
  frameUrl.searchParams.set('v', APP_VERSION);
  frame.src = frameUrl.href;
  frame.style.cssText = 'width:100%;height:calc(100% - 44px);border:0;display:block;';
  dialog.append(close, frame); document.body.append(dialog);
  const dispose = () => { window.removeEventListener('message', receive); dialog.remove(); };
  close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', dispose);
  function receive(e) {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === 'face-wizard-ready') frame.contentWindow.postMessage({ type: 'face-wizard-init', startAtPlacement, hosts: hosts.map(h => ({ ...h, defaultFace: connectionSelection(modules.find(m => m.id === h.surface.moduleId), 'host')?.face || 'top' })), children, configured: !!childSelection, mode: wizard || matchMedia('(max-width: 760px)').matches ? 'wizard' : 'work', selection: initialMount?.face?.selection || { hostFace: connectionSelection(modules.find(m => m.id === hosts[0].surface.moduleId), 'host')?.face || 'top', childFace: childSelection?.face || 'bottom' }, host: hosts.findIndex(h => h.surface.moduleId === initialMount?.to?.module && h.surface.outputId === initialMount?.to?.output) }, location.origin);
    if (e.data?.type === 'face-wizard-cancel') { dialog.close(); return; }
    if (e.data?.type !== 'face-wizard-confirm') return;
    if (!isCurrent()) { dialog.close(); say('作品已變動，請重新選擇接法。'); return; }
    const selection = e.data.selection;
    if (!selection || !Number.isInteger(selection.host) || selection.host < 0 || selection.host >= hosts.length || selection.child !== 0) return;
    const host = hosts[selection.host], result = buildFacePlacement({ host, child: children[0], selection });
    if (!result.ok) { frame.contentWindow.postMessage({ type: 'face-wizard-error', reason: result.reason }, location.origin); return; }
    const face = { version: 1, ...result.record.transform, selection: result.record.selection,
      hostThicknessMm: host.surface.box.max.z - host.surface.box.min.z,
      childThicknessMm: childSurface.box.max.z - childSurface.box.min.z };
    if (selection.brackets) {
      const drilling = planFaceBrackets(host.surface, childSurface, face, selection.brackets.offsets);
      if (host.surface.body?.kind === 'rack' || childSurface.body?.kind === 'rack' || !drilling.ok) {
        delete face.selection.brackets;
      }
    }
    const mounted = mountFacePlacement(comps, modules, childId, { hostId: host.surface.moduleId, outputId: host.surface.outputId, face }, params);
    if (!mounted.ok) { frame.contentWindow.postMessage({ type: 'face-wizard-error', reason: mounted.reason }, location.origin); return; }
    if (face.selection.brackets) {
      const pending = { ...child, mount: mounted.mount };
      const checked = faceBracketPlan(comps, modules.map(m => m.id === childId ? pending : m), params, pending, { stockMm, exportSettings });
      if (!checked?.ok) delete mounted.mount.face.selection.brackets;
    }
    commit({ comps, modules: modules.map(m => m.id === childId ? { ...m, mount: mounted.mount } : m) }); dialog.close();
  }
  window.addEventListener('message', receive); dialog.showModal();
}
