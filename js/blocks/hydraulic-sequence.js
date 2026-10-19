import {assemblySyringeControls,planAssemblyExtensions} from './assembly-syringe.js';

// 液壓動作序列：每一步只推一支針筒，從目前伸出量等速移到目標；驗證時每 0.5 mm 解一次組立。純函式，不改傳入資料。
export const MAX_HYDRAULIC_STEPS=20,MIN_STEP_SECONDS=0.5,MAX_STEP_SECONDS=5,SAMPLE_MM=0.5;
const syringesOf=source=>(source?.comps||[]).filter(c=>c.type==='syringe');
const solveAt=(source,extensions,previous)=>planAssemblyExtensions(source.comps,source.modules||[],source.params||{},extensions,previous);

// H05 預設：張開 → 降到取物位 → 夾緊 → 升起 → 放開。升降針筒推出＝臂升高、夾爪針筒推出＝夾緊（用解算器確認，不靠猜）。
export function DEFAULT_HYDRAULIC_SEQUENCE(source){
  const syringes=syringesOf(source),lift=syringes.find(c=>!c.jawIds?.length),grip=syringes.find(c=>c.jawIds?.length);
  if(!lift||!grip)return [];
  const module=(source.modules||[]).find(m=>m.id===lift.moduleId),tool=module?.outputs?.[0]?.at;
  const height=extension=>{
    const r=solveAt(source,{[lift.id]:extension,[grip.id]:grip.extension},null),p=r.ok?r.points?.[tool]:null;
    return p&&Number.isFinite(p.y)?p.y:null;
  };
  const low=height(0),high=height(lift.spec.stroke);
  const lowered=low!==null&&high!==null&&high<low?lift.spec.stroke:0,raised=lowered===0?lift.spec.stroke:0;
  const open=0,closed=grip.spec.stroke;
  return [
    {name:'張開',syringe:grip.id,extension:open,seconds:2},
    {name:'降到取物位',syringe:lift.id,extension:lowered,seconds:2.5},
    {name:'夾緊',syringe:grip.id,extension:closed,seconds:2},
    {name:'升起',syringe:lift.id,extension:raised,seconds:2.5},
    {name:'放開',syringe:grip.id,extension:open,seconds:2}
  ];
}

export function prepareHydraulicSequence(source,steps,start){
  const fail=message=>({ok:false,message});
  const syringes=syringesOf(source);
  if(!syringes.length)return fail('組立裡沒有針筒。');
  if(!Array.isArray(steps)||!steps.length)return fail('請至少加一個步驟。');
  if(steps.length>MAX_HYDRAULIC_STEPS)return fail(`步驟太多，最多 ${MAX_HYDRAULIC_STEPS} 步。`);
  const byId=new Map(syringes.map(c=>[c.id,c]));
  const begin={};
  for(const c of syringes){
    const v=start&&start[c.id]!==undefined?Number(start[c.id]):c.extension;
    if(!Number.isFinite(v)||v<0||v>c.spec.stroke)return fail(`起始：${c.id} 伸出量需在 0～${c.spec.stroke} mm 行程內。`);
    begin[c.id]=v;
  }
  const clean=[];
  for(let i=0;i<steps.length;i++){
    const s=steps[i],n=i+1,c=s&&byId.get(s.syringe);
    if(!s||typeof s!=='object')return fail(`第 ${n} 步：內容不完整。`);
    if(typeof s.name!=='string'||!s.name.trim())return fail(`第 ${n} 步：請填步驟名稱。`);
    if(!c)return fail(`第 ${n} 步：找不到針筒「${s.syringe}」。`);
    if(typeof s.extension!=='number'||!Number.isFinite(s.extension)||s.extension<0||s.extension>c.spec.stroke)return fail(`第 ${n} 步：伸出量需在 0～${c.spec.stroke} mm 行程內。`);
    if(typeof s.seconds!=='number'||!Number.isFinite(s.seconds)||s.seconds<MIN_STEP_SECONDS||s.seconds>MAX_STEP_SECONDS)return fail(`第 ${n} 步：時間需在 ${MIN_STEP_SECONDS}～${MAX_STEP_SECONDS} 秒。`);
    clean.push({name:s.name.trim(),syringe:s.syringe,extension:s.extension,seconds:s.seconds});
  }
  let previous=null,samples=0;
  const first=solveAt(source,begin,previous);
  if(!first.ok)return fail(`起始：${first.message}`);
  previous=first.points;samples++;
  const current={...begin};
  for(let i=0;i<clean.length;i++){
    const s=clean[i],from=current[s.syringe],count=Math.max(1,Math.ceil(Math.abs(s.extension-from)/SAMPLE_MM-1e-9));
    for(let k=1;k<=count;k++){
      const e=from+(s.extension-from)*k/count,r=solveAt(source,{...current,[s.syringe]:e},previous);samples++;
      if(!r.ok)return fail(`第 ${i+1} 步（${s.name}，${e.toFixed(1)} mm）：${r.message}`);
      previous=r.points;
    }
    current[s.syringe]=s.extension;
  }
  const duration=clean.reduce((t,s)=>t+s.seconds,0);
  return {ok:true,start:begin,steps:clean,duration,samples,solve:(extensions,prev=null)=>solveAt(source,extensions,prev)};
}

export function sequenceExtensionsAt(plan,seconds){
  const current={...plan.start};let elapsed=0;
  for(let i=0;i<plan.steps.length;i++){
    const s=plan.steps[i],end=elapsed+s.seconds;
    if(seconds<=end){
      const f=Math.min(1,Math.max(0,(seconds-elapsed)/s.seconds));
      return {extensions:{...current,[s.syringe]:current[s.syringe]+(s.extension-current[s.syringe])*f},index:i};
    }
    current[s.syringe]=s.extension;elapsed=end;
  }
  return {extensions:current,index:plan.steps.length-1};
}

// 針筒下拉選單用：以模組名稱命名（升降 針筒／夾爪 針筒）。
export function sequenceSyringeOptions(source){return assemblySyringeControls(syringesOf(source),source.modules||[]);}
