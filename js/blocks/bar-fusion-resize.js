import {fusionRoot,inspectBarFusionData} from '../core/bar-fusion.js';
import {inspectBarFusion} from './bar-fusion-geometry.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';

/** Resize a bridge of the member graph; translate one entire side, never bend it.
 * All geometry/solver checks run on a candidate before the caller commits. */
export function planBarFusionResize(comps,params,id,value,{positions={},settings={},motion={}}={}) {
  const fail=reason=>({ok:false,reason}),root=fusionRoot(comps,id),member=comps.find(c=>c.id===id);
  const f=inspectBarFusionData(comps,root,params);if(!f.ok)return f;
  if(!Number.isFinite(value)||value<8||value>2000)return fail('孔距請填 8–2000 mm。');
  if(comps.some(c=>c.id!==id&&c.lenParam===member.lenParam))return fail('這段使用共用尺寸參數，請先解除合成再調整。');
  const adjacent=new Map(f.data.points.map(p=>[p.id,[]]));
  for(const c of f.members.filter(c=>c.id!==id)){adjacent.get(c.p1.id).push(c.p2.id);adjacent.get(c.p2.id).push(c.p1.id);}
  const walk=start=>{const seen=new Set([start]),queue=[start];for(const p of queue)for(const q of adjacent.get(p))if(!seen.has(q)){seen.add(q);queue.push(q);}return seen;};
  const first=walk(member.p1.id),second=walk(member.p2.id);
  if(first.has(member.p2.id))return fail('這段位於封閉環，單獨改長會改變夾角；請先解除合成。');
  if(first.size+second.size!==f.data.points.length)return fail('這片包含未共用孔位的桿段，無法判斷跟隨方向；請先解除合成。');
  const locked=new Set(comps.flatMap(c=>['p1','p2','p3'].map(k=>c[k])).filter(p=>p&&(p.type==='fixed'||p.type==='motor'||p.physicalMotor)).map(p=>p.id));
  const hasLock=side=>[...side].some(p=>locked.has(p));
  if(hasLock(first)&&hasLock(second))return fail('這段兩側都有固定點或馬達軸心，不能保持夾角並改變孔距。');
  const moving=hasLock(first)?second:hasLock(second)?first:first.has(root.p1.id)?second:first;
  const a=f.points[member.p1.id],b=f.points[member.p2.id],oldLength=Math.hypot(b.x-a.x,b.y-a.y);
  const delta=(value-oldLength)*(moving===second?1:-1),dx=(b.x-a.x)/oldLength*delta,dy=(b.y-a.y)/oldLength*delta;
  const local=f.data.points.map(p=>({...p,x:p.x+(moving.has(p.id)?dx:0),y:p.y+(moving.has(p.id)?dy:0)}));
  const origin=positions[root.p1.id]||root.p1,tip=positions[root.p2.id]||root.p2;
  const distance=Math.hypot(tip.x-origin.x,tip.y-origin.y);
  if(!(distance>1e-6))return fail('找不到有效的合成桿件姿態。');
  const ux=(tip.x-origin.x)/distance,uy=(tip.y-origin.y)/distance;
  const world=Object.fromEntries(local.map(p=>[p.id,{x:origin.x+p.x*ux-p.y*uy,y:origin.y+p.x*uy+p.y*ux}]));
  const base=local.find(p=>p.id===root.p1.id);
  // The root direction is unchanged by translation, including a p2 motor pivot.
  const data={...f.data,points:local.map(p=>({...p,x:p.x-base.x,y:p.y-base.y}))};
  const next=structuredClone(comps),nextParams={...params,[member.lenParam]:value};
  for(const c of next){
    for(const k of ['p1','p2','p3'])if(world[c[k]?.id])Object.assign(c[k],world[c[k].id]);
    if(c.id===root.id)c.barFusion=data;
    if(c.id===id)c.snapLength=false;
  }
  const geometry=inspectBarFusion(next,next.find(c=>c.id===root.id),nextParams,settings);
  if(!geometry.ok)return geometry;
  const solved=solveTopology(compileTopology(next,{params:nextParams},new Set()),{...motion,_prevPoints:{...positions,...world}});
  if(!solved.isValid||Object.entries(world).some(([id,p])=>!solved.points[id]||Math.hypot(solved.points[id].x-p.x,solved.points[id].y-p.y)>.001))
    return fail('修改後無法維持目前姿態與外部連接；請調整尺寸或先解除外部約束。');
  return {ok:true,comps:next,params:nextParams,points:solved.points,geometry:geometry.geometry};
}

/** Lazy UI transaction. A late module load must never overwrite newer edits. */
export function commitBarFusionResize({S,id,value,revision,fingerprint,positions,settings,comps,pause,pushUndo,rebuild,draw,notify}) {
  if(fingerprint()!==revision||S.selectedLinkId!==id){notify('作品已變更，請重新輸入尺寸。');return;}
  const motion={thetaDeg:S.theta,motorAngles:{...S.motorAngles,[String(S.activeMotor)]:S.theta}};
  const plan=planBarFusionResize(comps(),S.topo.params,id,value,{positions:positions(),settings:settings(),motion});
  if(!plan.ok){notify(plan.reason);draw();return;}
  pause();pushUndo();const byId=new Map(plan.comps.map(c=>[c.id,c]));
  S.comps=S.comps.map(c=>byId.get(c.id)||c);S.topo.params=plan.params;rebuild();draw();
}
