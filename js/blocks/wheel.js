import {planMotorInstallation,actuatorHostPoints} from './actuator-installation.js';
export const isWheel=c=>c?.type==='bar'&&c.shape==='disk'&&Number.isFinite(c.wheelWidthMm);
/** Purchased TT wheel: p2 is a rotation reference, never a drilled/connecting hole. */
export function planWheel(source,{motorId,diameterMm=65,widthMm=15},motion={}){
 const fail=message=>({ok:false,message});
 if(!Number.isFinite(diameterMm)||diameterMm<20||diameterMm>2000||!Number.isFinite(widthMm)||widthMm<1||widthMm>100)return fail('輪徑須為20–2000 mm，輪寬須為1–100 mm。');
 const motor=source.comps.find(c=>c.id===motorId&&c.type==='motor'&&c.motorType==='tt');
 if(!motor)return fail('請選尚未接輸出的 TT 馬達；不覆蓋既有輸出。');
 const mount=motor.motorMount||{},host=source.comps.find(c=>c.id===mount.frameBody);
 const hostEnd=host&&actuatorHostPoints(host).find(p=>p.id===motor.p1.id)?.key;
 if(host&&!hostEnd)return fail('找不到馬達在承載板上的軸心孔。');
 let n=1;while(source.comps.some(c=>c.id===`Wheel${n}`)||Object.hasOwn(source.params,`WheelRadius${n}`))n++;
 const id=`Wheel${n}`,lenParam=`WheelRadius${n}`,a=motor.p1;
 const comp={type:'bar',id,name:'TT 輪子',shape:'disk',diameterMm,wheelWidthMm:widthMm,
  color:'#374151',frameSeparate:true,fixedLen:true,snapLength:false,isInput:false,lenParam,
  p1:{id:`${id}.center`,type:'floating',x:a.x,y:a.y},p2:{id:`${id}.direction`,type:'floating',x:a.x+8,y:a.y},
  ...(motor.moduleId?{moduleId:motor.moduleId}:{})};
 const draft={...source,comps:[...source.comps,comp],params:{...source.params,[lenParam]:8}};
 const plan=planMotorInstallation(draft,{existingId:motor.id,outputId:id,outputEnd:'p1',hostId:host?.id||'world',hostEnd:hostEnd||'p1',type:'tt',face:mount.face||'back',orientation:mount.orientation||'horizontal',angleDeg:mount.angleDeg||0,reversed:!!mount.reversed},{},motion);
 if(!plan.ok)return plan;
 // Attaching an output does not change the plate's existing preferred mount hole.
 for(const c of plan.comps){const original=source.comps.find(o=>o.id===c.id);if(original&&Object.hasOwn(original,'motorMountPoint'))c.motorMountPoint=original.motorMountPoint;}
 return {...plan,wheelId:id};
}
