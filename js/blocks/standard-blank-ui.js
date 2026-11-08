/** One live creation candidate for canvas dimensions and exact fields. */
import {makeStandardBlank} from './standard-blank.js';
import {dimensionHandle} from './dimension-handle.js';
import * as View from './view.js';
import {sheetMode,setSheet} from './mobile-workspace.js';

export function openStandardBlank(kind,{start,update,confirm,cancel}){
 let panel=document.getElementById('standardBlankPanel');
 if(!panel){panel=document.createElement('section');panel.id='standardBlankPanel';document.querySelector('.creation-sections').before(panel);}
 panel.replaceChildren();panel.hidden=false;
 const title=document.createElement('strong');title.textContent=kind==='bar'?'桿件':kind==='plate'?'板材':'L型件（同平面）';panel.append(title);
 const fields={},exact={};
 const row=(parent,map,key,text,value,min=2)=>{
  const label=document.createElement('label'),input=document.createElement('input');label.textContent=text;input.type='number';input.value=value;input.setAttribute('aria-label',text);
  if(map===fields){input.min=min;input.max=128;input.step=1;input.dataset.blankField=key;}else{input.step='any';input.dataset.blankMm=key;}
  label.append(input);map[key]=input;parent.append(label);
 };
 row(panel,fields,'columns',kind==='l'?'橫臂孔數':'長向孔數',kind==='bar'?8:6);
 if(kind!=='bar')row(panel,fields,'rows',kind==='l'?'直臂孔數':'寬向孔數',4);
 if(kind==='l')row(panel,fields,'armRows','臂寬孔列數',1,1);
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='特殊毫米尺寸／自由繪圖';details.append(summary);panel.append(details);
 for(const[key,text,value]of[['originX','位置 X mm',0],['originY','位置 Y mm',0],['lengthMm','長向孔距 mm',kind==='bar'?56:40],...(kind!=='bar'?[['heightMm','直向孔距 mm',24]]:[]),...(kind==='l'?[['armWidthMm','臂寬 mm',13]]:[])])row(details,exact,key,text,value);
 const note=document.createElement('p');note.textContent='拖畫布候選放位置，拖長／寬／臂寬把手改孔數；確認才新增。孔距8 mm・板厚3 mm・最多128孔。';details.append(note);
 const free=document.createElement('button');free.type='button';free.className='tool-btn';free.textContent='自訂孔位／外形：沿用自由繪圖';free.onclick=()=>{cancel();window.blocks.startDrawPolygon();};details.append(free);
 const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
 const actions=document.createElement('footer');panel.append(actions);
 const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.className='tool-btn';b.textContent=text;b.onclick=click;actions.append(b);return b;};
 const add=button('確認新增',()=>{if(!add.disabled)confirm();});add.dataset.blankPlace='';add.classList.add('primary');
 button('取消',cancel);
 if(sheetMode())button('看畫布',()=>setSheet('collapsed'));
 const options=()=>({kind,...Object.fromEntries(Object.entries(exact).filter(([k])=>!k.startsWith('origin')).map(([k,n])=>[k,Number(n.value)])),origin:{x:Number(exact.originX.value),y:Number(exact.originY.value)}});
 const show=opts=>{
  for(const[k,n]of Object.entries(exact))if(document.activeElement!==n)n.value=k==='originX'?opts.origin.x:k==='originY'?opts.origin.y:opts[k];
  const r=makeStandardBlank(opts);
  if(r.ok){const c=r.comp,holes=[{u:0,v:0},{u:opts.lengthMm,v:0},...(kind==='bar'?[]:[{u:0,v:opts.heightMm}]),...c.holes];fields.columns.value=new Set(holes.map(h=>h.u)).size;if(fields.rows)fields.rows.value=new Set(holes.map(h=>h.v)).size;if(fields.armRows)fields.armRows.value=Math.floor((opts.armWidthMm-13)/8)+1;}
  add.disabled=!r.ok;status.textContent=r.ok?`候選實際${r.holeCount}孔；外形${opts.lengthMm+13} × ${kind==='bar'?13:opts.heightMm+13} × 3 mm`:r.message;
 };
 const fromFields=key=>{const valid=Object.values(fields).every(n=>Number.isInteger(Number(n.value))&&Number(n.value)>=Number(n.min)&&Number(n.value)<=Number(n.max));if(!valid){add.disabled=true;status.textContent='孔數請填範圍內整數。';return;}if(key==='columns')exact.lengthMm.value=(Number(fields.columns.value)-1)*8;if(key==='rows')exact.heightMm.value=(Number(fields.rows.value)-1)*8;if(key==='armRows')exact.armWidthMm.value=(Number(fields.armRows.value)-1)*8+13;const opts=options();show(opts);update(opts);};
 Object.entries(fields).forEach(([key,n])=>n.oninput=()=>fromFields(key));
 Object.values(exact).forEach(n=>n.oninput=()=>{const opts=options();show(opts);update(opts);});
 const escape=e=>{if(e.key==='Escape'){e.preventDefault();cancel();}};
 const closed=()=>{panel.hidden=true;document.removeEventListener('keydown',escape);};
 const draw=({svg,draft,update:change})=>{
  const s=View.getScale(),a=draft.origin,L=draft.lengthMm,H=draft.heightMm;
  const handle=(key,label,field,p,direction,value,min,max,quantize,snap=8,offset=13,right=0)=>dimensionHandle(svg,{key:'blank-create-'+key,label,offset,right,point:{x:View.TX(p.x),y:View.TY(p.y)},direction,value,min,max,snap,quantize,step:snap,
   activate:()=>{if(sheetMode())setSheet('half');fields[field==='lengthMm'?'columns':field==='heightMm'?'rows':'armRows'].focus();},
   preview:v=>change({[field]:v}),cancel:()=>change({[field]:value}),commit:v=>change({[field]:v})});
  const matrix=svg.getScreenCTM(),gap=32/(Math.hypot(matrix.a,matrix.b)*s);
  const nm=kind==='l'?['橫臂','直臂']:['長','寬'],tag=' · 外形';
  handle('length',`${nm[0]} ${fields.columns.value}孔${tag}`,'lengthMm',{x:a.x+L+gap,y:a.y+(kind==='bar'?0:H*.5)},{x:s,y:0},L,8,1000,undefined,8,13,1);
  if(kind!=='bar')handle('height',`${nm[1]} ${fields.rows.value}孔${tag}`,'heightMm',{x:a.x+(kind==='l'?0:L*.5),y:a.y+H+gap},{x:0,y:-s},H,8,1000,undefined,8,13);
  if(kind==='l')handle('arm',`臂寬 ${fields.armRows.value}孔列${tag}`,'armWidthMm',{x:a.x+L*.5,y:a.y+draft.armWidthMm-6.5},{x:0,y:-s},draft.armWidthMm,13,13+8*(Math.ceil(Math.min(L,H)/8)-1),raw=>13+8*Math.round((raw-13)/8),8,0);
 };
 if(sheetMode())setSheet('half');
 start(options(),{changed:show,closed,draw});panel.hidden=false;document.addEventListener('keydown',escape);show(options());
}
