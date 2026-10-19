// Optional lesson sequence; no solver dependencies in snapshot normalization.
export function normalizeLessonSequence(value) {
  const motors=['1','2','2','1','2','1'];
  if(!Array.isArray(value)||value.length!==6)return null;
  if(value.some((s,i)=>!s||s.motor!==motors[i]||!Number.isFinite(s.angle)||s.angle<(s.motor==='1'?-40:0)||s.angle>(s.motor==='1'?60:30)||!Number.isFinite(s.seconds)||s.seconds<0.5||s.seconds>5))return null;
  return value.map(s=>({motor:s.motor,angle:s.angle,seconds:s.seconds}));
}

// 液壓動作序列 {start, steps}：只留格式正確的步驟（名稱、針筒、伸出量、0.5～5 秒），最多 20 步；沒有可用步驟就不存。
// 是否在針筒行程內由 prepareHydraulicSequence 在驗證時說明，這裡不依賴 solver。
export function normalizeHydraulicSequence(value, syringeIds) {
  if(!value||typeof value!=='object'||!Array.isArray(value.steps))return null;
  const known=syringeIds?new Set(syringeIds):null;
  const steps=[];
  for(const s of value.steps){
    if(steps.length>=20)break;
    if(!s||typeof s!=='object'||typeof s.name!=='string'||!s.name.trim()||typeof s.syringe!=='string'||!s.syringe)continue;
    if(known&&!known.has(s.syringe))continue;
    if(typeof s.extension!=='number'||!Number.isFinite(s.extension)||s.extension<0)continue;
    if(typeof s.seconds!=='number'||!Number.isFinite(s.seconds)||s.seconds<0.5||s.seconds>5)continue;
    steps.push({name:s.name.trim().slice(0,40),syringe:s.syringe,extension:s.extension,seconds:s.seconds});
  }
  if(!steps.length)return null;
  const start={};
  if(value.start&&typeof value.start==='object'&&!Array.isArray(value.start))
    for(const [id,v] of Object.entries(value.start))if((!known||known.has(id))&&typeof v==='number'&&Number.isFinite(v)&&v>=0)start[id]=v;
  return {start,steps};
}
