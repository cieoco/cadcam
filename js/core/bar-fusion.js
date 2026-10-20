/** Persistent rigid bar unions. Local coordinates are relative to the root bar,
 * so module translation/rotation and ID remapping keep the same shape. */
const safe = id => typeof id === 'string' && /^[\w.-]+$/.test(id);
export const fusionRoot = (comps, id) => {
  const c = comps.find(c => c.id === id);
  return c?.barFusion ? c : comps.find(p => p.id === c?.barFusionRoot && p.barFusion) || null;
};
export const fusionAtPoint = (comps, id) => comps.find(c => c.barFusion?.points?.some(p => p.id === id)) || null;
export function barFusionSide(comps,id,aId,bId) {
  const data=comps.find(c=>[id,aId,bId].every(id=>c.barFusion?.points.some(p=>p.id===id)))?.barFusion.points;
  const p=data?.find(p=>p.id===id),a=data?.find(p=>p.id===aId),b=data?.find(p=>p.id===bId);
  return p&&a&&b ? (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x) : 0;
}
export function normalizeBarFusion(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.members) || raw.members.length < 2 || raw.members.length > 16
    || !raw.members.every(safe) || new Set(raw.members).size !== raw.members.length
    || !Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > 32
    || !raw.points.every(p => p && safe(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y))
    || new Set(raw.points.map(p => p.id)).size !== raw.points.length) return null;
  return {version:1,members:[...raw.members],points:raw.points.map(({id,x,y})=>({id,x,y}))};
}
export function inspectBarFusionData(comps, root, params = {}) {
  const fail = reason => ({ok:false,reason});
  const data = normalizeBarFusion(root?.barFusion);
  if (!data || root.type !== 'bar' || !data.members.includes(root.id)) return fail('合成資料不完整，請解除合成後重選。');
  const members = data.members.map(id => comps.find(c => c.id === id));
  if (members.some(c => !c || c.type !== 'bar' || c.moduleId !== root.moduleId || c.barFusionRoot !== root.id || (c !== root && c.barFusion))) return fail('合成成員已變更，請解除合成後重選。');
  if (members.filter(c => c.isInput).length > 1 || members.some(c => data.members.includes(c.motorCarrier))) return fail('同一片只能保留一個動力輸入，不能合併馬達承載與輸出。');
  const ids = new Set(members.flatMap(c => [c.p1?.id,c.p2?.id]));
  if (ids.size !== data.points.length || data.points.some(p => !ids.has(p.id))) return fail('合成孔位已變更，請先解除合成。');
  const points = Object.fromEntries(data.points.map(p => [p.id,p]));
  const a=points[root.p1.id], b=points[root.p2.id];
  if (Math.hypot(a.x,a.y)>1e-6 || Math.abs(b.y)>1e-6 || b.x<=0) return fail('合成基準孔無效。');
  for (const c of members) {
    const p=points[c.p1.id],q=points[c.p2.id],length=Number(params[c.lenParam]);
    if (Math.hypot(q.x-p.x,q.y-p.y)<1e-6) return fail('合成成員的長度無效。');
    if (Number.isFinite(length) && Math.abs(length-Math.hypot(q.x-p.x,q.y-p.y))>.001) return fail('合成後的孔距已變更，請先解除合成再調整尺寸。');
  }
  return {ok:true,data,members,points,length:b.x};
}
/** Add ordinary triangle constraints only to the solver input, never to saved
 * components or visible parts. Every pair is constrained, including collinear bars. */
export function expandBarFusions(comps, params) {
  const extra=[];
  for (const root of comps.filter(c=>c.barFusion)) {
    const f=inspectBarFusionData(comps,root,params);
    if(!f.ok)return {ok:false,reason:f.reason,comps};
    const refs=new Map(f.members.flatMap(c=>[c.p1,c.p2]).map(p=>[p.id,p]));
    const a=f.points[root.p1.id], rest=f.data.points.filter(p=>p.id!==a.id);
    for(let i=0;i<rest.length;i++)for(let j=i+1;j<rest.length;j++){
      const b=rest[i],c=rest[j];
      extra.push({type:'triangle',id:'fusion-'+root.id+'-'+i+'-'+j,p1:refs.get(a.id),p2:refs.get(b.id),p3:refs.get(c.id),
        gParam:Math.hypot(b.x,b.y),r1Param:Math.hypot(c.x,c.y),r2Param:Math.hypot(c.x-b.x,c.y-b.y),sign:b.x*c.y-b.y*c.x<0?-1:1});
    }
  }
  return {ok:true,comps:extra.length?[...comps,...extra]:comps};
}
export function validateBarFusionPose(comps, points) {
  for(const root of comps.filter(c=>c.barFusion)){
    const ps=root.barFusion.points;
    for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
      const a=points[ps[i].id],b=points[ps[j].id];
      if(!a||!b)continue; // The common solver reports unresolved points.
      if(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(ps[i].x-ps[j].x,ps[i].y-ps[j].y))>.001)return '合成零件無法保持固定孔距，請檢查固定點與外部連桿。';
    }
  }
  return '';
}
