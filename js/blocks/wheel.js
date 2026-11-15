import {planMotorInstallation,actuatorHostPoints} from './actuator-installation.js';
export const isWheel=c=>c?.type==='bar'&&c.shape==='disk'&&Number.isFinite(c.wheelWidthMm);
/** Purchased TT wheel: p2 is a rotation reference, never a drilled/connecting hole. */
export function planWheel(source,{motorId,diameterMm=65,widthMm=15,position={x:0,y:0},moduleId},motion={}){
 const fail=message=>({ok:false,message});
 if(!Number.isFinite(diameterMm)||diameterMm<20||diameterMm>2000||!Number.isFinite(widthMm)||widthMm<1||widthMm>100)return fail('輪徑須為20–2000 mm，輪寬須為1–100 mm。');
 const motor=source.comps.find(c=>c.id===motorId&&c.type==='motor'&&c.motorType==='tt');
 if(motorId&&!motor)return fail('請選尚未接輸出的 TT 馬達；不覆蓋既有輸出。');
 if(!Number.isFinite(position.x)||!Number.isFinite(position.y))return fail('輪子位置須為有效數值。');
 const mount=motor?.motorMount||{},host=source.comps.find(c=>c.id===mount.frameBody);
 const hostEnd=host&&actuatorHostPoints(host).find(p=>p.id===motor.p1.id)?.key;
 if(host&&!hostEnd)return fail('找不到馬達在承載板上的軸心孔。');
 let n=1;while(source.comps.some(c=>c.id===`Wheel${n}`)||Object.hasOwn(source.params,`WheelRadius${n}`))n++;
 const id=`Wheel${n}`,lenParam=`WheelRadius${n}`,a=motor?.p1||{...position};
 if(!motor){
  // Place beside existing material rather than silently attaching to a nearby motor.
  let right=-Infinity;
  const visit=(value,pad)=>{if(!value||typeof value!=='object')return;if(Number.isFinite(value.x)&&Number.isFinite(value.y))right=Math.max(right,value.x+pad);else Object.values(value).forEach(v=>visit(v,pad));};
  for(const c of source.comps)visit(c,Math.max(60,(c.diameterMm||0)/2, c.standardBlank?.heightMm||0, c.standardBlank?.lengthMm||0));
  if(Number.isFinite(right))a.x=Math.max(a.x,right+diameterMm/2+16);
 }
 const comp={type:'bar',id,name:'TT 輪子',shape:'disk',diameterMm,wheelWidthMm:widthMm,
  color:'#374151',frameSeparate:true,fixedLen:true,snapLength:false,isInput:false,lenParam,
  p1:{id:`${id}.center`,type:'floating',x:a.x,y:a.y},p2:{id:`${id}.direction`,type:'floating',x:a.x+8,y:a.y},
  ...((motor?.moduleId||moduleId)?{moduleId:motor?.moduleId||moduleId}:{})};
 const draft={...source,comps:[...source.comps,comp],params:{...source.params,[lenParam]:8}};
 if(!motor)return {...draft,ok:true,wheelId:id};
 const plan=planMotorInstallation(draft,{existingId:motor.id,outputId:id,outputEnd:'p1',hostId:host?.id||'world',hostEnd:hostEnd||'p1',type:'tt',face:mount.face||'back',orientation:mount.orientation||'horizontal',angleDeg:mount.angleDeg||0,reversed:!!mount.reversed},{},motion);
 if(!plan.ok)return plan;
 // Attaching an output does not change the plate's existing preferred mount hole.
 for(const c of plan.comps){const original=source.comps.find(o=>o.id===c.id);if(original&&Object.hasOwn(original,'motorMountPoint'))c.motorMountPoint=original.motorMountPoint;}
 return {...plan,wheelId:id};
}
