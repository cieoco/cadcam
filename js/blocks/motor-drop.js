import {blankGeometry,isOutputBlank} from './standard-blank.js';
import {pointKeysFor} from './part-types.js';
import {actuatorHostPoints,actuatorPoint,planMotorInstallation} from './actuator-installation.js';
import {motorCarrierFrame,resolveMotorOrientation} from './motor-orientation.js';
import {isFreeBody} from './model.js';
import {gearLabel} from './gear-plan.js';
import {localHoles} from '../core/local-holes.js';
import {sameGearBody} from '../core/gear-train.js';

const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i].y>p.y)!==(ring[j].y>p.y)&&p.x<(ring[j].x-ring[i].x)*(p.y-ring[i].y)/(ring[j].y-ring[i].y)+ring[i].x)hit=!hit;return hit;};
/** A drop selects a real carrier and its nearest available grid hole. The
 * installation planner owns hole geometry, occupancy, validation and identity. */
export function planMotorDrop(source,request,points={},motion={}){
 const at=request.position;if(!at||![at.x,at.y].every(Number.isFinite))return {matched:false};
 const old=source.comps.find(c=>c.id===request.existingId),scope=old?.moduleId||source.moduleId||'';
 const hosts=source.comps.filter(c=>c!==old&&c.standardBlank&&!isOutputBlank(c)&&['bar','plate'].includes(c.standardBlank.kind)&&(c.moduleId||'')===scope).filter(c=>{
  const ring=blankGeometry(c,pointKeysFor(c).map(k=>points[c[k]?.id]||c[k]).filter(Boolean));return ring&&inside(at,ring);
 });
 if(!hosts.length)return {matched:false};
 if(hosts.length>1)return {matched:true,ok:false,message:`此處重疊 ${hosts.map(c=>c.name||c.id).join('、')}；請在安裝設定選擇承載零件。`};
 const host=hosts[0],parked=new Set((host.standardBlank.mountHoles||[]).map(h=>h.id));
 const available=actuatorHostPoints(host).filter(p=>!parked.has(p.id));
 const hole=available.reduce((best,p)=>{const q=actuatorPoint(host,p.key,points),b=best&&actuatorPoint(host,best.key,points);return !b||Math.hypot(q.x-at.x,q.y-at.y)<Math.hypot(b.x-at.x,b.y-at.y)?p:best;},null);
 if(!hole)return {matched:true,ok:false,message:'這個承載零件沒有可用軸心孔，請先調整孔位。'};
 const center={...actuatorPoint(host,hole.key,points),id:hole.id};
 const desired=resolveMotorOrientation(request.orientation,{reversed:request.reversed,angleDeg:request.angleDeg}).dir;
 const base=resolveMotorOrientation('follow-frame',{center,carrier:motorCarrierFrame(host,center,points),reversed:request.reversed}).dir;
 const angleDeg=Math.atan2(desired.y*base.x-desired.x*base.y,desired.x*base.x+desired.y*base.y)*180/Math.PI;
 const next={...request,hostId:host.id,hostEnd:hole.key,position:center,orientation:'follow-frame',angleDeg,outputId:''};
 // Preserve the displayed pose when a carrier is currently away from its stored zero pose.
 const seed=structuredClone(source);for(const c of seed.comps)for(const k of pointKeysFor(c))if(c[k]&&points[c[k].id])Object.assign(c[k],points[c[k].id]);
 const result=planMotorInstallation(seed,next,points,motion);
 return {...result,matched:true,request:next,hostName:host.name||host.id};
}

/** A newly placed rod endpoint sharing an independent shaft means output,
 * not another housing mount. Preserve the existing actuator and its settings. */
export function planPlacedMotorOutput(source,outputId,points={},motion={}){
 const out=source.comps.find(c=>c.id===outputId&&(c.type==='bar'||c.type==='gear'&&!c.mesh));   // 驅動齒輪的輸出端是它的中心 p1
 if(!out||out.isInput||out.physicalMotor)return {matched:false};
 const matches=source.comps.filter(c=>c.type==='motor').flatMap(m=>(out.type==='gear'?['p1']:['p1','p2']).filter(k=>out[k]?.id===m.p1.id).map(end=>({m,end})));
 if(!matches.length)return {matched:false};
 const fail=message=>({matched:true,ok:false,message});
 if(matches.length!==1)return fail('桿件兩端接到不同動力軸，請在安裝設定選擇輸出來源。');
 const {m,end}=matches[0],mount=m.motorMount||{};
 if((out.moduleId||'')!==(m.moduleId||''))return fail('不同模組請使用組立接口接合。');
 const host=source.comps.find(c=>c.id===mount.frameBody);
 if(mount.frameBody&&!host)return fail('找不到馬達承載零件，請先修正外殼固定。');
 const hostEnd=host&&actuatorHostPoints(host).find(p=>p.id===m.p1.id)?.key;
 const angle=Number(motion.motorAngles?.[m.physicalMotor]??motion.thetaDeg??0);
 return {...planMotorInstallation(source,{...mount,type:m.motorType,existingId:m.id,
  hostId:host?.id||'world',hostEnd,outputId:out.id,outputEnd:end,
  start:m.servoStart,end:m.servoEnd,angle},points,motion),matched:true};
}

/** Existing loose rods use the same output installation as new rods.
 * A free driver gear (with the whole train it drives) is carried to the shaft the
 * same way: translate rigidly here, then planPlacedMotorOutput -> planMotorInstallation
 * (which already accepts a gear whose centre shares the shaft id) builds the data. */
