import { planLiftBucket } from './lift-bucket-workflow.js';
/** 平行四連桿窄教學任務。求角只在原solver上作高度二分，未另造幾何求解。 */
import { compileTopology } from '../core/topology.js';
import { solveTopology } from '../multilink/solver.js';
import { validateMotionRange } from './motion-range-validation.js';
import { taskIssue } from './task-operation-support.js';
export const PARALLEL_LIFT_LIMITS=Object.freeze({minArmMm:32,maxArmMm:120,startDeg:0,endDeg:80,poseToleranceDeg:0.1});
export function planParallelLift(snapshot){
  if(Number(snapshot?.params?.liftBucket)===1)return planLiftBucket(snapshot,planParallelLift);
  const fail=(code,message,targets=[])=>({ok:false,issues:[taskIssue(code,message,targets)]});
  const comps=snapshot?.comps,p=snapshot?.params;
  if(!Array.isArray(comps)||!p||typeof p!=='object'||Array.isArray(p)||comps.length!==5||comps.some(c=>!c||typeof c!=='object'||Array.isArray(c)))return fail('UNSUPPORTED_STRUCTURE','此任務僅適用既有平行四連桿五零件作品。');
  const byId=Object.fromEntries(comps.map(c=>[c.id,c])),a=byId.Anchor1,b=byId.Anchor2,l=byId.Link1,r=byId.Link2,cd=byId.Link3;
  if(a?.type!=='anchor'||b?.type!=='anchor'||[l,r,cd].some(c=>c?.type!=='bar')||snapshot.modules?.length||comps.some(c=>c.moduleId))return fail('UNSUPPORTED_STRUCTURE','結構已改造，請核對平行四連桿。');
  const expected=[[a,'p1','A'],[b,'p1','B'],[l,'p1','A'],[l,'p2','C'],[r,'p1','B'],[r,'p2','D'],[cd,'p1','C'],[cd,'p2','D']];
  if(expected.some(([c,k,id])=>c[k]?.id!==id||!Number.isFinite(c[k]?.x)||!Number.isFinite(c[k]?.y)||(['A','B'].includes(id)&&(Math.abs(c[k].x+110)>.1||Math.abs(c[k].y-(id==='A'?0:72))>.1)))||[l,r,cd].some(c=>c.fixedLen===false)||typeof p.LL3!=='number'||!Number.isFinite(p.LL3)||l.lenParam!=='LL1'||r.lenParam!=='LL2'||cd.lenParam!=='LL3'||!l.isInput||String(l.physicalMotor||l.p1.physicalMotor)!=='1'||
    comps.some(c=>[c,c.p1,c.p2].some(o=>o?.physicalMotor && (String(o.physicalMotor)!=='1'||!['Link1','Anchor1'].includes(c.id))))||
    comps.some(c=>c.motorCarrier||Number(c.phaseOffset||0)!==0)||
    Math.abs(a.p1.x+110)>.1||Math.abs(a.p1.y)>.1||Math.abs(b.p1.x+110)>.1||Math.abs(b.p1.y-72)>.1||Math.abs(p.LL3-72)>.1)
    return fail('UNSUPPORTED_STRUCTURE','請保留原A／B固定軸、CD72mm與單M1、零相位的教學配置。',['Anchor1','Anchor2','Link1','Link3']);
  if(typeof p.LL1!=='number'||typeof p.LL2!=='number'||!Number.isFinite(p.LL1)||!Number.isFinite(p.LL2)||Math.abs(p.LL1-p.LL2)>.001)return fail('EQUAL_ARMS_REQUIRED','AC與BD須等長；請明確同步設定活動臂長後重驗。',['Link1','Link2']);
  const arm=p.LL1,startHeight=p.parallelStartHeight,endHeight=p.parallelEndHeight;
  if(arm<32||arm>120||[startHeight,endHeight].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>120))return fail('INVALID_DIMENSIONS','活動臂32–120mm；起終高度須為0–120mm有限數字。');
  let topo;
  try{topo=compileTopology(comps,{params:{...p}},new Set());}catch(_){return fail('MOTION_COMPILE_FAILED','編譯未完成。');}
  const sample=theta=>{const sol=solveTopology(topo,{thetaDeg:theta,motorAngles:{'1':theta}});return sol?.isValid!==false&&sol?.points?.C&&sol.points.A?{theta,height:sol.points.C.y-sol.points.A.y,points:sol.points}:null;};
  let lo,hi;
  try{lo=sample(0);hi=sample(80);}catch(_){return fail('MOTION_SOLVE_FAILED','教學分支端點求解未完成。');}
  if(!lo||!hi||!Number.isFinite(lo.height)||!Number.isFinite(hi.height))return fail('INVALID_POSE','教學分支端點沒有有效有限解。',['Link1','Link2']);
  if([startHeight,endHeight].some(h=>h>hi.height+1e-7||h<lo.height-1e-7))return fail('UNREACHABLE_HEIGHT',`此${arm}mm臂在0–80°教學分支可達約0–${hi.height.toFixed(1)}mm；請縮小高度或同步加長活動臂。`,['Link1','Link2']);
  const atHeight=target=>{let a=0,b=80;for(let i=0;i<36;i++){const m=(a+b)/2,s=sample(m);if(!s||!Number.isFinite(s.height))throw Error('sample');if(s.height<target)a=m;else b=m;}return sample((a+b)/2);};
  let start,end;
  try{start=atHeight(startHeight);end=atHeight(endHeight);}catch(_){return fail('MOTION_SOLVE_FAILED','高度求角過程出現無效採樣，請核對接點。',['Link1','Link2']);}
  if(!start||!end)return fail('INVALID_POSE','高度求角未取得有效姿態。',['Link1','Link2']);
  const validation=validateMotionRange(snapshot,{startDeg:start.theta,endDeg:end.theta,motorId:'1',endpointChecks:[{startMm:startHeight,endMm:endHeight,componentId:'Link1',targets:['A','C'],measure:points=>points.C.y-points.A.y}],sampleChecks:[
    {code:'ATTITUDE_NOT_PRESERVED',message:'CD未保持垂直姿態（容差0.1°）。',componentId:'Link3',targets:['C','D'],test:points=>Math.abs(Math.atan2(points.D.y-points.C.y,points.D.x-points.C.x)*180/Math.PI-90)<=.1},
    {code:'UNSAFE_TEACHING_BRANCH',message:'離開指定右側非交叉教學分支。',targets:['A','B','C','D'],test:points=>points.C.x>points.A.x+.1&&points.D.x>points.B.x+.1&&points.D.y>points.C.y}
  ]});
  if(!validation.ok)return {ok:false,issues:validation.issues,validation};
  return {ok:true,issues:[],armLengthMm:arm,startHeightMm:startHeight,endHeightMm:endHeight,start,end,range:{lo:Math.min(start.theta,end.theta),hi:Math.max(start.theta,end.theta)},motor:'1',validation,limits:PARALLEL_LIFT_LIMITS,message:`C相對A高度 ${startHeight}→${endHeight}mm；CD姿態保持，沿弧移動。`};
}
