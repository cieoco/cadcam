import {localHoles,holeWorld} from '../core/local-holes.js';
import {frameNodeIds,pointCoords} from './model.js';
import {planActuatorPlateHoles} from './actuator-plate-holes.js';
/** Rotary actuator candidates. No DOM, no global state and no extra solver. */
import {compileTopology} from '../core/topology.js';
import {solveTopology} from '../multilink/solver.js';

const keys=['p1','p2','p3'];
export const actuatorSteps=['固定外殼','位置方向','連接輸出','試動確認'];
export function actuatorHostPoints(c){return [...keys.filter(k=>c?.[k]).map(k=>({key:k,...c[k]})),...[...localHoles(c),...(c?.standardBlank?.mountHoles || [])].map(h=>({...h,...holeWorld(c,h),key:h.id}))];}
export const actuatorPoint=(c,key,points={})=>{const p=actuatorHostPoints(c).find(p=>p.key===key);return points[p?.id] || p;};
const fixedPlate=(c,comps)=>c?.type==='triangle'&&c.standardBlank?.kind==='plate'&&actuatorHostPoints(c).filter(p=>frameNodeIds(comps).has(p.id)).length>=2;
export function actuatorChoices(comps){
  return {hosts:comps.filter(c=>c.type==='bar'||c.type==='triangle'&&c.standardBlank?.kind==='plate'),outputs:comps.filter(c=>c.type==='bar'||c.type==='gear'&&!c.mesh)};
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
      const hosts=actuatorChoices(comps).hosts.filter(c=>c!==out&&actuatorHostPoints(c).some(p=>p.id===node.id));
      for(const host of hosts)result.push({nodeId:node.id,outputId:out.id,outputEnd:end,hostId:host.id,
        hostEnd:actuatorHostPoints(host).find(p=>p.id===node.id).key,orientation:'follow-frame',face:'back'});
      if(!shared.length||shared.every(c=>c.type==='anchor'&&fixed.has(c.p1.id)))result.push({nodeId:node.id,outputId:out.id,outputEnd:end,hostId:'world',
        hostEnd:'p1',orientation:'horizontal',face:'back'});
    }
  }
  return result;
}
export function planMotorInstallation(source,request,points={},motion={}){
  if(!request.outputId&&(request.position||request.existingId))return planUnconnectedMotor(source,request,points,motion);
  let comps=structuredClone(source.comps);const params={...source.params};
  const fail=message=>({ok:false,message});
  const out=comps.find(c=>c.id===request.outputId&&['bar','gear'].includes(c.type));
  const former=comps.find(c=>c.id===request.existingId);
  if(request.existingId&&!former)return fail('原致動元件不存在，請重新選取。');
  const formerMotor=former&&(former.physicalMotor||keys.map(k=>former[k]?.physicalMotor).find(Boolean));
  const host=request.hostId==='world'?null:actuatorChoices(comps).hosts.find(c=>c.id===request.hostId);
  if(!host&&request.hostId!=='world')return fail('請先選外殼的承載零件。');
  if(!out)return fail('請選輸出軸要帶動的零件。');
  if(host?.type==='triangle'&&!fixedPlate(host,comps)&&out.type==='gear')return fail('目前齒輪輸出仍需固定承載板；未固定板材請先使用連桿輸出。');
  if(former&&former!==out&&(out.isInput||out.physicalMotor||keys.some(k=>out[k]?.physicalMotor)))return fail('所選輸出已有另一個致動元件，不能覆蓋。');
  if(former&&former.type!=='motor'&&former!==out&&formerMotor){
    const formerCenter=former.motorMount?.center || keys.map(k=>former[k]).find(p=>p?.physicalMotor)?.id;
    for(const c of comps)for(const k of keys)if(c[k]?.id===formerCenter&&String(c[k]?.physicalMotor)===String(formerMotor))delete c[k].physicalMotor;
    for(const k of ['physicalMotor','motorType','motorCarrier','motorMount','phaseOffset','servoStart','servoEnd'])delete former[k];
    former.isInput=false;
    for(const c of comps)if(c.motorMountPoint===formerCenter)delete c.motorMountPoint;
  }
  if(out===host)return fail('外殼與輸出端不能固定在同一根桿。');
  if(out.mesh)return fail('請選這組齒輪的主動輪。');
  if(!['tt','mg995','n20'].includes(request.type)||!['front','back'].includes(request.face))return fail('請選致動元件與安裝面。');
  if(!host&&request.face==='front')return fail('自動機架沿用背面安裝；需要選正面時，請先選實際承載零件。');
  if(!['horizontal','vertical','follow-frame'].includes(request.orientation))return fail('請選外殼方向。');
  if(request.angleDeg!=null&&(!Number.isFinite(request.angleDeg)||Math.abs(request.angleDeg)>360))return fail('安裝轉角需在 −360～360°。');
  const key=out.type==='gear'?'p1':request.outputEnd;
  const oldCenter=out.motorMount?.center || keys.map(k=>out[k]).find(p=>p?.physicalMotor)?.id;
  if(!['p1','p2'].includes(key)||!out[key])return fail('請選輸出零件的端孔。');
  if(oldCenter&&oldCenter!==out[key].id)return fail('這個零件已有另一端的動力，請先拆除原動力再換孔。');
  const hostKey=request.hostEnd;
  if(host&&!actuatorHostPoints(host).some(p=>p.key===hostKey))return fail('請選承載零件的軸心孔。');
  const fixedIds=frameNodeIds(comps);
  const moving=host&&host.type==='bar'&&![host.p1,host.p2].every(p=>fixedIds.has(p.id));
  if(moving&&out.type==='gear')return fail('目前齒輪輸入僅支援固定承載零件；活動承載桿請先使用連桿輸出。');
  if(moving&&request.orientation!=='follow-frame')return fail('活動承載桿上的外殼方向需沿承載桿，才會一起轉動。');
  const independent=former?.type==='motor'?former:null;
  const originalPoint=out[key],target=host?actuatorHostPoints(host).find(p=>p.key===hostKey):independent?.p1||originalPoint;
  const originalWorld=actuatorPoint(out,key,points),targetWorld=host?actuatorPoint(host,hostKey,points):independent?request.position||points[independent.p1.id]||independent.p1:originalWorld;
  if(!originalWorld||!targetWorld||![targetWorld.x,targetWorld.y].every(Number.isFinite))return fail('找不到所選孔的有效位置。');
  const same=originalPoint.id===target.id;
  if(!same){
    // Only a completely loose bar can be translated; connected mechanisms must
    // keep their actual shared node IDs, rather than a visual coincidence.
    const outIds=new Set(keys.map(k=>out[k]?.id).filter(Boolean));
    const connected=comps.some(c=>c!==out&&c!==independent&&keys.some(k=>outIds.has(c[k]?.id)));
    if(out.type!=='bar'||connected||out.isInput||[out.p1,out.p2].some(p=>fixedIds.has(p.id)))
      return fail('輸出孔與承載孔尚未共用接點；請先在設計畫布接好。只有獨立連桿可自動平移對孔。');
    const dx=targetWorld.x-originalWorld.x,dy=targetWorld.y-originalWorld.y;
    for(const k of ['p1','p2']){const p=actuatorPoint(out,k,points);out[k].x=p.x+dx;out[k].y=p.y+dy;}
    out[key]={...out[key],id:target.id,x:targetWorld.x,y:targetWorld.y,type:target.type};
  }
  const center=out[key].id,other=key==='p1'?'p2':'p1';
  if(out.type==='bar'&&fixedIds.has(out[other].id))return fail('輸出桿另一端已固定，無法由這個孔帶動旋轉。');
  const otherMotor=comps.find(c=>c!==out&&c!==independent&&keys.some(k=>c[k]?.id===center&&c[k].physicalMotor));
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
      out.phaseOffset=angle-(host?.type==='bar'?Math.atan2(hb.y-ha.y,hb.x-ha.x)*180/Math.PI:0)-(oldCenter||formerMotor?currentAngle:0);
    }
    out.isInput=true;out.physicalMotor=motor;
    if(host?.type==='bar')out.motorCarrier=host.id;else delete out.motorCarrier;
  }
  // A real fixed host already supplies the ground constraint. The explicit
  // auto-frame choice supplies it only when the user chose that option.
  if(!host)for(const c of comps)for(const k of keys)if(c[k]?.id===center)c[k].type='fixed';
  if(host?.type==='triangle')out[key].type=fixedPlate(host,comps)?'fixed':target.type;
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
    orientation:request.orientation,...(request.angleDeg!=null?{angleDeg:request.angleDeg}:{}),reversed:!!request.reversed,order:host?['motor','frameBody','outputBody']:['motor','outputBody']};
  const partId=independent?.id||former?.motorMount?.partId;
  if(partId)out.motorMount.partId=partId;
  if(independent)comps=comps.filter(c=>c!==independent);
  const platePlan=planActuatorPlateHoles({comps,params,fabrication:source.fabrication,modules:source.modules});if(!platePlan.ok)return fail(platePlan.message);comps=platePlan.comps;
  const angle=Number(request.angle??(oldCenter?currentAngle:0));
  if(!Number.isFinite(angle))return fail('試動角度無效。');
  const motorAngles={...motion.motorAngles,[motor]:angle};
  return evaluateMotorCandidate({ok:true,comps,params,fabrication:source.fabrication,plateHoles:platePlan.reports,motor,angle,center,outputId:out.id,hostId:host?.id||'world',moving},points,motorAngles);
}

