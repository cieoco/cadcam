/** Selected dimensions use existing setters; the moving handle is a draft until release. */
import {S} from './state.js';
import {dimensionHandle} from './dimension-handle.js';
import {memberDimensions,memberDimensionValue,dimensionLock} from './member-dimensions.js';
import {memberStock} from './member-stock.js';
import {showNumber} from './numeric-input.js';
export function drawEditingHandles({svg,points,project,member,slider,gear,frame}){
  if(S.mode!=='design'||S.mateMode)return;
  const c=S.comps.find(c=>c.id===(S.selectedTriangleId||S.selectedLinkId||S.selectedSliderId||S.selectedGearId));
  const at=p=>points[p?.id]||p;
  function handle(key,label,point,direction,value,commit,inputId,min=0,max=2000,step=.1){
    if(!point||!direction||!Number.isFinite(value))return;
    const a=project(point),b=project({x:point.x+direction.x,y:point.y+direction.y}),input=document.getElementById(inputId),field=input?.matches('input')?input:input?.querySelector('input');
    dimensionHandle(svg,{key,label,point:a,direction:{x:b.x-a.x,y:b.y-a.y},value,min,max,step,preview:v=>{if(field)showNumber(field,v);},cancel:()=>{if(field)showNumber(field,value);},commit});
  }
  const a=at(c?.p1),b=at(c?.p2),length=a&&b?Math.hypot(b.x-a.x,b.y-a.y):0,u=length?{x:(b.x-a.x)/length,y:(b.y-a.y)/length}:{x:1,y:0};
  if(c&&['bar','triangle'].includes(c.type)&&!c.boxPanel){
    const id=S.selectedTriangleId?S.triSide||'g':'g',dim=memberDimensions(c).find(d=>d.id===id),lock=dimensionLock(c,S.comps,id);
    if(dim?.refs&&id!=='tip'&&!lock){const p=at(c[dim.refs[0]]),q=at(c[dim.refs[1]]);if(p&&q){const L=Math.hypot(q.x-p.x,q.y-p.y)||1,dir={x:(q.x-p.x)/L,y:(q.y-p.y)/L},screenA=project(p),screenB=project(q),scale=Math.hypot(screenB.x-screenA.x,screenB.y-screenA.y)/L,offset=28/Math.max(.01,scale*Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b));handle('member-length',dim.label,{x:q.x-dir.y*offset,y:q.y+dir.x*offset},dir,memberDimensionValue(c,S.topo.params,id),v=>member.setValue(v),'memberDimensionInput',8,2000);}}
    if(c.shape==='disk')handle('disk-diameter','外徑',{x:a.x,y:a.y+c.diameterMm/2},{x:0,y:.5},c.diameterMm,v=>{const input=document.getElementById('diskDiameterInput');input.value=v;input.onchange();},'diskDiameterInput',8,2000);
    else if(!c.barFusionRoot&&document.getElementById('memberMore')?.open){const w=memberStock(c).widthMm;handle('member-width','板寬',{x:(a.x+b.x)/2-u.y*w/2,y:(a.y+b.y)/2+u.x*w/2},{x:-u.y/2,y:u.x/2},w,v=>member.setStock('widthMm',v),'memberWidthInput',2,120);}
  }
  if(c?.type==='slider'){
    const base=c.baseEnd==='p2'?b:a,dir=c.baseEnd==='p2'?{x:-u.x,y:-u.y}:u;
    handle('rail-length','軌長',b,u,slider.railLength(c),slider.setRailLength,'sliderLengthInput',1,slider.sliderCarrierLength(c)-slider.sliderRailOffset(c),1);
    for(const [key,label,fn,set,side] of [['start','起點','sliderTravelStart','changeSliderTravelStart',-1],['end','終點','sliderTravelEnd','changeSliderTravelEnd',1]]){const v=slider[fn](c);handle('travel-'+key,label,{x:base.x+dir.x*v-dir.y*side*20,y:base.y+dir.y*v+dir.x*side*20},dir,v,n=>slider[set](n-v),'slider'+(key==='start'?'Start':'End')+'Val',key==='end'?slider.sliderTravelStart(c):0,key==='start'?slider.sliderTravelEnd(c):slider.railLength(c),1);}
  }
  if(c?.type==='gear'){
    const rack=S.comps.find(r=>r.type==='rack'&&r.pinion===c.id);
    if(rack){const p=at(rack.p1),angle=(rack.axisDeg||0)*Math.PI/180,dir={x:Math.cos(angle),y:Math.sin(angle)},L=S.topo.params[rack.lenParam];handle('rack-length','齒條孔距',{x:p.x+dir.x*L/2,y:p.y+dir.y*L/2},{x:dir.x/2,y:dir.y/2},L,v=>gear.changeRackLength(v-L),'rackLengthVal',32,2000,1);}
  }
  if(S.frameEditorOpen&&frame){
    const {nodes,geometry,info,set}=frame,outline=geometry?.outlines?.flat()||[];
    if(nodes.length&&outline.length){
      let first=nodes[0],second=first,distance=0;
      for(const p of nodes)for(const q of nodes){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d>distance){first=p;second=q;distance=d;}}
      const u=distance?{x:(second.x-first.x)/distance,y:(second.y-first.y)/distance}:{x:0,y:1},v={x:-u.y,y:u.x};
      const middle=dir=>{const ns=outline.map(p=>p.x*dir.x+p.y*dir.y);return (Math.min(...ns)+Math.max(...ns))/2;},x=middle(u),y=middle(v),center={x:x*u.x+y*v.x,y:x*u.y+y*v.y};
      for(const [key,label,dir]of [['lengthMm','外框長',u],['widthMm','外框寬',v]]){const n=info[key];handle('frame-'+key,label,{x:center.x+dir.x*n/2,y:center.y+dir.y*n/2},{x:dir.x/2,y:dir.y/2},n,value=>set(key,value),'frameSize-'+key,info[key==='lengthMm'?'minLength':'minWidth']||2,2000);}
    }
  }
}
