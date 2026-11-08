/** A dimension handle previews a value, then calls the existing numeric action once. */
const sessions=new WeakMap(),NS='http://www.w3.org/2000/svg';
// stack: "a · b" shows as two lines (a over b) so long labels stay short.
const say=(t,v)=>{if(!t.dataset.stack){t.textContent=v;return;}const i=v.indexOf(' · '),u=+t.dataset.stack;t.replaceChildren(...(i<0?[v]:[v.slice(0,i),v.slice(i+3)]).map((w,k)=>{const n=document.createElementNS(NS,'tspan');n.setAttribute('x',t.getAttribute('x'));n.setAttribute('dy',k?14*u:0);n.textContent=w;return n;}));};
// Drag snaps to whole mm or to step (grid pitch); typed values keep decimals.
// None in range means no edit.
export function snapDraggedDimension(value,min,max,original=value,step=1){
  const low=Math.ceil(min/step),high=Math.floor(max/step);
  return low<=high?Math.min(high,Math.max(low,Math.round(value/step)))*step:original;
}
export function projectedDimension(start,delta,direction,{min=-100000,max=100000,snap,quantize}={}){
  const d=direction.x**2+direction.y**2;if(d<1e-12)return start;
  const raw=start+(delta.x*direction.x+delta.y*direction.y)/d,q=quantize?.(raw);
  return q==null?snapDraggedDimension(raw,min,max,start,snap):Math.min(max,Math.max(min,q));
}
export function projectedAngle(center,axes,start,end){
  const det=axes.u.x*axes.v.y-axes.u.y*axes.v.x;if(Math.abs(det)<1e-8)return 0;
  const angle=p=>{const x=p.x-center.x,y=p.y-center.y;return Math.atan2((axes.u.x*y-axes.u.y*x)/det,(x*axes.v.y-y*axes.v.x)/det);};
  const delta=angle(end)-angle(start);return Math.atan2(Math.sin(delta),Math.cos(delta))*180/Math.PI;
}
export function dimensionHandle(svg,{key,label,point,direction,value,min=0,max=2000,step=.1,snap,quantize,offset=0,right=false,stack=false,angleCenter=null,angleAxes=null,plane=null,activate=()=>{},preview=()=>{},commit,cancel=()=>preview(value),color='#087f8c'}){
  if(!svg?.getScreenCTM||!Number.isFinite(value))return;
  let session=sessions.get(svg);
  if(!session){
    session={drag:null};sessions.set(svg,session);
    const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
    const finish=(e,abort)=>{const d=session.drag;if(!d||e.pointerId!==d.id)return;e.preventDefault();session.drag=null;document.removeEventListener('keydown',escape,true);document.removeEventListener('pointerdown',second,true);if(!e.keepCapture)try{svg.releasePointerCapture(d.id);}catch(_){}d.cancel();if(!abort){if(d.plane){if(d.nextPoint&&(d.nextPoint.x!==d.plane.value.x||d.nextPoint.y!==d.plane.value.y))d.plane.commit(d.nextPoint);else if(!d.moved)d.activate();}else if(d.next!==d.value)d.commit(d.next);else if(!d.moved)d.activate();}d.group.removeAttribute('transform');say(d.text,d.plane?d.label:`${d.label} ${Number((d.value+d.offset).toFixed(2))}`);};
    const abort=(keepCapture=false)=>{if(session.drag)finish({pointerId:session.drag.id,keepCapture,preventDefault(){},stopImmediatePropagation(){}},true);};
    const escape=e=>{if(e.key==='Escape'&&session.drag){e.preventDefault();e.stopImmediatePropagation();abort();}};
    const second=e=>{if(session.drag&&e.pointerId!==session.drag.id)abort(true);};
    session.listen=()=>{document.addEventListener('keydown',escape,true);document.addEventListener('pointerdown',second,true);};
    svg.addEventListener('pointermove',e=>{const d=session.drag;if(!d||e.pointerId!==d.id)return;stop(e);if(!d.moved&&Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)<3)return;d.moved=true;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.matrix),delta={x:p.x-d.start.x,y:p.y-d.start.y};if(d.plane){const q=d.plane.fromScreen(p),start=d.plane.fromScreen(d.start);d.nextPoint=d.plane.constrain({x:d.plane.value.x+q.x-start.x,y:d.plane.value.y+q.y-start.y});const a=d.plane.project(d.plane.value),b=d.plane.project(d.nextPoint);d.group.setAttribute('transform',`translate(${b.x-a.x} ${b.y-a.y})`);say(d.text,`${d.label} ${Number(d.nextPoint.x.toFixed(1))}, ${Number(d.nextPoint.y.toFixed(1))}`);d.plane.preview(d.nextPoint);return;}if(d.angleCenter){const raw=d.value+projectedAngle(d.angleCenter,d.angleAxes,d.start,p),q=d.quantize?.(raw);d.next=q??Math.round(raw/d.step)*d.step;}else d.next=projectedDimension(d.value,delta,d.direction,d);const shift=d.next-d.value;d.group.setAttribute('transform',`translate(${d.angleCenter?delta.x:d.direction.x*shift} ${d.angleCenter?delta.y:d.direction.y*shift})`);say(d.text,`${d.label} ${Number((d.next+d.offset).toFixed(2))}`);d.preview(d.next);},true);
    svg.addEventListener('pointerup',e=>finish(e,false),true);
    svg.addEventListener('pointercancel',e=>finish(e,true),true);
    svg.addEventListener('lostpointercapture',e=>{if(session.drag?.id===e.pointerId)finish(e,true);});
  }
  const group=document.createElementNS(NS,'g'),matrix=svg.getScreenCTM();if(!matrix)return;
  const unit=1/Math.hypot(matrix.a,matrix.b),add=(tag,attrs)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));group.append(n);return n;};
  group.dataset.dimensionHandle=key;group.setAttribute('role',plane?'button':'slider');group.setAttribute('tabindex','0');group.setAttribute('aria-label',label);group.setAttribute('aria-valuenow',value+offset);group.setAttribute('aria-valuemin',min+offset);group.setAttribute('aria-valuemax',max+offset);if(plane)for(const k of ['aria-valuenow','aria-valuemin','aria-valuemax'])group.removeAttribute(k);group.style.cursor=plane?'move':'ew-resize';group.style.touchAction='none';
  add('circle',{cx:point.x,cy:point.y,r:22*unit,fill:'transparent'});
  add('circle',{cx:point.x,cy:point.y,r:6*unit,fill:'white',stroke:color,'stroke-width':2*unit});
  if(angleCenter){
    group.style.cursor='grab';
    add('path',{d:`M ${point.x-11*unit} ${point.y+5*unit} A ${12*unit} ${12*unit} 0 1 1 ${point.x+11*unit} ${point.y+5*unit}`,fill:'none',stroke:color,'stroke-width':1.5*unit,'pointer-events':'none'});
    add('path',{d:`M ${point.x+6*unit} ${point.y+2*unit} L ${point.x+11*unit} ${point.y+7*unit} L ${point.x+14*unit} ${point.y+unit}`,fill:'none',stroke:color,'stroke-width':1.5*unit,'pointer-events':'none'});
  }
  const text=add('text' ,{x:point.x+(right?12*unit:0),y:point.y+(right?(stack?-3:4)*unit:(stack?-27:-13)*unit),'font-size':12*unit,'text-anchor':right?'start':'middle',fill:color,stroke:'white','stroke-width':3*unit,'paint-order':'stroke','pointer-events':'none'});if(stack)text.dataset.stack=unit;say(text,plane?label:`${label} ${Number((value+offset).toFixed(2))}`);
  group.addEventListener('pointerdown',e=>{if(e.button>0||e.isPrimary===false)return;e.preventDefault();e.stopImmediatePropagation();group.focus();const inverse=svg.getScreenCTM().inverse();session.drag={id:e.pointerId,start:new DOMPoint(e.clientX,e.clientY).matrixTransform(inverse),clientX:e.clientX,clientY:e.clientY,moved:false,matrix:inverse,group,text,label,offset,direction,value,next:value,min,max,step,snap,quantize,angleCenter,angleAxes,plane,activate,preview,commit,cancel};session.listen();try{svg.setPointerCapture(e.pointerId);}catch(_){}},true);
  group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(plane){const keys={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]},[x,y]=keys[e.key];plane.commit(plane.constrain({x:plane.value.x+x,y:plane.value.y+y}));svg.querySelector(`[data-dimension-handle="${key}"]`)?.focus();return;}commit(Math.max(min,Math.min(max,value+(['ArrowLeft','ArrowDown'].includes(e.key)?-step:step))));svg.querySelector(`[data-dimension-handle="${key}"]`)?.focus();});
  svg.append(group);
  if(stack){
    const box=text.getBoundingClientRect(),bounds=svg.getBoundingClientRect();
    // Keep two-line draft labels inside the canvas, beside or above the handle.
    if(box.top<bounds.top||box.right>bounds.right-8){
      text.setAttribute('x',point.x-(box.top<bounds.top?12*unit:0));
      text.setAttribute('y',point.y-(box.top<bounds.top?3:27)*unit);
      text.setAttribute('text-anchor','end');
      say(text,plane?label:`${label} ${Number((value+offset).toFixed(2))}`);
    }
  }
  return group;
}
