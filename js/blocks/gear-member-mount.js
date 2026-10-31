import {fusionRoot,inspectBarFusionData} from '../core/bar-fusion.js';
import {pointKeysFor,ownedParamKeys} from './part-types.js';
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';

const fail=reason=>({ok:false,reason});
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const pointsOf=c=>pointKeysFor(c).map(k=>c[k]).filter(Boolean);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const near=(a,b)=>finite(a)&&finite(b)&&distance(a,b)<.001;
export const gearOutputRadius=(gear,params)=>gear.pinRadiusParam?Number(params[gear.pinRadiusParam]):
  Number.isFinite(gear.pinRadius)?gear.pinRadius:Number(params[gear.radiusParam])*.6;

/** Existing point IDs express the two-hole attachment. No new snapshot relation. */
export function gearMountMember(source,id,positions={}) {
  const selected=source.comps.find(c=>c.id===id);
  if(!selected||!['bar','triangle'].includes(selected.type))return fail('請先選連桿或板件。');
  const root=fusionRoot(source.comps,id);
  const fused=root&&inspectBarFusionData(source.comps,root,source.params);
  if(fused&&!fused.ok)return fused;
  const members=fused?fused.members:[selected],ids=new Set(members.map(c=>c.id));
  if(members.some(c=>c.boxPanel||c.fusedWith||c.isInput||c.physicalMotor||c.motorMount||c.motorCarrier||c.fixedLen===false||c.style==='piston'))
    return fail('請選未安裝的剛性桿件；已合成齒輪、盒體或動力零件不支援搬移安裝。');
  const refs=[...new Map(members.flatMap(pointsOf).map(p=>[p.id,p])).values()];
  const nodeIds=new Set([...refs.map(p=>p.id),...members.flatMap(c=>(c.holes||[]).map(h=>h.id))]);
  const usedByInterface=v=>typeof v==='string'?(nodeIds.has(v)||ids.has(v)):!!v&&typeof v==='object'&&Object.values(v).some(usedByInterface);
  if((source.modules||[]).some(usedByInterface))return fail('此零件已用於模組介面，請先建立獨立副本。');
  if(members.flatMap(pointsOf).some(p=>p.type!=='floating'||p.physicalMotor||p.physical_motor))return fail('此零件已有固定或動力孔，請使用未固定的副本。');
  const outside=source.comps.filter(c=>!ids.has(c.id));
  if(outside.some(c=>pointsOf(c).some(p=>nodeIds.has(p.id))||[c.a?.componentId,c.b?.componentId,c.outputId,c.motorCarrier,c.motorMount?.hostBody,c.motorMount?.outputBody].some(v=>ids.has(v))||
    [c.motorMountPoint,c.mountLocatorPoint].some(v=>nodeIds.has(v))))return fail('此零件已接到其他零件；請先建立獨立副本，再安裝到齒輪。');
  const points=refs.map(p=>({...p,...(finite(positions[p.id])?positions[p.id]:{})}));
  // Rigid unions retain their saved local shape, even when a free part has no solved pose.
  if(fused){
    const a=points.find(p=>p.id===root.p1.id),b=points.find(p=>p.id===root.p2.id),angle=Math.atan2(b.y-a.y,b.x-a.x);
    const origin=finite(positions[root.p1.id])?positions[root.p1.id]:root.p1;
    for(const p of points){const q=fused.points[p.id];p.x=origin.x+q.x*Math.cos(angle)-q.y*Math.sin(angle);p.y=origin.y+q.x*Math.sin(angle)+q.y*Math.cos(angle);}
  }
  if(points.some(p=>!finite(p)))return fail('零件孔位無效。');
  const map=Object.fromEntries(points.map(p=>[p.id,p]));
  for(const c of members){
    const lengths=c.type==='bar'?[[c.p1,c.p2,c.lenParam]]:[[c.p1,c.p2,c.gParam],[c.p1,c.p3,c.r1Param],[c.p2,c.p3,c.r2Param]];
    if(lengths.some(([a,b,key])=>!Number.isFinite(source.params[key])||Math.abs(distance(map[a.id],map[b.id])-source.params[key])>.001))return fail('零件姿態與孔距不符，請先修正尺寸。');
  }
  return {ok:true,members,ids,points,root,selected};
}