// Editing commits legal part data; simulation is a separate diagnostic. Never
// replace saved geometry with a partial/invalid solve just to allow a save.
function evaluateMotorCandidate(candidate,points,motorAngles){
  let result,message='';
  try{result=solveTopology(compileTopology(candidate.comps,{params:candidate.params},new Set()),{thetaDeg:candidate.angle,motorAngles,_prevPoints:points});
    if(!result.isValid||result.isUnderconstrained)message=result.reason||result.errorReason||'機構尚未完整約束。';
  }catch(e){message=`目前無法求解：${e.message}`;}
  if(!candidate.outputId)message='馬達尚未連接輸出零件，可先保存再接上。';
  return {...candidate,result,simulation:{ok:!message,message},points:!message?result.points:pointCoords(candidate.comps)};
}

/** Standalone body, or release only its output. The housing mount survives.
 * Attached legacy files keep their existing representation; partId preserves
 * the independent body's identity across attach/release and save/reopen.
 */
function planUnconnectedMotor(source,request,points,motion){
  let comps=structuredClone(source.comps);const params={...source.params},fail=message=>({ok:false,message});
  const old=comps.find(c=>c.id===request.existingId),mount=old?.motorMount||{};
  if(request.existingId&&!old)return fail('原致動元件不存在，請重新選取。');
  if(old&& !['bar','motor'].includes(old.type))return fail('齒輪輸出的解除仍需核對被動齒輪求解；本次先支援連桿輸出。');
  const motor=String(old?.physicalMotor||keys.map(k=>old?.[k]?.physicalMotor).find(Boolean)||request.motorId||'1');
  if(!['tt','n20','mg995'].includes(request.type)||!['front','back'].includes(request.face)||!['horizontal','vertical','follow-frame'].includes(request.orientation))return fail('請選有效的馬達型號與安裝方向。');
  if(!Number.isFinite(request.angleDeg??0)||Math.abs(request.angleDeg??0)>360)return fail('安裝轉角需在 −360～360°。');
  const host=request.hostId==='world'?null:actuatorChoices(comps).hosts.find(c=>c.id===request.hostId);
  if(!host&&request.hostId!=='world')return fail('請選外殼的承載零件。');
  if(!host&&request.face==='front')return fail('圖面基準沿用背面安裝。');
  if(host?.type==='bar'&&request.orientation!=='follow-frame'&&![host.p1,host.p2].every(p=>frameNodeIds(comps).has(p.id)))return fail('活動承載桿上的外殼方向需沿承載桿。');
  const center=mount.center||keys.map(k=>old?.[k]).find(p=>p?.physicalMotor)?.id;
  const at=host?actuatorPoint(host,request.hostEnd,points):request.position||points[center]||keys.map(k=>old?.[k]).find(p=>p?.id===center);
  if(!at||![at.x,at.y].every(Number.isFinite))return fail('請先在畫布放置馬達，或輸入有效的軸心座標。');
  let id=old?.type==='motor'?old.id:mount.partId;
  if(!id){let n=Number(source.counter)||1;while(comps.some(c=>c.id===`Motor${n}`||c.motorMount?.partId===`Motor${n}`||keys.some(k=>c[k]?.id===`Motor${n}.A`)))n++;id=`Motor${n}`;}
  if(comps.some(c=>c.id===id&&c!==old))return fail('馬達零件編號重複，請重新開啟安裝。');
  const p1={id:host?actuatorHostPoints(host).find(p=>p.key===request.hostEnd)?.id:`${id}.A`,type:!host||fixedPlate(host,comps)?'fixed':'floating',x:at.x,y:at.y,physicalMotor:motor};
  if(!p1.id)return fail('承載孔不存在。');
  if(comps.some(c=>c!==old&&keys.some(k=>c[k]?.id===p1.id&&c[k].physicalMotor&&String(c[k].physicalMotor)!==motor)))return fail('此孔已有其他馬達。');
  if(old&&old.type!=='motor'){
    const key=keys.find(k=>old[k]?.id===center);if(!key)return fail('原輸出軸心不存在。');
    if(old.barFusion||old.barFusionRoot)return fail('請先解除桿件合成，再解除個別輸出連接。');
    // Keep the displayed pose of the connected group, including every copy of
    // shared endpoints. Leaving a neighbour's stale copy makes the rod jump.
    const group=new Set([old.id]),nodes=new Set(keys.map(k=>old[k]?.id).filter(Boolean));
    let grew=true;while(grew){grew=false;for(const c of comps)if(!group.has(c.id)&&keys.some(k=>nodes.has(c[k]?.id))){group.add(c.id);keys.forEach(k=>{if(c[k])nodes.add(c[k].id);});grew=true;}}
    for(const c of comps)if(group.has(c.id))for(const k of keys)if(c[k]&&points[c[k].id]&&[points[c[k].id].x,points[c[k].id].y].every(Number.isFinite))Object.assign(c[k],{x:points[c[k].id].x,y:points[c[k].id].y});
    let released=`${old.id}.released`,n=1;const ids=new Set(comps.flatMap(c=>keys.map(k=>c[k]?.id)));while(ids.has(released))released=`${old.id}.released${n++}`;
    old[key]={...old[key],id:released,type:'floating'};delete old[key].physicalMotor;
    for(const c of comps)for(const k of keys)if(c[k]?.id===center&&String(c[k].physicalMotor)===motor)delete c[k].physicalMotor;
    for(const k of ['physicalMotor','motorType','motorCarrier','motorMount','phaseOffset','servoStart','servoEnd'])delete old[k];old.isInput=false;
  }
  for(const c of comps)if(c.motorMountPoint===center&&c.id!==host?.id)delete c.motorMountPoint;
  const body={type:'motor',id,p1,physicalMotor:motor,motorType:request.type,motorMount:{motor,center:p1.id,face:request.face,orientation:request.orientation,angleDeg:request.angleDeg??0,reversed:!!request.reversed,...(host?{frameBody:host.id}:{})},...(old?.moduleId||source.moduleId?{moduleId:old?.moduleId||source.moduleId}:{})};
  if(request.type==='mg995'){body.servoStart=Number(request.start??0);body.servoEnd=Number(request.end??90);if(![body.servoStart,body.servoEnd].every(n=>Number.isFinite(n)&&Math.abs(n)<=360)||body.servoStart===body.servoEnd)return fail('舵機起終角需有效且不同。');}
  comps=comps.filter(c=>c!==old||old.type!=='motor');comps.push(body);
  if(host){host.motorMountPoint=p1.id;host.frameSeparate=true;}
  const holes=planActuatorPlateHoles({...source,comps,params});if(!holes.ok)return fail(holes.message);
  return evaluateMotorCandidate({ok:true,comps:holes.comps,params,fabrication:source.fabrication,plateHoles:holes.reports,motor,angle:Number(request.angle)||0,center:p1.id,outputId:'',hostId:host?.id||'world'},points,motion.motorAngles);
}