export function planDraggedMotorOutput(source,fromId,toId,points={},motion={}){
 const motors=source.comps.filter(c=>c.type==='motor'&&c.p1.id===toId);
 if(!motors.length)return {matched:false};
 const fail=message=>({matched:true,ok:false,message});
 const rods=source.comps.filter(c=>c.type==='bar'&&[c.p1.id,c.p2.id].includes(fromId));
 const gears=source.comps.filter(c=>c.type==='gear'&&c.p1?.id===fromId);
 if(motors.length!==1||rods.length+(gears.length?1:0)>1)return fail('接孔對應多個零件，請在馬達安裝設定選擇輸出桿。');
 if(!rods.length&&gears.length)return planDraggedGearOutput(source,gears[0],motors[0],points,motion);
 if(!rods.length)return fail('這個接點不是桿件的端孔或齒輪的中心，不能直接接到馬達；請拖桿件端孔或齒輪中心，或在馬達安裝設定選擇輸出。');
 const out=rods[0];
 if(!isFreeBody(source.comps,out,source.modules))return fail('這支桿件已有其他連接，請先解除該連接，或在馬達安裝設定改接。');
 if((out.moduleId||'')!==(motors[0].moduleId||''))return fail('不同模組請使用組立接口接合。');
 const seed=structuredClone(source),rod=seed.comps.find(c=>c.id===out.id),key=rod.p1.id===fromId?'p1':'p2';
 const a=points[fromId]||rod[key],b=points[toId]||motors[0].p1,dx=b.x-a.x,dy=b.y-a.y;
 for(const k of ['p1','p2']){const p=points[rod[k].id]||rod[k];rod[k].x=p.x+dx;rod[k].y=p.y+dy;}
 rod[key].id=toId;
 // New coordinates must override the pre-snap display pose for both endpoints.
 const pose={...points,[toId]:{...b},[rod[key==='p1'?'p2':'p1'].id]:{...rod[key==='p1'?'p2':'p1']}};
 return planPlacedMotorOutput(seed,out.id,pose,motion);
}

/** The dragged driver gear + every gear meshed to it (directly or through a chain), coaxial gears,
 * and a rack with its guide pins move by one vector; the gear centre takes the shaft point id. */
function planDraggedGearOutput(source,gear,motor,points,motion){
 const fail=message=>({matched:true,ok:false,message}),name=gearLabel(gear,source.comps);
 if(gear.mesh)return fail(`${name}是被帶動的齒輪；請拖帶動它的齒輪，或先用「分開咬合」。`);
 if((gear.moduleId||'')!==(motor.moduleId||''))return fail('不同模組請使用組立接口接合。');
 const gearsAll=source.comps.filter(c=>c.type==='gear'),train=new Set([gear]);
 for(let grew=true;grew;){grew=false;for(const g of gearsAll)if(!train.has(g)&&[...train].some(t=>g.mesh===t.id||t.mesh===g.id||sameGearBody(g,t))){train.add(g);grew=true;}}
 const racks=source.comps.filter(c=>c.type==='rack'&&[...train].some(g=>g.id===c.pinion));
 const pinIds=new Set(racks.flatMap(r=>r.framePins||[])),pins=source.comps.filter(c=>c.type==='anchor'&&pinIds.has(c.p1?.id));
 const body=[...train,...racks,...pins],mine=new Set(body),guard=new Set(pins.map(c=>c.p1.id));
 const ids=new Set(body.flatMap(c=>[...pointKeysFor(c).map(k=>c[k]?.id),...localHoles(c).map(h=>h.id)]).filter(Boolean));
 const held=body.some(c=>pointKeysFor(c).some(k=>{const p=c[k];return p&&!guard.has(p.id)&&(p.type==='fixed'||p.physicalMotor);})||c.isInput||c.fusedWith||source.comps.some(o=>o.fusedWith===c.id))
  ||source.comps.some(o=>!mine.has(o)&&o!==motor&&[...pointKeysFor(o).map(k=>o[k]?.id),...localHoles(o).map(h=>h.id)].some(id=>ids.has(id)));
 if(held)return fail('這組齒輪已接上其他零件或固定孔，請先分開，或在馬達安裝設定改接。');
 const seed=structuredClone(source),mover=new Set(body.map(c=>c.id)),moved=seed.comps.filter(c=>mover.has(c.id));
 const at=points[gear.p1.id]||gear.p1,to=points[motor.p1.id]||motor.p1,dx=to.x-at.x,dy=to.y-at.y,pose={...points};
 for(const c of moved)for(const k of pointKeysFor(c)){const p=c[k];if(!p)continue;const q=points[p.id]||p;p.x=q.x+dx;p.y=q.y+dy;pose[p.id]={x:p.x,y:p.y};}
 const fromId=gear.p1.id;
 for(const c of moved)for(const k of pointKeysFor(c))if(c[k]?.id===fromId)c[k].id=motor.p1.id;
 // 被帶動的齒輪軸心沒有別的支撐就無法求解：和內建齒輪範例一樣固定在機架上（類型 fixed，座標不變）。
 for(const g of moved)if(g.type==='gear'&&g.p1.id!==motor.p1.id)g.p1.type='fixed';
 pose[motor.p1.id]={...to};
 const result=planPlacedMotorOutput(seed,gear.id,pose,motion);
 if(result.ok&&train.size>1)result.message=`已把${name}接到馬達輸出軸；嚙合的齒輪一起移到位並固定軸心。`;
 else if(result.ok)result.message=`已把${name}接到馬達輸出軸。`;
 return result;
}
