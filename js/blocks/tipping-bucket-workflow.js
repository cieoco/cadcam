/** 單軸側視教學；運動與剛體造形均由既有 solver／plate geometry 取得。 */
import { tippingBucketLegacy } from './tipping-bucket-legacy.js';
import { validateTippingBucketAssembly } from './tipping-bucket-assembly-validation.js';
import { validateMotionRange } from './motion-range-validation.js';
import { taskIssue } from './task-operation-support.js';
export const TIPPING_BUCKET_LIMITS=Object.freeze({minDeg:-120,maxDeg:30});
export function planTippingBucket(snapshot){
  if(snapshot?.modules?.length)return validateTippingBucketAssembly(snapshot);
  const fail=(code,message,targets=[])=>({ok:false,issues:[taskIssue(code,message,targets)]});
  const c=snapshot?.comps,p=snapshot?.params,base=tippingBucketLegacy;
  if(!Array.isArray(c)||c.length!==3||c.some(v=>!v||typeof v!=='object')||!p||typeof p!=='object'||Array.isArray(p)||snapshot.modules?.length)return fail('UNSUPPORTED_STRUCTURE','需要原單軸三零件側視配置。');
  for(const original of base.comps){
    const actual=c.find(v=>v.id===original.id);
    if(!actual||actual.type!==original.type||actual.moduleId||actual.motorCarrier||(actual.physicalMotor&&String(actual.physicalMotor)!=='1')||actual.holes?.length||Number(actual.phaseOffset||0)!==0||actual.fixedLen===false||actual.visualOnly)return fail('UNSUPPORTED_STRUCTURE','固定軸或剛性側形已改造。',[original.id]);
    for(const key of ['p1','p2','p3'])if(original[key]&&(!actual[key]||['id','type','x','y'].some(k=>actual[key][k]!==original[key][k])||String(actual[key].physicalMotor||'')!==String(original[key].physicalMotor||'')))return fail('UNSUPPORTED_STRUCTURE','請保留原主孔與固定 O 軸教學定義。',[original.id]);
    for(const key of ['lenParam','gParam','r1Param','r2Param','isInput','sign','shapeMode','vertices'])if(original[key]!==undefined&&JSON.stringify(actual[key])!==JSON.stringify(original[key]))return fail('UNSUPPORTED_STRUCTURE','側形、驅動或剛性定義已改造。',[original.id]);
  }
  for(const key of ['BucketBase','BucketLeft','BucketDiagonal'])if(typeof p[key]!=='number'||!Number.isFinite(p[key])||Math.abs(p[key]-base.params[key])>1e-6)return fail('FIXED_TEACHING_DIMENSION','本輪固定教學尺寸，請重開原範例。',['Bucket']);
  const start=p.bucketStowAngle,end=p.bucketDumpAngle;
  if([start,end].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<-120||v>30))return fail('ANGLE_OUT_OF_RANGE','收納／傾倒角須為−120～30°有限數字；這是教學範圍。');
  const validation=validateMotionRange(snapshot,{startDeg:start,endDeg:end,motorId:'1',sampleChecks:[
    {code:'FIXED_AXIS_MOVED',message:'固定轉軸 O 移動。',componentId:'Axis',targets:['O'],test:q=>Math.hypot(q.O.x,q.O.y)<.001},
    {code:'ANGLE_NOT_FOLLOWED',message:'料斗方向未跟隨指定角度（容差0.1°）。',componentId:'Bucket',targets:['O','P'],test:(q,a)=>Math.abs(((Math.atan2(q.P.y-q.O.y,q.P.x-q.O.x)*180/Math.PI-a+540)%360)-180)<=.1}
  ]});
  validation.scope.unchecked.push('material_discharge');
  if(!validation.ok)return {ok:false,issues:validation.issues,validation};
  return {ok:true,issues:[],start:{theta:start},end:{theta:end},range:{lo:Math.min(start,end),hi:Math.max(start,end)},motor:'1',validation};
}
