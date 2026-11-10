import {attachmentPoint} from '../core/syringe.js';
import {motorCarrierFrame,resolveMotorOrientation} from './motor-orientation.js';

// Losing a host severs its relation, not the attached object. Position is a
// display seed only; attachmentPoint and the solver never treat it as a joint.
export function detachDeletedAttachments(comps,deletedIds,params,points) {
  return comps.map(c=>{
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
