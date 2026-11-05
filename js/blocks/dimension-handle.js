/** A dimension handle previews a value, then calls the existing numeric action once. */
const sessions=new WeakMap(),NS='http://www.w3.org/2000/svg';
// Pointer dimensions use whole mm; numeric inputs and keyboard precision are independent.
// Fractional bounds stay inside the valid range. No integer available means no edit.
export function snapDraggedDimension(value,min,max,original=value){
  const low=Math.ceil(min),high=Math.floor(max);
  return low<=high?Math.min(high,Math.max(low,Math.round(value))):original;
}
export function projectedDimension(start,delta,direction,{min=-100000,max=100000}={}){
  const d=direction.x**2+direction.y**2;if(d<1e-12)return start;
  return snapDraggedDimension(start+(delta.x*direction.x+delta.y*direction.y)/d,min,max,start);
}
export function projectedAngle(center,axes,start,end){
  const det=axes.u.x*axes.v.y-axes.u.y*axes.v.x;if(Math.abs(det)<1e-8)return 0;
  const angle=p=>{const x=p.x-center.x,y=p.y-center.y;return Math.atan2((axes.u.x*y-axes.u.y*x)/det,(x*axes.v.y-y*axes.v.x)/det);};
  const delta=angle(end)-angle(start);return Math.atan2(Math.sin(delta),Math.cos(delta))*180/Math.PI;
}
export function dimensionHandle(svg,{key,label,point,direction,value,min=0,max=2000,step=.1,angleCenter=null,angleAxes=null,plane=null,activate=()=>{},preview=()=>{},commit,cancel=()=>preview(value),color='#087f8c'}){
  if(!svg?.getScreenCTM||!Number.isFinite(value))return;
  let session=sessions.get(svg);
  if(!session){
    session={drag:null};sessions.set(svg,session);
    const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
    const finish=(e,abort)=>{const d=session.drag;if(!d||e.pointerId!==d.id)return;e.preventDefault();session.drag=null;document.removeEventListener('keydown',escape,true);document.removeEventListener('pointerdown',second,true);if(!e.keepCapture)try{svg.releasePointerCapture(d.id);}catch(_){}d.cancel();if(!abort){if(d.plane){if(d.nextPoint&&(d.nextPoint.x!==d.plane.value.x||d.nextPoint.y!==d.plane.value.y))d.plane.commit(d.nextPoint);else if(!d.moved)d.activate();}else if(d.next!==d.value)d.commit(d.next);else if(!d.moved)d.activate();}d.group.removeAttribute('transform');d.text.textContent=d.plane?d.label:`${d.label} ${Number(d.value.toFixed(2))}`;};
    const abort=(keepCapture=false)=>{if(session.drag)finish({pointerId:session.drag.id,keepCapture,preventDefault(){},stopImmediatePropagation(){}},true);};
    const escape=e=>{if(e.key==='Escape'&&session.drag){e.preventDefault();e.stopImmediatePropagation();abort();}};
    const second=e=>{if(session.drag&&e.pointerId!==session.drag.id)abort(true);};
    session.listen=()=>{document.addEventListener('keydown',escape,true);document.addEventListener('pointerdown',second,true);};
    svg.addEventListener('pointermove',e=>{const d=session.drag;if(!d||e.pointerId!==d.id)return;stop(e);if(!d.moved&&Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)<3)return;d.moved=true;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.matrix),delta={x:p.x-d.start.x,y:p.y-d.start.y};if(d.plane){const q=d.plane.fromScreen(p),start=d.plane.fromScreen(d.start);d.nextPoint=d.plane.constrain({x:d.plane.value.x+q.x-start.x,y:d.plane.value.y+q.y-start.y});const a=d.plane.project(d.plane.value),b=d.plane.project(d.nextPoint);d.group.setAttribute('transform',`translate(${b.x-a.x} ${b.y-a.y})`);d.text.textContent=`${d.label} ${Number(d.nextPoint.x.toFixed(1))}, ${Number(d.nextPoint.y.toFixed(1))}`;d.plane.preview(d.nextPoint);return;}if(d.angleCenter){d.next=Math.round((d.value+projectedAngle(d.angleCenter,d.angleAxes,d.start,p))/d.step)*d.step;}else d.next=projectedDimension(d.value,delta,d.direction,d);const shift=d.next-d.value;d.group.setAttribute('transform',`translate(${d.angleCenter?delta.x:d.direction.x*shift} ${d.angleCenter?delta.y:d.direction.y*shift})`);d.text.textContent=`${d.label} ${Number(d.next.toFixed(2))}`;d.preview(d.next);},true);
    svg.addEventListener('pointerup',e=>finish(e,false),true);
    svg.addEventListener('pointercancel',e=>finish(e,true),true);
    svg.addEventListener('lostpointercapture',e=>{if(session.drag?.id===e.pointerId)finish(e,true);});
  }
  const group=document.createElementNS(NS,'g'),matrix=svg.getScreenCTM();if(!matrix)return;
  const unit=1/Math.hypot(matrix.a,matrix.b),add=(tag,attrs)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));group.append(n);return n;};
  group.dataset.dimensionHandle=key;group.setAttribute('role',plane?'button':'slider');group.setAttribute('tabindex','0');group.setAttribute('aria-label',label);group.setAttribute('aria-valuenow',value);group.setAttribute('aria-valuemin',min);group.setAttribute('aria-valuemax',max);if(plane)for(const k of ['aria-valuenow','aria-valuemin','aria-valuemax'])group.removeAttribute(k);group.style.cursor=plane?'move':'ew-resize';group.style.touchAction='none';
  add('circle',{cx:point.x,cy:point.y,r:22*unit,fill:'transparent'});
  add('circle',{cx:point.x,cy:point.y,r:6*unit,fill:'white',stroke:color,'stroke-width':2*unit});
  const text=add('text',{x:point.x,y:point.y-13*unit,'font-size':12*unit,'text-anchor':'middle',fill:color,stroke:'white','stroke-width':3*unit,'paint-order':'stroke','pointer-events':'none'});text.textContent=plane?label:`${label} ${Number(value.toFixed(2))}`;
  group.addEventListener('pointerdown',e=>{if(e.button>0||e.isPrimary===false)return;e.preventDefault();e.stopImmediatePropagation();group.focus();const inverse=svg.getScreenCTM().inverse();session.drag={id:e.pointerId,start:new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse),clientX:e.clientX,clientY:e.clientY,moved:false,matrix:inverse,group,text,label,direction,value,next:value,min,max,step,angleCenter,angleAxes,plane,activate,preview,commit,cancel};session.listen();try{svg.setPointerCapture(e.pointerId);}catch(_){}},true);
  group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(plane){const keys={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]},[x,y]=keys[e.key];plane.commit(plane.constrain({x:plane.value.x+x,y:plane.value.y+y}));svg.querySelector(`[data-dimension-handle="${key}"]`)?.focus();return;}commit(Math.max(min,Math.min(max,value+(['ArrowLeft','ArrowDown'].includes(e.key)?-step:step))));svg.querySelector(`[data-dimension-handle="${key}"]`)?.focus();});
  svg.append(group);return group;
}
