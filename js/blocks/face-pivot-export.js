/** Manufacturing checks include the exact same pivot solids as the 3D preview. Loaded on export only. */
import {validateFaceCandidate,freezeData} from './face-candidate.js';
import {buildPlan} from './build-plan.js';
import {withPivotHardware,pivotPlan} from '../blocks3d/pivot-hardware.js';
import {partLabel} from './part-labels.js';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function validatePivotExport(candidate,scene,pose,compute,sourceRevision,poseRevision){
 scene={...scene,model:withPivotHardware(scene.model)};
 const checked=await validateFaceCandidate(candidate,pose,compute,scene);
 if(!checked.saveable)return {ok:false,reason:checked.reason || '目前姿態無有效解，材料尚未驗證。',validation:checked.validation,sourceRevision,poseRevision};
 const work=checked.work,plan=pivotPlan(buildPlan({comps:work.comps,modules:work.modules,params:work.params,exportSettings:{...work.exportSettings,drive:work.fabrication?.drive},cnc:work.fabrication?.cnc,joint:work.joint,mounts:scene.mounts,extras:scene.catalog.extras}),scene.model);
 plan.pivotHardware.instructionsHtml='<section><h2>活動軸、隔套與防脫</h2><p>從螺絲頭側依下列順序穿入；兩端各加 Ø6×0.5 mm 墊片。活動軸端部普通螺帽與防鬆螺帽互鎖，保留 0.2 mm 軸向遊隙，不把活動板夾死。兩孔對鎖則以隔套撐板後鎖緊防鬆螺帽。光桿須覆蓋活動板；尺寸、牙長與配合須核對實物。</p><ol>'+plan.pivotHardware.joints.map(j=>{
  const stack=j.nutsLow?[...j.stack].reverse():j.stack,order=[];
  stack.forEach((p,i)=>{if(i){const s=j.spacers.find(s=>s.between.includes(p.partId)&&s.between.includes(stack[i-1].partId));if(s)order.push(`隔套 ${s.mm} mm`);}order.push(escape(partLabel(p.partId,work.comps,work.modules))+'（'+escape(p.partId)+'）');});
  return `<li>${escape(j.id)}：M3×${j.screwLengthMm}，${j.kind==='pivot'?`光桿段至少 ${j.spanMm+1} mm`:'兩孔對鎖，可用全牙螺絲'}；${order.join(' → ')} → ${j.kind==='pivot'?'2.4 mm 螺帽 → ':''}4 mm 防鬆螺帽（${j.kind==='pivot'?'留0.2 mm遊隙':'兩孔對鎖'}）。</li>`;
 }).join('')+'</ol></section>';
 return freezeData({ok:true,work,catalog:scene.catalog,plan,model:checked.model,validation:{...checked.validation,scope:'single_pose',theta:pose.theta,motorAngles:pose.motorAngles || {}},sourceRevision,poseRevision});
}
