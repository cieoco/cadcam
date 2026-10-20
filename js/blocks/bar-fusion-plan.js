import {fusionRoot} from '../core/bar-fusion.js';
import {inspectBarFusion} from './bar-fusion-geometry.js';

export function planBarFusion(comps,ids,params={},settings={},positions={}) {
  const fail=reason=>({ok:false,reason});
  const members=ids.map(id=>comps.find(c=>c.id===id));
  if(ids.length<2||ids.length>16||new Set(ids).size!==ids.length||members.some(c=>c?.type!=='bar'))return fail('請選 2～16 支連桿。');
  if(members.some(c=>c.moduleId!==members[0].moduleId))return fail('連桿必須在同一設計內。');
  if(members.some(c=>fusionRoot(comps,c.id)))return fail('請先解除既有合成，再重新選取連桿。');
  if(members.filter(c=>c.isInput).length>1 || members.some(c=>ids.includes(c.motorCarrier)))return fail('同一片只能保留一個動力輸入，不能合併馬達承載與輸出。');
  if(comps.some(c=>c.type==='syringe'&&[c.a?.componentId,c.b?.componentId,...(c.jawIds||[])].some(id=>ids.includes(id))))return fail('連桿已有針筒附件，請先卸下附件再合成。');
  const root=members.find(c=>c.isInput)||members[0],a=positions[root.p1.id]||root.p1,b=positions[root.p2.id]||root.p2;
  const len=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
  if(!(len>0))return fail('基準桿長度無效。');
  const map=new Map();
  for(const c of members)for(const p of [c.p1,c.p2]){
    const q=positions[p.id]||p;
    map.set(p.id,{id:p.id,x:(q.x-a.x)*ux+(q.y-a.y)*uy,y:-(q.x-a.x)*uy+(q.y-a.y)*ux});
  }
  const points=[...map.values()];
  if(points.some((p,i)=>points.slice(i+1).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-5)))return fail('重合孔尚未連接，請先將它們吸附成同一接點。');
  const data={version:1,members:[...ids],points};
  const next=comps.map(c=>!ids.includes(c.id)?c:{...c,barFusionRoot:root.id,...(c.id===root.id?{barFusion:data}:{})});
  const result=inspectBarFusion(next,next.find(c=>c.id===root.id),params,settings);
  return result.ok?{...result,comps:next}:result;
}
export function dissolveBarFusion(comps,id) {
  const root=fusionRoot(comps,id);
  if(!root)return comps;
  return comps.map(c=>c.barFusionRoot===root.id?(({barFusion,barFusionRoot,...rest})=>rest)(c):c);
}
