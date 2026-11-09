import {BLANK_HOLE_LIMIT} from './standard-blank.js';
import {syringePositionOnFrame} from './syringe-position.js';
import {planActuatorPlateHoles} from './actuator-plate-holes.js';
import {syringeClampFrameNodes} from './syringe-shape.js';
// Isolated installation candidates. Geometry and full-stroke checks reuse the
// existing syringe operations; only the UI's confirm action changes the work.
import {placeFixedSyringe,placePivotSyringe,isFixedFrame} from './syringe-placement.js';
import {holeSide} from '../core/local-holes.js';
import {SYRINGE_EAR_MM,attachmentFrame,attachmentPoint} from '../core/syringe.js';
import {solveSyringe} from './syringe-operations.js';

export function installationChoices(comps,params){
 const frames=comps.filter(c=>isFixedFrame(c,comps)&&attachmentFrame(c,params));
 const rods=comps.filter(c=>['bar','triangle'].includes(c.type)&&!isFixedFrame(c,comps));
 return {frames,rods};
}
// 推桿孔預查：只看零件怎麼接（不求解），與固定環距離有關的失敗留到 ③ 調位置。
export function outputHoleModes(comps,params,frameId,b){
 return Object.fromEntries(Object.entries(outputHoleChecks(comps,params,frameId,b)).map(([mode,r])=>[mode,!!r.ok||r.reason==='distance']));
}
export function outputHoleChecks(comps,params,frameId,b){
 const a={componentId:frameId,u:0,v:0};
 return {'fixed-axis':placeFixedSyringe(comps,params,null,a,b),pivot:placePivotSyringe(comps,params,null,a,b)};
}
export function planSyringeInstallation(source,request,points=null,motion={}){
 let comps=structuredClone(source.comps),params={...source.params};
 const old=request.id?comps.find(c=>c.id===request.id&&c.type==='syringe'):null;
 const mode=request.mountMode ?? old?.mountMode ?? 'fixed-axis';
 if(!['fixed-axis','pivot'].includes(mode))return {ok:false,message:'請選固定安裝或可轉安裝。'};
 const {a,b,face='front',spacerMm=null,extension=old?.extension??10}=request;
 if(!a||!b)return {ok:false,message:'請選機架與短連桿端孔。'};
 const host=source.comps.find(c=>c.id===a.componentId),at=attachmentPoint(a,source.comps,source.params,points),bounded=at&&syringePositionOnFrame(host,source.params,points,at,source);
 if(!bounded||Math.hypot(at.x-bounded.x,at.y-bounded.y)>1e-6)return {ok:false,message:'固定位置超出所選承載板，請移回板內。'};
 if(!['front','back'].includes(face)||spacerMm!==null&&(!Number.isFinite(spacerMm)||spacerMm<0||spacerMm>100))return {ok:false,message:'套筒長度需為 0–100 mm，或選自動對齊。'};
 const changed=!old||mode!==old.mountMode||JSON.stringify(a)!==JSON.stringify(old.a)||JSON.stringify(b)!==JSON.stringify(old.b);
 let next=old?structuredClone(old):null;
 if(changed){
  // Calibrate at the original pose once; changing the trial extension must
  // not subtract the same value from Lmin and freeze the output in place.
  const placed=(mode==='pivot'?placePivotSyringe:placeFixedSyringe)(comps,params,points,a,b,{extension:old?.extension ?? 10,pivotEar:request.pivotEar ?? old?.pivotEar});
  if(!placed.ok)return placed;
  next=old?{...next,a:placed.syringe.a,b:placed.syringe.b,axisDeg:placed.syringe.axisDeg,outputId:placed.syringe.outputId,
   ...(mode==='pivot'?{pivotEar:placed.syringe.pivotEar}:{}),spec:{...next.spec,lmin:placed.syringe.spec.lmin,calibrated:false}}:placed.syringe;
 }
 next.mountMode=mode;
 if(mode==='pivot'){delete next.axisDeg;delete next.outputId;delete next.jawIds;delete next.passiveTips;next.pivotEar=(request.pivotEar ?? next.pivotEar)===-1?-1:1;}else delete next.pivotEar;
 if(!old&&request.newId)next.id=request.newId;
 if(!old){const moduleId=comps.find(c=>c.id===a.componentId)?.moduleId;if(moduleId)next.moduleId=moduleId;}
 next.extension=extension;next.installation={face,spacerMm,...(old?.installation?.barrelOffsetMm!==undefined?{barrelOffsetMm:old.installation.barrelOffsetMm}:{}),...(request.barrelOffsetMm!==undefined?{barrelOffsetMm:request.barrelOffsetMm}:{})};
 if(request.spec)next.spec={...next.spec,...request.spec,calibrated:false};
 if(mode==='fixed-axis'&&request.axisDeg!==undefined)next.axisDeg=request.axisDeg;
 const index=comps.findIndex(c=>c.id===next.id);if(index<0)comps.push(next);else comps[index]=next;
 let result=solveSyringe(comps,params,points,motion);
 // 沒指定鎖哪一耳時，預設取能解出完整行程的那一耳。
 if(mode==='pivot'&&request.pivotEar===undefined&&!result.ok){
  const other={...next,pivotEar:-next.pivotEar},alt=comps.map(c=>c.id===next.id?other:c),retry=solveSyringe(alt,params,points,motion);
  if(retry.ok){comps.splice(0,comps.length,...alt);next=other;result=retry;}
 }
 if(result.ok){
  if(request.keepOldHoles&&old){const host=comps.find(c=>c.id===old.a.componentId),f=attachmentFrame(host,params);if(!host?.standardBlank||!f)return {ok:false,message:'保留已鑽孔目前需使用標準板材或桿件。'};
   const nodes=syringeClampFrameNodes(source.comps.filter(c=>c.type!=='syringe'||c.id===old.id),[host.p1,host.p2,host.p3].filter(Boolean));
   host.holes??=[];
   for(const n of nodes){const dx=n.x-f.p.x,dy=n.y-f.p.y,u=dx*f.x+dy*f.y,v=(-dx*f.y+dy*f.x)*holeSide(host);const found=[...host.holes,...(host.standardBlank.mountHoles||[])].find(h=>Math.hypot(h.u-u,h.v-v)<.001);if(found){found.manufactured=true;found.diameter=n.holeDiameterMm;}else{let i=1;const ids=new Set(comps.flatMap(c=>[c.p1,c.p2,c.p3,...(c.holes||[]),...(c.standardBlank?.mountHoles||[])]).filter(Boolean).map(h=>h.id));while(ids.has(`${old.id}_drilled_${i}`))i++;host.holes.push({id:`${old.id}_drilled_${i}`,u,v,diameter:n.holeDiameterMm,type:'floating',manufactured:true});}}
   if(host.holes.length+(host.standardBlank.mountHoles?.length||0)>BLANK_HOLE_LIMIT)return {ok:false,message:`保留舊孔後超過${BLANK_HOLE_LIMIT}孔，請先整理板件。`};
  }
  const holes=planActuatorPlateHoles({...source,comps,params});if(!holes.ok)return holes;comps=holes.comps;next=comps.find(c=>c.id===next.id);
 }
 return {...result,comps,params,syringe:next};
}

