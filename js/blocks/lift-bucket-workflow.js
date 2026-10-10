/** 升降托斗的窄域組立驗證；升降數學交回原任務，材料交回既有3D模型。 */
import { faceCandidateModel } from './face-candidate.js';
import { inspectRigidGroup } from './rigid-groups.js';
import { taskIssue } from './task-operation-support.js';
export function planLiftBucket(snapshot, planLift) {
  const fail = message => ({ok:false,issues:[taskIssue('LIFT_BUCKET_INVALID',message)]});
  if(!Array.isArray(snapshot?.modules)||!Array.isArray(snapshot?.comps)||snapshot.comps.some(c=>!c)||snapshot.modules.some(m=>!m))return fail('需要完整升降托斗作品。');
  const root = snapshot.modules?.find(m=>m?.id==='RigidGroup'), lift = snapshot.modules?.find(m=>m?.id==='Lift');
  if (!root || !lift || snapshot.modules.length!==5 || snapshot.comps.length!==12) return fail('請保留平行升降臂與四板托斗結構。');
  if (root.mount && (root.mount.face || root.mount.orient || root.mount.to?.module!=='Lift' || root.mount.to.output!=='tool')) return fail('托斗須安裝在保持姿態工具架輸出。');
  const output=lift.outputs?.find(o=>o.id==='tool');
  if(output?.at!=='C'||output.body?.id!=='Link3'||output.body.kind!=='bar')return fail('工具架須保留 C 點與 CD 輸出桿。');
  const group={id:'check',output:'side',members:['Floor','RightSide','Back']};
  if(!inspectRigidGroup(snapshot.comps,snapshot.modules,root.id,group).ok)return fail('托斗內部板件接合已改變。');
  const unit={...snapshot,comps:snapshot.comps.filter(c=>c.moduleId==='Lift').map(c=>{const x=structuredClone(c);delete x.moduleId;return x;}),modules:[],params:{...snapshot.params}};
  delete unit.params.liftBucket;
  const plan=planLift(unit);if(!plan.ok)return plan;
  const ids=['LeftSide','Floor-frame','RightSide-frame','Back-frame'];
  let reference,anchor; const n=Math.max(1,Math.ceil((plan.range.hi-plan.range.lo)/5));
  for(let i=0;i<=n;i++) {
    const a=plan.range.lo+(plan.range.hi-plan.range.lo)*i/n;
    let scene;try{scene=faceCandidateModel({work:snapshot},{theta:a,motorAngles:{'1':a}});}catch(_){return fail('托斗材料模型無法求解。');}
    if(!scene.solveValidity?.valid)return fail('托斗組立求解失敗。');
    const mats=ids.map(id=>scene.model.materialParts.find(p=>p.partId===id)?.pose?.matrix);
    if(mats.some(m=>!m||m.length!==16||!m.every(Number.isFinite)))return fail('托斗板件姿態不完整。');
    const c=scene.points?.C;
    if(!c||!Number.isFinite(c.x)||!Number.isFinite(c.y))return fail('工具架接點無有效座標。');
    const base=scene.points?.[root.base];
    if(root.mount&&(!base||Math.hypot(base.x-c.x,base.y-c.y)>1e-5))return fail('托斗安裝孔未對準工具架。');
    // 四板均保持初始方向與相同平移量，避免只檢查動畫是否順暢。
    if(!reference){reference=mats;anchor=c;}
    const delta=[12,13,14].map(k=>mats[0][k]-reference[0][k]);
    if(mats.some((m,j)=>m.some((v,k)=>Math.abs(v-reference[j][k]-(k>=12&&k<=14?delta[k-12]:0))>1e-5)))return fail('托斗方向或板件相對位置改變。');
    if(!root.mount&&delta.some(v=>Math.abs(v)>1e-5))return fail('拆下的托斗不應跟隨升降。');
    if(root.mount&&c&&anchor&&(Math.abs(delta[0]-(c.x-anchor.x))>1e-5||Math.abs(delta[1]-(c.y-anchor.y))>1e-5))return fail('托斗未跟隨工具架。');
  }
  return {...plan,validation:{...plan.validation,assemblySampleCount:n+1,groupMount:root.mount?'mounted':'detached',scope:{...plan.validation.scope,unchecked:[...plan.validation.scope.unchecked,'assembly_interference','load','mount_hardware_fit']}}};
}
