import {BOX_DEFAULTS,BOX_ROLES,BOX_NAMES,normalizeBoxSettings,boxPanelSize,boxJointLayout} from './box-config.js';
import {TAB_NUT_DEFAULTS} from '../../blocks/tab-nut-geometry.js';
import {buildFaceCandidate,validateFaceCandidate,centeredFaceSurface} from '../../blocks/face-candidate.js';
import {buildMountSurfaces} from '../../blocks/mount-surfaces.js';
import {buildFacePlacement} from '../../blocks/face-placement.js';
import {tabNutPlans} from '../../blocks/tab-nut-plan.js';

export {BOX_DEFAULTS};
const SIDES=BOX_ROLES.slice(1),BAD='請輸入有效尺寸：內長／寬 60–400、高 25–120、板厚 2.5–3.5 mm。';
/** Panels present in build order: base, selected sides, optional lid. */
export const boxRoles=p=>['base',...SIDES.filter(r=>p.panels[r]),...(p.panels.lid?['lid']:[])];
/** Total M3 sets for the current panels (each side joins the base, and the lid when present). */
export function boxScrewCount(settings){
 const p=normalizeBoxSettings(settings);if(!p)return 0;
 const L=boxJointLayout(p);return SIDES.filter(r=>p.panels[r]).reduce((n,r)=>n+L[r].sets*(p.panels.lid?2:1),0);
}
/** One-line description of the joint counts, e.g. 前後各 2、左右各 1。 */
export function boxJointSummary(settings){
 const p=normalizeBoxSettings(settings);if(!p)return '';
 const L=boxJointLayout(p),part=(a,b,name)=>{const on=[a,b].filter(r=>p.panels[r]),k=on.map(r=>L[r].sets);return on.length===2&&k[0]===k[1]?`${name}各 ${k[0]}`:on.map((r,i)=>`${BOX_NAMES[r][0]} ${k[i]}`).join('、');};
 const text=[part('front','back','前後'),part('left','right','左右')].filter(Boolean).join('、');
 return `每邊組數：${text}，共 ${boxScrewCount(p)} 顆 M3`;
}
/** A joint count that cannot fit gives a plain reason instead of a broken outline. */
function jointProblem(p){
 const L=boxJointLayout(p),pair=p.tabPitchMm+p.tabWidthMm+p.clearanceMm+TAB_NUT_DEFAULTS.minWebMm;
 for(const r of SIDES.filter(r=>p.panels[r])){
  const e=L[r],span=e.edgeLengthMm-2*p.jointEndMarginMm;
  if(e.sets>6)return `${BOX_NAMES[r]}需要 ${e.sets} 組卡榫，超過上限 6 組。請加大最大間距。`;
  if(e.sets>1&&span/e.sets<pair)return `${BOX_NAMES[r]}的邊太短，放不下 ${e.sets} 組卡榫（每組至少 ${Math.ceil(pair)} mm）。請減少組數或縮小榫距。`;
  if(span<=0)return `${BOX_NAMES[r]}的邊太短，離角留料 ${p.jointEndMarginMm} mm 後放不下卡榫組數。`;
 }
 return '';
}
const fixed=v=>Math.round(v*1e6)/1e6;
/** Build panels and face-v2 connections in isolated data. The lid is posed on one side; its fastener record is only a marker, the real joints are the closure joints stored on the lid and planned for every side. */
export function buildBox(settings=BOX_DEFAULTS,{ids={},origin={x:0,y:0}}={}){
 const p=normalizeBoxSettings(settings);if(!p)return {ok:false,reason:BAD};
 if(!SIDES.some(r=>p.panels[r]))return {ok:false,reason:'至少要留一片側板，上蓋或底板才有地方固定。'};
 const problem=jointProblem(p);if(problem)return {ok:false,reason:problem};
 const rootPart=ids.base?.part || 'BoxBase',roles=boxRoles(p),L=boxJointLayout(p);
 let work={kind:'blocks',v:1,counter:10,comps:[],modules:[],params:{},stockMm:p.thicknessMm,exportSettings:{holeDiameterMm:3.4}};
 for(const role of roles){
  const identity=ids[role] || {},part=identity.part || `Box${role}`,mod=identity.module || `BoxMod${role}`;
  const boxPanel={v:1,role,rootPart,settings:{...p,panels:{...p.panels}}},size=boxPanelSize(boxPanel),x=origin.x-size.length/2,y=origin.y;
  const p1={id:identity.p1 || `${part}A`,type:'fixed',x,y},p2={id:identity.p2 || `${part}B`,type:'fixed',x:x+size.length,y};
  const comp={type:'bar',id:role==='base'?rootPart:part,moduleId:mod,p1,p2,lenParam:identity.param || `${part}Length`,fixedLen:true,frameSeparate:true,color:role==='base'?'#3498db':role==='lid'?'#8fbf6a':'#e79a45',boxPanel,stock:{widthMm:size.width,thicknessMm:p.thicknessMm,material:'unspecified'}};
  work.comps.push(comp);work.params[comp.lenParam]=size.length;
  work.modules.push({id:mod,name:role==='base'?'卡榫盒子・底板':BOX_NAMES[role],base:p1.id,outputs:[{id:'panel',name:BOX_NAMES[role],at:p1.id,body:{kind:'bar',id:comp.id}}],mount:null});
 }
 const byRole=(w,role)=>w.comps.find(c=>c.boxPanel.role===role),base=work.comps[0],t=p.thicknessMm;
 const fastener=role=>{const e=L[role],at=e.centersMm.map(c=>fixed(c-e.edgeLengthMm/2));return {...TAB_NUT_DEFAULTS,tabWidthMm:p.tabWidthMm,tabPitchMm:p.tabPitchMm,slotClearanceMm:p.clearanceMm,screwLengthMm:p.screwLengthMm,alongMm:at[0],...(at.length>1?{moreAlongMm:at.slice(1)}:{})};};
 const offsets={front:[0,(p.widthMm+t)/2,0],back:[0,-(p.widthMm+t)/2,2],left:[-(p.lengthMm+t)/2,0,1],right:[(p.lengthMm+t)/2,0,3]};
 let candidate;
 for(const role of roles.filter(r=>r!=='base'&&r!=='lid')){
  const child=byRole(work,role),[offsetU,offsetV,quarterTurns]=offsets[role];
  candidate=buildFaceCandidate(work,{childId:child.moduleId,hostEndpoint:{moduleId:base.moduleId,outputId:'panel',partId:base.id},childEndpoint:{partId:child.id},selection:{hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU,offsetV,gap:0,quarterTurns,fastener:fastener(role)}});
  if(!candidate.ok)return candidate;
  work={...candidate.work};
 }
 if(p.panels.lid){
  const lid=byRole(work,'lid'),sides=roles.filter(r=>SIDES.includes(r)),closures={},surface=(c)=>buildMountSurfaces({comps:work.comps,modules:work.modules,params:work.params,exportSettings:work.exportSettings,thicknessMm:t,drilling:true,moduleId:c.moduleId,partId:c.id}).surfaces?.find(s=>s.compId===c.id);
  // Lid underside seen from the lid: the same sides, mirrored front/back, joined at their top edges.
  const up={front:[0,-(p.widthMm+t)/2,2],back:[0,(p.widthMm+t)/2,0],left:offsets.left,right:offsets.right};
  const lidSurface=surface(lid);
  for(const role of sides){
   const side=byRole(work,role),sideSurface=surface(side),[offsetU,offsetV,quarterTurns]=up[role];
   const placed=buildFacePlacement({host:centeredFaceSurface(lidSurface),child:centeredFaceSurface(sideSurface),selection:{hostFace:'bottom',childFace:'front',alignU:0,alignV:0,offsetU,offsetV,gap:0,quarterTurns,fastener:fastener(role)}});
   if(!placed.ok)return {ok:false,reason:placed.reason};
   closures[role]={version:2,childPart:side.id,...placed.record.transform,selection:placed.record.selection,hostThicknessMm:t,childThicknessMm:t};
  }
  work={...work,comps:work.comps.map(c=>c===lid?{...c,boxPanel:{...c.boxPanel,closures}}:c)};
  const host=byRole(work,sides[0]),[,,quarterTurns]=up[sides[0]],lift=['front','back'].includes(sides[0])?(p.widthMm+t)/2:(p.lengthMm+t)/2;
  candidate=buildFaceCandidate(work,{childId:lid.moduleId,hostEndpoint:{moduleId:host.moduleId,outputId:'panel',partId:host.id},childEndpoint:{partId:lid.id},selection:{hostFace:'front',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:lift,gap:0,quarterTurns,fastener:fastener(sides[0])}});
  if(!candidate.ok)return candidate;
  work={...candidate.work};
 }
 const bad=tabNutPlans(work.comps,work.modules,work.params,{stockMm:t,exportSettings:work.exportSettings}).find(q=>!q.ok);
 if(bad)return {ok:false,reason:bad.reason};
 return {...candidate,settings:p,rootPart,work};
}
export async function checkedBox(settings,options){const built=buildBox(settings,options);return built.ok?validateFaceCandidate(built):built;}

export function boxesInWork(work){
 return work.comps.filter(c=>c.boxPanel?.role==='base'&&c.boxPanel.rootPart===c.id).map(c=>({id:c.id,name:(work.modules || []).find(m=>m.id===c.moduleId)?.name || '卡榫盒子',settings:c.boxPanel.settings,moduleId:c.moduleId}));
}
