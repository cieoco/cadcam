import {S} from './state.js';
import * as Model from './model.js';
import * as Panels from './panels.js';
import * as View from './view.js';
import * as Tools from './tools.js';
import {frameGroundAxis} from './frame-ground.js';
import {frameHoleAt,frameHoleAxis,syncFrameHoles} from './frame-holes.js';
import {planFrameHole} from './frame-hole-plan.js';
import {inspectFrameExport} from './exporters.js';
import {commitMountingEdit} from './mounting-review-ui.js';
import {inside} from './part-fusion.js';
import {editableNumber,showNumber} from './numeric-input.js';
import {dimensionHandle} from './dimension-handle.js';
import {sheetMode,setSheet} from './mobile-workspace.js';

const NS='http://www.w3.org/2000/svg';
const revision=()=>JSON.stringify([S.comps,S.topo.params,S.designFocus,S.mode,S.viewPlane]);
let placement=null;
function contextGeometry(ctx){return inspectFrameExport(Model.frameConnectorNodes(ctx.viewComps()),ctx.settings,ctx.mounts());}
function plan(ctx,hole,value){return planFrameHole(ctx.viewComps(),hole,value,contextGeometry(ctx),Number(ctx.settings.frameHoleDiameterMm)||3.2);}
function select(ctx,id){ctx.deselectLink();S.selectedNodeId=id;S.frameEditorOpen=false;Panels.updateRoleEditor();ctx.openMobileEditPanel();ctx.draw();}
function finish(ctx){ctx.rebuild();ctx.draw();Panels.updateRoleEditor();ctx.scheduleAutosave();}

export function setFrameHole(ctx,id,value){
  const hole=frameHoleAt(S.comps,id);if(!hole||Number(value)===hole.frameHole.u)return;
  const next=plan(ctx,hole,value);if(!next.ok){ctx.transient(next.reason);renderFrameHoleEditor();return;}
  ctx.pause();
  if(commitMountingEdit(S,d=>{d.comps.find(c=>c.id===hole.id).frameHole.u=next.u;syncFrameHoles(d.comps);},{pushUndo:ctx.pushUndo,notify:ctx.transient}))finish(ctx);
  else renderFrameHoleEditor();
}
export function removeFrameHole(ctx,id){
  const hole=frameHoleAt(S.comps,id);if(!hole)return;
  if(Model.pointRefs(S.comps,id).some(r=>r.comp!==hole)){ctx.transient('此孔已接連桿，請先分離或刪除相接的連桿。');return;}
  if(commitMountingEdit(S,d=>{d.comps=d.comps.filter(c=>c.id!==hole.id);},{pushUndo:ctx.pushUndo,notify:ctx.transient})){
    S.selectedNodeId=null;S.frameEditorOpen=true;finish(ctx);
  }
}
export function renderFrameHoleEditor(){
  const hole=frameHoleAt(S.comps,S.selectedNodeId),panel=document.getElementById('roleEditor');if(!hole||!panel)return;
  let row=panel.querySelector('[data-frame-hole-editor]');
  if(!row){row=document.createElement('div');row.dataset.frameHoleEditor='';panel.append(row);}
  panel.dataset.selectionSummary=`機架孔：距基準孔 ${Number(hole.frameHole.u.toFixed(2))} mm`;
  row.replaceChildren();
  const label=document.createElement('label'),value=document.createElement('span');label.textContent='機架孔 · 距基準孔 ';label.append(value,document.createTextNode(' mm'));row.append(label);
  editableNumber(value,hole.frameHole.u,v=>window.blocks.setFrameHole(hole.p1.id,v),{label:'機架孔距基準孔（mm）',min:-2000,max:2000});
  const hint=document.createElement('p');hint.textContent='沿機架中心線移動；可從這個孔畫連桿。';row.append(hint);
  if(Model.pointRefs(S.comps,hole.p1.id).length>1){const split=document.createElement('button');split.textContent='分離連接';split.onclick=()=>window.blocks.splitNode();row.append(split);}
  const remove=document.createElement('button');remove.textContent='刪除孔';remove.onclick=()=>window.blocks.removeFrameHole(hole.p1.id);row.append(remove);
}
export function drawFrameHoleHandle({svg,project,openEditor,redraw}){
  if(placement&&placement.revision!==revision())placement.cancel();
  const hole=frameHoleAt(S.comps,S.selectedNodeId);if(!hole)return false;
  const axis=frameHoleAxis(S.comps,hole);if(!axis)return false;
  const a=project(axis.a),p=project(hole.p1),q=project({x:hole.p1.x+axis.u.x,y:hole.p1.y+axis.u.y});
  const line=document.createElementNS(NS,'line');
  for(const [key,value]of Object.entries({x1:a.x,y1:a.y,x2:p.x,y2:p.y,stroke:'#087f8c','stroke-dasharray':'4 4','pointer-events':'none'}))line.setAttribute(key,value);
  svg.append(line);
  const field=()=>document.querySelector('[aria-label="機架孔距基準孔（mm）"]'),rev=revision(),reset=()=>{if(field())showNumber(field(),hole.frameHole.u);line.setAttribute('x2',p.x);line.setAttribute('y2',p.y);};
  dimensionHandle(svg,{key:'frame-hole',label:'距基準孔',point:p,direction:{x:q.x-p.x,y:q.y-p.y},value:hole.frameHole.u,min:-2000,max:2000,step:1,
    activate:()=>{openEditor();if(sheetMode())setSheet('half');field()?.focus();field()?.select();},cancel:reset,
    preview:v=>{if(field())showNumber(field(),v);const next=project({x:axis.a.x+axis.u.x*v,y:axis.a.y+axis.u.y*v});line.setAttribute('x2',next.x);line.setAttribute('y2',next.y);},
    commit:v=>{if(rev===revision())window.blocks.setFrameHole(hole.p1.id,v);else redraw();}});
  return true;
}

