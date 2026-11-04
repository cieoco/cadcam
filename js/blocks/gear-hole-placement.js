import {pointKeysFor,ownedParamKeys} from './part-types.js';

const fail=reason=>({ok:false,reason});
export const normalizeHoleAngle=a=>((a%360)+360)%360;
export const outputRadius=(g,params)=>g.pinRadiusParam?Number(params[g.pinRadiusParam]):Number.isFinite(g.pinRadius)?g.pinRadius:Number(params[g.radiusParam])*.6;
export function outputPoint(g,params){
  const r=outputRadius(g,params),a=(Number(g.phase)||0)*Math.PI/180;
  return {x:g.p1.x+r*Math.cos(a),y:g.p1.y+r*Math.sin(a)};
}
/** Direct manipulation uses the same radius/phase as numeric editing; only the pointer is bounded. */
export function gearHoleAtPoint(gear,params,point){
  const max=Number(params[gear.radiusParam])-4,dx=point.x-gear.p1.x,dy=point.y-gear.p1.y;
  if(![max,dx,dy].every(Number.isFinite)||max<4)return null;
  const distance=Math.hypot(dx,dy);
  return {radius:Math.min(max,Math.max(4,Math.round(distance*10)/10)),
    angle:normalizeHoleAngle(Math.round((distance<1e-9?Number(gear.phase)||0:Math.atan2(dy,dx)*180/Math.PI)*10)/10)};
}
const refs=c=>pointKeysFor(c).map(k=>c[k]).filter(Boolean);
const fixed=(s,g)=>s.comps.some(c=>refs(c).some(p=>p.id===g.p1.id&&['fixed','motor'].includes(p.type)))&&!g.motorCarrier;

/** One-time hole placement at motor zero. No persistent mirroring constraint. */
export function planGearHolePlacement(source,{gearId,mode='manual',referenceId,radius,angle}){
  const gear=source.comps.find(c=>c.id===gearId&&c.type==='gear');
  if(!gear)return fail('請先選齒輪。');
  let reference=null;
  if(mode==='mirror'){
    reference=source.comps.find(c=>c.type==='gear'&&c.id===referenceId&&c.id!==gearId);
    if(!reference)return fail('請選另一顆齒輪作為對稱來源。');
    if(reference.moduleId!==gear.moduleId)return fail('請選同一設計內的齒輪。');
    if(!(gear.mesh===reference.id||reference.mesh===gear.id))return fail('對稱開合需使用互相嚙合的兩顆齒輪。');
    const pitch=Number(source.params[gear.radiusParam]),otherPitch=Number(source.params[reference.radiusParam]);
    if(gear.teeth!==reference.teeth||Math.abs(pitch-otherPitch)>.001)return fail('對稱開合需使用相同齒數與節圓的齒輪。');
    if(!fixed(source,gear)||!fixed(source,reference))return fail('請先固定兩顆齒輪的軸心，再設定對稱孔位。');
    const dx=gear.p1.x-reference.p1.x,dy=gear.p1.y-reference.p1.y;
    if(Math.abs(Math.hypot(dx,dy)-pitch-otherPitch)>.001)return fail('兩個軸心尚未對好嚙合距離，請先調整齒輪位置。');
    radius=outputRadius(reference,source.params);
    angle=2*Math.atan2(dy,dx)*180/Math.PI+180-(Number(reference.phase)||0);
  }else if(mode!=='manual')return fail('不支援的孔位設定方式。');
  const max=Number(source.params[gear.radiusParam])-4;
  if(!Number.isFinite(max)||max<4)return fail('齒輪節圓無效，無法設定孔位。');
  if(!Number.isFinite(radius)||radius<4||radius>max+1e-9)return fail(`孔距需介於 4～${Number(max.toFixed(2))} mm。`);
  if(!Number.isFinite(angle))return fail('請輸入有效的起始角度。');
  angle=normalizeHoleAngle(angle);
  const radiusChanged=Math.abs(radius-outputRadius(gear,source.params))>1e-9;
  const angleChanged=Math.abs(angle-normalizeHoleAngle(Number(gear.phase)||0))>1e-9;
  const changed=radiusChanged||angleChanged;
  const outside=source.comps.filter(c=>c.id!==gear.id);
  if(changed&&(gear.motorCarrier||outside.some(c=>refs(c).some(p=>p.id===gear.p2.id)||c.fusedWith===gear.id||c.pinion===gear.id||c.a?.componentId===gear.id||c.b?.componentId===gear.id||c.motorCarrier===gear.id||c.motorMount?.hostBody===gear.id||c.motorMount?.outputBody===gear.id||c.mountLocatorPoint===gear.p2.id||c.motorMountPoint===gear.p2.id)))
    return fail('輸出孔已連接其他零件，請先在未連接的齒輪設定孔位，再安裝夾指；可用復原退回安裝前。');
  const used=v=>typeof v==='string'?[gear.id,gear.p2.id].includes(v):!!v&&typeof v==='object'&&Object.values(v).some(used);
  if(changed&&(source.modules||[]).some(used))return fail('齒輪已用於模組介面，請先解除介面關聯再調整。');
  if(radiusChanged&&gear.pinRadiusParam&&outside.some(c=>ownedParamKeys(c).includes(gear.pinRadiusParam)))return fail('孔距參數與其他零件共用，無法單獨調整。');
  const comps=structuredClone(source.comps),params={...source.params},target=comps.find(c=>c.id===gear.id);
  target.phase=angle;
  if(target.pinRadiusParam)params[target.pinRadiusParam]=radius;else target.pinRadius=radius;
  Object.assign(target.p2,outputPoint(target,params));
  return {ok:true,changed,comps,params,gearId,referenceId:reference?.id,radius,angle};
}

export function commitGearHolePlacement({plan,revision,fingerprint,pushUndo,apply}){
  if(fingerprint()!==revision)return '作品已變更，請取消後重新設定。';
  if(!plan?.ok)return plan?.reason||'請先完成預覽。';
  if(plan.changed){pushUndo();apply(plan);}return '';
}
