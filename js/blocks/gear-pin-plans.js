// One already shared gear hole leaves a rigid member free to turn about that
// hole. Shared IDs express both the first pin and the eventual second pin.
 // Other attachment fields must not be moved as a side effect of rotating.
// Rotate the candidate without changing dimensions.

/** Mutates only the dragged candidate. A second pin must match the existing
 * radius exactly; proximity never changes hole spacing or the gear angle. */
// Commit/release candidates stay on the existing lazy connection-edit path.
import {gearPinMember,gearPivotRotation,gearPinHoles} from './gear-pin-connection.js';
import {localHoles,holeWorld} from '../core/local-holes.js';
import {pointKeysFor} from './part-types.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';
const keys=c=>pointKeysFor(c).map(k=>c[k]).filter(Boolean);
const holes=gearPinHoles;
const fixedHoles=c=>localHoles(c).map(h=>({...h,...holeWorld(c,h)}));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const fail=message=>({ok:false,message});

export function planGearPinConnection(work,drop,request){
 const comps=structuredClone(drop.comps),params={...work.params},context=gearPivotRotation(comps,params,request.dragId,drop.points||{});
 if(!context||context.root.id!==request.memberId||context.gear.id!==request.gearId)return fail('原本的一孔連接已變更，請重新拖曳。');
 for(const c of context.members){const pairs=c.type==='bar'?[[c.p1,c.p2,c.lenParam]]:[[c.p1,c.p2,c.gParam],[c.p1,c.p3,c.r1Param],[c.p2,c.p3,c.r2Param]];if(pairs.some(([a,b,k])=>!Number.isFinite(params[k])||Math.abs(distance(a,b)-params[k])>.001))return fail('彎桿孔距與設定不一致，這次未接合。');}
 const a=context.points.find(p=>p.id===request.from),b0=fixedHoles(context.gear).find(p=>p.id===request.to),b=drop.points?.[request.to]||b0;
 if(!a||!b0||context.joints.includes(a.id)||distance(a,b)>.001)return fail('第二孔尚未對齊；孔距不合時請保留單孔旋轉。');
 if(comps.some(c=>!context.ids.has(c.id)&&c!==context.gear&&holes(c).some(p=>p.id===b0.id)))return fail('第二孔已被其他零件使用，請選另一孔。');
 for(const c of context.members){for(const p of keys(c))if(p.id===a.id)p.id=b0.id;for(const h of localHoles(c))if(h.id===a.id)h.id=b0.id;for(const p of c.barFusion?.points||[])if(p.id===a.id)p.id=b0.id;}
 let result;try{result=solveTopology(compileTopology(comps,{params},new Set()),{thetaDeg:drop.theta,motorAngles:drop.angles,_prevPoints:drop.points});}catch{return fail('雙孔接合目前無法核對，尚未修改作品。');}
 // Unrelated unfinished parts do not block a locally verified assembly.
 const expected=context.points.map(p=>p.id===a.id?{...p,id:b0.id}:p);
 if(expected.some(p=>!finite(result.points[p.id])||distance(p,result.points[p.id])>.01))return fail('雙孔接合會改變零件姿態，尚未修改作品。');
 return {ok:true,comps,params,retarget:[a.id,b0.id],clearSelection:false,message:'已插入第二支插銷；兩件由兩孔定位，可復原或拔除。'};
}

export function planReleaseGearPin(work,id){
 const context=gearPinMember(work.comps,work.params,id,work.points||{});
 if(!context||context.joints.length!==2||!context.joints.includes(id))return null;
 const comps=structuredClone(work.comps),ids=new Set(comps.flatMap(holes).map(p=>p.id));let fresh=`${context.root.id}.released`,n=1;while(ids.has(fresh))fresh=`${context.root.id}.released${n++}`;
 for(const c of comps.filter(c=>context.ids.has(c.id))){for(const p of keys(c)){const shown=work.points?.[p.id];if(finite(shown))Object.assign(p,{x:shown.x,y:shown.y});if(p.id===id)p.id=fresh;}for(const h of localHoles(c))if(h.id===id)h.id=fresh;for(const p of c.barFusion?.points||[])if(p.id===id)p.id=fresh;}
 return {ok:true,comps,params:{...work.params},message:'已解除這一孔的固定；另一孔仍接在齒輪上，可繞它旋轉，可復原。'};
}
