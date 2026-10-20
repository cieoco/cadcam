/** Rotary actuator candidates. No DOM, no global state and no extra solver. */
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';

const keys=['p1','p2','p3'];
export const actuatorSteps=['固定外殼','位置方向','連接輸出','試動確認'];
export const actuatorPoint=(c,key,points={})=>points[c?.[key]?.id] || c?.[key];
export function actuatorChoices(comps){
  return {hosts:comps.filter(c=>c.type==='bar'),outputs:comps.filter(c=>c.type==='bar'||c.type==='gear'&&!c.mesh)};
}
// Infer only existing shared joints. A loose endpoint can explicitly preview a
// world mount; never guess an endpoint or translate a connected part here.
export function quickMotorChoices(comps,outputId=''){
  const fixed=new Set(comps.flatMap(c=>keys.map(k=>c[k])).filter(p=>p?.type==='fixed').map(p=>p.id));
  const result=[];
  for(const out of actuatorChoices(comps).outputs){
    if(outputId&&out.id!==outputId||out.isInput||out.physicalMotor||keys.some(k=>out[k]?.physicalMotor))continue;
    if(out.type==='bar'&&[out.p1,out.p2].every(p=>fixed.has(p.id)))continue;
    for(const end of out.type==='gear'?['p1']:['p1','p2']){
      const node=out[end];if(!node)continue;
      if(out.type==='bar'&&fixed.has(out[end==='p1'?'p2':'p1'].id))continue;
      const shared=comps.filter(c=>c!==out&&keys.some(k=>c[k]?.id===node.id));
      const hosts=shared.filter(c=>c.type==='bar'&&['p1','p2'].some(k=>c[k]?.id===node.id));
      for(const host of hosts)result.push({nodeId:node.id,outputId:out.id,outputEnd:end,hostId:host.id,
        hostEnd:host.p1.id===node.id?'p1':'p2',orientation:'follow-frame',face:'back'});
      if(!shared.length||shared.every(c=>c.type==='anchor'&&fixed.has(c.p1.id)))result.push({nodeId:node.id,outputId:out.id,outputEnd:end,hostId:'world',
        hostEnd:'p1',orientation:'horizontal',face:'back'});
    }
  }
  return result;
}
export function planMotorInstallation(source,request,points={},motion={}){
  const comps=structuredClone(source.comps),params={...source.params};
  const fail=message=>({ok:false,message});
  const out=comps.find(c=>c.id===request.outputId&&['bar','gear'].includes(c.type));
  const former=comps.find(c=>c.id===request.existingId);
  const formerMotor=former&&(former.physicalMotor||keys.map(k=>former[k]?.physicalMotor).find(Boolean));
  const host=request.hostId==='world'?null:comps.find(c=>c.id===request.hostId&&c.type==='bar');
  if(!host&&request.hostId!=='world')return fail('請先選外殼的承載零件。');
  if(!out)return fail('請選輸出軸要帶動的零件。');
  if(former&&former!==out&&formerMotor){
    if(out.isInput||keys.some(k=>out[k]?.physicalMotor))return fail('所選輸出已有另一個致動元件，不能覆蓋。');
    const formerCenter=former.motorMount?.center || keys.map(k=>former[k]).find(p=>p?.physicalMotor)?.id;
    for(const c of comps)for(const k of keys)if(c[k]?.id===formerCenter&&String(c[k]?.physicalMotor)===String(formerMotor))delete c[k].physicalMotor;
    for(const k of ['physicalMotor','motorType','motorCarrier','motorMount','phaseOffset','servoStart','servoEnd'])delete former[k];
    former.isInput=false;
    for(const c of comps)if(c.motorMountPoint===formerCenter)delete c.motorMountPoint;
  }
  if(out===host)return fail('外殼與輸出端不能固定在同一根桿。');
  if(out.mesh)return fail('請選這組齒輪的主動輪。');
  if(!['tt','mg995'].includes(request.type)||!['front','back'].includes(request.face))return fail('請選致動元件與安裝面。');
  if(!host&&request.face==='front')return fail('自動機架沿用背面安裝；需要選正面時，請先選實際承載零件。');
  if(!['horizontal','vertical','follow-frame'].includes(request.orientation))return fail('請選外殼方向。');
  const key=out.type==='gear'?'p1':request.outputEnd;
  const oldCenter=out.motorMount?.center || keys.map(k=>out[k]).find(p=>p?.physicalMotor)?.id;
  if(!['p1','p2'].includes(key)||!out[key])return fail('請選輸出零件的端孔。');
  if(oldCenter&&oldCenter!==out[key].id)return fail('這個零件已有另一端的動力，請先拆除原動力再換孔。');
  const hostKey=request.hostEnd;
  if(host&&!['p1','p2'].includes(hostKey))return fail('請選承載零件的軸心孔。');
  const fixedIds=new Set(comps.flatMap(c=>keys.map(k=>c[k])).filter(p=>p?.type==='fixed').map(p=>p.id));
  const moving=host&&![host.p1,host.p2].every(p=>fixedIds.has(p.id));
  if(moving&&out.type==='gear')return fail('目前齒輪輸入僅支援固定承載零件；活動承載桿請先使用連桿輸出。');
  if(moving&&request.orientation!=='follow-frame')return fail('活動承載桿上的外殼方向需沿承載桿，才會一起轉動。');
  const originalPoint=out[key],target=host?host[hostKey]:originalPoint;
  const originalWorld=actuatorPoint(out,key,points),targetWorld=host?actuatorPoint(host,hostKey,points):originalWorld;
  if(!originalWorld||!targetWorld)return fail('找不到所選孔的位置。');
  const same=originalPoint.id===target.id;
  if(!same){
    // Only a completely loose bar can be translated; connected mechanisms must
    // keep their actual shared node IDs, rather than a visual coincidence.
    const outIds=new Set(keys.map(k=>out[k]?.id).filter(Boolean));
    const connected=comps.some(c=>c!==out&&keys.some(k=>outIds.has(c[k]?.id)));
    if(out.type!=='bar'||connected||out.isInput||[out.p1,out.p2].some(p=>fixedIds.has(p.id)))
      return fail('輸出孔與承載孔尚未共用接點；請先在設計畫布接好。只有獨立連桿可自動平移對孔。');
    const dx=targetWorld.x-originalWorld.x,dy=targetWorld.y-originalWorld.y;
    for(const k of ['p1','p2']){const p=actuatorPoint(out,k,points);out[k].x=p.x+dx;out[k].y=p.y+dy;}
    out[key]={...out[key],id:target.id,x:targetWorld.x,y:targetWorld.y,type:target.type};
  }
  const center=out[key].id,other=key==='p1'?'p2':'p1';
  if(out.type==='bar'&&fixedIds.has(out[other].id))return fail('輸出桿另一端已固定，無法由這個孔帶動旋轉。');
  const otherMotor=comps.find(c=>c!==out&&keys.some(k=>c[k]?.id===center&&c[k].physicalMotor));
  if(otherMotor)return fail('這個軸心已由另一個零件的馬達驅動，請編輯原致動元件。');
  const motor=String(formerMotor || out.physicalMotor || out[key].physicalMotor || request.motorId || '1');
  const previousHost=out.motorMount?.frameBody || out.motorCarrier || null;
  const sameMount=!!oldCenter&&previousHost===(host?.id || null);
  const currentAngle=Number(motion.motorAngles?.[motor] ?? motion.thetaDeg ?? 0);
  if(out.type==='bar'){
    if(!sameMount){
      const a=actuatorPoint(out,'p1',same?points:{}),b=actuatorPoint(out,'p2',same?points:{});
      const angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
      const ha=host&&actuatorPoint(host,'p1',points),hb=host&&actuatorPoint(host,'p2',points);
      out.phaseOffset=angle-(host?Math.atan2(hb.y-ha.y,hb.x-ha.x)*180/Math.PI:0)-(oldCenter||formerMotor?currentAngle:0);
    }
    out.isInput=true;out.physicalMotor=motor;
    if(host)out.motorCarrier=host.id;else delete out.motorCarrier;
  }
  // A real fixed host already supplies the ground constraint. The explicit
  // auto-frame choice supplies it only when the user chose that option.
  if(!host)for(const c of comps)for(const k of keys)if(c[k]?.id===center)c[k].type='fixed';
  out[key].physicalMotor=motor;out.motorType=request.type;
  if(request.type==='mg995'){
    const lo=Number(request.start??out.servoStart??0),hi=Number(request.end??out.servoEnd??90);
    if(![lo,hi].every(n=>Number.isFinite(n)&&n>=-360&&n<=360)||lo===hi)return fail('舵機角度需在 −360～360° 且起終角不同。');
    out.servoStart=lo;out.servoEnd=hi;
  }else{delete out.servoStart;delete out.servoEnd;}
  for(const c of comps)if(c.motorMountPoint===oldCenter&&c.id!==host?.id)delete c.motorMountPoint;
  if(host){host.motorMountPoint=center;host.frameSeparate=true;}
  delete out.mountLocatorPoint; // Explicit installation replaces the old direction locator.
  out.motorMount={motor,center,outputBody:out.id,...(host?{frameBody:host.id}:{}),face:request.face,
    orientation:request.orientation,reversed:!!request.reversed,order:host?['motor','frameBody','outputBody']:['motor','outputBody']};
  const angle=Number(request.angle??(oldCenter?currentAngle:0));
  if(!Number.isFinite(angle))return fail('試動角度無效。');
  const motorAngles={...motion.motorAngles,[motor]:angle};
  try{
    const topology=compileTopology(comps,{params},new Set());
    const result=solveTopology(topology,{thetaDeg:angle,motorAngles,_prevPoints:points});
    if(!result.isValid||result.isUnderconstrained)return {...fail(result.reason||result.errorReason||'目前機構尚未完整約束，請核對固定與接點。'),comps,params};
    return {ok:true,comps,params,result,points:result.points,motor,angle,center,outputId:out.id,hostId:host?.id||'world',moving};
  }catch(e){return fail(`目前無法求解：${e.message}`);}
}
