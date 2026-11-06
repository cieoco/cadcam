import {fusionRoot} from '../core/bar-fusion.js';
import {inspectBarFusion} from './bar-fusion-geometry.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';
import {frameConnectorNodes} from './model.js';

export function planBarFusion(comps,ids,params={},settings={},positions={},motion={}) {
  const fail=reason=>({ok:false,reason});
  const members=ids.map(id=>comps.find(c=>c.id===id));
  if(ids.length<2||ids.length>16||new Set(ids).size!==ids.length||members.some(c=>c?.type!=='bar'))return fail('請選 2～16 支連桿。');
  if(members.some(c=>c.shape==='disk'))return fail('圓盤保留獨立外徑，請用孔連接，不支援與連桿合成一片。');
  if(members.some(c=>c.moduleId!==members[0].moduleId))return fail('連桿必須在同一設計內。');
  if(members.some(c=>fusionRoot(comps,c.id)))return fail('請先解除既有合成，再重新選取連桿。');
  if(members.filter(c=>c.isInput).length>1 || members.some(c=>ids.includes(c.motorCarrier)))return fail('同一片只能保留一個動力輸入，不能合併馬達承載與輸出。');
  const syringes=comps.filter(c=>c.type==='syringe'&&[c.a?.componentId,c.b?.componentId,c.outputId,...(c.jawIds||[])].some(id=>ids.includes(id)));
  if(syringes.some(c=>ids.includes(c.a?.componentId)&&[c.b?.componentId,c.outputId,...(c.jawIds||[])].some(id=>ids.includes(id))||ids.includes(c.b?.componentId)&&ids.includes(c.outputId)))return fail('這些零件需要相對活動；合成會鎖住針筒或輸出關節，請只選要固定成同一片的零件。');
  const scope=comps.filter(c=>c.moduleId===members[0].moduleId),nodes=frameConnectorNodes(scope),groundIds=new Set(nodes.filter(p=>!p.outlineExempt).map(p=>p.id));
  const frame=members.find(c=>!c.frameSeparate&&[c.p1,c.p2].every(p=>groundIds.has(p.id))&&(c.p1.frameStock||c.p2.frameStock||syringes.some(s=>s.a?.componentId===c.id)));
  if(frame&&scope.some(c=>[c.p1,c.p2,c.p3].some(p=>p?.physicalMotor&&groundIds.has(p.id))||c.motorMount))return fail('機架含馬達安裝特徵，尚不支援一起合成；請保留原機架與孔連接。');
  if(!frame&&syringes.some(s=>ids.includes(s.a?.componentId)&&['fixed-axis','pivot'].includes(s.mountMode)))return fail('此獨立承載板的固定環孔尚不支援合成，請保留孔連接。');
  const root=frame||members.find(c=>c.isInput)||members[0],a=positions[root.p1.id]||root.p1,b=positions[root.p2.id]||root.p2;
  const len=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
  if(!(len>0))return fail('基準桿長度無效。');
  const map=new Map();
  for(const c of members)for(const p of [c.p1,c.p2]){
    const q=positions[p.id]||p;
    map.set(p.id,{id:p.id,x:(q.x-a.x)*ux+(q.y-a.y)*uy,y:-(q.x-a.x)*uy+(q.y-a.y)*ux});
  }
  // Capture declared lengths rather than a frozen, unfinished mechanism pose.
  // Adjacent axes within one degree align in the candidate, never on selection.
  const repaired=members.some(c=>{const p=map.get(c.p1.id),q=map.get(c.p2.id);return Number.isFinite(params[c.lenParam])&&Math.abs(Math.hypot(q.x-p.x,q.y-p.y)-params[c.lenParam])>.001;});
  let straightened=false;
  {
    const placed=new Map([[root.p1.id,{...map.get(root.p1.id)}]]),axes=new Map(),pending=[root,...members.filter(c=>c!==root)];
    while(pending.length){
      let i=pending.findIndex(c=>placed.has(c.p1.id)||placed.has(c.p2.id));
      if(i<0){i=0;placed.set(pending[0].p1.id,{...map.get(pending[0].p1.id)});}
      const c=pending.splice(i,1)[0],p=map.get(c.p1.id),q=map.get(c.p2.id),distance=Math.hypot(q.x-p.x,q.y-p.y),length=Number.isFinite(Number(params[c.lenParam]))?Number(params[c.lenParam]):distance;
      if(!(distance>1e-6&&length>0&&Number.isFinite(length)))return fail('連桿尺寸無效，請先確認孔距。');
      const from=placed.has(p.id)?p:q,to=from===p?q:p,base=placed.get(from.id);
      let dx=(to.x-from.x)/distance,dy=(to.y-from.y)/distance;
      const near=axes.get(from.id)?.find(u=>Math.abs(u.x*dx+u.y*dy)+1e-12>=Math.cos(Math.PI/180));
      if(near){const sign=near.x*dx+near.y*dy<0?-1:1;straightened ||= Math.abs(near.x*dy-near.y*dx)>1e-10;dx=sign*near.x;dy=sign*near.y;}
      const target={id:to.id,x:base.x+dx*length,y:base.y+dy*length};
      if(placed.has(to.id)&&Math.hypot(placed.get(to.id).x-target.x,placed.get(to.id).y-target.y)>.001)return fail('目前夾角與孔距無法閉合，請先調整連桿再合成。');
      placed.set(to.id,target);
      for(const id of [from.id,to.id])axes.set(id,[...(axes.get(id)||[]),{x:dx,y:dy}]);
    }
    if(repaired||straightened)for(const [id,p]of placed)map.set(id,{...p,x:Math.abs(p.x)<1e-9?0:p.x,y:Math.abs(p.y)<1e-9?0:p.y});
  }
  const points=[...map.values()];
  if(points.some((p,i)=>points.slice(i+1).some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-5)))return fail('重合孔尚未連接，請先將它們吸附成同一接點。');
  const data={version:1,members:[...ids],points,...(frame?{framePointIds:[...groundIds]}:{})};
  const next=comps.map(c=>!ids.includes(c.id)?c:{...c,barFusionRoot:root.id,...(c.id===root.id?{barFusion:data}:{})});
  const result=inspectBarFusion(next,next.find(c=>c.id===root.id),params,settings);
  if(!result.ok)return result;
  if(repaired||straightened||syringes.length||frame){
    const scope=next.filter(c=>c.moduleId===root.moduleId);
    const solved=solveTopology(compileTopology(structuredClone(scope),{params:{...params}},new Set()),{...motion,_prevPoints:positions});
    if(!solved.isValid)return fail('合成後無法維持孔距與外部連接，請先調整連桿或針筒位置。');
    // Preview and commit use the same checked pose; no source coordinates mutate.
    const updated=next.map(c=>{if(c.moduleId!==root.moduleId)return c;const copy={...c};for(const k of ['p1','p2','p3','m1','m2'])if(solved.points[c[k]?.id])copy[k]={...c[k],...solved.points[c[k].id]};return copy;});
    return {...result,comps:updated,positions:{...positions,...solved.points},straightened};
  }
  return {...result,comps:next};
}
export function dissolveBarFusion(comps,id) {
  const root=fusionRoot(comps,id);
  if(!root)return comps;
  return comps.map(c=>c.barFusionRoot===root.id?(({barFusion,barFusionRoot,...rest})=>rest)(c):c);
}
