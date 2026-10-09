import {createFaceCandidateTransaction} from './face-candidate.js';
import { APP_VERSION } from '../version.js?v=20261008_bracketalign';
import { LOAD_GRAPH_TOKEN } from '../module-url.js';
import { createLoadSession, LOAD_MISMATCH_MESSAGE } from './load-session.js';
/** 正式組立台的隔離選面草稿。確認前不改作品。 */
import { buildMountSurfaces, findMountSurface } from './mount-surfaces.js';
import { pointCoords } from './model.js';
import { inspectLinkExport, inspectPlateExport } from './exporters.js?v=20261007_9';
import { connectionSelection } from './connection-selection.js';
import { readConnectionDescriptor } from './connection-descriptor.js';

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

export function openFaceWizard({ comps, modules, params, childId, exportSettings, stockMm, joint, fabrication, readSource, readPose, isCurrent, commit, say, wizard = false, initialMount = null, startAtPlacement = false }) {
  const transaction=createFaceCandidateTransaction({readSource:readSource || (()=>({comps,modules,params,fabrication,exportSettings,stockMm,joint})),readPose:readPose || (()=>({theta:params.theta || 0})),commit});
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
  const saved = initialMount?.face ? readConnectionDescriptor({ comps, modules, childId, mount: initialMount }) : null;
  // Reselect starts from the saved endpoints. Current design presets are only
  // defaults for a new connection; ambiguous legacy records require a choice.
  if (saved && (!saved.host || !saved.child)) {
    say(saved.diagnostics[0]?.message || '原接合端點無法使用，請先修復缺少的零件。'); return;
  }
  const repairChild = saved && !saved.child.available;
  const repairHost = saved && (!saved.host.available || !findMountSurface(surfaces(saved.host.moduleId),initialMount.to));
  const needsChoice = repairChild || repairHost;
  if (needsChoice) say(saved.diagnostics[0]?.message || '請重新選取接合端點。');
  const childSelection = saved ? (repairChild ? null : { part: saved.child.partId, face: saved.child.face }) : connectionSelection(child, 'child');
  const chosenAttach = childSelection?.part;
  const attachComp = comps.find(c => c.moduleId === childId && c.id === chosenAttach && c.type === 'bar' && [c.p1, c.p2].every(p => p && (p.type === 'fixed' || p.type === 'motor')));
  if (chosenAttach && chosenAttach !== 'frame' && !attachComp) { say('這個接合面在活動桿上；請把它作為承接機構，另一個機構選固定桿的面。'); return; }
  const partSurfaces = partId => buildMountSurfaces({ comps, modules, params, moduleId: childId, partId, exportSettings, thicknessMm: stockMm, drilling: true }).surfaces || [];
  const childSurfaces = attachComp ? partSurfaces(attachComp.id) : surfaces(childId);
  const childSurface = childSurfaces.find(s => attachComp ? s.outputId === 'face-attach' : s.kind === 'frame');
  const eligible = m => {
    const visited = new Set();
    for (let p = m; p; p = modules.find(x => x.id === p.mount?.to?.module)) {
      if (p.id === childId || visited.has(p.id)) return false;
      visited.add(p.id);
    }
    return true;
  };
  const matchesSaved = s => saved && s.moduleId === saved.host.moduleId && (saved.host.source.kind === 'frame' ? s.kind === 'frame' && s.frameEdge === saved.host.edge : s.kind === 'output' && s.outputId === saved.host.source.outputId);
  const hosts = modules.filter(eligible).flatMap(m => {
    const selected = connectionSelection(m, 'host'), ownParts = parts(m.id);
    // A straight edge is only the frame's rigid-pose reference, not a second
    // face choice. New mounts use the first valid stable edge; reselect keeps
    // the saved edge exactly. An unavailable saved edge requires a new choice.
    return surfaces(m.id).slice().sort((a,b)=>selected?.part==='frame'?Number(b.kind==='frame')-Number(a.kind==='frame'):Number(a.kind==='frame')-Number(b.kind==='frame')).flatMap(s => {
      if(s.kind!=='frame')return [s];
      const edge=saved?.host.moduleId===m.id&&saved.host.source.kind==='frame'&&!repairHost?saved.host.edge:s.edges?.[0]?.edge;
      return s.edges?.some(e=>e.edge===edge)?[{...s,frameEdge:edge}]:[];
    })
      .filter(s => s.kind === 'frame' || repairHost || !selected || s.compId === selected.part || matchesSaved(s))
      .map(s => reference(s, `${m.name} · ${s.name}`, ownParts));
  });
  if (!childSurface || !hosts.length) { say('需要另一個有承接板的機構，以及安裝端的固定底板。'); return; }
  const candidates = repairChild ? [childSurface, ...comps.filter(c => c.moduleId === childId && c.type === 'bar' && [c.p1, c.p2].every(p => p && ['fixed', 'motor'].includes(p.type))).map(c => partSurfaces(c.id).find(s => s.compId === c.id))].filter(Boolean) : [childSurface];
  const children = candidates.map(s => reference(s, `${child.name} · ${s.kind === 'frame' ? '固定桿／底板' : s.name}`, parts(childId)));
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '接合預覽');
  dialog.style.cssText = 'width:min(960px,100vw);height:94dvh;max-width:100vw;max-height:100dvh;padding:0;border:0;border-radius:14px;overflow-x:hidden;';
  const close = document.createElement('button'); close.textContent = '關閉'; close.setAttribute('aria-label', '關閉組立精靈');
  close.style.cssText = 'height:44px;min-width:64px;float:right;';
  const frame = document.createElement('iframe'); frame.title = '選面與尺寸';
  const loadSession = createLoadSession(LOAD_GRAPH_TOKEN);
  const frameUrl = new URL('../../assembly-wizard-prototype.html', import.meta.url);
  frameUrl.searchParams.set('integrated', '1');
  frameUrl.searchParams.set('v', APP_VERSION);
  frameUrl.searchParams.set('load', LOAD_GRAPH_TOKEN);
  frame.src = frameUrl.href;
  frame.style.cssText = 'width:100%;height:calc(100% - 44px);border:0;display:block;';
  dialog.append(close, frame); document.body.append(dialog);
  const dispose = () => {transaction.cancel();window.removeEventListener('message', receive);dialog.remove();};
  close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', dispose);
  async function receive(e) {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === 'face-wizard-cancel') { dialog.close(); return; }
    const rejectLoad = () => {
      say(LOAD_MISMATCH_MESSAGE);
      frame.contentWindow.postMessage({type:'face-wizard-error',loadMismatch:true,reason:LOAD_MISMATCH_MESSAGE},location.origin);
    };
    if (e.data?.type === 'face-wizard-ready') {
      if (!loadSession.receiveReady(e.data.loadGraph)) { rejectLoad(); return; }
      frame.contentWindow.postMessage({ type: 'face-wizard-init', sourceRevision:transaction.snapshot().sourceRevision, joint, loadGraph: LOAD_GRAPH_TOKEN, startAtPlacement: startAtPlacement && !needsChoice, hosts: hosts.map(h => ({ ...h, defaultFace: matchesSaved(h.surface) ? saved.host.face : connectionSelection(modules.find(m => m.id === h.surface.moduleId), 'host')?.face || 'top' })), children, configured: !!childSelection && !needsChoice, mode: wizard || needsChoice || matchMedia('(max-width: 760px)').matches ? 'wizard' : 'work', selection: initialMount?.face?.selection || { hostFace: connectionSelection(modules.find(m => m.id === hosts[0].surface.moduleId), 'host')?.face || 'top', childFace: childSelection?.face || 'bottom' }, host: hosts.findIndex(h => h.surface.moduleId === initialMount?.to?.module && (initialMount?.to?.frame ? h.surface.frameEdge === initialMount.to.frame.edge : h.surface.outputId === initialMount?.to?.output && h.surface.kind === 'output')) }, location.origin);
    }
    if(!['face-wizard-preview','face-wizard-confirm'].includes(e.data?.type))return;
    if(!loadSession.allowConfirm(e.data.loadGraph)){rejectLoad();return;}
    if(isCurrent&&!isCurrent()){frame.contentWindow.postMessage({type:'face-wizard-error',reason:'作品已變動，請重新開啟接合。'},location.origin);return;}
    if(e.data.type==='face-wizard-preview'){
      const selection=e.data.selection;
      if(!selection||!Number.isInteger(selection.host)||!hosts[selection.host]||!Number.isInteger(selection.child)||!children[selection.child])return;
      const host=hosts[selection.host].surface,selectedChild=children[selection.child].surface;
      const result=await transaction.preview({childId,reselect:!!initialMount,selection,hostEndpoint:{moduleId:host.moduleId,outputId:host.outputId,frameEdge:host.frameEdge,partId:host.compId},childEndpoint:{partId:selectedChild.compId || 'frame'}});
      if(transaction.snapshot().closed)return;
      frame.contentWindow.postMessage({type:'face-wizard-preview-result',requestId:e.data.requestId,loadGraph:LOAD_GRAPH_TOKEN,candidate:result},location.origin);return;
    }
    const result=await transaction.confirm({candidateId:e.data.candidateId,selectionRevision:e.data.selectionRevision});
    if(result.ok)dialog.close();
    else frame.contentWindow.postMessage({type:'face-wizard-error',reason:result.reason},location.origin);
  }
  window.addEventListener('message', receive); dialog.showModal();
}
