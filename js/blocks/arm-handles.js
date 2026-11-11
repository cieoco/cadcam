/** 彎桿／多臂件選取時的圖上把手：各臂長度（8 mm 一孔）與第2、3臂夾角（1° 一格）。放開才提交，Esc 取消。 */
import {dimensionHandle} from './dimension-handle.js';
const wrap=d=>((d%360)+360)%360,norm=d=>{const n=wrap(d);return Math.min(n,360-n);};
export function armSide(c,at){
 // 第2臂角度是往哪個轉向量的：試 +1 / -1，取與存的夾角相符者。
 const o=at(c.p1),b=at(c.p2),d=at(c.p3),turn=wrap((Math.atan2(d.y-o.y,d.x-o.x)-Math.atan2(b.y-o.y,b.x-o.x))*180/Math.PI),a1=c.standardBlank.arms[1].angleDeg;
 return norm(turn-a1)<=norm(-turn-a1)?1:-1;
}
export function drawArmHandles({svg,c,at,project,member,openEditor}){
 const arms=c.standardBlank.arms,m=svg.getScreenCTM();if(!m||!arms||arms.length<2)return;
 svg.querySelectorAll('[data-member-dimension]').forEach(n=>n.remove());   // 共用尺寸線的名稱是「長向／直向」，這裡由各臂把手取代
 const px=1/Math.hypot(m.a,m.b),o=at(c.p1),po=project(o),side=armSide(c,at);
 const idOf=k=>k===0?c.p2:k===1?c.p3:{id:`${c.id}_A2_${arms[2].holes}`.replaceAll('.','_')};
 arms.forEach((a,k)=>{
  const e=at(idOf(k));if(!Number.isFinite(e?.x))return;
  const pe=project(e),len=Math.hypot(pe.x-po.x,pe.y-po.y)||1,su={x:(pe.x-po.x)/len,y:(pe.y-po.y)/len};
  const focus=axis=>()=>{openEditor?.();const f=document.querySelector(`[data-blank-edit="${axis}"]`);f?.focus();f?.select?.();};
  {
   const mm=Math.hypot(e.x-o.x,e.y-o.y)||1;
   dimensionHandle(svg,{key:'arm-length-'+k,label:`第${k+1}臂長`,point:{x:pe.x-su.y*40*px,y:pe.y+su.x*40*px},direction:{x:(pe.x-po.x)/mm,y:(pe.y-po.y)/mm},value:8*a.holes,min:8,max:512,snap:8,step:8,activate:focus('arm'+k),commit:v=>member.setDimensionValue(c.id,'arm'+k,Math.round(v/8),{exact:true})});
  }
  if(k>0)dimensionHandle(svg,{key:'arm-angle-'+k,label:`第${k+1}臂夾角`,point:{x:pe.x+su.x*56*px,y:pe.y+su.y*56*px},direction:{x:0,y:0},value:a.angleDeg,min:1,max:359,step:1,quantize:raw=>Math.min(359,Math.max(1,Math.round(raw))),
   angleCenter:po,angleAxes:{u:{x:1,y:0},v:{x:0,y:-side}},color:'#d97706',activate:focus('angle'+k),commit:v=>member.setDimensionValue(c.id,'angle'+k,v,{exact:true})});
 });
}
