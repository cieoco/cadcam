import {S,motorAnglesNow} from './state.js';
import * as Settings from './settings.js';
import {assemblyWork,mergeAssemblyWork} from './assembly-membership.js';
/** Lazy session wiring shared by both assembly paths. */
export async function openBenchConnection(h,mod,reselect,startAtPlacement,kind){
 const {deps,viewer,push3D,pushUndo,rebuild,draw,syncUI,say,panelEl,close}=h;
 const parallel=kind==='parallel'||!!mod.mount?.face?.selection?.pin;
 if(parallel)await (await import('../blocks3d/assembly-pin-runtime.js')).loadAssemblyPinScene();
 const open=parallel?(await import('./parallel-pin-ui.js')).openParallelPin:(await import('./face-wizard-ui.js')).openFaceWizard;
 if(!h.current())return null;deps.pause?.();
 const readSource=()=>({...assemblyWork(S.comps,S.modules,S.topo),topo:S.topo,params:S.topo.params,fabrication:S.fabrication,exportSettings:Settings.exportSettings(),stockMm:Number(S.fabrication?.cnc?.stockThicknessMm)||3,joint:S.fabrication?.joint});
 const active=readSource(),modules=reselect?active.modules.map(m=>m.id===mod.id?{...m,mount:null}:m):active.modules;let shown=false;
 const session=open({...active,modules,childId:mod.id,wizard:true,displayName:h.displayName,assemblyKind:kind || (reselect?null:'vertical'),dock:panelEl(),pickViewer:viewer(),sourceModel:h.model(),
  onPreview:r=>{shown=!!r.model;viewer()?.highlightSurface?.(null);deps.faceWizardState?.(true,r.model?{...r.model,collisionFindings:r.validation?.material?.findings || []}:null);if(!r.model)push3D();},
  onStep:m=>{if(m.step!==3){deps.faceWizardState?.(true);if(shown){shown=false;push3D();}}},
  onClose:close,initialMount:reselect?mod.mount:null,startAtPlacement,phase:startAtPlacement?'fixing':'position',
  readSource,readPose:()=>deps.connectionPose?.() || ({theta:S.theta,motorAngles:motorAnglesNow()}),say,
  commit:(result,validation,candidate)=>{const next=mergeAssemblyWork(S.comps,S.modules,S.topo,structuredClone(result));pushUndo();S.comps=next.comps;S.modules=next.modules;S.topo=next.topo;rebuild({save:false});deps.adoptConnectionPose?.(candidate.points);draw();deps.scheduleAutosave?.();
   const s=result.modules.find(m=>m.id===mod.id)?.mount?.face?.selection;
   say(s?.pin?'已放入插銷；孔徑、長度與實物配合仍需核對。':s?.fastener?'已接上，榫槽與 M3 五金已生成；實物試切待驗證。':s?.brackets?(validation?.status==='fail'?'已接上（有干涉），角碼固定孔已生成；請調整作品。':'已接上，角碼固定孔已生成；部分五金仍未檢查。'):'已確認定位；可稍後為這處接合設定固定方式。');syncUI(true);}
 });
 if(session)deps.faceWizardState?.(true);return session;
}
