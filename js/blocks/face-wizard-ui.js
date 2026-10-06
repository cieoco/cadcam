/** 正式組立台的隔離選面草稿。確認前不改作品。 */
import { buildMountSurfaces } from './mount-surfaces.js';
import { buildFacePlacement } from './face-placement.js';
import { mountFacePlacement } from './face-mount.js';

function reference(surface, name) {
  const axes = ['x', 'y', 'z'];
  const center = Object.fromEntries(axes.map(k => [k, (surface.box.min[k] + surface.box.max[k]) / 2]));
  const relative = p => ({ ...p, x: p.x - center.x, y: p.y - center.y });
  return { name, detail: surface.kind === 'frame' ? '固定底座' : '活動承接位置', surface,
    box: { min: Object.fromEntries(axes.map(k => [k, surface.box.min[k] - center[k]])), max: Object.fromEntries(axes.map(k => [k, surface.box.max[k] - center[k]])) },
    outlines: (surface.outlines || [surface.outline]).map(r => r.map(relative)),
    holes: (surface.holes || []).map(relative), cutouts: (surface.cutouts || []).map(c => ({ ...c, points: c.points.map(relative) })) };
}

export function openFaceWizard({ comps, modules, params, childId, exportSettings, stockMm, isCurrent, commit, say }) {
  const child = modules.find(m => m.id === childId);
  if (!child || child.mount || !child.base) { say('請選尚未安裝且有底座的機構。'); return; }
  const surfaces = id => buildMountSurfaces({ comps, modules, params, moduleId: id, exportSettings, thicknessMm: stockMm }).surfaces || [];
  const childSurface = surfaces(childId).find(s => s.kind === 'frame');
  const eligible = m => {
    if (m.mount && !m.mount.face) return false;
    const visited = new Set();
    for (let p = m; p; p = modules.find(x => x.id === p.mount?.to?.module)) {
      if (p.id === childId || visited.has(p.id)) return false;
      visited.add(p.id);
    }
    return true;
  };
  const hosts = modules.filter(eligible).flatMap(m => surfaces(m.id).filter(s => s.kind === 'output').map(s => reference(s, `${m.name} · ${s.name}`)));
  if (!childSurface || !hosts.length) { say('需要另一個有承接板的機構，以及安裝端的固定底板。'); return; }
  const children = [reference(childSurface, `${child.name} · 底板`)];
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '六面體組立精靈');
  dialog.style.cssText = 'width:min(960px,100vw);height:94dvh;max-width:100vw;max-height:100dvh;padding:0;border:0;border-radius:14px;';
  const close = document.createElement('button'); close.textContent = '關閉'; close.setAttribute('aria-label', '關閉組立精靈');
  close.style.cssText = 'height:44px;min-width:64px;float:right;';
  const frame = document.createElement('iframe'); frame.title = '選面與尺寸'; frame.src = new URL('../../assembly-wizard-prototype.html?integrated=1', import.meta.url).href;
  frame.style.cssText = 'width:100%;height:calc(100% - 44px);border:0;display:block;';
  dialog.append(close, frame); document.body.append(dialog);
  const dispose = () => { window.removeEventListener('message', receive); dialog.remove(); };
  close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', dispose);
  function receive(e) {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === 'face-wizard-ready') frame.contentWindow.postMessage({ type: 'face-wizard-init', hosts, children, mode: matchMedia('(max-width: 760px)').matches ? 'wizard' : 'work' }, location.origin);
    if (e.data?.type !== 'face-wizard-confirm') return;
    if (!isCurrent()) { dialog.close(); say('作品已變動，請重新選擇接法。'); return; }
    const selection = e.data.selection;
    if (!selection || !Number.isInteger(selection.host) || selection.host < 0 || selection.host >= hosts.length || selection.child !== 0) return;
    const host = hosts[selection.host], result = buildFacePlacement({ host, child: children[0], selection });
    if (!result.ok) { frame.contentWindow.postMessage({ type: 'face-wizard-error', reason: result.reason }, location.origin); return; }
    const face = { version: 1, ...result.record.transform, selection: result.record.selection,
      hostThicknessMm: host.surface.box.max.z - host.surface.box.min.z,
      childThicknessMm: childSurface.box.max.z - childSurface.box.min.z };
    const mounted = mountFacePlacement(comps, modules, childId, { hostId: host.surface.moduleId, outputId: host.surface.outputId, face }, params);
    if (!mounted.ok) { frame.contentWindow.postMessage({ type: 'face-wizard-error', reason: mounted.reason }, location.origin); return; }
    commit({ comps, modules: modules.map(m => m.id === childId ? { ...m, mount: mounted.mount } : m) }); dialog.close();
  }
  window.addEventListener('message', receive); dialog.showModal();
}
