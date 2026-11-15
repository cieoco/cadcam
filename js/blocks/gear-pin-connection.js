import {localHoles,holeWorld} from '../core/local-holes.js';
import {fusionRoot,inspectBarFusionData} from '../core/bar-fusion.js';
import {pointKeysFor} from './part-types.js';

const keys=c=>pointKeysFor(c).map(k=>c[k]).filter(Boolean);
export const gearPinHoles=c=>[...keys(c),...localHoles(c).map(h=>({...h,...holeWorld(c,h)}))];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function gearPinMember(comps,params,id,positions={}){
 const owners=comps.filter(c=>['bar','triangle'].includes(c.type)&&gearPinHoles(c).some(p=>p.id===id));
 if(!owners.length)return null;
 const roots=[...new Set(owners.map(c=>fusionRoot(comps,c.id)||c))];if(roots.length!==1)return null;
 const root=roots[0],fusion=root.barFusion&&inspectBarFusionData(comps,root,params);if(fusion&&!fusion.ok)return null;
 const members=fusion?fusion.members:[root],ids=new Set(members.map(c=>c.id));
 if(comps.some(c=>c.pinLocks?.some(r=>ids.has(c.id)||ids.has(r.with))))return null;
 if(members.some(c=>c.boxPanel||c.fusedWith||c.motorMount||c.isInput||c.physicalMotor||c.motorCarrier||c.fixedLen===false))return null;
 const raw=[...new Map(members.flatMap(gearPinHoles).map(p=>[p.id,p])).values()];
 if(raw.some(p=>p.type==='fixed'||p.type==='motor'||p.physicalMotor))return null;
 const nodeIds=new Set(raw.map(p=>p.id)),outside=comps.filter(c=>!ids.has(c.id));
 const joints=outside.flatMap(c=>gearPinHoles(c).filter(p=>nodeIds.has(p.id)).map(p=>({comp:c,id:p.id})));
 const gears=[...new Set(joints.map(j=>j.comp))];if(gears.length!==1||gears[0].type!=='gear')return null;
 const gear=gears[0];if((gear.moduleId||'')!==(root.moduleId||''))return null;
 if(outside.some(c=>c.type==='syringe'&&['a','b'].some(k=>ids.has(c[k]?.componentId))||ids.has(c.motorCarrier)||ids.has(c.motorMount?.frameBody)||ids.has(c.fusedWith)))return null;
 const points=raw.map(p=>({...p,...(finite(positions[p.id])?positions[p.id]:{})}));
 if(points.some(p=>!finite(p)))return null;
 return {members,ids,root,gear,points,joints:[...new Set(joints.map(j=>j.id))]};
}
export function gearPivotRotation(comps,params,id,positions={}){
 const member=gearPinMember(comps,params,id,positions);
 if(!member||member.joints.length!==1||member.joints[0]===id)return null;
 const pivot=member.points.find(p=>p.id===member.joints[0]),end=member.points.find(p=>p.id===id);
 if(!pivot||!end||distance(pivot,end)<1e-6)return null;
 return {...member,pivot,end,length:distance(pivot,end),angle:Math.atan2(end.y-pivot.y,end.x-pivot.x)*180/Math.PI};
}
function rotateMembers(context,angle){
 const cos=Math.cos(angle),sin=Math.sin(angle),p=context.pivot;
 const pose=new Map(context.points.map(q=>[q.id,{x:p.x+(q.x-p.x)*cos-(q.y-p.y)*sin,y:p.y+(q.x-p.x)*sin+(q.y-p.y)*cos}]));
 for(const c of context.members)for(const q of keys(c)){const at=pose.get(q.id);if(at)Object.assign(q,at);}
}
export function rotateGearPinnedPose(comps,params,id,target,{positions={}}={}){
 const context=gearPivotRotation(comps,params,id,positions);if(!context||!finite(target))return null;
 const p=context.pivot,angle=Math.atan2(target.y-p.y,target.x-p.x)-Math.atan2(context.end.y-p.y,context.end.x-p.x);
 rotateMembers(context,angle);
 return {matched:true};
}