// Placement is visual only until a real fixed frame has been selected.
// Never manufacture a hidden ground constraint to make a loose actuator move.
export function planPlacedSyringe(source,request,points=null,motion={}){
 const pos=request.position;
 if(!pos||![pos.x,pos.y,request.axisDeg].every(Number.isFinite))return {ok:false,message:'請放置針筒並設定方向角度。'};
 const draft=structuredClone(source),owner=draft.comps.find(c=>c.id===request.frameId);
 let a,temporary=false;
 if(owner){
  const f=attachmentFrame(owner,draft.params,points);
  if(!f||!isFixedFrame(owner,draft.comps))return {ok:false,message:'請選固定機架。'};
  const q=syringePositionOnFrame(owner,draft.params,points,pos,source);
  if(!q||Math.hypot(q.x-pos.x,q.y-pos.y)>1e-6)return {ok:false,message:'固定位置超出所選承載板，請移回板內。'};
  const dx=pos.x-f.p.x,dy=pos.y-f.p.y;
  a={componentId:owner.id,u:dx*f.x+dy*f.y,v:-dx*f.y+dy*f.x};
  for(const k of ['u','v'])if(Math.abs(a[k])<1e-6)a[k]=0;
  if(Math.abs(a.u-f.length)<1e-6)a.u=f.length;
 }else return {ok:false,temporary:true,reasonCode:'unmounted',message:'針筒尚未固定，不能帶動機構；請先選擇固定機架。'};

 const old=source.comps.find(c=>c.id===request.id),oldPoint=old&&attachmentPoint(old.a,source.comps,source.params,points);
 const spec=oldPoint&&Math.hypot(pos.x-oldPoint.x,pos.y-oldPoint.y)<1e-6?{lmin:old.spec.lmin,...request.spec}:request.spec;
 const result=planSyringeInstallation(draft,{...request,a,spec},points,motion);
 return {...result,temporary};
}

// Installation adjustment only: retain foot 0, then lock both ears at the new angle.
export function fixedEarRotation(c,source,points,angle){
 const center=attachmentPoint(c.a,source.comps,source.params,points);
 if(!center||c.mountMode!=='fixed-axis'||!Number.isFinite(angle))return null;
 return rotateClampAboutEar(center,c.axisDeg,angle);
}
export function rotateClampAboutEar(center,oldAngle,angle){
 const old=oldAngle*Math.PI/180,next=angle*Math.PI/180;
 const ear={x:center.x+SYRINGE_EAR_MM*Math.sin(old),y:center.y-SYRINGE_EAR_MM*Math.cos(old)};
 return {position:{x:ear.x-SYRINGE_EAR_MM*Math.sin(next),y:ear.y+SYRINGE_EAR_MM*Math.cos(next)},axisDeg:angle,ear};
}
