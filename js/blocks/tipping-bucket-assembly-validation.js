/** 窄域四板料斗驗證：從 snapshot 的真實輸出幾何與組立姿態取樣；無新求解器。 */
import {faceCandidateModel} from './face-candidate.js';
import {validateMotionRange} from './motion-range-validation.js';
import {taskIssue} from './task-operation-support.js';
import {faceBracketPlan} from './face-bracket-extras.js';
import {checkMaterialInterference} from './material-interference.js';
const ids=['LeftSide','RightSide-frame','Floor-frame','Back-frame'],eps=1e-5;
const fail=(code,message,targets=[],angle)=>({ok:false,issues:[{...taskIssue(code,message,targets),...(angle===undefined?{}:{angleDeg:angle})}]});
const world=(m,p,z)=>[0,1,2].map(i=>m[i]*p.x+m[4+i]*p.y+m[8+i]*z+m[12+i]);
const local=(m,p)=>[0,4,8].map(i=>[0,1,2].reduce((v,j)=>v+m[i+j]*(p[j]-m[12+j]),0));
const bound=ps=>[0,1,2].map(i=>[Math.min(...ps.map(p=>p[i])),Math.max(...ps.map(p=>p[i]))]);
export function validateTippingBucketAssembly(snapshot){
  if(!snapshot||!Array.isArray(snapshot.comps)||snapshot.comps.some(c=>!c||typeof c!=='object')||!Array.isArray(snapshot.modules)||!snapshot.params||typeof snapshot.params!=='object')return fail('UNSUPPORTED_STRUCTURE','需要完整四板料斗組立。');
  const driver=snapshot.comps.find(c=>c.id==='Drive'),left=snapshot.comps.find(c=>c.id==='LeftSide'),support=snapshot.comps.find(c=>c.id==='Support');
  const modules=snapshot.modules;
  if(modules.length!==4||snapshot.comps.length!==9||!driver||!left||!support||driver.motorType!=='mg995'||driver.moduleId!=='Driver'||driver.motorCarrier||String(driver.physicalMotor)!=='1'||driver.motorMount?.frameBody!=='Support'||driver.motorMount?.outputBody!=='Drive'||left.type!=='triangle'||left.moduleId!=='Driver'||!driver.p1||!driver.p2||!support.p1||!support.p2||snapshot.comps.some(c=>c.moduleId!=='Driver'&&c.type!=='anchor'))return fail('UNSUPPORTED_STRUCTURE','此入口僅覆蓋單 MG995、單側支架與四板料斗。');
  for(const [id,parent]of [['Floor','Driver'],['RightSide','Floor'],['Back','Floor']]){const m=modules.find(m=>m?.id===id);if(m?.mount?.to?.module!==parent||!m.mount.face?.selection?.brackets?.enabled||m.mount.face.childPart!=='frame')return fail('UNSUPPORTED_CONNECTION','底板、側板與背板需要既定接合樹及有效角碼。',[id]);}
  for(const id of ['Floor','RightSide','Back']){let bracket;try{bracket=faceBracketPlan(snapshot.comps,modules,snapshot.params,modules.find(m=>m.id===id),{stockMm:snapshot.fabrication?.cnc?.stockThicknessMm,joint:snapshot.fabrication?.joint,exportSettings:snapshot.fabrication?.export});}catch(_){return fail('INVALID_FASTENER','無法核對角碼。',[id]);}if(!bracket?.ok)return fail('INVALID_FASTENER',bracket?.reason||'角碼孔位無效。',[id]);}
  const start=driver.servoStart,end=driver.servoEnd;
  if(Math.hypot(driver.p1.x,driver.p1.y,support.p2.x,support.p2.y)>eps||driver.p1.id!=='O'||support.p2.id==='O'||support.p2.type!=='fixed')return fail('FIXED_AXIS_MOVED','單側固定支架軸孔須與 O 同座標、保留獨立固定點。',['Support','O']);
  if([start,end].some(v=>!Number.isInteger(v)||v<-120||v>0))return fail('ANGLE_OUT_OF_RANGE','立體料斗模型起／終角須為−120～0°整數；這是避開固定支架的教學分支。',['Drive']);
  const motorId='1',unit={comps:snapshot.comps.filter(c=>c.moduleId==='Driver').map(c=>{const v=structuredClone(c);delete v.moduleId;return v;}),params:snapshot.params};
  const motion=validateMotionRange(unit,{startDeg:start,endDeg:end,motorId,sampleChecks:[{code:'FIXED_AXIS_MOVED',message:'固定轉軸 O 移動。',componentId:'Drive',targets:['O'],test:q=>q.O&&Math.hypot(q.O.x,q.O.y)<.001},{code:'ANGLE_NOT_FOLLOWED',message:'活動側板未跟隨模型角。',componentId:'LeftSide',targets:['O','P'],test:(q,a)=>q.O&&q.P&&Math.abs(((Math.atan2(q.P.y-q.O.y,q.P.x-q.O.x)*180/Math.PI-a+540)%360)-180)<=.1}]});
  if(!motion.ok)return {ok:false,issues:motion.issues,validation:motion};
  // 主孔0.5°；完整材料組立最多5°，分別報告，避免每次編輯重建201份材料目錄。
  let reference=null,cavityMm=null,maximumRigidErrorMm=0;const sampleCount=Math.ceil(Math.abs(end-start)/5)+1;
  for(let index=0;index<sampleCount;index++){
    const angle=sampleCount===1?start:index===sampleCount-1?end:start+(end-start)*index/(sampleCount-1);
    let scene;try{scene=faceCandidateModel({work:snapshot},{theta:angle,motorAngles:{'1':angle}});}catch(_){return fail('ASSEMBLY_FAILED','組立幾何無法求解。',ids,angle);}
    if(!scene.solveValidity?.valid||scene.catalog?.diagnostics?.some(d=>d.status!=='pass'))return fail('ASSEMBLY_FAILED','組立或材料目錄有未覆蓋診斷。',ids,angle);
    for(const mod of modules.filter(m=>m.mount?.face)){const actual=scene.work.modules.find(m=>m.id===mod.id).mount.face,expected=mod.mount.face;if(['x','y','z'].some(k=>Math.abs(actual.translation[k]-expected.translation[k])>eps)||actual.rotation.flat().some((v,i)=>Math.abs(v-expected.rotation.flat()[i])>eps))return fail('STALE_FACE_TRANSFORM','已保存接合姿態與目前選面不一致，請用共用組立介面重新確認。',[mod.id],angle);}
    const parts=ids.map(id=>scene.model?.materialParts?.find(p=>p.partId===id));
    if(parts.some(p=>!p||!Array.isArray(p.pose?.matrix)||p.pose.matrix.length!==16||!p.pose.matrix.every(Number.isFinite)||!p.geometry?.outlines?.length||!Number.isFinite(p.geometry.thicknessMm)))return fail('MISSING_MATERIAL','四片可輸出板件或其姿態不完整。',ids,angle);
    if(index===0){const material=checkMaterialInterference(scene.model),invalid=material.coverage?.notSupported?.find(d=>ids.includes(d.partId)&&d.reason);if(invalid)return fail('INVALID_MATERIAL_GEOMETRY','板件孔槽或輪廓無法形成有效材料：'+invalid.reason,[invalid.partId],angle);}
    const basis=parts[0].pose.matrix,cloud=Object.fromEntries(parts.map(p=>[p.partId,p.geometry.outlines.flatMap(r=>r.flatMap(q=>[0,p.geometry.thicknessMm].map(z=>local(basis,world(p.pose.matrix,q,z)))))]));
    if(Object.values(cloud).flat(2).some(v=>!Number.isFinite(v)))return fail('NON_FINITE_MATERIAL','板件角點不是有限座標。',ids,angle);
    if(!reference)reference=cloud;
    for(const id of ids){if(reference[id].length!==cloud[id].length)return fail('MATERIAL_CHANGED','取樣期間材料輪廓改變。',[id],angle);for(let i=0;i<cloud[id].length;i++)maximumRigidErrorMm=Math.max(maximumRigidErrorMm,Math.hypot(...cloud[id][i].map((v,j)=>v-reference[id][i][j])));}
    if(maximumRigidErrorMm>eps)return fail('RIGID_ASSEMBLY_CHANGED','板件相對活動側板的剛體位置改變。',ids,angle);
    const [l,r,f,b]=ids.map(id=>bound(cloud[id]));
    const gaps=[f[1][1]-l[1][0],f[1][1]-r[1][0],f[1][1]-b[1][0],b[0][1]-l[0][0],b[0][1]-r[0][0]];
    if(gaps.some(g=>Math.abs(g)>eps)||f[2][0]>l[2][0]+eps||f[2][1]<r[2][1]-eps||f[0][0]>b[0][0]+eps||b[2][0]>l[2][1]+eps||b[2][1]<r[2][0]-eps)return fail('OPEN_SEAM','板件接觸邊界不成立；請重新核對組立。',ids,angle);
    const dot=(a,b)=>[8,9,10].reduce((v,i)=>v+a[i]*b[i],0);
    if(Math.abs(Math.abs(dot(basis,parts[1].pose.matrix))-1)>eps||parts.slice(2).some(p=>Math.abs(dot(basis,p.pose.matrix))>eps)||Math.abs(dot(parts[2].pose.matrix,parts[3].pose.matrix))>eps)return fail('PLATE_ORIENTATION','側板平行或底／背板直角關係不成立。',ids,angle);
    cavityMm={depth:Math.min(l[0][1],r[0][1])-b[0][1],height:Math.min(l[1][1],r[1][1])-f[1][1],width:r[2][0]-l[2][1]};
    if(Object.values(cavityMm).some(v=>v<=0))return fail('INVALID_CAVITY','內腔尺寸非正值。',ids,angle);
  }
  const validation={...motion,scope:{...motion.scope,assembly:'four_exported_plates_and_confirmed_bracket_geometry',support:'single_side',unchecked:[...motion.scope.unchecked,'assembly_between_samples','assembly_interference','material_discharge','fastener_strength','opposite_bearing','hardware_pwm']},cavityMm,maximumRigidErrorMm,assemblySampleCount:sampleCount,assemblyStepDeg:sampleCount>1?Math.abs(end-start)/(sampleCount-1):0};
  return {ok:true,issues:[],start:{theta:start},end:{theta:end},range:{lo:Math.min(start,end),hi:Math.max(start,end)},motor:motorId,validation};
}
