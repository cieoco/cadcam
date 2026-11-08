import {fixedSyringePointIds} from '../core/syringe.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';
import {syringeIssues} from '../core/syringe.js';
const fail=message=>({ok:false,message});
/** Set two existing holes fixed, without a new component kind or snapping its dimensions. */
export function planMemberFrame({comps,params,id,points={},motion={}}){
 const owner=comps.find(c=>c.id===id);
 if(!owner||!['bar','triangle'].includes(owner.type))return fail('請先選取桿件、板材或L型件。');
 if(owner.barFusionRoot||owner.barFusion||owner.boxPanel)return fail('此零件仍屬合成件或盒體，請先解除合成或在原組立設定固定。');
 const keys=['p1','p2','p3','m1','m2'],before=fixedSyringePointIds(comps);
 if([owner.p1,owner.p2].every(p=>p&&before.has(p.id)))return {ok:true,unchanged:true,comps};
 const pair=[owner.p1,owner.p2];
 if(pair.some(p=>!p||![p.x,p.y].every(Number.isFinite))||pair[0].id===pair[1].id||Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)<.001)return fail('需要兩個不同位置的有效孔，才能設為機架。');
 for(const [a,b,key] of [[owner.p1,owner.p2,owner.lenParam||owner.gParam],...(owner.p3?[[owner.p1,owner.p3,owner.r1Param],[owner.p2,owner.p3,owner.r2Param]]:[])])if(!Number.isFinite(params[key])||Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-params[key])>.001)return fail('目前孔位與設定孔距不一致，請先回到初始姿態；不會以固定操作改變形狀。');
 const ids=new Set(pair.map(p=>p.id)),newIds=new Set([...ids].filter(id=>!before.has(id)));
 if(owner.isInput||comps.some(c=>keys.some(k=>newIds.has(c[k]?.id)&&(c.isInput||c[k]?.type==='motor'||c[k]?.physicalMotor||c[k]?.physical_motor))))return fail('這些孔仍由馬達或致動器驅動，請先解除對應動力，再設為機架。');
 if([owner.p1,owner.p2,owner.p3].filter(Boolean).some(p=>points[p.id]&&Math.hypot(points[p.id].x-p.x,points[p.id].y-p.y)>.001))return fail('請先回到零件的初始姿態再設為機架；這次沒有移動孔位或改變桿長。');
 const next=structuredClone(comps);
 if(owner.type==='bar')next.find(c=>c.id===id).frameSeparate=true;
 for(const c of next){for(const k of keys)if(ids.has(c[k]?.id))c[k].type='fixed';for(const h of c.holes||[])if(ids.has(h.id))h.type='fixed';}
 const problems=next.filter(c=>c.type==='syringe').flatMap(c=>syringeIssues(c,next,params));
 if(problems.length)return fail('無法設為機架：'+problems.join(' '));
 try{
  const solved=solveTopology(compileTopology(next,{params},new Set()),{thetaDeg:0,...motion});
  if(!solved.isValid)return fail('固定後與現有連接衝突：'+(solved.errorReason||solved.reason||'請先調整連接或孔距。'));
  // Check the selected body's lengths even if other loose bodies remain underconstrained.
  for(const [a,b,key] of [[owner.p1,owner.p2,owner.lenParam||owner.gParam],...(owner.p3?[[owner.p1,owner.p3,owner.r1Param],[owner.p2,owner.p3,owner.r2Param]]:[])]){
   const x=solved.points[a.id],y=solved.points[b.id];if(!x||!y||Math.abs(Math.hypot(x.x-y.x,x.y-y.y)-Number(params[key]))>.001)return fail('固定後無法維持零件孔距，請先修正目前幾何。');
  }
  if(pair.some(p=>!solved.points[p.id]||Math.hypot(solved.points[p.id].x-p.x,solved.points[p.id].y-p.y)>.001))return fail('固定後孔位會移動，請先修正連接。');
  return {ok:true,comps:next,fixedIds:[...ids],points:solved.points};
 }catch(e){return fail('無法設為機架：'+e.message);}
}
