// Isolated installation candidates. Geometry and full-stroke checks reuse the
// existing syringe operations; only the UI's confirm action changes the work.
import {placeFixedSyringe,isFixedFrame} from './syringe-placement.js';
import {attachmentFrame,attachmentPoint} from '../core/syringe.js';
import {solveSyringe} from './syringe-operations.js';

export function installationChoices(comps,params){
 const frames=comps.filter(c=>isFixedFrame(c,comps)&&attachmentFrame(c,params));
 const rods=comps.filter(c=>c.type==='bar'&&!isFixedFrame(c,comps));
 return {frames,rods};
}
export function planSyringeInstallation(source,request,points=null,motion={}){
 const comps=structuredClone(source.comps),params={...source.params};
 const old=request.id?comps.find(c=>c.id===request.id&&c.type==='syringe'):null;
 const {a,b,face='front',spacerMm=null,extension=old?.extension??10}=request;
 if(!a||!b)return {ok:false,message:'請選機架與短連桿端孔。'};
 if(!['front','back'].includes(face)||spacerMm!==null&&(!Number.isFinite(spacerMm)||spacerMm<0||spacerMm>100))return {ok:false,message:'套筒長度需為 0–100 mm，或選自動對齊。'};
 const changed=!old||JSON.stringify(a)!==JSON.stringify(old.a)||JSON.stringify(b)!==JSON.stringify(old.b);
 let next=old?structuredClone(old):null;
 if(changed){
  // Calibrate at the original pose once; changing the trial extension must
  // not subtract the same value from Lmin and freeze the output in place.
  const placed=placeFixedSyringe(comps,params,points,a,b,{extension:old?.extension ?? 10});
  if(!placed.ok)return placed;
  next=old?{...next,a:placed.syringe.a,b:placed.syringe.b,axisDeg:placed.syringe.axisDeg,outputId:placed.syringe.outputId,
   spec:{...next.spec,lmin:placed.syringe.spec.lmin,calibrated:false}}:placed.syringe;
 }
 if(!old&&request.newId)next.id=request.newId;
 if(!old){const moduleId=comps.find(c=>c.id===a.componentId)?.moduleId;if(moduleId)next.moduleId=moduleId;}
 next.extension=extension;next.installation={face,spacerMm};
 if(request.spec)next.spec={...next.spec,...request.spec,calibrated:false};
 if(request.axisDeg!==undefined)next.axisDeg=request.axisDeg;
 const index=comps.findIndex(c=>c.id===next.id);if(index<0)comps.push(next);else comps[index]=next;
 const result=solveSyringe(comps,params,points,motion);
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
