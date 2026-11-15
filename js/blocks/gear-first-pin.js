// First gear pin candidates use the existing shared-point and connection-edit flow.
import {localHoles,holeWorld} from '../core/local-holes.js';
import {fusionRoot,inspectBarFusionData} from '../core/bar-fusion.js';
import {pointKeysFor} from './part-types.js';
import {pointCoords,pointRefs} from './model.js';
import {partName} from './selection-target.js';
import {freezeDisplayedPose} from './pose-freeze.js';

const points=c=>[...pointKeysFor(c).map(k=>c[k]).filter(Boolean),...localHoles(c).map(h=>({...h,...holeWorld(c,h)}))];
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fail=message=>({ok:false,message});
export function firstGearPinTargets(work,drop,from,to){
 const coords={...pointCoords(drop.comps),...drop.points},at=coords[to];if(!at)return [];
 const owners=new Set(pointRefs(drop.comps,from).map(r=>r.comp.id));
 const targets=[];
 for(const c of drop.comps.filter(c=>!owners.has(c.id)))for(const p of points(c)){
  if(gap(coords[p.id]||p,at)>.001||p.id===from)continue;
  const gear=c.type==='gear'&&localHoles(c).some(h=>h.id===p.id);
  if(!gear&&!['bar','triangle','anchor'].includes(c.type))continue;
  if(targets.some(t=>t.id===p.id))continue;
  targets.push({kind:'node',id:p.id,gearId:gear?c.id:null,label:`「${partName(c)}」${gear?'的齒輪固定孔':'的孔'}`});
 }
 // A visible gear fastening hole owns a drop; the carrier underneath does
 // not add another choice. Only multiple gear targets remain ambiguous.
 return targets.filter(t=>t.gearId);
}

export function planFirstGearPin(work,drop,from,to,gearId){
 const comps=structuredClone(drop.comps),params={...work.params},gear=comps.find(c=>c.id===gearId&&c.type==='gear'),refs=pointRefs(comps,from).filter(r=>['bar','triangle'].includes(r.comp.type));
 const roots=[...new Set(refs.map(r=>fusionRoot(comps,r.comp.id)||r.comp))];
 if(roots.length!==1||!gear)return fail('請選擇自由彎桿的一個孔與齒輪固定孔。');
 const root=roots[0],fusion=root.barFusion&&inspectBarFusionData(comps,root,params);if(fusion&&!fusion.ok)return fail(fusion.reason);
 const members=fusion?fusion.members:[root],ids=new Set(members.map(c=>c.id)),own=new Set(members.flatMap(points).map(p=>p.id));
 const other=comps.find(c=>!ids.has(c.id)&&points(c).some(p=>own.has(p.id)));
 if(other)return fail(`彎桿目前接在「${partName(other)}」的孔，還未接到齒輪；請先拔除原接點的插銷，再接齒輪固定孔。`);
 if(members.some(c=>c.boxPanel||c.fusedWith||c.isInput||c.physicalMotor||c.motorMount||c.motorCarrier||c.fixedLen===false||points(c).some(p=>['fixed','motor'].includes(p.type)||p.physicalMotor)))return fail('請先解除彎桿的固定或動力，再接齒輪固定孔。');
 if((root.moduleId||'')!==(gear.moduleId||''))return fail('不同模組請使用組立接口接合。');
 const attachment=comps.some(c=>!ids.has(c.id)&&(ids.has(c.motorCarrier)||ids.has(c.motorMount?.frameBody)||ids.has(c.fusedWith)||c.type==='syringe'&&['a','b'].some(k=>ids.has(c[k]?.componentId))));
 if(attachment)return fail('彎桿已有其他安裝關係，請先解除後再接齒輪。');
 const target=localHoles(gear).find(h=>h.id===to),coordinates={...pointCoords(comps),...drop.points},at=coordinates[to],start=coordinates[from];
 if(!target||!at||!start)return fail('找不到所選齒輪固定孔。');
 if(comps.some(c=>c!==gear&&!ids.has(c.id)&&points(c).some(p=>p.id===to)))return fail('齒輪固定孔已被使用，請選另一孔。');
 // A solved gear pose can differ from its saved seed (for example after
 // unlocking and reopening). Keep the entire connected target group in the
 // displayed frame before identifying the new hole, without changing phase.
 if(pointKeysFor(gear).some(k=>gear[k]&&coordinates[gear[k].id]&&gap(gear[k],coordinates[gear[k].id])>1e-6)){
  const group=new Set([gear.id]),nodes=new Set(points(gear).map(p=>p.id));let grew=true;
  while(grew){grew=false;for(const c of comps){
   if(group.has(c.id)||ids.has(c.id)||(c.moduleId||'')!==(gear.moduleId||''))continue;
   if(points(c).some(p=>nodes.has(p.id))||c.type==='gear'&&comps.some(g=>group.has(g.id)&&g.type==='gear'&&(c.mesh===g.id||g.mesh===c.id))){group.add(c.id);points(c).forEach(p=>nodes.add(p.id));grew=true;}
  }}
  const targetGroup=comps.filter(c=>group.has(c.id));freezeDisplayedPose(targetGroup,gear.id,coordinates);
  for(const c of targetGroup)for(const k of pointKeysFor(c)){const p=c[k],q=p&&coordinates[p.id];if(q)Object.assign(p,{x:q.x,y:q.y});}
 }

 for(const c of members){
  const pairs=c.type==='bar'?[[c.p1,c.p2,c.lenParam]]:[[c.p1,c.p2,c.gParam],[c.p1,c.p3,c.r1Param],[c.p2,c.p3,c.r2Param]];
  if(pairs.some(([a,b,k])=>!Number.isFinite(params[k])||Math.abs(gap(coordinates[a.id]||a,coordinates[b.id]||b)-params[k])>.001))return fail('彎桿孔距與設定不一致，這次未接合。');
  for(const k of pointKeysFor(c)){const p=c[k];if(!p)continue;const shown=coordinates[p.id]||p;p.x=shown.x+at.x-start.x;p.y=shown.y+at.y-start.y;if(p.id===from)p.id=to;}
  for(const h of localHoles(c))if(h.id===from)h.id=to;
  for(const p of c.barFusion?.points||[])if(p.id===from)p.id=to;
 }
 return {ok:true,comps,params,retarget:[from,to],clearSelection:false,message:'已插入可轉插銷；可繞此孔旋轉，或再放第二支插銷。'};
}
