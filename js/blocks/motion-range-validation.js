/** 指定行程的有限採樣檢查。重用原 solver，不是連續性／碰撞／承載證明。 */
import { plateVertexWorldPoints, MAX_PLATE_POINTS } from './plate-geometry.js';
import { compileTopology } from '../core/topology.js';
import { solveTopology } from '../multilink/solver.js';
export const MOTION_RANGE_POLICY = Object.freeze({stepDeg:0.5,maxSamples:721,distanceToleranceMm:0.1,maxPointTravelMmPerDeg:20,pointTravelSlackMm:0.05,maxDirectionJumpDeg:15,endpointToleranceMm:0.1});
const record = v => v && typeof v==='object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function validateMotionRange(snapshot, options = {}) {
  const issues=[], policy={...MOTION_RANGE_POLICY};
  const scope={method:'discrete-samples',holes:'primary-solver-points-only',supportedTypes:['anchor','bar','triangle','gear'],unchecked:['between_samples','interference','contact','load','hardware']};
  let sampleCount=0, count=0;
  const issue=(code,message,angleDeg=null,componentId=null,targets=[])=>issues.push({code,severity:'error',message,angleDeg,componentId,targets});
  const finish=()=>({ok:issues.length===0,issues,range:{startDeg:options?.startDeg,endDeg:options?.endDeg},sampleCount,plannedSampleCount:count,actualStepDeg:count>1?Math.abs(options.endDeg-options.startDeg)/(count-1):0,policy,scope});
  if (!options || typeof options!=='object' || Array.isArray(options)) {issue('INVALID_RANGE','行程選項格式不正確。');return finish();}
  for(const k of Object.keys(policy)) if(options[k]!==undefined) policy[k]=options[k];
  if(!finite(options.startDeg)||!finite(options.endDeg)||Math.abs(options.startDeg)>1e6||Math.abs(options.endDeg)>1e6||Object.values(policy).some(v=>!finite(v)||v<=0)||!Number.isInteger(policy.maxSamples)||policy.maxSamples>10001){issue('INVALID_RANGE','起訖必須為有限角度，步距與容差須為正數，最多10001幀。');return finish();}
  count=Math.ceil(Math.abs(options.endDeg-options.startDeg)/policy.stepDeg)+1;
  if(count>policy.maxSamples){issue('SAMPLE_LIMIT','指定步距超過取樣上限，請縮小區間或調整步距。');return finish();}
  if(!snapshot||!Array.isArray(snapshot.comps)||!snapshot.comps.length||!record(snapshot.params)||snapshot.comps.some(c=>!record(c))||snapshot.modules?.length){issue('UNSUPPORTED_MOTION_STRUCTURE','行程驗證需要未組立的非空作品。');return finish();}
  const comps=snapshot.comps, motorIds=new Set();
  for(const c of comps){
    const required=c.type==='anchor'?['p1']:c.type==='triangle'?['p1','p2','p3']:['p1','p2'];
    if(required.some(k=>!record(c[k])||typeof c[k].id!=='string'||!c[k].id))issue('UNSUPPORTED_MOTION_STRUCTURE','零件缺少有效主孔資料。',null,c.id,[c.id]);
    if(!scope.supportedTypes.includes(c.type)||c.moduleId||(c.vertices!==undefined && (c.type!=='triangle'||!Array.isArray(c.vertices)||c.vertices.length<3||c.vertices.length>MAX_PLATE_POINTS||['p1','p2','p3'].some(ref=>c.vertices.filter(v=>v?.solve===true&&v.ref===ref).length!==1)||c.vertices.some(v=>!record(v)||(v.solve===true?!['p1','p2','p3'].includes(v.ref):v.solve!==false||!finite(v.u)||!finite(v.v)||v.hole===true)))))issue('UNSUPPORTED_MOTION_STRUCTURE','此零件型態或額外孔形尚未納入行程驗證。',null,c.id,[c.id]);
    for(const p of [c,c.p1,c.p2,c.p3])if(p?.physicalMotor||p?.physical_motor)motorIds.add(String(p.physicalMotor||p.physical_motor));
  }
  const motorId=String(options.motorId??snapshot.activeMotor??'1');
  if(motorIds.size!==1||!motorIds.has(motorId)){issue('UNSUPPORTED_MOTOR_CONFIGURATION','目前只驗證一個指定驅動馬達，其他馬達配置尚未覆蓋。');return finish();}
  const endpoints=options.endpointChecks??[];
  if(!Array.isArray(endpoints)||endpoints.some(c=>!c||typeof c.measure!=='function'||!finite(c.startMm)||!finite(c.endMm))){issue('INVALID_RANGE','端點量測需要純量測函式與有限目標值。');return finish();}
  const sampleChecks=options.sampleChecks??[];
  if(!Array.isArray(sampleChecks)||sampleChecks.some(c=>!c||typeof c.test!=='function')){issue('INVALID_RANGE','逐樣本檢查需要可信域純函式。');return finish();}
  const edges=[],pointOwners=new Map();
  for(const c of comps){
    const add=(a,b,param)=>edges.push({a:c[a]?.id,b:c[b]?.id,expected:snapshot.params[param],componentId:c.id});
    for(const k of ['p1','p2','p3'])if(c[k]?.id)pointOwners.set(c[k].id,c.id);
    if(c.type==='bar')add('p1','p2',c.lenParam);
    if(c.type==='triangle'){add('p1','p2',c.gParam);add('p1','p3',c.r1Param);add('p2','p3',c.r2Param);}
    if(c.type==='gear')add('p1','p2',c.pinRadiusParam||c.radiusParam);
  }
  for(const e of edges)if(!e.a||!e.b||!finite(e.expected)||e.expected<=0)issue('INVALID_RIGID_DIMENSION','剛性孔距參數必須是有效正長度。',options.startDeg,e.componentId,[e.a,e.b].filter(Boolean));
  if(issues.length)return finish();
  let topo, referencePoints=null, previous=null, previousAngle=null;
  try{topo=compileTopology(comps,{params:{...snapshot.params}},new Set());}catch(_){issue('MOTION_COMPILE_FAILED','作品編譯失敗。');return finish();}
  // 造形點基準由原 solver 按當前 params 求得，不能用尚未同步的浮點設計座標。
  if(comps.some(c=>c.type==='triangle'&&c.vertices?.some(v=>v.solve===false))){
    try{referencePoints=solveTopology(topo,{thetaDeg:options.startDeg,motorAngles:{...(snapshot.motorAngles||{}),[motorId]:options.startDeg}})?.points;}catch(_){}
  }
  for(let i=0;i<count;i++){
    const angleDeg=count===1?options.startDeg:options.startDeg+(options.endDeg-options.startDeg)*i/(count-1);
    sampleCount++;
    let sol;
    try{sol=solveTopology(topo,{thetaDeg:angleDeg,motorAngles:{...(snapshot.motorAngles||{}),[motorId]:angleDeg},_prevPoints:previous});}catch(_){issue('MOTION_SOLVE_FAILED','此採樣角度求解失敗。',angleDeg);break;}
    const points=sol?.points;
    const missing=[...pointOwners].filter(([id])=>!points?.[id]||!finite(points[id].x)||!finite(points[id].y));
    if(!points||missing.length){for(const [id,owner]of missing.length?missing:[[null,null]])issue('NONFINITE_POSE','此採樣角度沒有有效有限解。',angleDeg,owner,id?[id]:[]);break;}
    if(sol.isValid===false)issue('INVALID_POSE','求解器標示此採樣姿態無效；targets為參與零件，未定位單一原因。',angleDeg,null,comps.map(c=>c.id));
    for(const e of edges){
      if(Math.abs(distance(points[e.a],points[e.b])-e.expected)>policy.distanceToleranceMm)issue('RIGID_DISTANCE_MISMATCH','採樣孔距不符合作品剛性尺寸。',angleDeg,e.componentId,[e.a,e.b]);
      if(previous){
        const direction=p=>Math.atan2(p[e.b].y-p[e.a].y,p[e.b].x-p[e.a].x)*180/Math.PI;
        const turn=Math.abs(((direction(points)-direction(previous)+540)%360)-180);
        if(turn>policy.maxDirectionJumpDeg)issue('SUSPECTED_POSE_JUMP','相鄰採樣方向超過跳動門檻；可能為分支變化，需加密檢查。',angleDeg,e.componentId,[e.a,e.b]);
      }
    }
    for(const c of comps.filter(c=>c.type==='triangle'&&c.vertices?.some(v=>v.solve===false))){
      const refs=['p1','p2','p3'].map(k=>points[c[k].id]);
      const world=plateVertexWorldPoints(c,refs), local=plateVertexWorldPoints(c,['p1','p2','p3'].map(k=>referencePoints?.[c[k].id]));
      if(world.length!==c.vertices.length||local.length!==c.vertices.length)issue('INVALID_RIGID_VERTICES','造形點缺少有效剛體基準。',angleDeg,c.id);
      else for(let a=0;a<world.length;a++)for(let b=a+1;b<world.length;b++)if(Math.abs(distance(world[a],world[b])-distance(local[a],local[b]))>policy.distanceToleranceMm)issue('RIGID_VERTEX_DISTANCE_MISMATCH','造形點距離不符合局部剛體定義。',angleDeg,c.id);
    }
    if(previous)for(const [id,owner]of pointOwners)if(distance(points[id],previous[id])>policy.maxPointTravelMmPerDeg*Math.abs(angleDeg-previousAngle)+policy.pointTravelSlackMm)issue('SUSPECTED_POSE_JUMP','相鄰採樣位移超過跳動門檻；需核對分支或加密檢查。',angleDeg,owner,[id]);
    for(const c of sampleChecks){
      let passed=false;try{passed=c.test(points,angleDeg)===true;}catch(_){}
      if(!passed)issue(c.code||'SAMPLE_CONSTRAINT_FAILED',c.message||'此採樣未符合任務姿態條件。',angleDeg,c.componentId??null,c.targets||[]);
    }
    if(i===0||i===count-1)for(const c of endpoints){
      let value;try{value=c.measure(points);}catch(_){}
      const expected=i===0?c.startMm:c.endMm;
      if(!finite(value)||Math.abs(value-expected)>policy.endpointToleranceMm)issue('ENDPOINT_TARGET_MISMATCH','採樣端點開口不符合指定目標。',angleDeg,c.componentId??null,c.targets||[]);
      if(count===1&&Math.abs(c.startMm-c.endMm)>policy.endpointToleranceMm)issue('ENDPOINT_TARGET_MISMATCH','零長行程的起終目標不一致。',angleDeg,c.componentId??null,c.targets||[]);
    }
    if(issues.length)break;
    previous=points;previousAngle=angleDeg;
  }
  scope.rigidLocalVertices='shape-vertices-relative-to-primary-holes; not-all-machining-holes';
  scope.endpointChecks=endpoints.length;
  scope.sampleChecks=sampleChecks.length;
  return finish();
}
