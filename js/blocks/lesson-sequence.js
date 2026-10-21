import { compileAssembly, solveAssembly } from './assembly.js';
import { motionPoseIssue } from './solve-health.js';
export const DEFAULT_SEQUENCE = [
  { name: '移到低位', motor: '1', angle: -20, seconds: 1.5 },
  { name: '張開', motor: '2', angle: 0, seconds: 1 },
  { name: '收攏', motor: '2', angle: 30, seconds: 1.5 },
  { name: '升高', motor: '1', angle: 40, seconds: 2 },
  { name: '高位張開', motor: '2', angle: 0, seconds: 1.5 },
  { name: '回低位', motor: '1', angle: -20, seconds: 2 }
];
export function sequenceAnglesAt(plan, seconds) {
  let previous = { ...plan.start }, elapsed = 0;
  for (let i=0;i<plan.steps.length;i++) {
    const step=plan.steps[i], end=elapsed+step.seconds;
    if (seconds <= end) return { angles: { ...previous, [step.motor]: previous[step.motor]+(step.angle-previous[step.motor])*Math.max(0,(seconds-elapsed)/step.seconds) }, index:i };
    previous[step.motor]=step.angle; elapsed=end;
  }
  return {angles:previous,index:plan.steps.length-1};
}
export function prepareLessonSequence(source, steps, start) {
  const fail=message=>({ok:false,message});
  const lift=source.modules?.find(m=>m.id==='Lift1'),grip=source.modules?.find(m=>m.id==='Grip1');
  if (!lift || !grip || grip.mount?.to?.module !== lift.id || grip.mount?.to?.output !== 'tool')
    return fail('請載入第八課範例，並先把夾爪接到升降臂的工具架。');
  if (source.modules.length!==2) return fail('這輪只支援第八課的兩個組件，請使用獨立的教學組立。');
  const drives=source.comps.filter(c=>(c.type==='bar'&&c.isInput)||(c.type==='gear'&&c.p1?.type==='motor'));
  if(drives.length!==2 || !drives.some(c=>c.moduleId==='Lift1'&&String(c.physicalMotor||c.p1?.physicalMotor)==='1') || !drives.some(c=>c.moduleId==='Grip1'&&String(c.physicalMotor||c.p1?.physicalMotor)==='2')) return fail('本課需要 M1 控制升降、M2 控制夾爪。');
  const limits={'1':[-40,60],'2':[0,30]};
  for(const c of drives) if(c.motorType==='mg995') {
    const id=String(c.physicalMotor||c.p1?.physicalMotor),a=Number(c.servoStart),b=Number(c.servoEnd);
    if(!Number.isFinite(a)||!Number.isFinite(b))return fail('舵機角度範圍不完整。');
    limits[id]=[Math.max(limits[id][0],Math.min(a,b)),Math.min(limits[id][1],Math.max(a,b))];
  }
  if(!Array.isArray(steps)||steps.length!==6)return fail('請保留本課六個動作步驟。');
  const within=(id,value)=>Number.isFinite(value)&&value>=limits[id][0]&&value<=limits[id][1];
  if(!within('1',start['1'])||!within('2',start['2']))return fail('目前角度超出本課範圍：M1 −40～60°，M2 0～30°；請先調回範圍內。');
  for(let i=0;i<steps.length;i++) {
    const s=steps[i];
    if(s.motor!==DEFAULT_SEQUENCE[i].motor||!within(s.motor,s.angle)||!Number.isFinite(s.seconds)||s.seconds<0.5||s.seconds>5)
      return fail(`第 ${i+1} 步：角度需在本課／舵機範圍內，時間 0.5～5 秒。`);
  }
  const plan={start:{...start},steps:steps.map(s=>({...s})),duration:steps.reduce((t,s)=>t+s.seconds,0)};
  try {
    const assembly=compileAssembly(source.comps,source.modules,{params:source.params});
    const solve=angles=>solveAssembly(assembly,{thetaDeg:angles['1'],motorAngles:angles});
    let previous={...start},samples=0;
    const firstIssue=motionPoseIssue(source.comps,solve(previous));
    if(firstIssue)return fail(firstIssue.message);
    for(let index=0;index<steps.length;index++) {
      const s=steps[index],count=Math.max(1,Math.ceil(Math.abs(s.angle-previous[s.motor])));
      for(let n=1;n<=count;n++) {
        const angles={...previous,[s.motor]:previous[s.motor]+(s.angle-previous[s.motor])*n/count};
        const issue=motionPoseIssue(source.comps,solve(angles)); samples++;
        if(issue)return fail(`第 ${index+1} 步：${issue.message}`);
      }
      previous[s.motor]=s.angle;
    }
    return {ok:true,...plan,samples,solve};
  } catch(_) {return fail('組立無法求解，請檢查接合與桿件尺寸。');}
}
