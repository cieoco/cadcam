import { isFixedMountPart, installationPartStatus } from './part-types.js';
import {createFaceCandidateTransaction} from './face-candidate.js';
import {confirmMountingChange} from './mounting-review-ui.js';
import { APP_VERSION } from '../version.js?v=20261008_bracketalign';
import { LOAD_GRAPH_TOKEN } from '../module-url.js';
import { createLoadSession, LOAD_MISMATCH_MESSAGE } from './load-session.js';
/** 正式組立台的隔離選面草稿。確認前不改作品。 */
import { buildMountSurfaces, findMountSurface, selectableMountSurfaces } from './mount-surfaces.js';
import { pointCoords } from './model.js';
import { inspectLinkExport, inspectPlateExport } from './exporters.js?v=20261007_9';
import { connectionSelection } from './connection-selection.js';
import {placedFaceSelection,placedModuleAxes} from './face-placement-direction.js';
import {boxFaces} from './face-mate.js';
import {candidateSurfacePoint} from './face-candidate-view.js';
import {createFaceEdgeOverlay} from './face-edge-overlay.js';
import { readConnectionDescriptor } from './connection-descriptor.js';
import { matchesSurfacePart } from './face-surface-pick.js';

function reference(surface, name, parts = []) {
  const axes = ['x', 'y', 'z'];
  const center = Object.fromEntries(axes.map(k => [k, (surface.box.min[k] + surface.box.max[k]) / 2]));
  const relative = p => ({ ...p, x: p.x - center.x, y: p.y - center.y });
  return { name, designId:surface.moduleId, designName:name.split(' · ')[0], partName:surface.kind==='frame'?'機架底板':surface.name, detail: surface.kind === 'frame' ? '固定底座' : '活動承接位置', surface,
    parts: parts.map(p => ({ ...p, points: p.points.map(relative) })),
    box: { min: Object.fromEntries(axes.map(k => [k, surface.box.min[k] - center[k]])), max: Object.fromEntries(axes.map(k => [k, surface.box.max[k] - center[k]])) },
    outlines: (surface.outlines || [surface.outline]).map(r => r.map(relative)),
    holes: (surface.holes || []).map(relative), cutouts: (surface.cutouts || []).map(c => ({ ...c, points: c.points.map(relative) })) };
}

/** Fastening may add material features, but never reposition the saved connection. */
export function sameFacePlacement(a,b){
 if(!a?.face||!b?.face||a.to?.module!==b.to?.module||a.to?.output!==b.to?.output||JSON.stringify(a.to?.frame)!==JSON.stringify(b.to?.frame)||a.face.childPart!==b.face.childPart)return false;
 return ['x','y','z'].every(k=>Number.isFinite(a.face.translation?.[k])&&Number.isFinite(b.face.translation?.[k])&&Math.abs(a.face.translation[k]-b.face.translation[k])<1e-6)&&a.face.rotation.every((row,i)=>row.every((v,j)=>Number.isFinite(b.face.rotation?.[i]?.[j])&&Math.abs(v-b.face.rotation[i][j])<1e-6));
}