export function startFrameHole(ctx){
  if(placement){placement.cancel();return;}
  if(S.mode!=='design'||S.viewPlane){ctx.transient('請回到機架的平面設計，再新增孔。');return;}
  const comps=ctx.viewComps(),axis=frameGroundAxis(Model.frameNodes(comps));
  const visible=new Set(Model.frameConnectorNodes(comps).map(p=>p.id));
  if(!axis.target||axis.length<1e-6||![axis.base.id,axis.target.id].every(id=>visible.has(id))){ctx.transient('請先建立有兩個固定基準孔的機架。');return;}
  ctx.pause();Tools.exitDrawLink();Tools.exitDrawTriangle();Tools.exitDrawPolygon();S.placingMotor=false;
  const n=S.counter+1,hole={type:'anchor',id:`FrameHole${n}`,p1:{id:`FH${n}`,type:'fixed',x:0,y:0},frameHole:{a:axis.base.id,b:axis.target.id,u:0}};
  const moduleId=comps.find(c=>Model.pointRefs([c],axis.base.id).length)?.moduleId;if(moduleId)hole.moduleId=moduleId;
  const svg=ctx.svg,button=document.getElementById('addFrameHoleBtn'),rev=revision(),geometry=contextGeometry(ctx),diameter=Number(ctx.settings.frameHoleDiameterMm)||3.2;
  const marker=document.createElementNS(NS,'circle');marker.dataset.frameHolePreview='';marker.setAttribute('fill','white');marker.setAttribute('stroke-width','2');marker.style.pointerEvents='none';
  let down=null,next=null;
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const cancel=()=>{placement=null;svg.removeEventListener('pointerdown',onDown,true);svg.removeEventListener('pointermove',move,true);svg.removeEventListener('pointerup',up,true);svg.removeEventListener('pointercancel',abort,true);document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside,true);marker.remove();if(down!==null)try{svg.releasePointerCapture(down);}catch{}svg.style.cursor='';if(button)button.textContent='新增孔';ctx.clearBanner();};
  const preview=e=>{
    if(rev!==revision()){cancel();return;}
    const w=View.worldFromEvent(svg,e);if(!w)return;
    const direction={x:(axis.target.x-axis.base.x)/axis.length,y:(axis.target.y-axis.base.y)/axis.length};
    const value=Math.round((w.x-axis.base.x)*direction.x+(w.y-axis.base.y)*direction.y);
    next=geometry?.outlines.some(r=>inside(w,r))?planFrameHole(comps,hole,value,geometry,diameter):{ok:false,reason:'請點機架板面放孔。'};
    const p=next.point||{x:axis.base.x+direction.x*value,y:axis.base.y+direction.y*value};
    marker.setAttribute('cx',View.TX(p.x));marker.setAttribute('cy',View.TY(p.y));marker.setAttribute('r',6/Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b));marker.setAttribute('stroke',next.ok?'#087f8c':'#dc2626');svg.append(marker);
  };
  const onDown=e=>{if(e.button>0)return;stop(e);if(down){cancel();return;}down=e.pointerId;try{svg.setPointerCapture(down);}catch{}preview(e);};
  const move=e=>{stop(e);preview(e);};
  const up=e=>{
    if(down!==e.pointerId)return;e.preventDefault();down=null;preview(e);if(!placement)return;
    if(!next?.ok){ctx.transient(next?.reason||'請點機架上的位置。');return;}
    Object.assign(hole.p1,next.point);hole.frameHole.u=next.u;
    cancel();
    if(commitMountingEdit(S,d=>{d.comps.push(hole);},{pushUndo:ctx.pushUndo,notify:ctx.transient})){
      S.counter=n;ctx.rebuild();select(ctx,hole.p1.id);ctx.scheduleAutosave();
    }
  };
  const abort=e=>{e.preventDefault();cancel();},key=e=>{if(e.key==='Escape'){stop(e);cancel();}},outside=e=>{if((down!==null&&e.pointerId!==down)||(!svg.contains(e.target)&&e.target!==button))cancel();};
  placement={revision:rev,cancel};if(button)button.textContent='取消新增';svg.style.cursor='crosshair';ctx.setBanner('點機架放孔；沿中心線吸附。按取消新增或 Esc 返回。');
  svg.addEventListener('pointerdown',onDown,true);svg.addEventListener('pointermove',move,true);svg.addEventListener('pointerup',up,true);svg.addEventListener('pointercancel',abort,true);document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside,true);
}
