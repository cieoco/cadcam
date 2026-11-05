/** Selected dimensions use existing setters; the moving handle is a draft until release. */
import {S} from './state.js';
import {dimensionHandle} from './dimension-handle.js';
import {memberDimensions,memberDimensionValue,dimensionLock} from './member-dimensions.js';
import {memberStock} from './member-stock.js';
import {showNumber} from './numeric-input.js';
import {pointDimensionEditor} from './point-dimension-editor.js';
const NS='http://www.w3.org/2000/svg';
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
export function drawEditingHandles({svg,points,project,member,slider,gear,frame,redraw,openEditor,comps=S.comps}){
  if(S.mode!=='design'||S.mateMode)return;
  const c=S.comps.find(c=>c.id===(S.selectedTriangleId||S.selectedLinkId||S.selectedSliderId||S.selectedGearId));
  const at=p=>points[p?.id]||p;
  const pointEdit=pointDimensionEditor({member,redraw,comps,openEditor});
  drawPointChoices(svg,pointEdit,comps,at,project);
  if(pointEdit?.dimension&&!pointEdit.dimension.lock){
    const {comp,dimension,value,input,commit,activate}=pointEdit;
    const p=at(comp[dimension.refs[0]]),q=at(comp[dimension.refs[1]]);
    if(p&&q){
      const a=project(p),b=project(q),length=Math.hypot(q.x-p.x,q.y-p.y)||1;
      dimensionHandle(svg,{key:'point-dimension',label:dimension.label,point:b,direction:{x:(b.x-a.x)/length,y:(b.y-a.y)/length},value,min:8,max:2000,
        preview:v=>showNumber(input,v),cancel:()=>showNumber(input,value),commit,activate});
    }
  }
  function handle(key,label,point,direction,value,commit,inputId,min=0,max=2000,step=.1){
    if(!point||!direction||!Number.isFinite(value))return;
    const a=project(point),b=project({x:point.x+direction.x,y:point.y+direction.y}),input=document.getElementById(inputId),field=input?.matches('input')?input:input?.querySelector('input');
    dimensionHandle(svg,{key,label,point:a,direction:{x:b.x-a.x,y:b.y-a.y},value,min,max,step,preview:v=>{if(field)showNumber(field,v);},cancel:()=>{if(field)showNumber(field,value);},commit,activate:()=>{openEditor();field?.focus();field?.select();}});
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
