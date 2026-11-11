import {attachmentPoint} from '../core/syringe.js';
import {motorCarrierFrame,resolveMotorOrientation} from './motor-orientation.js';

// Losing a host severs its relation, not the attached object. Position is a
// display seed only; attachmentPoint and the solver never treat it as a joint.
export function detachDeletedAttachments(comps,deletedIds,params,points) {
  // 馬達零件形狀（docs/SDD-MOTOR-PART.md M1，motor-part.js）：座板／承載件被刪時，馬達改成獨立固定點；與下面今日形狀的做法結果相同。
  const partPatch=new Map(),bodyPatch=new Map();
  for(const P of comps){
    if(P.type!=='motor'||P.motorMount||P.physicalMotor||P.motor===undefined||deletedIds.has(P.id))continue;
    const m=P.mount||{},host=comps.find(h=>deletedIds.has(h.id)&&(h.id===m.frameBody||h.id===m.carrier));
    if(!host)continue;
    const {frameBody,carrier,...rest}=m,id=P.p1.id;
    if(!Object.keys(rest).length){const {mount,...bare}=P;partPatch.set(P.id,bare);continue;}   // 只有承載件記錄：丟掉就好
    const body=P.drives?.body&&comps.find(b=>b.id===P.drives.body&&!deletedIds.has(b.id));
    if(P.drives&&!(body?.type==='bar'))continue;                                                // 齒輪輸出：與今日形狀一樣不處理
    const key=body&&['p1','p2'].find(k=>body[k]?.id===id);
    if(P.drives&&!key)continue;
    const at=points?.[id]||(body?body[key]:P.p1);
    const dir=resolveMotorOrientation(m.orientation,{center:{...at,id},carrier:motorCarrierFrame(host,{...at,id},points||{}),angleDeg:m.angleDeg,reversed:m.reversed}).dir;
    const angleDeg=Math.atan2(dir.y,dir.x)*180/Math.PI;
    if(!P.drives){partPatch.set(P.id,{...P,p1:{...P.p1,id:`${P.id}.A`,type:'fixed',x:at.x,y:at.y},mount:{face:'back',orientation:'horizontal',angleDeg,reversed:false}});continue;}
    // The output bar keeps its shaft pose and point id: the shaft stays a fixed point and the dead host references are dropped.
    const shift=carrier&&points?.[host.p1?.id]&&points[host.p2?.id]?{phaseOffset:(P.drives.phaseOffset||0)+Math.atan2(points[host.p2.id].y-points[host.p1.id].y,points[host.p2.id].x-points[host.p1.id].x)*180/Math.PI}:{};
    partPatch.set(P.id,{...P,p1:{...P.p1,type:'fixed',x:at.x,y:at.y},drives:{...P.drives,...shift},mount:{...rest,face:'back',orientation:'horizontal',angleDeg,reversed:false}});
    bodyPatch.set(body.id,{key,type:'fixed',x:at.x,y:at.y});
  }
  return comps.map(c=>{
    if(partPatch.has(c.id))return partPatch.get(c.id);
    if(bodyPatch.has(c.id)){const {key,...pt}=bodyPatch.get(c.id);return {...c,[key]:{...c[key],...pt}};}
    if(c.type==='motor'&&!deletedIds.has(c.id)&&deletedIds.has(c.motorMount?.frameBody)){
      const m=c.motorMount,host=comps.find(h=>h.id===m.frameBody),at=points?.[c.p1.id]||c.p1;
      const dir=resolveMotorOrientation(m.orientation,{center:{...at,id:c.p1.id},carrier:motorCarrierFrame(host,{...at,id:c.p1.id},points||{}),angleDeg:m.angleDeg,reversed:m.reversed}).dir;
      return {...c,p1:{...c.p1,id:`${c.id}.A`,type:'fixed',x:at.x,y:at.y},motorMount:{motor:m.motor,center:`${c.id}.A`,face:'back',orientation:'horizontal',angleDeg:Math.atan2(dir.y,dir.x)*180/Math.PI,reversed:false}};
    }
    const m=c.motorMount,host=m&&comps.find(h=>deletedIds.has(h.id)&&(h.id===m.frameBody||h.id===c.motorCarrier));
    if(c.type==='bar'&&c.isInput&&!deletedIds.has(c.id)&&host&&['p1','p2'].some(k=>c[k]?.id===m.center)){
      // The output bar keeps its shaft pose and point id: the shaft stays a fixed point and the dead host references are dropped.
      const key=['p1','p2'].find(k=>c[k]?.id===m.center),at=points?.[m.center]||c[key];
      const dir=resolveMotorOrientation(m.orientation,{center:{...at,id:m.center},carrier:motorCarrierFrame(host,{...at,id:m.center},points||{}),angleDeg:m.angleDeg,reversed:m.reversed}).dir;
      const {frameBody,order,...rest}=m,{motorCarrier,...bar}=c;
      return {...bar,...(motorCarrier&&points?.[host.p1?.id]&&points[host.p2?.id]?{phaseOffset:(c.phaseOffset||0)+Math.atan2(points[host.p2.id].y-points[host.p1.id].y,points[host.p2.id].x-points[host.p1.id].x)*180/Math.PI}:{}),
        [key]:{...c[key],type:'fixed',x:at.x,y:at.y},motorMount:{...rest,face:'back',orientation:'horizontal',angleDeg:Math.atan2(dir.y,dir.x)*180/Math.PI,reversed:false,...(order?{order:order.filter(k=>k!=='frameBody')}:{})}};
    }
    if(deletedIds.has(c.motorCarrier)){const {motorCarrier,...rest}=c;return rest;}     // legacy bar without a motorMount record
    if(c.type!=='syringe'||deletedIds.has(c.id))return c;
    const patch={};
    for(const key of ['a','b'])if(deletedIds.has(c[key]?.componentId)){
      const position=attachmentPoint(c[key],comps,params,points);
      patch[key]={componentId:'',u:0,v:0,...(position?{position:{x:position.x,y:position.y}}:{})};
    }
    return Object.keys(patch).length?{...c,...patch}:c;
  });
}
