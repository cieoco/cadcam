import {drawMotorAngle} from './motor-angle-editor.js';
/** Selected dimensions use existing setters; the moving handle is a draft until release. */
import {S} from './state.js';
import {dimensionHandle} from './dimension-handle.js';
import {memberDimensions,memberDimensionValue,dimensionLock} from './member-dimensions.js';
import {memberStock} from './member-stock.js';
import {showNumber} from './numeric-input.js';
import {pointDimensionEditor} from './point-dimension-editor.js';
import {outputRadius} from './gear-hole-placement.js';
import {gearHoleGridAtPoint,showGearGridHint} from './grid-gear.js';
import {worldFromScreen} from './view.js';
import {sheetMode,setSheet} from './mobile-workspace.js';
import {frameGroundAxis} from './frame-ground.js';
import {snapFrameAngle} from './frame-grid.js';
import {gridDragStep,showHoleCount} from './grid-drag.js';
import {edgeSnap} from './grid-plate.js';
const NS='http://www.w3.org/2000/svg';
// Keep the 44 px dimension hit area clear of the hole's 48 px touch target.
function besideHole(svg,a,b){
  const m=svg.getScreenCTM(),px=1/Math.hypot(m.a,m.b),L=Math.hypot(b.x-a.x,b.y-a.y)||1;
  const normal={x:(b.y-a.y)/L*48*px,y:-(b.x-a.x)/L*48*px},bounds=svg.getBoundingClientRect();
  const options=[1,-1].map(sign=>({x:b.x+normal.x*sign,y:b.y+normal.y*sign}));
  const outside=p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(m);return Math.max(0,bounds.left+24-q.x,q.x-bounds.right+24)+Math.max(0,bounds.top+30-q.y,q.y-bounds.bottom+24);};
  const point=outside(options[1])<outside(options[0])?options[1]:options[0];
  const line=document.createElementNS(NS,'line');
  for(const [k,v]of Object.entries({x1:b.x,y1:b.y,x2:point.x,y2:point.y,stroke:'#81aeb8','stroke-width':px,'pointer-events':'none'}))line.setAttribute(k,v);
  svg.append(line);return point;
}
/** Ownership comes from dimension references, not example names or nearest-part guesses. */
function drawPointChoices(svg,edit,comps,at,project){
  if(!edit)return;
  const matrix=svg.getScreenCTM(),px=1/Math.hypot(matrix.a,matrix.b),positions=[];
  const add=(tag,attrs,parent=svg)=>{const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;};
  const highlight=key=>{
    svg.querySelector('[data-dimension-highlight]')?.remove();
    const d=edit.choices.find(d=>d.key===key),comp=comps.find(c=>c.id===d?.componentId);if(!comp)return;
    const group=add('g',{'data-dimension-highlight':key,'pointer-events':'none'});
    for(const shape of svg.querySelectorAll('[data-pick-component]'))if(shape.dataset.pickComponent===comp.id){
      const outline=shape.cloneNode(true);for(const a of [...outline.attributes])if(a.name.startsWith('data-')||['id','role','tabindex'].includes(a.name))outline.removeAttribute(a.name);
      outline.setAttribute('fill','none');outline.setAttribute('stroke','#087f8c');outline.setAttribute('stroke-width',3*px);outline.style.pointerEvents='none';group.append(outline);
    }
    const [a,b]=d.refs.map(ref=>project(at(comp[ref])));
    add('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#087f8c','stroke-width':2*px,'stroke-dasharray':`${5*px} ${4*px}`},group);
    // Below the handles, with no extra hit area obscuring the selected hole.
    svg.insertBefore(group,svg.querySelector('[data-point-choice]'));
  };
  for(const button of document.querySelectorAll('#pointDimensionEditor [data-dimension-choice]')){
    button.onpointerenter=button.onfocus=()=>highlight(button.dataset.dimensionChoice);
    button.onpointerleave=button.onblur=()=>highlight(edit.dimension?.key);
  }
  if(!edit.dimension)edit.choices.forEach((d,i)=>{
    const comp=comps.find(c=>c.id===d.componentId),[a,b]=d.refs.map(ref=>project(at(comp[ref]))),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    const p={x:(a.x+b.x)/2-dy/L*28*px,y:(a.y+b.y)/2+dx/L*28*px};
    const bounds=svg.getBoundingClientRect(),controls=document.querySelector('.controls')?.getBoundingClientRect();
    const bottom=controls&&controls.top>bounds.top?Math.min(bounds.bottom,controls.top):bounds.bottom;
    const lo=new DOMPoint(bounds.left+24,bounds.top+24).matrixTransform(matrix.inverse()),hi=new DOMPoint(bounds.right-24,bottom-24).matrixTransform(matrix.inverse());
    p.x=Math.max(lo.x,Math.min(hi.x,p.x));p.y=Math.max(lo.y,Math.min(hi.y,p.y));
    while(positions.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<46*px)&&p.y-46*px>=lo.y)p.y-=46*px;positions.push(p);
    const g=add('g',{'data-point-choice':d.key,role:'button',tabindex:0,'aria-label':`${i+1} · ${d.optionLabel}`});g.style.cursor='pointer';
    add('line',{x1:p.x,y1:p.y,x2:(a.x+b.x)/2,y2:(a.y+b.y)/2,stroke:'#087f8c','stroke-width':px,'pointer-events':'none'},g);
    add('circle',{cx:p.x,cy:p.y,r:22*px,fill:'transparent'},g);
    add('circle',{cx:p.x,cy:p.y,r:13*px,fill:'white',stroke:'#087f8c','stroke-width':2*px,'pointer-events':'none'},g);
    add('text',{x:p.x,y:p.y+5*px,'text-anchor':'middle','font-size':14*px,fill:'#075e75','pointer-events':'none'},g).textContent=i+1;
    g.onpointerenter=g.onfocus=()=>highlight(d.key);g.onpointerleave=g.onblur=()=>highlight(edit.dimension?.key);
    g.onpointerdown=e=>{if(e.isPrimary===false||e.button>0)return;e.preventDefault();e.stopImmediatePropagation();edit.choose(d.key);};
    g.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();edit.choose(d.key);}};
  });
  highlight(edit.dimension?.key);
}
import {drawFrameHoleHandle} from './frame-hole-editor.js';
export function drawEditingHandles({svg,points,project,member,slider,gear,frame,redraw,openEditor,comps=S.comps,mounts,pause,pushUndo,rebuild,notify}){
  showHoleCount(null);
  if(S.mode!=='design'||S.mateMode||S.drawingLink||S.drawingTriangle||S.drawingPolygon||S.placingMotor||S.pickBars)return;
  if(drawFrameHoleHandle({svg,project,openEditor,redraw}))return;
  drawMotorAngle({svg,points,project,mounts,redraw,openEditor,pause,pushUndo,rebuild,notify});
  const c=S.comps.find(c=>c.id===(S.selectedTriangleId||S.selectedLinkId||S.selectedSliderId||S.selectedGearId));
  const at=p=>points[p?.id]||p;
  const pointEdit=pointDimensionEditor({member,redraw,comps,openEditor});
  drawPointChoices(svg,pointEdit,comps,at,project);
  if(pointEdit?.dimension&&!pointEdit.dimension.lock){
    const {comp,dimension,value,input,commit,activate}=pointEdit;
    const p=at(comp[dimension.refs[0]]),q=at(comp[dimension.refs[1]]);
    if(p&&q){
      const a=project(p),b=project(q),length=Math.hypot(q.x-p.x,q.y-p.y)||1;
      const snap=gridDragStep(comp,dimension),plate=edgeSnap(comp,dimension,S.topo.params,{comps}),holes=v=>{if(snap>1)showHoleCount(input,v);else if(plate)showHoleCount(input,v,plate.hint);};holes(value);
      dimensionHandle(svg,{key:'point-dimension',label:dimension.label,point:besideHole(svg,a,b),direction:{x:(b.x-a.x)/length,y:(b.y-a.y)/length},value,min:8,max:2000,snap,quantize:plate?.quantize(value),
        preview:v=>{showNumber(input,v);holes(v);},cancel:()=>{showNumber(input,value);holes(value);},commit:plate?v=>commit(v,true):commit,activate});
    }
  }
  function handle(key,label,point,direction,value,commit,inputId,min=0,max=2000,step=.1,origin=null,snap=1,plate=null,quantize=null){
    if(!point||!direction||!Number.isFinite(value))return;
    const a=project(point),b=project({x:point.x+direction.x,y:point.y+direction.y}),input=document.getElementById(inputId),field=input?.matches('input')?input:input?.querySelector('input');
    const note=v=>{if(snap>1)showHoleCount(field,v);else if(plate)showHoleCount(field,v,plate.hint);};note(value);
    dimensionHandle(svg,{key,label,point:origin?besideHole(svg,project(origin),a):a,direction:{x:b.x-a.x,y:b.y-a.y},value,min,max,step,snap,quantize:quantize || plate?.quantize(value),preview:v=>{if(field)showNumber(field,v);note(v);},cancel:()=>{if(field)showNumber(field,value);note(value);},commit:plate?v=>commit(v,true):commit,activate:()=>{openEditor();field?.focus();field?.select();}});
  }
  const a=at(c?.p1),b=at(c?.p2),length=a&&b?Math.hypot(b.x-a.x,b.y-a.y):0,u=length?{x:(b.x-a.x)/length,y:(b.y-a.y)/length}:{x:1,y:0};
  if(c&&['bar','triangle'].includes(c.type)&&!c.boxPanel){
    const id=S.selectedTriangleId?S.triSide||'g':'g',dim=memberDimensions(c).find(d=>d.id===id),lock=dimensionLock(c,S.comps,id);
    if(dim?.refs&&id!=='tip'&&!lock){const p=at(c[dim.refs[0]]),q=at(c[dim.refs[1]]);if(p&&q){const L=Math.hypot(q.x-p.x,q.y-p.y)||1,dir={x:(q.x-p.x)/L,y:(q.y-p.y)/L};handle('member-length',dim.label,q,dir,memberDimensionValue(c,S.topo.params,id),(v,exact)=>member.setValue(v,exact),'memberDimensionInput',8,2000,.1,p,gridDragStep(c,dim),edgeSnap(c,dim,S.topo.params,{comps:S.comps}));}}
    if(c.shape==='disk')handle('disk-diameter','外徑',{x:a.x,y:a.y+c.diameterMm/2},{x:0,y:.5},c.diameterMm,v=>{const input=document.getElementById('diskDiameterInput');input.value=v;input.onchange();},'diskDiameterInput',8,2000);
    else if(!c.barFusionRoot&&document.getElementById('memberMore')?.open){const w=memberStock(c).widthMm;handle('member-width','板寬',{x:(a.x+b.x)/2-u.y*w/2,y:(a.y+b.y)/2+u.x*w/2},{x:-u.y/2,y:u.x/2},w,v=>member.setStock('widthMm',v),'memberWidthInput',2,120);}
  }
  if(c?.type==='slider'){
    const base=c.baseEnd==='p2'?b:a,dir=c.baseEnd==='p2'?{x:-u.x,y:-u.y}:u;
    const midpoint=at(c.p3),mount=at(c.m1),mountEnd=at(c.m2);
    const screenA=project(a),screenB=project(b),matrix=svg.getScreenCTM(),scale=Math.hypot(screenB.x-screenA.x,screenB.y-screenA.y)/Math.max(1,length)*Math.hypot(matrix.a,matrix.b);
    for(const d of slider.dimensions(c)){
      // Less common geometry is shown only beside its existing expanded settings.
      const field=document.getElementById(d.inputId);
      if(d.key!=='rail'&&(!field?.getClientRects().length||field.closest('details:not([open])')))continue;
      let point,direction=u,key=d.key;
      if(key==='rail'){point=c.baseEnd==='p2'?a:b;direction=dir;key='rail-length';}
      else if(key==='body'){point={x:midpoint.x+u.x*d.value/2,y:midpoint.y+u.y*d.value/2};direction={x:u.x/2,y:u.y/2};}
      else if(key==='carrier')point=mountEnd;
      else if(key==='offset')point={x:mount.x+u.x*d.value-u.y*22,y:mount.y+u.y*d.value+u.x*22};
      else{const side=key==='start'?-1:1;point={x:base.x+dir.x*d.value-dir.y*side*20,y:base.y+dir.y*d.value+dir.x*side*20};direction=dir;key='travel-'+key;}
      if(['rail','body'].includes(d.key)){
        // Separate nearby dimension labels in screen space; leader lines retain the actual endpoint.
        const anchor=project(point),gap=(d.key==='rail'?70:40)/Math.max(.01,scale);
        point={x:point.x-u.y*gap,y:point.y+u.x*gap};const end=project(point),line=document.createElementNS(NS,'line');
        for(const [name,value]of Object.entries({x1:anchor.x,y1:anchor.y,x2:end.x,y2:end.y,stroke:'#81aeb8','stroke-width':1,'pointer-events':'none'}))line.setAttribute(name,value);
        svg.append(line);
      }
      handle(key,d.label,point,direction,d.value,d.set,d.inputId,d.min,d.max,d.step);
    }
  }
  if(c?.type==='gear'){
    const radius=outputRadius(c,S.topo.params),phase=Number(c.phase)||0,pose=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI-phase;
    const radiusField=document.getElementById('gearPinRadiusVal'),angleField=document.querySelector('#gearHoleAngleVal input');
    showGearGridHint(c,S.comps,S.topo.params);
    const polar=q=>gearHoleGridAtPoint(c,S.topo.params,q,{center:a,poseDeg:pose})||{radius,angle:phase};
    const reset=()=>{showNumber(radiusField,radius);if(angleField)showNumber(angleField,phase);};
    const revision=JSON.stringify([S.comps,S.topo.params,S.theta,S.designFocus]);
    dimensionHandle(svg,{key:'gear-hole',label:'輸出孔位',point:besideHole(svg,project(a),project(b)),direction:{x:1,y:0},value:0,activate:()=>{document.getElementById('gearMore').open=true;openEditor();radiusField?.focus();radiusField?.select();},cancel:reset,
      plane:{value:b,fromScreen:q=>worldFromScreen(q.x,q.y),project,constrain:q=>{const v=polar(q),t=(v.angle+pose)*Math.PI/180;return {x:a.x+v.radius*Math.cos(t),y:a.y+v.radius*Math.sin(t)};},preview:q=>{const v=polar(q);showNumber(radiusField,v.radius);if(angleField)showNumber(angleField,v.angle);},commit:q=>{if(revision===JSON.stringify([S.comps,S.topo.params,S.theta,S.designFocus])){const v=polar(q);gear.setHole(v.radius,v.angle);}else redraw();}}});
    const rack=S.comps.find(r=>r.type==='rack'&&r.pinion===c.id);
    if(rack){const p=at(rack.p1),angle=(rack.axisDeg||0)*Math.PI/180,dir={x:Math.cos(angle),y:Math.sin(angle)},L=S.topo.params[rack.lenParam];handle('rack-length','齒條孔距',{x:p.x+dir.x*L/2,y:p.y+dir.y*L/2},{x:dir.x/2,y:dir.y/2},L,v=>gear.changeRackLength(v-L),'rackLengthVal',32,2000,1);}
  }
  if(S.frameEditorOpen&&frame){
    const {nodes,geometry,info,set}=frame,outline=geometry?.outlines?.flat()||[];
    const axis=frameGroundAxis(nodes);
    if(axis.target&&axis.length>1e-6){
      const field=document.querySelector('#frameAngleVal input'),a=project(axis.base),b=project(axis.target);
      const revision=JSON.stringify([S.comps,S.topo.params,S.designFocus]);
      const reset=()=>{svg.querySelector('[data-frame-axis-preview]')?.remove();if(field)showNumber(field,axis.angle);};
      dimensionHandle(svg,{key:'frame-angle',label:'固定軸方向',point:besideHole(svg,a,b),direction:{x:0,y:0},value:axis.angle,step:1,min:-360,max:360,quantize:raw=>snapFrameAngle(axis.length,raw),   // 第二固定軸落在 8 mm 格點的角度；無解則整度
        angleCenter:a,angleAxes:{u:{x:1,y:0},v:{x:0,y:-1}},color:'#d97706',
        activate:()=>{openEditor();if(sheetMode())setSheet('half');const more=document.getElementById('nodeAdvanced');if(document.getElementById('roleEditor')?.contains(field)&&more)more.open=true;field?.focus();field?.select();},cancel:reset,
        preview:value=>{
          reset();if(field)showNumber(field,value);
          const t=value*Math.PI/180,q=project({x:axis.base.x+axis.length*Math.cos(t),y:axis.base.y+axis.length*Math.sin(t)}),line=document.createElementNS(NS,'line');
          for(const [k,v]of Object.entries({'data-frame-axis-preview':'',x1:a.x,y1:a.y,x2:q.x,y2:q.y,stroke:'#d97706','stroke-width':3,'stroke-dasharray':'5 4','pointer-events':'none'}))line.setAttribute(k,v);
          svg.append(line);
        },commit:value=>{if(revision===JSON.stringify([S.comps,S.topo.params,S.designFocus]))frame.change('angle',value-axis.angle,true);else redraw();}});
    }
    if(nodes.length&&outline.length){
      let first=nodes[0],second=first,distance=0;
      for(const p of nodes)for(const q of nodes){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d>distance){first=p;second=q;distance=d;}}
      const u=geometry.dimensions?.axis?.u || (distance?{x:(second.x-first.x)/distance,y:(second.y-first.y)/distance}:{x:0,y:1}),v={x:-u.y,y:u.x};
      const middle=dir=>{const ns=outline.map(p=>p.x*dir.x+p.y*dir.y);return (Math.min(...ns)+Math.max(...ns))/2;},x=middle(u),y=middle(v),center={x:x*u.x+y*v.x,y:x*u.y+y*v.y};
      for(const [key,label,dir]of [['lengthMm','外框長',u],['widthMm','外框寬',v]]){
        const n=info[key],grid=!!geometry.dimensions?.axis,scale=grid?1:.5,edge=2*Math.max(1,8-(info.thicknessMm || 3)/2);
        handle('frame-'+key,label,{x:center.x+dir.x*n/2,y:center.y+dir.y*n/2},{x:dir.x*scale,y:dir.y*scale},n,value=>set(key,value),'frameSize-'+key,info[key==='lengthMm'?'minLength':'minWidth']||2,2000,.1,null,1,null,grid?raw=>edge+8*Math.round((raw-edge)/8):null);
      }
    }
  }
}