export function openFaceWizard({ comps, modules, params, childId, exportSettings, stockMm, joint, fabrication, readSource, readPose, isCurrent, commit, say, wizard = false, initialMount = null, startAtPlacement = false, phase = 'combined', dock=null, onPreview=()=>{}, onClose=()=>{}, onStep=()=>{},pickViewer=null,sourceModel=null,assemblyKind=null }) {
  let phaseCandidateAllowed=false;
  if(phase==='fixing'&&!initialMount?.face){say('請先確認這處接合的位置，再設定固定方式。');return;}
  const transaction=createFaceCandidateTransaction({readSource:readSource || (()=>({comps,modules,params,fabrication,exportSettings,stockMm,joint})),readPose:readPose || (()=>({theta:params.theta || 0})),review:confirmMountingChange,commit});
  const child = modules.find(m => m.id === childId);
  if (!child || child.mount || !child.base) { say('請選尚未安裝且有底座的機構。'); return; }
  const surfaces = id => selectableMountSurfaces({ comps, modules, params, moduleId: id, exportSettings, thicknessMm: stockMm, drilling: true });
  // 唯讀機構輪廓隨接合板一起移動，選面時保留完整機構的空間脈絡。
  const parts = id => {
    const own = comps.filter(c => c.moduleId === id), pts = pointCoords(own), result = [];
    for (const s of surfaces(id)) if (s.kind === 'frame') for (const points of s.outlines) result.push({ points, partId:'frame', color: '#8799aa' });
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
      for (const points of rings) result.push({ points, partId:c.id, color: c.color || '#578cab' });
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
  const attachComp = comps.find(c => c.moduleId === childId && c.id === chosenAttach && isFixedMountPart(c));

  const partSurfaces = partId => buildMountSurfaces({ comps, modules, params, moduleId: childId, partId, exportSettings, thicknessMm: stockMm, drilling: true }).surfaces || [];
  const childSurfaces = attachComp ? partSurfaces(attachComp.id) : surfaces(childId);
  const authoredSurface=!childSelection&&comps.filter(c=>c.moduleId===childId&&isFixedMountPart(c)&&c.standardBlank?.kind==='plate').flatMap(c=>partSurfaces(c.id)).find(s=>s.kind==='output');
  const childSurface = authoredSurface || childSurfaces.find(s => attachComp ? s.outputId === 'face-attach' : s.kind === 'frame') || comps.filter(c=>c.moduleId===childId && isFixedMountPart(c)).flatMap(c=>partSurfaces(c.id)).find(s=>s.kind==='output');
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
    return surfaces(m.id).slice().sort((a,b)=>{const preferred=s=>selected?.part==='frame'?s.kind==='frame':s.compId===selected?.part;return Number(preferred(b))-Number(preferred(a)) || Number(a.kind==='frame')-Number(b.kind==='frame');}).flatMap(s => {
      if(s.kind!=='frame')return [s];
      const edge=saved?.host.moduleId===m.id&&saved.host.source.kind==='frame'&&!repairHost?saved.host.edge:s.edges?.[0]?.edge;
      return s.edges?.some(e=>e.edge===edge)?[{...s,frameEdge:edge}]:[];
    })

      .map(s => reference(s, `${m.name} · ${s.name}`, ownParts));
  });
  if (!childSurface || !hosts.length) { say('需要另一個有承接板的機構，以及安裝端的固定底板。'); return; }
  const candidates = [childSurface, surfaces(childId).find(s=>s.kind==='frame'), ...comps.filter(c => c.moduleId === childId && isFixedMountPart(c)).map(c => partSurfaces(c.id).find(s => s.compId === c.id))].filter((s,i,a)=>s && a.findIndex(x=>x?.compId===s.compId && x?.kind===s.kind)===i);
  const childParts=parts(childId);
  const children = candidates.map(s => ({...reference(s, `${child.name} · ${s.kind === 'frame' ? '固定桿／底板' : s.name}`, childParts),partId:s.compId || 'frame',recommended:s.kind==='frame'}));
  for(const c of comps.filter(c=>c.moduleId===childId)) {
    if(children.some(item=>item.partId===c.id))continue;
    const status=installationPartStatus(c,false),label=c.name || `${{bar:'連桿',triangle:'板件',gear:'齒輪',anchor:'固定點',rack:'齒條',slider:'滑軌'}[c.type] || '零件'} ${c.id}`;
    const item=reference(childSurface,`${child.name} · ${label}`,childParts);
    children.push({...item,partName:label,partId:c.id,blockedReason:status.reason});
  }
  const dialog = document.createElement(dock?'section':'dialog');
  dialog.setAttribute('aria-label', '接合預覽');
  dialog.style.cssText = 'width:min(960px,100vw);height:94dvh;max-width:100vw;max-height:100dvh;padding:0;border:0;border-radius:14px;overflow-x:hidden;';
  dialog.className = 'face-wizard-dialog';
  if(dock){dialog.style.cssText='height:100%;min-height:0;display:flex;flex-direction:column;';dock.replaceChildren(dialog);dock.scrollTop=0;}
  const layout = document.createElement('style');
  layout.textContent = `
    body:has(#benchPanel .face-wizard-dialog) #lessonSequenceBtn{display:none}
    @media(max-width:640px){body:has(#benchPanel .face-wizard-dialog) #benchList{display:none}body:has(#benchPanel .face-wizard-dialog) #benchPanel{height:42%;max-height:42%;padding:0;overflow:hidden}}
    .face-wizard-heading{display:none}
    @media(max-width:760px),(max-height:540px) and (orientation:landscape){
      .face-wizard-dialog .face-wizard-bar{display:flex;align-items:center;justify-content:space-between;height:44px;padding-left:12px}
      .face-wizard-dialog .face-wizard-heading{display:block;margin:0;font:600 15px system-ui}
      .face-wizard-dialog .face-wizard-bar button{box-sizing:border-box;margin:0;min-height:44px;padding:4px 12px;font:14px system-ui}
    }`;
  const bar = document.createElement('div'); bar.className = 'face-wizard-bar';
  const heading = document.createElement('h2'); heading.className = 'face-wizard-heading'; heading.textContent = '接合預覽';
  const close = document.createElement('button'); close.textContent = '關閉'; close.setAttribute('aria-label', '關閉組立精靈');
  close.style.cssText = 'height:44px;min-width:64px;float:right;';
  const frame = document.createElement('iframe'); frame.title = '選面與尺寸';
  const loadSession = createLoadSession(LOAD_GRAPH_TOKEN);
  const frameUrl = new URL('../../assembly-wizard-prototype.html', import.meta.url);
  frameUrl.searchParams.set('integrated', '1');
  if(dock)frameUrl.searchParams.set('dock','1');
  frameUrl.searchParams.set('v', APP_VERSION);
  frameUrl.searchParams.set('load', LOAD_GRAPH_TOKEN);
  frame.src = frameUrl.href;
  frame.style.cssText = 'width:100%;height:calc(100% - 44px);border:0;display:block;';
  if(dock){bar.style.display='none';frame.style.cssText='width:100%;height:100%;min-height:0;flex:1;border:0;display:block;';}
  bar.append(heading, close); dialog.append(layout, bar, frame); if(!dock)document.body.append(dialog);
  let diagnosticHighlight=false,disposed=false,previewStep=startAtPlacement?3:0,stepSelection=null,tap=null,relationTask=null,activeModel=sourceModel,activeCandidate=null;
  const canvas=pickViewer?.canvas;
  function syncPickFocus(){
   const endpoint=relationTask?.endpoint,item=endpoint&&(endpoint==='host'?hosts:children)[stepSelection?.[endpoint]];
   const part=item&&activeModel?.materialParts?.find(p=>matchesSurfacePart(item.surface,p));
   pickViewer?.setSurfacePickFocus?.(part?.pickKey || null);
  }
  const edgeOverlay=dock&&canvas?createFaceEdgeOverlay(pickViewer,picked=>frame.contentWindow.postMessage({type:'face-wizard-edge-picked',...picked},location.origin)):null;
  const down=e=>{tap=e.isPrimary!==false?{id:e.pointerId,x:e.clientX,y:e.clientY}:null;};
  const move=e=>{if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>6)tap=null;};
  const cancelTap=()=>{tap=null;};
  const up=e=>{const start=tap;tap=null;if(!start||start.id!==e.pointerId||(![1,2].includes(previewStep)&&!relationTask)||!stepSelection)return;
   const endpoint=relationTask?.endpoint || (previewStep===1?'host':'child'),hit=pickViewer.pickSurface(e.clientX,e.clientY),part=(relationTask?activeModel:sourceModel)?.materialParts?.find(p=>p.pickKey===hit?.key),items=endpoint==='host'?hosts:children;
   const index=items.findIndex(item=>!item.blockedReason&&matchesSurfacePart(item.surface,part)),item=items[index];
   if(!part||!item||relationTask&&index!==stepSelection[endpoint])return;
   const m=part.pose.matrix,n=hit.normal,world=[m[0]*n.x+m[4]*n.y+m[8]*n.z,m[1]*n.x+m[5]*n.y+m[9]*n.z,m[2]*n.x+m[6]*n.y+m[10]*n.z];
   let axes=placedModuleAxes({comps,modules,params},item.surface.moduleId);
   if(relationTask&&activeCandidate?.model){const origin=candidateSurfacePoint(activeCandidate,{x:0,y:0,z:0},endpoint);if(origin)axes=['x','y','z'].map(k=>{const p=candidateSurfacePoint(activeCandidate,{x:0,y:0,z:0,[k]:1},endpoint);return [p.x-origin.x,p.y-origin.y,p.z-origin.z];});}
   const local=axes.map(a=>a.reduce((s,v,i)=>s+v*world[i],0));
   const faces=boxFaces(item.surface.box),face=faces.slice().sort((a,b)=>{const score=f=>f.n.x*local[0]+f.n.y*local[1]+f.n.z*local[2];return score(b)-score(a);})[0];
   if(face){pickViewer.highlightSurface(hit);frame.contentWindow.postMessage(relationTask?{type:'face-wizard-relation-picked',face:face.id}:{type:'face-wizard-pick',field:previewStep===1?'hostFace':'childFace',endpointIndex:index,face:face.id},location.origin);}
  };
  if(dock&&canvas){canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancelTap);}
  const dispose = () => {if(disposed)return;disposed=true;if(diagnosticHighlight){pickViewer?.setHighlight?.([]);pickViewer?.setCollisionLocations?.([]);}transaction.cancel();edgeOverlay?.dispose();pickViewer?.setSurfacePickFocus?.(null);window.removeEventListener('message', receive);if(canvas){canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancelTap);pickViewer.highlightSurface(null);}dialog.remove();onClose();};
  const shut=()=>{if(dock)dispose();else dialog.close();};
  close.textContent=dock?'取消接合':'關閉';close.addEventListener('click', shut); dialog.addEventListener('close', dispose);
  async function receive(e) {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data?.type === 'face-wizard-cancel') { shut(); return; }
    if(e.data?.type==='face-wizard-highlight'&&loadSession.allowConfirm(e.data.loadGraph)){const keys=e.data.pickKeys;if(Array.isArray(keys)){diagnosticHighlight=true;pickViewer?.setHighlight?.([]);pickViewer?.setCollisionLocations?.((activeCandidate?.validation?.material?.findings || []).filter(f=>f.pickKeys?.some(k=>keys.includes(k))));}return;}
    if(e.data?.type==='face-wizard-relation-request'){if(phase==='fixing')return;if(loadSession.allowConfirm(e.data.loadGraph)){const task=e.data.task;if(Number.isInteger(task?.focusRelation)&&task.focusRelation>=0)edgeOverlay?.focusRelation(task.focusRelation);else{relationTask=task&&['host','child'].includes(task.endpoint)?task:null;pickViewer?.highlightSurface?.(null);syncPickFocus();}}return;}
    if(e.data?.type==='face-wizard-edge-request'){const task=e.data.task;if(loadSession.allowConfirm(e.data.loadGraph)&&previewStep===3)edgeOverlay?.pick(task&&['host','child'].includes(task.endpoint)&&['top','bottom','front','back','left','right'].includes(task.face)?task:null);return;}
    if(e.data?.type==='face-wizard-step'){if(loadSession.allowConfirm(e.data.loadGraph)&&Number.isInteger(e.data.step)&&e.data.step>=0&&e.data.step<=3){previewStep=e.data.step;stepSelection=e.data;if(previewStep!==3)edgeOverlay?.clear();else edgeOverlay?.showFaces(true);onStep(e.data);}return;}
    const rejectLoad = () => {
      say(LOAD_MISMATCH_MESSAGE);
      frame.contentWindow.postMessage({type:'face-wizard-error',loadMismatch:true,reason:LOAD_MISMATCH_MESSAGE},location.origin);
    };
    if (e.data?.type === 'face-wizard-ready') {
      if (!loadSession.receiveReady(e.data.loadGraph)) { rejectLoad(); return; }
      const childAxes=placedModuleAxes({comps,modules,params},childId);
      const oriented=hosts.map(h=>({...h,placementPlane:placedModuleAxes({comps,modules,params},h.surface.moduleId),defaultFace:matchesSaved(h.surface)?saved.host.face:connectionSelection(modules.find(m=>m.id===h.surface.moduleId),'host')?.face || 'top'}));
      const direction=placedFaceSelection(oriented[0].placementPlane,childAxes);
      frame.contentWindow.postMessage({ type: 'face-wizard-init', assemblyKind, phase, sourceRevision:transaction.snapshot().sourceRevision, joint, loadGraph: LOAD_GRAPH_TOKEN, startAtPlacement: startAtPlacement && !needsChoice, hosts:oriented, children:children.map(c=>({...c,placementPlane:childAxes})), childConfirmed:!!saved, configured: !!childSelection && !needsChoice, mode: wizard || needsChoice || matchMedia('(max-width: 760px)').matches ? 'wizard' : 'work', selection: initialMount?.face?.selection || (modules.some(m=>m.placementPlane)?direction:{ hostFace: connectionSelection(modules.find(m => m.id === hosts[0].surface.moduleId), 'host')?.face || 'top', childFace: childSelection?.face || 'bottom' }), host: hosts.findIndex(h => h.surface.moduleId === initialMount?.to?.module && (initialMount?.to?.frame ? h.surface.frameEdge === initialMount.to.frame.edge : h.surface.outputId === initialMount?.to?.output && h.surface.kind === 'output')) }, location.origin);
    }
    if(!['face-wizard-preview','face-wizard-confirm'].includes(e.data?.type))return;
    if(!loadSession.allowConfirm(e.data.loadGraph)){rejectLoad();return;}
    if(isCurrent&&!isCurrent()){frame.contentWindow.postMessage({type:'face-wizard-error',reason:'作品已變動，請重新開啟接合。'},location.origin);return;}
    if(e.data.type==='face-wizard-preview'){
      phaseCandidateAllowed=false;
      const selection=e.data.selection;
      if(phase==='position'&&(selection?.brackets||selection?.fastener)){frame.contentWindow.postMessage({type:'face-wizard-error',reason:'請先確認定位，固定方式在下一步個別設定。'},location.origin);return;}
      if(!selection||!Number.isInteger(selection.host)||!hosts[selection.host]||!Number.isInteger(selection.child)||!children[selection.child])return;
      if(children[selection.child].blockedReason){frame.contentWindow.postMessage({type:'face-wizard-error',reason:children[selection.child].blockedReason},location.origin);return;}
      const host=hosts[selection.host].surface,selectedChild=children[selection.child].surface;
      const result=await transaction.preview({childId,reselect:!!initialMount,selection,hostEndpoint:{moduleId:host.moduleId,outputId:host.outputId,frameEdge:host.frameEdge,partId:host.compId},childEndpoint:{partId:selectedChild.compId || 'frame'}});
      if(transaction.snapshot().closed)return;
      if(assemblyKind==='vertical'&&!initialMount&&result.ok&&Math.abs(result.work.modules.find(m=>m.id===childId).mount.face.rotation[2][2])>1e-6){frame.contentWindow.postMessage({type:'face-wizard-error',reason:'垂直接合請選板面與另一片板的側面；平行請使用插銷。'},location.origin);return;}
      if(phase==='fixing'&&result.work&&!sameFacePlacement(initialMount,result.work.modules.find(m=>m.id===childId)?.mount)){frame.contentWindow.postMessage({type:'face-wizard-error',reason:'這個固定方式會改變已確認的位置；請取消，先修改定位。'},location.origin);return;}
      phaseCandidateAllowed=!!result.saveable;
      if(dock&&previewStep===3)onPreview(result);
      activeModel=result.model || sourceModel;
      activeCandidate=result;
      syncPickFocus();
      edgeOverlay?.setCandidate(result);
      // Docked controls need validation and labels, not a second clone of the 3D scene.
      const {model,displayWork,hostSurface,childSurface,hostReference,childReference,placement,...controls}=result;
      const feedback=dock?controls:result;
      frame.contentWindow.postMessage({type:'face-wizard-preview-result',requestId:e.data.requestId,loadGraph:LOAD_GRAPH_TOKEN,candidate:feedback},location.origin);return;
    }
    if(phase!=='combined'&&!phaseCandidateAllowed){frame.contentWindow.postMessage({type:'face-wizard-error',reason:'請等待本步驟的候選驗證通過。'},location.origin);return;}
    const result=await transaction.confirm({candidateId:e.data.candidateId,selectionRevision:e.data.selectionRevision});
    if(result.ok)shut();
    else frame.contentWindow.postMessage({type:'face-wizard-error',reason:result.reason},location.origin);
  }
  window.addEventListener('message', receive); if(!dock)dialog.showModal();
  return {cancel:shut};
}
