import {localHoles,holeWorld} from '../core/local-holes.js';
import {gearPivotRotation,gearPinHoles,rotateGearPinnedPose} from './gear-pin-connection.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Candidate matching belongs to the explicit pin tool, not ordinary pose dragging.
export function rotateGearPinnedMember(comps,params,id,target,{positions={},snapDistance=0}={}){
 const moved=rotateGearPinnedPose(comps,params,id,target,{positions});if(!moved)return null;
 const current=gearPivotRotation(comps,params,id),context=current,p=current.pivot,targets=localHoles(current.gear).map(h=>({...h,...holeWorld(current.gear,h)})).filter(q=>q.id!==p.id);
 const candidates=[];
 for(const a of current.points.filter(q=>q.id!==p.id))for(const b0 of targets){
  const b=positions[b0.id]||b0;
  if(Math.abs(distance(p,a)-distance(p,b))>.001||distance(a,b)>snapDistance)continue;
  if(comps.some(c=>!context.ids.has(c.id)&&c!==context.gear&&gearPinHoles(c).some(q=>q.id===b0.id)))continue;
  candidates.push({from:a.id,to:b0.id,gearId:context.gear.id,memberId:context.root.id,dragId:id});
 }
 if(candidates.length!==1)return {matched:true,ambiguous:candidates.length>1,candidates};
 const candidate=candidates[0],a=current.points.find(q=>q.id===candidate.from),b=positions[candidate.to]||targets.find(q=>q.id===candidate.to);
 rotateGearPinnedPose(comps,params,a.id,b);
 return {matched:true,candidate};
}
