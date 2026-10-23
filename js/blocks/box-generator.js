import {BOX_DEFAULTS,BOX_ROLES,BOX_NAMES,normalizeBoxSettings,boxPanelSize} from './box-config.js';
import {TAB_NUT_DEFAULTS} from './tab-nut-geometry.js';
import {buildFaceCandidate,validateFaceCandidate} from './face-candidate.js';

export {BOX_DEFAULTS};
/** Build five named panels and four ordinary face-v2 connections in isolated data. */
export function buildBox(settings=BOX_DEFAULTS,{ids={},origin={x:0,y:0}}={}){
 const p=normalizeBoxSettings(settings);if(!p)return {ok:false,reason:'請輸入有效尺寸：內長／寬 60–400、高 25–120、板厚 2.5–3.5 mm。'};
 const rootPart=ids.base?.part || 'BoxBase';
 let work={kind:'blocks',v:1,counter:10,comps:[],modules:[],params:{},stockMm:p.thicknessMm,exportSettings:{holeDiameterMm:3.4}};
 for(const role of BOX_ROLES){
  const identity=ids[role] || {},part=identity.part || `Box${role}`,mod=identity.module || `BoxMod${role}`;
  const boxPanel={v:1,role,rootPart,settings:{...p}},size=boxPanelSize(boxPanel),x=origin.x-size.length/2,y=origin.y;
  const p1={id:identity.p1 || `${part}A`,type:'fixed',x,y},p2={id:identity.p2 || `${part}B`,type:'fixed',x:x+size.length,y};
  const comp={type:'bar',id:role==='base'?rootPart:part,moduleId:mod,p1,p2,lenParam:identity.param || `${part}Length`,fixedLen:true,frameSeparate:true,color:role==='base'?'#3498db':'#e79a45',boxPanel,stock:{widthMm:size.width,thicknessMm:p.thicknessMm,material:'unspecified'}};
  work.comps.push(comp);work.params[comp.lenParam]=size.length;
  work.modules.push({id:mod,name:role==='base'?'卡榫盒子・底板':BOX_NAMES[role],base:p1.id,outputs:[{id:'panel',name:BOX_NAMES[role],at:p1.id,body:{kind:'bar',id:comp.id}}],mount:null});
 }
 const base=work.comps[0],t=p.thicknessMm;
 const offsets={front:[0,(p.widthMm+t)/2,0],back:[0,-(p.widthMm+t)/2,2],left:[-(p.lengthMm+t)/2,0,1],right:[(p.lengthMm+t)/2,0,3]};
 let candidate;
 for(const role of BOX_ROLES.slice(1)){
  const child=work.comps.find(c=>c.boxPanel.role===role),[offsetU,offsetV,quarterTurns]=offsets[role];
  candidate=buildFaceCandidate(work,{childId:child.moduleId,hostEndpoint:{moduleId:base.moduleId,outputId:'panel',partId:base.id},childEndpoint:{partId:child.id},selection:{hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU,offsetV,gap:0,quarterTurns,fastener:{...TAB_NUT_DEFAULTS,tabWidthMm:p.tabWidthMm,tabPitchMm:p.tabPitchMm,slotClearanceMm:p.clearanceMm,screwLengthMm:p.screwLengthMm}}});
  if(!candidate.ok)return candidate;
  work={...candidate.work};
 }
 return {...candidate,settings:p,rootPart,work};
}
export async function checkedBox(settings,options){const built=buildBox(settings,options);return built.ok?validateFaceCandidate(built):built;}

export function boxesInWork(work){
 return work.comps.filter(c=>c.boxPanel?.role==='base'&&c.boxPanel.rootPart===c.id).map(c=>({id:c.id,name:(work.modules || []).find(m=>m.id===c.moduleId)?.name || '卡榫盒子',settings:c.boxPanel.settings,moduleId:c.moduleId}));
}
