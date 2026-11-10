/** Installation rotation uses one candidate for the main-canvas handle and numeric input. */
import {S} from './state.js';
import {motorMountPatternRotDegForCenter} from './motor-mounts.js';
import {commitMountingEdit} from './mounting-review-ui.js';
import {editableNumber,showNumber} from './numeric-input.js';
import {dimensionHandle} from './dimension-handle.js';
const wrap=a=>((a+180)%360+360)%360-180;
export function motorInstallationAngle(comps,points,id,mount){
  return wrap(-180-motorMountPatternRotDegForCenter({id,pts:points,comps,mount}));
}
export function planMotorAngle(comps,points,id,mount,value){
  if(!Number.isFinite(value)||Math.abs(value)>360)return null;
  const owners=comps.filter(c=>['bar','gear','motor'].includes(c.type)&&[c.p1,c.p2].some(p=>p?.id===id&&p.physicalMotor)&&(c.type!=='bar'||c.isInput));
  if(owners.length!==1)return null;
  const owner=owners[0],old=owner.motorMount,host=old?.frameBody||owner.motorCarrier;
  const current=motorInstallationAngle(comps,points,id,mount);
  if(Math.abs(wrap(value-current))<1e-8)return {owner,changed:false};
  const explicit=!!old?.orientation,angleDeg=explicit?wrap((old.angleDeg||0)+value-current):host?wrap(value-current):wrap(value);
  return {owner,changed:true,mount:{...old,motor:String(owner.physicalMotor||owner.p1.physicalMotor||owner.p2?.physicalMotor),center:id,...(owner.type!=='motor'?{outputBody:owner.id}:{}),
    ...(host?{frameBody:host}:{}),orientation:old?.orientation||(host?'follow-frame':'horizontal'),reversed:explicit?!!old.reversed:false,
    angleDeg,order:host?['motor','frameBody','outputBody']:['motor','outputBody']}};
}
export function drawMotorAngle({svg,points,project,mounts,redraw,openEditor,pause,pushUndo,rebuild,notify}){
  let row=document.getElementById('motorInstallationAngle');
  if(row)row.hidden=true;
  const id=S.selectedNodeId,mount=mounts?.get(id),center=points[id];
  if(!mount||!center||!planMotorAngle(S.comps,points,id,mount,0))return;
  if(!row){row=document.createElement('label');row.id='motorInstallationAngle';row.innerHTML='安裝方向（°） <span></span>';document.getElementById('nodeAdvanced').before(row);}
  row.hidden=false;
  const value=motorInstallationAngle(S.comps,points,id,mount),revision=JSON.stringify([S.comps,S.topo.params,S.designFocus,S.theta]);
  const field=()=>row.querySelector('input'),reset=()=>showNumber(field(),value);
  const commit=v=>{
    if(revision!==JSON.stringify([S.comps,S.topo.params,S.designFocus,S.theta])){redraw();return;}
    const plan=planMotorAngle(S.comps,points,id,mount,v);if(!plan?.changed){reset();return;}
    pause();if(commitMountingEdit(S,d=>{d.comps.find(c=>c.id===plan.owner.id).motorMount=plan.mount;},{pushUndo,notify})){rebuild();redraw();}else reset();
  };
  editableNumber(row.querySelector('span'),value,commit,{label:'馬達安裝方向（°）',min:-360,max:360});
  const p=project(center),m=svg.getScreenCTM(),px=1/Math.hypot(m.a,m.b),box=svg.getBoundingClientRect(),screen=new DOMPoint(p.x,p.y).matrixTransform(m);
  const dx=screen.x+90>box.right?-60:60,dy=screen.y-90<box.top?60:-60;
  dimensionHandle(svg,{key:'motor-angle',label:'安裝方向',point:{x:p.x+dx*px,y:p.y+dy*px},direction:{x:0,y:0},value,step:1,min:-360,max:360,
    angleCenter:p,angleAxes:{u:{x:1,y:0},v:{x:0,y:-1}},activate:()=>{openEditor();field().focus();field().select();},preview:v=>showNumber(field(),v),cancel:reset,commit,color:'#d97706'});
}

export function editMotorPreset(nodeId,patch,{pushUndo,rebuild,draw,updateRoleEditor}) {
    const bar=S.comps.find(c=>c.type==='bar'&&c.isInput&&[c.p1,c.p2].some(p=>p?.id===nodeId&&p.physicalMotor));if(!bar)return;
    if(!commitMountingEdit(S,d=>{d.comps.find(c=>c.id===bar.id).motorMount={
      motor:String(bar.physicalMotor||'1'),center:nodeId,outputBody:bar.id,
      ...(bar.motorCarrier?{frameBody:bar.motorCarrier}:{}),orientation:bar.motorCarrier?'follow-frame':'horizontal',
      order:bar.motorCarrier?['motor','frameBody','outputBody']:['motor','outputBody'],...bar.motorMount,...patch};
    },{pushUndo}))return;
    rebuild();draw();updateRoleEditor();
  }