export function planGearMemberMount(source,request,{positions={},motion={}}={}) {
  const member=gearMountMember(source,request.memberId,positions);if(!member.ok)return member;
  const gear=source.comps.find(c=>c.id===request.gearId&&c.type==='gear');
  if(!gear)return fail('請選擇要安裝的齒輪。');
  if(gear.moduleId!==member.selected.moduleId)return fail('兩件必須在同一設計內。');
  const a=member.points.find(p=>p.id===request.centerId),b=member.points.find(p=>p.id===request.pinId);
  if(!a||!b||a.id===b.id)return fail('請在夾指上選兩個不同孔：軸心孔與定位孔。');
  const length=distance(a,b),radius=gearOutputRadius(gear,source.params),pitch=Number(source.params[gear.radiusParam]);
  if(!(length>=4&&length<=pitch-4)&&Math.abs(length-radius)>.001)return fail('所選兩孔太近或超出齒輪腹板可用範圍，請換一組孔。');
  if(!(radius>0)||!Number.isFinite(radius)||!Number.isFinite(pitch))return fail('齒輪孔距或節圓無效。');
  const mismatch=Math.abs(length-radius)>.001;
  if(mismatch&&!request.matchRadius)return {ok:false,reason:`夾指孔距 ${Number(length.toFixed(2))} mm，齒輪輸出孔距 ${radius} mm；請確認是否調整齒輪孔距。`,mismatch:true,length,radius};
  const changing=mismatch||request.flipPin===true;
  const external=source.comps.filter(c=>c.id!==gear.id&&!member.ids.has(c.id));
  if(changing&&external.some(c=>pointsOf(c).some(p=>p.id===gear.p2.id)||c.fusedWith===gear.id||c.pinion===gear.id||c.a?.componentId===gear.id||c.b?.componentId===gear.id||c.motorCarrier===gear.id||c.motorMount?.hostBody===gear.id))
    return fail('齒輪輸出已連接其他零件，不能修改孔距或定位孔方向。');
  if(mismatch&&gear.pinRadiusParam&&external.some(c=>ownedParamKeys(c).includes(gear.pinRadiusParam)))return fail('齒輪孔距參數與其他零件共用，不能自動修改。');
  const comps=structuredClone(source.comps),params={...source.params},target=comps.find(c=>c.id===gear.id);
  if(mismatch){if(target.pinRadiusParam)params[target.pinRadiusParam]=length;else target.pinRadius=length;}
  if(request.flipPin===true)target.phase=((Number(target.phase)||0)+180)%360;
  const scope=c=>c.moduleId===gear.moduleId;
  let base;
  try{base=solveTopology(compileTopology(comps.filter(c=>scope(c)&&!member.ids.has(c.id)),{params},new Set()),motion);}catch{return fail('齒輪目前無法求解，請先檢查動力與連接。');}
  const center=base.points?.[gear.p1.id],pin=base.points?.[gear.p2.id];
  if(!base.isValid||!finite(center)||!finite(pin)||Math.abs(distance(center,pin)-length)>.001)return fail('齒輪目前無法提供有效的兩孔安裝位置。');
  const angle=Math.atan2(pin.y-center.y,pin.x-center.x)-Math.atan2(b.y-a.y,b.x-a.x),cos=Math.cos(angle),sin=Math.sin(angle);
  const rename=id=>id===a.id?gear.p1.id:id===b.id?gear.p2.id:id;
  const world=Object.fromEntries(member.points.map(p=>[p.id,{x:center.x+(p.x-a.x)*cos-(p.y-a.y)*sin,y:center.y+(p.x-a.x)*sin+(p.y-a.y)*cos}]));
  for(const c of comps.filter(c=>member.ids.has(c.id))){
    for(const key of pointKeysFor(c)){const p=c[key];if(p)c[key]={...p,id:rename(p.id),...world[p.id]};}
    if(c.barFusion)c.barFusion.points.forEach(p=>{p.id=rename(p.id);});
  }
  // Store the target reference pose too; display and geometry exports share the same holes.
  Object.assign(target.p1,center);Object.assign(target.p2,pin);
  const expected=Object.fromEntries(Object.entries(world).map(([id,p])=>[rename(id),p]));
  let solved;
  try{solved=solveTopology(compileTopology(comps.filter(scope),{params},new Set()),{...motion,_prevPoints:{...positions,...base.points,...expected}});}catch{return fail('安裝後無法求解，尚未修改作品。');}
  if(!solved.isValid||Object.entries(expected).some(([id,p])=>!near(solved.points?.[id],p)))return fail('安裝後孔位無法保持，請檢查其他約束或改選孔位。');
  if(member.root&&!inspectBarFusionData(comps,comps.find(c=>c.id===member.root.id),params).ok)return fail('合成孔位資料不一致，尚未修改作品。');
  const references={tracePoint:rename(source.tracePoint||''),tracePoints:(source.tracePoints||[]).map(rename),referencePoint:rename(source.referencePoint||''),dimensions:structuredClone(source.dimensions||[])};
  for(const d of references.dimensions){
    for(const key of ['a','b'])if(d[key]?.pointId)d[key].pointId=rename(d[key].pointId);
    if(/^[hv]:/.test(d.baseline||''))d.baseline=d.baseline.slice(0,2)+rename(d.baseline.slice(2));
  }
  return {ok:true,comps,params,references,points:solved.points,memberIds:[...member.ids],gearId:gear.id,length,radius,mismatch,flipPin:request.flipPin===true};
}

export function commitGearMemberMount({plan,revision,fingerprint,pushUndo,apply}) {
  if(fingerprint()!==revision)return '作品已變更，請取消後重新開啟安裝。';
  if(!plan?.ok)return plan?.reason||'請先完成兩孔安裝預覽。';
  pushUndo();apply(plan);return '';
}
