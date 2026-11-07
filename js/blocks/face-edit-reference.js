/** Preserve an attached face in its host body when a fused-member edit changes
 * the host's solved zero pose. Selection values and refs are updated together
 * inside the candidate; ordinary refresh remains the authority after commit.
 * No saved fields or solver rules are added. */
import {compileAssembly,solveAssembly,outputPose} from './assembly.js';
import {buildMountSurfaces,findMountSurface} from './mount-surfaces.js';
import {buildFacePlacement} from './face-placement.js';
import {mountFacePlacement} from './face-mount.js';
import {boxFaces} from './face-mate.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mul=(A,B)=>A.map(r=>B[0].map((_,j)=>dot(r,B.map(x=>x[j])))),transpose=A=>A[0].map((_,i)=>A.map(r=>r[i]));
const reference=surface=>{const center=Object.fromEntries(['x','y','z'].map(k=>[k,(surface.box.min[k]+surface.box.max[k])/2]));return{surface,box:{min:Object.fromEntries(['x','y','z'].map(k=>[k,surface.box.min[k]-center[k]])),max:Object.fromEntries(['x','y','z'].map(k=>[k,surface.box.max[k]-center[k]]))}};};
export function preserveFaceEditReference(before,after){
 if(!after.modules?.some(m=>m.mount?.face))return {ok:true,...after};
 const fail=reason=>({ok:false,reason});
 try {
 const next=structuredClone(after),zero=s=>solveAssembly(compileAssembly(s.comps,s.modules,{params:s.params}),{thetaDeg:0,motorAngles:{}}),oldSol=zero(before),newSol=zero(next);
 if(!oldSol?.isValid||!newSol?.isValid||oldSol.isUnderconstrained||newSol.isUnderconstrained)return fail('接合參考零位無法完整求解。');
 for(const mod of next.modules){
  const old=before.modules.find(m=>m.id===mod.id);if(!old?.mount?.face||!mod.mount?.face||mod.mount.to.frame)continue;
  const host=next.modules.find(m=>m.id===mod.mount.to?.module),oldHost=before.modules.find(m=>m.id===old.mount.to?.module);
  if(!host||!oldHost)return fail('接合宿主已不存在，請重新選面。');
  const oldPose=outputPose(oldHost,old.mount.to.output,oldSol.points,before.comps),newPose=outputPose(host,mod.mount.to.output,newSol.points,next.comps);
  if(![oldPose,newPose].every(p=>p&&['x','y','a'].every(k=>Number.isFinite(p[k]))))return fail('接合輸出端沒有有效零位，請重新選面。');
  const da=(newPose.a-oldPose.a)*Math.PI/180,dx=newPose.x-oldPose.x,dy=newPose.y-oldPose.y;
  if(Math.max(Math.abs(da),Math.abs(dx),Math.abs(dy))<1e-6)continue;
  if(host.mount)return{ok:false,reason:'安裝中宿主的零位轉向需重新選面'};
  // All surface descriptors must use the same solved zero pose as mount.ref.
  for(const c of next.comps.filter(c=>c.moduleId===host.id))for(const k of['p1','p2','p3'])if(c[k]&&newSol.points[c[k].id])Object.assign(c[k],newSol.points[c[k].id]);
  const opts={...next,exportSettings:next.fabrication?.export||{},thicknessMm:Number(next.stockMm)||Number(next.fabrication?.cnc?.stockThicknessMm)||FABRICATION_DEFAULTS.cnc.stockThicknessMm},hs=findMountSurface(buildMountSurfaces({...opts,moduleId:host.id}).surfaces,mod.mount.to),cs=buildMountSurfaces({...opts,moduleId:mod.id,partId:mod.mount.face.childPart}).surfaces?.find(s=>mod.mount.face.childPart==='frame'?s.kind==='frame':s.compId===mod.mount.face.childPart);
  if(!hs||!cs)return{ok:false,reason:'接合外框不可用'};
  const R=[[Math.cos(da),-Math.sin(da),0],[Math.sin(da),Math.cos(da),0],[0,0,1]],desiredR=mul(R,old.mount.face.rotation),t=old.mount.face.translation;
  const desiredT={x:newPose.x+Math.cos(da)*(t.x-oldPose.x)-Math.sin(da)*(t.y-oldPose.y),y:newPose.y+Math.sin(da)*(t.x-oldPose.x)+Math.cos(da)*(t.y-oldPose.y),z:t.z};
  const selection={...mod.mount.face.selection,rotationDeg:0,offsetU:0,offsetV:0};
  const place=()=>buildFacePlacement({host:reference(hs),child:reference(cs),selection}),basePlacement=place();
  if(!basePlacement.ok)return fail(basePlacement.reason);
  const base=basePlacement.record.transform,Q=mul(desiredR,transpose(base.rotation)),f=boxFaces(hs.box).find(f=>f.id===selection.hostFace);
  if(!f)return fail('原接合面已不存在，請重新選面。');
  const n=Object.values(f.n),u=Object.values(f.u),v=Object.values(f.v);
  if(Math.max(...mul(Q,n.map(x=>[x])).map((r,i)=>Math.abs(r[0]-n[i])))>1e-6)return{ok:false,reason:'此轉向無法由原六面選項表示，請重新選面'};
  selection.rotationDeg=Math.atan2(dot([Q[2][1]-Q[1][2],Q[0][2]-Q[2][0],Q[1][0]-Q[0][1]],n)/2,(Q[0][0]+Q[1][1]+Q[2][2]-1)/2)*180/Math.PI;
  const turned=place();if(!turned.ok)return fail(turned.reason);
  const d=['x','y','z'].map(k=>desiredT[k]-turned.record.transform.translation[k]);
  selection.offsetU=dot(d,u);selection.offsetV=dot(d,v);
  const placement=place();if(!placement.ok)return fail(placement.reason);
  const transform=placement.record.transform;
  // Reject normal-direction gaps or rotations the existing six-face inputs cannot express.
  if(transform.rotation.some((row,i)=>row.some((v,j)=>Math.abs(v-desiredR[i][j])>1e-6))||['x','y','z'].some(k=>Math.abs(transform.translation[k]-desiredT[k])>1e-5))return fail('修改後無法保持原接合位置與方向，請重新選面。');
  const face={...mod.mount.face,...transform,selection},r=mountFacePlacement(next.comps,next.modules.map(m=>m.id===mod.id?{...m,mount:null}:m),mod.id,{hostId:host.id,outputId:mod.mount.to.output,face},next.params);
  if(!r.ok)return r;mod.mount=r.mount;
 }
 return{ok:true,...next};
 } catch (_) { return fail('無法核對修改後的接合參考，作品未改變。'); }
}
