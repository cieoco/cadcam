// Optional lesson sequence; no solver dependencies in snapshot normalization.
export function normalizeLessonSequence(value) {
  const motors=['1','2','2','1','2','1'];
  if(!Array.isArray(value)||value.length!==6)return null;
  if(value.some((s,i)=>!s||s.motor!==motors[i]||!Number.isFinite(s.angle)||s.angle<(s.motor==='1'?-40:0)||s.angle>(s.motor==='1'?60:30)||!Number.isFinite(s.seconds)||s.seconds<0.5||s.seconds>5))return null;
  return value.map(s=>({motor:s.motor,angle:s.angle,seconds:s.seconds}));
}
